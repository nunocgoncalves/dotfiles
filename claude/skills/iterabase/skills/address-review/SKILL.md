---
name: address-review
description: After code review posts findings, continue the implementation author session to investigate each comment, fix the code you agree with, reply with reasoning to disagreements, and answer questions through the review-workflow tools. Use when the user says "address the review on PR #N".
argument-hint: "<pr-number-or-url>"
---

## Invocation

Target PR: `$ARGUMENTS` (if empty, ask for the PR number or URL).

Begin by calling `review_init` with `pr` set to the target and `mode="address"`, then `review_list_findings` to enumerate findings. Investigate each against the Obsidian PRD/product decisions, Linear delivery slice, and repository standards. Fix what you agree with (commit + push from the ticket worktree), then reply with `review_post_reply` (one per finding). Do not resolve threads or mark final. Finish with `review_post_response_summary`, which waits for CI on the updated head. Never call `gh pr comment`, `gh pr review`, or `gh api .../comments` directly — use the `review_*` tools (a hook blocks the raw commands).

The companion to `review-pr`. `review-pr` **leaves** findings on a PR; this skill **responds** to them. Every round continues the original implementation **author** session, with the dedicated ticket worktree (`<root>/<repo>/<TICKET>`) as the place where code is changed, committed, and pushed. If that session is unavailable for a legacy PR, the first remediation run creates one recovery author session and later rounds continue it. Never use the reviewer or acceptance session. Always reconstruct current state from the PR, review markers, Linear, Obsidian, and repository standards before acting.

Given a PR number, it runs end-to-end unless a genuine founder/product/architecture decision blocks remediation:

1. Resolve the PR + enumerate the latest review's findings (via the `review-workflow` tools).
2. Investigate each finding against the code, the spec (Linear), and standards docs.
3. Fix what it agrees with (edit → commit → push); rebut what it disagrees with; answer `❓` questions.
4. **Reply phase** — post one `review_post_reply` per finding, then let `review_post_response_summary` wait for CI and emit the developer completion signal. Do not resolve threads or mark the review final.

Ordinary finding investigation is autonomous. If an explicit rescope, architecture decision, or review stalemate requires the founder, ask one question with a recommendation directly in the session, then stop. Wait for the answer before continuing; record any approval durably before relying on it.

## Objective

Address every open or contested finding in one pending review round through an investigated fix, partial fix, supported disagreement, or answered question, wait for CI on the updated head, and emit exactly one response summary for reviewer re-review. Only the reviewer resolves findings and finalizes the loop.

## Preconditions

- A PR number or URL with a pending `review-pr` summary is available.
- The ticket worktree can check out the PR head branch.
- Linear, Obsidian, repository standards, and review-workflow tools are available for source verification.

### Guarded post-response CI recovery

The orchestrator may invoke this skill in explicit guarded CI recovery mode when the latest review already has its developer response, later author commits advanced the PR head, and that newer exact head failed CI. The dispatcher must first verify the answered latest round, absence of a newer review or terminal marker, newer exact head, failing checks, and a clean ticket worktree (`<root>/<repo>/<TICKET>`) whose HEAD exactly matches the PR head.

In this mode:

1. Do not call `review_init` and do not create, reply to, resolve, summarize, or finalize review protocol state. The dispatcher withholds review-mutation tools.
2. Re-read the PR, Linear ticket, approved decisions, repository standards, failed exact-head checks, and retained diagnostics. Diagnose the failure before editing; never use a rerun as evidence of a fix.
3. Change only behavior within the existing approved ticket and decisions. Preserve test selection, real-behavior testing, and every production recovery boundary. If resolution needs a product/architecture decision, request founder input and stop.
4. Apply evidence-backed fixes in the ticket worktree, commit and push from there, and wait for exact-head CI. Do not perform test-authored/manual recovery that production behavior does not perform.
5. Complete only when exact-head CI passes. Report the pushed SHAs and CI evidence, then route to the preserved reviewer session. If CI still fails or the approved contract cannot be met, report the concrete blocker without posting a developer response marker.

This recovery mode exists only for the post-response/newer-red-head state. Ordinary pending findings use the normal process below.

## How the two skills link

