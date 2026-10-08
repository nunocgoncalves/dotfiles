---
name: open-pr
description: Open a convention-correct pull request for the current Linear-ticket branch, wait for CI on the created head, and move Linear to In Review. Does not approve or merge. Used automatically by implement-ticket or directly when a validated branch already exists.
argument-hint: "<HOR-123>"
---

## Invocation

Ticket: `$ARGUMENTS` (if empty, derive it from the ticket worktree branch or ask).

Fetch the ticket with `linear_list_issues` (`identifier` = the ticket) and run this skill's traceability, acceptance, architecture-approval, diff, and validation preflight. Then call `open_pr` with the ticket id and the four body sections. `open_pr` waits for CI on the created head. Only after it passes, call `linear_list_teams` then `linear_update_issue` to move the ticket to In Review.

Opens a PR the way this repo wants it. `AGENTS.md` is the source of truth for these conventions; the `open_pr` tool (from the plugin's `review` MCP server) enforces them so the structure can't drift. It sits in the workflow between implementation and `review-pr`:

```
grill-me → implementation → open-pr → review-pr → address-review → (re-review loop)
```

It **never approves or merges** — only the user may merge to `master`.

## Objective

Open one traceable, convention-correct PR for a validated Linear delivery ticket, wait for every check on the created head to pass, and then move that ticket from In Progress to In Review without changing product scope.

## Conventions enforced (by `open_pr`, sourced from AGENTS.md)

- Direct pushes to `master` are prohibited; the PR targets the repo default branch.
- The PR is opened from the dedicated ticket worktree `<root>/<repo>/<TICKET>` (created by `worktree_ensure`). The tool refuses any other path, the primary checkout, a dirty worktree, and a PR head that differs from the worktree HEAD.
- Branch must be `<TICKET>-<description>` (the tool refuses otherwise).
- PR title is `<TICKET> — <title>` (em-dash, spaced; the tool prepends the prefix).
- PR body is valid Markdown with **real line breaks**, via `--body-file`, using exactly: `## Summary`, `## Validation`, `## Production impact`, `## Ticket state` — non-applicable marked `None`/`N/A`.
- Linear is the source of truth for ticket state → move the ticket to **In Review** when the PR opens (done with the `linear` tools after `open_pr` returns).

## Environment

- **review-workflow tools**: `open_pr` — the only sanctioned way to open a PR for a ticket. Raw `gh pr create` is not blocked, but use `open_pr` so the conventions are enforced. `worktree_ensure` creates or reuses the dedicated ticket worktree.
- **Linear tooling**: `linear_list_issues` (fetch the ticket by identifier for title/summary), `linear_list_teams` (team key + the "In Review" `stateId`), `linear_update_issue` (move to In Review).
- The ticket worktree holds the ticket branch; every git/gh command runs there (absolute path or `git -C <worktree>`). `open_pr` does not return success until CI reaches a successful terminal state for the worktree HEAD. Missing checks are not success.

## Preconditions and authority

Apply the standard hierarchy:

1. Obsidian PRD/approved product decisions define product behavior.
2. The Linear issue defines the approved delivery slice and acceptance criteria.
3. The repository defines implementation and validation conventions.

Before opening a PR, classify the ticket:

- **Product deliverable:** should link to a PRD and relevant `REQ-*` / `SCN-*` identifiers.
- **Defect:** should link to reproducible evidence and expected behavior.
- **Risk/operations:** should identify the concrete risk or obligation.

The ticket should use the standard sections: Outcome, Product requirements/evidence, Scope, Acceptance criteria, Non-goals, Dependencies, Validation, and Production impact. For a legacy ticket, missing traceability is initially **warning-only**: report the missing fields and continue only when the delivery behavior and acceptance criteria are still unambiguous. Do not open a PR when product scope, architecture approval, or acceptance behavior remains unresolved.

## Process

### 1. Resolve the ticket and branch

Determine the Linear identifier:

- If the user gave one (e.g. `HOR-123`), use it.
- Otherwise parse it from the current branch name: `git branch --show-current` should match `HOR-NNN-…`. Extract `HOR-NNN`.
- If neither yields an identifier, ask the founder for the ticket in that turn and stop. Continue only once the answer arrives.

Resolve the dedicated ticket worktree with `worktree_ensure ticketId=<TICKET>` (add `branch=<TICKET>-<desc>` when no matching branch exists yet). It reuses existing work and refuses — with the exact move-off command — while the ticket branch is still checked out in the primary checkout. If the branch name does not match `<TICKET>-<desc>`, rename it inside the worktree: `git -C <worktree> branch -m <TICKET>-<desc>`.

### 2. Fetch the ticket and run the PR-ready preflight

```
linear_list_issues  identifier=HOR-123   # → title, description, project, parent/sub-issues
linear_list_issue_relations issue=HOR-123
```

Read any linked PRD/product decision through the Obsidian CLI. Check the ticket for the standard sections and traceability described above. Then inspect `git log <base>..HEAD --oneline`, `git diff <base>...HEAD --stat`, the full diff where needed, and the validation results.

Before opening the PR verify:

- The diff implements only the approved ticket slice.
- Acceptance criteria are satisfied or explicit exceptions are documented.
- Required validation has run, or the omission and consequence are explicit.
- Any architecture decision has prior recorded approval.
- Every architecture decision is listed under a stable `DES-<TICKET>-NN` identifier with founder, date, scope, consequences, and a Linear/Obsidian evidence link. A session recollection is insufficient.
- Production impact and rollback are understood.
- Semantic publication is explicitly classified as **required for ticket acceptance**, **deferred to product release review**, or **none**; ambiguous release intent blocks the PR.
- No unrelated changes or secrets are included.

For a legacy traceability gap, warn in the conversation and include it under Ticket state; do not invent requirement links. Use the issue title and description to write the Summary and Ticket state content, but re-phrase rather than dumping the issue.

### 3. Compose the body sections

Prepare the four sections as plain markdown (real newlines). `open_pr` assembles them:

- **Summary** — 2–4 bullets on what the change does, from the ticket + the actual diff.
- **Validation** — how it was validated (tests, commands, manual checks); or `None` with a one-line reason.
- **Production impact** — what changes in prod, rollout/risk/rollback, plus one explicit `Semantic publication:` classification: `Required for ticket acceptance — <targets/evidence>`, `Deferred to product release review — <reason>`, or `None — <reason>`.
- **Ticket state** — the ticket id, intended In Review transition, a link to Linear, linked PRD/requirement identifiers, every applicable `DES-*` approval record, and any legacy traceability warning or accepted exception.

### 4. Open the PR

Call `open_pr` with `ticketId`, `title` (without the prefix — the tool prepends `HOR-123 — `), `summary`, `validation`, `productionImpact`, `ticketState`, `worktree` (the absolute path from `worktree_ensure`), and optionally `base` and `push`. The tool refuses a non-convention path, a dirty worktree, a branch that does not match the ticket, and a PR head that is not the worktree HEAD; it creates the PR, waits for all checks on its current head, restarts the wait if the head changes, and returns only after CI passes. A missing, failed, cancelled, timed-out, or superseded check blocks the workflow.

### 5. Move the Linear ticket to In Review

```
linear_list_teams                          # → team key (HOR) + states; find the "In Review" stateId
linear_update_issue  id=HOR-123  stateId=<In Review stateId>
```

This keeps Linear as the source of truth for ticket state (AGENTS). Do this only after the PR exists and CI has passed for its current head.

### 6. Report back

Tell the user: the PR URL, title, base←head branches, the ticket worktree path and exact head, linked requirement/evidence source, approved `DES-*` records, validation summary, CI result and exact head SHA, semantic publication classification, any traceability warning, and confirmation that Linear moved to In Review. Do **not** approve or merge.

## Completion

Complete only after the PR exists, CI passed for its current head, and the Linear ticket is verified in In Review. Report all items above and the exact next command: `/review-pr <PR>`.
