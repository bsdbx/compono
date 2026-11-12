"""HTTP API at /api."""

import json

from fastapi import FastAPI, Request, status
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.routing import APIRoute

from compono.api import accounts, components, health, projects, teams


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


@app.exception_handler(RequestValidationError)
async def invalid_request(
    request: Request, error: RequestValidationError
) -> JSONResponse:
    """Overrides the default failed validation handler."""

    # Same list of dicts, that the handler returns, but we skip "input" key
    problems = [
        {key: value for key, value in problem.items() if key != "input"}
        for problem in error.errors()
    ]

    # Returning the response, with no input field
    # Graph can be large, e.g 1MB, and there is no reason to send it
    # And NaN, which Python reads as JSON but can't write back, no longer turns the 422 into a 500
    return JSONResponse(
        {"detail": jsonable_encoder(problems)},
        status.HTTP_422_UNPROCESSABLE_CONTENT,
    )


app.include_router(health.router)
app.include_router(accounts.router)
app.include_router(teams.router)
app.include_router(projects.router)
app.include_router(components.router)


def print_openapi() -> None:
    """Prints the API's OpenAPI description."""
    print(json.dumps(app.openapi(), indent=2))
