/**
 * Linear issue (ticket) tools: list/search, create, update.
 */

import type { Host } from "../lib/host.ts";
import { StringEnum, Type } from "../lib/schema.ts";
import {
  clamp,
  day,
  isUuid,
  linearFetch,
  priorityLabel,
  resolveIssueId,
  resolveProjectId,
  truncateOutput,
  getViewerId,
} from "./client.ts";

// ----- GraphQL field selections -----------------------------------------------

const ISSUE_SUMMARY_FIELDS = `
  id identifier title url
  priority priorityLabel estimate
  state { id name type }
  assignee { id name }
  team { id key name }
  project { id name slugId }
  labels { nodes { id name } }
  dueDate createdAt updatedAt
`;

const ISSUE_FULL_FIELDS = `
  id identifier title description url
  priority priorityLabel estimate
  state { id name type }
  assignee { id name email }
  team { id key name }
  project { id name slugId }
  cycle { id number name }
  projectMilestone { id name }
  labels { nodes { id name color } }
  parent { id identifier title }
  children(first: 30) { nodes { id identifier title state { name } assignee { name } } }
  comments(first: 15) { nodes { id body createdAt user { name } } }
  dueDate createdAt updatedAt startedAt completedAt
`;

// ----- Formatting --------------------------------------------------------------

interface LinearIssue {
  id: string;
  identifier: string;
  title: string;
  description?: string | null;
  url: string;
  priority: number;
  priorityLabel?: string;
  estimate?: number | null;
  state?: { id: string; name: string; type: string } | null;
  assignee?: { id: string; name: string; email?: string } | null;
  team?: { id: string; key: string; name: string } | null;
  project?: { id: string; name: string; slugId: string } | null;
  cycle?: { id: string; number: number; name?: string | null } | null;
  projectMilestone?: { id: string; name: string } | null;
  labels?: { nodes: Array<{ id: string; name: string; color?: string }> };
  parent?: { id: string; identifier: string; title: string } | null;
  children?: { nodes: Array<{ id: string; identifier: string; title: string; state?: { name: string } | null; assignee?: { name: string } | null }> };
  comments?: { nodes: Array<{ id: string; body: string; createdAt: string; user?: { name: string } | null }> };
  dueDate?: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
}

function formatIssueSummary(i: LinearIssue): string {
  const state = i.state ? `[${i.state.name}]` : "[?]";
  const prio = `P${i.priority} ${priorityLabel(i.priority)}`;
  const meta: string[] = [];
  if (i.assignee) meta.push(`@${i.assignee.name}`);
  if (i.team) meta.push(i.team.key);
  if (i.project) meta.push(`proj:${i.project.name}`);
  if (typeof i.estimate === "number") meta.push(`est:${i.estimate}`);
  const labels = i.labels?.nodes?.map((l) => l.name).join(", ");
  if (labels) meta.push(`labels:${labels}`);
  const lines = [
    `${i.identifier} ${state} ${prio} — ${i.title}`,
    `  ${meta.join(" · ")} · due:${day(i.dueDate)} · updated:${day(i.updatedAt)}`,
    `  ${i.url}`,
  ];
  return lines.join("\n");
}

