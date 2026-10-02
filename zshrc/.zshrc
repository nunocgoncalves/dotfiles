# ===========================================================================
#  ~/.zshrc — stowed from ~/dotfiles/zshrc/.zshrc
#
#  Layout (order matters):
#    1. shell options
#    2. environment variables
#    3. PATH
#    4. completions
#    5. prompt + interactive helpers
#    6. aliases          <- must precede functions (zsh expands aliases at parse time)
#    7. functions
#    8. zsh-syntax-highlighting (must be last)
# ===========================================================================

# ---------------------------------------------------------------------------
# 1. Shell options
# ---------------------------------------------------------------------------
setopt prompt_subst          # re-expand the prompt on every render
setopt HIST_IGNORE_ALL_DUPS  # don't record duplicate history entries

# ---------------------------------------------------------------------------
# 2. Environment
# ---------------------------------------------------------------------------
export LANG=en_US.UTF-8
export EDITOR=/opt/homebrew/bin/nvim
export OBSIDIAN_HOME="$HOME/Documents/2nd-brain"

# Go
export GOPATH="$HOME/go"
export GOCACHE="$HOME/Library/Caches/go-build"

# Kubernetes
export KUBECONFIG="$HOME/.kube/config"

# pnpm
export PNPM_HOME="$HOME/Library/pnpm"

# fzf — use fd for candidate listings (fast, respects .gitignore)
export FZF_DEFAULT_COMMAND='fd --type f --hidden --follow --exclude .git'

# Compiler flags for multi-target (pcsc-lite / YubiKey) builds
export LDFLAGS="-L/opt/homebrew/opt/pcsc-lite/lib"
export CPPFLAGS="-I/opt/homebrew/opt/pcsc-lite/include"

# API keys live in an untracked, gitignored file — never commit secrets
[ -f "$HOME/.config/zsh/secrets.zsh" ] && source "$HOME/.config/zsh/secrets.zsh"

# ---------------------------------------------------------------------------
# 3. PATH — most-specific first. Always prepend/append, never replace
#    (replacing discards the base PATH set by /etc/zprofile path_helper).
# ---------------------------------------------------------------------------
export PATH="$HOME/.opencode/bin:/opt/homebrew/opt/libpq/bin:$PNPM_HOME:/opt/homebrew/bin:$PATH:$GOPATH/bin:$HOME/.local/bin"

# ---------------------------------------------------------------------------
# 4. Completions
# ---------------------------------------------------------------------------
autoload -Uz compinit
autoload bashcompinit && bashcompinit

