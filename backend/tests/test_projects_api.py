"""Tests of projects through the API."""

import unicodedata
from datetime import UTC, datetime, timedelta
from typing import NamedTuple
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from httpx2 import Response
from pydantic import BaseModel, TypeAdapter
from sqlalchemy import select
from sqlalchemy.orm import Session

from compono import auth, models, projects, teams
from compono.api.projects import ListedProject, Project, ProjectMember
from compono.models import ProjectRole, TeamRole

PASSWORD = "correct horse battery staple"

listed_projects = TypeAdapter(list[ListedProject])
project_members = TypeAdapter(list[ProjectMember])


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


class Acme(NamedTuple):
    team: models.Team
    # The owner, who isn't in Marketing site
    mira: models.Account
    # Marketing site's developer
    jonas: models.Account
    # Marketing site's lead
    sofia: models.Account
    # A member in no project
    daniel: models.Account
    marketing: models.Project


def acme_with_marketing(client: TestClient, session: Session) -> Acme:
    """Acme and its project Marketing site. The client is signed in as Mira, its owner."""
    mira = create_account(session, "Mira Kovalenko")
    team = teams.create_team(session, mira, "Acme", "acme")
    others: list[models.Account] = []
    for name in ["Jonas Lind", "Sofia Reyes", "Daniel Novak"]:
        account = create_account(session, name)
        session.add(
            models.TeamMember(
                team_id=team.id, account_id=account.id, role=TeamRole.MEMBER
            )
        )
        others.append(account)
    jonas, sofia, daniel = others
    marketing = projects.create_project(session, team, mira, "Marketing site", "")
    projects.set_member(session, marketing, sofia.id, ProjectRole.LEAD)
    projects.set_member(session, marketing, jonas.id, ProjectRole.DEVELOPER)
    projects.leave(session, marketing, mira)
    # Sofia was added before Jonas
    for member in session.scalars(select(models.ProjectMember)):
        if member.account_id == sofia.id:
            member.added_at = datetime.now(UTC) - timedelta(minutes=1)
    session.flush()
    sign_in_as(client, session, mira)
    return Acme(team, mira, jonas, sofia, daniel, marketing)


def new_project(client: TestClient, name: str, description: str = "") -> Response:
    body: dict[str, str] = {"name": name, "description": description}
    return client.post("/api/teams/acme/projects", json=body)


def change(client: TestClient, url: str, **changes: str) -> Response:
    body: dict[str, str] = changes
    return client.patch(f"/api/teams/acme/projects/{url}", json=body)


def set_member(
    client: TestClient, account_id: UUID, role: str, url: str = "marketing-site"
) -> Response:
    body: dict[str, str] = {"role": role}
    return client.put(f"/api/teams/acme/projects/{url}/members/{account_id}", json=body)


def project_at(client: TestClient, url: str) -> Response:
    return client.get(f"/api/teams/acme/projects/{url}")


def members(client: TestClient) -> list[tuple[str, ProjectRole]]:
    response = client.get("/api/teams/acme/projects/marketing-site/members")
    assert response.status_code == 200
    return [
        (member.name, member.role)
        for member in project_members.validate_json(response.text)
    ]


# Every endpoint of a project. {member} is a team member's account.
PROJECT_ENDPOINTS = [
    ("GET", "/api/teams/acme/projects/marketing-site"),
    ("PATCH", "/api/teams/acme/projects/marketing-site"),
    ("DELETE", "/api/teams/acme/projects/marketing-site"),
    ("GET", "/api/teams/acme/projects/marketing-site/members"),
    ("PUT", "/api/teams/acme/projects/marketing-site/members/{member}"),
    ("DELETE", "/api/teams/acme/projects/marketing-site/members/{member}"),
    ("DELETE", "/api/teams/acme/projects/marketing-site/membership"),
]