function formatIssueFull(i: LinearIssue): string {
  const lines: string[] = [];
  lines.push(`${i.identifier} [${i.state?.name ?? "?"}] ${priorityLabel(i.priority)} (P${i.priority})`);
  lines.push(i.title);
  lines.push(i.url);
  lines.push("");
  lines.push(`Team: ${i.team?.key ?? "—"} (${i.team?.name ?? "—"})`);
  lines.push(`State: ${i.state?.name ?? "—"} (${i.state?.type ?? "—"})`);
  lines.push(`Assignee: ${i.assignee?.name ?? "Unassigned"}`);
  if (i.project) lines.push(`Project: ${i.project.name} (slug ${i.project.slugId})`);
  if (i.cycle) lines.push(`Cycle: ${i.cycle.name ?? `#${i.cycle.number}`}`);
  if (i.projectMilestone) lines.push(`Milestone: ${i.projectMilestone.name}`);
  if (typeof i.estimate === "number") lines.push(`Estimate: ${i.estimate}`);
  const labels = i.labels?.nodes?.map((l) => l.name).join(", ");
  if (labels) lines.push(`Labels: ${labels}`);
  lines.push(`Due: ${day(i.dueDate)} · Created: ${day(i.createdAt)} · Updated: ${day(i.updatedAt)}`);
  if (i.startedAt) lines.push(`Started: ${day(i.startedAt)}`);
  if (i.completedAt) lines.push(`Completed: ${day(i.completedAt)}`);

  if (i.parent) {
    lines.push("");
    lines.push(`Parent: ${i.parent.identifier} ${i.parent.title}`);
  }
  const children = i.children?.nodes ?? [];
  if (children.length) {
    lines.push("");
    lines.push(`Sub-issues (${children.length}):`);
    for (const c of children) {
      const st = c.state ? `[${c.state.name}]` : "";
      const a = c.assignee ? ` @${c.assignee.name}` : "";
      lines.push(`  ${c.identifier} ${st} ${c.title}${a}`);
    }
  }
  const comments = i.comments?.nodes ?? [];
  if (comments.length) {
    lines.push("");
    lines.push(`Comments (${comments.length}):`);
    for (const c of comments) {
      const who = c.user?.name ?? "Unknown";
      lines.push(`  [${day(c.createdAt)}] ${who}:`);
      const body = (c.body ?? "").trim();
      if (body) {
        for (const ln of body.split("\n").slice(0, 8)) lines.push(`    ${ln}`);
      }
    }
  }
  if (i.description && i.description.trim()) {
    lines.push("");
    lines.push("Description:");
    lines.push(i.description.trim());
  }
  return lines.join("\n");
}

// ----- Filter builder ----------------------------------------------------------

function buildIssueFilter(p: {
  query?: string;
  teamKey?: string;
  assignee?: string;
  stateType?: string;
  onlyOpen?: boolean;
  projectId?: string;
  priority?: number;
  labelIds?: string[];
}): Record<string, unknown> | undefined {
  const and: Record<string, unknown>[] = [];
  if (p.query) and.push({ searchableContent: { contains: p.query } });
  if (p.teamKey) and.push({ team: { key: { eq: p.teamKey.toUpperCase() } } });
  if (p.assignee) {
    const a = p.assignee.toLowerCase();
    if (a === "me") and.push({ assignee: { isMe: { eq: true } } });
    else if (a === "none" || a === "unassigned")
      and.push({ assignee: { null: true } });
    else and.push({ assignee: { email: { eq: p.assignee } } });
  }
  if (p.stateType) and.push({ state: { type: { eq: p.stateType } } });
  if (p.onlyOpen)
    and.push({
      or: [
        { state: { type: { eq: "backlog" } } },
        { state: { type: { eq: "unstarted" } } },
        { state: { type: { eq: "started" } } },
      ],
    });
  if (p.projectId) {
    if (isUuid(p.projectId)) and.push({ project: { id: { eq: p.projectId } } });
    else and.push({ project: { slugId: { eq: p.projectId } } });
  }
  if (typeof p.priority === "number") and.push({ priority: { eq: p.priority } });
  if (p.labelIds?.length) {
    for (const lid of p.labelIds) and.push({ labels: { some: { id: { eq: lid } } } });
  }
  if (and.length === 0) return undefined;
  if (and.length === 1) return and[0];
  return { and };
}

// ----- Tool registration ------------------------------------------------------

export function registerIssueTools(host: Host): void {
  // --- linear_list_issues -----------------------------------------------------
  host.registerTool({
    name: "linear_list_issues",
    label: "Linear: List/Search Issues",
    description:
      "Query Linear issues (tickets). Pass `identifier` (e.g. 'HOR-255') or `id` (UUID) to " +
      "fetch a single issue with full details (description, comments, sub-issues, parent). " +
      "Otherwise lists issues matching the given filters, most recently updated first. " +
      "Use `assignee: 'me'` for your issues, `onlyOpen: true` for non-completed work, " +
      "`stateType` to filter by workflow state type (backlog/unstarted/started/completed/canceled/duplicate). " +
      "Results are truncated to ~2000 lines/50KB.",
    promptSnippet: "Search and read Linear issues/tickets by filter or identifier",
    promptGuidelines: [
      "Use linear_list_issues to find Linear issues before creating or updating them. Pass an identifier like 'HOR-255' to fetch a single issue's full details (description, comments, sub-issues).",
    ],
    parameters: Type.Object({
      identifier: Type.Optional(
        Type.String({
          description: "Issue identifier like 'HOR-255'. Returns that single issue in full.",
        }),
      ),
      id: Type.Optional(
        Type.String({ description: "Issue UUID. Returns that single issue in full." }),
      ),
      query: Type.Optional(
        Type.String({ description: "Free-text search across title and description." }),
      ),
      teamKey: Type.Optional(Type.String({ description: "Team key, e.g. 'HOR'." })),
      assignee: Type.Optional(
        Type.String({
          description: "'me', 'none' (unassigned), or an email address.",
        }),
      ),
      stateType: Type.Optional(
        StringEnum(
          ["backlog", "unstarted", "started", "completed", "canceled", "duplicate"] as const,
          { description: "Filter by workflow state type." },
        ),
      ),
      onlyOpen: Type.Optional(
        Type.Boolean({
          description: "Only issues in backlog/unstarted/started states (not completed/canceled/duplicate).",
        }),
      ),
      projectId: Type.Optional(
        Type.String({ description: "Project UUID or slugId." }),
      ),
      priority: Type.Optional(
        Type.Number({
          description: "Exact priority: 0=No priority, 1=Urgent, 2=High, 3=Medium, 4=Low.",
        }),
      ),
      labelIds: Type.Optional(
        Type.Array(Type.String(), {
          description: "Label UUIDs. Issues must have ALL listed labels. Get IDs from linear_list_teams.",
        }),
      ),
      limit: Type.Optional(
        Type.Number({ description: "Max results (1-50, default 25)." }),
      ),
      includeArchived: Type.Optional(Type.Boolean({ description: "Include archived issues. Default false." })),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
      // Single-issue fetch path.
      if (params.identifier || params.id) {
        const ref = (params.identifier ?? params.id) as string;
        const uuid = await resolveIssueId(ref, signal);
        const data = await linearFetch<{ issue: LinearIssue | null }>(
          `query($id: String!) { issue(id: $id) { ${ISSUE_FULL_FIELDS} } }`,
          { id: uuid },
          signal,
        );
        if (!data.issue) throw new Error(`Issue not found: ${ref}`);
        return {
          content: [{ type: "text", text: truncateOutput(formatIssueFull(data.issue)).text }],
          details: { kind: "issue", identifier: data.issue.identifier, url: data.issue.url },
        };
      }

      const filter = buildIssueFilter(params);
      const first = clamp(params.limit ?? 25, 1, 50);
      const includeArchived = params.includeArchived ?? false;
      const data = await linearFetch<{ issues: { nodes: LinearIssue[] } }>(
        `query($filter: IssueFilter, $first: Int, $archived: Boolean) {
          issues(filter: $filter, first: $first, includeArchived: $archived, orderBy: updatedAt) {
            nodes { ${ISSUE_SUMMARY_FIELDS} }
          }
        }`,
        { filter, first, includeArchived },
        signal,
      );
      const nodes = data.issues.nodes;
      if (nodes.length === 0) {
        return {
          content: [{ type: "text", text: "No issues matched the given filters." }],
          details: { kind: "list", count: 0 },
        };
      }
      let text = `Found ${nodes.length} issue${nodes.length === 1 ? "" : "s"}:\n\n`;
      text += nodes.map(formatIssueSummary).join("\n\n");
      return {
        content: [{ type: "text", text: truncateOutput(text).text }],
        details: { kind: "list", count: nodes.length },
      };
    },
  });

  // --- linear_create_issue ----------------------------------------------------
  host.registerTool({
    name: "linear_create_issue",
    label: "Linear: Create Issue",
    description:
      "Create a new Linear issue (ticket). `teamId` and `title` are required; get `teamId`, " +
      "`stateId`, and `labelIds` from linear_list_teams. `assigneeId` accepts a user UUID or " +
      "the literal 'me'. `projectId` accepts a project UUID or slugId. `parentId` accepts an " +
      "issue UUID or identifier (e.g. 'HOR-255'). `dueDate` is YYYY-MM-DD.",
    promptSnippet: "Create a new Linear issue/ticket",
    promptGuidelines: [
      "Call linear_list_teams first to obtain the teamId, stateId, and labelIds required by linear_create_issue. linear_create_issue assigneeId accepts 'me'.",
    ],
    parameters: Type.Object({
      teamId: Type.String({ description: "Team UUID (required). Get from linear_list_teams." }),
      title: Type.String({ description: "Issue title (required)." }),
      description: Type.Optional(Type.String({ description: "Issue description (markdown)." })),
      stateId: Type.Optional(
        Type.String({ description: "Workflow state UUID. Defaults to the team's default state." }),
      ),
      assigneeId: Type.Optional(
        Type.String({ description: "Assignee user UUID, or 'me' for yourself." }),
      ),
      priority: Type.Optional(
        Type.Number({ description: "0=No priority, 1=Urgent, 2=High, 3=Medium, 4=Low." }),
      ),
      estimate: Type.Optional(Type.Number({ description: "Story-point estimate." })),
      labelIds: Type.Optional(
        Type.Array(Type.String(), { description: "Label UUIDs. Get from linear_list_teams." }),
      ),
      projectId: Type.Optional(
        Type.String({ description: "Project UUID or slugId to attach the issue to." }),
      ),
      cycleId: Type.Optional(Type.String({ description: "Cycle UUID." })),
      dueDate: Type.Optional(Type.String({ description: "Due date as YYYY-MM-DD." })),
      parentId: Type.Optional(
        Type.String({ description: "Parent issue UUID or identifier (e.g. 'HOR-255') to create a sub-issue." }),
      ),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
      const input: Record<string, unknown> = { teamId: params.teamId, title: params.title };
      if (params.description !== undefined) input.description = params.description;
      if (params.stateId) input.stateId = params.stateId;
      if (params.assigneeId !== undefined) {
        input.assigneeId =
          params.assigneeId === "me" ? await getViewerId(signal) : params.assigneeId;
      }
      if (typeof params.priority === "number") input.priority = params.priority;
      if (typeof params.estimate === "number") input.estimate = params.estimate;
      if (params.labelIds) input.labelIds = params.labelIds;
      if (params.projectId) input.projectId = await resolveProjectId(params.projectId, signal);
      if (params.cycleId) input.cycleId = params.cycleId;
      if (params.dueDate) input.dueDate = params.dueDate;
      if (params.parentId) input.parentId = await resolveIssueId(params.parentId, signal);

      const data = await linearFetch<{
        issueCreate: { success: boolean; issue: LinearIssue };
      }>(
        `mutation($input: IssueCreateInput!) {
          issueCreate(input: $input) { success issue { id identifier title url state { name } } }
        }`,
        { input },
        signal,
      );
      if (!data.issueCreate.success) throw new Error("Linear did not confirm issue creation.");
      const issue = data.issueCreate.issue;
      return {
        content: [
          { type: "text", text: `Created issue ${issue.identifier}: ${issue.title}\n${issue.url}` },
        ],
        details: { kind: "created", identifier: issue.identifier, url: issue.url },
      };
    },
  });

  // --- linear_update_issue ----------------------------------------------------
  host.registerTool({
    name: "linear_update_issue",
    label: "Linear: Update Issue",
    description:
      "Update an existing Linear issue (ticket). `id` accepts a UUID or identifier (e.g. 'HOR-255'). " +
      "Only provided fields are changed. For nullable fields, use 'none' to clear: assigneeId='none', " +
      "projectId='none', cycleId='none', dueDate='none', parentId='none'. `assigneeId` also accepts 'me'. " +
      "Get `stateId` and `labelIds` from linear_list_teams.",
    promptSnippet: "Update an existing Linear issue/ticket",
    promptGuidelines: [
      "Use linear_update_issue to change an existing Linear issue. It accepts an identifier like 'HOR-255' as id and only changes fields you provide; pass 'none' to clear assignee/project/cycle/due date/parent.",
    ],
    parameters: Type.Object({
      id: Type.String({ description: "Issue UUID or identifier (e.g. 'HOR-255')." }),
      title: Type.Optional(Type.String()),
      description: Type.Optional(Type.String()),
      stateId: Type.Optional(Type.String({ description: "New workflow state UUID." })),
      assigneeId: Type.Optional(
        Type.String({ description: "Assignee UUID, 'me', or 'none' to unassign." }),
      ),
      priority: Type.Optional(
        Type.Number({ description: "0=No priority, 1=Urgent, 2=High, 3=Medium, 4=Low." }),
      ),
      estimate: Type.Optional(Type.Number({ description: "Story-point estimate." })),
      labelIds: Type.Optional(
        Type.Array(Type.String(), { description: "Label UUIDs (replaces current labels)." }),
      ),
      projectId: Type.Optional(
        Type.String({ description: "Project UUID/slugId, or 'none' to remove from project." }),
      ),
      cycleId: Type.Optional(Type.String({ description: "Cycle UUID, or 'none' to remove from cycle." })),
      dueDate: Type.Optional(Type.String({ description: "Due date YYYY-MM-DD, or 'none' to clear." })),
      parentId: Type.Optional(
        Type.String({ description: "Parent issue UUID/identifier, or 'none' to detach." }),
      ),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
      const uuid = await resolveIssueId(params.id, signal);
      const input: Record<string, unknown> = {};
      if (params.title !== undefined) input.title = params.title;
      if (params.description !== undefined) input.description = params.description;
      if (params.stateId !== undefined) input.stateId = params.stateId;
      if (params.assigneeId !== undefined) {
        const a = params.assigneeId.toLowerCase();
        if (a === "none") input.assigneeId = null;
        else input.assigneeId = a === "me" ? await getViewerId(signal) : params.assigneeId;
      }
      if (params.priority !== undefined) input.priority = params.priority;
      if (params.estimate !== undefined) input.estimate = params.estimate;
      if (params.labelIds !== undefined) input.labelIds = params.labelIds;
      if (params.projectId !== undefined) {
        input.projectId =
          params.projectId.toLowerCase() === "none"
            ? null
            : await resolveProjectId(params.projectId, signal);
      }
      if (params.cycleId !== undefined) {
        input.cycleId = params.cycleId.toLowerCase() === "none" ? null : params.cycleId;
      }
      if (params.dueDate !== undefined) {
        input.dueDate = params.dueDate.toLowerCase() === "none" ? null : params.dueDate;
      }
      if (params.parentId !== undefined) {
        input.parentId =
          params.parentId.toLowerCase() === "none"
            ? null
            : await resolveIssueId(params.parentId, signal);
      }
      if (Object.keys(input).length === 0) {
        throw new Error("No update fields provided. Specify at least one field to change.");
      }

      const data = await linearFetch<{
        issueUpdate: { success: boolean; issue: LinearIssue };
      }>(
        `mutation($id: String!, $input: IssueUpdateInput!) {
          issueUpdate(id: $id, input: $input) { success issue { id identifier title url state { name } } }
        }`,
        { id: uuid, input },
        signal,
      );
      if (!data.issueUpdate.success) throw new Error("Linear did not confirm issue update.");
      const issue = data.issueUpdate.issue;
      return {
        content: [
          { type: "text", text: `Updated ${issue.identifier}: ${issue.title}\n${issue.url}` },
        ],
        details: { kind: "updated", identifier: issue.identifier, url: issue.url },
      };
    },
  });
}