# Rebuild the completion dump at most once every 24h; use the cache otherwise.
if [[ -n "${ZDOTDIR:-$HOME}"/.zcompdump(#qN.mh+24) ]]; then
    compinit
else
    compinit -C
fi

# kubectl completion — cached, so we don't spawn kubectl on every shell start
_kubectl_comp="${XDG_CACHE_HOME:-$HOME/.cache}/zsh/kubectl-completion.zsh"
if [[ ! -s "$_kubectl_comp" || "$(command -v kubectl)" -nt "$_kubectl_comp" ]]; then
    mkdir -p "${_kubectl_comp:h}"
    kubectl completion zsh > "$_kubectl_comp" 2>/dev/null
fi
[[ -s "$_kubectl_comp" ]] && source "$_kubectl_comp"
unset _kubectl_comp

# aws completion (guard: only if the completer exists)
[[ -x /opt/homebrew/bin/aws_completer ]] && complete -C '/opt/homebrew/bin/aws_completer' aws

# Google Cloud SDK
[ -f /opt/homebrew/share/google-cloud-sdk/path.zsh.inc ] && source /opt/homebrew/share/google-cloud-sdk/path.zsh.inc
[ -f /opt/homebrew/share/google-cloud-sdk/completion.zsh.inc ] && source /opt/homebrew/share/google-cloud-sdk/completion.zsh.inc

# fzf — key bindings + completion (Homebrew ships these).
# ZLE is required, so only load them when a tty is attached; this keeps
# non-interactive `zsh -i -c` invocations quiet.
if [[ -o interactive && -t 0 ]]; then
    [ -f /opt/homebrew/opt/fzf/shell/completion.zsh ] && source /opt/homebrew/opt/fzf/shell/completion.zsh
    [ -f /opt/homebrew/opt/fzf/shell/key-bindings.zsh ] && source /opt/homebrew/opt/fzf/shell/key-bindings.zsh
fi

# ---------------------------------------------------------------------------
# 5. Prompt + interactive helpers
# ---------------------------------------------------------------------------
export STARSHIP_CONFIG="$HOME/.config/starship.toml"
eval "$(starship init zsh)"

source /opt/homebrew/share/zsh-autosuggestions/zsh-autosuggestions.zsh
bindkey '^w' autosuggest-execute
bindkey '^e' autosuggest-accept

# ---------------------------------------------------------------------------
# 6. Aliases
# ---------------------------------------------------------------------------
# --- file/listing helpers
alias cat=bat
alias la=tree
alias l="eza -l --icons --git -a"
alias lt="eza --tree --level=2 --long --icons --git"
alias cl='clear'

# --- git
alias gc="git commit -m"
alias gca="git commit -a -m"
alias gp="git push origin HEAD"
alias gpu="git pull origin"
alias gst="git status"
alias glog="git log --graph --topo-order --pretty='%w(100,0,6)%C(yellow)%h%C(bold)%C(black)%d %C(cyan)%ar %C(green)%an%n%C(bold)%C(white)%s %N' --abbrev-commit"
alias gdiff="git diff"
alias gco="git checkout"
alias gb='git branch'
alias gba='git branch -a'
alias gadd='git add'
alias ga='git add -p'
alias gcoall='git checkout -- .'
alias gr='git remote'
alias gre='git reset'

# --- docker
alias dco="docker compose"
alias dps="docker ps"
alias dpa="docker ps -a"
alias dl="docker ps -l -q"
alias dx="docker exec -it"

# --- kubernetes
alias k="kubectl"
alias ka="kubectl apply -f"
alias kg="kubectl get"
alias kd="kubectl describe"
alias kdel="kubectl delete"
alias kgpo="kubectl get pod"
alias kgd="kubectl get deployments"
alias kl="kubectl logs -f"
alias ke="kubectl exec -it"
alias kcns='kubectl config set-context --current --namespace'

# --- navigation
alias ..="cd .."
alias ...="cd ../.."
alias ....="cd ../../.."
alias .....="cd ../../../.."
alias ......="cd ../../../../.."

# --- misc
alias v="/opt/homebrew/bin/nvim"
alias http="xh"
alias nm="nmap -sC -sV -oN nmap"
alias server='python3 -m http.server 4445'
alias rr='ranger'
alias mat='osascript -e "tell application \"System Events\" to key code 126 using {command down}" && tmux neww "cmatrix"'

# ---------------------------------------------------------------------------
# 7. Functions
# ---------------------------------------------------------------------------
# ranger wrapper: cd to the directory you last browsed on exit
function ranger {
    local IFS=$'\t\n'
    local tempfile="$(mktemp -t tmp.XXXXXX)"
    local ranger_cmd=(
        command
        ranger
        --cmd="map Q chain shell echo %d > "$tempfile"; quitall"
    )

    ${ranger_cmd[@]} "$@"
    if [[ -f "$tempfile" ]] && [[ "$(cat -- "$tempfile")" != "$(echo -n `pwd`)" ]]; then
        cd -- "$(cat "$tempfile")" || return
    fi
    command rm -f -- "$tempfile" 2>/dev/null
}

# --- fzf-powered navigation (fd for candidates; guarded against empty selection)
cx()  { cd "$@" && l; }
fcd() { local d; d=$(fd --type d | fzf) && [[ -n $d ]] && cd "$d" && l; }
f()   { local x; x=$(fd --type f | fzf) && [[ -n $x ]] && printf '%s' "$x" | pbcopy; }
fv()  { local x; x=$(fd --type f | fzf) && [[ -n $x ]] && nvim "$x"; }

eval "$(zoxide init zsh)"

# ---------------------------------------------------------------------------
# 8. MUST BE LAST — zsh-syntax-highlighting wraps ZLE widgets/bindkeys
# ---------------------------------------------------------------------------
ZSH_HIGHLIGHT_FILE="/opt/homebrew/share/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh"
[ -f "$ZSH_HIGHLIGHT_FILE" ] && source "$ZSH_HIGHLIGHT_FILE"
unset ZSH_HIGHLIGHT_FILE
