"""Tests of teams through the API."""

from datetime import UTC, datetime, timedelta
from uuid import UUID

from fastapi.testclient import TestClient
from pydantic import TypeAdapter
from sqlalchemy.orm import Session

from compono import auth, models
from compono.api.accounts import Account
from compono.api.teams import Team
from compono.models import TeamRole

PASSWORD = "correct horse battery staple"

teams = TypeAdapter(list[Team])


def sign_up_mira(client: TestClient) -> UUID:
    """Signs Mira up, so that the client is signed in as her. Returns her account's id."""
    body: dict[str, str] = {
        "name": "Mira Kovalenko",
        "email": "mira@acme.dev",
        "password": PASSWORD,
    }
    response = client.post("/api/accounts", json=body)
    return Account.model_validate_json(response.text).id


def add_team(session: Session, name: str, url: str) -> models.Team:
    team = models.Team(name=name, url=url)
    session.add(team)
    session.flush()
    return team


def add_member(
    session: Session,
    team: models.Team,
    account_id: UUID,
    role: TeamRole,
    joined_at: datetime | None = None,
) -> None:
    member = models.TeamMember(team_id=team.id, account_id=account_id, role=role)
    session.add(member)
    session.flush()
    if joined_at is not None:
        member.joined_at = joined_at
        session.flush()


def test_my_teams_needs_a_session(client: TestClient) -> None:
    response = client.get("/api/teams")

    assert response.status_code == 401


def test_an_account_in_no_team_has_none(client: TestClient) -> None:
    sign_up_mira(client)

    response = client.get("/api/teams")

    assert response.status_code == 200
    assert teams.validate_json(response.text) == []


def test_my_teams_are_the_teams_i_am_in_with_my_role(
    client: TestClient, session: Session
) -> None:
    mira = sign_up_mira(client)
    jonas = auth.create_account(session, "Jonas Lind", "jonas@acme.dev", PASSWORD)
    acme = add_team(session, "Acme", "acme")
    add_member(session, acme, mira, TeamRole.OWNER)
    northwind = add_team(session, "Northwind", "northwind")
    add_member(session, northwind, jonas.id, TeamRole.OWNER)
    add_member(session, northwind, mira, TeamRole.MEMBER)
    # Jonas's team, which Mira isn't in
    kite_labs = add_team(session, "Kite Labs", "kite-labs")
    add_member(session, kite_labs, jonas.id, TeamRole.OWNER)

    response = client.get("/api/teams")

    assert teams.validate_json(response.text) == [
        Team(id=acme.id, name="Acme", url="acme", role=TeamRole.OWNER),
        Team(id=northwind.id, name="Northwind", url="northwind", role=TeamRole.MEMBER),
    ]


def test_my_teams_are_in_the_order_i_joined_them(
    client: TestClient, session: Session
) -> None:
    mira = sign_up_mira(client)
    now = datetime.now(UTC)
    # Joined Northwind first, although Acme comes first by name
    add_member(session, add_team(session, "Acme", "acme"), mira, TeamRole.OWNER, now)
    add_member(
        session,
        add_team(session, "Northwind", "northwind"),
        mira,
        TeamRole.MEMBER,
        now - timedelta(days=1),
    )

    response = client.get("/api/teams")

    assert [team.url for team in teams.validate_json(response.text)] == [
        "northwind",
        "acme",
    ]
