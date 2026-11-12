"""Projects and their members."""

from typing import NamedTuple
from uuid import UUID

from sqlalchemy import and_, delete, orm, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.exc import IntegrityError

from compono.models import (
    RESERVED_PROJECT_URLS,
    Account,
    Project,
    ProjectMember,
    ProjectRole,
    Team,
    TeamRole,
    make_url_from_project_name,
)
from compono.permissions import ProjectAction, can_in_project


class NameTaken(Exception):
    """Another project in the team has a name that makes the same URL, or the URL is one of the team's own pages."""


class NotInTeam(Exception):
    """The account isn't in the project's team."""


class NotInProject(Exception):
    """The account isn't in the project."""


class LastLead(Exception):
    """The project's only lead can't leave it, be taken out of it or be made a developer."""


class ProjectAndRole(NamedTuple):
    """A project, with an account's role in it. No role if the account isn't in it."""

    project: Project
    role: ProjectRole | None


class ListedProject(NamedTuple):
    """A project in a team's list of projects."""

    project: Project
    role: ProjectRole | None
    members: list[Account]


def url_of(name: str) -> str:
    """The URL that the project name makes. Raises NameTaken if a team's own page has it."""
    url = make_url_from_project_name(name)
    # If the URL is in the reserved list
    if url in RESERVED_PROJECT_URLS:
        raise NameTaken

    return url


def projects_of(
    database: orm.Session, team: Team, team_role: TeamRole, account: Account
) -> list[ListedProject]:
    """The team's projects that the account can see, the most recently edited first."""
    # Projects and project member roles, as a single row, where project member may not exist
    # Sorted by last edited and name
    query = (
        select(Project, ProjectMember.role)
        .outerjoin(
            ProjectMember,
            and_(
                ProjectMember.project_id == Project.id,
                ProjectMember.account_id == account.id,
            ),
        )
        .where(Project.team_id == team.id)
        .order_by(Project.edited_at.desc(), Project.name)
    )

    # Only show projects the account has joined unless its team role grants access without a project membership.
    if not can_in_project(team_role, None, ProjectAction.VIEW):
        query = query.where(ProjectMember.role.is_not(None))

    # The list of (project, role) that can see a project
    found = [(project, role) for project, role in database.execute(query)]

    # The members of all the team's projects, in one query
    members: dict[UUID, list[Account]] = {project.id: [] for project, _ in found}

    # Select project member's project id and account
    # Sorted by when the project member was added, and by account name
    rows = database.execute(
        select(ProjectMember.project_id, Account)
        .join(Account, Account.id == ProjectMember.account_id)
        .where(ProjectMember.team_id == team.id)
        .order_by(ProjectMember.added_at, Account.name)
    )

    for project_id, member in rows:
        # Skips the projects the account can't see
        if project_id in members:
            members[project_id].append(member)

    return [
        ListedProject(project, role, members[project.id]) for project, role in found
    ]


def project_at(
    database: orm.Session, team: Team, url: str, account: Account
) -> ProjectAndRole | None:
    """The team's project at this URL, with the account's role in it. None if the team has no such project."""
    # Select project and project member's role, as one row, allowing role to be None
    row = database.execute(
        select(Project, ProjectMember.role)
        .outerjoin(
            ProjectMember,
            and_(
                ProjectMember.project_id == Project.id,
                ProjectMember.account_id == account.id,
            ),
        )
        .where(Project.team_id == team.id, Project.url == url)
    ).one_or_none()

    if row is None:
        return None

    project, role = row
    return ProjectAndRole(project, role)


def create_project(
    database: orm.Session, team: Team, account: Account, name: str, description: str
) -> Project:
    """A new project in the team, with the account as its first lead. Raises NameTaken."""
    # Create a new project in the team
    project = Project(
        team_id=team.id, name=name, url=url_of(name), description=description
    )
    try:
        # A savepoint, so that the transaction goes on after a taken name
        with database.begin_nested():
            database.add(project)
    except IntegrityError as error:
        # Also when another project got the name first
        if "uq_projects_team_id_url" in str(error.orig):
            raise NameTaken from error

        raise

    # Add an account as a member, with the lead role to created project
    database.add(
        ProjectMember(
            project_id=project.id,
            account_id=account.id,
            team_id=team.id,
            role=ProjectRole.LEAD,
        )
    )

    database.flush()
    return project


