---
name: product-design-brief
description: Create and govern designer briefs for exploratory visualization, approved net-new product design, or requirements-enforcement verification of frozen designs. Use when product learning or delivery needs an exact interactive design handoff and evidence gate before engineering shaping.
---

# Product Design Brief

Follow [[Product Management Operating System]] and `~/.pi/agent/WORKFLOW_STANDARD.md`.

## Objective

Create one founder-approved designer brief whose authority, design mode, source custody, review harness, evidence, and next lifecycle handoff are unambiguous.

This workflow may produce:

- an **exploration** brief that visualizes an idea to improve discovery;
- a **new-design** brief that designs approved behavior not covered by a frozen design; or
- a **verification** brief that tests and minimally corrects an existing frozen design without redesigning it.

It does not create implementation tickets, choose runtime architecture, or make an exploratory artifact authoritative.

## Preconditions

Resolve the target initiative, canonical Obsidian context, intended design mode, and any existing source or candidate bytes.

- `exploration` requires a recorded opportunity, product brief, or deliberate founder hypothesis. Requirements may still be uncertain.
- `new-design` requires approved product behavior, constraints, and acceptance scenarios. If these do not exist, return to `product-requirements`.
- `verification` requires an exact frozen or accepted design source plus approved requirements or decisions to enforce.

If the supplied evidence implies more than one mode, separate the work into explicit phases. Never let a verification brief silently authorize new design.

## Authority hierarchy

1. Approved Obsidian product direction, PRD requirements, acceptance scenarios, and product decisions define user-visible behavior and non-goals.
2. Founder-approved design decisions and exact frozen design lineage define accepted UI/UX behavior.
3. Repository architecture decisions define technical constraints but do not invent product behavior.
4. Linear defines the bounded design or delivery slice and its state; it does not replace the product/design authority above.
5. The designer brief defines the authorized design task and evidence contract only.
6. Interactive candidates and inventories are evidence until explicitly accepted and frozen; they are not authority merely because they exist.

A lower source cannot silently redefine a higher source. Stop and request founder input when sources conflict or a required product/design decision is missing.

## Rules

- Use Obsidian as the canonical home for the brief, accepted design decision, frozen export, coverage inventory, and custody record.
- Read the directly relevant sources completely. Recompute file sizes and SHA-256 values from exact bytes; do not trust filenames or prior summaries.
- Inspect existing designs before authorizing new work. Reuse is a product consistency requirement, not merely an implementation preference.
- State the selected mode prominently in frontmatter, the title block, objective, execution instructions, and acceptance criteria.
- Ask one founder-decision question at a time with a recommendation. Founder approval must identify the exact brief or candidate bytes.
- Keep exploration, product approval, design acceptance, engineering shaping, implementation, and release as separate gates.
- Do not allow Pi/Codex to edit, assemble, rename into, or substitute the designer-owned HTML candidate. Pi/Codex may inspect and validate exact supplied bytes.
- Do not add customer-specific behavior, runtime/API/schema choices, or unsupported claims to solve a design gap.
- Preserve immutable history. Supersede rejected briefs or candidates with reasons and checksums; do not overwrite frozen artifacts.

## Mode selection

### Exploration

Choose `exploration` when the purpose is to make an idea tangible, compare a small number of hypotheses, expose unknowns, or support product discovery before behavior is approved.

The brief must:

- label every candidate **exploratory and non-authoritative**;
- state the hypothesis, riskiest assumptions, questions to answer, and cheapest evidence sought;
- distinguish fixed context from deliberately open choices;
- avoid implementation tickets, production claims, or implied roadmap commitment;
- preserve existing product patterns unless the experiment explicitly tests an alternative;
- record what was learned and route the result to `product-discovery` or `product-requirements`.

An attractive exploration does not become the PRD or accepted design without a separate product decision.

### New design

Choose `new-design` only when approved product behavior lacks an accepted design or the founder has explicitly approved a bounded replacement/delta.

The brief must:

- trace every requested surface, state, and interaction to approved `REQ-*`, `SCN-*`, product decisions, or a clearly recorded design decision;
- identify the existing design system, shell, components, patterns, and responsive/accessibility conventions that remain mandatory;
- define what is genuinely new and what must remain unchanged;
- prohibit adjacent restyling, information-architecture expansion, speculative features, and runtime architecture invention;
- include deterministic coverage and acceptance evidence for the complete customer journey;
- stop for founder approval if the designer discovers that the approved scope needs a new product or architecture decision.

Authorization for new design is bounded to the named behavior. It is not permission for a general redesign.

### Verification

Choose `verification` when accepted or frozen designs already exist and the goal is completeness, conformance, regression protection, or minimal correction.

The brief must state prominently: **REQUIREMENTS ENFORCEMENT ONLY — THIS IS NOT A REDESIGN.**

Before editing, classify every coverage row:

- **PASS — preserve unchanged:** the exact frozen baseline satisfies the authority; no product UI change is allowed.
- **CORRECTION REQUIRED:** the baseline demonstrably fails an approved requirement; authorize only the smallest correction using an existing accepted pattern.
- **ESCALATE — no edit:** satisfying the requirement appears to need a new pattern, restyle, hierarchy, route, information architecture, interpretation, or conflicting decision.

