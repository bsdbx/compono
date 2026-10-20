"""./tasks.sh clean: deletes local branches whose pull requests were merged.

GitHub deletes a task's branch when its pull request is merged. Rebase merging gives
the commits new hashes, so git can't tell that the local branch was merged. GitHub can.
"""

from tasks import git
from tasks.github import GitHub


def run(github: GitHub, *, from_hook: bool = False) -> None:
    """Deletes each local branch that was merged on GitHub, unless that would lose work.

    The Git hooks run this after every pull and branch switch, with `from_hook`. Then it
    doesn't fetch or switch branches, leaves the current branch alone, and only says what
    it deletes.
    """
    current = git.current_branch()
    if from_hook and not current:
        # No branch is checked out, as in the middle of a rebase: leave everything alone
        return
    if not from_hook:
        git.fetch()

    for branch in git.gone_branches():
        if from_hook and branch == current:
            continue
        reason = _reason_to_keep(github, branch, current)
        if reason is not None:
            if not from_hook:
                print(f"Kept {branch}: {reason}.")
            continue
        if branch == current:
            git.update_main()
        git.delete_branch(branch)
        print(f"Deleted {branch}: its pull request was merged.")


def _reason_to_keep(github: GitHub, branch: str, current: str) -> str | None:
    """Why deleting `branch` could lose work, or None if it can't."""
    merged = github.merged_head(branch)
    if merged is None:
        return "it was deleted on GitHub without being merged"
    if git.commit(f"refs/heads/{branch}") != merged:
        return "it has commits that weren't in its merged pull request"
    if branch == current and git.has_uncommitted_changes():
        return "it has uncommitted changes"
    return None
