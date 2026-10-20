"""Asks the user questions in the terminal."""

from collections.abc import Sequence

from tasks import TaskError


def ask(question: str) -> str:
    """Asks a question and returns the answer without surrounding spaces."""
    try:
        return input(question).strip()
    except EOFError:
        raise TaskError("No answer was given.") from None


def confirm(question: str) -> bool:
    """Asks a yes/no question. Anything but yes means no."""
    return ask(f"{question} [y/N] ").lower() in ("y", "yes")


def choose[T](question: str, options: Sequence[tuple[T, str]]) -> T:
    """Shows the labels of `options` as a numbered menu and returns the chosen value.

    A single option is chosen without asking.
    """
    if not options:
        raise TaskError(f"There is nothing to choose from for: {question}")
    if len(options) == 1:
        value, label = options[0]
        print(f"{question}: {label}")
        return value

    for number, (_, label) in enumerate(options, start=1):
        print(f"  {number}) {label}")
    while True:
        answer = ask(f"{question} [1-{len(options)}]: ")
        if answer.isdecimal() and 1 <= int(answer) <= len(options):
            return options[int(answer) - 1][0]
        print(f"Enter a number from 1 to {len(options)}.")
