"""Talks to GitHub through the gh command line tool, as the user logged in to it."""

import shutil
import subprocess
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from functools import cached_property

from tasks import TaskError
from tasks.git import MAIN

START_WORKFLOW = "start-task.yml"

# The --jq programs below print one line per item, with its fields separated by
# this character, which can't appear in a title. Lists inside a field use commas,
# which can't appear in logins, and which gh already treats as separators in labels.
_FIELD = "\x1f"

_ISSUE_FIELDS = "number,title,state,assignees,labels"
_ISSUE_JQ = (
    r'"\(.number)\u001f\(.title)\u001f\(.state)\u001f'
    r'\([.assignees[].login] | join(","))\u001f\([.labels[].name] | join(","))"'
)

_TASK_BRANCH_QUERY = """
query($owner: String!, $name: String!, $number: Int!, $search: String!) {
  repository(owner: $owner, name: $name) {
    issue(number: $number) {
      linkedBranches(first: 1) { nodes { ref { name } } }
      closedByPullRequestsReferences(first: 1, includeClosedPrs: false) { nodes { headRefName } }
    }
    refs(refPrefix: "refs/heads/", query: $search, first: 20) { nodes { name } }
  }
}
"""


type _Option = str | int | bool | Sequence[str] | None


@dataclass(frozen=True)
class Issue:
    """A task."""

    number: int
    title: str
    is_open: bool
    assignees: tuple[str, ...]
    labels: tuple[str, ...]

    @property
    def type(self) -> str | None:
        """The type from its "type: ..." label, which its branch name starts with."""
        for label in self.labels:
            if label.startswith("type: "):
                return label.removeprefix("type: ")
        return None

    @property
    def summary(self) -> str:
        """One line for menus, like "#12 Add share links (bsdbx)"."""
        assigned = f" ({', '.join(self.assignees)})" if self.assignees else ""
        return f"#{self.number} {self.title}{assigned}"


@dataclass(frozen=True)
class Label:
    name: str
    description: str


@dataclass(frozen=True)
class Milestone:
    title: str
    due: str


@dataclass(frozen=True)
class PullRequest:
    number: int
    title: str
    author: str

    @property
    def summary(self) -> str:
        """One line for menus, like "#13 Add share links (bsdbx)"."""
        return f"#{self.number} {self.title} ({self.author})"


def _run(
    command: str, arguments: Sequence[str], options: Mapping[str, _Option]
) -> subprocess.CompletedProcess[str]:
    """Runs `gh <command> <arguments>`, with each option as --<name> <value>."""
    flags: list[str] = []
    for name, value in options.items():
        flag = "--" + name.replace("_", "-")
        if value is None or value is False:
            continue
        if value is True:
            flags.append(flag)
        elif isinstance(value, str | int):
            flags += [flag, str(value)]
        else:
            flags += [part for item in value for part in (flag, item)]

    return subprocess.run(
        ["gh", *command.split(), *arguments, *flags],
        check=False,
        capture_output=True,
        text=True,
        stdin=subprocess.DEVNULL,
    )


# The helpers below take options as keywords: _gh("pr list", head="main", state="open")
# runs gh pr list --head main --state open


def _gh(command: str, *arguments: str, **options: _Option) -> str:
    """Runs gh and returns what it printed. Raises TaskError if it fails."""
    result = _run(command, arguments, options)
    if result.returncode != 0:
        raise TaskError(result.stderr.strip() or f"gh {command} failed.")
    return result.stdout


def _status(command: str, *arguments: str, **options: _Option) -> int:
    """Runs gh and returns its exit code."""
    return _run(command, arguments, options).returncode


def _output(command: str, *arguments: str, **options: _Option) -> str:
    """Runs gh and returns the one value it printed."""
    return _gh(command, *arguments, **options).strip()


def _rows(command: str, *arguments: str, **options: _Option) -> list[list[str]]:
    """Runs gh with a --jq that prints one line per item, and returns their fields."""
    # Not splitlines() or strip(): they treat the field separator as a line break or a space
    lines = _gh(command, *arguments, **options).split("\n")
    return [line.split(_FIELD) for line in lines if line]


