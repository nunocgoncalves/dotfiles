# review-workflow extension for pi

The protocol layer for the **code-review ⇄ address-review** loop. It provides
the only sanctioned tools for posting review artifacts to a GitHub PR, and
enforces the markers + invariants that the prompt-based skills cannot reliably
enforce alone.

This is a **product** tool — it lives in the overlay repo at
`pi/product/extensions/review-workflow/` and ships to every AgentSandbox. For
localhost, symlink it into `~/.pi/agent/extensions/` (see the overlay README).

## Why it exists

Every failure seen in real review threads (skipped replies, prose-only rounds,
duplicate completion signals, markers posted alongside open questions) was a
**protocol** failure, not a judgement failure. The LLM's review judgement was
fine; it just couldn't reliably follow "reply to all 19 findings" or "post the
marker exactly once." Code is good at exactly that. So:

- **Judgement stays in the SKILLs** (smells, agree/disagree rubric, fixes).
- **Protocol + invariants + mechanics live here** (markers, gates, state).

## Tools

| Tool | Role | Enforces |
|------|------|----------|
| `review_init` | Wait for CI on reviewer entry, then resolve the PR + current round. | Current head must have successful terminal checks. |
| `review_list_findings` | Enumerate findings as `open`, `contested`, `addressed`, or reviewer-`resolved`. | Native resolution is reviewer-owned. |
| `review_post_finding` | Post one inline finding on an added (+) line. | Marker present; line is in the diff; no finding after the summary. |
| `review_post_summary` | Post the code-review summary → **code-review completion signal**. | No double review (refuses if a review is pending). |
| `review_post_reply` | Developer reply to one finding. | Changes `open`/`contested` to `addressed`; never resolves the thread. |
| `review_post_counter` | Reviewer rejects an addressed response. | Changes it to `contested`; refuses duplicates and stalemates. |
| `review_require_correction` | Reviewer applies a durable founder require-correction decision at the stalemate limit. | Changes the existing thread to `contested` without incrementing counters or duplicating the finding. |
| `review_post_response_summary` | Wait for CI, then post the developer response signal. | Refuses unreplied findings and duplicates; never resolves or finalizes. |
| `review_post_verdict` | Post an approve / request-changes / comment review state. | Machine-readable blocking signal for the state machine. |
| `review_mark_terminal` | Reviewer-only explicit final decision. | Requires `final=true` and every prior thread already reviewer-resolved; zero new findings alone is insufficient. |
| `review_resolve_thread` | Reviewer accepts one verified response. | Refuses address mode; idempotent and paginated. |
| `review_reconcile_threads` | Read-only audit of developer/reviewer queues. | `fix=true` is rejected; no automatic reconciliation. |
| `open_pr` | Open a convention-correct PR and wait for CI. | Latest head must pass every check; absence or supersession blocks. Does not merge. |
| `worktree_ensure` | Create or reuse the dedicated ticket worktree. | Convention path `<root>/<repo>/<TICKET>`; refuses while the primary checkout still holds the branch; reuse never resets work. |
| `worktree_remove` | Remove the ticket worktree after merge/acceptance. | Refuses a dirty worktree unless `force=true`; prunes stale metadata. |

## The state machine (via GitHub markers alone)

```
ready_for_review ──▶ review_post_summary      [<!-- pi-code-review -->]
                          │  (start trigger for address-review)
                          ▼
                    review_post_reply ×N  ──▶  review_post_response_summary
                          │                       [<!-- pi-code-review-response review=<id> -->]
                          │  (start trigger for re-review)
                          ▼
                    review_post_summary (re-review) ──▶ …
                          │
                   (terminal only after reviewer explicitly resolves and finalizes)
```

## Integrated product-to-engineering lifecycle

The review protocol sits inside the broader operating flow; it does not own product shaping, implementation start, merge, or post-merge acceptance:

```text
product-discovery → product-requirements → product-roadmap
  → product-to-engineering
  → start-ticket → implementation → automatic open-pr → CI
  → code-review ⇄ address-review → reviewer-owned terminal
  → user merge → accept-ticket
  → product-release-review → product-weekly-review
```

