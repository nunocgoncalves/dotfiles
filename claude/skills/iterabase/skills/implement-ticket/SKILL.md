---
name: implement-ticket
description: Execute an engineering ticket from Linear through validated implementation, commits, automatic PR creation, CI completion, and the In Review transition. Use when starting work on HOR-123 or invoking /start-ticket.
argument-hint: "<HOR-123>"
---

# Implement Ticket

Follow [[Product Management Operating System]]. This workflow is the controlled engineering entrypoint after `product-to-engineering` has produced a ready Linear ticket.

## Objective

Take one approved delivery ticket from Todo through validated implementation on a ticket branch, automatically open its PR, wait for CI on the created head, and move the ticket to In Review without silently changing product scope. `open-pr` remains the reusable PR-creation subworkflow, not a separate manual handoff.

## Preconditions

Require one of:

- A product delivery ticket linked to a current PRD requirement or acceptance scenario
- A concrete defect linked to reproducible evidence
- A security, reliability, compliance, or operational obligation linked to an explicit risk

The ticket should define outcome, scope, acceptance criteria, non-goals, dependencies, validation, and production impact. Legacy tickets may proceed with a visible traceability warning, but missing product decisions or acceptance criteria must be resolved before implementation.

## Authority hierarchy

1. **Obsidian PRD and approved product decisions** — authoritative for product behavior and release boundaries.
2. **Linear ticket** — authoritative for the approved delivery slice and engineering acceptance criteria.
3. **Repository design and standards** — authoritative for implementation conventions and code-coupled technical contracts.

A lower layer cannot silently redefine a higher layer. If sources conflict, stop and request an explicit product rescope or architecture decision.

## Rules

- Fetch the full Linear issue, parent/sub-issues, project, and dependency relations before planning.
- Read linked PRDs and relevant `Areas/ho` notes through the Obsidian CLI.
- Read repository `AGENTS.md` and other applicable standards completely.
- Inspect the codebase before asking questions. Answer discoverable engineering questions yourself.
- Ask unresolved founder/product/architecture questions one at a time directly in the session, providing your recommended answer and why the decision blocks the next action. Stop after asking; continue only once the answer arrives.
- Obtain explicit user approval before architectural changes as required by repository standards. Immediately record each approved decision under a stable `DES-<TICKET>-NN` identifier in Linear or an Obsidian decision note, including the exact decision, approver, date, scope, consequences, and evidence link. Do not treat conversation memory as approval evidence.
- Never implement directly on `master` or `main`.
- Perform all ticket work in the dedicated ticket worktree (`worktree_ensure`), never in the primary checkout. Use the worktree's absolute path for every read, edit, command, commit, and push; `open_pr` refuses any other path.
- Do not overwrite unrelated working-tree changes.
- Keep commits coherent and include the Linear identifier in every commit message.
- Continue through the `open-pr` workflow automatically after PR readiness. Do not ask the user to invoke a second command.

## Workflow

### 1. Resolve the ticket

Determine the Linear identifier from the argument or current branch. Then:

- Call `linear_list_teams` to pin the team and workflow states.
- Fetch the full issue with `linear_list_issues`.
- Fetch dependencies with `linear_list_issue_relations`.
- Fetch the containing project when present.
- Identify the linked `REQ-*` / `SCN-*`, PRD, defect evidence, or operational risk.

Classify the issue as:

- Product deliverable
- Defect
- Risk/hardening
- Operational maintenance
- Unshaped idea

Stop unshaped ideas and route them to `product-discovery` or `product-to-engineering`.

### 2. Run the engineering-ready gate

Verify:

- Outcome is explicit.
- Product/defect/risk source is traceable.
- Scope and non-goals are clear.
- Acceptance criteria are observable and testable.
- Dependencies are satisfied or deliberately sequenced.
- Major unknowns are resolved or isolated as spikes.
- Validation and production impact are defined.
- Semantic publication is classified as required for ticket acceptance, deferred to product release review, or none.
- Work is small enough for coherent implementation and review.

For a legacy issue, report missing standard sections and propose the smallest ticket update needed. Warning-only traceability gaps may proceed with user acknowledgment; missing acceptance behavior may not.

### 3. Inspect repository state

Run:

- `git status --short --branch`
- `git branch --show-current`
- repository standards discovery
- targeted code, test, API, migration, and documentation inspection

If the primary checkout or the ticket worktree contains unrelated changes, preserve them and ask how to isolate work when necessary. Never discard or rewrite them without approval.

### 4. Prepare the ticket worktree and branch

