---
name: release-ticket
description: Publish semantic artifacts for a merged Linear ticket through the repository's founder-approved release workflow at an exact master SHA, verify the promoted digests, attestations and immutable Releases, and return to the owning acceptance or product release gate. Use after merge when ticket acceptance requires publication, after an approved deferred product release decision, or via /release-ticket HOR-123.
argument-hint: "<HOR-123> [--targets target-a,target-b]"
---

# Release Ticket

Follow [[Product Management Operating System]]. This workflow performs semantic artifact publication for a merged delivery ticket. It does not merge code, deploy an overlay, mark the Linear issue Done, or declare the product outcome successful.

## Objective

Publish the explicitly approved release targets from the ticket's exact merged source SHA through the repository-owned release workflow (plan, full validation, protected founder approval, promotion of the tested digests), verify the published identities, record durable evidence, and return to the owning ticket-acceptance or product-release gate.

## Preconditions

Require all of the following:

- The Linear ticket has a merged PR. It remains **In Review** when publication is required for ticket acceptance; a ticket whose publication was deliberately deferred may already be Done.
- Review has converged and required checks passed on the merged delivery.
- Publication is authorized either by a ticket contract classified **required for ticket acceptance**, or by a recorded `product-release-review` decision that explicitly advances a previously deferred release and names the source/release scope. A `None` classification is never authority to publish.
- The merged source is contained in the protected default branch.
- The repository defines a manual release workflow with a protected approval environment, target/version authority, and release validation.
- The intended target set can be made explicit and must be founder-approved before dispatch.

If the repository has no protected build-once release contract, stop and request release-system shaping. Never improvise publication with raw tags, local builds, direct package pushes, or GitHub Release mutations.

## Authority hierarchy

1. **Obsidian PRD and approved product decisions** — release boundary and product behavior.
2. **Linear ticket** — whether publication is required for this delivery and its accepted release slice.
3. **Repository `AGENTS.md`, release docs, target metadata, and workflows** — valid targets, version authority, exact mechanics, evidence, and the fix-forward policy.
4. **Merged PR and GitHub Actions** — exact source, validation, approval, and publication evidence.

A path selector or agent recommendation may inform release intent but cannot choose it. The founder's explicit affected-target approval is authoritative.

## Rules

- Start read-only. Fetch the full issue, project, dependencies, merged PR, review state, and repository release contract before dispatching anything.
- Read the root `AGENTS.md`, applicable component instructions, release documentation, target metadata, and the release workflow completely.
- Use the merged PR's exact merge SHA as the release source unless an approved release decision explicitly names another full SHA contained in the default branch.
- Dispatch workflows from the protected default branch. Never run release logic from a feature-branch workflow revision.
- Infer versions only from repository authority. Callers approve targets, not independent version strings.
- Require a non-empty, known, unique target set. Do not silently add or remove targets.
- Ask one unresolved founder decision at a time directly in the session and include the recommended answer. Stop afterward and wait for the answer. Explicit `--targets` supplied by the user counts as release intent only when the request clearly authorizes those exact targets.
- Never self-approve the protected GitHub environment. When the release run reaches its approval gate, report the run URL and wait for founder approval.
- Never rebuild or re-tag outside the workflow: promotion copies the tested `sha-<sha>` digests. Never overwrite or delete immutable production artifacts to resolve a conflict; a broken release is fixed forward with a patch release.
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
- `release/targets.json` and `release/release_plan.py`
- `.github/workflows/release.yml` (and `full-validation.yml`, which it calls)

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
- changed component `VERSION` files and chart versions (`make bump` moves every linked field);
- references between targets: a chart's `appVersion` names its component's version, and the platform chart pins its component charts' versions;
- acceptance criteria that name published outputs.

The source tree at the release SHA pins the composition. Every member must carry a version that is not yet published, and every version a member references must be published already or released in the same set; the release fails and names the missing target rather than expanding the set. A missing version bump is remediation (a `make bump` pull request), never permission to republish.

### 3. Preflight and obtain explicit target approval

Prove the plan locally at the exact source before asking, then run the repository's release checks and live security audit:

```bash
git worktree add --detach "$source_tree" "$source_sha"
(cd "$source_tree" && python3 release/release_plan.py --targets '<comma-separated-targets>' --sha "$source_sha")
git worktree remove "$source_tree"
make release-check
make release-security-audit
```

