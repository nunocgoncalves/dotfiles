---
name: accept-ticket
description: Preflight or accept an engineering ticket by inspecting its PR and review convergence, routing an open PR into the next isolated review stage, or—after merge—verifying acceptance criteria, validation, production impact, and required publication evidence before moving Linear from In Review to Done. Use via /accept-ticket HOR-123.
---

# Accept Ticket

Follow [[Product Management Operating System]]. This workflow closes an engineering delivery issue; it does not by itself declare the product outcome successful.

## Objective

For an open PR, perform a read-only acceptance preflight and identify the exact next isolated review, remediation, or founder-merge step. For a merged PR, move one Linear issue from In Review to Done only when the delivery satisfies its accepted engineering contract, including verified semantic publication when publication is required for ticket acceptance. Then determine whether the containing outcome project is ready for `product-release-review`.

## Authority hierarchy

1. **Obsidian PRD and approved product decisions** — product behavior and release boundary.
2. **Linear ticket** — delivery slice and acceptance criteria.
3. **Merged PR/repository** — implementation evidence.

If they conflict, do not mark Done. Require an explicit rescope or remediation decision.

## Rules

- Every invocation is a fresh acceptance Pi session. Reconstruct evidence from canonical systems; never reuse implementation, review, remediation, or prior acceptance sessions.
- Start read-only.
- Fetch the complete issue, project, relations, and relevant PRD before deciding.
- Verify evidence; do not infer acceptance from a merged state alone.
- Do not merge PRs. Only the user controls merge.
- Do not mark a product project Completed; `product-release-review` owns product/release acceptance.
- Ask one unresolved acceptance decision at a time directly in the session, including a recommended answer and the affected acceptance gate. Stop afterward and wait for the answer before continuing.
- Preserve accepted exceptions in Linear and the release evidence.
- Classify semantic publication as **required for ticket acceptance**, **deferred to product release review**, or **none** before deciding. Ambiguity blocks Done.
- Do not publish artifacts inside this workflow. When required publication evidence is missing, stop and route to `release-ticket`.
- Do not run tests or validation commands locally. Acceptance consumes the merged PR's CI/check evidence, review evidence, and any release evidence. Missing or stale evidence blocks acceptance or routes to remediation; it does not trigger a local rerun.

## Workflow

### 1. Resolve the ticket and PR

Determine the identifier from the argument or branch. Fetch:

- Full issue and current state
- Parent/sub-issues and dependency relations
- Containing Linear project
- Linked PRD requirements/acceptance scenarios or defect/risk evidence
- GitHub PR identified by branch, title, commits, or ticket identifier

Use `gh` for reads. Capture the PR URL, state, head commit, CI/check conclusions for that exact head, and validation summary.

If the PR is open, do not run the post-merge acceptance steps. Inspect GitHub review markers and thread state read-only with `review_list_findings`, `review_reconcile_threads`, and PR comment reads, then stop with exactly one next action:

- No review round exists → `/code-review <PR>`.
- A review has open or contested developer-owned findings → `/address-review <PR>`.
- Developer responses await reviewer verification, or the prior review is non-terminal → continue `/code-review <PR>` in that PR's reviewer session.
- The reviewer terminal marker exists and no thread remains unresolved → founder merge approval/action.

If the PR is closed without merge, block acceptance and report the required remediation decision. A non-code ticket may continue only with equivalent completion evidence.

If the PR is merged, capture its merge commit and continue to review convergence and the acceptance contract below.

### 2. Verify review convergence

Check:

- No pending `code-review` round
- No open or contested protocol findings
- No unresolved GitHub review-thread drift
- Terminal marker or explicit user-approved review exception

Use `review_init`, `review_list_findings`, and `review_reconcile_threads` read-only where applicable. Do not manufacture review markers after merge.

### 3. Reconstruct the acceptance contract

Extract:

- Ticket outcome
- Linked `REQ-*` / `SCN-*`
- Acceptance criteria
- Validation requirements
- Production impact
- Semantic publication classification: required, deferred, or none
- Non-goals
- Approved exceptions or rescope decisions

Legacy tickets without the standard format require an explicit acceptance interpretation before completion.

### 4. Evaluate the semantic publication gate

Read the repository's `AGENTS.md` and release documentation. Classify the merged delivery:

- **Required for ticket acceptance:** the ticket requires published semantic artifacts. Verify durable release evidence before continuing: exact merged source SHA, founder-approved target set, successful candidate and promotion runs, protected tags/Releases, exact image digests or archive checksums, and any baseline dependencies. If this evidence is missing or incomplete, keep the issue In Review and stop with:

  ```text
  /release-ticket <TICKET>
  ```

- **Deferred to product release review:** publication is deliberately outside this ticket's engineering acceptance boundary. Preserve the deferral and continue only if every ticket criterion can pass without publication.
- **None:** documentation, tests, source-control operations, or another non-semantic change requires no publication. Continue.
- **Ambiguous:** ask the founder to choose and record one classification. Do not move the issue to Done.

A successful candidate without successful protected promotion is not publication. A merge, raw tag, mutable alias, or unverified artifact is not release evidence.

### 5. Evaluate delivery evidence

For every acceptance criterion record:

- `pass` — supported by code/test/deployment evidence
- `accepted exception` — user explicitly accepts the gap and consequence
- `fail` — remediation required
- `unknown` — evidence missing

Also verify:

- Required tests/checks passed in CI for the accepted PR head; do not rerun them locally
- Migrations and rollout steps are accounted for
- Documentation/runbooks were updated when required
- Known failures are represented by approved follow-up defects, not hidden prose
- The merged diff did not silently expand or contradict product scope

### 6. Decide

Possible decisions:

- `accept` — all criteria pass
- `accept with exceptions` — explicit user-approved exceptions recorded
- `remediate` — reopen/move to In Progress or create an approved defect
- `revert/rollback` — merged behavior is unsafe
- `cancel/supersede` — delivery is no longer required, with product decision recorded

Do not equate a follow-up wishlist with failed acceptance. Conversely, do not create speculative follow-ups merely to make the current ticket appear complete.

### 7. Apply after acceptance

If accepted:

- Call `linear_list_teams` and resolve the Done state.
- Update the issue description or comment-equivalent evidence available through the tool with the PR, merge SHA, validation, and accepted exceptions when not already recorded.
- Move the Linear issue to Done.
- Re-query the issue to verify state.
- After the issue is verified Done, remove the ticket worktree with `worktree_remove ticketId=<TICKET>` and report the result. The branch and merged PR are preserved; a refusal means the worktree is dirty and needs a decision rather than a forced discard.

If remediation is required, keep it out of Done and state the exact blocking criteria. Move it back to In Progress only when work is actively resuming. Do not remove the ticket worktree while remediation or review is still open.

### 8. Check the product-project boundary

Inspect the containing outcome project:

- Are all required vertical deliverables accepted?
- Do the PRD release criteria now appear testable end to end?
- Is customer/production validation still outstanding?

If engineering delivery is complete, recommend:

```text
/product-release-review <project-or-PRD>
```

Do not mark the project Completed in this workflow.

## Completion

Report:

- Acceptance decision
- Ticket and merged PR
- Evidence per acceptance criterion
- Semantic publication classification and, when required, exact candidate/promotion evidence
- Accepted exceptions or blockers
- Final Linear state
- Ticket worktree removal result (removed, or the dirty-worktree refusal)
- Whether the outcome project is ready for product release review
- Exact next command
