"""./tasks.sh work: starts or continues a task assigned to you."""

import time

from tasks import TaskError, git
from tasks.commands import clean
from tasks.github import START_WORKFLOW, GitHub, Issue
from tasks.prompt import choose
from tasks.references import issue_number

# How long to wait for the Start task workflow to create the branch, and how often to look
_START_TIMEOUT = 120
_POLL_INTERVAL = 5


def run(github: GitHub, task: str | None = None) -> None:
    """Switches to the task's branch. The first time, it has GitHub create the branch."""
    clean.run(github)
    if task is None:
        mine = github.open_issues(assignee=github.me)
        if not mine:
            raise TaskError("No open tasks are assigned to you.")
        number = choose("Task", [(issue.number, issue.summary) for issue in mine])
    else:
        number = issue_number(task)

    issue = github.issue(number)
    if not issue.is_open:
        raise TaskError(f"Task #{number} is closed.")
    if github.me not in issue.assignees:
        raise TaskError(
            f"Task #{number} isn't assigned to you. Ask the admin to assign it to you."
        )

    branch = github.task_branch(number) or _start(github, issue)
    git.fetch()
    git.switch(branch)
    # Someone else, like a reviewer, may have pushed to the branch
    if git.fast_forward():
        print(f"Got the latest commits on {branch} from GitHub.")
    print(f"You're on {branch}. Commit as usual, then run: ./tasks.sh submit")


def _start(github: GitHub, issue: Issue) -> str:
    """Has the Start task workflow create the branch and move the task to In progress."""
    if issue.type is None:
        raise TaskError(
            f"Task #{issue.number} has no type: label, which its branch name starts with. Ask the admin to add one."
        )
    github.start(issue.number)
    print(f"Starting #{issue.number} on GitHub...")
    deadline = time.monotonic() + _START_TIMEOUT
    while time.monotonic() < deadline:
        time.sleep(_POLL_INTERVAL)
        if branch := github.task_branch(issue.number):
            return branch
    raise TaskError(
        f"GitHub didn't create the branch. See why: https://github.com/{github.repository}/actions/workflows/{START_WORKFLOW}"
    )
