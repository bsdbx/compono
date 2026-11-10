#!/bin/sh

cd "$(dirname "$0")" || exit 1
# Where uv's installer puts uv, in case this shell hasn't picked it up yet.
PATH="$PATH:${XDG_BIN_HOME:-$HOME/.local/bin}"
# Where pnpm's installer puts pnpm, on Linux and on macOS.
PATH="$PATH:${XDG_DATA_HOME:-$HOME/.local/share}/pnpm/bin:$HOME/Library/pnpm/bin"

status=0 # Check if anything failed
# Run `ruff` for Python fixes and then format Python
uv run -q --frozen --project backend ruff check --fix || status=1
uv run -q --frozen --project backend ruff format || status=1

# Run `tombi` to format TOML
uv run -q --frozen --project backend tombi format || status=1

# Run `rumdl` to format Markdown
uv run -q --frozen --project backend rumdl fmt || status=1

# Run `shfmt` to format Shell scripts.
uv run -q --frozen --project backend shfmt -w . || status=1

# Run `biome` to fix and format TypeScript, JSON and CSS, from frontend/ over the whole repo
pnpm --dir frontend exec biome check --write .. || status=1
exit $status
