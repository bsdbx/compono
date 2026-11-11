"""Tests of projects and their members, without the API."""

import threading
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from sqlalchemy import Engine, delete, select
from sqlalchemy.orm import Session

from compono import auth, projects, teams
from compono.models import (
    Account,
    Component,
    Project,
    ProjectMember,
    ProjectRole,
    Team,
    TeamMember,
    TeamRole,
)

PASSWORD = "correct horse battery staple"


def create_account(session: Session, name: str) -> Account:
    email = f"{name.split()[0].lower()}@acme.dev"
    return auth.create_account(session, name, email, PASSWORD)


def acme(session: Session) -> tuple[Team, Account, Account]:
    """Acme, with Mira as its owner and Jonas as a member."""
    mira = create_account(session, "Mira Kovalenko")
    jonas = create_account(session, "Jonas Lind")
    team = teams.create_team(session, mira, "Acme", "acme")
    session.add(TeamMember(team_id=team.id, account_id=jonas.id, role=TeamRole.MEMBER))
    session.flush()
    return team, mira, jonas


def create_project(
    session: Session, team: Team, account: Account, name: str
) -> Project:
    return projects.create_project(session, team, account, name, "")


def role_in(session: Session, project: Project, account: Account) -> ProjectRole | None:
    team = session.get_one(Team, project.team_id)
    found = projects.project_at(session, team, project.url, account)
    assert found is not None
    return found.role


def members(session: Session, project: Project) -> list[tuple[str, ProjectRole]]:
    return [
        (account.name, role) for account, role in projects.members_of(session, project)
    ]


def test_creating_a_project_makes_its_creator_its_first_lead(session: Session) -> None:
    team, mira, _ = acme(session)

    project = projects.create_project(
        session, team, mira, "Маркетинг сайт 2!", "Landing pages"
    )

    assert (project.name, project.url, project.description) == (
        "Маркетинг сайт 2!",
        "marketing-sayt-2",
        "Landing pages",
    )
    assert members(session, project) == [("Mira Kovalenko", ProjectRole.LEAD)]


def test_a_name_that_makes_a_taken_url_is_taken(session: Session) -> None:
    team, mira, _ = acme(session)
    create_project(session, team, mira, "Marketing site")

    with pytest.raises(projects.NameTaken):
        create_project(session, team, mira, "marketing  SITE!")

    # The transaction goes on after a taken name
    create_project(session, team, mira, "Checkout flow")
    # And another team can have the name
    northwind = teams.create_team(session, mira, "Northwind", "northwind")
    create_project(session, northwind, mira, "Marketing site")


@pytest.mark.parametrize("name", ["New", "Settings", "Members!"])
def test_a_name_that_makes_the_url_of_a_teams_page_is_taken(
    session: Session, name: str
) -> None:
    team, mira, _ = acme(session)

    with pytest.raises(projects.NameTaken):
        create_project(session, team, mira, name)


def test_owners_see_every_project_and_members_see_their_own(session: Session) -> None:
    team, mira, jonas = acme(session)
    marketing = create_project(session, team, mira, "Marketing site")
    projects.set_member(session, marketing, jonas.id, ProjectRole.DEVELOPER)
    checkout = create_project(session, team, mira, "Checkout flow")
    docs = create_project(session, team, mira, "Docs portal")
    projects.leave(session, docs, mira)
    # Another team's project, which nobody in Acme sees
    northwind = teams.create_team(session, jonas, "Northwind", "northwind")
    create_project(session, northwind, jonas, "Marketing site")
    now = datetime.now(UTC)
    docs.edited_at = now
    marketing.edited_at = now - timedelta(days=1)
    checkout.edited_at = now - timedelta(days=2)
    session.flush()

    # The most recently edited first
    mira_sees = projects.projects_of(session, team, TeamRole.OWNER, mira)
    assert [(listed.project, listed.role) for listed in mira_sees] == [
        (docs, None),
        (marketing, ProjectRole.LEAD),
        (checkout, ProjectRole.LEAD),
    ]
    jonas_sees = projects.projects_of(session, team, TeamRole.MEMBER, jonas)
    assert [(listed.project, listed.role) for listed in jonas_sees] == [
        (marketing, ProjectRole.DEVELOPER)
    ]


def test_listed_projects_have_their_members_in_the_order_they_were_added(
    session: Session,
) -> None:
    team, mira, jonas = acme(session)
    marketing = create_project(session, team, mira, "Marketing site")
    projects.set_member(session, marketing, jonas.id, ProjectRole.DEVELOPER)
    docs = create_project(session, team, mira, "Docs portal")
    projects.leave(session, docs, mira)
    # Mira was added before Jonas, although he comes first by name
    for member in session.scalars(select(ProjectMember)):
        if member.account_id == mira.id:
            member.added_at = datetime.now(UTC) - timedelta(days=1)
    session.flush()

    listed = projects.projects_of(session, team, TeamRole.OWNER, mira)

    assert {item.project.url: item.members for item in listed} == {
        "marketing-site": [mira, jonas],
        "docs-portal": [],
    }


