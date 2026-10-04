---
name: product-weekly-review
description: "Run the weekly solo-founder product operating review across Obsidian, Linear, and current delivery: evidence, Now outcome, WIP, risks, stale scope, priorities, and next actions."
---

# Weekly Product Review

Follow [[Product Management Operating System]].

## Objective

Produce a concise weekly founder decision on evidence, the one Now outcome, WIP, delivery risk, stopped work, and the next product/engineering actions—not a status recital.

## Authority hierarchy

Obsidian holds product direction and review decisions. Linear provides delivery state. Repositories provide implementation evidence only where needed to verify risk or progress.

## Rules

- Use the Obsidian CLI for product-document operations.
- Query current Linear projects, Todo/In Progress/In Review issues, blockers, and recent changes.
- Inspect repositories only where needed to verify delivery state or risk.
- Start read-only and produce the review before proposing mutations.
- Ask one decision question at a time directly in the session with your recommendation, then stop and wait for the answer.
- Protect the one-Now-outcome and one-major-engineering-WIP limits.
- Do not create tickets for unshaped ideas discovered during the review.

## Workflow

### 1. Review evidence

- New customer conversations, requests, observations, and metrics
- Active product assumptions
- Evidence that strengthens or weakens current direction
- New opportunities requiring discovery

### 2. Review the Now outcome

- Intended customer and business outcome
- Current success measure
- Progress toward the end-to-end release, not issue count
- Release-boundary changes
- Risks, blockers, and missing decisions
- Whether Now should continue, change, pause, or stop

### 3. Review delivery health

- Todo/In Progress/In Review WIP
- Blocked and stale issues
- Work without a current PRD/outcome link
- Priority anomalies
- Dependencies on canceled/deferred work
- Component work expanding beyond the current release

### 4. Review roadmap

- Confirm one Now outcome
- Re-evaluate Next based on current learning
- Keep Later uncommitted
- State what remains explicitly deferred/stopped
- Identify any decision that could reorder the roadmap

### 5. Decide the week

Produce:

- Primary product outcome for the week
- One primary engineering deliverable
- Customer/discovery action
- Largest risk to retire
- Work to stop, park, or avoid
- Decisions due and their dates

### 6. Apply approved maintenance

After the user approves decisions:

- Update the roadmap/decision notes.
- Adjust Linear priority/state/cycle only where needed.
- Capture new signals as opportunities in Obsidian.
- Cancel or defer stale work with reasons.
- Do not broaden the week by creating speculative tickets.

### 7. Record the review

Append or create a dated product review containing:

```markdown
## New evidence
## Now outcome
## Delivery health
## Decisions
## This week's focus
## Risks and blockers
## Stopped/deferred
## Next review
```

## Status-only mode

If invoked with `status-only`, perform steps 1–4 read-only and return a compact status report without asking to mutate anything.

## Completion

End with the current Now outcome, this week's product and engineering focus, the most important risk, explicit non-work, and the next founder decision.