def _issue(fields: list[str]) -> Issue:
    number, title, state, assignees, labels = fields
    return Issue(
        int(number), title, state == "OPEN", _entries(assignees), _entries(labels)
    )


def _entries(field: str) -> tuple[str, ...]:
    return tuple(field.split(",")) if field else ()


class GitHub:
    """The repository on GitHub."""

    def __init__(self) -> None:
        if shutil.which("gh") is None:
            raise TaskError("Install the GitHub CLI first: https://cli.github.com")

    @cached_property
    def me(self) -> str:
        """The login of the user running this."""
        return _output("api", "user", jq=".login")

    @cached_property
    def repository(self) -> str:
        """The repository, as owner/name."""
        return _output("repo view", json="nameWithOwner", jq=".nameWithOwner")

    @cached_property
    def is_admin(self) -> bool:
        """Whether the user running this is an admin of the repository."""
        return (
            _output("api", f"repos/{self.repository}", jq=".permissions.admin")
            == "true"
        )

    def collaborators(self) -> list[str]:
        """The logins of everyone who has access to the repository."""
        return _output(
            "api", f"repos/{self.repository}/collaborators", jq=".[].login"
        ).split()

    def labels(self, prefix: str) -> list[Label]:
        """The labels named "<prefix>: ...", like "type: feat"."""
        rows = _rows(
            "label list",
            repo=self.repository,
            limit=100,
            json="name,description",
            jq=r'.[] | "\(.name)\u001f\(.description)"',
        )
        return [
            Label(name, about) for name, about in rows if name.startswith(f"{prefix}: ")
        ]

    def milestones(self) -> list[Milestone]:
        """The open milestones, soonest first."""
        rows = _rows(
            "api",
            f"repos/{self.repository}/milestones?state=open&sort=due_on&direction=asc",
            jq=r'.[] | "\(.title)\u001f\(.due_on // "" | .[:10])"',
        )
        return [Milestone(title, due) for title, due in rows]

    def create_issue(
        self, title: str, labels: Sequence[str], milestone: str, body: str
    ) -> int:
        """Creates an issue and returns its number."""
        url = _output(
            "issue create",
            repo=self.repository,
            title=title,
            label=labels,
            milestone=milestone,
            body=body,
        )
        return int(url.rpartition("/")[2])

    def open_issues(self, assignee: str | None = None) -> list[Issue]:
        """The open issues, or only those assigned to `assignee`."""
        rows = _rows(
            "issue list",
            repo=self.repository,
            state="open",
            assignee=assignee,
            limit=100,
            json=_ISSUE_FIELDS,
            jq=f".[] | {_ISSUE_JQ}",
        )
        return [_issue(row) for row in rows]

    def issue(self, number: int) -> Issue:
        """The issue with this number."""
        rows = _rows(
            "issue view",
            str(number),
            repo=self.repository,
            json=_ISSUE_FIELDS,
            jq=_ISSUE_JQ,
        )
        return _issue(rows[0])

    def assign(self, number: int, user: str, unassign: Sequence[str] = ()) -> None:
        """Assigns the issue to `user`, and unassigns the users in `unassign`."""
        _gh(
            "issue edit",
            str(number),
            repo=self.repository,
            add_assignee=user,
            remove_assignee=",".join(unassign) or None,
        )

    def task_branch(self, number: int) -> str | None:
        """The branch of the task, or None if it hasn't been started.

        The Start task workflow links the branch it creates to the issue, but GitHub swaps
        that link for the pull request's once one is opened from the branch. So this looks
        for either, and then for a branch named like the task's: <type>/<number>-<title>.
        """
        owner, _, name = self.repository.partition("/")
        branch = _output(
            "api graphql",
            field=[f"number={number}"],
            raw_field=[
                f"owner={owner}",
                f"name={name}",
                f"search=/{number}",
                f"query={_TASK_BRANCH_QUERY}",
            ],
            jq=".data.repository"
            " | .issue.linkedBranches.nodes[0].ref.name"
            " // .issue.closedByPullRequestsReferences.nodes[0].headRefName"
            f' // ([.refs.nodes[].name | select(test("^[a-z]+/{number}(-|$)"))][0])'
            " // empty",
        )
        return branch or None

    def start(self, number: int) -> None:
        """Runs the Start task workflow, which creates the task's branch and moves it to In progress."""
        _gh(
            "workflow run",
            START_WORKFLOW,
            repo=self.repository,
            raw_field=[f"issue={number}"],
        )

    def open_pull_request(self, branch: str) -> int | None:
        """The number of the open pull request from `branch`, if there is one."""
        number = _output(
            "pr list",
            repo=self.repository,
            head=branch,
            state="open",
            json="number",
            jq=".[0].number // empty",
        )
        return int(number) if number else None

    def open_pull_requests(self) -> list[PullRequest]:
        """The open pull requests, newest first."""
        rows = _rows(
            "pr list",
            repo=self.repository,
            state="open",
            limit=100,
            json="number,title,author",
            jq=r'.[] | "\(.number)\u001f\(.title)\u001f\(.author.login)"',
        )
        return [
            PullRequest(int(number), title, author) for number, title, author in rows
        ]

    def pull_request(self, number: int) -> PullRequest:
        """The pull request with this number."""
        rows = _rows(
            "pr view",
            str(number),
            repo=self.repository,
            json="number,title,author",
            jq=r'"\(.number)\u001f\(.title)\u001f\(.author.login)"',
        )
        number_field, title, author = rows[0]
        return PullRequest(int(number_field), title, author)

    def pull_request_head(self, pull_request: int) -> str:
        """The pull request's last commit."""
        return _output(
            "pr view",
            str(pull_request),
            repo=self.repository,
            json="headRefOid",
            jq=".headRefOid",
        )

    def approve(self, pull_request: int) -> None:
        """Approves the pull request, as the user running this."""
        _gh("pr review", str(pull_request), repo=self.repository, approve=True)

    def create_pull_request(
        self, branch: str, title: str, body: str, reviewers: Sequence[str]
    ) -> int:
        """Opens a pull request from `branch` into main, and returns its number."""
        url = _output(
            "pr create",
            repo=self.repository,
            base=MAIN,
            head=branch,
            title=title,
            body=body,
            reviewer=",".join(reviewers) or None,
        )
        return int(url.rpartition("/")[2])

    def checks_started(self, pull_request: int, commit: str) -> bool:
        """Whether GitHub has `commit` as the pull request's last commit, and CI has started on it."""
        head, _, count = _output(
            "pr view",
            str(pull_request),
            repo=self.repository,
            json="headRefOid,statusCheckRollup",
            jq=r'"\(.headRefOid) \(.statusCheckRollup | length)"',
        ).partition(" ")
        return head == commit and count != "0"

    def checks_pass(self, pull_request: int) -> bool:
        """Waits for the pull request's checks to finish, and returns whether they all passed."""
        status = _status(
            "pr checks",
            str(pull_request),
            repo=self.repository,
            watch=True,
            interval=10,
        )
        return status == 0

    def failed_checks(self, pull_request: int) -> list[str]:
        """The checks that failed on the pull request, as "<workflow> / <check>: <link>"."""
        # gh exits with an error when checks failed, so this reads what it printed regardless
        result = _run(
            "pr checks",
            [str(pull_request)],
            {
                "repo": self.repository,
                "json": "workflow,name,bucket,link",
                "jq": r'.[] | select(.bucket == "fail") | "\(.workflow) / \(.name): \(.link)"',
            },
        )
        return result.stdout.splitlines()

    def review_decision(self, pull_request: int) -> str:
        """APPROVED, CHANGES_REQUESTED or REVIEW_REQUIRED."""
        return _output(
            "pr view",
            str(pull_request),
            repo=self.repository,
            json="reviewDecision",
            jq=".reviewDecision",
        )

    def merge(self, pull_request: int, *, as_admin: bool = False) -> None:
        """Rebases the pull request onto main. As admin, by bypassing the rules that only the admin may."""
        _gh(
            "pr merge",
            str(pull_request),
            repo=self.repository,
            rebase=True,
            admin=as_admin,
        )

    def merged_head(self, branch: str) -> str | None:
        """The last commit of the merged pull request from `branch`, or None if none was merged."""
        commit = _output(
            "pr list",
            repo=self.repository,
            head=branch,
            state="merged",
            limit=1,
            json="headRefOid",
            jq=".[0].headRefOid // empty",
        )
        return commit or None
