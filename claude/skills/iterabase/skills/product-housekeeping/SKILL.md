---
name: product-housekeeping
description: Reconcile and clean product scope across Obsidian product documents and Linear projects/issues. Use for backlog sweeps, changed requirements, stale-roadmap cleanup, scope reconciliation, or product house cleaning.
---

# Product Housekeeping

Use [[Product Management Operating System]] in Obsidian `Areas/ho` as the process contract.

## Objective

Produce a coherent product source of truth, an outcome-based roadmap, and a Linear delivery backlog that traces to current product scope. Preserve history while removing stale commitments from active planning.

## Authority hierarchy

Obsidian governs current product direction and approved requirements. Linear governs delivery state. Repositories govern implementation evidence. When they conflict, identify the drift and resolve the product decision before applying broad delivery cleanup.

## Rules

- Start read-only. Do not mutate Obsidian or Linear until the user approves the relevant cleanup decisions.
- Use the Obsidian CLI for all vault discovery, reads, searches, moves, creates, and updates.
- Read relevant notes completely. Follow wikilinks needed to understand current and superseded decisions.
- Query Linear teams, projects, open issues, project contents, dependencies, and cycles as needed. Refine filters when result limits truncate the inventory.
- Treat Obsidian as authoritative for product scope, Linear for delivery state, and repositories for implementation details.
- Do not infer product priority from engineering effort already spent.
- Never permanently delete product history by default. Archive notes; cancel Linear work with a reason.
- Ask founder-decision questions one at a time and include your recommended answer.
- Answer questions from existing evidence yourself before asking the user.

## Workflow

### 1. Baseline inventory

Collect:

- All product, strategy, PRD, roadmap, research, runbook, and implementation-plan notes in `Areas/ho`.
- Their status, age, links, contradictions, and references to superseded decisions.
- All active Linear projects and all open issues, grouped by project, state, priority, label, and dependency.
- Unprojected issues and component projects that do not describe an outcome.
- Current repository plans only where required to determine whether work is complete, obsolete, or still needed.

Report counts and obvious drift before discussing individual scope choices.

### 2. Establish current constraints

Extract changed requirements, explicit descopes, commercial deadlines, target users, and hard constraints from the notes and user statements. Distinguish:

- Current product decision
- Superseded decision
- Open hypothesis
- Engineering implementation choice
- Deferred opportunity

If current product direction is ambiguous, resolve the highest-level commercial decision first.

### 3. Build a proposed change set

For each Obsidian note propose one action:

- `keep` — current and correctly scoped
- `rewrite` — still needed but structurally stale
- `merge` — duplicate content belongs in another canonical note
- `archive` — useful history, no longer active

For each Linear project or issue propose one action:

- `keep`
- `rewrite`
- `rehome`
- `merge`
- `defer`
- `cancel`

Include the reason, source product decision, replacement artifact if any, and dependency impact. Group proposals by product decision rather than asking about tickets one by one.

### 4. Resolve decisions

Walk the user through unresolved branches in dependency order:

1. Target customer and commercial objective
2. Product boundary and explicit non-goals
3. Current sellable release
4. Now / Next / Later outcomes
5. Product requirements
6. Project restructuring
7. Ticket-level cleanup

Ask one question at a time. State the recommended decision and its consequences.

### 5. Apply approved cleanup

After approval:

- Create or update the canonical product strategy, PRD, and roadmap in Obsidian.
- Add `superseded_by`, status, and decision context where useful.
- Archive stale notes rather than deleting them.
- Update Linear project names/briefs/statuses to outcome-based delivery.
- Rehome, rewrite, merge, defer, or cancel issues consistently.
- Preserve useful technical tickets only when they support current scope, a concrete defect/risk, or an operational obligation.
- Set dependencies after the final ticket set is known.

For broad mutation batches, show the exact proposed operations and obtain confirmation immediately before applying them.

### 6. Verify

Re-read the resulting Obsidian artifacts and re-query Linear. Confirm:

- One clear Now outcome
- No active product note presents superseded scope as current
- Every active project links to a current product outcome/PRD
- Every Todo/In Progress issue has a reason to exist
- Priority and state semantics follow the operating system
- Canceled/archived work includes a reason and replacement when relevant
- No dependency points to canceled or obsolete work without explanation

## Completion

Finish with a concise cleanup report: changed artifacts, canceled/deferred scope, current roadmap, unresolved risks, verification results, and the exact next workflow/action.
