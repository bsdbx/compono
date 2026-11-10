"""HTTP API at /api."""

import json
from collections.abc import Iterator
from typing import Annotated

from fastapi import Depends, FastAPI
from fastapi.routing import APIRoute
from pydantic import BaseModel
from sqlalchemy import literal, select
from sqlalchemy.orm import Session

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


def print_openapi() -> None:
    """Prints the API's OpenAPI description."""
    print(json.dumps(app.openapi(), indent=2))
