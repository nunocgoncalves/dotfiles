---
name: release-ticket
description: Publish semantic artifacts for a merged Linear ticket through the repository's exact-SHA candidate and founder-approved promotion workflows, verify immutable release evidence, and return to the owning acceptance or product release gate. Use after merge when ticket acceptance requires publication, after an approved deferred product release decision, or via /release-ticket HOR-123.
---

# Release Ticket

Follow [[Product Management Operating System]]. This workflow performs semantic artifact publication for a merged delivery ticket. It does not merge code, deploy an overlay, mark the Linear issue Done, or declare the product outcome successful.

## Objective

Publish the explicitly approved affected release targets from the ticket's exact merged source SHA through the repository-owned build-once candidate and protected promotion flow, verify the published identities, record durable evidence, and return to the owning ticket-acceptance or product-release gate.

## Preconditions

Require all of the following:

- The Linear ticket has a merged PR. It remains **In Review** when publication is required for ticket acceptance; a ticket whose publication was deliberately deferred may already be Done.
- Review has converged and required checks passed on the merged delivery.
- Publication is authorized either by a ticket contract classified **required for ticket acceptance**, or by a recorded `product-release-review` decision that explicitly advances a previously deferred release and names the source/release scope. A `None` classification is never authority to publish.
- The merged source is contained in the protected default branch.
- The repository defines a manual candidate workflow, a separate protected promotion workflow, target/version authority, and release validation.
- The intended target set can be made explicit and must be founder-approved before candidate dispatch.

If the repository has no protected build-once release contract, stop and request release-system shaping. Never improvise publication with raw tags, local builds, direct package pushes, or GitHub Release mutations.

## Authority hierarchy

1. **Obsidian PRD and approved product decisions** — release boundary and product behavior.
2. **Linear ticket** — whether publication is required for this delivery and its accepted release slice.
3. **Repository `AGENTS.md`, release docs, target metadata, and workflows** — valid targets, version authority, exact mechanics, evidence, and rollback.
4. **Merged PR and GitHub Actions** — exact source, validation, candidate, approval, and publication evidence.

A path selector or agent recommendation may inform release intent but cannot choose it. The founder's explicit affected-target approval is authoritative.

## Rules

- Start read-only. Fetch the full issue, project, dependencies, merged PR, review state, and repository release contract before dispatching anything.
- Read the root `AGENTS.md`, applicable component instructions, release documentation, target metadata, and both candidate/promotion workflows completely.
- Use the merged PR's exact merge SHA as the candidate source unless an approved release decision explicitly names another full SHA contained in the default branch.
- Dispatch workflows from the protected default branch. Never run release logic from a feature-branch workflow revision.
- Infer versions only from repository authority. Callers approve targets, not independent version strings.
- Require a non-empty, known, unique target set. Do not silently add or remove targets.
- Ask one unresolved founder decision at a time directly in the session and include the recommended answer. Stop afterward and wait for the answer. Explicit `--targets` supplied by the user counts as release intent only when the request clearly authorizes those exact targets.
- Never self-approve the protected GitHub environment. After promotion reaches its approval gate, report the run URL and wait for founder approval.
- Never rebuild between candidate and promotion. Never overwrite or delete immutable production artifacts to resolve a conflict.
- Do not deploy or edit overlay repositories. Publication and deployment remain separate decisions.
- Do not change the issue state. `accept-ticket` owns final engineering acceptance when publication was required; `product-release-review` owns the deferred product-release decision.
- Verification worktrees are detached at the exact source SHA, live under the shared worktree root, and are removed even when verification fails. Never leave a release worktree behind.
- Preserve existing Linear content when recording release evidence.

## Workflow

### 1. Resolve the ticket, PR, and release classification

Determine the Linear identifier from the argument or current branch. Then:

- Call `linear_list_teams` to pin the team and workflow states.
- Fetch the full issue with `linear_list_issues`.
- Fetch dependencies with `linear_list_issue_relations`.
- Fetch the containing project when present.
- Resolve the GitHub PR from the ticket identifier and confirm it is merged.
- Capture the PR URL, merge SHA, head SHA, merge time, files, and required-check results.
- Use `review_list_findings` and `review_reconcile_threads` read-only to verify convergence where the review protocol applies.

