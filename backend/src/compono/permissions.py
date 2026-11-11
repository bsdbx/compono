"""What each role may do."""

from enum import StrEnum, auto

from compono.models import ProjectRole, TeamRole


class TeamAction(StrEnum):
    """Something an account can do in a team."""

    # See the team and its members
    VIEW = auto()
    LEAVE = auto()
    # Change its name and URL
    EDIT = auto()
    DELETE = auto()
    # See the invite link, to share it
    SHARE_INVITE_LINK = auto()
    # Make members owners, and remove members
    MANAGE_MEMBERS = auto()
    CREATE_PROJECTS = auto()


def can(role: TeamRole, action: TeamAction) -> bool:
    """Whether the role may do the action."""
    match role:
        case TeamRole.OWNER:
            return True
        case TeamRole.MEMBER:
            return action in {TeamAction.VIEW, TeamAction.LEAVE}


class ProjectAction(StrEnum):
    """Something an account can do in a project."""

    # Open the project and see its members
    VIEW = auto()
    # Create, change and delete its components
    BUILD = auto()
    LEAVE = auto()
    # Change its name and description
    EDIT = auto()
    DELETE = auto()
    # Add team members to it, change their roles, and take them out of it
    MANAGE_MEMBERS = auto()


def can_in_project(
    team_role: TeamRole, role: ProjectRole | None, action: ProjectAction
) -> bool:
    """Whether an account with the team role and the project role may do the action. No project role if the account isn't in the project."""
    # Owners manage every project of their team as its leads do, so that a project whose leads have all left still has someone to manage it
    if team_role == TeamRole.OWNER:
        return True

    match role:
        case ProjectRole.LEAD:
            return True
        case ProjectRole.DEVELOPER:
            return action in {
                ProjectAction.VIEW,
                ProjectAction.BUILD,
                ProjectAction.LEAVE,
            }
        case None:
            return False
