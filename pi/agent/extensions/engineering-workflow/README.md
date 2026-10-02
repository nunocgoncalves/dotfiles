# Engineering workflow extension

Coordinator for the engineering ticket lifecycle defined by the Obsidian `[[Product Management Operating System]]`.

## Responsibilities

- Discovers only the engineering bridge skills it owns.
- Starts ticket implementation from a Linear identifier.
- Starts protected semantic publication when a merged ticket or approved product release requires it.
- Starts post-merge ticket acceptance and routes missing required publication evidence to the release workflow.
- Leaves PR/review protocol to the existing `review-workflow` extension.
- Stores no canonical delivery state; Linear, GitHub, Obsidian, and repositories remain authoritative.

## Commands

```text
/engineering
/start-ticket HOR-123
/release-ticket HOR-123 [--targets control-plane,control-plane-chart]
/accept-ticket HOR-123
```

## Lifecycle

```text
/product-to-engineering
  → /start-ticket HOR-123
  → implementation
  → /open-pr HOR-123
  → /code-review <PR> ⇄ /address-review <PR>
  → user merge
  → /release-ticket HOR-123       # only when publication is required for acceptance
  → /accept-ticket HOR-123
  → /product-release-review <project>
      → /release-ticket HOR-123   # when publication was deliberately deferred until this gate
      → /product-release-review <project>
```

## Local setup

```sh
OVERLAY=~/Developer/nunocgoncalves/iterabase-overlay
ln -s "$OVERLAY/pi/product/extensions/engineering-workflow" \
  ~/.pi/agent/extensions/engineering-workflow
```

Run `/reload` in pi after installation.

## Boundaries

- `implement-ticket` owns Todo → In Progress when implementation actually starts.
- `open-pr` owns In Progress → In Review after the PR opens.
- `release-ticket` owns exact-SHA candidate/promotion mechanics and release evidence; it never changes ticket/project state or deploys overlays.
- `accept-ticket` owns In Review → Done after merge, including publication evidence when required.
- `product-release-review` owns outcome-project completion and product learning.
- Only the user merges PRs.
