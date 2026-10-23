"""Reads the command line and runs the matching command."""

import sys

from tasks import TaskError
from tasks.commands import assign, clean, create, merge, submit, work
from tasks.github import GitHub

USAGE = """\
Usage: ./tasks.sh <command>

Commands:
  create                Create a task. Asks for its title, type, area and milestone.
  assign [task] [user]  Give a task to a user or @me. Asks for anything left out. Admin only.
  work [task]           Start or continue one of your tasks. Lists them if no task is given.
  submit                Push the current task, open its pull request and wait for CI.
                        The admin's own tasks are merged too; everyone else's wait for review.
  merge [task]          Merge a task's pull request once its checks pass. Lists them if no task is given.
                        Admin only.
  clean                 Delete local branches whose pull requests were merged.
                        Pulling and switching branches does this too, through the Git hooks.

A task is an issue number (12 or #12), its branch (feat/12-add-share-links) or its URL.
"""


def main(arguments: list[str]) -> int:
    """Runs the command in `arguments` and returns the exit code."""
    try:
        match arguments:
            case [] | ["help" | "-h" | "--help"]:
                print(USAGE, end="")
            case ["create"]:
                create.run(GitHub())
            case ["assign", *rest] if len(rest) <= 2:
                assign.run(GitHub(), *rest)
            case ["work", *rest] if len(rest) <= 1:
                work.run(GitHub(), *rest)
            case ["submit"]:
                submit.run(GitHub())
            case ["merge", *rest] if len(rest) <= 1:
                merge.run(GitHub(), *rest)
            case ["clean"]:
                clean.run(GitHub())
            case ["clean", "--hook"]:
                # What the Git hooks run after pulls and branch switches (.githooks/post-merge)
                clean.run(GitHub(), from_hook=True)
            case _:
                print(USAGE, end="", file=sys.stderr)
                return 2
    except TaskError as error:
        print(f"Error: {error}", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print(file=sys.stderr)
        return 130
    return 0
