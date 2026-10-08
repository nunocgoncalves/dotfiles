---
name: engineering
description: Choose and start an engineering ticket workflow (start, release, or accept a ticket).
argument-hint: "[start-ticket|release-ticket|accept-ticket] [HOR-123]"
disable-model-invocation: true
---

Arguments: `$ARGUMENTS`

Engineering ticket workflows:

| Command | Skill | Purpose |
| --- | --- | --- |
| `start-ticket` | `implement-ticket` | Start ticket — validate, design, implement, open PR, and wait for CI |
| `release-ticket` | `release-ticket` | Release ticket — plan, fully validate, approve, and promote the tested artifacts |
| `accept-ticket` | `accept-ticket` | Accept ticket — verify merged delivery and move to Done |

Lifecycle: `/product-to-engineering` → `/start-ticket` → implementation → `/open-pr` → `/review-pr` ⇄ `/address-review` → user merge → `/release-ticket` (only when publication is required) → `/accept-ticket` → `/product-release-review`.

1. If the first argument names a workflow (by command or skill name), use it; otherwise ask which workflow with AskUserQuestion. An unknown name: say so and stop.
2. The ticket is the remaining argument; if missing, ask for the Linear identifier.
3. Load the mapped skill with the ticket (and any `--targets`) as its argument and follow it.
