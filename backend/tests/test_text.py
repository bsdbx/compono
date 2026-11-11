"""Tests that no text a request sends reaches the database with a NUL character.

PostgreSQL can neither store nor look up text with a NUL, so it would answer 500. These
tests read every endpoint from the API's description, so a new endpoint is checked too.
"""

from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from compono import auth, components, projects, teams
from compono.app import app

PASSWORD = "correct horse battery staple"
NUL = "\x00"


# Passwords are only hashed, never stored or looked up as text
NOT_STORED = {"password"}


# The parts of the API's OpenAPI description that the tests read
class Schema(BaseModel):
    ref: str | None = Field(default=None, alias="$ref")
    type: str | None = None
    any_of: list[Schema] = Field(default=[], alias="anyOf")
    properties: dict[str, Schema] = {}


class Parameter(BaseModel):
    name: str
    where: str = Field(alias="in")
    schema_: Schema = Field(alias="schema")


class Content(BaseModel):
    schema_: Schema = Field(alias="schema")


class RequestBody(BaseModel):
    content: dict[str, Content]


class Operation(BaseModel):
    parameters: list[Parameter] = []
    request_body: RequestBody | None = Field(default=None, alias="requestBody")


class Components(BaseModel):
    schemas: dict[str, Schema]


class Description(BaseModel):
    paths: dict[str, dict[str, Operation]]
    components: Components


DESCRIPTION = Description.model_validate_json(
    TestClient(app).get("/api/openapi.json").text
)


def resolved(schema: Schema) -> Schema:
    if schema.ref is None:
        return schema
    return DESCRIPTION.components.schemas[schema.ref.rsplit("/", 1)[1]]


def is_text(schema: Schema) -> bool:
    """Whether a value of the schema can be text, also when it's optional."""
    schema = resolved(schema)
    return schema.type == "string" or any(is_text(option) for option in schema.any_of)


def operations() -> list[tuple[str, str, Operation]]:
    return [
        (method.upper(), path, operation)
        for path, item in DESCRIPTION.paths.items()
        for method, operation in item.items()
    ]


def text_in_paths() -> list[tuple[str, str, str]]:
    return [
        (method, path, parameter.name)
        for method, path, operation in operations()
        for parameter in operation.parameters
        if parameter.where == "path" and is_text(parameter.schema_)
    ]


def text_in_bodies() -> list[tuple[str, str, str]]:
    return [
        (method, path, field)
        for method, path, operation in operations()
        if operation.request_body is not None
        for content in operation.request_body.content.values()
        for field, schema in resolved(content.schema_).properties.items()
        if is_text(schema) and field not in NOT_STORED
    ]


class InvalidField(BaseModel):
    loc: list[str | int]


class Invalid(BaseModel):
    detail: list[InvalidField]


def signed_in_to_acme(client: TestClient, session: Session) -> dict[str, str]:
    """Mira, signed in, owns Acme with its project Marketing site and its component. Returns a value for each path parameter that gets a request as far as checking its text."""
    mira = auth.create_account(session, "Mira Kovalenko", "mira@acme.dev", PASSWORD)
    acme = teams.create_team(session, mira, "Acme", "acme")
    project = projects.create_project(session, acme, mira, "Marketing site", "")
    card = components.create_component(session, project, "PricingCard")
    client.cookies["session"] = auth.sign_in(session, mira)
    return {
        "team_url": "acme",
        "project_url": "marketing-site",
        "account_id": str(uuid4()),
        "token": "made-up",
        "component_id": str(card.id),
    }


def test_the_api_has_text_in_paths_and_bodies() -> None:
    # So that the tests below can't pass by finding nothing
    assert len(text_in_paths()) >= 20
    assert len(text_in_bodies()) >= 10


@pytest.mark.parametrize(("method", "path", "parameter"), text_in_paths())
def test_a_nul_in_a_path_is_refused(
    client: TestClient, session: Session, method: str, path: str, parameter: str
) -> None:
    values = {**signed_in_to_acme(client, session), parameter: "a%00b"}
    body: dict[str, str] = {}

    response = client.request(method, path.format(**values), json=body)

    assert response.status_code == 422
    invalid = Invalid.model_validate_json(response.text)
    assert ["path", parameter] in [problem.loc for problem in invalid.detail]


@pytest.mark.parametrize(("method", "path", "field"), text_in_bodies())
def test_a_nul_in_a_body_is_refused(
    client: TestClient, session: Session, method: str, path: str, field: str
) -> None:
    values = signed_in_to_acme(client, session)
    body: dict[str, str] = {field: f"a{NUL}b"}

    response = client.request(method, path.format(**values), json=body)

    assert response.status_code == 422
    invalid = Invalid.model_validate_json(response.text)
    assert ["body", field] in [problem.loc for problem in invalid.detail]
