"""Fixtures for tests against a real PostgreSQL database."""

from collections.abc import Callable, Iterator, Mapping
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import Engine, make_url, text
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session, sessionmaker

from compono.api.dependencies import database
from compono.api.graphs import node_types
from compono.app import app
from compono.database import make_engine
from compono.graph.node_types import NodeType
from compono.settings import settings

_url = make_url(settings.database_url)
TEST_URL = _url.set(database=f"{_url.database}_test").render_as_string(
    hide_password=False
)


@pytest.fixture(scope="session")
def alembic_config() -> Config:
    """Alembic's configuration, pointed at the test database."""
    config = Config(toml_file=Path(__file__).parent.parent / "pyproject.toml")
    config.set_main_option("sqlalchemy.url", TEST_URL.replace("%", "%%"))
    return config


@pytest.fixture(scope="session")
def engine(alembic_config: Config) -> Iterator[Engine]:
    """The test database, created empty for each run and migrated to the latest revision."""
    server = make_engine(settings.database_url)
    name = server.dialect.identifier_preparer.quote(f"{_url.database}_test")
    try:
        # CREATE DATABASE can't run inside a transaction
        with server.connect().execution_options(
            isolation_level="AUTOCOMMIT"
        ) as connection:
            connection.execute(text(f"DROP DATABASE IF EXISTS {name} WITH (FORCE)"))
            connection.execute(text(f"CREATE DATABASE {name}"))
    except OperationalError as error:
        pytest.exit(
            f"Can't reach PostgreSQL. Start it with: docker compose up -d --wait\n{error}",
            returncode=1,
        )
    finally:
        server.dispose()

    command.upgrade(alembic_config, "head")
    engine = make_engine(TEST_URL)
    yield engine
    engine.dispose()


@pytest.fixture()
def session(engine: Engine) -> Iterator[Session]:
    """A session whose changes are rolled back after the test, even the ones it commits."""
    with engine.connect() as connection:
        transaction = connection.begin()
        # Commits only release a savepoint inside the transaction above
        sessions = sessionmaker(
            bind=connection, join_transaction_mode="create_savepoint"
        )
        with sessions() as session:
            yield session
        transaction.rollback()


@pytest.fixture()
def client(session: Session) -> Iterator[TestClient]:
    """The API, with its requests using the test's session."""
    app.dependency_overrides[database] = lambda: session
    # Over HTTPS, or it doesn't send back the session cookie, which is only for HTTPS
    with TestClient(app, base_url="https://testserver") as client:
        yield client
    app.dependency_overrides.clear()


@pytest.fixture()
def use_node_types(
    client: TestClient,
) -> Iterator[Callable[[Mapping[str, NodeType]], None]]:
    """Makes the API answer with the test's node types instead of Compono's."""

    def use(types: Mapping[str, NodeType]) -> None:
        app.dependency_overrides[node_types] = lambda: types

    yield use
    app.dependency_overrides.pop(node_types, None)