LEADS_ONLY_ENDPOINTS = [
    ("PATCH", "/api/teams/acme/projects/marketing-site"),
    ("DELETE", "/api/teams/acme/projects/marketing-site"),
    ("PUT", "/api/teams/acme/projects/marketing-site/members/{member}"),
    ("DELETE", "/api/teams/acme/projects/marketing-site/members/{member}"),
]


def call(client: TestClient, method: str, path: str, member: UUID) -> Response:
    body: dict[str, str] | None = None
    if method == "PATCH":
        body = {}
    if method == "PUT":
        body = {"role": "DEVELOPER"}
    if method == "POST":
        body = {"name": "Docs portal"}
    return client.request(method, path.format(member=member), json=body)


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("GET", "/api/teams/acme/projects"),
        ("POST", "/api/teams/acme/projects"),
        *PROJECT_ENDPOINTS,
    ],
)
def test_projects_need_a_session(client: TestClient, method: str, path: str) -> None:
    body: dict[str, str] = {"name": "Marketing site", "role": "DEVELOPER"}
    response = client.request(method, path.format(member=uuid4()), json=body)

    assert response.status_code == 401


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("GET", "/api/teams/acme/projects"),
        ("POST", "/api/teams/acme/projects"),
        *PROJECT_ENDPOINTS,
    ],
)
def test_someone_not_in_the_team_finds_no_team(
    client: TestClient, session: Session, method: str, path: str
) -> None:
    acme = acme_with_marketing(client, session)
    sign_in_as(client, session, create_account(session, "Ava Turner"))

    response = call(client, method, path, acme.jonas.id)

    assert response.status_code == 404
    assert error(response) == "team_not_found"


@pytest.mark.parametrize(("method", "path"), PROJECT_ENDPOINTS)
def test_a_member_not_in_a_project_finds_no_project(
    client: TestClient, session: Session, method: str, path: str
) -> None:
    acme = acme_with_marketing(client, session)
    sign_in_as(client, session, acme.daniel)

    response = call(client, method, path, acme.jonas.id)

    # The same as for a project that doesn't exist, so that it doesn't tell which projects exist
    assert response.status_code == 404
    assert error(response) == "project_not_found"
    no_such_project = path.replace("marketing-site", "nowhere")
    assert error(call(client, method, no_such_project, acme.jonas.id)) == (
        "project_not_found"
    )


@pytest.mark.parametrize(("method", "path"), LEADS_ONLY_ENDPOINTS)
def test_a_developer_cannot_do_what_only_leads_do(
    client: TestClient, session: Session, method: str, path: str
) -> None:
    acme = acme_with_marketing(client, session)
    sign_in_as(client, session, acme.jonas)

    response = call(client, method, path, acme.sofia.id)

    assert response.status_code == 403
    assert error(response) == "leads_only"


@pytest.mark.parametrize("who", ["sofia", "mira"])
@pytest.mark.parametrize(
    ("method", "path", "status_code"),
    [
        ("PATCH", "/api/teams/acme/projects/marketing-site", 200),
        ("DELETE", "/api/teams/acme/projects/marketing-site", 204),
        ("PUT", "/api/teams/acme/projects/marketing-site/members/{member}", 200),
        ("DELETE", "/api/teams/acme/projects/marketing-site/members/{member}", 204),
    ],
)
def test_leads_and_owners_manage_a_project(
    client: TestClient,
    session: Session,
    who: str,
    method: str,
    path: str,
    status_code: int,
) -> None:
    acme = acme_with_marketing(client, session)
    # Sofia is its lead. Mira, the owner, isn't in it.
    sign_in_as(client, session, acme.sofia if who == "sofia" else acme.mira)

    response = call(client, method, path, acme.jonas.id)

    assert response.status_code == status_code


def test_a_member_cannot_create_projects(client: TestClient, session: Session) -> None:
    acme = acme_with_marketing(client, session)
    sign_in_as(client, session, acme.sofia)

    response = new_project(client, "Docs portal")

    assert response.status_code == 403
    assert error(response) == "owners_only"


