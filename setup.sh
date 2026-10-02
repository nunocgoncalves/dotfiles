#!/usr/bin/env bash
#
# Dotfiles installer — see README.md
# Idempotent: safe to re-run.
#
set -euo pipefail

DOTFILES="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ---------------------------------------------------------------------------
# 1. Homebrew packages (intentional/leaf set only — deps resolve automatically)
# ---------------------------------------------------------------------------
if ! command -v brew >/dev/null 2>&1; then
    echo "error: Homebrew not found. Install it first: https://brew.sh" >&2
    exit 1
fi

echo "==> Installing Homebrew packages"
brew bundle --file="$DOTFILES/homebrew/Brewfile"

# ---------------------------------------------------------------------------
# 2. tmux plugin manager
# ---------------------------------------------------------------------------
TPM_DIR="$HOME/.tmux/plugins/tpm"
if [ -d "$TPM_DIR" ]; then
    echo "==> tpm already installed, skipping"
else
    echo "==> Installing tmux plugin manager"
    git clone https://github.com/tmux-plugins/tpm "$TPM_DIR"
fi

# ---------------------------------------------------------------------------
# 3. Stow the dotfiles
#    Each package is stowed into the location the consuming tool expects.
# ---------------------------------------------------------------------------
echo "==> Stowing dotfiles"
stow --target="$HOME"                                  gitconfig
stow --target="$HOME"                                  zshrc
stow --target="$HOME/.ssh"                             sshconfig
stow --target="$HOME/.config"                          starship
stow --target="$HOME/.config"                          ghostty
stow --target="$HOME/.config/nvim"                     nvim
stow --target="$HOME/.config/tmux"                     tmux
stow --target="$HOME/Library/Application Support/k9s"  k9s

echo
echo "==> Done. Open a new shell."
echo "    tmux: press prefix + I to install plugins."