def test_project_at_finds_the_teams_project_with_the_accounts_role(
    session: Session,
) -> None:
    team, mira, jonas = acme(session)
    marketing = create_project(session, team, mira, "Marketing site")
    northwind = teams.create_team(session, jonas, "Northwind", "northwind")
    create_project(session, northwind, jonas, "Docs portal")

    assert projects.project_at(session, team, "marketing-site", mira) == (
        marketing,
        ProjectRole.LEAD,
    )
    assert projects.project_at(session, team, "marketing-site", jonas) == (
        marketing,
        None,
    )
    assert projects.project_at(session, team, "docs-portal", jonas) is None
    assert projects.project_at(session, team, "no-such-project", mira) is None


def test_updating_a_project_changes_what_is_given(session: Session) -> None:
    team, mira, _ = acme(session)
    project = create_project(session, team, mira, "Marketing site")

    projects.update_project(session, project, "Marketing pages", None)
    assert (project.name, project.url, project.description) == (
        "Marketing pages",
        "marketing-pages",
        "",
    )

    projects.update_project(session, project, None, "For acme.com")
    assert (project.name, project.description) == ("Marketing pages", "For acme.com")

    # A name with the same URL as before
    projects.update_project(session, project, "Marketing Pages", None)
    assert (project.name, project.url) == ("Marketing Pages", "marketing-pages")


def test_a_project_keeps_its_name_when_the_new_one_is_taken(session: Session) -> None:
    team, mira, _ = acme(session)
    project = create_project(session, team, mira, "Marketing site")
    create_project(session, team, mira, "Checkout flow")

    with pytest.raises(projects.NameTaken):
        projects.update_project(session, project, "Checkout flow!", "New description")
    with pytest.raises(projects.NameTaken):
        projects.update_project(session, project, "Settings", None)

    assert (project.name, project.url, project.description) == (
        "Marketing site",
        "marketing-site",
        "",
    )


def test_deleting_a_project_deletes_its_members_and_components(
    session: Session,
) -> None:
    team, mira, jonas = acme(session)
    project = create_project(session, team, mira, "Marketing site")
    projects.set_member(session, project, jonas.id, ProjectRole.DEVELOPER)
    session.add(Component(project_id=project.id, name="PricingCard", graph={}))
    session.flush()

    projects.delete_project(session, project)

    assert session.scalars(select(ProjectMember)).all() == []
    assert session.scalars(select(Component)).all() == []
    # The team and its members stay
    assert len(teams.members_of(session, team)) == 2


def test_members_are_in_the_order_they_were_added(session: Session) -> None:
    team, mira, jonas = acme(session)
    sofia = create_account(session, "Sofia Reyes")
    session.add(TeamMember(team_id=team.id, account_id=sofia.id, role=TeamRole.MEMBER))
    project = create_project(session, team, mira, "Marketing site")
    projects.set_member(session, project, sofia.id, ProjectRole.DEVELOPER)
    projects.set_member(session, project, jonas.id, ProjectRole.LEAD)
    # Sofia was added before Jonas, although he comes first by name
    now = datetime.now(UTC)
    added_at = {
        mira.id: now - timedelta(minutes=2),
        sofia.id: now - timedelta(minutes=1),
        jonas.id: now,
    }
    for member in session.scalars(select(ProjectMember)):
        member.added_at = added_at[member.account_id]
    session.flush()

    assert members(session, project) == [
        ("Mira Kovalenko", ProjectRole.LEAD),
        ("Sofia Reyes", ProjectRole.DEVELOPER),
        ("Jonas Lind", ProjectRole.LEAD),
    ]


def test_setting_a_member_adds_them_or_changes_their_role(session: Session) -> None:
    team, mira, jonas = acme(session)
    project = create_project(session, team, mira, "Marketing site")

    added = projects.set_member(session, project, jonas.id, ProjectRole.DEVELOPER)
    assert added is jonas
    assert role_in(session, project, jonas) == ProjectRole.DEVELOPER

    projects.set_member(session, project, jonas.id, ProjectRole.LEAD)
    assert role_in(session, project, jonas) == ProjectRole.LEAD
    projects.set_member(session, project, jonas.id, ProjectRole.LEAD)
    assert role_in(session, project, jonas) == ProjectRole.LEAD

    projects.set_member(session, project, mira.id, ProjectRole.DEVELOPER)
    assert members(session, project) == [
        ("Jonas Lind", ProjectRole.LEAD),
        ("Mira Kovalenko", ProjectRole.DEVELOPER),
    ]


