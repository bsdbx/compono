"""Accounts, passwords and sessions."""

import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from enum import StrEnum
from typing import Final

from pwdlib import PasswordHash
from sqlalchemy import orm, select, update
from sqlalchemy.exc import IntegrityError

from compono.models import Account, Session

# How long a sign-in lasts
SESSION_LIFETIME: Final = timedelta(days=30)

# Recommended hashing settings, typically Argon2
passwords: Final = PasswordHash.recommended()


class EmailTaken(Exception):
    """There is already an account with this email."""


class Reason(StrEnum):
    """Why a token signs nobody in."""

    NO_SESSION = "no_session"
    SIGNED_OUT = "signed_out"
    EXPIRED = "expired"


class NotSignedIn(Exception):
    """A token that signs nobody in."""

    def __init__(self, reason: Reason) -> None:
        super().__init__(reason)
        self.reason = reason


def normalize_email(email: str) -> str:
    """Trimmed and lowercased email."""
    return email.strip().lower()


def create_account(
    database: orm.Session, name: str, email: str, password: str
) -> Account:
    """A new account. Raises EmailTaken."""
    # Creating an account, with normalized email, stripped name and a pwd hash
    account = Account(
        email=normalize_email(email),
        name=name.strip(),
        password_hash=passwords.hash(password),
    )

    try:
        # Creating a SAVEPOINT inside the current transaction
        # A failing flush to the DB (`database.add(account)`) doesn't roll back the whole session
        with database.begin_nested():
            database.add(account)
    except IntegrityError as error:
        # If an account with supplied email already exists
        if "uq_accounts_email" in str(error.orig):
            raise EmailTaken from error

        # In any other case, raise whatever `IntegrityError` was caught
        raise

    return account


def check_password(database: orm.Session, email: str, password: str) -> Account | None:
    """The account with this email and password, or None if there is none."""
    # Get an account from the accounts table, such that there is an account with such email
    account = database.scalar(
        select(Account).where(Account.email == normalize_email(email))
    )
    # If there is no account returning None, and deliberately doing a slow hash preventing any attacks
    if account is None:
        passwords.hash(password)
        return None

    # Hash the supplied password and check whether it matches the one in the DB.
    # If recommended settings have changed, updated_hash is not None, and the supplied password is also hashed that way.
    valid, updated_hash = passwords.verify_and_update(password, account.password_hash)
    if not valid:
        return None

    # Updating the hash if the recommended settings have changed
    if updated_hash is not None:
        account.password_hash = updated_hash

    return account


def hash_token(token: str) -> bytes:
    """Hashing the token."""
    # Generates a sha256 hashed token and returning it as bytes
    return hashlib.sha256(token.encode()).digest()


def sign_in(database: orm.Session, account: Account) -> str:
    """Starts a session."""
    # Generating a hashed token with random bytes
    token = secrets.token_urlsafe(16)

    # Adding a session, that expires in SESSION_LIFETIME
    database.add(
        Session(
            account_id=account.id,
            token_hash=hash_token(token),
            expires_at=datetime.now(UTC) + SESSION_LIFETIME,
        )
    )

    # Flushing manually, so we don't use the heavier `begin_nested()` context manager.
    database.flush()

    return token


def signed_in_account(database: orm.Session, token: str) -> Account:
    """The account that the token signs in. Raises NotSignedIn."""
    # Fetch both the session and the account as a single row.
    # There must be only one such row.
    row = database.execute(
        select(Session, Account)
        .join(Account, Session.account_id == Account.id)
        .where(Session.token_hash == hash_token(token))
    ).one_or_none()

    # If there is no or more than one such rows - there is no session
    if row is None:
        raise NotSignedIn(Reason.NO_SESSION)

    # Get session and account separately from the row
    session, account = row

    # If the session was revoked
    if session.revoked_at is not None:
        raise NotSignedIn(Reason.SIGNED_OUT)

    # If the session expired
    if session.expires_at <= datetime.now(UTC):
        raise NotSignedIn(Reason.EXPIRED)

    return account


def sign_out(database: orm.Session, token: str) -> None:
    """Ends the token's session. Does nothing if it signs nobody in."""
    # Update the session row, if we a session with supplied token, and the token hasn't been revoked
    # On update - set the revoked_at column to current time
    database.execute(
        update(Session)
        .where(Session.token_hash == hash_token(token), Session.revoked_at.is_(None))
        .values(revoked_at=datetime.now(UTC))
    )


def sign_out_everywhere(database: orm.Session, account: Account) -> None:
    """Ends all the account's sessions."""
    # Revoke all of the sessions for a supplied account, if they still are not revoked.
    database.execute(
        update(Session)
        .where(Session.account_id == account.id, Session.revoked_at.is_(None))
        .values(revoked_at=datetime.now(UTC))
    )