The implementation and every `address-review` round share one author session.
All `code-review` and re-review rounds for a PR share a separate reviewer
session. Tool state in either session is only a convenience: every round
reconstructs its authoritative state from GitHub markers and the current PR.

Authority is layered: the Obsidian PRD and approved product decisions define product behavior; the Linear issue defines the approved delivery slice; repository designs and standards define implementation. Review must surface conflicts instead of letting a lower layer silently redefine a higher one.

A review summary is **pending** until a response summary references it. The tools
refuse to advance out of order:

- `review_post_finding` refuses if a review is pending (findings before summary).
- `review_post_summary` refuses if a review is pending (no double review).
- A reviewer may call `review_require_correction` inside that pending round only to apply a durably recorded founder require-correction decision after the two-counter limit; this is not a second review.
- `review_post_reply` leaves the native thread open and refuses a duplicate developer response.
- `review_post_counter` changes an addressed response to contested; stalemates escalate.
- `review_require_correction` makes a founder-required stalemate correction developer-actionable only after two counters and a durable decision reference; it does not weaken the counter limit.
- `review_post_response_summary` waits for CI, refuses open/contested findings, and never marks final.

## Workspace boundary

Mutating ticket work happens in one dedicated linked git worktree per ticket,
never in the primary checkout:

```text
worktree   <root>/<repo>/<TICKET>          root = $PI_WORKTREE_ROOT, default ~/Developer/worktrees
branch     <TICKET>-<short-description>    checked out in that worktree
```

`worktree_ensure` creates or reuses it; `worktree_remove` tears it down after
acceptance. The tools enforce the boundary as hard refusals:

- `open_pr` resolves the convention path (the `worktree_ensure` output or the
default), then refuses the primary checkout, a dirty working tree, a
non-matching branch, and a PR head that is not the worktree HEAD.
- Address-mode `review_post_reply` and `review_post_response_summary` are refused
unless the ticket worktree exists, holds a `<TICKET>-*` branch, is clean, and
its HEAD equals the PR head. A `commitSha` on a `fixed`/`partial` reply must be
contained in that HEAD.
- `review_init mode="address"` reports the workspace read-only, so a missing or
stale worktree is visible before the first reply.
- `before_agent_start` names the primary checkout when a session starts there,
so the agent is told where ticket work belongs before it edits anything.

Because git refuses to check out a branch already checked out in another
worktree, once `worktree_ensure` succeeds the primary checkout can no longer
receive ticket commits — the boundary is structural, not advisory. Code review
reads GitHub only and needs no checkout, so review sessions may run anywhere.

## Reviewer-owned resolution

A response marker means only that the developer addressed a finding. The GitHub
thread remains open. During re-review, the reviewer either calls
`review_resolve_thread` after independently accepting the response or posts a
counter. `review_mark_terminal final=true` refuses until every prior thread is
already reviewer-resolved. `review_reconcile_threads` reports the developer and
reviewer queues but cannot mutate them.

## Guards

- A `tool_call` hook blocks raw `gh pr comment`, `gh pr review`, and
  `gh api .../{pulls,issues}/<n>/{comments,reviews}` so the LLM can't post
  un-markered artifacts. `gh pr view` / `gh pr diff` / `gh pr create` are
  unaffected.
- `before_agent_start` injects the active PR/mode into the system prompt and
  names the primary checkout when a session starts there.

## Files

- `index.ts` — entry point; registers tools, commands, guards, state injection.
- `tools.ts` — the review_* + open_pr tools and their invariant checks, including the migration-safe Linear traceability preflight.
- `commands.ts` — `/code-review`, `/address-review`, `/open-pr` primers.
- `github.ts` — `gh` helpers (exec, post, list) via `pi.exec`.
- `diff.ts` — unified-diff parser for added-line validation.
- `markers.ts` — marker constants + parsers.
- `worktrees.ts` — workspace boundary: worktree path convention, primary-checkout detection, inspection, create/reuse, removal, and the exact-head gate.
- `state.ts` — per-session state via `pi.appendEntry`.

## Requirements

- `gh` (GitHub CLI) authenticated, run from inside the repo checkout.
- The matching SKILLs (`code-review`, `address-review`, `open-pr`) loaded — they
  drive these tools. The `linear` extension is needed for `open_pr`'s follow-up
  (moving the ticket to In Review).
