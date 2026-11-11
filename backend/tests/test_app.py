"""API Tests."""

from fastapi.testclient import TestClient
from pydantic import BaseModel

from compono.api.health import Health


class InvalidField(BaseModel):
    loc: list[str | int]


class Invalid(BaseModel):
    detail: list[InvalidField]


def test_health_reaches_the_database(client: TestClient) -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    assert Health.model_validate_json(response.text) == Health(status="ok")


def test_an_invalid_request_is_answered_without_what_it_sent(
    client: TestClient,
) -> None:
    # NaN isn't JSON, but Python's JSON parser reads it, and can't write it back
    body = '{"name": NaN, "email": "mira@acme.dev", "password": "correct horse battery staple"}'

    response = client.post(
        "/api/accounts", content=body, headers={"content-type": "application/json"}
    )

    assert response.status_code == 422
    invalid = Invalid.model_validate_json(response.text)
    assert [problem.loc for problem in invalid.detail] == [["body", "name"]]
    assert '"input"' not in response.text
