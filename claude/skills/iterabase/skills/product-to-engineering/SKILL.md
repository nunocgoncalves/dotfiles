---
name: product-to-engineering
description: Translate an approved product outcome or a concrete defect, risk, or operational obligation into an engineering shaping plan and approved Linear delivery objects.
---

# Product to Engineering

Follow [[Product Management Operating System]].

## Objective

Translate one bounded delivery obligation into engineering-ready Linear scope without changing product intent. Product outcomes normally produce an outcome-based project and vertical deliverables; concrete defects, risks, and operational obligations may produce a standalone issue when a project would add no useful delivery boundary.

## Preconditions

Require exactly one traceability route:

1. **Product outcome:** an approved product brief or PRD, a clear release boundary and non-goals, acceptance scenarios or equivalent testable behavior, and a roadmap decision that the outcome is Now or explicitly approved for shaping.
2. **Delivery obligation:** concrete reproducible defect evidence, a specific security/operational risk, or an explicit operational obligation; the expected safe behavior, bounded scope/non-goals, validation, and production-impact classification must be knowable from canonical evidence and repository inspection.

A delivery obligation does not require a synthetic PRD, roadmap commitment, or Linear project. If neither route is satisfied, stop and recommend the appropriate product workflow rather than manufacturing tickets from an idea.

## Authority hierarchy

For a product outcome, the Obsidian PRD and product decisions define behavior and release boundaries. For a defect, risk, or operational obligation, the concrete evidence and expected behavior define the bounded obligation. Linear records the approved delivery slice. Repository inspection informs implementation feasibility and technical sequencing.

## Rules

- Read the relevant PRD/product decisions for product work, or the concrete evidence/obligation for standalone delivery work, plus active Linear scope and affected repositories before proposing work.
- Inspect code and repository standards to answer engineering questions yourself.
- Separate product decisions from engineering decisions.
- Ask one unresolved founder/product question at a time with a recommended answer.
- Prefer vertical, demonstrable deliverables over component-completion epics.
- A Linear project represents the outcome/release; component names belong in labels and technical scope.
- Do not create a project for a standalone defect, risk, or operational obligation unless it is genuinely part of a broader approved outcome or release.
- Show the complete proposed project and issue mutation plan before creating or updating Linear objects.
- If that exact mutation plan is not already explicitly approved in the current founder request, ask the founder in that turn and stop. Resume only after approval, then re-read canonical evidence and Linear before mutating.
- Immediately before creating an issue, search for an equivalent active issue. Reuse or update an exact match rather than duplicating it, including after a resumed or recovered run.
- Call `linear_list_teams` before create/update operations requiring IDs.

## Workflow

### 1. Extract the delivery contract

For a product outcome, list:

- Target user and outcome
- Relevant `REQ-*` and `SCN-*` identifiers
- Release criteria
- Constraints and non-goals
- Success evidence required in production

For a delivery obligation, list instead:

- Concrete evidence, risk, or obligation
- Expected safe/correct behavior
- Affected operator, system, or production boundary
- Bounded scope and non-goals
- Validation and production-impact classification

### 2. Inspect the implementation landscape

Determine:

- Existing behavior and reusable capabilities
- Affected repositories/components
- Technical standards and architecture constraints
- External prerequisites
- Unknowns that need a time-boxed spike
- Security, data, migration, and operational risks

Do not let the current architecture force unnecessary product scope.

### 3. Define the thinnest delivery slices

Each top-level deliverable should produce observable capability, for example:

1. Input can enter the product.
2. Core processing produces the intended decision/output.
3. The intended business-side effect occurs safely.
4. The user can inspect or act on the result.
5. The complete workflow can be installed and validated.

Use technical sub-issues only where they clarify ownership, dependencies, or review size.

### 4. Resolve dependencies and sequence

- Distinguish hard blockers from convenient sequencing.
- Create spikes only for genuine unknowns and give them a decision/output, not vague research scope.
- Keep issues reviewable and independently verifiable.
- Set Linear blocked-by relations after issue identifiers exist.

### 5. Prepare the Linear project when applicable

For an approved product outcome, the project brief must include:

- Target customer/user
- Product outcome and rationale
- PRD link
- Success measure
- In-scope deliverables
- Non-goals
- Release criteria
- Target period
- Risks and dependencies

For a standalone delivery obligation, explicitly record that no project is needed and why the issue is traceable under the canonical defect/risk/operational exception.

### 6. Prepare tickets

Every issue uses:

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

Acceptance criteria must be observable and testable. Link exact PRD requirement/scenario identifiers for product work. Defects, risks, and operational obligations instead link concrete evidence or the explicit obligation. `Production impact` must classify semantic publication as **required for ticket acceptance**, **deferred to product release review**, or **none**, with the release boundary or reason; do not silently equate merge with release.

### 7. Engineering-ready review

Before mutation verify:

- Every ticket has a reason to exist.
- Product-ticket sets cover the complete release scenario; standalone obligations cover the bounded expected behavior without adding unrelated depth.
- No issue silently expands product scope.
- Major unknowns are resolved or isolated.
- Validation, production impact, and semantic publication classification are explicit.
- Priorities reflect sequence: High=current release, Medium=likely next/risk reduction, Low=deferred.

### 8. Apply after approval

After the user approves the proposed plan:

- Re-read the relevant evidence and repeat the equivalent-issue search immediately before mutation.
- Create or update the outcome-based project when applicable.
- Create/update/rehome the approved issues.
- Apply labels, priorities, estimates, cycles, and dependencies.
- Put only engineering-ready committed work in Todo/current cycle.
- Leave uncommitted shaped candidates in Backlog.
- Cancel superseded issues with an explanatory description when part of the approved plan.

## Completion

Re-query every changed Linear object by its returned identifier and re-query its dependencies. Report the project link when applicable, release deliverables or standalone obligation, critical path when applicable, first ready ticket, deferred scope, and any remaining product decision.
