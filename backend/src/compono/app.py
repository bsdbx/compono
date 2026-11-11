"""HTTP API at /api."""

import json

from fastapi import FastAPI
from fastapi.routing import APIRoute

from compono.api import accounts, health, teams


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

app.include_router(health.router)
app.include_router(accounts.router)
app.include_router(teams.router)


def print_openapi() -> None:
    """Prints the API's OpenAPI description."""
    print(json.dumps(app.openapi(), indent=2))
