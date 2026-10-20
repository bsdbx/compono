#!/bin/sh

cd "$(dirname "$0")" || exit 1
# Where uv's installer puts uv, in case this shell hasn't picked it up yet.
PATH="$PATH:${XDG_BIN_HOME:-$HOME/.local/bin}"

status=0
uv run -q --frozen --project backend ruff check --fix || status=1
uv run -q --frozen --project backend ruff format || status=1
uv run -q --frozen --project backend tombi format || status=1
uv run -q --frozen --project backend rumdl fmt || status=1
uv run -q --frozen --project backend shfmt -w . || status=1
exit $status
