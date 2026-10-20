"""Create, assign, start and submit Compono's tasks from the terminal.

A task is a GitHub issue. Run it from the repository root with ./tasks.sh
"""


class TaskError(Exception):
    """A problem to show to the user as a plain message, without a traceback."""
