"""Tests of the database setup itself."""

from alembic import command
from alembic.config import Config
from sqlalchemy import Engine, Sequence, inspect
from sqlalchemy.orm import Session


def test_migrations_create_every_model(alembic_config: Config, engine: Engine) -> None:
    # Fails when a model changed without a migration for it
    command.check(alembic_config)


def test_changes_are_rolled_back_after_a_test(session: Session, engine: Engine) -> None:
    # Any change would do. A sequence is one that SQLAlchemy can create without a model.
    Sequence("rollback_check").create(session.connection())
    session.commit()

    # Not committed for other connections, so it's gone after the test
    with engine.connect() as other:
        assert not inspect(other).has_sequence("rollback_check")
