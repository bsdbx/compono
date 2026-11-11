"""Whether the API runs."""

from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import literal, select

from compono.api.dependencies import Database

router = APIRouter()


class Health(BaseModel):
    status: str


@router.get("/api/health")
def health(session: Database) -> Health:
    """Whether the API runs and reaches the database."""
    session.scalar(select(literal(1)))
    return Health(status="ok")
