"""Tests of signing up, in and out through the API."""

from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from httpx2 import Response
from pydantic import BaseModel
from sqlalchemy import update
from sqlalchemy.orm import Session

from compono import auth, models
from compono.app import Account, app

PASSWORD = "correct horse battery staple"


class Error(BaseModel):
    detail: str


class InvalidField(BaseModel):
    loc: list[str | int]


class Invalid(BaseModel):
    detail: list[InvalidField]


def sign_up(client: TestClient, **changes: str) -> Response:
    """Signs Mira up, with any of her name, email or password changed."""
    body: dict[str, str] = {
        "name": "Mira Kovalenko",
        "email": "mira@acme.dev",
        "password": PASSWORD,
        **changes,
    }
    return client.post("/api/accounts", json=body)


def sign_in(
    client: TestClient, email: str = "mira@acme.dev", password: str = PASSWORD
) -> Response:
    body: dict[str, str] = {"email": email, "password": password}
    return client.post("/api/sessions", json=body)


def account(response: Response) -> Account:
    return Account.model_validate_json(response.text)


def error(response: Response) -> str:
    return Error.model_validate_json(response.text).detail


def test_signing_up_signs_the_new_account_in(client: TestClient) -> None:
    response = sign_up(client, name=" Mira Kovalenko ", email="Mira@Acme.dev")

    assert response.status_code == 201
    created = account(response)
    assert created.name == "Mira Kovalenko"
    assert created.email == "mira@acme.dev"
    assert account(client.get("/api/account")) == created


def test_the_session_cookie_is_out_of_reach_of_scripts_and_other_sites(
    client: TestClient,
) -> None:
    response = sign_up(client)

    attributes = response.headers["set-cookie"].lower().split("; ")
    for attribute in [
        "httponly",
        "secure",
        "samesite=lax",
        "path=/",
        "max-age=2592000",
    ]:
        assert attribute in attributes


def test_an_email_can_sign_up_once(client: TestClient) -> None:
    sign_up(client)

    response = sign_up(client, name="Someone Else", email="MIRA@acme.dev")

    assert response.status_code == 409
    assert error(response) == "email_taken"


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("name", "   "),
        ("name", "M" * 101),
        ("email", "mira"),
        ("email", "mira@"),
        ("password", "short"),
        ("password", "p" * 129),
    ],
)
def test_signing_up_refuses_bad_input(
    client: TestClient, field: str, value: str
) -> None:
    response = sign_up(client, **{field: value})

    assert response.status_code == 422
    invalid = Invalid.model_validate_json(response.text)
    assert [problem.loc for problem in invalid.detail] == [["body", field]]
    assert "set-cookie" not in response.headers


def test_signing_in_with_the_right_password(client: TestClient) -> None:
    sign_up(client)
    client.cookies.clear()

    response = sign_in(client, email=" MIRA@acme.dev")

    assert response.status_code == 201
    assert account(response).email == "mira@acme.dev"
    assert account(client.get("/api/account")).email == "mira@acme.dev"


@pytest.mark.parametrize(
    ("email", "password"),
    [
        ("mira@acme.dev", "wrong password"),
        ("nobody@acme.dev", PASSWORD),
        ("mira", PASSWORD),
    ],
)
def test_signing_in_with_a_wrong_email_or_password(
    client: TestClient, email: str, password: str
) -> None:
    sign_up(client)
    client.cookies.clear()

    response = sign_in(client, email, password)

    # The same answer for each, so that it doesn't tell whether the email has an account
    assert response.status_code == 401
    assert error(response) == "wrong_email_or_password"
    assert "set-cookie" not in response.headers


def test_no_cookie_is_no_session(client: TestClient) -> None:
    response = client.get("/api/account")

    assert response.status_code == 401
    assert error(response) == "no_session"


def test_signing_out_ends_the_session(client: TestClient) -> None:
    sign_up(client)
    token = client.cookies["session"]

    response = client.delete("/api/sessions/current")

    assert response.status_code == 204
    assert "session" not in client.cookies
    # Even sent again, the old cookie signs nobody in
    client.cookies["session"] = token
    response = client.get("/api/account")
    assert response.status_code == 401
    assert error(response) == "signed_out"


def test_signing_out_when_signed_out_already(client: TestClient) -> None:
    response = client.delete("/api/sessions/current")

    assert response.status_code == 204


def test_signing_out_everywhere_signs_out_other_browsers(client: TestClient) -> None:
    sign_up(client)
    with TestClient(app, base_url="https://testserver") as other_browser:
        sign_in(other_browser)

        response = client.delete("/api/sessions")

        assert response.status_code == 204
        assert "session" not in client.cookies
        # What shows "You were signed out from another device"
        response = other_browser.get("/api/account")
        assert response.status_code == 401
        assert error(response) == "signed_out"


def test_signing_out_everywhere_needs_a_session(client: TestClient) -> None:
    response = client.delete("/api/sessions")

    assert response.status_code == 401
    assert error(response) == "no_session"


def test_an_expired_session_signs_nobody_in(
    client: TestClient, session: Session
) -> None:
    sign_up(client)
    session.execute(
        update(models.Session).values(
            created_at=datetime.now(UTC) - auth.SESSION_LIFETIME - timedelta(seconds=2),
            expires_at=datetime.now(UTC) - timedelta(seconds=1),
        )
    )

    response = client.get("/api/account")

    assert response.status_code == 401
    assert error(response) == "expired"


def test_a_body_must_say_it_is_json(client: TestClient) -> None:
    # A form on another site can send text/plain, but not JSON, so it can't sign anyone up or in
    response = client.post(
        "/api/sessions",
        content='{"email": "mira@acme.dev", "password": "correct horse battery staple"}',
        headers={"content-type": "text/plain"},
    )

    assert response.status_code == 422
