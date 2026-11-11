"""What each role may do."""

from enum import StrEnum, auto

from compono.models import TeamRole


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


def can(role: TeamRole, action: TeamAction) -> bool:
    """Whether the role may do the action."""
    match role:
        case TeamRole.OWNER:
            return True
        case TeamRole.MEMBER:
            return action in {TeamAction.VIEW, TeamAction.LEAVE}
