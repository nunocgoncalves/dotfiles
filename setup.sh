#!/usr/bin/env bash

xargs brew install < ./homebrew/leaves.txt

# Install tmux plugin manager
TMUX_TARGET_DIR="$HOME/.tmux/plugins/tpm"

if [ -d "$TMUX_TARGET_DIR" ]; then
    echo "The directory $TMUX_TARGET_DIR already exists. Skipping clone operation."
else
    echo "Cloning tmux plugin manager..."
    git clone https://github.com/tmux-plugins/tpm "$TMUX_TARGET_DIR"
    
    if [ $? -eq 0 ]; then
        echo "Successfully cloned tmux plugin manager to $TMUX_TARGET_DIR"
    else
        echo "Failed to clone tmux plugin manager"
        exit 1
    fi
fi

# Stow the dotfiles
stow --target="$HOME/" gitconfig
stow --target="$HOME/Library/Application Support/k9s" k9s
stow --target="$HOME/.config/nvim" nvim
stow --target="$HOME/.ssh/" sshconfig
stow --target="$HOME/.config/" starship
stow --target="$HOME/.config/tmux" tmux
stow --target="$HOME/Library/LaunchAgents/" trezor
stow --target="$HOME/" wezterm
stow --target="$HOME/" zshrc

# Setup trezor-agent socket directory
mkdir -p ~/.trezor-agent
chmod 700 ~/.trezor-agent

# Setup launch agents
mkdir -p /Users/nunogoncalves/.trezor-agent/
chmod 700 /Users/nunogoncalves/.trezor-agent/
launchctl load ~/Library/LaunchAgents/com.trezor.agent.plist