def test_creating_a_project_makes_me_its_first_lead(
    client: TestClient, session: Session
) -> None:
    acme_with_marketing(client, session)

    response = new_project(client, " Маркетинг сайт 2! ", " Landing pages ")

    assert response.status_code == 201
    created = Project.model_validate_json(response.text)
    assert (created.name, created.url, created.description, created.role) == (
        "Маркетинг сайт 2!",
        "marketing-sayt-2",
        "Landing pages",
        ProjectRole.LEAD,
    )
    assert Project.model_validate_json(project_at(client, created.url).text) == created
    response = client.get("/api/teams/acme/projects/marketing-sayt-2/members")
    assert [
        (member.name, member.role)
        for member in project_members.validate_json(response.text)
    ] == [("Mira Kovalenko", ProjectRole.LEAD)]


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("name", "   "),
        ("name", "M" * 101),
        ("name", "!!!"),
        ("name", "Marketing\nsite"),
        ("name", "Marketing\x00site"),
        ("description", "d" * 501),
    ],
)
def test_creating_a_project_refuses_bad_input(
    client: TestClient, session: Session, field: str, value: str
) -> None:
    acme_with_marketing(client, session)
    body: dict[str, str] = {"name": "Docs portal", field: value}

    response = client.post("/api/teams/acme/projects", json=body)

    assert response.status_code == 422
    invalid = Invalid.model_validate_json(response.text)
    assert [problem.loc for problem in invalid.detail] == [["body", field]]


@pytest.mark.parametrize(
    "character",
    ["\x01", "\t", "\x1f", "\x7f", "\x85", "\x9f", " ", "‍", "­", "é"],
)
def test_the_api_refuses_the_characters_the_database_refuses(
    client: TestClient, session: Session, character: str
) -> None:
    acme_with_marketing(client, session)

    # In the middle, since the ends are stripped
    response = new_project(client, f"Docs{character}portal")

    # Not a 500 from the database's refusal
    refused = unicodedata.category(character) == "Cc"
    assert response.status_code == (422 if refused else 201)


@pytest.mark.parametrize("name", ["marketing SITE!", "New", "Settings", "members"])
def test_a_name_that_makes_a_taken_url_is_taken(
    client: TestClient, session: Session, name: str
) -> None:
    acme_with_marketing(client, session)

    response = new_project(client, name)

    assert response.status_code == 409
    assert error(response) == "name_taken"


def test_owners_see_every_project_and_members_see_their_own(
    client: TestClient, session: Session
) -> None:
    acme = acme_with_marketing(client, session)
    checkout = Project.model_validate_json(new_project(client, "Checkout flow").text)
    acme.marketing.edited_at = datetime.now(UTC) - timedelta(days=1)
    session.flush()

    response = client.get("/api/teams/acme/projects")

    assert response.status_code == 200
    # The most recently edited first
    mira_sees = listed_projects.validate_json(response.text)
    assert [(listed.url, listed.role) for listed in mira_sees] == [
        ("checkout-flow", ProjectRole.LEAD),
        ("marketing-site", None),
    ]
    assert mira_sees[0].id == checkout.id
    assert [member.name for member in mira_sees[1].members] == [
        "Sofia Reyes",
        "Jonas Lind",
    ]

    sign_in_as(client, session, acme.jonas)
    jonas_sees = listed_projects.validate_json(
        client.get("/api/teams/acme/projects").text
    )
    assert [(listed.url, listed.role) for listed in jonas_sees] == [
        ("marketing-site", ProjectRole.DEVELOPER)
    ]

    sign_in_as(client, session, acme.daniel)
    assert (
        listed_projects.validate_json(client.get("/api/teams/acme/projects").text) == []
    )


