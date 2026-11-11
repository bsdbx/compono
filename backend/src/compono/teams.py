"""Teams, their members and invite links."""

from datetime import UTC, datetime
from typing import NamedTuple
from uuid import UUID

from sqlalchemy import delete, orm, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.exc import IntegrityError

from compono.models import (
    RESERVED_TEAM_NAMES,
    Account,
    Team,
    TeamMember,
    TeamRole,
    invite_link_expiry,
    new_invite_token,
)


class UrlTaken(Exception):
    """Another team has this URL, or URL is reserved."""


class NotAMember(Exception):
    """The account isn't in the team."""


class OwnerCannotBeRemoved(Exception):
    """Owners leave by themselves. Nobody else removes them."""


class LastOwner(Exception):
    """The team's only owner can't leave it."""


class InviteLinkNotValid(Exception):
    """No team has this invite link, or it has expired."""


class Membership(NamedTuple):
    """A team, with an account's role in it."""

    team: Team
    role: TeamRole


def teams_of(database: orm.Session, account: Account) -> list[tuple[Team, TeamRole]]:
    """The account's teams."""
    # Select the rows of team and role for a supplied account
    # Sort by the date joined and the name
    rows = database.execute(
        select(Team, TeamMember.role)
        .join(TeamMember, TeamMember.team_id == Team.id)
        .where(TeamMember.account_id == account.id)
        .order_by(TeamMember.joined_at, Team.name)
    )

    # Unpack and return as a list
    return [(team, role) for team, role in rows]


def create_team(database: orm.Session, account: Account, name: str, url: str) -> Team:
    """A new team, with the account as its owner. Raises UrlTaken."""

    # If the URL is in the reserved list
    if url in RESERVED_TEAM_NAMES:
        raise UrlTaken

    # Create a Team, and check if it's URL is not taken
    team = Team(name=name, url=url)
    try:
        # A savepoint, so that the transaction goes on after a taken URL
        with database.begin_nested():
            database.add(team)
    except IntegrityError as error:
        # Also when another team got the URL first. Race condition.
        if "uq_teams_url" in str(error.orig):
            raise UrlTaken from error

        raise

    # Add a member to the created team
    database.add(
        TeamMember(team_id=team.id, account_id=account.id, role=TeamRole.OWNER)
    )

    database.flush()
    return team


def membership(database: orm.Session, url: str, account: Account) -> Membership | None:
    """The team at this URL with the account's role in it. None if there's no such team, or the account isn't in it."""
    # Select the Team and Member role as one row, matching the supplied arguments.
    # There must only one account in one Team
    row = database.execute(
        select(Team, TeamMember.role)
        .join(TeamMember, TeamMember.team_id == Team.id)
        .where(Team.url == url, TeamMember.account_id == account.id)
    ).one_or_none()

    # If there is no such team, or the account isn't in it
    if row is None:
        return None

    team, role = row
    return Membership(team, role)


def update_team(
    database: orm.Session, team: Team, name: str | None, url: str | None
) -> None:
    """Changes what's given of the team's name and URL. Raises UrlTaken."""
    # If the URL is in the reserved list
    if url in RESERVED_TEAM_NAMES:
        raise UrlTaken

    try:
        # A savepoint, so that the team keeps its URL when the new one is taken
        with database.begin_nested():
            # Change the name and the URL only if not None
            if name is not None:
                team.name = name

            if url is not None:
                team.url = url
    except IntegrityError as error:
        if "uq_teams_url" in str(error.orig):
            raise UrlTaken from error

        raise


def delete_team(database: orm.Session, team: Team) -> None:
    """Deletes the team, and with it its memberships, projects and components."""
    database.delete(team)
    database.flush()


def members_of(database: orm.Session, team: Team) -> list[tuple[Account, TeamRole]]:
    """The team's members with their roles, in the order they joined."""
    rows = database.execute(
        select(Account, TeamMember.role)
        .join(TeamMember, TeamMember.account_id == Account.id)
        .where(TeamMember.team_id == team.id)
        .order_by(TeamMember.joined_at, Account.name)
    )

    return [(account, role) for account, role in rows]


