"""Tests of teams through the API."""

from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from httpx2 import Response
from pydantic import BaseModel, TypeAdapter
from sqlalchemy.orm import Session

from compono import auth, models
from compono.api.accounts import Account
from compono.api.teams import Invite, InviteLink, Member, Team
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


members = TypeAdapter(list[Member])


class Error(BaseModel):
    detail: str


class InvalidField(BaseModel):
    loc: list[str | int]


class Invalid(BaseModel):
    detail: list[InvalidField]


def error(response: Response) -> str:
    return Error.model_validate_json(response.text).detail


def sign_in_as(client: TestClient, session: Session, account: models.Account) -> None:
    """Signs the client in as the account, without its password."""
    client.cookies.clear()
    client.cookies["session"] = auth.sign_in(session, account)


def create_account(session: Session, name: str) -> models.Account:
    email = f"{name.split()[0].lower()}@acme.dev"
    return auth.create_account(session, name, email, PASSWORD)


def acme(
    client: TestClient, session: Session
) -> tuple[models.Team, models.Account, models.Account]:
    """Acme, with Mira as its owner and Jonas as a member. The client is signed in as Mira."""
    mira = create_account(session, "Mira Kovalenko")
    jonas = create_account(session, "Jonas Lind")
    team = add_team(session, "Acme", "acme")
    yesterday = datetime.now(UTC) - timedelta(days=1)
    add_member(session, team, mira.id, TeamRole.OWNER, yesterday)
    add_member(session, team, jonas.id, TeamRole.MEMBER)
    sign_in_as(client, session, mira)
    return team, mira, jonas


def new_team(client: TestClient, name: str, url: str) -> Response:
    body: dict[str, str] = {"name": name, "url": url}
    return client.post("/api/teams", json=body)


# Every endpoint of a team. {member} is a member's account.
TEAM_ENDPOINTS = [
    ("GET", "/api/teams/acme"),
    ("PATCH", "/api/teams/acme"),
    ("DELETE", "/api/teams/acme"),
    ("GET", "/api/teams/acme/members"),
    ("PUT", "/api/teams/acme/owners/{member}"),
    ("DELETE", "/api/teams/acme/members/{member}"),
    ("DELETE", "/api/teams/acme/membership"),
    ("GET", "/api/teams/acme/invite-link"),
]

OWNERS_ONLY_ENDPOINTS = [
    ("PATCH", "/api/teams/acme"),
    ("DELETE", "/api/teams/acme"),
    ("PUT", "/api/teams/acme/owners/{member}"),
    ("DELETE", "/api/teams/acme/members/{member}"),
    ("GET", "/api/teams/acme/invite-link"),
]


def call(client: TestClient, method: str, path: str, member: UUID) -> Response:
    body: dict[str, str] | None = {} if method == "PATCH" else None
    return client.request(method, path.format(member=member), json=body)


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("POST", "/api/teams"),
        *TEAM_ENDPOINTS,
        ("POST", "/api/invite-links/made-up"),
    ],
)
def test_teams_need_a_session(client: TestClient, method: str, path: str) -> None:
    body: dict[str, str] = {"name": "Acme", "url": "acme"}
    response = client.request(method, path.format(member=uuid4()), json=body)

    assert response.status_code == 401


@pytest.mark.parametrize(("method", "path"), TEAM_ENDPOINTS)
def test_someone_not_in_a_team_finds_no_team(
    client: TestClient, session: Session, method: str, path: str
) -> None:
    _, _, jonas = acme(client, session)
    sign_in_as(client, session, create_account(session, "Sofia Reyes"))

    response = call(client, method, path, jonas.id)

    # The same as for a team that doesn't exist, so that it doesn't tell which teams exist
    assert response.status_code == 404
    assert error(response) == "team_not_found"
    assert error(call(client, method, path.replace("acme", "nowhere"), jonas.id)) == (
        "team_not_found"
    )


@pytest.mark.parametrize(("method", "path"), OWNERS_ONLY_ENDPOINTS)
def test_a_member_cannot_do_what_only_owners_do(
    client: TestClient, session: Session, method: str, path: str
) -> None:
    team, _, jonas = acme(client, session)
    sofia = create_account(session, "Sofia Reyes")
    add_member(session, team, sofia.id, TeamRole.MEMBER)
    sign_in_as(client, session, jonas)

    response = call(client, method, path, sofia.id)

    assert response.status_code == 403
    assert error(response) == "owners_only"


