"""What the endpoints get from each request: its database session and its signed-in account."""

from collections.abc import Iterator
from typing import Annotated, Final

from fastapi import Depends, HTTPException, status
from fastapi.security import APIKeyCookie
from pydantic import BaseModel
from sqlalchemy.orm import Session

from compono import auth, models
from compono.database import sessions


def database() -> Iterator[Session]:
    """A session for one request."""
    with sessions() as session:
        yield session


type Database = Annotated[Session, Depends(database)]


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
