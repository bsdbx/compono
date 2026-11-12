"""Tests of components through the API."""

from datetime import UTC, datetime, timedelta
from typing import NamedTuple
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from httpx2 import Response
from pydantic import BaseModel, TypeAdapter
from sqlalchemy import delete
from sqlalchemy.orm import Session

from compono import auth, components, models, projects, teams
from compono.api.components import MAX_GRAPH_BYTES, Component, ListedComponent, Saved
from compono.api.projects import Project
from compono.models import ProjectRole, TeamRole
from compono.nodes.component import new_graph

PASSWORD = "correct horse battery staple"
COMPONENTS = "/api/teams/acme/projects/marketing-site/components"
GRAPH: dict[str, object] = {"nodes": [{"id": "output", "type": "component-output"}]}
SIZES: list[dict[str, object]] = [{"name": "Wide", "width": 1440}]

listed_components = TypeAdapter(list[ListedComponent])


class Error(BaseModel):
    detail: str


class InvalidField(BaseModel):
    loc: list[str | int]


class Invalid(BaseModel):
    detail: list[InvalidField]


def error(response: Response) -> str:
    return Error.model_validate_json(response.text).detail


def invalid(response: Response) -> list[list[str | int]]:
    assert response.status_code == 422
    return [
        problem.loc for problem in Invalid.model_validate_json(response.text).detail
    ]


def sign_in_as(client: TestClient, session: Session, account: models.Account) -> None:
    client.cookies.clear()
    client.cookies["session"] = auth.sign_in(session, account)


def create_account(session: Session, name: str) -> models.Account:
    email = f"{name.split()[0].lower()}@acme.dev"
    return auth.create_account(session, name, email, PASSWORD)


class Acme(NamedTuple):
    # The owner, who isn't in Marketing site
    mira: models.Account
    # Marketing site's developer
    jonas: models.Account
    # A member in no project
    daniel: models.Account
    marketing: models.Project
    card: models.Component


def acme(client: TestClient, session: Session) -> Acme:
    """Acme's Marketing site, with the component PricingCard. The client is signed in as Jonas, its developer."""
    mira = create_account(session, "Mira Kovalenko")
    team = teams.create_team(session, mira, "Acme", "acme")
    jonas = create_account(session, "Jonas Lind")
    daniel = create_account(session, "Daniel Novak")
    for member in [jonas, daniel]:
        session.add(
            models.TeamMember(
                team_id=team.id, account_id=member.id, role=TeamRole.MEMBER
            )
        )
    marketing = projects.create_project(session, team, mira, "Marketing site", "")
    projects.set_member(session, marketing, jonas.id, ProjectRole.DEVELOPER)
    # Mira steps out, which leaves no lead, as when the last lead leaves the team
    session.execute(
        delete(models.ProjectMember).where(models.ProjectMember.account_id == mira.id)
    )
    card = components.create_component(session, marketing, "PricingCard")
    sign_in_as(client, session, jonas)
    return Acme(mira, jonas, daniel, marketing, card)


def content(
    version: int, graph: object = GRAPH, sizes: object = SIZES
) -> dict[str, object]:
    return {"version": version, "graph": graph, "screen_sizes": sizes}


def save(client: TestClient, card: UUID, body: dict[str, object]) -> Response:
    return client.put(f"{COMPONENTS}/{card}/content", json=body)


def new_component(client: TestClient, name: str | None = None) -> Response:
    body: dict[str, str] = {} if name is None else {"name": name}
    return client.post(COMPONENTS, json=body)


# Every endpoint of components. {card} is a component's id.
COMPONENT_ENDPOINTS = [
    ("GET", COMPONENTS),
    ("POST", COMPONENTS),
    ("GET", f"{COMPONENTS}/{{card}}"),
    ("PATCH", f"{COMPONENTS}/{{card}}"),
    ("PUT", f"{COMPONENTS}/{{card}}/content"),
    ("POST", f"{COMPONENTS}/{{card}}/copies"),
    ("DELETE", f"{COMPONENTS}/{{card}}"),
]

# What each endpoint answers when the request is fine
SUCCESS = {"GET": 200, "PATCH": 200, "PUT": 200, "DELETE": 204}


def call(client: TestClient, method: str, path: str, card: UUID) -> Response:
    body: dict[str, object] | None = None
    if method == "PATCH":
        body = {"name": "Card"}
    if method == "PUT":
        body = content(1)
    if path == COMPONENTS and method == "POST":
        body = {}
    return client.request(method, path.format(card=card), json=body)


@pytest.mark.parametrize(("method", "path"), COMPONENT_ENDPOINTS)
def test_components_need_a_session(client: TestClient, method: str, path: str) -> None:
    response = call(client, method, path, uuid4())

    assert response.status_code == 401