Call `worktree_ensure` with the ticket id before any edit. The convention is:

```text
worktree   <root>/<repo>/<TICKET>          root = $PI_WORKTREE_ROOT, default ~/Developer/worktrees
branch     <TICKET>-<short-description>    checked out in that worktree
```

- Reuse is safe and idempotent: an existing ticket worktree is reported, never reset.
- Pass `branch=<TICKET>-<short-description>` to create it when no matching branch exists yet; `base` defaults to the repository default branch.
- Every subsequent edit, command, commit, and push uses the returned absolute path (`git -C <worktree> ...`).
- If the ticket branch is still checked out in the primary checkout, `worktree_ensure` refuses and prints the exact move-off command. Run it, then re-run `worktree_ensure`; never implement in the primary checkout.
- Once the worktree holds the branch, git itself refuses to check that branch out in the primary checkout, so the boundary is structural.

Move the Linear issue to **In Progress** only when the worktree and branch are ready and implementation is actually beginning.

### 5. Shape the implementation

Map each acceptance criterion to:

- Existing behavior
- Required code/config/docs change
- Test or production evidence
- Risk and rollback consideration

Identify architectural choices, failure semantics, migrations, cross-service contracts, security boundaries, and semantic release intent. If publication is required, identify the release targets and any `make bump` the ticket must carry, without treating path selection as authority; exact target intent still requires founder approval in `release-ticket`. When the work touches AgentPool, LVM/storage or Forge bootstrap behaviour, add the `e2e-real-machine` label to the PR so real-machine scenarios run before the merge queue; for CI or workflow changes, add the `full-validation` label. Use the `grill-me` method for unresolved design branches: one question at a time, dependencies first, recommendation included.

Produce a concise implementation plan before editing. If the plan changes product behavior, update/approve the PRD first. If it introduces an architectural decision, obtain explicit approval and record it in Linear or Obsidian before implementation.

For every approved architectural decision, add or update the canonical record in this shape before editing:

```markdown
## Approved design decisions
- DES-HOR-123-01 — <decision>
  - Approved by: Nuno Gonçalves
  - Approved on: YYYY-MM-DD
  - Scope: <bounded scope>
  - Consequences: <accepted trade-offs>
  - Evidence: <Obsidian decision note or other canonical link>
```

### 6. Implement

- Make the smallest coherent change satisfying the approved slice.
- Preserve existing repository patterns unless an approved decision changes them.
- Add or update tests with the behavior.
- Update code-coupled docs and runbooks.
- Avoid speculative abstractions and unrelated cleanup.
- Re-check acceptance criteria after meaningful scope discoveries.

### 7. Validate

Run repository-required validation plus ticket-specific checks. Record:

- Commands and results
- End-to-end/manual evidence
- Unrun validation and reason
- Production/migration implications
- Accepted exceptions

A failing required check is not PR-ready unless the user explicitly accepts and documents the exception.

### 8. Commit

Create one or more coherent commits:

```text
HOR-123: concise change description
```

Do not mix unrelated work. Do not push directly to the default branch.

### 9. PR-readiness review

Before completion confirm:

- Ticket branch and commit conventions pass.
- Diff matches only the approved ticket slice.
- Linked PRD behavior is not contradicted.
- Acceptance criteria are satisfied or exceptions documented.
- Required tests pass.
- Production impact and rollback are understood.
- Semantic publication is explicitly classified for `open-pr` and later `accept-ticket` routing.
- No accidental secrets or unrelated files are present.

### 10. Open the PR and wait for CI

Continue directly into the `open-pr` workflow in the same run:

- Fetch the ticket again and carry its requirement links, validation, production-impact classification, warnings, and approved `DES-*` records into the PR.
- Call `open_pr` with the `worktree` path returned by `worktree_ensure`; do not use raw `gh pr create`.
- The tool refuses a non-convention path, a dirty worktree, a branch that does not match the ticket, and a PR head that differs from the worktree HEAD.
- The tool waits for all checks on the created head. Do not report completion while checks are missing, pending, failed, cancelled, timed out, or belong to an older head SHA.
- After CI passes, move the Linear issue to In Review and re-query it to verify the state.
- Never approve or merge the PR.

## Completion

Report:

- Ticket and product/defect/risk source
- Ticket worktree path and branch
- Branch and commit SHAs
- PR URL and title
- Implemented acceptance criteria
- Validation run
- CI result and exact checked head SHA
- Production impact and semantic publication classification
- Approved design-decision identifiers and canonical evidence
- Warnings or accepted exceptions
- Exact next command: `/review-pr <PR>`
