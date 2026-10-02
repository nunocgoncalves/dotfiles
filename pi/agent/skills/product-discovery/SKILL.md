---
name: product-discovery
description: Register and shape customer opportunities as durable Obsidian artifacts, individually or as a portfolio with timelines and shared-capability mapping. Use for new leads, customer requests, opportunity intake, or before writing PRDs and engineering tickets.
---

# Product Discovery

Follow [[Product Management Operating System]].

## Objective

Register customer signals, requests, ideas, or observed problems as stable opportunity artifacts, then shape each into an evidence-based decision and product brief when justified. When multiple opportunities share scope, maintain a portfolio register and capability map before choosing roadmap commitments. This workflow does not create implementation tickets.

## Authority hierarchy

Customer evidence and approved product strategy govern the opportunity decision. Obsidian holds the canonical opportunity/brief. Linear is consulted for conflicts and existing commitments but is not mutated here.

## Rules

- Inspect existing Obsidian product notes, Linear scope, and relevant repository behavior before asking questions.
- Use the Obsidian CLI for vault operations.
- Start with the user and problem, not a proposed feature or architecture.
- Separate evidence, inference, assumption, and decision.
- Ask one question at a time, in dependency order, with a recommended answer.
- Prefer the cheapest validation action that can invalidate the riskiest assumption.
- Do not create Linear implementation work in this workflow.
- Register opportunities before forcing a single roadmap winner; compare them only after the factual timeline, evidence, and desired outcome are captured.
- Do not call technical reuse "common product scope" until the same customer-visible requirement is evidenced across opportunities.

## Opportunity artifact model

Use stable IDs and canonical paths:

```text
Areas/ho/Product Opportunities.md
Areas/ho/Opportunities/OPP-001 — <short name>.md
Areas/ho/Opportunity Capability Map.md
```

`Product Opportunities.md` is the portfolio register. Each opportunity gets one note with frontmatter:

```yaml
id: OPP-001
type: product-opportunity
status: captured # captured | discovery | qualified | committed | won | lost | parked
created: YYYY-MM-DD
updated: YYYY-MM-DD
customer: <customer or segment>
commercial_stage: <lead/design-partner/proposal/contract/etc.>
decision_date: YYYY-MM-DD # when a real decision exists
confidence: low # low | medium | high
```

The opportunity note body uses:

```markdown
## Signal and evidence
## Target customer and user
## Problem / job to be done
## Current process and workaround
## Timeline and forcing function
## Desired customer outcome
## Business and commercial relevance
## Required product behavior
## Candidate shared capabilities
## Customer-specific scope
## Success measures
## Constraints and non-goals
## Assumptions and risks
## Next validation action
## Decision
```

The register summarizes ID, customer/opportunity, stage, real date, evidence/confidence, desired outcome, status, and next action. The capability map uses opportunities as columns and requirements/capabilities as rows, classifying each row as:

- `core` — evidenced customer-visible requirement shared by the target product
- `shared-option` — shared by multiple opportunities but not universal
- `bespoke` — engagement-specific
- `enabler` — shared engineering mechanism, not itself a product requirement

## Workflow

1. **Register the opportunity**
   - Inspect the existing register and allocate the next stable `OPP-NNN` ID.
   - Capture a short name, customer/segment, commercial stage, real decision/go-live date, source, and one-sentence desired outcome.
   - Create the opportunity note and add it to the register before deep shaping.
   - If several opportunities are supplied together, register all of them at this skeletal level first, then deepen them in deadline/evidence order.

2. **Capture the signal**
   - Source and date
   - Target customer and user
   - What happened or was requested
   - Exact evidence or quote where available

3. **Frame the opportunity**
   - Job to be done
   - Current behavior/workaround
   - Frequency and severity
   - Economic or operational consequence
   - Why now

4. **Assess strategic value**
   - Fit with current positioning
   - Commercial relevance
   - Reusability beyond one client
   - Relationship to current Now work
   - Opportunity cost

5. **Map assumptions**
   - Desirability
   - Viability
   - Feasibility
   - Usability/adoption
   - Rank by impact × uncertainty

6. **Map portfolio overlap**
   - Compare required customer-visible behavior across registered opportunities.
   - Update `Opportunity Capability Map.md` with core/shared-option/bespoke/enabler classifications.
   - Record the earliest real date and strongest evidence for each shared capability.
   - Keep uncertain overlap labeled as a hypothesis.

7. **Choose the next decision**
   - `advance` — evidence is sufficient for a product brief/PRD
   - `validate` — run a specific experiment or interview
   - `park` — potentially useful, not timely
   - `reject` — does not fit or is not valuable enough

8. **Finalize the artifacts**

Update the opportunity note, portfolio register, and capability map through the Obsidian CLI. If advancing, extend the opportunity note into a concise product brief with desired customer outcome, desired business outcome, and explicit release hypothesis. Do not merge distinct opportunities into one PRD merely because they share implementation.

## Completion

Finish by stating:

- Registered opportunity ID and artifact path
- Portfolio/register and capability-map changes
- Decision and rationale
- Strongest evidence and real timeline
- Riskiest remaining assumption
- Next validation action or recommendation to invoke `product-requirements`
- What must not enter Linear yet
