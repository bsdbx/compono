"""./tasks.sh create: anyone creates a task. The admin is also offered to assign it."""

from tasks import TaskError
from tasks.commands import assign
from tasks.github import GitHub, Label
from tasks.prompt import ask, choose


def run(github: GitHub) -> None:
    """Asks for the task's details, creates its issue, and lets the admin assign it."""
    title = ask("Title: ")
    if not title:
        raise TaskError("A task needs a title.")
    kind = choose("Type", _options(github.labels("type")))
    area = choose("Area", _options(github.labels("area")))
    milestone = choose(
        "Milestone",
        [(m.title, f"{m.title} (due {m.due})") for m in github.milestones()],
    )
    done_when = ask("Done when (Enter to skip): ")

    number = github.create_issue(
        title, [kind, area], milestone, f"Done when {done_when}" if done_when else ""
    )
    print(f"Created #{number}. It's in Ready on the board.")

    # Only the admin assigns tasks
    if not github.is_admin:
        print("The admin assigns it.")
        return
    user = ask("Assign to (a username, @me, or Enter to leave it unassigned): ")
    if user:
        assign.give(github, number, user)


def _options(labels: list[Label]) -> list[tuple[str, str]]:
    # "type: feat" shows as "feat - A new feature"
    return [
        (label.name, f"{label.name.partition(': ')[2]} - {label.description}")
        for label in labels
    ]