def test_creating_a_team_makes_me_its_owner(client: TestClient) -> None:
    sign_up_mira(client)

    response = new_team(client, "Acme", "acme")

    assert response.status_code == 201
    created = Team.model_validate_json(response.text)
    assert (created.name, created.url, created.role) == ("Acme", "acme", TeamRole.OWNER)
    assert teams.validate_json(client.get("/api/teams").text) == [created]


@pytest.mark.parametrize("url", ["acme", "settings"])
def test_a_team_cannot_have_a_taken_or_reserved_url(
    client: TestClient, session: Session, url: str
) -> None:
    acme(client, session)

    response = new_team(client, "Another Acme", url)

    assert response.status_code == 409
    assert error(response) == "url_taken"


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("name", "   "),
        ("name", "N" * 101),
        ("url", "Acme"),
        ("url", "ac"),
        ("url", "a" * 40),
        ("url", "acme--design"),
        ("url", "-acme"),
    ],
)
def test_creating_a_team_refuses_bad_input(
    client: TestClient, field: str, value: str
) -> None:
    sign_up_mira(client)
    body: dict[str, str] = {"name": "Acme", "url": "acme", field: value}

    response = client.post("/api/teams", json=body)

    assert response.status_code == 422
    invalid = Invalid.model_validate_json(response.text)
    assert [problem.loc for problem in invalid.detail] == [["body", field]]


def test_a_member_sees_the_team_with_their_role(
    client: TestClient, session: Session
) -> None:
    team, _, jonas = acme(client, session)
    sign_in_as(client, session, jonas)

    response = client.get("/api/teams/acme")

    assert Team.model_validate_json(response.text) == Team(
        id=team.id, name="Acme", url="acme", role=TeamRole.MEMBER
    )


def test_an_owner_renames_a_team_and_changes_its_url(
    client: TestClient, session: Session
) -> None:
    team, _, _ = acme(client, session)
    body: dict[str, str] = {"name": "Acme Inc", "url": "acme-inc"}

    response = client.patch("/api/teams/acme", json=body)

    assert response.status_code == 200
    assert Team.model_validate_json(response.text) == Team(
        id=team.id, name="Acme Inc", url="acme-inc", role=TeamRole.OWNER
    )
    assert client.get("/api/teams/acme").status_code == 404
    assert client.get("/api/teams/acme-inc").status_code == 200


def test_what_an_update_leaves_out_stays(client: TestClient, session: Session) -> None:
    acme(client, session)
    body: dict[str, str] = {"name": "Acme Inc"}

    response = client.patch("/api/teams/acme", json=body)

    assert Team.model_validate_json(response.text).url == "acme"


def test_a_team_cannot_move_to_a_taken_url(
    client: TestClient, session: Session
) -> None:
    acme(client, session)
    add_team(session, "Northwind", "northwind")
    body: dict[str, str] = {"url": "northwind"}

    response = client.patch("/api/teams/acme", json=body)

    assert response.status_code == 409
    assert error(response) == "url_taken"
    assert client.get("/api/teams/acme").status_code == 200


def test_an_owner_deletes_a_team(client: TestClient, session: Session) -> None:
    acme(client, session)

    response = client.delete("/api/teams/acme")

    assert response.status_code == 204
    assert client.get("/api/teams/acme").status_code == 404
    assert teams.validate_json(client.get("/api/teams").text) == []


def test_everyone_in_a_team_sees_its_members(
    client: TestClient, session: Session
) -> None:
    _, mira, jonas = acme(client, session)
    sign_in_as(client, session, jonas)

    response = client.get("/api/teams/acme/members")

    assert members.validate_json(response.text) == [
        Member(id=mira.id, name=mira.name, email=mira.email, role=TeamRole.OWNER),
        Member(id=jonas.id, name=jonas.name, email=jonas.email, role=TeamRole.MEMBER),
    ]


