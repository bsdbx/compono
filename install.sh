#!/bin/sh
set -eu

UV_VERSION=0.12.24

cd "$(dirname "$0")"
# Where uv's installer puts uv, in case this shell hasn't picked it up yet.
PATH="$PATH:${XDG_BIN_HOME:-$HOME/.local/bin}"
# Where pnpm's installer puts pnpm, on Linux and on macOS.
PATH="$PATH:${XDG_DATA_HOME:-$HOME/.local/share}/pnpm/bin:$HOME/Library/pnpm/bin"

# If UV is not installed - install the correct version.
# If UV_VERSION doesn't match - warn the developer.
if ! command -v uv >/dev/null 2>&1; then
	echo "==> Installing uv $UV_VERSION"
	curl -LsSf "https://astral.sh/uv/$UV_VERSION/install.sh" | sh
elif [ "$(uv --version | cut -d' ' -f2)" != "$UV_VERSION" ]; then
	echo "==> Warning: you have uv $(uv --version | cut -d' ' -f2), the team uses $UV_VERSION"
fi

# Install Python + create/update .venv to match uv.lock
echo "==> Installing Python and backend dependencies"
uv --directory backend sync --locked

# If pnpm is not installed - install the version that frontend/package.json pins.
# Whichever version is installed, pnpm switches to the pinned one in frontend/ by itself.
PNPM_VERSION=$(sed -n 's/.*"packageManager": "pnpm@\([^"]*\)".*/\1/p' frontend/package.json)
if ! command -v pnpm >/dev/null 2>&1; then
	echo "==> Installing pnpm $PNPM_VERSION"
	curl -fsSL https://get.pnpm.io/install.sh | env PNPM_VERSION="$PNPM_VERSION" sh -
fi
# On Windows, pnpm's installer adds pnpm to PATH for new terminals only.
if ! command -v pnpm >/dev/null 2>&1; then
	echo "==> pnpm is installed. Open a new terminal, then run ./install.sh again."
	exit 1
fi

# Install Node.js + frontend/node_modules to match pnpm-lock.yaml
echo "==> Installing Node.js and frontend dependencies"
pnpm --dir frontend install --frozen-lockfile

# If this is a git repository - tell Git to use our .githooks/*
echo "==> Enabling Git hooks"
if git rev-parse --git-dir >/dev/null 2>&1; then
	git config core.hooksPath .githooks
	# Forget branches that were deleted on GitHub on every fetch, so the hooks can clean up merged ones
	git config fetch.prune true
else
	echo "    Skipped: this folder is not a Git repository. Run ./install.sh again after git init."
fi

# On macOS, `code` is only on PATH after "Install 'code' command" in VS Code.
PATH="$PATH:/Applications/Visual Studio Code.app/Contents/Resources/app/bin"

# If `code` is installed - pull every extension ID out of .vscode/extensions.json and install each one
if command -v code >/dev/null 2>&1; then
	echo "==> Installing VS Code extensions"
	for ext in $(grep -oE '[A-Za-z0-9-]+\.[A-Za-z0-9-]+' .vscode/extensions.json); do
		code --install-extension "$ext"
	done
fi

echo "==> Done"