The `review-workflow` MCP tools (this plugin's `review` server) are the protocol layer both skills share. `review-pr` posts findings and owns reviewer acceptance; this skill replies via `review_post_reply` and finishes via `review_post_response_summary`. A developer reply changes a finding to `addressed`, not `resolved`. Only reviewer-mode `review_resolve_thread` may resolve it, and only reviewer-mode `review_mark_terminal` may finalize the loop.

## Environment

- **review-workflow tools**: `review_init`, `review_list_findings`, `review_post_reply`, and `review_post_response_summary`. These enforce idempotency and CI gating. They deliberately do **not** expose thread resolution or terminal marking to address mode.
- **Workspace tools**: `worktree_ensure` reuses or creates the dedicated ticket worktree; `worktree_remove` tears it down after merge/acceptance. `review_post_reply` and `review_post_response_summary` are refused unless that worktree exists, is clean, and its HEAD equals the PR head.
- **GitHub CLI** (`gh`), for reads only (PR metadata, diff): `gh pr view <num> --json ...`. Posting comments/reviews via raw `gh` is blocked.
- **Linear tooling** — `linear_list_teams` (team key), `linear_list_issues` (spec by identifier), `linear_list_issue_relations` (parent/sub-issues). Used to re-check Spec findings.
- **Obsidian CLI** (`obsidian`) — `obsidian search query="..." path=Areas/ho` and `obsidian read path="Areas/ho/<Note Name>.md"`. Used to re-check the authoritative PRD/product decisions and any standards notes.

## Authority hierarchy

1. **Obsidian PRD + approved product decisions** — product behavior, release boundaries, constraints, and non-goals.
2. **Linear issue** — the approved delivery slice and engineering acceptance criteria.
3. **Repository technical design and standards** — implementation details and conventions.

A ticket may narrow the PRD but cannot silently redefine it. If a finding exposes a PRD/ticket conflict, do not mark it `disagreed` based only on the ticket wording; escalate for an explicit product rescope. Legacy tickets without product links use the best approved source available and retain a traceability warning.

## Process

### 1. Resolve the PR and enumerate the findings

The user supplies a PR number or URL. Call `review_init` with `mode="address"` to resolve the PR, its head branch, the pending round, and the read-only `workspace` report. Derive the ticket from the head branch (`HOR-NNN-…`) and call `worktree_ensure ticketId=<TICKET>`: it reuses the existing branch and refuses, with the exact move-off command, while the primary checkout still holds it. Then:

- Call `review_init` with `mode="address"`. It refuses if no review is pending (nothing to address). It returns the PR metadata and the pending review summary id.
- Call `review_list_findings`. Act only on `open` or `contested` findings. A contested finding with `founderRequired=true` carries the exact correction in `founderRequirement` and its durable approval source in `founderDecisionRef`; implement the full current requirement even when `reopenCount >= 2`, rather than reusing a prior reply. `addressed` means a prior developer reply awaits the reviewer; `resolved` means the reviewer accepted it.

If no findings await a developer response, skip to the response summary or stop if one already exists. Never resolve threads yourself.

### 2. Triage each finding (investigate → decide → act)

Work through every unresolved finding. For each, **investigate** before deciding:

- Read the code at the cited line and enough surrounding context to understand intent.
- For **Spec** findings, re-fetch the originating Linear issue (`linear_list_issues`) and the governing PRD/product decision in `Areas/ho`; confirm the ticket's delivery slice, the higher-level product behavior, and whether the review correctly applied both.
- For **Standards** findings, re-check the cited standard file / `Areas/ho` standards note and the smell definition; confirm the smell applies.

Then decide into one bucket — the `decision` value you'll pass to `review_post_reply`:

| Decision | `decision` | Code action | Reply body |
|---|---|---|---|
| **Agree** | `fixed` | Fix the code | `Fixed in <short-sha>: <one-line what changed>` |
| **Partial** | `partial` | Fix the agreed part | what was fixed + what wasn't + why |
| **Disagree** | `disagreed` | No change | **Spec:** cite the governing PRD/product-decision line and the ticket's approved slice, OR cite a user-approved rescope. Ticket wording alone cannot overrule the PRD. **Standards:** cite an overriding repo standard, or show the smell doesn't apply. "Out of scope / deferred / not needed" **without** an approved rescope is NOT a valid disagreement — fix it, or escalate to the user for a rescope decision. |
| **Question (`❓`, severity=question)** | `answered` | None (unless the answer reveals a fix) | the answer; if it surfaces a real defect, also fix it and note that |

Rubric:

- Default to **agreeing** with the review unless you have a concrete, citable reason not to. "I prefer it my way" is not a reason.
- A documented repo standard, governing PRD/product decision, or consistent Linear delivery criterion beats the reviewer's judgement; cite the correct authority layer when rebutting.
- **Never bail from spec scope via `disagreed`.** If a Spec finding is backed by the Linear issue / PRD, either fix it or ask the founder for an approved rescope (AGENTS.md) — do not unilaterally mark it `disagreed` as "out of scope".
- For genuine ambiguity, state your interpretation and the assumption you're proceeding under rather than leaving the thread hanging.
- Keep every reply under ~120 words and focused on the one finding.

**If the reviewer reopens a finding (`review_post_counter`, status → `contested`)**, you must reply again — the gate won't let you finish while any finding is contested. Either concede (`fixed`) with an actual fix, or re-justify `disagreed` with a **stronger** citation (a spec line or approved rescope you didn't cite before). Do not simply repeat the prior disagreement. If the same finding has been disputed ≥2 times (`reopenCount >= 2`) and `founderRequired` is absent, stop re-disagreeing and request a founder decision. If `founderRequired=true`, the founder already decided: compare the current head to every clause in `founderRequirement`, implement any missing behavior, cite `founderDecisionRef`, and reply with the resulting fix rather than escalating or merely repeating a prior response.