def test_an_owner_makes_a_member_an_owner(client: TestClient, session: Session) -> None:
    _, _, jonas = acme(client, session)

    response = client.put(f"/api/teams/acme/owners/{jonas.id}")

    assert response.status_code == 200
    assert Member.model_validate_json(response.text).role == TeamRole.OWNER
    sign_in_as(client, session, jonas)
    assert Team.model_validate_json(client.get("/api/teams/acme").text).role == (
        TeamRole.OWNER
    )


def test_an_owner_removes_a_member(client: TestClient, session: Session) -> None:
    _, mira, jonas = acme(client, session)

    response = client.delete(f"/api/teams/acme/members/{jonas.id}")

    assert response.status_code == 204
    remaining = members.validate_json(client.get("/api/teams/acme/members").text)
    assert [member.id for member in remaining] == [mira.id]


def test_owners_cannot_be_removed(client: TestClient, session: Session) -> None:
    team, mira, _ = acme(client, session)
    ava = create_account(session, "Ava Turner")
    add_member(session, team, ava.id, TeamRole.OWNER)

    for owner in [ava, mira]:
        response = client.delete(f"/api/teams/acme/members/{owner.id}")

        assert response.status_code == 409
        assert error(response) == "owner_cannot_be_removed"


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("PUT", "/api/teams/acme/owners/{member}"),
        ("DELETE", "/api/teams/acme/members/{member}"),
    ],
)
def test_someone_not_in_the_team_is_not_a_member(
    client: TestClient, session: Session, method: str, path: str
) -> None:
    acme(client, session)
    sofia = create_account(session, "Sofia Reyes")

    response = call(client, method, path, sofia.id)

    assert response.status_code == 404
    assert error(response) == "member_not_found"


def test_a_member_leaves_a_team(client: TestClient, session: Session) -> None:
    _, _, jonas = acme(client, session)
    sign_in_as(client, session, jonas)

    response = client.delete("/api/teams/acme/membership")

    assert response.status_code == 204
    assert client.get("/api/teams/acme").status_code == 404


def test_the_last_owner_cannot_leave(client: TestClient, session: Session) -> None:
    acme(client, session)

    response = client.delete("/api/teams/acme/membership")

    assert response.status_code == 409
    assert error(response) == "last_owner"
    assert client.get("/api/teams/acme").status_code == 200


def share_invite_link(client: TestClient) -> InviteLink:
    response = client.get("/api/teams/acme/invite-link")
    assert response.status_code == 200
    return InviteLink.model_validate_json(response.text)


def test_an_owner_shares_the_invite_link(client: TestClient, session: Session) -> None:
    acme(client, session)

    link = share_invite_link(client)

    assert len(link.token) >= 22
    assert link.expires_at > datetime.now(UTC)
    assert share_invite_link(client) == link


def test_anyone_with_an_invite_link_sees_which_team_it_joins(
    client: TestClient, session: Session
) -> None:
    acme(client, session)
    link = share_invite_link(client)
    client.cookies.clear()

    response = client.get(f"/api/invite-links/{link.token}")

    assert response.status_code == 200
    assert Invite.model_validate_json(response.text) == Invite(team_name="Acme")


def test_joining_a_team_with_its_invite_link(
    client: TestClient, session: Session
) -> None:
    team, _, _ = acme(client, session)
    link = share_invite_link(client)
    sign_in_as(client, session, create_account(session, "Sofia Reyes"))

    response = client.post(f"/api/invite-links/{link.token}")

    assert response.status_code == 200
    joined = Team(id=team.id, name="Acme", url="acme", role=TeamRole.MEMBER)
    assert Team.model_validate_json(response.text) == joined
    assert teams.validate_json(client.get("/api/teams").text) == [joined]


def test_an_expired_or_made_up_invite_link_is_not_valid(
    client: TestClient, session: Session
) -> None:
    team, _, _ = acme(client, session)
    link = share_invite_link(client)
    team.invite_expires_at = datetime.now(UTC) - timedelta(seconds=1)
    session.flush()
    sign_in_as(client, session, create_account(session, "Sofia Reyes"))

    for token in [link.token, "made-up"]:
        for response in [
            client.get(f"/api/invite-links/{token}"),
            client.post(f"/api/invite-links/{token}"),
        ]:
            assert response.status_code == 404
            assert error(response) == "invite_link_not_valid"