Classify semantic publication from the approved acceptance and production-impact contract:

- **Required for ticket acceptance** — continue and keep the issue In Review.
- **Deferred to product release review** — continue only when the canonical product review records an approved `release` or `release with accepted exceptions` decision and explicitly authorizes this source and release scope. Otherwise stop; no publication is authorized.
- **None** — stop; no semantic release is needed. Return to `accept-ticket` when the issue is still awaiting acceptance.
- **Ambiguous** — ask the founder whether publication is required, deferred, or none. Do not dispatch until recorded.

### 2. Pin exact source and inspect repository authority

Read repository instructions and release contracts before choosing mechanics. In `iterabase-mono`, this includes:

- `AGENTS.md`
- `docs/release.md`
- `release/targets.json`
- `.github/workflows/release-candidate.yml`
- `.github/workflows/release-promote.yml`

Fetch the default branch and verify the exact source:

```bash
git fetch --no-tags origin master
source_sha=<merged-pr-merge-sha>
git cat-file -e "${source_sha}^{commit}"
git merge-base --is-ancestor "$source_sha" origin/master
```

Inspect the merged diff, version-authority changes, chart dependencies, and release target metadata. For `iterabase-mono`, known target names currently are:

```text
control-plane
inference-gateway
forge
control-plane-chart
inference-gateway-chart
iterabase-platform-chart
```

Map the release proposal from observable evidence:

- changed product behavior and package ownership;
- changed component `VERSION` files;
- changed chart `Chart.yaml` versions and dependencies;
- selected/unselected dependency identities required for a coherent candidate;
- acceptance criteria that name published outputs.

A missing required version bump or a conflicting existing semantic destination is remediation, not permission to republish.

### 3. Preflight and obtain explicit target approval

Run the repository's focused release checks and live security audit where available:

```bash
make release-check
make release-security-audit
```

Present one concise release-intent proposal containing:

- ticket and merged PR;
- exact source SHA;
- canonical target set in repository order;
- inferred versions and expected protected tags;
- why each target is included and why other targets are excluded;
- candidate suites and mandatory capacity implied by the target union;
- production effect and rollback boundary.

Ask the founder to approve that exact target set. Do not dispatch while target intent, a version bump, capacity, or artifact conflict is unresolved.

After approval, append one idempotent `## Release intent — YYYY-MM-DD` section to the Linear issue, preserving existing content. Record the authority (ticket acceptance or linked product release decision), exact source SHA, canonical targets, inferred versions/tags, and founder approval. Re-fetch the issue before dispatching.

### 4. Dispatch and verify the candidate bundle

Before creating a new candidate, inspect the ticket's existing release evidence and recent candidate runs. Reuse an already-recorded run only after its downloaded plan proves the same source SHA and exact canonical target set. Never create a duplicate merely because a previous session ended.

For `iterabase-mono`, dispatch from `master`:

```bash
candidate_url=$(gh workflow run release-candidate.yml \
  --ref master \
  -f targets='<canonical-comma-separated-targets>' \
  -f master_sha='<full-source-sha>')
candidate_run_id=${candidate_url##*/}
```

Require a numeric run ID and record the URL immediately. Watch it to completion:

```bash
gh run watch "$candidate_run_id" --exit-status --compact
```

On failure or cancellation, stop. Report the failing job and logs; do not dispatch promotion.

Download and independently verify the immutable candidate record using a detached worktree at the exact merged source, under the shared worktree root (`$PI_WORKTREE_ROOT`, default `~/Developer/worktrees`):

```bash
candidate_dir=$(mktemp -d)
source_tree="${PI_WORKTREE_ROOT:-$HOME/Developer/worktrees}/<repo>/release-<TICKET>-${source_sha:0:12}"
git worktree add --detach "$source_tree" "$source_sha"
gh run download "$candidate_run_id" --name release-candidate --dir "$candidate_dir"
(
  cd "$source_tree"
  python3 .github/scripts/release.py verify-candidate \
    --directory "$candidate_dir" > "$candidate_dir/verified-plan.json"
)
git worktree remove "$source_tree"
```

