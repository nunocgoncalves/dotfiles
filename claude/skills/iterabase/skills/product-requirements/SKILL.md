---
name: product-requirements
description: Convert an approved product brief into a product-focused PRD with stable requirements, acceptance scenarios, release criteria, constraints, and non-goals. Use before engineering shaping.
---

# Product Requirements

Follow [[Product Management Operating System]].

## Objective

Convert one approved product brief into a canonical, testable PRD with stable requirement/scenario identifiers and an explicit release contract.

## Preconditions

Require an approved product brief or equivalent recorded decision with target user, problem/evidence, desired outcomes, constraints, and a success hypothesis.

## Authority hierarchy

Obsidian is authoritative for product scope and decisions. Linear may reveal existing delivery constraints but cannot define the PRD. Repositories inform feasibility without dictating user behavior.

## Rules

- Require an approved product brief or equivalent explicit product decision.
- Use the Obsidian CLI for all vault operations.
- Read related strategy, research, prior PRDs, and changed requirements completely.
- Describe observable user/product behavior; avoid prescribing architecture unless it is a genuine product constraint.
- Make evidence, assumptions, open questions, and decisions visibly distinct.
- Ask one founder-decision question at a time with a recommended answer.
- Resolve product behavior before implementation details.
- Do not create Linear tickets in this workflow.

## Workflow

### 1. Validate the brief

Confirm:

- Target customer and primary user
- Problem and evidence
- Desired customer outcome
- Desired business outcome
- Why now
- Constraints and explicit non-goals
- How success can be evaluated

If any foundational item is missing, resolve it before drafting detailed requirements.

### 2. Map the experience

Describe:

- Trigger or entry point
- Primary happy-path journey
- Important alternate journeys
- User-visible failures and recovery
- Inputs, outcomes, and artifacts
- Permission, privacy, and trust expectations
- What the user must never need to understand

### 3. Write stable requirements

Assign stable identifiers:

- `REQ-N` for functional product requirements
- `SCN-N` for end-to-end acceptance scenarios
- `MET-N` for success measures where useful

Each requirement should state observable behavior and why it matters. Avoid component names unless users interact with them or the product constraint requires them.

### 4. Define the release contract

Separate:

- Minimum sellable/releasable behavior
- Fast follows
- Later opportunities
- Explicit non-goals

Release criteria must be demonstrable end to end and include the intended production environment where relevant.

### 5. Write or update the PRD

Use this structure:

```markdown
# [Initiative] — Product Requirements

## Context
## Target users
## Problem and evidence
## Desired customer outcome
## Desired business outcome
## Product principles
## User journeys
## Functional requirements
## Acceptance scenarios
## Success metrics
## Release criteria
## Constraints
## Non-goals
## Risks and assumptions
## Open questions
## Decisions
## References
```

### 6. Review quality

Check that:

- Every requirement traces to a user or business outcome.
- No requirement is merely an implementation task.
- Acceptance scenarios cover the complete sellable journey.
- Success metrics measure outcome rather than engineering activity.
- Non-goals prevent obvious scope expansion.
- Changed requirements clearly supersede old ones.
- Open questions have owners or next actions.

## Completion

Re-read the saved note through the Obsidian CLI. Report the release boundary, requirement/scenario IDs, unresolved decisions, and whether it is ready for `product-roadmap` or `product-to-engineering`.