`$source_tree` lives under the shared worktree root (`$PI_WORKTREE_ROOT`, default `~/Developer/worktrees`) and is removed even when the plan fails.

Present one concise release-intent proposal containing:

- ticket and merged PR;
- exact source SHA;
- target set and the tags the plan computed;
- why each target is included and why other targets are excluded;
- that full validation of exactly this composition runs before approval (released targets from the commit's `sha-<sha>` builds, every other image from its published version);
- production effect and the fix-forward boundary (schema migrations only go up, so a release is never rolled back by redeploying).

Ask the founder to approve that exact target set. Do not dispatch while target intent, a version bump, or a plan failure is unresolved.

After approval, append one idempotent `## Release intent — YYYY-MM-DD` section to the Linear issue, preserving existing content. Record the authority (ticket acceptance or linked product release decision), exact source SHA, targets, planned tags, and founder approval. Re-fetch the issue before dispatching.

### 4. Dispatch the release and let it validate

Before dispatching, inspect the ticket's release evidence and recent `release.yml` runs. Reuse a recorded run for the same source and targets; never dispatch a duplicate merely because a previous session ended.

For `iterabase-mono`, dispatch from `master`:

```bash
release_url=$(gh workflow run release.yml --ref master \
  -f sha='<full-source-sha>' -f targets='<comma-separated-targets>')
release_run_id=${release_url##*/}
```

Require a numeric run ID and record the URL immediately. The run requires `CI / required` and `E2E / required` green at the SHA, re-plans the release, then runs full validation of exactly what ships (about 40 minutes). On a plan or validation failure, stop and report the failing job; nothing was published.

### 5. Wait for founder approval

When the `publish` job waits on the protected `release` environment:

- report the run URL, source SHA, targets, tags, and the full-validation result;
- ask the founder to approve or reject in GitHub;
- do not call the environment-approval API on the founder's behalf;
- stop safely while approval is pending; re-running this skill resumes from the same run.

After explicit founder approval, watch the run:

```bash
gh run watch "$release_run_id" --exit-status --compact
```

On rejection, failure, or cancellation, do not mark the release complete. Report exactly which steps completed (promotion, attestation, tags, Releases); the fix is forward, never a rebuild under the same version.

### 6. Verify exact published identities

After success, verify rather than infer:

- every protected tag points to the exact source SHA;
- every expected GitHub Release exists, is immutable, carries its chart or Forge assets, and the platform-chart release (if any) is Latest;
- every promoted image digest is identical to the tested preview build:

```bash
test "$(crane digest ghcr.io/iterabase/<image>:<version>)" = "$(crane digest ghcr.io/iterabase/preview/<image>:sha-<sha>)"
```

- build-provenance attestations verify (`gh attestation verify oci://ghcr.io/iterabase/<image>:<version> --owner iterabase`, and for each Release asset);
- the release security audit still passes;
- no overlay deployment was triggered.

### 7. Record durable release evidence

Append one idempotent `## Release evidence — YYYY-MM-DD` section to the Linear issue description, preserving all existing content. Include:

- publication authority: required for ticket acceptance, or the linked approved product-release-review decision;
- merged PR and exact source SHA;
- approved targets and versions;
- `release.yml` run ID/URL, full-validation result, and founder approval;
- tags, GitHub Releases, image digests (and that each equals `sha-<sha>`), Release asset checksums, and attestation verification;
- deployment effect (`None` unless separately approved);
- exceptions or fix-forward action.

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

- Reuse the `release.yml` run already recorded for the exact source and targets.
- A run waiting on approval stays pending founder approval; re-running the skill must not dispatch another release.
- Do not append duplicate Linear evidence sections for the same run.
- An identical successful release is completion evidence; do not rerun it to produce a newer run.
- A version that is already published fails the plan; that is a bump, never a republish.

## Completion

Report one of:

- **Not authorized:** classification is none/ambiguous, or deferred without an approved product release decision; no workflows dispatched.
- **Validation failed:** release run URL and exact blocker; nothing published.
- **Awaiting founder approval:** release run URL, source, targets, tags, full-validation result, and exact approval action.
- **Released:** ticket, merged PR, source SHA, targets/versions, release run, tags/Releases/digests (equal to `sha-<sha>`)/attestations, Linear evidence update, deployment effect, and exceptions.

On successful release, report the exact next command according to the owning gate:

```text
/accept-ticket <TICKET>
```

or, for a deferred release authorized by an outcome review:

```text
/product-release-review <project-or-PRD>
```