@pytest.mark.parametrize(("method", "path"), COMPONENT_ENDPOINTS)
def test_someone_not_in_the_project_finds_no_project(
    client: TestClient, session: Session, method: str, path: str
) -> None:
    acme_ = acme(client, session)
    sign_in_as(client, session, acme_.daniel)

    response = call(client, method, path, acme_.card.id)

    assert response.status_code == 404
    assert error(response) == "project_not_found"
    sign_in_as(client, session, create_account(session, "Ava Turner"))
    assert error(call(client, method, path, acme_.card.id)) == "team_not_found"


@pytest.mark.parametrize("who", ["jonas", "mira"])
@pytest.mark.parametrize(("method", "path"), COMPONENT_ENDPOINTS)
def test_developers_and_owners_build_components(
    client: TestClient, session: Session, who: str, method: str, path: str
) -> None:
    acme_ = acme(client, session)
    # Jonas is a developer. Mira, the owner, isn't in the project.
    sign_in_as(client, session, acme_.jonas if who == "jonas" else acme_.mira)

    response = call(client, method, path, acme_.card.id)

    expected = 201 if method == "POST" else SUCCESS[method]
    assert response.status_code == expected


@pytest.mark.parametrize(
    ("method", "path"), [entry for entry in COMPONENT_ENDPOINTS if "{card}" in entry[1]]
)
def test_only_the_projects_components_are_found(
    client: TestClient, session: Session, method: str, path: str
) -> None:
    acme_ = acme(client, session)
    team = session.get_one(models.Team, acme_.marketing.team_id)
    other = projects.create_project(session, team, acme_.mira, "Checkout flow", "")
    elsewhere = components.create_component(session, other, "Cart")

    for card in [elsewhere.id, uuid4()]:
        response = call(client, method, path, card)

        assert response.status_code == 404
        assert error(response) == "component_not_found"


def test_a_new_component_is_untitled(client: TestClient, session: Session) -> None:
    acme(client, session)

    first = new_component(client)
    second = new_component(client)

    assert first.status_code == 201
    created = Component.model_validate_json(first.text)
    assert (created.name, created.graph, created.version) == (
        "Untitled",
        new_graph(),
        1,
    )
    assert [(size.name, size.width) for size in created.screen_sizes] == [
        ("Desktop", 1280),
        ("Tablet", 768),
        ("Mobile", 390),
    ]
    assert Component.model_validate_json(second.text).name == "Untitled2"


def test_creating_a_named_component(client: TestClient, session: Session) -> None:
    acme(client, session)

    response = new_component(client, "NavBar")

    assert response.status_code == 201
    assert Component.model_validate_json(response.text).name == "NavBar"


@pytest.mark.parametrize("name", ["", "navBar", "Nav Bar", "1Nav", "Nav-Bar", "N" * 65])
def test_a_component_name_is_a_capital_then_letters_and_digits(
    client: TestClient, session: Session, name: str
) -> None:
    acme(client, session)

    assert invalid(new_component(client, name)) == [["body", "name"]]


def test_a_name_is_unique_in_a_project_ignoring_case(
    client: TestClient, session: Session
) -> None:
    acme(client, session)

    response = new_component(client, "PRICINGCARD")

    assert response.status_code == 409
    assert error(response) == "name_taken"


def test_the_list_has_no_graphs_and_is_in_the_order_of_creation(
    client: TestClient, session: Session
) -> None:
    acme_ = acme(client, session)
    navbar = components.create_component(session, acme_.marketing, "NavBar")
    navbar.created_at = acme_.card.created_at + timedelta(minutes=1)
    session.flush()

    response = client.get(COMPONENTS)

    assert response.status_code == 200
    assert [
        listed.name for listed in listed_components.validate_json(response.text)
    ] == [
        "PricingCard",
        "NavBar",
    ]
    assert "graph" not in response.text


def test_renaming_a_component(client: TestClient, session: Session) -> None:
    acme_ = acme(client, session)
    new_component(client, "NavBar")
    path = f"{COMPONENTS}/{acme_.card.id}"
    body: dict[str, str] = {"name": "Card"}

    response = client.patch(path, json=body)

    assert response.status_code == 200
    assert ListedComponent.model_validate_json(response.text).name == "Card"
    taken: dict[str, str] = {"name": "Navbar"}
    response = client.patch(path, json=taken)
    assert response.status_code == 409
    assert error(response) == "name_taken"
    assert Component.model_validate_json(client.get(path).text).name == "Card"


def test_saving_and_opening_a_component(client: TestClient, session: Session) -> None:
    acme_ = acme(client, session)

    response = save(client, acme_.card.id, content(1))

    assert response.status_code == 200
    saved = Saved.model_validate_json(response.text)
    assert saved.version == 2
    opened = Component.model_validate_json(
        client.get(f"{COMPONENTS}/{acme_.card.id}").text
    )
    assert (opened.graph, opened.version, opened.updated_at) == (
        GRAPH,
        2,
        saved.updated_at,
    )
    assert [(size.name, size.width) for size in opened.screen_sizes] == [("Wide", 1440)]
    # The next save starts from the new version
    assert (
        Saved.model_validate_json(save(client, acme_.card.id, content(2)).text).version
        == 3
    )


