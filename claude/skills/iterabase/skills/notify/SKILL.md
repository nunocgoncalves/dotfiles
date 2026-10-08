---
name: notify
description: Configure macOS notifications sent when Claude finishes or needs attention.
argument-hint: "[status|on|off|toggle|test|sound <name|none>|snippet on|off|attention on|off]"
disable-model-invocation: true
allowed-tools: Bash(node:*)
---

Run exactly this command and report its one-line output:

```bash
node ~/.claude/skills/iterabase/hooks/notify.ts config $ARGUMENTS
```