def test_opening_a_project_shows_my_role_in_it(
    client: TestClient, session: Session
) -> None:
    acme = acme_with_marketing(client, session)

    owner_sees = Project.model_validate_json(project_at(client, "marketing-site").text)
    sign_in_as(client, session, acme.jonas)
    developer_sees = Project.model_validate_json(
        project_at(client, "marketing-site").text
    )

    assert (owner_sees.name, owner_sees.role) == ("Marketing site", None)
    assert (developer_sees.name, developer_sees.role) == (
        "Marketing site",
        ProjectRole.DEVELOPER,
    )


def test_renaming_a_project_moves_it_to_a_new_url(
    client: TestClient, session: Session
) -> None:
    acme = acme_with_marketing(client, session)
    sign_in_as(client, session, acme.sofia)

    response = change(client, "marketing-site", name="Marketing pages")

    assert response.status_code == 200
    renamed = Project.model_validate_json(response.text)
    assert (renamed.name, renamed.url, renamed.role) == (
        "Marketing pages",
        "marketing-pages",
        ProjectRole.LEAD,
    )
    assert project_at(client, "marketing-pages").status_code == 200
    assert error(project_at(client, "marketing-site")) == "project_not_found"


def test_changing_only_the_description(client: TestClient, session: Session) -> None:
    acme_with_marketing(client, session)

    response = change(client, "marketing-site", description="For acme.com")

    changed = Project.model_validate_json(response.text)
    assert (changed.name, changed.url, changed.description) == (
        "Marketing site",
        "marketing-site",
        "For acme.com",
    )
    assert Project.model_validate_json(project_at(client, "marketing-site").text) == (
        changed
    )


def test_a_project_keeps_its_name_when_the_new_one_is_taken(
    client: TestClient, session: Session
) -> None:
    acme_with_marketing(client, session)
    new_project(client, "Checkout flow")

    response = change(
        client, "marketing-site", name="Checkout flow", description="For acme.com"
    )

    assert response.status_code == 409
    assert error(response) == "name_taken"
    unchanged = Project.model_validate_json(project_at(client, "marketing-site").text)
    assert (unchanged.name, unchanged.description) == ("Marketing site", "")


def test_deleting_a_project(client: TestClient, session: Session) -> None:
    acme = acme_with_marketing(client, session)
    sign_in_as(client, session, acme.sofia)

    response = client.delete("/api/teams/acme/projects/marketing-site")

    assert response.status_code == 204
    assert error(project_at(client, "marketing-site")) == "project_not_found"
    sign_in_as(client, session, acme.mira)
    assert (
        listed_projects.validate_json(client.get("/api/teams/acme/projects").text) == []
    )


def test_a_projects_members_are_in_the_order_they_were_added(
    client: TestClient, session: Session
) -> None:
    acme = acme_with_marketing(client, session)
    sign_in_as(client, session, acme.jonas)

    response = client.get("/api/teams/acme/projects/marketing-site/members")

    assert project_members.validate_json(response.text) == [
        ProjectMember(
            id=acme.sofia.id,
            name="Sofia Reyes",
            email="sofia@acme.dev",
            role=ProjectRole.LEAD,
        ),
        ProjectMember(
            id=acme.jonas.id,
            name="Jonas Lind",
            email="jonas@acme.dev",
            role=ProjectRole.DEVELOPER,
        ),
    ]


def test_adding_a_team_member_to_a_project_and_changing_their_role(
    client: TestClient, session: Session
) -> None:
    acme = acme_with_marketing(client, session)
    sign_in_as(client, session, acme.sofia)

    response = set_member(client, acme.daniel.id, "DEVELOPER")

    assert response.status_code == 200
    assert ProjectMember.model_validate_json(response.text) == ProjectMember(
        id=acme.daniel.id,
        name="Daniel Novak",
        email="daniel@acme.dev",
        role=ProjectRole.DEVELOPER,
    )
    sign_in_as(client, session, acme.daniel)
    assert change(client, "marketing-site", description="Mine").status_code == 403

    sign_in_as(client, session, acme.sofia)
    assert set_member(client, acme.daniel.id, "LEAD").status_code == 200
    sign_in_as(client, session, acme.daniel)
    assert change(client, "marketing-site", description="Mine").status_code == 200
    # In any order, since the test adds Jonas and Daniel in one transaction, at the same time
    assert set(members(client)) == {
        ("Sofia Reyes", ProjectRole.LEAD),
        ("Jonas Lind", ProjectRole.DEVELOPER),
        ("Daniel Novak", ProjectRole.LEAD),
    }


