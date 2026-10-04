# Pi workflow standard

This is the runtime encoding format for `Areas/ho/Product Management Operating System.md` in the `2nd-brain` vault. That operating-system note owns product-management and integrated engineering-lifecycle semantics. If this file, a skill, an extension, or a dispatcher disagrees with it, stop and surface the drift; executable code must not silently redefine the canonical process.

All Iterabase product and engineering workflows follow the same separation:

- **Skills own judgment:** evidence gathering, interpretation, trade-offs, questions, and decisions.
- **Extensions own deterministic mechanics:** commands, routing, protocol state, invariant checks, and integration tools.
- **Canonical systems own durable state:** Obsidian for product, Linear for delivery, repositories for implementation, and GitHub for PR/review state.

## Skill format

Every workflow skill should contain, in this order where applicable:

1. YAML frontmatter: `name` and specific trigger-oriented `description`.
2. `# Workflow name`.
3. `## Objective` — the outcome and lifecycle boundary.
4. `## Preconditions` — required inputs/gates; omit only when none exist.
5. `## Authority hierarchy` — which source wins for each concern.
6. `## Rules` — safety, mutation, questioning, and scope constraints.
7. `## Workflow` — ordered read → decide → mutate → verify steps.
8. `## Completion` — output contract, next state, and exact next workflow.
9. Optional protocol sections: `Idempotency`, `Triggers`, or `As a workflow unit`.

Complex existing skills may retain additional domain sections, but must preserve the same semantic contract.

## Standard authority hierarchy

1. **Obsidian PRD and approved product decisions** define product behavior, release boundaries, constraints, and non-goals.
2. **Linear project/issue** defines the approved delivery outcome or slice and engineering acceptance criteria.
3. **Repository designs and standards** define implementation details and conventions.
4. **GitHub PR/review state** records proposed implementation and review convergence; it does not redefine scope.

A lower layer cannot silently redefine a higher layer. Conflicts require an explicit product rescope or architecture decision.

An architectural decision is approved only when the founder explicitly accepts the exact decision and its scope, and that approval is recorded durably in the Linear ticket or an Obsidian decision note. Use a stable `DES-<TICKET>-NN` identifier and record the decision, approver, approval date, scope, consequences, and canonical evidence link. A Pi/session transcript or an agent's assertion that approval happened is not approval evidence.

## Standard mutation sequence

1. Inspect canonical sources.
2. Report missing evidence and drift.
3. Propose the decision or mutation plan.
4. Obtain required founder approval, especially for product scope, architecture, bulk cancellation, or archival.
5. Apply bounded changes.
6. Re-read/re-query canonical state.
7. Report completion and the next workflow.

## Workspace boundary

Ticket work uses two distinct git concepts; they are never used interchangeably:

- **working tree** — the `git status` state of whichever checkout is in use (clean/dirty, staged/unstaged).
- **worktree** — a linked git worktree created with `git worktree add`.

Mutating ticket work happens in **one dedicated linked worktree per ticket**, never in the primary checkout:

```text
worktree   <root>/<repo>/<TICKET>          root = $PI_WORKTREE_ROOT, default ~/Developer/worktrees
branch     <TICKET>-<short-description>    checked out in that worktree
```

- `worktree_ensure` (review-workflow) creates or reuses it; reuse never resets or discards existing work.
- Every edit, command, commit, and push uses that worktree's absolute path (`git -C <worktree> ...`).
- `open_pr` refuses any path other than the ticket's convention path, a dirty worktree, and a PR head that differs from the worktree HEAD.
- `address-review` replies and the response summary are refused unless the ticket worktree exists, is clean, and its HEAD equals the PR head.
- `accept-ticket` removes the worktree after the ticket reaches Done; release verification worktrees are detached at an exact SHA and always removed.

Once the ticket branch is checked out in its worktree, git refuses to check it out in the primary checkout, so the boundary is structural rather than advisory. Stages that only read canonical systems (`code-review`, `accept-ticket`) need no checkout at all, and a review session may run in the primary checkout read-only.