def _member(
    database: orm.Session, team: Team, account_id: UUID
) -> tuple[Account, TeamMember]:
    """A member of the team, with their membership locked until the transaction ends. Raises NotAMember."""
    row = database.execute(
        select(Account, TeamMember)
        .join(TeamMember, TeamMember.account_id == Account.id)
        .where(TeamMember.team_id == team.id, TeamMember.account_id == account_id)
        # If there are two requests A and B:
        #   A: calls `_member()` to promote Alice to Owner.
        #   B: calls `_member()` to delete Alice from the team.
        # This makes B wait until A commits or rolls back, so there is not race condition.
        .with_for_update(of=TeamMember)
        # Force SQLAlchemy to update the cache
        .execution_options(populate_existing=True)
    ).one_or_none()

    # If there team doesn't have a member with supplied account
    if row is None:
        raise NotAMember

    account, member = row
    return account, member


def make_owner(database: orm.Session, team: Team, account_id: UUID) -> Account:
    """Makes a member an owner. Returns their account. Raises NotAMember."""

    # Get an account and a member
    account, member = _member(database, team, account_id)
    # Set member role to owner
    member.role = TeamRole.OWNER

    database.flush()
    return account


def remove_member(database: orm.Session, team: Team, account_id: UUID) -> None:
    """Takes a member out of the team and its projects. Raises NotAMember and OwnerCannotBeRemoved."""
    # Get a member
    _, member = _member(database, team, account_id)

    # If member role is owner - it cannot be removed
    if member.role == TeamRole.OWNER:
        raise OwnerCannotBeRemoved

    database.delete(member)
    database.flush()


def leave(database: orm.Session, team: Team, account: Account) -> None:
    """Takes the account out of the team and its projects. Raises LastOwner."""

    # Find all of the owners in the DB.
    # Block any new requests that want first request rows, until the first request finishes, so two owners cannot leave at the same time.
    owners = database.scalars(
        select(TeamMember)
        .where(TeamMember.team_id == team.id, TeamMember.role == TeamRole.OWNER)
        .with_for_update()
        .execution_options(populate_existing=True)
    ).all()

    # If the supplied account is an owner
    is_owner = any(owner.account_id == account.id for owner in owners)

    # If the supplied account is an only owner, we disallow leaving
    if is_owner and len(owners) == 1:
        raise LastOwner

    # Delete the member from the team
    database.execute(
        delete(TeamMember).where(
            TeamMember.team_id == team.id, TeamMember.account_id == account.id
        )
    )


def invite_link(database: orm.Session, team: Team) -> tuple[str, datetime]:
    """The team's invite token and when it expires. A new one if the last one has expired."""
    # Locks the team until the transaction ends, so that two owners opening it at once get the same new link
    database.refresh(team, with_for_update=True)

    if team.invite_expires_at <= datetime.now(UTC):
        team.invite_token = new_invite_token()
        team.invite_expires_at = invite_link_expiry()
        database.flush()

    return team.invite_token, team.invite_expires_at


def team_of_invite(database: orm.Session, token: str) -> Team:
    """The team that the invite token joins. Raises InviteLinkNotValid."""
    # Find the team by supplied token
    team = database.scalar(select(Team).where(Team.invite_token == token))
    # If there is no such team, or the invite token is expired - raise
    if team is None or team.invite_expires_at <= datetime.now(UTC):
        raise InviteLinkNotValid

    return team


def join(database: orm.Session, token: str, account: Account) -> Membership:
    """Adds the account to the invite token's team as a member. Raises InviteLinkNotValid."""
    team = team_of_invite(database, token)
    # Does nothing if the account is in the team already, also when it joins twice at once
    database.execute(
        insert(TeamMember)
        .values(team_id=team.id, account_id=account.id, role=TeamRole.MEMBER)
        .on_conflict_do_nothing()
    )
    found = membership(database, team.url, account)
    # Sanity check for mypy, since membership returns Membership | None, and the function returns Membership
    assert found is not None
    return found
