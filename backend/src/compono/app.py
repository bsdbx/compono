"""HTTP API at /api."""

import json
from collections.abc import Iterator
from typing import Annotated, Final, Literal
from uuid import UUID

from fastapi import Depends, FastAPI, HTTPException, Response, status
from fastapi.routing import APIRoute
from fastapi.security import APIKeyCookie
from pydantic import BaseModel, EmailStr, Field, StringConstraints
from sqlalchemy import literal, select
from sqlalchemy.orm import Session

from compono import auth, models
from compono.database import sessions


def operation_id(route: APIRoute) -> str:
    """Names each operation after its function."""
    return route.name


app = FastAPI(
    title="Compono",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
    redoc_url=None,
    generate_unique_id_function=operation_id,
)


def database() -> Iterator[Session]:
    """A session for one request."""
    with sessions() as session:
        yield session


type Database = Annotated[Session, Depends(database)]


class Health(BaseModel):
    status: str


@app.get("/api/health")
def health(session: Database) -> Health:
    """Whether the API runs and reaches the database."""
    session.scalar(select(literal(1)))
    return Health(status="ok")


# Session cookie name
SESSION_COOKIE: Final[str] = "session"

# Get a session token, return None if not found
session_cookie = APIKeyCookie(name=SESSION_COOKIE, auto_error=False)

# A session token is either a string or None.
type SessionToken = Annotated[str | None, Depends(session_cookie)]


class NotSignedInError(BaseModel):
    """Error wrapper."""

    detail: auth.Reason


def signed_in_account(database: Database, token: SessionToken) -> models.Account:
    """The account of the request's session."""
    # Check if there is a token, via `session_cookie`, due to dependency injection
    if token is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, auth.Reason.NO_SESSION)

    try:
        # Get an account if a session bound to an account with a supplied token exists
        return auth.signed_in_account(database, token)
    except auth.NotSignedIn as error:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, error.reason) from error


# A signed in account type, depends on `signed_in_account`
type SignedIn = Annotated[models.Account, Depends(signed_in_account)]


def set_session_cookie(response: Response, token: str) -> None:
    """Keeps the token in the browser, out of reach of the page's scripts."""

    # Set a cookie
    response.set_cookie(
        SESSION_COOKIE,  # Cookie name
        token,  # URL Safe token
        max_age=int(auth.SESSION_LIFETIME.total_seconds()),  # Token age
        path="/",  # Cookie is available on every page `/*`
        secure=True,  # Force the client to send the cookie using HTTPS
        httponly=True,  # Block JS `document.cookie` from modifying the cookie
        samesite="lax",  # Block CSRF requests
    )


def delete_session_cookie(response: Response) -> None:
    """Deletes the token from the browser."""

    # Delete a cookie
    response.delete_cookie(
        SESSION_COOKIE,  # Cookie name
        path="/",  # Delete the cookie for every page, `/*`
        secure=True,  # Force HTTPS
        httponly=True,  # Block JS `document.cookie` from modifying the cookie
        samesite="lax",  # Block CSRF request
    )


class Account(BaseModel):
    """Account model."""

    id: UUID
    name: str
    email: str


class SignUp(BaseModel):
    """Sign up model."""

    # A stripped name must be of length between 1 and 100
    name: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)
    ]
    # Pydantic EmailStr handles email verification on its own
    email: EmailStr
    # Password must be of length between 8 and 128
    password: Annotated[str, Field(min_length=8, max_length=128)]


class EmailTakenError(BaseModel):
    detail: Literal["email_taken"]


@app.post(
    "/api/accounts",
    status_code=status.HTTP_201_CREATED,
    responses={status.HTTP_409_CONFLICT: {"model": EmailTakenError}},
)
def sign_up(body: SignUp, database: Database, response: Response) -> Account:
    """Creates an account and signs it in."""

    # Create the account, if it doesn't exist yet
    try:
        account = auth.create_account(database, body.name, body.email, body.password)
    except auth.EmailTaken as error:
        raise HTTPException(status.HTTP_409_CONFLICT, "email_taken") from error

    # Create a login session
    token = auth.sign_in(database, account)

    # Make sure that the supplied account matches the Pydantic model
    created = Account.model_validate(account, from_attributes=True)

    # Update the DB
    database.commit()

    # Set the cookie
    set_session_cookie(response, token)

    return created


class SignIn(BaseModel):
    """Sign in model."""

    # Email is a string of length at most 254
    email: Annotated[str, Field(max_length=254)]

    # Password is a string of length at most 128
    password: Annotated[str, Field(max_length=128)]


class WrongEmailOrPasswordError(BaseModel):
    detail: Literal["wrong_email_or_password"]


@app.post(
    "/api/sessions",
    status_code=status.HTTP_201_CREATED,
    responses={status.HTTP_401_UNAUTHORIZED: {"model": WrongEmailOrPasswordError}},
)
def sign_in(body: SignIn, database: Database, response: Response) -> Account:
    """Signs an account in with its email and password."""

    # Get an account from the DB
    account = auth.check_password(database, body.email, body.password)
    if account is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "wrong_email_or_password")

    # Create a login session
    token = auth.sign_in(database, account)

    # Make sure that the supplied account matches the Pydantic model
    signed_in = Account.model_validate(account, from_attributes=True)

    # Update the DB
    database.commit()

    # Set the cookie
    set_session_cookie(response, token)

    return signed_in


@app.delete(
    "/api/sessions/current",
    status_code=status.HTTP_204_NO_CONTENT,
)
def sign_out(database: Database, token: SessionToken, response: Response) -> None:
    """Signs this browser out."""

    # If token exists - sign out the browser and update the DB
    if token is not None:
        auth.sign_out(database, token)
        database.commit()

    # Delete the session cookie
    delete_session_cookie(response)


@app.delete(
    "/api/sessions",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={status.HTTP_401_UNAUTHORIZED: {"model": NotSignedInError}},
)
def sign_out_everywhere(
    account: SignedIn, database: Database, response: Response
) -> None:
    """Signs the account out in every browser."""
    auth.sign_out_everywhere(database, account)
    database.commit()
    delete_session_cookie(response)


@app.get(
    "/api/account",
    responses={status.HTTP_401_UNAUTHORIZED: {"model": NotSignedInError}},
)
def current_account(account: SignedIn) -> Account:
    """The signed-in account."""
    return Account.model_validate(account, from_attributes=True)


def print_openapi() -> None:
    """Prints the API's OpenAPI description."""
    print(json.dumps(app.openapi(), indent=2))
