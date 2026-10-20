"""./tasks.sh assign: gives a task to someone.

Only the admin assigns tasks. The Guard assignments workflow undoes anyone else's.
"""

from tasks import TaskError
from tasks.github import GitHub
from tasks.prompt import choose
from tasks.references import issue_number


def run(github: GitHub, task: str | None = None, user: str | None = None) -> None:
    """Gives `task` to `user`, asking for whichever is missing."""
    if not github.is_admin:
        raise TaskError("Only the repository admin can assign tasks.")
    if task is None:
        number = choose(
            "Task", [(issue.number, issue.summary) for issue in github.open_issues()]
        )
    else:
        number = issue_number(task)
    if user is None:
        user = choose(
            "Assign to",
            [
                (login, f"{login} (you)" if login == github.me else login)
                for login in github.collaborators()
            ],
        )
    give(github, number, user)


def give(github: GitHub, number: int, user: str) -> None:
    """Makes `user` (a login, @login or @me) the task's only assignee."""
    login = user.removeprefix("@")
    if login == "me":
        login = github.me
    previous = [
        assignee for assignee in github.issue(number).assignees if assignee != login
    ]
    github.assign(number, login, unassign=previous)
    print(
        f"Assigned #{number} to {login}. They start it with: ./tasks.sh work {number}"
    )
