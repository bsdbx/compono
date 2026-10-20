"""Runs git in the repository."""

import os
import subprocess

from tasks import TaskError

MAIN = "main"
ORIGIN_MAIN = f"origin/{MAIN}"

# Marks the git commands that this tool runs, so that the Git hooks they trigger don't
# also clean up branches while it works. The hooks still sync dependencies.
_ENVIRONMENT = {**os.environ, "COMPONO_TASKS": "1"}


def _git(*arguments: str, check: bool = True) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(
        ["git", *arguments],
        check=False,
        capture_output=True,
        text=True,
        stdin=subprocess.DEVNULL,
        env=_ENVIRONMENT,
    )
    if check and result.returncode != 0:
        raise TaskError(result.stderr.strip() or f"git {arguments[0]} failed.")
    return result


def _output(*arguments: str) -> str:
    return _git(*arguments).stdout.strip()


def current_branch() -> str:
    """The checked out branch, or an empty string when no branch is checked out."""
    return _output("branch", "--show-current")


def head() -> str:
    """The checked out commit."""
    return _output("rev-parse", "HEAD")


def commit(ref: str) -> str | None:
    """The commit that `ref` points to, or None if there is no such ref."""
    result = _git("rev-parse", "--quiet", "--verify", f"{ref}^{{commit}}", check=False)
    return result.stdout.strip() if result.returncode == 0 else None


def fetch() -> None:
    """Gets the latest from GitHub, and forgets branches that were deleted there."""
    _git("fetch", "--quiet", "--prune", "origin")


def has_uncommitted_changes() -> bool:
    """Whether tracked files have changes that aren't committed."""
    return bool(_output("status", "--porcelain", "--untracked-files=no"))


def subjects(since: str) -> list[str]:
    """The subjects of the commits on HEAD that aren't on `since`, oldest first."""
    return _output("log", "--reverse", "--format=%s", f"{since}..HEAD").splitlines()


def contains(ancestor: str) -> bool:
    """Whether HEAD already has every commit of `ancestor`."""
    return (
        _git("merge-base", "--is-ancestor", ancestor, "HEAD", check=False).returncode
        == 0
    )


def rebase(onto: str) -> bool:
    """Moves the current branch's commits on top of `onto`, keeping uncommitted changes.

    On a conflict, it puts everything back as it was and returns False.
    """
    if _git("rebase", "--quiet", "--autostash", onto, check=False).returncode == 0:
        return True
    _git("rebase", "--abort", check=False)
    return False


def push(branch: str) -> None:
    """Pushes `branch`, replacing GitHub's copy, which a rebase may have changed."""
    _git("push", "--quiet", "--force-with-lease", "--set-upstream", "origin", branch)


def switch(branch: str) -> None:
    """Switches to `branch`, first copying it from GitHub if it isn't here yet."""
    if commit(f"refs/heads/{branch}") is not None:
        _git("switch", "--quiet", branch)
    else:
        _git("switch", "--quiet", "--create", branch, "--track", f"origin/{branch}")


def update_main() -> None:
    """Switches to main and pulls it."""
    _git("switch", "--quiet", MAIN)
    _git("pull", "--quiet", "--ff-only", "--prune")


def delete_branch(branch: str) -> None:
    """Deletes a local branch, even one that git doesn't see as merged."""
    _git("branch", "--quiet", "--delete", "--force", branch)


def gone_branches() -> list[str]:
    """Local branches whose copy on GitHub was deleted. Run fetch first."""
    lines = _output(
        "for-each-ref", "--format=%(refname:short) %(upstream:track)", "refs/heads"
    ).splitlines()
    return [line.partition(" ")[0] for line in lines if line.endswith(" [gone]")]
