# founder-input extension for pi

Provides the `request_founder_input` tool: the escalation channel for a decision
that genuinely needs the founder and cannot be discovered from canonical sources.

The tool takes one question, a recommended answer, why the decision is required
now, and optional short mutually exclusive options. It is called as the only tool
in its turn, and it stops the run — the hook blocks every dependent tool call, so
nothing proceeds on a guess. The decision is answered in the next turn of the same
session, and the workflow continues from canonical state rather than from guesswork.

The structured request is also a stable event for any external orchestrator that
drives headless runs, so the same tool serves an interactive session and a
dispatched one. No Pi process needs to stay alive while the decision is pending.

This extension is transport only. Product and engineering decisions must still
be recorded in their canonical Linear or Obsidian location when the governing
workflow requires durable approval evidence.

## Local setup

Part of the `pi` package in `~/dotfiles`, stowed to
`~/.pi/agent/extensions/founder-input`:

```sh
cd ~/dotfiles && stow --target="$HOME/.pi" pi
```

Run `/reload` in pi after installation.
