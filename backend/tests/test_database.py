"""Tests of the database setup itself."""

from alembic import command
from alembic.config import Config
from sqlalchemy import (
    Connection,
    Engine,
    Sequence,
    String,
    inspect,
    literal_column,
    select,
    text,
)
from sqlalchemy.orm import Session
from sqlalchemy.schema import CreateSchema

from compono.models import metadata


def test_migrations_create_every_model(alembic_config: Config, engine: Engine) -> None:
    # Fails when a model changed without a migration for it
    command.check(alembic_config)


def check_constraints(connection: Connection, schema: str) -> dict[str, str]:
    """Every CHECK constraint in a schema, with its condition as PostgreSQL stores it."""
    query = (
        select(
            literal_column("conname", String),
            literal_column("pg_get_constraintdef(oid)", String),
        )
        .select_from(text("pg_constraint"))
        .where(text("contype = 'c'"))
        .where(literal_column("connamespace::regnamespace::text", String) == schema)
    )
    return {name: condition for name, condition in connection.execute(query)}


def test_migrations_create_every_check_constraint(session: Session) -> None:
    # `alembic check` doesn't compare conditions, like the reserved URLs or the roles.
    # So the models create their tables again, in a schema of their own, to compare.
    connection = session.connection()
    connection.execute(CreateSchema("models"))
    connection.execute(text("SET LOCAL search_path TO models"))
    metadata.create_all(connection)

    from_models = check_constraints(connection, "models")
    assert check_constraints(connection, "public") == from_models


def test_changes_are_rolled_back_after_a_test(session: Session, engine: Engine) -> None:
    # Any change would do. A sequence is one that SQLAlchemy can create without a model.
    Sequence("rollback_check").create(session.connection())
    session.commit()

    # Not committed for other connections, so it's gone after the test
    with engine.connect() as other:
        assert not inspect(other).has_sequence("rollback_check")
