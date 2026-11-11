"""Tests of what each role may do."""

import pytest

from compono.models import ProjectRole, TeamRole
from compono.permissions import ProjectAction, TeamAction, can, can_in_project


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
        (TeamAction.CREATE_PROJECTS, False),
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
        TeamAction.CREATE_PROJECTS,
    }
    assert set(TeamAction) == tested


@pytest.mark.parametrize("role", [ProjectRole.LEAD, ProjectRole.DEVELOPER, None])
@pytest.mark.parametrize("action", list(ProjectAction))
def test_an_owner_can_do_everything_in_any_project_of_the_team(
    role: ProjectRole | None, action: ProjectAction
) -> None:
    assert can_in_project(TeamRole.OWNER, role, action)


@pytest.mark.parametrize("action", list(ProjectAction))
def test_a_lead_can_do_everything_in_a_project(action: ProjectAction) -> None:
    assert can_in_project(TeamRole.MEMBER, ProjectRole.LEAD, action)


@pytest.mark.parametrize(
    ("action", "allowed"),
    [
        (ProjectAction.VIEW, True),
        (ProjectAction.BUILD, True),
        (ProjectAction.LEAVE, True),
        (ProjectAction.EDIT, False),
        (ProjectAction.DELETE, False),
        (ProjectAction.MANAGE_MEMBERS, False),
    ],
)
def test_a_developer_can_view_build_and_leave_a_project(
    action: ProjectAction, allowed: bool
) -> None:
    assert can_in_project(TeamRole.MEMBER, ProjectRole.DEVELOPER, action) is allowed


@pytest.mark.parametrize("action", list(ProjectAction))
def test_a_member_cannot_do_anything_in_a_project_they_are_not_in(
    action: ProjectAction,
) -> None:
    assert not can_in_project(TeamRole.MEMBER, None, action)


def test_every_project_action_is_decided_for_a_developer() -> None:
    # A new action has to be added to the test above too
    tested = {
        ProjectAction.VIEW,
        ProjectAction.BUILD,
        ProjectAction.LEAVE,
        ProjectAction.EDIT,
        ProjectAction.DELETE,
        ProjectAction.MANAGE_MEMBERS,
    }
    assert set(ProjectAction) == tested