def test_a_save_from_an_old_version_is_a_conflict(
    client: TestClient, session: Session
) -> None:
    acme_ = acme(client, session)
    save(client, acme_.card.id, content(1))

    response = save(client, acme_.card.id, content(1, {"nodes": []}))

    assert response.status_code == 409
    assert error(response) == "version_conflict"
    opened = Component.model_validate_json(
        client.get(f"{COMPONENTS}/{acme_.card.id}").text
    )
    assert (opened.graph, opened.version) == (GRAPH, 2)


def test_saving_moves_the_projects_edited_at(
    client: TestClient, session: Session
) -> None:
    acme_ = acme(client, session)
    yesterday = datetime.now(UTC) - timedelta(days=1)
    acme_.marketing.edited_at = yesterday
    session.flush()

    save(client, acme_.card.id, content(1))

    project = Project.model_validate_json(
        client.get("/api/teams/acme/projects/marketing-site").text
    )
    assert project.edited_at > yesterday


@pytest.mark.parametrize(
    ("graph", "reason"),
    [
        ({"text": "a\x00b"}, "NUL in text"),
        ({"a\x00b": 1}, "NUL in a key"),
        ({"nodes": [{"label": "\x00"}]}, "NUL deep inside"),
        ({"blob": "x" * MAX_GRAPH_BYTES}, "too large"),
        ([], "not an object"),
    ],
)
def test_a_graph_that_cannot_be_stored_is_refused(
    client: TestClient, session: Session, graph: object, reason: str
) -> None:
    acme_ = acme(client, session)

    assert invalid(save(client, acme_.card.id, content(1, graph))) == [
        ["body", "graph"]
    ], reason


@pytest.mark.parametrize("number", ["NaN", "Infinity", "-Infinity"])
def test_a_graph_with_a_number_json_does_not_have_is_refused(
    client: TestClient, session: Session, number: str
) -> None:
    acme_ = acme(client, session)
    # Python's JSON parser reads these, but PostgreSQL's JSONB has no such numbers
    raw = f'{{"version": 1, "graph": {{"x": {number}}}, "screen_sizes": [{{"name": "Wide", "width": 1440}}]}}'

    response = client.put(
        f"{COMPONENTS}/{acme_.card.id}/content",
        content=raw,
        headers={"content-type": "application/json"},
    )

    assert invalid(response) == [["body", "graph"]]


def test_a_graph_just_under_the_limit_is_saved(
    client: TestClient, session: Session
) -> None:
    acme_ = acme(client, session)
    # {"blob":"…"} is 11 characters around the text
    graph: dict[str, object] = {"blob": "x" * (MAX_GRAPH_BYTES - 11)}

    assert save(client, acme_.card.id, content(1, graph)).status_code == 200


@pytest.mark.parametrize(
    ("sizes", "loc"),
    [
        ([], ["body", "screen_sizes"]),
        (
            [{"name": f"Size{n}", "width": 400 + n} for n in range(11)],
            ["body", "screen_sizes"],
        ),
        (
            [{"name": "Wide", "width": 1440}, {"name": "wide", "width": 1600}],
            ["body", "screen_sizes"],
        ),
        ([{"name": "Tiny", "width": 199}], ["body", "screen_sizes", 0, "width"]),
        ([{"name": "Huge", "width": 3841}], ["body", "screen_sizes", 0, "width"]),
        ([{"name": "  ", "width": 800}], ["body", "screen_sizes", 0, "name"]),
        ([{"name": "Wi\x00de", "width": 800}], ["body", "screen_sizes", 0, "name"]),
    ],
)
def test_bad_screen_sizes_are_refused(
    client: TestClient, session: Session, sizes: object, loc: list[str | int]
) -> None:
    acme_ = acme(client, session)

    assert invalid(save(client, acme_.card.id, content(1, GRAPH, sizes))) == [loc]


def test_a_save_needs_a_version(client: TestClient, session: Session) -> None:
    acme_ = acme(client, session)

    assert invalid(save(client, acme_.card.id, content(0))) == [["body", "version"]]


def test_duplicating_a_component(client: TestClient, session: Session) -> None:
    acme_ = acme(client, session)
    save(client, acme_.card.id, content(1))

    response = client.post(f"{COMPONENTS}/{acme_.card.id}/copies")

    assert response.status_code == 201
    copy = Component.model_validate_json(response.text)
    assert (copy.name, copy.graph, copy.version) == ("PricingCardCopy", GRAPH, 1)
    assert copy.id != acme_.card.id


def test_deleting_a_component(client: TestClient, session: Session) -> None:
    acme_ = acme(client, session)
    path = f"{COMPONENTS}/{acme_.card.id}"

    response = client.delete(path)

    assert response.status_code == 204
    assert error(client.get(path)) == "component_not_found"
    assert listed_components.validate_json(client.get(COMPONENTS).text) == []
