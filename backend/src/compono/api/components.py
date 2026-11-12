"""A project's components."""

import json
import math
from datetime import datetime
from typing import Annotated, Final, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import AfterValidator, BaseModel, Field, StringConstraints

from compono import components, models
from compono.api.dependencies import Database
from compono.api.projects import (
    NAME_TAKEN,
    NOT_IN_PROJECT,
    InProject,
    require_in_project,
)
from compono.api.teams import NOT_SIGNED_IN, answers
from compono.api.text import NO_NUL, refuse_nul
from compono.models import COMPONENT_NAME_MAX_LENGTH
from compono.permissions import ProjectAction

router = APIRouter()

COMPONENTS = "/api/teams/{team_url}/projects/{project_url}/components"

# A capital letter, then letters and digits, like PricingCard. React treats a lowercase name as an HTML tag.
ComponentName = Annotated[
    str,
    StringConstraints(
        min_length=1,
        max_length=COMPONENT_NAME_MAX_LENGTH,
        pattern=r"^[A-Z][A-Za-z0-9]*$",
    ),
]

# NOTE: Vercel limits a request to 4.5 MB.
MAX_GRAPH_BYTES: Final = 1_000_000


def _refuse_unstorable(value: object) -> None:
    """Refuses what JSONB can't store: a NUL character in text or keys, and NaN or Infinity."""
    if isinstance(value, str):
        # NUL character
        refuse_nul(value)
    elif isinstance(value, float) and not math.isfinite(value):
        # Not finite, NaN, or Infinity
        raise ValueError("can't have NaN or Infinity")
    # For dicts and lists, recursively check
    elif isinstance(value, dict):
        # For dict, check both key and value
        for key, item in value.items():
            _refuse_unstorable(key)
            _refuse_unstorable(item)
    elif isinstance(value, list):
        for item in value:
            _refuse_unstorable(item)


def storable(graph: dict[str, object]) -> dict[str, object]:
    """Refuses a graph that the database can't store, or that's too large."""
    # First refuse what JSONB can't store
    _refuse_unstorable(graph)

    # Measure the graph as compact JSON, without spaces after ',' or ':'
    size = len(json.dumps(graph, separators=(",", ":"), ensure_ascii=False).encode())

    if size > MAX_GRAPH_BYTES:
        raise ValueError(f"can't be larger than {MAX_GRAPH_BYTES} bytes")

    return graph


Graph = Annotated[dict[str, object], AfterValidator(storable)]


class ScreenSize(BaseModel):
    """A named width that the preview renders at, like Desktop 1280."""

    name: Annotated[
        str,
        StringConstraints(strip_whitespace=True, min_length=1, max_length=30),
        NO_NUL,
    ]

    width: Annotated[int, Field(ge=200, le=3840)]


def different_names(sizes: list[ScreenSize]) -> list[ScreenSize]:
    """Refuses two screen sizes with the same name, ignoring case."""
    names = [size.name.lower() for size in sizes]

    # Convert to set, if all of the names are unique, then the lengths are the same
    if len(set(names)) != len(names):
        raise ValueError("can't have two screen sizes with the same name")

    return sizes


ScreenSizes = Annotated[
    list[ScreenSize],
    Field(min_length=1, max_length=10),  # NOTE: 10 should be enough
    AfterValidator(different_names),
]


class ListedComponent(BaseModel):
    """A component in its project's list, without its graph."""

    id: UUID
    name: str
    updated_at: datetime


class Component(BaseModel):
    """A component, with its graph and screen sizes."""

    id: UUID
    name: str
    graph: dict[str, object]
    screen_sizes: list[ScreenSize]
    version: int
    updated_at: datetime


def component_of(found: models.Component) -> Component:
    """Returns the component response object from the supplied component."""
    return Component(
        id=found.id,
        name=found.name,
        graph=found.graph,
        screen_sizes=[ScreenSize.model_validate(size) for size in found.screen_sizes],
        version=found.version,
        updated_at=found.updated_at,
    )


class ComponentNotFoundError(BaseModel):
    detail: Literal["team_not_found", "project_not_found", "component_not_found"]


class VersionConflictError(BaseModel):
    detail: Literal["version_conflict"]


# Responses as tuples of status code and error
COMPONENT_NOT_FOUND: Final = (status.HTTP_404_NOT_FOUND, ComponentNotFoundError)
VERSION_CONFLICT: Final = (status.HTTP_409_CONFLICT, VersionConflictError)


def component_in(
    component_id: UUID, access: InProject, database: Database
) -> models.Component:
    """The project's component with the id."""
    try:
        return components.component(database, access.project, component_id)
    except components.ComponentNotFound as error:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "component_not_found") from error


