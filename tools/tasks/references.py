"""Turns the ways a user can name a task into its issue number."""

from tasks import TaskError


def issue_number(task: str) -> int:
    """Returns the issue number in 12, #12, an issue URL or a task branch like feat/12-add-share-links."""
    text = task.removeprefix("#")
    if "/issues/" in text:
        text = text.rpartition("/issues/")[2]
    elif "/" in text:
        # A branch: <type>/<number>-<title>
        text = text.partition("/")[2].partition("-")[0]
    if not text.isdecimal():
        raise TaskError(
            f'"{task}" is not a task. Use an issue number (12) or a task branch (feat/12-add-share-links).'
        )
    return int(text)