Record, per finding: `findingCommentId`, `decision`, the fix (if any) as an edit, and the reply text.

### 3. Apply fixes

Apply all agreed/partial code edits at the ticket worktree's absolute path, then commit and push them in one or a few logical commits on the head branch from there:

```
git -C <worktree> add -A
git -C <worktree> commit -m "address review: <short summary>"
git -C <worktree> push origin HEAD
```

The reply tools refuse a response whose worktree is dirty or whose HEAD is not the PR head, so the fix must be committed and pushed from the worktree before replying.

Capture the short SHAs — each `fixed`/`partial` reply should pass `commitSha` to `review_post_reply` so the response marker records it. If many findings are fixed together, reference the same SHA from each.

Do not resolve any GitHub review thread after replying. The open thread is the reviewer's queue. After the push, CI must pass for that exact head before the developer response summary may be posted; `review_post_response_summary` enforces this.

### 4. Reply phase (the single unit)

This is the composable unit a workflow spawns. It makes **no further decisions** — all decisions were made in step 2 — so it's deterministic and safe to retry.

**a) One `review_post_reply` per open/contested finding** — `pr`, `findingCommentId`, `decision` (`fixed` | `partial` | `disagreed` | `answered`), `body`, and `commitSha` for `fixed`/`partial`. The reply records the developer response but deliberately leaves the GitHub thread open for reviewer verification.

**b) `review_post_response_summary`** — `pr`, optional `reviewSummaryId`, optional `notes`. This gate waits for CI on the current head, re-verifies the ticket worktree HEAD equals the CI head and is clean, refuses unreplied findings and duplicates, and posts `<!-- pi-code-review-response review=<id> -->`. It means ready for reviewer re-review—not resolved and not final.

### 5. Report back

Tell the user: PR URL, counts, pushed SHAs, the ticket worktree path and checked head SHA, CI result, and a one-line-per-finding decision table. Confirm the response-summary id and that every thread remains pending reviewer acceptance.

## Completion

Complete only after every open/contested finding has one developer reply, CI passes on the current head, and `review_post_response_summary` succeeds. Report that `/review-pr <PR>` is the next reviewer workflow.

## Idempotency

Enforced by the tools — safe to re-run against the same PR:

- `review_post_reply` refuses if a thread already has a response marker (no duplicate replies).
- `review_post_response_summary` refuses if a response summary already exists for the review (no duplicate completion), and refuses if any finding is still unreplied.
- A new `review-pr` round posts a newer summary; `review_init` / `review_list_findings` target the latest pending round, so rounds don't collide.

## Triggers

For the workflow state machine, this skill has one stable **start trigger** and one stable **completion signal**, both emitted by the tools.

- **Start trigger** — a new top-level PR comment containing `<!-- pi-code-review -->` appears (i.e. `review_post_summary` just finished a `review-pr` run).
- **Completion signal (stable final identifier)** — `review_post_response_summary` posts a top-level comment containing `<!-- pi-code-review-response review=<summary-comment-id> -->`. An orchestrator watches for that marker to know `address-review` is done and the PR is ready for a re-review round. The `<summary-comment-id>` ties the response to the specific review round.

This skill does not define how it gets spawned — that's orchestration infra. The two markers above are the contract the state machine relies on.

## As a workflow unit

Input contract: `{ "pr": <number-or-url> }` (optional `force: true` to ignore idempotency). Output: the report from step 5 (PR URL, counts, SHAs, per-finding table). No prompts, no required human input mid-run. An outer workflow can therefore spawn an agent that invokes this skill on a PR and collect a deterministic result — pair it with `review-pr` (which is similarly autonomous given a PR) to make a full review → respond loop.
