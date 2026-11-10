"""Runs the migrations against the DB."""

import logging

from alembic import context

from compono.database import engine
from compono.models import metadata

logging.basicConfig(format="%(message)s")
logging.getLogger("alembic.runtime.migration").setLevel(logging.INFO)

if context.is_offline_mode():
    raise SystemExit("Migrations run against a database, not as SQL scripts.")

with engine.connect() as connection:
    context.configure(connection=connection, target_metadata=metadata)
    with context.begin_transaction():
        context.run_migrations()
