"""Tests of teams, their members and invite links, without the API."""

import threading
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from sqlalchemy import Engine, delete, select
from sqlalchemy.orm import Session

from compono import auth, teams
from compono.models import INVITE_LINK_LIFETIME, Account, Team, TeamMember, TeamRole

PASSWORD = "correct horse battery staple"


def create_account(session: Session, name: str) -> Account:
    email = f"{name.split()[0].lower()}@acme.dev"
    return auth.create_account(session, name, email, PASSWORD)


def add_member(
    session: Session, team: Team, account: Account, role: TeamRole = TeamRole.MEMBER
) -> None:
    session.add(TeamMember(team_id=team.id, account_id=account.id, role=role))
    session.flush()


def role_in(session: Session, team: Team, account: Account) -> TeamRole | None:
    found = teams.membership(session, team.url, account)
    return None if found is None else found.role


def load[T](session: Session, model: type[T], id: UUID) -> T:
    found = session.get(model, id)
    assert found is not None
    return found


def test_creating_a_team_makes_its_creator_the_owner(session: Session) -> None:
    mira = create_account(session, "Mira Kovalenko")

    acme = teams.create_team(session, mira, "Acme", "acme")

    assert (acme.name, acme.url) == ("Acme", "acme")
    assert role_in(session, acme, mira) == TeamRole.OWNER


def test_a_url_can_have_one_team(session: Session) -> None:
    mira = create_account(session, "Mira Kovalenko")
    teams.create_team(session, mira, "Acme", "acme")

    with pytest.raises(teams.UrlTaken):
        teams.create_team(session, mira, "Another Acme", "acme")

    # The transaction goes on after a taken URL
    teams.create_team(session, mira, "Northwind", "northwind")


@pytest.mark.parametrize("url", ["settings", "sign-in", "api"])
def test_a_reserved_url_is_taken(session: Session, url: str) -> None:
    mira = create_account(session, "Mira Kovalenko")

    with pytest.raises(teams.UrlTaken):
        teams.create_team(session, mira, "Acme", url)


def test_membership_is_only_for_members(session: Session) -> None:
    mira = create_account(session, "Mira Kovalenko")
    jonas = create_account(session, "Jonas Lind")
    acme = teams.create_team(session, mira, "Acme", "acme")

    assert teams.membership(session, "acme", mira) == (acme, TeamRole.OWNER)
    assert teams.membership(session, "acme", jonas) is None
    assert teams.membership(session, "no-such-team", mira) is None


def test_updating_a_team_changes_what_is_given(session: Session) -> None:
    mira = create_account(session, "Mira Kovalenko")
    acme = teams.create_team(session, mira, "Acme", "acme")

    teams.update_team(session, acme, "Acme Inc", None)
    assert (acme.name, acme.url) == ("Acme Inc", "acme")

    teams.update_team(session, acme, None, "acme-inc")
    assert (acme.name, acme.url) == ("Acme Inc", "acme-inc")


def test_a_team_keeps_its_url_when_the_new_one_is_taken(session: Session) -> None:
    mira = create_account(session, "Mira Kovalenko")
    acme = teams.create_team(session, mira, "Acme", "acme")
    teams.create_team(session, mira, "Northwind", "northwind")

    with pytest.raises(teams.UrlTaken):
        teams.update_team(session, acme, "Acme Inc", "northwind")
    with pytest.raises(teams.UrlTaken):
        teams.update_team(session, acme, None, "settings")

    assert (acme.name, acme.url) == ("Acme", "acme")


def test_deleting_a_team_deletes_its_memberships(session: Session) -> None:
    mira = create_account(session, "Mira Kovalenko")
    jonas = create_account(session, "Jonas Lind")
    acme = teams.create_team(session, mira, "Acme", "acme")
    add_member(session, acme, jonas)

    teams.delete_team(session, acme)

    assert session.scalars(select(TeamMember)).all() == []
    # The accounts stay
    assert session.get(Account, jonas.id) is jonas


