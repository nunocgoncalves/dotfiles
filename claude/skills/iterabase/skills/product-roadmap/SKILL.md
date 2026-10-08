---
name: product-roadmap
description: Prioritize approved product opportunities and PRDs into an outcome-based Now/Next/Later roadmap with explicit trade-offs, confidence, dependencies, and success measures.
---

# Product Roadmap

Follow [[Product Management Operating System]].

## Objective

Prioritize approved opportunities and PRDs into one outcome-based Now / Next / Later sequence with explicit trade-offs, confidence, dependencies, and success measures—not a component or task list.

## Authority hierarchy

Approved product strategy, evidence, PRDs, and release learning govern priority. Linear provides current delivery cost/state but does not determine roadmap value from sunk work.

## Rules

- Use the Obsidian CLI for all product-document operations.
- Read current strategy, product briefs, PRDs, release learnings, and active Linear projects before prioritizing.
- Do not treat sunk engineering effort as customer evidence.
- Maintain one primary commercial outcome in Now.
- Ask one decision question at a time with a recommendation.
- Every promotion into Now must identify what is deferred or stopped.
- Do not mutate Linear until the roadmap change is approved.

## Workflow

1. **Inventory candidates**
   - Customer/user outcome
   - Evidence and confidence
   - Commercial urgency
   - Strategic fit
   - Success measure
   - Dependencies
   - Cost, reversibility, and risk

2. **Review current commitments**
   - Does each active project represent an outcome?
   - Does it still support current product direction?
   - Is it required for the current sellable release?
   - Is WIP hiding a priority decision?

3. **Compare candidates**

Use customer impact, commercial urgency, strategic fit, evidence/confidence, cost, reversibility, and delivery risk. Treat any numerical score as decision support, not an automatic ranking.

4. **Set horizons**
   - **Now:** one primary commercial outcome; explicit release boundary and success measure.
   - **Next:** most likely follow-up, conditional on learning from Now.
   - **Later:** strategically relevant, uncommitted opportunities.
   - **Stopped/parked:** preserved with reasons.

5. **Map dependencies at outcome level**

Distinguish a true prerequisite from work that merely feels foundational. Prefer thin enabling slices over completing entire platforms.

6. **Write the roadmap**

For every item include:

```markdown
### [Outcome]
- Horizon:
- Target customer/user:
- Customer outcome:
- Commercial rationale:
- Success measure:
- Release boundary:
- Evidence/confidence:
- Dependencies:
- Non-goals:
- PRD:
- Decision/status:
```

7. **Reconcile delivery**

After approval, identify which Linear projects should be kept, reframed, paused, completed, or canceled. Defer actual project/ticket creation to `product-to-engineering`; use `product-housekeeping` for broad legacy cleanup.

## Completion

Report:

- Now, Next, and Later
- What moved and why
- What was explicitly stopped/deferred
- Key assumptions that could reorder the roadmap
- Which Now item is ready for engineering shaping