def test_only_members_of_the_team_can_be_in_its_projects(session: Session) -> None:
    team, mira, jonas = acme(session)
    project = create_project(session, team, mira, "Marketing site")
    sofia = create_account(session, "Sofia Reyes")

    with pytest.raises(projects.NotInTeam):
        projects.set_member(session, project, sofia.id, ProjectRole.DEVELOPER)
    with pytest.raises(projects.NotInTeam):
        projects.set_member(session, project, uuid4(), ProjectRole.DEVELOPER)

    # The transaction goes on
    projects.set_member(session, project, jonas.id, ProjectRole.DEVELOPER)
    assert role_in(session, project, sofia) is None


def test_removing_a_member(session: Session) -> None:
    team, mira, jonas = acme(session)
    project = create_project(session, team, mira, "Marketing site")
    projects.set_member(session, project, jonas.id, ProjectRole.LEAD)

    projects.remove_member(session, project, mira.id)

    assert members(session, project) == [("Jonas Lind", ProjectRole.LEAD)]
    with pytest.raises(projects.NotInProject):
        projects.remove_member(session, project, mira.id)


def test_leaving_a_project(session: Session) -> None:
    team, mira, jonas = acme(session)
    project = create_project(session, team, mira, "Marketing site")
    projects.set_member(session, project, jonas.id, ProjectRole.DEVELOPER)

    projects.leave(session, project, jonas)
    assert members(session, project) == [("Mira Kovalenko", ProjectRole.LEAD)]
    # Also its last lead, since the team's owners manage it anyway
    projects.leave(session, project, mira)
    assert members(session, project) == []
    # Leaving again changes nothing
    projects.leave(session, project, mira)


def test_leaving_a_team_takes_the_account_out_of_its_projects(
    session: Session,
) -> None:
    team, mira, jonas = acme(session)
    project = create_project(session, team, mira, "Marketing site")
    projects.set_member(session, project, jonas.id, ProjectRole.LEAD)
    projects.leave(session, project, mira)

    # Jonas is the project's only lead
    teams.leave(session, team, jonas)

    assert members(session, project) == []
    # The owner still puts someone in charge
    projects.set_member(session, project, mira.id, ProjectRole.LEAD)
    assert members(session, project) == [("Mira Kovalenko", ProjectRole.LEAD)]


def test_deleting_a_team_deletes_its_projects(session: Session) -> None:
    team, mira, _ = acme(session)
    create_project(session, team, mira, "Marketing site")

    teams.delete_team(session, team)

    assert session.scalars(select(Project)).all() == []


@contextmanager
def committed_project(engine: Engine) -> Iterator[tuple[UUID, UUID, UUID, UUID]]:
    """A project of Mira's team, which Jonas is a member of, that other connections see. Deleted afterwards."""
    suffix = uuid4().hex[:8]
    with Session(engine) as setup:
        mira = auth.create_account(setup, "Mira", f"mira-{suffix}@acme.dev", PASSWORD)
        jonas = auth.create_account(
            setup, "Jonas", f"jonas-{suffix}@acme.dev", PASSWORD
        )
        team = teams.create_team(setup, mira, "Race", f"race-{suffix}")
        setup.add(
            TeamMember(team_id=team.id, account_id=jonas.id, role=TeamRole.MEMBER)
        )
        project = create_project(setup, team, mira, "Marketing site")
        setup.commit()
        team_id, project_id, mira_id, jonas_id = team.id, project.id, mira.id, jonas.id
    try:
        yield team_id, project_id, mira_id, jonas_id
    finally:
        with Session(engine) as cleanup:
            # The team first, since an account in a team can't be deleted
            cleanup.execute(delete(Team).where(Team.id == team_id))
            for account_id in [mira_id, jonas_id]:
                cleanup.execute(delete(Account).where(Account.id == account_id))
            cleanup.commit()


def test_adding_someone_who_is_leaving_the_team_at_once_does_not_add_them(
    engine: Engine,
) -> None:
    with committed_project(engine) as (team_id, project_id, mira_id, jonas_id):
        outcome: list[str] = []

        def mira_adds_jonas() -> None:
            with Session(engine) as second:
                project = second.get_one(Project, project_id)
                try:
                    projects.set_member(
                        second, project, jonas_id, ProjectRole.DEVELOPER
                    )
                    second.commit()
                    outcome.append("added")
                except projects.NotInTeam:
                    outcome.append("not in team")

        with Session(engine) as first:
            teams.leave(
                first,
                first.get_one(Team, team_id),
                first.get_one(Account, jonas_id),
            )
            mira = threading.Thread(target=mira_adds_jonas)
            mira.start()
            mira.join(timeout=0.5)
            # Waits for Jonas's transaction, which is taking him out of the team
            assert mira.is_alive()
            first.commit()
        mira.join(timeout=5)

        assert outcome == ["not in team"]
        with Session(engine) as check:
            in_project = check.scalars(
                select(ProjectMember.account_id).where(
                    ProjectMember.project_id == project_id
                )
            ).all()
            assert in_project == [mira_id]
