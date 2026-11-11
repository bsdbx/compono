from uuid import UUID

from fastapi import APIRouter, status
from pydantic import BaseModel

from compono.api.dependencies import Database, NotSignedInError, SignedIn
from compono.models import TeamRole
from compono.teams import teams_of

router = APIRouter()


class Team(BaseModel):
    """Team response model."""

    id: UUID
    name: str
    url: str
    role: TeamRole


@router.get(
    "/api/teams",
    responses={status.HTTP_401_UNAUTHORIZED: {"model": NotSignedInError}},
)
def my_teams(database: Database, account: SignedIn) -> list[Team]:
    """The signed-in account's teams"""
    return [
        Team(id=team.id, name=team.name, url=team.url, role=role)
        for team, role in teams_of(database, account)
    ]