## Standard ticket format

```markdown
## Outcome
## Product requirements
## Scope
## Acceptance criteria
## Non-goals
## Dependencies
## Validation
## Production impact
```

Product tickets link `REQ-*` / `SCN-*`. Defects link reproducible evidence and expected behavior. Risk/operational tickets link the concrete obligation. `Production impact` classifies semantic publication as **required for ticket acceptance**, **deferred to product release review**, or **none** so merge, release, deployment, and outcome acceptance remain distinct.

## Lifecycle ownership

```text
product-design-brief    → optional exploration or pre-engineering design/evidence gate; creates no delivery tickets
product-to-engineering  → creates/shapes delivery
start-ticket            → Todo → In Progress → implementation → PR opened → CI passed → In Review
open-pr                 → reusable subworkflow; PR opened → CI passed → In Review
code/address review     → CI-gated reviewer-owned convergence; never merge
founder                 → merge
release-ticket          → exact-SHA candidate/promotion when publication is required; no state transition
accept-ticket           → In Review → Done after required publication evidence
worktree lifecycle      → worktree_ensure at implementation → same worktree through address-review → worktree_remove at Done
product-release-review  → project/release outcome decision; may authorize deferred release-ticket
```

Product lifecycle routing is:

```text
product-discovery
  → optional product-design-brief exploration
  → product-requirements
  → product-roadmap
  → optional product-design-brief new-design or frozen-design verification
  → product-to-engineering
```

The design workflow is mandatory when user-visible behavior needs a new accepted design or deterministic verification of a frozen design before engineering shaping. Exploration remains non-authoritative until its learning is accepted through the product workflow.

## Review and acceptance session roles

The implementation and every `address-review` round share one **author** Pi session. The first `code-review` starts one separate **reviewer** session for the PR, and every re-review continues that reviewer session. Reviewer and author context never mix. Every completed `accept-ticket` invocation is discarded; preflight and post-merge acceptance each start a fresh **acceptance** session.

Role continuity is working memory, not authority. Every continued round re-reads GitHub markers, the current PR head, CI, Linear, Obsidian, and repository state. If the original author session is unavailable for a legacy PR, one fresh recovery author session may be created and then reused for later remediation rounds.

One orchestrating conversation — a chat session, a dispatched Codex task, or a Pi session — may drive the complete loop because GitHub review markers, CI, Linear, Obsidian, and repository state are the handoff—not Pi conversation memory:

```text
accept-ticket preflight
  → code-review reviewer session
  → (address-review author session → code-review reviewer session)*
  → reviewer final
  → founder merge
  → accept-ticket final
```

Skip `address-review` in a round with no developer-owned findings. The terminal review decision remains reviewer-owned, and merge remains founder-owned.

## Extension rules

- Commands are thin primers that load the matching skill.
- Protocol invariants belong in tools/hooks, not repeated prompt prose.
- Extensions discover only the skills they own to avoid collisions.
- Workflow state must be reconstructable from canonical systems.
- Session state may improve UX but must not become a hidden source of truth.
- `address-review` continues the implementation author session; all `code-review` rounds for one PR continue a separate reviewer session; acceptance is always fresh.
- A workflow that needs a founder decision asks the founder one question with a recommended answer directly in the session, then stops. The run stops there rather than proceeding on a guess: no dependent tool call follows, and the run resumes with the answer in the next turn of the same session.
- Every created or updated PR head must reach a successful terminal CI state before the owning workflow completes. A missing, failed, cancelled, timed-out, or superseded check run is not success.
- Workspace invariants are tool-enforced refusals, not prose reminders: primary-checkout detection, the worktree path convention, cleanliness, and exact-head matching live in the tools.
- Developer/address-review sessions may reply to findings but may not resolve GitHub threads or emit the terminal marker. The reviewer verifies each response, explicitly resolves accepted threads, and alone decides whether the review is final.
- Zero new findings is evidence, not an automatic final decision.
- Bulk/destructive mutations require preview and confirmation until a proven protocol safely automates them.
