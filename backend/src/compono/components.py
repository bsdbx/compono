"""A project's components: creating, renaming, copying, saving and deleting them."""

from datetime import datetime
from typing import Final, NamedTuple
from uuid import UUID

from sqlalchemy import func, orm, select, update
from sqlalchemy.exc import IntegrityError

from compono.models import (
    COMPONENT_NAME_MAX_LENGTH,
    Component,
    Project,
    default_screen_sizes,
)

# What a new component is called, then Untitled2, Untitled3...
NEW_NAME: Final[str] = "Untitled"


class NameTaken(Exception):
    """Another component in the project has this name, ignoring case."""


class ComponentNotFound(Exception):
    """The project has no component with this id."""


class VersionConflict(Exception):
    """Someone else saved the component after the version that the save started from."""


class ListedComponent(NamedTuple):
    """A component in its project's list, without its graph."""

    id: UUID
    name: str
    updated_at: datetime


class Saved(NamedTuple):
    """A component's version after a save, and when it was saved."""

    version: int
    updated_at: datetime


def components_of(database: orm.Session, project: Project) -> list[ListedComponent]:
    """The project's components, in the order they were created."""
    # Get component's id, name and last updated time
    # Sort by creation time and by name
    rows = database.execute(
        select(Component.id, Component.name, Component.updated_at)
        .where(Component.project_id == project.id)
        .order_by(Component.created_at, Component.name)
    )
    return [ListedComponent(id, name, updated_at) for id, name, updated_at in rows]


def component(database: orm.Session, project: Project, component_id: UUID) -> Component:
    """The project's component with this id. Raises ComponentNotFound."""
    # Get component of a project by ID
    found = database.scalar(
        select(Component).where(
            Component.id == component_id, Component.project_id == project.id
        )
    )

    if found is None:
        raise ComponentNotFound

    return found


def _edited(database: orm.Session, project: Project) -> None:
    """Moves the project's edited_at, which sorts the projects by when they were last worked on."""
    # Update the supplied project's edited_at column to store the current datetime
    database.execute(
        update(Project).where(Project.id == project.id).values(edited_at=func.now())
    )


def _add(
    database: orm.Session,
    project: Project,
    name: str,
    graph: dict[str, object],
    screen_sizes: list[dict[str, object]],
) -> Component:
    """Adds a component to the project. Raises NameTaken."""
    # Create a new component
    new = Component(
        project_id=project.id, name=name, graph=graph, screen_sizes=screen_sizes
    )

    try:
        # A savepoint, so that the transaction goes on after a taken name
        with database.begin_nested():
            database.add(new)
    except IntegrityError as error:
        # Also when another component got the name first
        if "uq_components_project_id_name" in str(error.orig):
            raise NameTaken from error

        raise

    # Update the project edited_at to now
    _edited(database, project)

    return new


def _add_with_free_name(
    database: orm.Session,
    project: Project,
    stem: str,
    suffix: str,
    graph: dict[str, object],
    screen_sizes: list[dict[str, object]],
) -> Component:
    """Adds a component named the stem and suffix, with the first number that makes the name free: FeatureGridCopy, FeatureGridCopy2..."""
    # A set of component names in a project
    taken = {
        name.lower()
        for name in database.scalars(
            select(Component.name).where(Component.project_id == project.id)
        )
    }

    # `while True`, as mypy knows that it never ends, so the function always returns
    number = 1
    while True:
        # The first name has no number: FeatureGridCopy, then FeatureGridCopy2
        digits = "" if number == 1 else str(number)
        name = (
            # Strip the stem, so we can fit into the `COMPONENT_NAME_MAX_LENGTH`
            # Subtract suffix and digits length additionally
            # Then add the suffix and digits to the stem
            stem[: COMPONENT_NAME_MAX_LENGTH - len(suffix) - len(digits)]
            + suffix
            + digits
        )
        number += 1

        # If the produced name is already taken - try the next number
        if name.lower() in taken:
            continue

        try:
            return _add(database, project, name, graph, screen_sizes)
        except NameTaken:
            # Another component got the name at the same moment, so the next number
            taken.add(name.lower())


def create_component(
    database: orm.Session, project: Project, name: str | None
) -> Component:
    """A new component with an empty graph and the default screen sizes. Named Untitled if no name is given. Raises NameTaken."""
    # If the name is not supplied - create a component with the `NEW_NAME` as the name.
    # If that name is taken, add a number from 2: `Untitled2`, `Untitled3`, ...
    if name is None:
        return _add_with_free_name(
            database, project, NEW_NAME, "", {}, default_screen_sizes()
        )

    # Otherwise, do a normal add
    return _add(database, project, name, {}, default_screen_sizes())


def duplicate(
    database: orm.Session, project: Project, original: Component
) -> Component:
    """A copy of the component, named like FeatureGridCopy, with the same graph and screen sizes."""
    # Return a new component, with the "Copy" as the suffix.
    # FeatureGridCopy, then FeatureGridCopy2, FeatureGridCopy3, ...
    return _add_with_free_name(
        database,
        project,
        original.name,
        "Copy",
        original.graph,
        original.screen_sizes,
    )


def rename(
    database: orm.Session, project: Project, renamed: Component, name: str
) -> None:
    """Gives the component a new name. Raises NameTaken."""
    try:
        # A savepoint, so that the component keeps its name when the new one is taken
        with database.begin_nested():
            renamed.name = name
    except IntegrityError as error:
        if "uq_components_project_id_name" in str(error.orig):
            raise NameTaken from error

        raise

    _edited(database, project)


def save(
    database: orm.Session,
    project: Project,
    component_id: UUID,
    version: int,
    graph: dict[str, object],
    screen_sizes: list[dict[str, object]],
) -> Saved:
    """Saves the component's graph and screen sizes, if it's still at the version the save started from. Raises ComponentNotFound and VersionConflict."""
    # Update the component only if it's still at the version the save started from, and increment its version.
    # One statement, so that of two saves from the same version only one succeeds
    # Return the new version, and when it got updated
    row = database.execute(
        update(Component)
        .where(
            Component.id == component_id,
            Component.project_id == project.id,
            Component.version == version,
        )
        .values(graph=graph, screen_sizes=screen_sizes, version=Component.version + 1)
        .returning(Component.version, Component.updated_at)
    ).one_or_none()

    if row is None:
        # The component is gone, or someone else saved first
        # Raises ComponentNotFound if it's gone
        component(database, project, component_id)
        raise VersionConflict

    # Update the project edited_at
    _edited(database, project)

    new_version, updated_at = row
    return Saved(new_version, updated_at)


def delete_component(
    database: orm.Session, project: Project, deleted: Component
) -> None:
    """Deletes the component."""
    database.delete(deleted)
    database.flush()

    # This is also a change to the project, must be recorded
    _edited(database, project)
