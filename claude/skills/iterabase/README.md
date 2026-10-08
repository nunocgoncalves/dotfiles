# iterabase — Claude Code plugin

Claude Code port of the pi workflows in `~/dotfiles/pi/agent`. The same split
applies (see [`WORKFLOW_STANDARD.md`](WORKFLOW_STANDARD.md)): **skills own
judgment**, **MCP servers and hooks own deterministic mechanics**, and
Obsidian / Linear / GitHub / the repositories own durable state.

## Install

Stowed from `~/dotfiles` into `~/.claude`, where Claude Code auto-loads it as
the `iterabase@skills-dir` plugin. No install step is needed: the servers and
hooks are TypeScript that Node (≥ 23.6) runs directly, with no dependencies.

```sh
cd ~/dotfiles && stow --target="$HOME/.claude" claude
```

Then start a new session, or run `/reload-plugins`. Requires `LINEAR_API_KEY`
in the environment that launches Claude Code, and an authenticated `gh`.

## Components

| pi | Claude Code |
| --- | --- |
| `extensions/linear` | `servers/linear` MCP server — the same 12 `linear_*` tools |
| `extensions/review-workflow` tools | `servers/review` MCP server — the same `review_*`, `worktree_*`, and `open_pr` tools |
| `review-workflow` `tool_call` guard | `hooks/guard-gh.ts` (PreToolUse on Bash) blocks raw `gh pr comment/review` and `gh api …/comments|reviews` |
| `review-workflow` `before_agent_start` | `hooks/context.ts` (SessionStart + UserPromptSubmit) names the primary checkout and the active review PR/mode |
| `review-workflow` `pi.appendEntry` state | in-memory per session, mirrored to `~/.local/state/iterabase/review-sessions/<session>.json` |
| `macos-notify.ts` + `/notify` | `hooks/notify.ts` (Stop + Notification) + `/notify` |
| `engineering-workflow`, `product-workflow` commands | alias/chooser skills: `/engineering`, `/start-ticket`, `/product`, `/product-opportunity`, `/product-weekly`, `/product-status` |
| `skills/*` | `skills/*` — `code-review` is renamed **`review-pr`** so the built-in `/code-review` does not shadow it |

Tool names are unchanged, so skill text such as "call `linear_update_issue`"
works as-is (Claude Code exposes them as `mcp__plugin_iterabase_linear__…`).

GitHub markers are unchanged (`<!-- pi-code-review … -->`), so PRs reviewed
from pi and Claude Code share one state machine and can switch harness mid-loop.
The worktree convention (`$PI_WORKTREE_ROOT`, default `~/Developer/worktrees`)
is also shared.

## Lifecycle

```text
/product-to-engineering
  → /start-ticket HOR-123
  → implementation → /open-pr HOR-123 → CI
  → /review-pr <PR> ⇄ /address-review <PR>     (separate reviewer and author sessions)
  → user merge
  → /release-ticket HOR-123                     (only when publication is required)
  → /accept-ticket HOR-123
  → /product-release-review <project>
```

## Notes

- `review_init` (review mode), `open_pr`, `review_post_response_summary`, and
  `review_mark_terminal` wait for CI, which can take up to 45 minutes. Claude
  Code's default MCP tool timeout (~28h) covers that; only a lowered
  `MCP_TOOL_TIMEOUT` would cut it short. Esc cancels the wait.
- Reviewer-only tools (`review_resolve_thread`, `review_mark_terminal`,
  `review_require_correction`) require a prior `review_init mode="review"` in
  the same session. The mode survives `--resume` through the state file.
- `/notify` settings live in `~/.config/iterabase/notify.json`.

## Tests

```sh
cd servers/review && bun test
```
