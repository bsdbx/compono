#!/bin/sh
set -eu

UV_VERSION=0.12.24

cd "$(dirname "$0")"
# Where uv's installer puts uv, in case this shell hasn't picked it up yet.
PATH="$PATH:${XDG_BIN_HOME:-$HOME/.local/bin}"

if ! command -v uv >/dev/null 2>&1; then
	echo "==> Installing uv $UV_VERSION"
	curl -LsSf "https://astral.sh/uv/$UV_VERSION/install.sh" | sh
elif [ "$(uv --version | cut -d' ' -f2)" != "$UV_VERSION" ]; then
	echo "==> Warning: you have uv $(uv --version | cut -d' ' -f2), the team uses $UV_VERSION"
fi

echo "==> Installing Python and backend dependencies"
uv --directory backend sync --locked

echo "==> Enabling Git hooks"
if git rev-parse --git-dir >/dev/null 2>&1; then
	git config core.hooksPath .githooks
else
	echo "    Skipped: this folder is not a Git repository. Run ./install.sh again after git init."
fi

# On macOS, `code` is only on PATH after "Install 'code' command" in VS Code.
PATH="$PATH:/Applications/Visual Studio Code.app/Contents/Resources/app/bin"
if command -v code >/dev/null 2>&1; then
	echo "==> Installing VS Code extensions"
	for ext in $(grep -oE '[A-Za-z0-9-]+\.[A-Za-z0-9-]+' .vscode/extensions.json); do
		code --install-extension "$ext"
	done
fi

echo "==> Done"
