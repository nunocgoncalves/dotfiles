---
name: grill-me
description: Interview the user relentlessly about a plan or design until reaching shared understanding, resolving each branch of the decision tree. Use to stress-test product, architecture, or implementation plans and whenever the user says "grill me".
argument-hint: "[plan or design]"
---

# Grill Me

## Objective

Resolve a plan's decision tree in dependency order until the plan, constraints, trade-offs, and consequences are explicit enough to act on.

## Rules

- Inspect available code, documents, tickets, and evidence before asking questions.
- Answer questions that can be resolved from existing sources yourself.
- Separate product decisions, architecture decisions, implementation decisions, and factual unknowns.
- Ask exactly one unresolved decision question at a time.
- For every question, provide your recommended answer and explain the decisive trade-off concisely.
- Resolve higher-level decisions before dependent details.
- Challenge hidden assumptions, scope creep, failure cases, reversibility, operations, security, and validation.
- Do not accept vague agreement. Restate the decision and consequence before advancing.
- If repository standards require explicit architecture approval, record that approval before implementation.

## Workflow

1. Restate the objective, constraints, known decisions, and evidence.
2. Build the decision tree and identify the highest unresolved dependency.
3. Explore sources that may answer it without user input.
4. Ask one decision question with a recommended answer.
5. Record the answer and propagate its consequences to dependent branches.
6. Repeat until no material branch remains unresolved.
7. Summarize the agreed plan, non-goals, risks, validation, and explicit decisions.

## Completion

Finish only when there is shared understanding of:

- Intended outcome
- Scope and non-goals
- Major design choices and rejected alternatives
- Failure and operational behavior
- Security/data implications
- Validation and success criteria
- Remaining unknowns with owners or next actions
