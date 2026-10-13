---
name: product-design-brief
description: Prototype product ideas and shared UI patterns as Claude Design artifacts on the Iterabase Design System, then hand them to design-in-code delivery reviewed on pr-<N> previews. Use to make an idea tangible during discovery, or to prototype the foundation/new interaction patterns a UI ticket builds on. Never a frozen design gate.
---

# Product Design Brief

Follow [[Product Management Operating System]] and `~/.pi/agent/WORKFLOW_STANDARD.md`.

## Objective

Make a product idea or UI pattern tangible fast enough for the founder to decide, then hand it to delivery, where **product design happens in code** and is accepted by the founder on the `pr-<N>` preview environment.

This workflow may produce:

- an **exploration** prototype that visualizes an idea to improve discovery; or
- a **pattern** prototype of the app foundation or of a genuinely new interaction that a UI ticket will build on (for example the app shell, Needs attention, a confirmation card, a live login handoff).

It does not create implementation tickets, choose runtime architecture, or make a prototype authoritative. A prototype is a reference for the ticket; the reviewed preview is what gets accepted.

## When to use it

- **Exploration:** a recorded opportunity, product brief, or deliberate founder hypothesis needs to be seen before behavior is approved.
- **Pattern:** approved behavior (PRD + ticket `Decisions` section) introduces a shared pattern or an interaction the existing app patterns don't cover.
- **Skip it** when a UI ticket only reuses existing app patterns: go straight to code and review on the preview.

## Authority hierarchy

1. The PRD (`Areas/ho/Requirements/Platform V2 — Product Requirements.md`) and approved product decisions define user-visible behavior and non-goals.
2. The Linear ticket's `Decisions (design review, <date>)` section defines the detailed contract for the slice.
3. Repository architecture decisions define technical constraints but do not invent product behavior.
4. The Iterabase Design System (https://claude.ai/artifact/B3WS3oBCdjQM3wobDBKxRP, rebranded 2026-10-13) and the app foundation patterns in code define visual language and components. It is mandatory; new tokens, patterns or components need founder approval.
5. **The prototype** is the "Delight, trusted (chosen direction)" page of the V2 App Foundation canvas (https://claude.ai/artifact/CtvRvGmeacVMkFBAUgCiiQ): the reference for customer UI, not a pixel spec. Superseded canvas pages (Command center, experiments, sidebar draft) are not references. The founder-reviewed preview of the implementing PR is the accepted design.

The 2026-08 V2 designer briefs, frozen prototype exports and coverage inventories in Obsidian `Designs/` are **reference only**. Do not require hash parity or frozen-design verification.

## Rules

- Build prototypes as Claude Design artifacts on the Iterabase Design System; never invent a parallel visual language.
- Reuse existing app patterns before proposing new ones. Reuse is a product consistency requirement.
- Ask one founder-decision question at a time with a recommendation.
- Keep exploration, product approval, implementation and release as separate decisions, but don't add ceremony: no designer briefs, custody records, checksums or inventories.
- Do not add customer-specific behavior, runtime/API/schema choices, or unsupported claims to solve a design gap.
- Cover the states that matter for the pattern: roles, EN/PT, phone width, loading/empty/error, denial, waiting/paused, and any confirmation or race state the behavior has.

## Workflow

1. **Locate the context:** read the PRD section, the ticket's Decisions section (if a ticket exists), and the existing app patterns. State whether this is exploration or a pattern prototype.
2. **Prototype:** build the artifact on the Iterabase Design System with realistic data (for example the Lusocargo or LusoPanarcos workflows). Show the key states, not every permutation.
3. **Founder review:** walk the founder through it; iterate in the artifact until the direction is agreed.
4. **Record the outcome where agents read it:**
   - approved idea or pattern → reflect it in the prototype, then reconcile it into the affected tickets' `## Design` sections (and Decisions);
   - exploration → record the learning in the opportunity note, or route to `product-requirements`.
5. **Hand off:** the implementing ticket builds it in code; the PR includes the preview URL and requests the founder's design review there.

## Lifecycle position

```text
product-discovery
  -> optional product-design-brief exploration
  -> product-requirements
  -> product-roadmap
  -> optional product-design-brief foundation/pattern prototype
  -> product-to-engineering
  -> implement-ticket (design in code, founder review on pr-<N> preview) / review / acceptance / release
  -> product-release-review
```

## Completion

Finish by reporting:

- mode (exploration or pattern) and why;
- the artifact link;
- the agreed points and where they were recorded (ticket Decisions section or opportunity note);
- unresolved product or architecture decisions;
- next exact workflow: `product-requirements`, `product-to-engineering`, or `implement-ticket`.
