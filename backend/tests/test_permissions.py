"""Tests of what each role may do."""

import pytest

from compono.models import TeamRole
from compono.permissions import TeamAction, can


@pytest.mark.parametrize("action", list(TeamAction))
def test_an_owner_can_do_everything_in_a_team(action: TeamAction) -> None:
    assert can(TeamRole.OWNER, action)


@pytest.mark.parametrize(
    ("action", "allowed"),
    [
        (TeamAction.VIEW, True),
        (TeamAction.LEAVE, True),
        (TeamAction.EDIT, False),
        (TeamAction.DELETE, False),
        (TeamAction.SHARE_INVITE_LINK, False),
        (TeamAction.MANAGE_MEMBERS, False),
    ],
)
def test_a_member_can_only_view_and_leave_a_team(
    action: TeamAction, allowed: bool
) -> None:
    assert can(TeamRole.MEMBER, action) is allowed


def test_every_team_action_is_decided_for_a_member() -> None:
    # A new action has to be added to the test above too
    tested = {
        TeamAction.VIEW,
        TeamAction.LEAVE,
        TeamAction.EDIT,
        TeamAction.DELETE,
        TeamAction.SHARE_INVITE_LINK,
        TeamAction.MANAGE_MEMBERS,
    }
    assert set(TeamAction) == tested