def test_members_are_in_the_order_they_joined(session: Session) -> None:
    mira = create_account(session, "Mira Kovalenko")
    jonas = create_account(session, "Jonas Lind")
    acme = teams.create_team(session, mira, "Acme", "acme")
    add_member(session, acme, jonas)
    # Mira created it, so she joined first
    for member in session.scalars(
        select(TeamMember).where(TeamMember.account_id == mira.id)
    ):
        member.joined_at = datetime.now(UTC) - timedelta(days=1)

    assert teams.members_of(session, acme) == [
        (mira, TeamRole.OWNER),
        (jonas, TeamRole.MEMBER),
    ]


def test_making_a_member_an_owner(session: Session) -> None:
    mira = create_account(session, "Mira Kovalenko")
    jonas = create_account(session, "Jonas Lind")
    acme = teams.create_team(session, mira, "Acme", "acme")
    add_member(session, acme, jonas)

    assert teams.make_owner(session, acme, jonas.id) is jonas

    assert role_in(session, acme, jonas) == TeamRole.OWNER


def test_only_members_become_owners(session: Session) -> None:
    mira = create_account(session, "Mira Kovalenko")
    jonas = create_account(session, "Jonas Lind")
    acme = teams.create_team(session, mira, "Acme", "acme")

    with pytest.raises(teams.NotAMember):
        teams.make_owner(session, acme, jonas.id)


def test_removing_a_member(session: Session) -> None:
    mira = create_account(session, "Mira Kovalenko")
    jonas = create_account(session, "Jonas Lind")
    acme = teams.create_team(session, mira, "Acme", "acme")
    add_member(session, acme, jonas)

    teams.remove_member(session, acme, jonas.id)

    assert role_in(session, acme, jonas) is None


def test_owners_cannot_be_removed(session: Session) -> None:
    mira = create_account(session, "Mira Kovalenko")
    jonas = create_account(session, "Jonas Lind")
    acme = teams.create_team(session, mira, "Acme", "acme")
    add_member(session, acme, jonas, TeamRole.OWNER)

    with pytest.raises(teams.OwnerCannotBeRemoved):
        teams.remove_member(session, acme, jonas.id)
    with pytest.raises(teams.NotAMember):
        teams.remove_member(session, acme, uuid4())


def test_a_member_can_leave(session: Session) -> None:
    mira = create_account(session, "Mira Kovalenko")
    jonas = create_account(session, "Jonas Lind")
    acme = teams.create_team(session, mira, "Acme", "acme")
    add_member(session, acme, jonas)

    teams.leave(session, acme, jonas)

    assert role_in(session, acme, jonas) is None


def test_an_owner_can_leave_when_there_is_another(session: Session) -> None:
    mira = create_account(session, "Mira Kovalenko")
    jonas = create_account(session, "Jonas Lind")
    acme = teams.create_team(session, mira, "Acme", "acme")
    add_member(session, acme, jonas, TeamRole.OWNER)

    teams.leave(session, acme, mira)

    assert role_in(session, acme, mira) is None
    assert role_in(session, acme, jonas) == TeamRole.OWNER


def test_the_last_owner_cannot_leave(session: Session) -> None:
    mira = create_account(session, "Mira Kovalenko")
    jonas = create_account(session, "Jonas Lind")
    acme = teams.create_team(session, mira, "Acme", "acme")
    add_member(session, acme, jonas)

    with pytest.raises(teams.LastOwner):
        teams.leave(session, acme, mira)

    assert role_in(session, acme, mira) == TeamRole.OWNER


def test_an_invite_link_stays_the_same_until_it_expires(session: Session) -> None:
    mira = create_account(session, "Mira Kovalenko")
    acme = teams.create_team(session, mira, "Acme", "acme")

    token, expires_at = teams.invite_link(session, acme)

    assert teams.invite_link(session, acme) == (token, expires_at)
    assert expires_at - datetime.now(UTC) <= INVITE_LINK_LIFETIME


def test_an_expired_invite_link_is_replaced(session: Session) -> None:
    mira = create_account(session, "Mira Kovalenko")
    acme = teams.create_team(session, mira, "Acme", "acme")
    old_token, _ = teams.invite_link(session, acme)
    acme.invite_expires_at = datetime.now(UTC) - timedelta(seconds=1)
    session.flush()

    token, expires_at = teams.invite_link(session, acme)

    assert token != old_token
    assert expires_at - datetime.now(UTC) > INVITE_LINK_LIFETIME - timedelta(minutes=1)


