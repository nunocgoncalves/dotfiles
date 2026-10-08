---
name: start-ticket
description: Start ticket — validate, design, implement, open PR, and wait for CI. Alias for implement-ticket.
argument-hint: "<HOR-123>"
disable-model-invocation: true
---

Ticket: `$ARGUMENTS`

If the ticket is empty, ask for it (`/start-ticket <HOR-123>`) and stop. Otherwise load the `implement-ticket` skill with the ticket as its argument and follow it.