def update_project(
    database: orm.Session, project: Project, name: str | None, description: str | None
) -> None:
    """Changes what's given of the project's name and description. A new name gives it a new URL. Raises NameTaken."""
    try:
        # A savepoint, so that the project keeps its name when the new one is taken
        with database.begin_nested():
            # If name is supplied
            if name is not None:
                project.url = url_of(name)
                project.name = name

            # If description is supplied
            if description is not None:
                project.description = description
    except IntegrityError as error:
        if "uq_projects_team_id_url" in str(error.orig):
            raise NameTaken from error

        raise


def delete_project(database: orm.Session, project: Project) -> None:
    """Deletes the project, and with it its memberships and components."""
    database.delete(project)
    database.flush()


def members_of(
    database: orm.Session, project: Project
) -> list[tuple[Account, ProjectRole]]:
    """The project's members with their roles, in the order they were added."""
    # Select account and project member's role as one row
    # Sorted by when the project member was added and by name
    rows = database.execute(
        select(Account, ProjectMember.role)
        .join(ProjectMember, ProjectMember.account_id == Account.id)
        .where(ProjectMember.project_id == project.id)
        .order_by(ProjectMember.added_at, Account.name)
    )

    # Return the list of (account, role) pairs
    return [(account, role) for account, role in rows]


def _require_another_lead(
    database: orm.Session, project: Project, account_id: UUID
) -> None:
    """Raises LastLead if the account is the project's only lead."""
    # Lock the leads' rows until the transaction ends, so that two leads can't both step down at once
    leads = database.scalars(
        select(ProjectMember.account_id)
        .where(
            ProjectMember.project_id == project.id,
            ProjectMember.role == ProjectRole.LEAD,
        )
        .with_for_update()
    ).all()

    # If the account is the only lead, the project would have none
    if list(leads) == [account_id]:
        raise LastLead


def set_member(
    database: orm.Session, project: Project, account_id: UUID, role: ProjectRole
) -> Account:
    """Adds a member of the project's team to the project with the role, or gives them the role if they're in it. Returns their account. Raises NotInTeam and LastLead."""
    new_role: dict[str, ProjectRole] = {"role": role}

    # A lead made a developer has to leave another lead behind
    if role == ProjectRole.DEVELOPER:
        _require_another_lead(database, project, account_id)

    try:
        with database.begin_nested():
            # Try to add a new project member with a new role
            # If there is already a member that exists with the same account_id and project_id, then keep it and update its role
            database.execute(
                insert(ProjectMember)
                .values(
                    project_id=project.id,
                    account_id=account_id,
                    team_id=project.team_id,
                    role=role,
                )
                .on_conflict_do_update(
                    index_elements=[ProjectMember.project_id, ProjectMember.account_id],
                    set_=new_role,
                )
            )
    except IntegrityError as error:
        if "fk_project_members_team_id_account_id_team_members" in str(error.orig):
            raise NotInTeam from error

        raise

    return database.get_one(Account, account_id)


def remove_member(database: orm.Session, project: Project, account_id: UUID) -> None:
    """Takes a member out of the project. Raises NotInProject and LastLead."""
    _require_another_lead(database, project, account_id)

    # Try to delete a project member that matches the supplied account
    # There must be one such member, or None
    removed = database.execute(
        delete(ProjectMember)
        .where(
            ProjectMember.project_id == project.id,
            ProjectMember.account_id == account_id,
        )
        .returning(ProjectMember.account_id)
    ).scalar_one_or_none()

    # If the member is not in the project
    if removed is None:
        raise NotInProject


def leave(database: orm.Session, project: Project, account: Account) -> None:
    """Takes the account out of the project. Does nothing if it isn't in it. Raises LastLead."""
    _require_another_lead(database, project, account.id)

    database.execute(
        delete(ProjectMember).where(
            ProjectMember.project_id == project.id,
            ProjectMember.account_id == account.id,
        )
    )
