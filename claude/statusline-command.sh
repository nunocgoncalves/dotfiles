#!/usr/bin/env bash
# Status line: cwd, branch, ticket, PR + CI state, Sol review round, context, model.
# PR/CI come from a 60 s cache refreshed in the background, so this never waits on gh.
input=$(cat)
cwd=$(jq -r '.workspace.current_dir // .cwd // empty' <<<"$input")
model=$(jq -r '.model.display_name // empty' <<<"$input")
used=$(jq -r '.context_window.used_percentage // empty' <<<"$input")
dir="${cwd/#\~/$HOME}"
short="$cwd"; case "$cwd" in "$HOME"*) short="~${cwd#"$HOME"}";; esac

branch=$(GIT_OPTIONAL_LOCKS=0 git -C "$dir" rev-parse --abbrev-ref HEAD 2>/dev/null || true)
ticket=$(grep -oE '^[A-Z]+-[0-9]+' <<<"$branch" || true)

pr=""
if [ -n "$ticket" ]; then
  cache_dir="$HOME/.cache/statusline"; mkdir -p "$cache_dir"
  key=$(printf '%s' "$dir|$branch" | shasum | cut -c1-16); cache="$cache_dir/$key.json"
  age=$(( $(date +%s) - $(stat -f %m "$cache" 2>/dev/null || echo 0) ))
  if [ "$age" -gt 60 ]; then
    touch "$cache"
    ( cd "$dir" && gh pr view "$branch" --json number,isDraft,statusCheckRollup >"$cache.tmp" 2>/dev/null && mv "$cache.tmp" "$cache" ) >/dev/null 2>&1 &
    disown 2>/dev/null || true
  fi
  if [ -s "$cache" ]; then
    pr=$(jq -r '
      (.statusCheckRollup // []) as $c
      | (if ($c|length)==0 then "no CI"
         elif any($c[]; (.conclusion // .state) as $s | $s=="FAILURE" or $s=="CANCELLED" or $s=="TIMED_OUT" or $s=="ERROR") then "CI ✗"
         elif any($c[]; (.status // "") != "COMPLETED" and (.state // "") != "SUCCESS") then "CI …"
         else "CI ✓" end) as $ci
      | " #\(.number)\(if .isDraft then " draft" else "" end) \($ci)"' "$cache" 2>/dev/null)
  fi
  rounds=$(ls "$HOME/.local/state/iterabase/sol/$ticket"/round-*.json 2>/dev/null | wc -l | tr -d ' ')
  [ "${rounds:-0}" -gt 0 ] && pr="$pr · Sol r$rounds"
fi

ctx=""; [ -n "$used" ] && ctx=" | ctx: $(printf '%.0f' "$used")%"
printf "\033[1;34m%s\033[0m\033[0;36m%s\033[0m\033[1;35m%s\033[0m\033[0;32m%s\033[0m\033[0;33m%s\033[0m\033[0;90m%s\033[0m" \
  "$short" "${branch:+ on $branch}" "${ticket:+ $ticket}" "$pr" "$ctx" "${model:+ | $model}"
