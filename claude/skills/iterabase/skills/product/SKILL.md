---
name: product
description: Choose and start a product-management workflow.
argument-hint: "[workflow]"
disable-model-invocation: true
---

Arguments: `$ARGUMENTS`

Product-management workflows (process contract: the Obsidian `Areas/ho/Product Management Operating System.md`):

| Command | Skill | Purpose |
| --- | --- | --- |
| `product-housekeeping` | `product-housekeeping` | Housekeeping — reconcile Obsidian and Linear scope |
| `product-discovery` | `product-discovery` | Discovery — shape a signal or opportunity |
| `product-requirements` | `product-requirements` | Requirements — write or revise a PRD |
| `product-design-brief` | `product-design-brief` | Design brief — explore, design, or verify product UX |
| `product-roadmap` | `product-roadmap` | Roadmap — prioritize Now / Next / Later |
| `product-to-engineering` | `product-to-engineering` | Product → Engineering — shape Linear delivery |
| `product-release-review` | `product-release-review` | Release review — validate outcome and learning |
| `product-weekly` | `product-weekly-review` | Weekly review — evidence, WIP, risk, and focus |

1. If an argument names a workflow (by command or skill name), use it; an unknown name: say so and stop.
2. Otherwise ask which workflow with AskUserQuestion (group into at most four options per question, e.g. shape / plan / deliver / review, then narrow).
3. Load the mapped skill and follow it.
