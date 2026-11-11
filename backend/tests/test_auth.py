"""Tests of accounts, passwords and sessions, without the API."""

from datetime import UTC, datetime, timedelta

import pytest
from pwdlib import PasswordHash
from pwdlib.hashers.argon2 import Argon2Hasher
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from compono import auth, models

PASSWORD = "correct horse battery staple"


def create_mira(session: Session) -> models.Account:
    return auth.create_account(session, "Mira Kovalenko", "mira@acme.dev", PASSWORD)


def stored_sessions(session: Session, account: models.Account) -> list[models.Session]:
    return list(
        session.scalars(
            select(models.Session).where(models.Session.account_id == account.id)
        )
    )


def test_an_account_stores_a_hash_of_its_password(session: Session) -> None:
    account = create_mira(session)

    assert account.password_hash.startswith("$argon2id$")
    assert PASSWORD not in account.password_hash


def test_an_account_stores_its_email_trimmed_and_lowercase(session: Session) -> None:
    account = auth.create_account(
        session, " Mira Kovalenko ", " Mira@Acme.DEV ", PASSWORD
    )

    assert account.email == "mira@acme.dev"
    assert account.name == "Mira Kovalenko"


def test_an_email_has_one_account_whatever_its_case(session: Session) -> None:
    create_mira(session)

    with pytest.raises(auth.EmailTaken):
        auth.create_account(
            session, "Someone Else", "MIRA@acme.dev", "another password"
        )

    # The transaction goes on after a taken email
    auth.create_account(session, "Jonas Lee", "jonas@acme.dev", PASSWORD)


def test_a_blank_name_is_not_a_taken_email(session: Session) -> None:
    with pytest.raises(IntegrityError, match="ck_accounts_name_not_blank"):
        auth.create_account(session, "  ", "mira@acme.dev", PASSWORD)

    # The transaction goes on after it too
    create_mira(session)


def test_the_right_password_finds_the_account(session: Session) -> None:
    account = create_mira(session)

    assert auth.check_password(session, "mira@acme.dev", PASSWORD) is account
    assert auth.check_password(session, " Mira@Acme.dev", PASSWORD) is account


def test_a_wrong_password_or_email_finds_nothing(session: Session) -> None:
    create_mira(session)

    assert auth.check_password(session, "mira@acme.dev", "wrong password") is None
    assert auth.check_password(session, "nobody@acme.dev", PASSWORD) is None


def test_an_unknown_email_still_hashes_the_password(
    session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    # So that it takes as long as a wrong password, and the time doesn't tell whether the email has an account
    hashed: list[str | bytes] = []
    real_hash = auth.passwords.hash

    def spy(password: str | bytes, *, salt: bytes | None = None) -> str:
        hashed.append(password)
        return real_hash(password, salt=salt)

    monkeypatch.setattr(auth.passwords, "hash", spy)

    auth.check_password(session, "nobody@acme.dev", PASSWORD)

    assert hashed == [PASSWORD]


def test_signing_in_hashes_an_old_password_hash_again(session: Session) -> None:
    account = create_mira(session)
    weaker = PasswordHash((Argon2Hasher(time_cost=1, memory_cost=8192),))
    account.password_hash = weaker.hash(PASSWORD)

    auth.check_password(session, "mira@acme.dev", PASSWORD)

    assert account.password_hash.startswith("$argon2id$v=19$m=65536,t=3,p=4$")


def test_a_session_signs_its_account_in(session: Session) -> None:
    account = create_mira(session)

    token = auth.sign_in(session, account)

    assert auth.signed_in_account(session, token) is account


def test_a_session_stores_only_a_hash_of_its_token(session: Session) -> None:
    account = create_mira(session)

    token = auth.sign_in(session, account)

    [stored] = stored_sessions(session, account)
    assert stored.token_hash == auth.hash_token(token)
    assert token.encode() not in stored.token_hash


def test_each_sign_in_has_its_own_token(session: Session) -> None:
    account = create_mira(session)

    assert auth.sign_in(session, account) != auth.sign_in(session, account)


def test_a_session_lasts_30_days(session: Session) -> None:
    account = create_mira(session)

    auth.sign_in(session, account)

    [stored] = stored_sessions(session, account)
    assert stored.expires_at - datetime.now(UTC) > timedelta(days=29, hours=23)
    assert stored.expires_at - datetime.now(UTC) <= timedelta(days=30)


def test_an_unknown_token_signs_nobody_in(session: Session) -> None:
    with pytest.raises(auth.NotSignedIn) as error:
        auth.signed_in_account(session, "made-up")

    assert error.value.reason == auth.Reason.NO_SESSION


def test_signing_out_ends_the_session(session: Session) -> None:
    account = create_mira(session)
    token = auth.sign_in(session, account)
    other_token = auth.sign_in(session, account)

    auth.sign_out(session, token)

    with pytest.raises(auth.NotSignedIn) as error:
        auth.signed_in_account(session, token)
    assert error.value.reason == auth.Reason.SIGNED_OUT
    # Other browsers stay signed in
    assert auth.signed_in_account(session, other_token) is account


def test_signing_out_twice_keeps_when_it_first_happened(session: Session) -> None:
    account = create_mira(session)
    token = auth.sign_in(session, account)

    auth.sign_out(session, token)
    [stored] = stored_sessions(session, account)
    session.refresh(stored)
    first = stored.revoked_at

    auth.sign_out(session, token)
    session.refresh(stored)
    assert stored.revoked_at == first


def test_signing_out_with_an_unknown_token_does_nothing(session: Session) -> None:
    auth.sign_out(session, "made-up")


def test_signing_out_everywhere_ends_every_session_of_the_account(
    session: Session,
) -> None:
    account = create_mira(session)
    tokens = [auth.sign_in(session, account) for _ in range(2)]
    jonas = auth.create_account(session, "Jonas Lee", "jonas@acme.dev", PASSWORD)
    jonas_token = auth.sign_in(session, jonas)

    auth.sign_out_everywhere(session, account)

    for token in tokens:
        with pytest.raises(auth.NotSignedIn) as error:
            auth.signed_in_account(session, token)
        assert error.value.reason == auth.Reason.SIGNED_OUT
    # Other accounts stay signed in
    assert auth.signed_in_account(session, jonas_token) is jonas


def test_an_expired_session_signs_nobody_in(session: Session) -> None:
    account = create_mira(session)
    token = auth.sign_in(session, account)
    [stored] = stored_sessions(session, account)
    stored.created_at = datetime.now(UTC) - auth.SESSION_LIFETIME - timedelta(seconds=2)
    stored.expires_at = datetime.now(UTC) - timedelta(seconds=1)
    session.flush()

    with pytest.raises(auth.NotSignedIn) as error:
        auth.signed_in_account(session, token)
    assert error.value.reason == auth.Reason.EXPIRED
