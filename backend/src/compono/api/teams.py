"""Teams, their members and invite links."""

from datetime import datetime
from typing import Annotated, Final, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, StringConstraints

from compono import models, teams
from compono.api.dependencies import Database, NotSignedInError, SignedIn
from compono.models import TeamRole
from compono.permissions import TeamAction, can

router = APIRouter()

# Stripped team name length is between 1 and 100
TeamName = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)
]

# Team URL length is between 3 and 39 and matches the pattern, e.g: my-awesome-team-1
TeamUrl = Annotated[
    str,
    StringConstraints(min_length=3, max_length=39, pattern=r"^[a-z0-9]+(-[a-z0-9]+)*$"),
]


class Team(BaseModel):
    """Team response model."""

    id: UUID
    name: str
    url: str
    role: TeamRole


def team_of(team: models.Team, role: TeamRole) -> Team:
    """Returns the team response object from the supplied team."""
    return Team(id=team.id, name=team.name, url=team.url, role=role)


class TeamNotFoundError(BaseModel):
    detail: Literal["team_not_found"]


class OwnersOnlyError(BaseModel):
    detail: Literal["owners_only"]


class UrlTakenError(BaseModel):
    detail: Literal["url_taken"]


def answers(*errors: tuple[int, type[BaseModel]]) -> dict[int | str, dict[str, object]]:
    """Helper for building FastAPI `responses` dict."""
    return {code: {"model": model} for code, model in errors}


# Responses as tuples of status code and error
NOT_SIGNED_IN: Final = (status.HTTP_401_UNAUTHORIZED, NotSignedInError)
NOT_IN_TEAM: Final = (status.HTTP_404_NOT_FOUND, TeamNotFoundError)
OWNERS_ONLY: Final = (status.HTTP_403_FORBIDDEN, OwnersOnlyError)
URL_TAKEN: Final = (status.HTTP_409_CONFLICT, UrlTakenError)


def membership(
    team_url: str,
    account: SignedIn,
    database: Database,
) -> teams.Membership:
    """The signed-in account's team at the URL, with its role in it."""
    found = teams.membership(database, team_url, account)
    if found is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "team_not_found")

    return found


type InTeam = Annotated[teams.Membership, Depends(membership)]


def require(membership: teams.Membership, action: TeamAction) -> None:
    """Answers 403 if the account's role may not do the action."""
    if not can(membership.role, action):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "owners_only")


@router.get("/api/teams", responses=answers(NOT_SIGNED_IN))
def my_teams(database: Database, account: SignedIn) -> list[Team]:
    """The signed-in account's teams."""
    return [team_of(team, role) for team, role in teams.teams_of(database, account)]


class NewTeam(BaseModel):
    name: TeamName
    url: TeamUrl


@router.post(
    "/api/teams",
    status_code=status.HTTP_201_CREATED,
    responses=answers(NOT_SIGNED_IN, URL_TAKEN),
)
def create_team(body: NewTeam, account: SignedIn, database: Database) -> Team:
    """Creates a team, with the signed-in account as its owner."""
    try:
        team = teams.create_team(database, account, body.name, body.url)
    except teams.UrlTaken as error:
        raise HTTPException(status.HTTP_409_CONFLICT, "url_taken") from error

    created = team_of(team, TeamRole.OWNER)
    database.commit()

    return created


@router.get("/api/teams/{team_url}", responses=answers(NOT_SIGNED_IN, NOT_IN_TEAM))
def team(membership: InTeam) -> Team:
    """A team of the signed-in account."""
    return team_of(membership.team, membership.role)


class TeamChanges(BaseModel):
    """What to change of a team."""

    name: TeamName | None = None
    url: TeamUrl | None = None


@router.patch(
    "/api/teams/{team_url}",
    responses=answers(NOT_SIGNED_IN, NOT_IN_TEAM, OWNERS_ONLY, URL_TAKEN),
)
def update_team(body: TeamChanges, membership: InTeam, database: Database) -> Team:
    """Changes a team's name or URL."""
    # A member must have the editing rights
    require(membership, TeamAction.EDIT)
    try:
        teams.update_team(database, membership.team, body.name, body.url)
    except teams.UrlTaken as error:
        raise HTTPException(status.HTTP_409_CONFLICT, "url_taken") from error

    updated = team_of(membership.team, membership.role)

    database.commit()
    return updated


@router.delete(
    "/api/teams/{team_url}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=answers(NOT_SIGNED_IN, NOT_IN_TEAM, OWNERS_ONLY),
)
def delete_team(membership: InTeam, database: Database) -> None:
    """Deletes a team, with its projects and components."""
    # Team member must have a delete right
    require(membership, TeamAction.DELETE)

    teams.delete_team(database, membership.team)
    database.commit()


class Member(BaseModel):
    """A member of a team."""

    id: UUID
    name: str
    email: str
    role: TeamRole


