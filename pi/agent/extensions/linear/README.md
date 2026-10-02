# Linear extension for pi

A global pi extension that lets the agent query, create, and update **Linear
issues (tickets)** and **projects (milestones)** through the Linear GraphQL API.

## Setup

1. Export your Linear API key in your shell (create one at
   Linear → Settings → API → Personal API keys):

   ```bash
   export LINEAR_API_KEY=lin_api_xxx
   ```

2. This extension lives at `~/.pi/agent/extensions/linear/`, which is pi's
   global auto-discovery location. It loads automatically on startup. In a
   running pi session, run `/reload` to pick it up.

3. The startup header will list `linear` under loaded extensions. If the key is
   missing, a warning is shown instead.

## Tools

| Tool | Purpose |
|------|---------|
| `linear_list_teams` | Reference data: teams, workflow states, labels, project statuses, and the current viewer. Call this first to get the IDs needed for create/update. |
| `linear_list_issues` | Search/list issues, or fetch a single issue by `identifier` (e.g. `HOR-255`) or `id` (UUID) with full details (description, comments, sub-issues, parent). |
| `linear_create_issue` | Create an issue. Requires `teamId` + `title`. `assigneeId` accepts `me`. |
| `linear_update_issue` | Update an issue by UUID or identifier. Use `none` to clear nullable fields (assignee, project, cycle, due date, parent). |
| `linear_set_blocked_by` | Mark an issue blocked by one or more issues (sets Linear dependencies). `replace:true` overwrites existing blocked-by. |
| `linear_list_issue_relations` | List what an issue blocks and what it is blocked by. |
| `linear_list_projects` | Search/list projects, or fetch a single project by `id` (UUID or slugId) with full details (milestones, issues, members, content). |
| `linear_create_project` | Create a project. Requires `name` + `teamIds`. |
| `linear_update_project` | Update a project by UUID or slugId. Use `none` to clear date fields. |
| `linear_list_cycles` | List a team's cycles (cycle UUID, number, dates). Use to get the cycle UUID for `linear_update_issue.cycleId`. |
| `linear_create_cycle` | Create a cycle (teamId + startsAt + endsAt). |
| `linear_update_cycle` | Rename / reschedule / complete a cycle by UUID. |

### ID resolution

- **Issues**: tools accept either a UUID or a human identifier like `HOR-255`.
  Identifiers are resolved to UUIDs automatically.
- **Projects**: tools accept either a UUID or a slugId (the short hex code in
  the project URL, e.g. `a1be212bc129`).
- **Reference IDs** (teamId, stateId, labelIds, project statusId) come from
  `linear_list_teams`. Project statuses are organization-wide.

### Filtering issues

`linear_list_issues` supports: `query` (full-text), `teamKey`, `assignee`
(`me`/`none`/email), `stateType`, `onlyOpen`, `projectId`, `priority`,
`labelIds`, `limit` (1–50), and `includeArchived`.

## Notes

- Output is truncated to pi's default limits (~2000 lines / 50KB) with a notice
  when truncated; refine filters to see more.
- Only API-key auth is supported (no OAuth). The key is sent as the
  `Authorization` header directly (Linear API keys do not use `Bearer`).
- The viewer UUID is cached in-memory so `assigneeId: "me"` resolves without a
  round-trip after the first use. Run `/reload` to reset caches.
- Deleting issues/projects is intentionally **not** exposed as a tool. The
  extension focuses on query/create/update as requested.

## Files

- `index.ts` — entry point; registers tools and the startup key-check.
- `client.ts` — GraphQL client, ID resolution, truncation helpers.
- `issues.ts` — issue list/create/update tools.
- `dependencies.ts` — issue blocked-by (dependency) set/list tools.
- `cycles.ts` — cycle list/create/update tools.
- `projects.ts` — teams reference tool + project list/create/update tools.
