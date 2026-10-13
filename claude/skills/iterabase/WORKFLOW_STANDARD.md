# Iterabase workflow standard (Claude Code)

This is the runtime encoding format for `Areas/ho/Product Management Operating System.md` in the `2nd-brain` vault. That operating-system note owns product-management and integrated engineering-lifecycle semantics. If this file, a skill, a plugin tool or hook, or a dispatcher disagrees with it, stop and surface the drift; executable code must not silently redefine the canonical process.

All Iterabase product and engineering workflows follow the same separation:

- **Skills own judgment:** evidence gathering, interpretation, trade-offs, questions, and decisions.
- **Plugin MCP servers and hooks own deterministic mechanics:** routing commands, protocol state, invariant checks, guards, and integration tools.
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
2. **Linear project/issue** defines the approved delivery outcome or slice and engineering acceptance criteria. Its `Decisions (design review, <date>)` section is the founder-approved detailed contract for that slice; for UI work, its `## Design` section is the reconciled design spec.
3. **Repository designs and standards** define implementation details and conventions.
4. **GitHub PR/review state** records proposed implementation and review convergence; it does not redefine scope.

A lower layer cannot silently redefine a higher layer. Conflicts require an explicit product rescope or architecture decision.

An architectural decision is approved only when the founder explicitly accepts the exact decision and its scope, and that approval is recorded durably in the Linear ticket or an Obsidian decision note. Use a stable `DES-<TICKET>-NN` identifier and record the decision, approver, approval date, scope, consequences, and canonical evidence link. A Claude Code, Pi, or other session transcript or an agent's assertion that approval happened is not approval evidence.

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

Once the ticket branch is checked out in its worktree, git refuses to check it out in the primary checkout, so the boundary is structural rather than advisory. Stages that only read canonical systems (`review-pr`, `accept-ticket`) need no checkout at all, and a review session may run in the primary checkout read-only.

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
product-design-brief    → optional prototype in a Claude Design artifact (exploration or foundation patterns); creates no delivery tickets and is never a frozen gate
product-to-engineering  → creates/shapes delivery
start-ticket            → Todo → In Progress → implementation → PR opened → CI passed → In Review
open-pr                 → reusable subworkflow; PR opened → CI passed → In Review
code/address review     → CI-gated reviewer-owned convergence; never merge
founder                 → merge
release-ticket          → release.yml at an exact master SHA when publication is required; no state transition
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
  → optional product-design-brief foundation/pattern prototype
  → product-to-engineering
```

Product design is done in product code and accepted by the founder on the `pr-<N>` preview environment, collaboratively.

- **The prototype** is the "Delight, trusted (chosen direction)" page of the V2 App Foundation canvas (https://claude.ai/artifact/CtvRvGmeacVMkFBAUgCiiQ). It is the design reference for customer UI, not a pixel spec. Other canvas pages (Command center, experiments, sidebar draft) are superseded and are not references.
- **The Design System** is mandatory: the Iterabase Design System (https://claude.ai/artifact/B3WS3oBCdjQM3wobDBKxRP), rebranded 2026-10-13, for tokens, components, coworker marks, trust layer and voice. Read its README before UI work. New tokens, patterns or components need founder approval.
- **Two languages:** the customer app ships in English and European Portuguese (PT-PT). The PT reference is the "Delight, trusted · PT-PT" page of the same canvas. The approach, the message catalogs and the PT-PT glossary are in HOR-670: colaborador de IA, formal register without "você", no Brazilian terms. All customer-facing strings come from the catalogs, and dates, numbers and currency follow the locale. PT copy is reviewed on the preview for length and register.
- **Every UI ticket carries a `## Design` section, and it is the design spec:** Prototype (named screens), Design system, Reconciled spec (the concrete design decisions, reconciled between prototype, Design System, functional scope and status model), Languages (EN and PT-PT: catalogs, glossary, PT copy reviewed on the preview), Process, Raise for approval. Shaping writes it; implementation follows it and never invents design.
- **Review is collaborative on the preview:** the implementer posts the preview link with desktop and phone screenshots in EN and PT-PT and asks for founder review. Any deviation from the prototype or Design System, new pattern or open design question is raised explicitly for approval (PR comment and the ticket's Decisions) before it is treated as settled. Approved decisions are written back into the ticket's `## Design` section, and into the Design System or prototype only if the founder asks.
- **New ideas** are prototyped as Claude Design artifacts on the Design System. Once approved, they are reflected in the prototype, then reconciled into tickets. Designer briefs, frozen prototype exports, coverage inventories and SHA-256 conformance are not design gates; the 2026-08 V2 prototypes are reference only.

Decisions are recorded where agents read them: the Linear ticket's `Decisions (design review, <date>)` section is the detailed contract, its `## Design` section is the reconciled design spec for UI work, and the PRD (`Areas/ho/Requirements/Platform V2 — Product Requirements.md`) changes only when requirements change. Never create registers, mutation packets, approval packets or reconciliation drafts.

## Review and acceptance session roles

The implementation and every `address-review` round share one **author** Claude Code session. The first `review-pr` starts one separate **reviewer** session for the PR, and every re-review continues that reviewer session. Reviewer and author context never mix. Every completed `accept-ticket` invocation is discarded; preflight and post-merge acceptance each start a fresh **acceptance** session.

Role continuity is working memory, not authority. Every continued round re-reads GitHub markers, the current PR head, CI, Linear, Obsidian, and repository state. If the original author session is unavailable for a legacy PR, one fresh recovery author session may be created and then reused for later remediation rounds.

One orchestrating conversation — a chat session, a dispatched Codex task, or a Claude Code or Pi session — may drive the complete loop because GitHub review markers, CI, Linear, Obsidian, and repository state are the handoff—not conversation memory:

```text
accept-ticket preflight
  → review-pr reviewer session
  → (address-review author session → review-pr reviewer session)*
  → reviewer final
  → founder merge
  → accept-ticket final
```

Skip `address-review` in a round with no developer-owned findings. The terminal review decision remains reviewer-owned, and merge remains founder-owned.

## Plugin rules

- Command aliases are thin primers that load the matching skill (`disable-model-invocation` skills).
- Protocol invariants belong in tools/hooks, not repeated prompt prose.
- The plugin namespaces its skills (`iterabase:<skill>`); `review-pr` is named to avoid the built-in `/code-review`.
- Workflow state must be reconstructable from canonical systems.
- Session state may improve UX but must not become a hidden source of truth.
- `address-review` continues the implementation author session; all `review-pr` rounds for one PR continue a separate reviewer session; acceptance is always fresh.
- A workflow that needs a founder decision asks the founder one question with a recommended answer directly in the session, then stops. The run stops there rather than proceeding on a guess: no dependent tool call follows, and the run resumes with the answer in the next turn of the same session.
- Every created or updated PR head must reach a successful terminal CI state before the owning workflow completes. A missing, failed, cancelled, timed-out, or superseded check run is not success.
- Workspace invariants are tool-enforced refusals, not prose reminders: primary-checkout detection, the worktree path convention, cleanliness, and exact-head matching live in the tools.
- Developer/address-review sessions may reply to findings but may not resolve GitHub threads or emit the terminal marker. The reviewer verifies each response, explicitly resolves accepted threads, and alone decides whether the review is final.
- Zero new findings is evidence, not an automatic final decision.
- Bulk/destructive mutations require preview and confirmation until a proven protocol safely automates them.