class MemberNotFoundError(BaseModel):
    detail: Literal["team_not_found", "member_not_found"]


@router.get(
    "/api/teams/{team_url}/members", responses=answers(NOT_SIGNED_IN, NOT_IN_TEAM)
)
def team_members(membership: InTeam, database: Database) -> list[Member]:
    """A team's members, in the order they joined."""
    # Team member must have a view right
    require(membership, TeamAction.VIEW)
    # Return the list of all members in a team
    return [
        Member(id=account.id, name=account.name, email=account.email, role=role)
        for account, role in teams.members_of(database, membership.team)
    ]


@router.put(
    "/api/teams/{team_url}/owners/{account_id}",
    responses=answers(
        NOT_SIGNED_IN, (status.HTTP_404_NOT_FOUND, MemberNotFoundError), OWNERS_ONLY
    ),
)
def make_owner(account_id: UUID, membership: InTeam, database: Database) -> Member:
    """Makes a member of a team one of its owners."""
    # Team member must have a manage_members right
    require(membership, TeamAction.MANAGE_MEMBERS)

    try:
        account = teams.make_owner(database, membership.team, account_id)
    except teams.NotAMember as error:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "member_not_found") from error

    owner = Member(
        id=account.id, name=account.name, email=account.email, role=TeamRole.OWNER
    )

    database.commit()
    return owner


class OwnerCannotBeRemovedError(BaseModel):
    detail: Literal["owner_cannot_be_removed"]


@router.delete(
    "/api/teams/{team_url}/members/{account_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=answers(
        NOT_SIGNED_IN,
        (status.HTTP_404_NOT_FOUND, MemberNotFoundError),
        OWNERS_ONLY,
        (status.HTTP_409_CONFLICT, OwnerCannotBeRemovedError),
    ),
)
def remove_member(account_id: UUID, membership: InTeam, database: Database) -> None:
    """Takes a member out of a team and its projects. Owners leave by themselves."""
    # Team member must have a manage_members right
    require(membership, TeamAction.MANAGE_MEMBERS)

    # Remove a member, owners cannot be removed even by owners
    try:
        teams.remove_member(database, membership.team, account_id)
    except teams.NotAMember as error:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "member_not_found") from error
    except teams.OwnerCannotBeRemoved as error:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "owner_cannot_be_removed"
        ) from error

    database.commit()


class LastOwnerError(BaseModel):
    detail: Literal["last_owner"]


@router.delete(
    "/api/teams/{team_url}/membership",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=answers(
        NOT_SIGNED_IN, NOT_IN_TEAM, (status.HTTP_409_CONFLICT, LastOwnerError)
    ),
)
def leave_team(membership: InTeam, account: SignedIn, database: Database) -> None:
    """Takes the signed-in account out of a team and its projects."""
    # Team member must have a leave right
    require(membership, TeamAction.LEAVE)

    try:
        teams.leave(database, membership.team, account)
    except teams.LastOwner as error:
        raise HTTPException(status.HTTP_409_CONFLICT, "last_owner") from error

    database.commit()


class InviteLink(BaseModel):
    """What makes a team's invite link: compono.app/join/{token}."""

    token: str
    expires_at: datetime


@router.get(
    "/api/teams/{team_url}/invite-link",
    responses=answers(NOT_SIGNED_IN, NOT_IN_TEAM, OWNERS_ONLY),
)
def invite_link(membership: InTeam, database: Database) -> InviteLink:
    """A team's invite link. A new one if the last one has expired."""
    # Team member must have a share_invite_link right
    require(membership, TeamAction.SHARE_INVITE_LINK)

    token, expires_at = teams.invite_link(database, membership.team)

    database.commit()
    return InviteLink(token=token, expires_at=expires_at)


class Invite(BaseModel):
    """What the join page shows of the team."""

    team_name: str


class InviteLinkNotValidError(BaseModel):
    detail: Literal["invite_link_not_valid"]


INVITE_LINK_NOT_VALID: Final = (status.HTTP_404_NOT_FOUND, InviteLinkNotValidError)


@router.get("/api/invite-links/{token}", responses=answers(INVITE_LINK_NOT_VALID))
def invite(token: str, database: Database) -> Invite:
    """The team that an invite link joins. Also for someone not signed in."""
    try:
        team = teams.team_of_invite(database, token)
    except teams.InviteLinkNotValid as error:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, "invite_link_not_valid"
        ) from error

    return Invite(team_name=team.name)


@router.post(
    "/api/invite-links/{token}",
    responses=answers(NOT_SIGNED_IN, INVITE_LINK_NOT_VALID),
)
def join_team(token: str, account: SignedIn, database: Database) -> Team:
    """Adds the signed-in account to an invite link's team as a member."""
    try:
        joined = teams.join(database, token, account)
    except teams.InviteLinkNotValid as error:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, "invite_link_not_valid"
        ) from error

    team = team_of(joined.team, joined.role)

    database.commit()
    return team