type InComponent = Annotated[models.Component, Depends(component_in)]


@router.get(COMPONENTS, responses=answers(NOT_SIGNED_IN, NOT_IN_PROJECT))
def project_components(access: InProject, database: Database) -> list[ListedComponent]:
    """A project's components, in the order they were created."""
    require_in_project(access, ProjectAction.VIEW)

    return [
        ListedComponent(id=listed.id, name=listed.name, updated_at=listed.updated_at)
        for listed in components.components_of(database, access.project)
    ]


class NewComponent(BaseModel):
    """A new component. Named Untitled, Untitled2... when the name is left out."""

    name: ComponentName | None = None


@router.post(
    COMPONENTS,
    status_code=status.HTTP_201_CREATED,
    responses=answers(NOT_SIGNED_IN, NOT_IN_PROJECT, NAME_TAKEN),
)
def create_component(
    body: NewComponent, access: InProject, database: Database
) -> Component:
    """Creates a component with an empty graph and the default screen sizes."""
    # Everyone who can see a project builds in it
    require_in_project(access, ProjectAction.BUILD)

    try:
        created = components.create_component(database, access.project, body.name)
    except components.NameTaken as error:
        raise HTTPException(status.HTTP_409_CONFLICT, "name_taken") from error

    response = component_of(created)

    database.commit()
    return response


@router.get(
    f"{COMPONENTS}/{{component_id}}",
    responses=answers(NOT_SIGNED_IN, COMPONENT_NOT_FOUND),
)
def component(found: InComponent) -> Component:
    """A component, with its graph and screen sizes."""
    return component_of(found)


class NewName(BaseModel):
    name: ComponentName


@router.patch(
    f"{COMPONENTS}/{{component_id}}",
    responses=answers(NOT_SIGNED_IN, COMPONENT_NOT_FOUND, NAME_TAKEN),
)
def rename_component(
    body: NewName, found: InComponent, access: InProject, database: Database
) -> ListedComponent:
    """Gives a component a new name."""
    require_in_project(access, ProjectAction.BUILD)

    try:
        components.rename(database, access.project, found, body.name)
    except components.NameTaken as error:
        raise HTTPException(status.HTTP_409_CONFLICT, "name_taken") from error

    renamed = ListedComponent(id=found.id, name=found.name, updated_at=found.updated_at)

    database.commit()
    return renamed


class ComponentContent(BaseModel):
    """What a save stores, with the version it started from."""

    version: Annotated[int, Field(ge=1)]
    graph: Graph
    screen_sizes: ScreenSizes


class Saved(BaseModel):
    """The component's version after the save, which the next save starts from."""

    version: int
    updated_at: datetime


@router.put(
    f"{COMPONENTS}/{{component_id}}/content",
    responses=answers(NOT_SIGNED_IN, COMPONENT_NOT_FOUND, VERSION_CONFLICT),
)
def save_component(
    component_id: UUID, body: ComponentContent, access: InProject, database: Database
) -> Saved:
    """Saves a component's graph and screen sizes. Answers 409 if someone else saved it after the version the save started from."""
    require_in_project(access, ProjectAction.BUILD)

    try:
        saved = components.save(
            database,
            access.project,
            component_id,
            body.version,
            body.graph,
            [size.model_dump() for size in body.screen_sizes],
        )
    except components.ComponentNotFound as error:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "component_not_found") from error
    except components.VersionConflict as error:
        raise HTTPException(status.HTTP_409_CONFLICT, "version_conflict") from error

    database.commit()
    return Saved(version=saved.version, updated_at=saved.updated_at)


@router.post(
    f"{COMPONENTS}/{{component_id}}/copies",
    status_code=status.HTTP_201_CREATED,
    responses=answers(NOT_SIGNED_IN, COMPONENT_NOT_FOUND),
)
def duplicate_component(
    found: InComponent, access: InProject, database: Database
) -> Component:
    """Copies a component, as FeatureGridCopy for FeatureGrid."""
    require_in_project(access, ProjectAction.BUILD)

    copy = components.duplicate(database, access.project, found)

    response = component_of(copy)

    database.commit()
    return response


@router.delete(
    f"{COMPONENTS}/{{component_id}}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=answers(NOT_SIGNED_IN, COMPONENT_NOT_FOUND),
)
def delete_component(found: InComponent, access: InProject, database: Database) -> None:
    """Deletes a component."""
    require_in_project(access, ProjectAction.BUILD)

    components.delete_component(database, access.project, found)
    database.commit()
