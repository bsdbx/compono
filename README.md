# Compono

See [PROPOSAL.md](PROPOSAL.md) for what we are building.

## Setup

Run this once after cloning. On Windows, run it in Git Bash, which comes with [Git for Windows](https://gitforwindows.org/).

```sh
./install.sh
```

After that, the Git hooks keep `backend/.venv` up to date when you pull. Run the backend with:

```sh
cd backend
uv run compono
```

> **Compono** team suggests using [Visual Studio Code] for development of this project.

## Working on the backend

All backend code lives in the `compono` package, in `backend/src/compono/`. Run [uv] commands from `backend/`.

After dependencie change (e.g `uv add`, `uv remove`), commit `pyproject.toml` and `uv.lock` **TOGETHER**!

> If using [Visual Studio Code]: select `backend/.venv` as the Python interpreter.

### Typing

[mypy] runs in its strictest mode, so some ordinary-looking code is rejected. To see what is checked:

- `strict = true` turns on [mypy]'s standard strict checks, described under [`--strict`](https://mypy.readthedocs.io/en/stable/command_line.html#cmdoption-mypy-strict) in the [mypy] docs.
- Everything stricter than that is listed under `[tool.mypy]` in [backend/pyproject.toml](backend/pyproject.toml).

If a library makes a rule impossible to follow, relax that rule for the affected module only, never for the whole project:

```toml
[[tool.mypy.overrides]]
module = ["compono.api.*"]
disallow_any_expr = false
```

## Formatting

Run `./format.sh` to format files across the whole codebase.

The pre-commit hook checks the same things. To run its checks without committing, stage your changes and run `.githooks/pre-commit`.

> If using [Visual Studio Code]: files are formatted on save.

## Commit messages

We use [Conventional Commits](https://www.conventionalcommits.org/). The first line is `<type>(<scope>): <Summary>.` `scope` is optional

First word **must** be a **verb** from [.githooks/verbs.txt](.githooks/verbs.txt). If a verb you need is missing, add it to the list.

For more information: [cchk.toml](cchk.toml), read by [commit-check](https://github.com/commit-check/commit-check), and in [.githooks/verbs.txt](.githooks/verbs.txt).

[Visual Studio Code]: https://github.com/microsoft/vscode.git
[uv]: https://docs.astral.sh/uv/
[mypy]: https://mypy.readthedocs.io/
