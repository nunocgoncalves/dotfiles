---
name: product-release-review
description: Evaluate a deliverable against its PRD release criteria, production evidence, and intended customer/business outcome; record learning and decide release, remediation, rollback, or stop.
---

# Product Release Review

Follow [[Product Management Operating System]].

## Objective

Decide whether an outcome release is ready, validated, still measuring, in remediation, rolled back, or stopped, and record the product learning. Merged code is delivery progress, not proof of product success.

## Authority hierarchy

The PRD defines the intended outcome and release criteria. Linear and GitHub provide delivery evidence. Production/customer evidence determines release and outcome validation.

## Rules

- Read the canonical PRD, Linear project, linked issues/PRs, and production evidence.
- Use the Obsidian CLI for product artifacts.
- Distinguish engineering validation, release readiness, customer validation, and outcome measurement.
- Do not mark product work successful because tickets are closed or artifacts were merely merged.
- Ask one unresolved decision question at a time directly in the session with a recommendation, then stop and wait for the answer.
- Do not move projects/issues to completed unless the relevant acceptance contract is satisfied or the user explicitly accepts a documented exception.
- When the release decision requires semantic artifact publication that was deferred from ticket acceptance, record the approved source and exact affected-target intent, then route publication through `release-ticket`; never publish with raw tags or ad hoc package commands.

## Workflow

### 1. Reconstruct the release contract

Extract:

- Target customer/user
- Desired customer and business outcomes
- `REQ-*`, `SCN-*`, and release criteria
- Success measures
- Constraints, non-goals, and accepted risks

### 2. Gather evidence

Collect:

- Issue and PR completion state
- Automated tests and deployment validation
- End-to-end scenario results
- Production telemetry
- Security/operational checks
- Customer or user observation
- Known defects and exceptions

Label missing evidence explicitly; do not convert absence into a pass.

### 3. Evaluate gates

Assess separately:

- **Engineering complete:** intended implementation and tests exist.
- **Release ready:** end-to-end behavior, operations, and risks are acceptable.
- **Customer validated:** intended user can achieve the outcome.
- **Outcome validated:** success measure has moved or enough time/data exists to assess it.

Possible decisions:

- `release`
- `release with accepted exceptions`
- `remediate`
- `rollback`
- `stop`
- `continue measuring`

### 4. Satisfy deferred semantic publication

If the approved `release` decision requires semantic artifacts that were deliberately deferred from engineering-ticket acceptance:

1. Record the founder-approved release decision, release-driving ticket, exact source SHA, and explicit affected-target set in the canonical outcome review.
2. Keep the project out of Completed while publication evidence is absent.
3. Run:

   ```text
   /release-ticket <release-driving-ticket> --targets <canonical-target-set>
   ```

4. After the release workflow publishes, rerun this product release review and verify the recorded release evidence (run, tags, Releases, digests, attestations) before declaring the outcome released.

If no semantic publication is required, record why. Artifact publication alone still does not prove customer or outcome validation.

### 5. Record the outcome review

Create/update an Obsidian review containing:

```markdown
## Release reviewed
## Intended outcome
## Scope shipped
## Evidence by acceptance scenario
## Release-gate decision
## Exceptions and accepted risks
## Customer response
## Success measures
## Assumptions confirmed/refuted
## What implementation revealed
## Continue/change/stop decisions
## Follow-up actions
## Roadmap consequence
```

### 6. Reconcile delivery

After approval:

- Update the Linear project status and content.
- Close only accepted issues.
- Create follow-ups only when they represent approved remediation, concrete defects, or newly shaped product work.
- Route new opportunities back to `product-discovery` rather than immediately creating feature tickets.
- Update Now / Next / Later based on learning.

## Completion

Report the gate result, strongest and missing evidence, accepted exceptions, measured outcome, roadmap consequence, and next decision date/action.
