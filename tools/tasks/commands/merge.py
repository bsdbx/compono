"""./tasks.sh merge: the admin merges a task's pull request.

Only the admin merges. On someone else's pull request, merging also records the
admin's approval, since the admin is the one reviewing it.
"""

from tasks import TaskError
from tasks.commands.submit import wait_for_checks
from tasks.github import GitHub, PullRequest
from tasks.prompt import choose, confirm
from tasks.references import issue_number


def run(github: GitHub, task: str | None = None) -> None:
    """Waits for the checks on the task's pull request, then merges it once confirmed."""
    if not github.is_admin:
        raise TaskError("Only the repository admin merges pull requests.")
    pull_request = (
        _pick(github) if task is None else _of_task(github, issue_number(task))
    )

    wait_for_checks(
        github, pull_request.number, github.pull_request_head(pull_request.number)
    )
    if github.review_decision(pull_request.number) == "CHANGES_REQUESTED":
        print(
            f"Changes were requested on #{pull_request.number}. Merging accepts it as it is."
        )
    if not confirm(f"Merge {pull_request.summary}?"):
        print("Not merged.")
        return

    if (
        pull_request.author != github.me
        and github.review_decision(pull_request.number) != "APPROVED"
    ):
        github.approve(pull_request.number)
    # Only the admin may update main, by bypassing that rule
    github.merge(pull_request.number, as_admin=True)
    print(f"Merged #{pull_request.number}. Its task is closed.")


def _pick(github: GitHub) -> PullRequest:
    pull_requests = github.open_pull_requests()
    if not pull_requests:
        raise TaskError("There are no open pull requests.")
    return choose("Pull request", [(pr, pr.summary) for pr in pull_requests])


def _of_task(github: GitHub, number: int) -> PullRequest:
    branch = github.task_branch(number)
    pull_request = github.open_pull_request(branch) if branch else None
    if pull_request is None:
        raise TaskError(f"Task #{number} has no open pull request.")
    return github.pull_request(pull_request)