def test_only_team_members_can_be_added_to_a_project(
    client: TestClient, session: Session
) -> None:
    acme_with_marketing(client, session)
    ava = create_account(session, "Ava Turner")

    for account_id in [ava.id, uuid4()]:
        response = set_member(client, account_id, "DEVELOPER")

        assert response.status_code == 404
        assert error(response) == "member_not_found"


@pytest.mark.parametrize("role", ["OWNER", "lead", ""])
def test_a_project_role_is_lead_or_developer(
    client: TestClient, session: Session, role: str
) -> None:
    acme = acme_with_marketing(client, session)

    response = set_member(client, acme.daniel.id, role)

    assert response.status_code == 422
    invalid = Invalid.model_validate_json(response.text)
    assert [problem.loc for problem in invalid.detail] == [["body", "role"]]


def test_removing_a_member_from_a_project(client: TestClient, session: Session) -> None:
    acme = acme_with_marketing(client, session)
    path = f"/api/teams/acme/projects/marketing-site/members/{acme.jonas.id}"

    response = client.delete(path)

    assert response.status_code == 204
    assert members(client) == [("Sofia Reyes", ProjectRole.LEAD)]
    response = client.delete(path)
    assert response.status_code == 404
    assert error(response) == "member_not_found"
    sign_in_as(client, session, acme.jonas)
    assert error(project_at(client, "marketing-site")) == "project_not_found"


def test_leaving_a_project(client: TestClient, session: Session) -> None:
    acme = acme_with_marketing(client, session)
    leave = "/api/teams/acme/projects/marketing-site/membership"
    sign_in_as(client, session, acme.jonas)

    response = client.delete(leave)

    assert response.status_code == 204
    assert error(project_at(client, "marketing-site")) == "project_not_found"

    # An owner who isn't in it still manages it, and leaving it changes nothing
    sign_in_as(client, session, acme.mira)
    assert client.delete(leave).status_code == 204
    assert members(client) == [("Sofia Reyes", ProjectRole.LEAD)]


def test_the_only_lead_stays_until_someone_else_is_a_lead(
    client: TestClient, session: Session
) -> None:
    acme = acme_with_marketing(client, session)
    sofia = f"/api/teams/acme/projects/marketing-site/members/{acme.sofia.id}"
    leave = "/api/teams/acme/projects/marketing-site/membership"

    # Not even an owner takes the lead away
    for response in [
        set_member(client, acme.sofia.id, "DEVELOPER"),
        client.delete(sofia),
    ]:
        assert response.status_code == 409
        assert error(response) == "last_lead"
    sign_in_as(client, session, acme.sofia)
    response = client.delete(leave)
    assert response.status_code == 409
    assert error(response) == "last_lead"
    assert members(client) == [
        ("Sofia Reyes", ProjectRole.LEAD),
        ("Jonas Lind", ProjectRole.DEVELOPER),
    ]

    assert set_member(client, acme.jonas.id, "LEAD").status_code == 200
    assert client.delete(leave).status_code == 204
    sign_in_as(client, session, acme.jonas)
    assert members(client) == [("Jonas Lind", ProjectRole.LEAD)]


def test_leaving_the_team_takes_me_out_of_its_projects(
    client: TestClient, session: Session
) -> None:
    acme = acme_with_marketing(client, session)
    sign_in_as(client, session, acme.sofia)

    response = client.delete("/api/teams/acme/membership")

    assert response.status_code == 204
    sign_in_as(client, session, acme.mira)
    assert members(client) == [("Jonas Lind", ProjectRole.DEVELOPER)]
