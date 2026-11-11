"""Projects and their members."""

import unicodedata
from datetime import datetime
from typing import Annotated, Final, Literal, NamedTuple
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import AfterValidator, BaseModel, StringConstraints

from compono import models, projects
from compono.api.dependencies import Database, SignedIn
from compono.api.teams import (
    NOT_IN_TEAM,
    NOT_SIGNED_IN,
    OWNERS_ONLY,
    InTeam,
    answers,
    require,
)
from compono.api.text import NO_NUL, PathText
from compono.models import ProjectRole, TeamRole, make_url_from_project_name
from compono.permissions import ProjectAction, TeamAction, can_in_project

router = APIRouter()


def makes_a_url(name: str) -> str:
    """Refuses a name that the database refuses, or that makes no URL."""
    # Refuse any C0, or C1 characters: https://www.unicode.org/reports/tr44/#General_Category_Values
    if any(unicodedata.category(char) == "Cc" for char in name):
        raise ValueError("can't have control characters, such as line breaks")

    # If a generated URL came out empty
    if not make_url_from_project_name(name):
        raise ValueError("needs a letter or a digit")

    return name


# Stripped project name length is between 1 and 100, and it makes a URL
ProjectName = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=100),
    AfterValidator(makes_a_url),
]

# Stripped description is at most 500 characters long
Description = Annotated[
    str, StringConstraints(strip_whitespace=True, max_length=500), NO_NUL
]


class Project(BaseModel):
    """A project, with the signed-in account's role in it."""

    id: UUID
    name: str
    url: str
    description: str
    edited_at: datetime
    # None for an owner who isn't in the project
    role: ProjectRole | None


def project_of(project: models.Project, role: ProjectRole | None) -> Project:
    """Returns the project response object from the supplied project."""
    return Project(
        id=project.id,
        name=project.name,
        url=project.url,
        description=project.description,
        edited_at=project.edited_at,
        role=role,
    )


class MemberName(BaseModel):
    """A project member's name, for their avatar."""

    id: UUID
    name: str


class ListedProject(Project):
    """A project in the list of a team's projects."""

    # In the order they were added
    members: list[MemberName]


class ProjectNotFoundError(BaseModel):
    detail: Literal["team_not_found", "project_not_found"]


class LeadsOnlyError(BaseModel):
    detail: Literal["leads_only"]


class NameTakenError(BaseModel):
    detail: Literal["name_taken"]


class ProjectMemberNotFoundError(BaseModel):
    detail: Literal["team_not_found", "project_not_found", "member_not_found"]


# Responses as tuples of status code and error
NOT_IN_PROJECT: Final = (status.HTTP_404_NOT_FOUND, ProjectNotFoundError)
LEADS_ONLY: Final = (status.HTTP_403_FORBIDDEN, LeadsOnlyError)
NAME_TAKEN: Final = (status.HTTP_409_CONFLICT, NameTakenError)
MEMBER_NOT_FOUND: Final = (status.HTTP_404_NOT_FOUND, ProjectMemberNotFoundError)


class ProjectAccess(NamedTuple):
    """A project, with the signed-in account's roles in its team and in it."""

    project: models.Project
    team_role: TeamRole
    # None if the account isn't in the project
    role: ProjectRole | None


def project_access(
    project_url: PathText,
    membership: InTeam,
    account: SignedIn,
    database: Database,
) -> ProjectAccess:
    """The team's project at the URL, if the signed-in account can see it."""
    found = projects.project_at(database, membership.team, project_url, account)
    # Also when the account can't see the project, so that it doesn't tell which projects exist
    if found is None or not can_in_project(
        membership.role, found.role, ProjectAction.VIEW
    ):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "project_not_found")

    return ProjectAccess(found.project, membership.role, found.role)


type InProject = Annotated[ProjectAccess, Depends(project_access)]


def require_in_project(access: ProjectAccess, action: ProjectAction) -> None:
    """Answers 403 if the account's roles may not do the action."""
    if not can_in_project(access.team_role, access.role, action):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "leads_only")


@router.get(
    "/api/teams/{team_url}/projects", responses=answers(NOT_SIGNED_IN, NOT_IN_TEAM)
)
def team_projects(
    membership: InTeam, account: SignedIn, database: Database
) -> list[ListedProject]:
    """The team's projects that the signed-in account can see, the most recently edited first. Owners see them all."""
    # Get the list of projects in a team
    listed = projects.projects_of(database, membership.team, membership.role, account)

    return [
        ListedProject(
            id=item.project.id,
            name=item.project.name,
            url=item.project.url,
            description=item.project.description,
            edited_at=item.project.edited_at,
            role=item.role,
            members=[
                MemberName(id=member.id, name=member.name) for member in item.members
            ],
        )
        for item in listed
    ]


