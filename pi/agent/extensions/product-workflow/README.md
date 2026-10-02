# Product workflow extension

Coordinator for the product-management operating system documented in Obsidian at `Areas/ho/Product Management Operating System.md`.

## Responsibilities

- Discovers the product-management skills from `~/.pi/agent/skills/`.
- Provides `/product` as an interactive workflow chooser.
- Provides direct commands for each workflow.
- Keeps judgment in skills and deterministic routing in the extension.
- Stores no canonical product state; Obsidian and Linear remain authoritative.

## Commands

- `/product [workflow]`
- `/product-housekeeping`
- `/product-discovery`
- `/product-opportunity` — opportunity-registration alias for discovery/portfolio intake
- `/product-requirements`
- `/product-design-brief`
- `/product-roadmap`
- `/product-to-engineering`
- `/product-release-review`
- `/product-weekly`
- `/product-status`

Arguments after a direct command are passed to the corresponding skill.

## Local setup

Directory stow installs the extension and its sibling product skills together:

```sh
cd ~/dotfiles && stow --target="$HOME/.pi" pi
```

The extension discovers the sibling product skills, so separate skill symlinks are not required for this suite. Run `/reload` in pi after installation.

## Design

The first version intentionally performs orchestration only. Existing Linear tools and the Obsidian CLI perform mutations. Gate validation, drift detection, and bulk-mutation previews can be added after the manual skill workflows have been exercised.
