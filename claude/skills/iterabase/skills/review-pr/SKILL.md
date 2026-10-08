---
name: review-pr
description: Review a GitHub pull request (given as a PR number or URL, inspected via the gh CLI) along two axes — Standards (does the code follow this repo's documented coding standards?) and Spec (does the code match what the originating Linear issue / PRD asked for?). The Linear team is resolved via linear_list_teams and the spec via linear_list_issues; supplementary docs are searched in the Obsidian Areas/ho folder. Both axes are reviewed inline, in sequence, and reported side by side. Use when the user wants to review a PR or says "review PR #N".
argument-hint: "<pr-number-or-url>"
---

## Invocation

Target PR: `$ARGUMENTS` (if empty, ask for the PR number or URL).

Begin by calling `review_init` with `pr` set to the target and `mode="review"`, and wait for it to confirm CI on the current head. Apply the product authority hierarchy: Obsidian PRD/product decisions define product behavior, the Linear issue defines the approved delivery slice, and repository docs define implementation standards. Explicitly resolve only responses you verify. Post each new line-specific finding with `review_post_finding`, then post a non-terminal summary or, only when explicitly final, `review_mark_terminal`. Never call `gh pr comment`, `gh pr review`, or `gh api .../comments` directly — use the `review_*` tools (a hook blocks the raw commands).

Two-axis review of a **GitHub pull request** (supplied as a PR number or URL) along two axes:

- **Standards** — does the code conform to this repo's documented coding standards?
- **Spec** — does the code faithfully implement the originating issue / PRD / spec?

Both axes are reviewed **inline by this same agent, in sequence** (Standards first, then Spec). There are no sub-agents — keep each axis in its own section of your working context so they don't bleed into one another. Findings are **posted to the GitHub PR through the `review-workflow` tools** (`review_init`, `review_post_finding`, `review_post_summary`, …) — never raw `gh pr comment` / `gh api …/comments` (those are blocked). The tools own the markers and invariants; you own the judgement. Each finding stays tagged with its axis.

The first review starts one reviewer Claude Code session for the PR; every re-review continues that same reviewer session. Reconstruct current round state from GitHub markers and canonical sources before acting, regardless of session memory. Never reuse an implementation/author or acceptance session.

The entry point is always a **GitHub PR** (number or URL). Issue references are resolved through the **Linear tooling**: `linear_list_teams` first to pin the team key, then `linear_list_issues` / `linear_list_issue_relations` to fetch the delivery slice. Governing PRDs, direction notes, and approved decisions are searched and read from the Obsidian vault folder `Areas/ho` via the **Obsidian CLI** (`obsidian search`, `obsidian read`).

## Objective

After CI passes for the current PR head, produce one protocol-complete reviewer round that independently evaluates repository Standards and the approved Spec, leaves every actionable finding inline, explicitly accepts or counters prior developer responses, and emits a non-terminal summary or an explicitly chosen reviewer-owned terminal signal.

When a stalemate or missing product/architecture decision requires the founder, ask one question with a recommendation directly in the session, then stop. Wait for the answer before continuing; record any approval durably before relying on it.

## Preconditions

- A GitHub PR number or URL is available.
- The PR has a non-empty diff.
- CI checks exist and can reach a successful terminal state for the current head; `review_init` waits and fails closed otherwise.
- No previous review round is still pending response.
- The originating Linear delivery slice and governing product/technical sources can be resolved, or their absence is reported explicitly.

## Environment

- **Obsidian CLI**: the `obsidian` binary on PATH. The vault root is `~/Documents/2nd-brain`, so `Areas/ho` is reached via `path=Areas/ho`. Useful commands:
  - Search docs: `obsidian search query="<text>" path=Areas/ho limit=<n>`
  - Search with context: `obsidian search:context query="<text>" path=Areas/ho`
  - Read a note: `obsidian read path="Areas/ho/<Note Name>.md"` (or `file="<Note Name>"`)
  - Backlinks / tags / properties are also available (`obsidian backlinks`, `obsidian tag`, `obsidian property:read`).
- **Linear tooling**: the `linear_list_teams`, `linear_list_issues`, `linear_list_issue_relations`, `linear_list_projects` tools available in this harness. Issue identifiers look like `HOR-255` — the `HOR` prefix is the team key, obtained from `linear_list_teams` (which returns each team's `key` and `id`). Use the team key to qualify any bare `#NNN` reference found in the PR body or commit messages into `<TEAM>-NNN`.
- **review-workflow tools**: `review_init` waits for CI on the current head; `review_post_finding` and `review_post_summary` create the round; `review_resolve_thread` is the reviewer-only acceptance action for one verified response; `review_post_counter` rejects an inadequate response; `review_require_correction` routes a durably approved founder correction after the two-counter limit; `review_mark_terminal` is the reviewer-only final decision; `review_reconcile_threads` is read-only audit. No tool auto-resolves developer replies.
- **GitHub CLI** (`gh`), for reads only: `gh pr view <num> --json number,title,body,headRefName,baseRefName,headRefOid,url,state,commits`, `gh pr diff <num>`, `gh pr view <num> --json commits --jq '.commits[].messageHeadline'`. Posting comments/reviews via raw `gh` is blocked — use the review-workflow tools.
- From a URL, `gh` accepts the URL directly in place of `<num>` if the repo is the current cwd; otherwise extract the PR number.

## Process

### 1. Resolve the PR and detect the round

The user supplies a PR number or URL. If they didn't, ask for it. Call `review_init` with `mode="review"` — it resolves the PR, detects whether a prior review summary exists (`isReReview`), and identifies any pending review. A pending review normally means the previous round hasn't been addressed yet: stop and tell the user to run `address-review` first (the tools will also refuse a second summary while one is pending).

There is one narrow exception: if this same reviewer session is applying a durable founder `require correction` decision for dispute-limit findings in that pending round, do not start a second review summary and do not stop at the ordinary pending guard. Call `review_list_findings`, then `review_require_correction` for each founder-directed addressed finding. The tool attaches the decision to the pending round and makes the existing threads developer-actionable. Report `/address-review <PR>` next.

Then capture the diff and commit messages for your judgement (reads — allowed):

```
gh pr diff <num-or-url>
gh pr view <num-or-url> --json commits --jq '.commits[].messageHeadline'
```

`gh pr diff` is the three-dot merge-base diff against the base branch; no separate fixed point is needed. Confirm the diff is non-empty.

Record: the PR title/body, head/base branches, the full diff, the commit messages, and the round state from `review_init`.

**Re-review round — verify fixes, push back on unsupported disagreements, resolve the rest.** If `review_init` reports `isReReview: true`, this round is **scoped** (see Step 4). Call `review_list_findings` and read each developer reply; branch on the decision:

- `fixed` / `partial` / `answered` → independently verify the changed code or answer. If accepted, call `review_resolve_thread`. If inadequate, call `review_post_counter`. Never infer acceptance merely from the developer marker.
- `disagreed` → re-evaluate. If the cited authority genuinely refutes the finding, explicitly call `review_resolve_thread`; otherwise call `review_post_counter`. For Spec findings, a disagreement requires a governing spec line or a durable `DES-*`/approved-rescope record.
- If a finding's `reopenCount >= 2` (already disputed twice) → **do not counter again**. Ask the founder directly in the session with both positions and a recommendation, then stop and wait for the answer. Once it arrives, re-read the durable decision record. If the founder accepts the current evidence, call `review_resolve_thread`. If the founder requires correction, call `review_require_correction` for each affected finding with the stable Linear/Obsidian decision reference and the exact required change. Merely narrating the decision in a summary is insufficient because it leaves the finding `addressed` and invisible to `address-review`.

Thread resolution is deliberately manual and reviewer-owned. Call `review_resolve_thread` once for each response you accept. Use `review_reconcile_threads` read-only to confirm nothing awaits either side; automatic repair is disabled.

First-round review skips this.

### 2. Identify the spec source

First pin the Linear team so you can qualify any bare issue numbers you find. Call `linear_list_teams` and pick the team whose key matches this repo's issue-tracker prefix (this vault uses `HOR`). The team `key` is what turns a bare `#123` found in the PR into a fetchable `HOR-123`. Keep the team id too — it's useful for `linear_list_issues` queries by team and for project/cycle lookups.

Then look for the originating spec, in this order:

1. **Issue references in the PR title, head branch name, PR body, and commit messages** — this repo's convention (see `AGENTS.md`) requires the Linear identifier in the branch name (`HOR-123-short-description`), commit messages, and PR title, so scan all four. Look for patterns like `HOR-123`, `Closes HOR-67`, `Fixes #45`, or bare `#NNN`. Qualify every bare `#NNN` using the team key from `linear_list_teams` (e.g. `#45` → `HOR-45`). For each resolved identifier, fetch the full issue with `linear_list_issues` passing the `identifier` (e.g. `HOR-255`). Use `linear_list_issue_relations` to discover parent issues, blockers, and sub-issues that carry the delivery context or links to the governing PRD. The issue descriptions define the approved delivery slice; they do not automatically become the authoritative product PRD. If multiple identifiers appear, fetch all of them and follow their product-document links.
2. **A path the user passed as an argument** — read it directly.
3. **Supplementary docs in `Areas/ho`** — search the Obsidian vault for the branch name, PR title, or issue title: `obsidian search query="<branch or PR title>" path=Areas/ho`. PRDs, direction notes, and refactor plans live here (e.g. `Horizonshift Platform Direction`, `HOR-381 — Harness Warm-Worker Refactor Plan`). Read matches with `obsidian read path="Areas/ho/<Note Name>.md"`.
4. A PRD/spec file under `docs/`, `specs/`, or `.scratch/` matching the branch name or feature.
5. If nothing is found, ask the user where the spec is. If they say there isn't one, the **Spec** axis will skip and report "no spec available".

When combining sources, apply this authority hierarchy:

1. **Obsidian PRD + approved product decisions** are authoritative for product behavior, release boundaries, constraints, and non-goals.
2. **The Linear issue** is authoritative for the approved delivery slice and its engineering acceptance criteria. It should identify the relevant `REQ-*` / `SCN-*`, defect evidence, or operational risk.
3. **Repository technical designs and standards** are authoritative for implementation details and conventions.

The Linear issue may narrow a PRD into one deliverable, but it may not silently contradict or redefine the product. When a ticket and PRD conflict, do not choose whichever is convenient: flag the conflict as a Spec question/finding and require an explicit approved rescope. Legacy issues without product links remain reviewable, but report the traceability gap and use the best available approved source.

### 3. Identify the standards sources

Anything in the repo that documents how code should be written, such as `CODING_STANDARDS.md` or `CONTRIBUTING.md`. **Always read `AGENTS.md`** if present — it carries this repo's git/ticket/PR conventions and the architectural-approval rule (see below). Also check `Areas/ho` for any engineering-standards or architecture-decision notes via `obsidian search query="standards" path=Areas/ho`.

**Architectural-approval check (from `AGENTS.md`).** Require a durable `DES-<TICKET>-NN` record containing the exact decision, Nuno's approval, approval date, bounded scope, consequences, and canonical Linear/Obsidian evidence. A PR statement or Pi/session recollection without that record is not proof of approval. Flag architectural changes lacking this evidence.

On top of whatever the repo documents, the Standards axis always carries the **smell baseline** below — a fixed set of Fowler code smells (_Refactoring_, ch.3) that applies even when a repo documents nothing. Two rules bind it:

- **The repo overrides.** A documented repo standard always wins; where it endorses something the baseline would flag, suppress the smell.
- **Always a judgement call.** Each smell is a labelled heuristic ("possible Feature Envy"), never a hard violation — and, like any standard here, skip anything tooling already enforces.

Each smell reads *what it is* → *how to fix*; match it against the diff:

- **Mysterious Name** — a function, variable, or type whose name doesn't reveal what it does or holds. → rename it; if no honest name comes, the design's murky.
- **Duplicated Code** — the same logic shape appears in more than one hunk or file in the change. → extract the shared shape, call it from both.
- **Feature Envy** — a method that reaches into another object's data more than its own. → move the method onto the data it envies.
- **Data Clumps** — the same few fields or params keep travelling together (a type wanting to be born). → bundle them into one type, pass that.
- **Primitive Obsession** — a primitive or string standing in for a domain concept that deserves its own type. → give the concept its own small type.
- **Repeated Switches** — the same `switch`/`if`-cascade on the same type recurs across the change. → replace with polymorphism, or one map both sites share.
- **Shotgun Surgery** — one logical change forces scattered edits across many files in the diff. → gather what changes together into one module.
- **Divergent Change** — one file or module is edited for several unrelated reasons. → split so each module changes for one reason.
- **Speculative Generality** — abstraction, parameters, or hooks added for needs the spec doesn't have. → delete it; inline back until a real need shows.
- **Message Chains** — long `a.b().c().d()` navigation the caller shouldn't depend on. → hide the walk behind one method on the first object.
- **Middle Man** — a class or function that mostly just delegates onward. → cut it, call the real target direct.
- **Refused Bequest** — a subclass or implementer that ignores or overrides most of what it inherits. → drop the inheritance, use composition.

### 4. Run both axes inline, in sequence

No sub-agents. Hold the diff command and commit list in mind, then work each axis in turn. Keep the two sets of notes mentally separate — do not let a Spec finding color a Standards finding or vice-versa.

**Re-review scoping (when `isReReview: true`).** A re-review is NOT a fresh full review. It is scoped to:

1. **Triage prior findings by decision** — follow the `fixed`/`partial`/`disagreed`/`answered` branching in Step 1 (verify fixes, push back on unsupported disagreements, resolve the rest). Pushing back on a `disagreed` is **not** re-litigation — it's required review integrity; "no re-litigation" applies only to *new* findings (item 2).
2. **Catch genuine new defects** — only regressions introduced by the fix commits, or clear defects you genuinely missed before. Do **not** surface new nitpicks, style preferences, or “on reflection” judgements that weren't raised earlier — the goal is convergence, not re-litigation. If you're unsure whether something is genuinely new, lean toward **not** raising it.
3. **Convergence decision** — after every accepted response is explicitly resolved and nothing new remains, decide whether this round is genuinely final. Zero new findings does not force finality. Use `review_mark_terminal final=true` only when the reviewer explicitly concludes the loop is complete; otherwise post/report the non-terminal status and remaining decision.

First-round review runs both axes broadly (below). Re-review runs the scoped checks above, then the axes below only for genuinely new defects.

**Standards axis** — working through the diff:

- (a) every place the diff violates a documented standard: cite the standard (file + the rule);
- (b) any baseline smell you spot: name it and quote the hunk.

Distinguish hard violations from judgement calls — documented-standard breaches can be hard, but baseline smells are always judgement calls, and a documented repo standard overrides the baseline. Skip anything tooling enforces. Keep this under 400 words.

**Spec axis** — work through the diff against the authority hierarchy from step 2:

- (a) ticket-linked PRD requirements or acceptance scenarios that are missing or partial;
- (b) ticket acceptance criteria that are not satisfied;
- (c) behavior outside the approved ticket slice or PRD release boundary (scope creep);
- (d) implementation that appears to contradict the PRD even if the ticket wording is ambiguous;
- (e) conflicts between the ticket and PRD that require an explicit product rescope rather than reviewer guesswork.

Quote the governing line for each finding and name its source: PRD/product decision for product behavior, Linear for the delivery slice, or repository design for implementation. Keep this under 400 words.

If the spec is missing, skip the Spec axis and note this in the final report.

### 5. Categorize findings (all must be inline)

Do **not** merge or rerank findings across axes — the two axes are deliberately separate (see _Why two axes_). Every finding must become an **inline review comment** via `review_post_finding`, so it is trackable and replyable. There are no "non-line" findings: if a finding seems PR-level, anchor it to the most relevant changed line in the diff (e.g. a CI-workflow line, a Makefile line, the first changed line of the relevant file). `review_post_finding` will refuse lines that aren't added (`+`) lines, which enforces this.

For every finding, decide:

1. **Axis** — Standards or Spec.
2. **Severity** — `blocker` | `major` | `minor` | `question`. Use `question` for anything you want the developer to confirm/reply to; phrase its body as a question and prefix with `❓`.
3. **Line** — the new-file (right-side) `+` line number from `gh pr diff`.

Then prepare the **summary fields** for `review_post_summary`: a one-line `verdict` (totals + worst per axis, no cross-axis winner), a `standardsReport` (the ## Standards narrative, under 400 words), a `specReport` (## Spec, under 400 words; "no spec available" if missing), and `openQuestionCount` (the number of `question`-severity findings you posted inline).

If the user asked to **preview** (dry run), print the summary fields plus every finding (path, line, axis, severity, body) to the conversation and stop — do not call the posting tools.

### 6. Post findings, then the summary

Post findings first, then the summary (the summary is the completion signal; `review_post_summary` refuses if you've already posted one this round).

**a) One `review_post_finding` per finding** — `pr`, `path`, `line` (a `+` line), `axis`, `severity`, `body`. The tool appends the marker + axis/severity tag and validates the line. If it refuses (line not an added line), pick a valid changed line or fold the point into the summary narrative.

**b) `review_post_summary`** — `pr`, `verdict`, `standardsReport`, `specReport`, `openQuestionCount`. This posts the top-level summary with the `<!-- pi-code-review -->` marker — the **review-pr completion signal** and the start trigger for `address-review`. The tool refuses if a review is already pending.

**c) Zero findings?** Report zero new findings, then make a separate finality decision. If every prior thread was explicitly reviewer-resolved, CI passed for the current head, no approval/evidence question remains, and the reviewer concludes the loop is final, call `review_mark_terminal` with `final=true`. Otherwise do not emit the terminal marker; use a non-terminal summary or report the remaining decision.

**d) Optional verdict.** If a formal approve / request-changes state is wanted, call `review_post_verdict` after the summary.

**e) Report back** — tell the user: the PR URL, the number of inline findings posted, the summary comment id (or terminal marker), and that `address-review` may now run.

## Completion

Complete only after CI passed for the reviewed head, every accepted prior response was explicitly reviewer-resolved, every new finding was posted inline, and the reviewer emitted either a non-terminal summary or an explicit terminal marker. Report which decision was made and whether `/address-review <PR>` is next.

## Triggers

For the workflow state machine, a non-terminal round emits the **review summary** marker `<!-- pi-code-review -->`, which starts `address-review`. Only an explicitly final reviewer round emits `<!-- pi-code-review-terminal -->` via `review_mark_terminal final=true`; zero findings alone never emits it automatically.

This skill does not define its own start trigger — that's orchestration infra. Typical start events: PR `ready_for_review` / `opened` / `reopened`, or a re-review triggered by `address-review`'s completion signal.

## Why two axes

A change can pass one axis and fail the other:

- Code that follows every standard but implements the wrong thing → **Standards pass, Spec fail.**
- Code that does exactly what the issue asked but breaks the project's conventions → **Spec pass, Standards fail.**

Reporting them separately stops one axis from masking the other.