Every correction records the frozen baseline, governing authority, observed failure, minimal correction, accepted pattern reused, deterministic evidence, and exact diff reference. Every unexplained customer-visible diff fails acceptance.

## Required brief contract

Every brief must contain, proportionate to its mode:

1. mode and lifecycle position;
2. objective and expected learning or accepted outcome;
3. authority hierarchy and conflict rules;
4. exact source/candidate custody and lineage;
5. existing system and patterns to preserve;
6. in-scope behavior and explicit non-goals;
7. role, authority, language, responsive, accessibility, loading/error, denial, and recovery semantics as applicable;
8. prohibited outcomes and escalation gates;
9. requirement-to-evidence or hypothesis-to-evidence coverage;
10. a dedicated `## Verification harness` section when the output may be accepted or frozen;
11. external-designer execution instructions;
12. exact-byte validation and freeze gate;
13. acceptance criteria, traceability, engineering handoff boundary, and production/publication classification.

Exploration may use a lighter evidence matrix, but its questions and results must still be reproducible. `new-design` and `verification` require the full acceptance contract.

## Verification harness

For every `new-design` or `verification` brief, require one deterministic, self-contained, synthetic-data-only, non-customer review path or review index covering every acceptance row.

The harness contract must specify:

- exact route, fixture, state, transition, and outcome controls;
- role/authority variants;
- required languages and long-content cases;
- desktop and mobile viewports;
- keyboard order, modal focus entry/trap/return, Escape/no-effect behavior, and post-mutation focus;
- screen-reader names and bounded announcements;
- loading, empty, error, direct denial, permission loss, expiry, stale, race, duplicate/idempotent, reconnect, and recovery states as applicable;
- non-color meaning, overflow, landmark/heading, DOM/accessibility-tree, reduced-motion, console/runtime, and network audits;
- regression coverage for previously accepted surfaces and mode isolation;
- exact source, runtime, export, and inventory filenames, byte sizes, and SHA-256 values.

Harness controls must reuse the accepted review-harness family, remain absent from customer routes and accessibility output, and never become product functionality. Extend the harness only where deterministic evidence is missing.

A label, assertion, screenshot, hidden code branch, autoplay-only state, happy path, unreachable fixture, or inventory describing different bytes is not evidence. Review must remain fully interactive with external network blocked and no failed requests, console warnings/errors, or runtime exceptions.

## Workflow

1. **Locate the lifecycle position**
   - Read the opportunity/product brief, PRD, roadmap commitment, Linear scope, design decisions, frozen sources, and prior accepted briefs needed for the target.
   - State whether the work is discovery evidence, a product/design gate, or accepted-design verification before engineering shaping.

2. **Select and declare one mode**
   - Recommend `exploration`, `new-design`, or `verification` from the evidence.
   - If switching modes would broaden authority, request founder approval before drafting under the new mode.

3. **Establish exact custody**
   - Identify source owner, editable source, runtime assets, frozen exports, inventories, sizes, SHA-256 values, and accepted lineage.
   - Record which bytes may be edited and which must remain immutable.

4. **Audit before writing**
   - Map approved behavior, existing coverage, gaps, conflicts, and preserved patterns.
   - In verification mode, produce the PASS/CORRECTION REQUIRED/ESCALATE classification before authorizing edits.

5. **Draft the canonical brief**
   - Use the required brief contract and the selected mode rules.
   - Make boundaries executable: every requirement or hypothesis maps to evidence and every forbidden expansion has a stop condition.

6. **Founder brief gate**
   - Re-read the exact canonical note, report its path and SHA-256, summarize authority and risk, and request approval.
   - No external-designer work begins before approval of those exact bytes.

7. **Validate the designer handoff**
   - Require designer-owned editable source, one exact standalone candidate, matching inventory, checksums, and any separately owned local runtime assets.
   - Exercise the harness against the exact candidate; compare visible diffs and coverage to the authorized mode.
   - Reject mismatched custody, unreviewable states, unexplained changes, unsupported claims, or evidence that does not correspond to the supplied bytes.

8. **Founder candidate gate and freeze**
   - Present passed evidence, deviations, unresolved decisions, and the exact candidate checksum.
   - After approval, copy exact accepted artifacts into dated immutable Obsidian files and update traceability. Never reconstruct the accepted candidate.

9. **Route the result**
   - Exploration returns learning to `product-discovery` or `product-requirements`.
   - Accepted new design or verification updates the PRD/design traceability as needed, then routes a committed outcome to `product-to-engineering`.
   - Engineering discoveries that change user-visible behavior return to the PRD and this design workflow before delivery scope changes.

## Lifecycle position

```text
product-discovery
  -> optional product-design-brief exploration
  -> product-requirements
  -> product-roadmap
  -> optional product-design-brief new-design or verification gate
  -> product-to-engineering
  -> start-ticket / review / acceptance / release
  -> product-release-review
```

The optional design gate becomes required when user-visible behavior cannot be implemented or accepted from authoritative product requirements and an already accepted design alone.

## Completion

Finish by reporting:

- selected mode and why;
- exact canonical brief/candidate/inventory paths and checksums;
- lifecycle gate passed or still pending;
- preserved baseline and authorized change boundary;
- harness coverage and validation result;
- unresolved product, design, or architecture decisions;
- next exact workflow: `product-discovery`, `product-requirements`, `product-roadmap`, `product-to-engineering`, or founder candidate approval.
