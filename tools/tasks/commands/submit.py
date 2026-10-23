"""./tasks.sh submit: hands in the current task, from pushing it to its review.

Only the admin merges, so it merges the admin's own tasks; others wait for
`./tasks.sh merge`. Run it again after a review: it picks up where the pull request is.
"""

import time

from tasks import TaskError, git
from tasks.github import GitHub
from tasks.prompt import confirm
from tasks.references import issue_number

# How long to wait for CI to start after a push, and how often to look
_CI_START_TIMEOUT = 120
_POLL_INTERVAL = 5


def run(github: GitHub) -> None:
    """Pushes the task, opens its pull request, waits for CI, and merges it if it's the admin's."""
    branch = git.current_branch()
    if branch in ("", git.MAIN):
        raise TaskError("Switch to a task first: ./tasks.sh work")
    number = issue_number(branch)

    git.fetch()
    task = github.issue(number)
    if not task.is_open:
        # Merged on the website, say, after the last submit
        if github.merged_head(branch) == git.head():
            print(f"#{number} is already merged.")
            _clean_up(branch, git.head())
            return
        raise TaskError(
            f"Task #{number} is closed, so its work can't be submitted. Ask the admin for a new task."
        )
    if github.me not in task.assignees:
        raise TaskError(f"Task #{number} isn't assigned to you.")

    # Someone else, like a reviewer, may have pushed to the branch
    if git.fast_forward():
        print(f"Got the latest commits on {branch} from GitHub.")
    if not git.subjects(since=git.ORIGIN_MAIN):
        raise TaskError(
            f"Nothing to submit: {branch} has no commits that aren't on {git.MAIN}."
        )
    if git.has_uncommitted_changes():
        print(
            "Note: uncommitted changes aren't submitted. Commit them first if they belong to this task."
        )

    head = _push(branch)
    pull_request = github.open_pull_request(branch) or _open(
        github, task.title, number, branch
    )
    wait_for_checks(github, pull_request, head)
    if _merge(github, pull_request):
        _clean_up(branch, head)


def _push(branch: str) -> str:
    """Pushes new commits on top of the latest main, so that they can be merged. Returns the pushed commit."""
    if git.head() != git.commit(f"origin/{branch}"):
        if not git.contains(git.ORIGIN_MAIN) and not git.rebase(git.ORIGIN_MAIN):
            raise TaskError(
                f"Your commits conflict with {git.MAIN}. Run `git rebase {git.ORIGIN_MAIN}`, fix the conflicts, "
                "run `git rebase --continue`, then run ./tasks.sh submit again."
            )
        git.push(branch)
    return git.head()


def _open(github: GitHub, title: str, number: int, branch: str) -> int:
    """Opens the pull request, which closes the task when merged, and asks everyone else to review it."""
    commits = "\n".join(
        f"- {subject}" for subject in git.subjects(since=git.ORIGIN_MAIN)
    )
    reviewers = [login for login in github.collaborators() if login != github.me]
    pull_request = github.create_pull_request(
        branch, title, f"Closes #{number}\n\n{commits}", reviewers
    )
    print(f"Opened https://github.com/{github.repository}/pull/{pull_request}")
    return pull_request


def wait_for_checks(github: GitHub, pull_request: int, head: str) -> None:
    """Waits for the checks on the pull request's `head` commit, and raises TaskError if any failed."""
    print(f"Waiting for the checks on #{pull_request}. This takes a minute or two...")
    deadline = time.monotonic() + _CI_START_TIMEOUT
    while not github.checks_started(pull_request, head):
        if time.monotonic() > deadline:
            raise TaskError(
                f"The checks didn't start on #{pull_request}. See https://github.com/{github.repository}/actions"
            )
        time.sleep(_POLL_INTERVAL)
    if not github.checks_pass(pull_request):
        failed = "\n".join(f"  {check}" for check in github.failed_checks(pull_request))
        raise TaskError(
            f"Some checks failed. See why:\n{failed}\n"
            "Fix it, commit, then run ./tasks.sh submit again."
        )
    print("The checks passed.")


def _merge(github: GitHub, pull_request: int) -> bool:
    """Merges the admin's own pull request; says where anyone else's stands. Returns whether it merged."""
    decision = github.review_decision(pull_request)
    if decision == "CHANGES_REQUESTED":
        print(
            f"Changes were requested on #{pull_request}. Read them with: gh pr view {pull_request} --comments"
        )
        return False
    if not github.is_admin:
        if decision == "APPROVED":
            print(
                f"#{pull_request} is approved, and the admin merges it. "
                f"Your branch is cleaned up the next time you pull {git.MAIN}."
            )
        else:
            print(f"#{pull_request} is waiting for the admin's review.")
        return False
    if decision != "APPROVED" and not confirm(
        f"#{pull_request} isn't approved. Merge it anyway, as admin?"
    ):
        print("Not merged. Once it's approved, run ./tasks.sh submit again.")
        return False
    # Only the admin may update main, by bypassing that rule
    github.merge(pull_request, as_admin=True)
    print(f"Merged #{pull_request}.")
    return True


def _clean_up(branch: str, head: str) -> None:
    """Switches to the updated main, and deletes the branch unless it has unmerged commits."""
    git.update_main()
    if git.commit(f"refs/heads/{branch}") == head:
        git.delete_branch(branch)
        print(f"Deleted {branch}. You're on {git.MAIN}.")
    else:
        print(f"Kept {branch}: it has commits that weren't in the merged pull request.")