If verification fails, still remove the worktree (`git worktree remove --force "$source_tree"`) before stopping, and say so in the report.

Confirm the verified plan binds:

- the requested source SHA;
- the exact approved canonical target set;
- source-authoritative versions;
- image digests and archive checksums;
- selected candidates and immutable published baselines;
- required validation with `status=passed`.

### 5. Dispatch promotion and wait for founder approval

Reuse an existing promotion for the same candidate run if one is already recorded and verifiable. Otherwise dispatch:

```bash
promotion_url=$(gh workflow run release-promote.yml \
  --ref master \
  -f candidate_run_id="$candidate_run_id")
promotion_run_id=${promotion_url##*/}
```

Record the URL immediately. Let the verification job run. When the protected `release` environment requests approval:

- report the promotion URL, candidate run, source SHA, targets, and versions;
- ask the founder to approve or reject in GitHub;
- do not call the environment-approval API on the founder's behalf;
- stop safely if approval is pending. The workflow is re-runnable from this step.

After explicit founder approval, watch the existing promotion:

```bash
gh run watch "$promotion_run_id" --exit-status --compact
```

On rejection, failure, or cancellation, do not mark the release complete. Preserve partial-publication evidence and follow the repository's resume/correct-forward contract.

### 6. Verify exact published identities

After successful promotion, verify rather than infer:

- the promotion consumed the recorded candidate run;
- every protected production tag points to the exact candidate source SHA;
- every expected GitHub Release exists;
- semantic image aliases resolve to the candidate digests;
- chart and Forge release assets match candidate checksums;
- shared candidate plan/evidence assets are attached as required;
- the release security audit still passes;
- no overlay deployment was triggered.

Promotion is resumable/idempotent, not cross-provider transactional. If publication stopped between members, resume the same verified candidate. Never rebuild or invent a replacement identity under the same version.

### 7. Record durable release evidence

Append one idempotent `## Release evidence — YYYY-MM-DD` section to the Linear issue description, preserving all existing content. Include:

- publication authority: required for ticket acceptance, or the linked approved product-release-review decision;
- merged PR and exact source SHA;
- approved canonical targets and inferred versions;
- candidate run ID/URL and validation result;
- promotion run ID/URL and founder approval result;
- protected tags, GitHub Releases, image digests, and archive checksums;
- baseline dependencies where applicable;
- deployment effect (`None` unless separately approved);
- exceptions, partial state, or rollback/correct-forward action.

Use `linear_update_issue`, then re-fetch the issue to verify the evidence. Do not change its state.

### 8. Return to the owning gate

When publication was required for ticket acceptance, the exact next workflow is:

```text
/accept-ticket <TICKET>
```

`accept-ticket` independently verifies this evidence against the acceptance criteria before moving the issue to Done.

When publication was authorized by a deferred product release decision, return to the same `product-release-review` so it can verify publication/customer evidence and finalize the outcome state.

## Idempotency

This workflow is re-runnable.

- Reuse candidate and promotion run IDs already recorded for the exact source and targets.
- Download and verify run artifacts before trusting an existing run.
- Do not append duplicate Linear evidence sections for the same candidate/promotion pair.
- A waiting promotion remains pending founder approval; rerunning the skill must not dispatch another promotion.
- An identical successful promotion is completion evidence; do not rerun it solely to produce a newer Actions run.
- A conflicting published identity fails closed and requires an explicit corrective decision.

## Completion

Report one of:

- **Not authorized:** classification is none/ambiguous, or deferred without an approved product release decision; no workflows dispatched.
- **Candidate failed:** candidate URL and exact blocker; no promotion dispatched.
- **Awaiting founder approval:** verified candidate and promotion URLs, source, targets, and exact approval action.
- **Released:** ticket, merged PR, source SHA, targets/versions, candidate and promotion runs, tags/releases/digests/checksums, Linear evidence update, deployment effect, and exceptions.

On successful release, report the exact next command according to the owning gate:

```text
/accept-ticket <TICKET>
```

or, for a deferred release authorized by an outcome review:

```text
/product-release-review <project-or-PRD>
```
