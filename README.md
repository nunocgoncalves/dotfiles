# Dotfiles

macOS dotfiles, managed with [GNU Stow](https://www.gnu.org/software/stow/) and
[Homebrew Bundle](https://github.com/Homebrew/homebrew-bundle).

**Platform:** macOS (Apple Silicon). Linux support: not yet.

## Install

```bash
git clone git@github.com:nunocgoncalves/dotfiles.git ~/dotfiles
cd ~/dotfiles
./setup.sh
```

`setup.sh` is idempotent — safe to re-run. It:

1. Installs Homebrew packages from `homebrew/Brewfile`
2. Installs the tmux plugin manager (tpm)
3. Symlinks each config into place with `stow`

## Layout

Each top-level directory is a **stow package**. The directory name maps to the
path the consuming tool expects:

| Package | Stowed to |
|---|---|
| `gitconfig/` | `~/` → `~/.gitconfig`, `~/.gitignore_global` |
| `zshrc/` | `~/` → `~/.zshrc` |
| `sshconfig/` | `~/.ssh/` → `~/.ssh/config` |
| `starship/` | `~/.config/` → `~/.config/starship.toml` |
| `ghostty/` | `~/.config/` → `~/.config/ghostty` |
| `nvim/` | `~/.config/nvim/` |
| `tmux/` | `~/.config/tmux/` |
| `k9s/` | `~/Library/Application Support/k9s/` |
| `pi/` | `~/.pi/` — `settings.json`, `keybindings.json`, `extensions/macos-notify.ts` |
| `homebrew/` | *(not stowed — reference only)* |

## Adding a new config

```bash
mkdir -p ~/dotfiles/<tool>
# put files in it, mirroring their destination layout
stow --target="<destination>" <tool>
```

Then add the corresponding `stow` line to `setup.sh` so fresh installs pick it up.

## Managing Homebrew packages

`homebrew/Brewfile` records **intentionally-installed (leaf) packages only** —
dependencies resolve automatically, which keeps `brew autoremove` working on a
fresh machine instead of marking every transitive dependency as requested.

```bash
# install everything
brew bundle --file=homebrew/Brewfile

# after installing something new, regenerate the leaf list
brew leaves | sort | sed 's/^/brew "/;s/$/"/'
brew tap        | sort | sed 's/^/tap "/;s/$/"/'
brew list --cask | sort | sed 's/^/cask "/;s/$/"/'
```

## Secrets

**Never commit secrets here.** Real API keys live in an untracked, gitignored file:

```
~/.config/zsh/secrets.zsh
```

`~/.zshrc` sources it if present (guarded with `[ -f ]`). The tracked `.zshrc`
contains no credentials. `.gitignore` covers `secrets.zsh`, `.env*`, `*.pem`,
`*.key`, `*.token`, and similar.

## Notes

- **`.zshrc` ordering matters.** Aliases are defined *before* functions because
  zsh performs alias expansion when a function is parsed, not when it runs.
  `zsh-syntax-highlighting` must be sourced **last** — it wraps ZLE widgets.
- **Startup is kept fast (~0.05s).** Expensive shell integrations are cached
  rather than regenerated per shell: `kubectl completion` is cached in
  `~/.cache/zsh/`, and `compinit` reuses its dump unless it's older than 24h.
  Avoid adding `$(some-command)` calls to `.zshrc` — each one costs a subprocess.
- **PATH entries are prepended/appended, never replaced** — replacing discards
  the base PATH from `/etc/zprofile`.