def test_joining_with_an_invite_link(session: Session) -> None:
    mira = create_account(session, "Mira Kovalenko")
    jonas = create_account(session, "Jonas Lind")
    acme = teams.create_team(session, mira, "Acme", "acme")
    token, _ = teams.invite_link(session, acme)

    assert teams.join(session, token, jonas) == (acme, TeamRole.MEMBER)
    # Joining again changes nothing, and an owner stays an owner
    assert teams.join(session, token, jonas) == (acme, TeamRole.MEMBER)
    assert teams.join(session, token, mira) == (acme, TeamRole.OWNER)


def test_an_expired_or_unknown_invite_link_joins_nothing(session: Session) -> None:
    mira = create_account(session, "Mira Kovalenko")
    jonas = create_account(session, "Jonas Lind")
    acme = teams.create_team(session, mira, "Acme", "acme")
    token, _ = teams.invite_link(session, acme)
    acme.invite_expires_at = datetime.now(UTC) - timedelta(seconds=1)
    session.flush()

    for made_up_or_expired in [token, "made-up"]:
        with pytest.raises(teams.InviteLinkNotValid):
            teams.join(session, made_up_or_expired, jonas)
    assert role_in(session, acme, jonas) is None


@contextmanager
def committed_team(engine: Engine) -> Iterator[tuple[UUID, UUID, UUID]]:
    """A team with two owners that other connections see. Deleted afterwards."""
    suffix = uuid4().hex[:8]
    with Session(engine) as setup:
        mira = auth.create_account(setup, "Mira", f"mira-{suffix}@acme.dev", PASSWORD)
        jonas = auth.create_account(
            setup, "Jonas", f"jonas-{suffix}@acme.dev", PASSWORD
        )
        team = teams.create_team(setup, mira, "Race", f"race-{suffix}")
        add_member(setup, team, jonas, TeamRole.OWNER)
        setup.commit()
        team_id, mira_id, jonas_id = team.id, mira.id, jonas.id
    try:
        yield team_id, mira_id, jonas_id
    finally:
        with Session(engine) as cleanup:
            # The team first, since an account in a team can't be deleted
            cleanup.execute(delete(Team).where(Team.id == team_id))
            for account_id in [mira_id, jonas_id]:
                cleanup.execute(delete(Account).where(Account.id == account_id))
            cleanup.commit()


def test_two_owners_leaving_at_once_cannot_both_leave(engine: Engine) -> None:
    with committed_team(engine) as (team_id, mira_id, jonas_id):
        outcome: list[str] = []

        def jonas_leaves() -> None:
            with Session(engine) as second:
                try:
                    teams.leave(
                        second,
                        load(second, Team, team_id),
                        load(second, Account, jonas_id),
                    )
                    second.commit()
                    outcome.append("left")
                except teams.LastOwner:
                    outcome.append("last owner")

        with Session(engine) as first:
            teams.leave(
                first, load(first, Team, team_id), load(first, Account, mira_id)
            )
            jonas = threading.Thread(target=jonas_leaves)
            jonas.start()
            jonas.join(timeout=0.5)
            # Waits for Mira's transaction, which has the owners locked
            assert jonas.is_alive()
            first.commit()
        jonas.join(timeout=5)

        assert outcome == ["last owner"]


def test_two_owners_opening_an_expired_link_at_once_get_the_same_one(
    engine: Engine,
) -> None:
    with committed_team(engine) as (team_id, _, _):
        with Session(engine) as setup:
            load(setup, Team, team_id).invite_expires_at = datetime.now(
                UTC
            ) - timedelta(seconds=1)
            setup.commit()
        tokens: list[str] = []

        def second_opens() -> None:
            with Session(engine) as second:
                token, _ = teams.invite_link(second, load(second, Team, team_id))
                second.commit()
                tokens.append(token)

        with Session(engine) as first:
            token, _ = teams.invite_link(first, load(first, Team, team_id))
            second = threading.Thread(target=second_opens)
            second.start()
            second.join(timeout=0.5)
            assert second.is_alive()
            first.commit()
        second.join(timeout=5)

        assert tokens == [token]
