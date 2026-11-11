"""Signing up, in and out."""

from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, HTTPException, Response, status
from pydantic import BaseModel, EmailStr, Field, StringConstraints

from compono import auth
from compono.api.dependencies import (
    SESSION_COOKIE,
    Database,
    NotSignedInError,
    SessionToken,
    SignedIn,
)

router = APIRouter()


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


@router.post(
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


@router.post(
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


@router.delete(
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


@router.delete(
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


@router.get(
    "/api/account",
    responses={status.HTTP_401_UNAUTHORIZED: {"model": NotSignedInError}},
)
def current_account(account: SignedIn) -> Account:
    """The signed-in account."""
    return Account.model_validate(account, from_attributes=True)
