#!/bin/sh
# Create, assign, start and submit tasks. See ./tasks.sh --help
# The code is in tools/tasks/.

cd "$(dirname "$0")/tools" || exit 1
# Where uv's installer puts uv, in case this shell hasn't picked it up yet.
PATH="$PATH:${XDG_BIN_HOME:-$HOME/.local/bin}"

exec uv run -q --frozen --project ../backend python -m tasks "$@"
