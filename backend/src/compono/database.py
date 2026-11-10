"""Connection to PostgreSQL."""

from sqlalchemy import Engine, create_engine, make_url
from sqlalchemy.orm import sessionmaker

from compono.settings import settings


def make_engine(url: str) -> Engine:
    """An engine for the database at `url`."""
    # Neon's connection pooler doesn't support prepared statements
    connect_args: dict[str, object] = {"prepare_threshold": None}

    # psycopg for now, maybe async one later
    return create_engine(
        make_url(url).set(drivername="postgresql+psycopg"),
        connect_args=connect_args,
        # Neon closes idle connections, so check each one before reusing it
        pool_pre_ping=True,
    )


engine: Engine = make_engine(settings.database_url)

sessions = sessionmaker(engine)