class NewProject(BaseModel):
    name: ProjectName
    description: Description = ""


@router.post(
    "/api/teams/{team_url}/projects",
    status_code=status.HTTP_201_CREATED,
    responses=answers(NOT_SIGNED_IN, NOT_IN_TEAM, OWNERS_ONLY, NAME_TAKEN),
)
def create_project(
    body: NewProject, membership: InTeam, account: SignedIn, database: Database
) -> Project:
    """Creates a project in the team, with the signed-in account as its first lead."""
    require(membership, TeamAction.CREATE_PROJECTS)

    try:
        project = projects.create_project(
            database, membership.team, account, body.name, body.description
        )
    except projects.NameTaken as error:
        raise HTTPException(status.HTTP_409_CONFLICT, "name_taken") from error

    created = project_of(project, ProjectRole.LEAD)
    database.commit()

    return created


@router.get(
    "/api/teams/{team_url}/projects/{project_url}",
    responses=answers(NOT_SIGNED_IN, NOT_IN_PROJECT),
)
def project(access: InProject) -> Project:
    """A project that the signed-in account can see."""
    return project_of(access.project, access.role)


class ProjectChanges(BaseModel):
    """What to change of a project. What's left out stays."""

    name: ProjectName | None = None
    description: Description | None = None


@router.patch(
    "/api/teams/{team_url}/projects/{project_url}",
    responses=answers(NOT_SIGNED_IN, NOT_IN_PROJECT, LEADS_ONLY, NAME_TAKEN),
)
def update_project(
    body: ProjectChanges, access: InProject, database: Database
) -> Project:
    """Changes a project's name or description. A new name gives it a new URL."""
    require_in_project(access, ProjectAction.EDIT)

    try:
        projects.update_project(database, access.project, body.name, body.description)
    except projects.NameTaken as error:
        raise HTTPException(status.HTTP_409_CONFLICT, "name_taken") from error

    updated = project_of(access.project, access.role)

    database.commit()
    return updated


@router.delete(
    "/api/teams/{team_url}/projects/{project_url}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=answers(NOT_SIGNED_IN, NOT_IN_PROJECT, LEADS_ONLY),
)
def delete_project(access: InProject, database: Database) -> None:
    """Deletes a project, with its components."""
    require_in_project(access, ProjectAction.DELETE)

    projects.delete_project(database, access.project)
    database.commit()


class ProjectMember(BaseModel):
    """A member of a project."""

    id: UUID
    name: str
    email: str
    role: ProjectRole


@router.get(
    "/api/teams/{team_url}/projects/{project_url}/members",
    responses=answers(NOT_SIGNED_IN, NOT_IN_PROJECT),
)
def project_members(access: InProject, database: Database) -> list[ProjectMember]:
    """A project's members, in the order they were added."""
    require_in_project(access, ProjectAction.VIEW)

    return [
        ProjectMember(id=account.id, name=account.name, email=account.email, role=role)
        for account, role in projects.members_of(database, access.project)
    ]


class MemberRole(BaseModel):
    """The role to give a member of a project."""

    role: ProjectRole


@router.put(
    "/api/teams/{team_url}/projects/{project_url}/members/{account_id}",
    responses=answers(NOT_SIGNED_IN, MEMBER_NOT_FOUND, LEADS_ONLY),
)
def set_project_member(
    account_id: UUID, body: MemberRole, access: InProject, database: Database
) -> ProjectMember:
    """Adds a member of the team to a project with the role, or gives them the role if they're in it."""
    require_in_project(access, ProjectAction.MANAGE_MEMBERS)

    try:
        account = projects.set_member(database, access.project, account_id, body.role)
    except projects.NotInTeam as error:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "member_not_found") from error

    member = ProjectMember(
        id=account.id, name=account.name, email=account.email, role=body.role
    )

    database.commit()
    return member


@router.delete(
    "/api/teams/{team_url}/projects/{project_url}/members/{account_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=answers(NOT_SIGNED_IN, MEMBER_NOT_FOUND, LEADS_ONLY),
)
def remove_project_member(
    account_id: UUID, access: InProject, database: Database
) -> None:
    """Takes a member out of a project."""
    require_in_project(access, ProjectAction.MANAGE_MEMBERS)

    try:
        projects.remove_member(database, access.project, account_id)
    except projects.NotInProject as error:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "member_not_found") from error

    database.commit()


@router.delete(
    "/api/teams/{team_url}/projects/{project_url}/membership",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=answers(NOT_SIGNED_IN, NOT_IN_PROJECT),
)
def leave_project(access: InProject, account: SignedIn, database: Database) -> None:
    """Takes the signed-in account out of a project."""
    require_in_project(access, ProjectAction.LEAVE)

    projects.leave(database, access.project, account)
    database.commit()
