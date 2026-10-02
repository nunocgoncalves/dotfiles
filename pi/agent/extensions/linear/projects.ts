/**
 * Linear project tools (projects = milestones in the user's terminology):
 * list teams/reference data, list/search projects, create project, update project.
 */

import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import {
  clamp,
  day,
  isUuid,
  linearFetch,
  priorityLabel,
  resolveProjectId,
  truncateOutput,
} from "./client";

// ----- GraphQL field selections -----------------------------------------------

const PROJECT_SUMMARY_FIELDS = `
  id name slugId url description
  status { id name type }
  progress priority
  lead { id name }
  startDate targetDate
  teams { nodes { id key name } }
  createdAt updatedAt
`;

const PROJECT_FULL_FIELDS = `
  id name slugId url description content
  status { id name type }
  progress priority
  lead { id name }
  members(first: 20) { nodes { id name } }
  teams { nodes { id key name } }
  projectMilestones(first: 20) { nodes { id name targetDate progress } }
  issues(first: 50) { nodes { id identifier title state { name } assignee { name } } }
  startDate targetDate
  startedAt completedAt canceledAt
  createdAt updatedAt
`;

// ----- Types -------------------------------------------------------------------

interface LinearProject {
  id: string;
  name: string;
  slugId: string;
  url: string;
  description?: string | null;
  content?: string | null;
  status?: { id: string; name: string; type: string } | null;
  progress?: number;
  priority?: number;
  lead?: { id: string; name: string } | null;
  members?: { nodes: Array<{ id: string; name: string }> };
  teams?: { nodes: Array<{ id: string; key: string; name: string }> };
  projectMilestones?: { nodes: Array<{ id: string; name: string; targetDate?: string | null; progress?: number }> };
  issues?: { nodes: Array<{ id: string; identifier: string; title: string; state?: { name: string } | null; assignee?: { name: string } | null }> };
  startDate?: string | null;
  targetDate?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  canceledAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

// ----- Formatting --------------------------------------------------------------

function formatProjectSummary(p: LinearProject): string {
  const status = p.status ? `[${p.status.name}]` : "[?]";
  const prio = p.priority != null ? `P${p.priority} ${priorityLabel(p.priority)}` : "";
  const teams = p.teams?.nodes?.map((t) => t.key).join(",") ?? "—";
  const progress = typeof p.progress === "number" ? `${Math.round(p.progress * 100)}%` : "—";
  const meta: string[] = [`team:${teams}`, `progress:${progress}`, `lead:${p.lead?.name ?? "—"}`];
  if (p.targetDate) meta.push(`target:${day(p.targetDate)}`);
  const lines = [
    `${p.name} ${status} ${prio} (slug ${p.slugId})`,
    `  ${(p.description ?? "").trim().split("\n")[0]?.slice(0, 140) ?? ""}`,
    `  ${meta.join(" · ")} · updated:${day(p.updatedAt)}`,
    `  ${p.url}`,
  ];
  return lines.filter((l, i) => !(i === 1 && !l.trim())).join("\n");
}

function formatProjectFull(p: LinearProject): string {
  const lines: string[] = [];
  lines.push(`${p.name} [${p.status?.name ?? "?"}] ${priorityLabel(p.priority)} (P${p.priority ?? 0})`);
  lines.push(`slug: ${p.slugId}`);
  lines.push(p.url);
  lines.push("");
  lines.push(`Status: ${p.status?.name ?? "—"} (${p.status?.type ?? "—"})`);
  lines.push(`Progress: ${typeof p.progress === "number" ? Math.round(p.progress * 100) + "%" : "—"}`);
  lines.push(`Lead: ${p.lead?.name ?? "—"}`);
  const teams = p.teams?.nodes?.map((t) => `${t.key} (${t.name})`).join(", ");
  if (teams) lines.push(`Teams: ${teams}`);
  const members = p.members?.nodes?.map((m) => m.name).join(", ");
  if (members) lines.push(`Members: ${members}`);
  lines.push(`Start: ${day(p.startDate)} · Target: ${day(p.targetDate)}`);
  if (p.startedAt) lines.push(`Started: ${day(p.startedAt)}`);
  if (p.completedAt) lines.push(`Completed: ${day(p.completedAt)}`);
  else if (p.canceledAt) lines.push(`Canceled: ${day(p.canceledAt)}`);

  const milestones = p.projectMilestones?.nodes ?? [];
  if (milestones.length) {
    lines.push("");
    lines.push(`Milestones (${milestones.length}):`);
    for (const m of milestones) {
      const prog = typeof m.progress === "number" ? `${Math.round(m.progress * 100)}%` : "—";
      lines.push(`  ${m.name} · target:${day(m.targetDate)} · ${prog}`);
    }
  }

  const issues = p.issues?.nodes ?? [];
  if (issues.length) {
    lines.push("");
    lines.push(`Issues (${issues.length}):`);
    for (const i of issues) {
      const st = i.state ? `[${i.state.name}]` : "";
      const a = i.assignee ? ` @${i.assignee.name}` : "";
      lines.push(`  ${i.identifier} ${st} ${i.title}${a}`);
    }
  }

  if (p.description && p.description.trim()) {
    lines.push("");
    lines.push("Description:");
    lines.push(p.description.trim());
  }
  if (p.content && p.content.trim()) {
    lines.push("");
    lines.push("Content:");
    lines.push(p.content.trim());
  }
  return lines.join("\n");
}

// ----- Tool registration ------------------------------------------------------

export function registerProjectTools(pi: ExtensionAPI): void {
  // --- linear_list_teams (reference data) ------------------------------------
  pi.registerTool({
    name: "linear_list_teams",
    label: "Linear: Reference Data (Teams/States/Labels/Statuses)",
    description:
      "List Linear reference data needed to create and update issues and projects: teams (with " +
      "their workflow states and labels), project statuses, and the current viewer. " +
      "Call this before linear_create_issue / linear_create_project / linear_update_* to obtain " +
      "teamId, stateId, labelIds, statusId, and the viewer id.",
    promptSnippet: "List Linear teams, workflow states, labels, and project statuses",
    promptGuidelines: [
      "Call linear_list_teams before linear_create_issue or linear_create_project to get the teamId, stateId, labelIds, and project statusId values those tools require.",
    ],
    parameters: Type.Object({
      includeArchived: Type.Optional(
        Type.Boolean({ description: "Include archived teams/states/labels. Default false." }),
      ),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
      const includeArchived = params.includeArchived ?? false;
      const data = await linearFetch<{
        viewer: { id: string; name: string; email: string };
        teams: { nodes: Array<{ id: string; name: string; key: string; states: { nodes: Array<{ id: string; name: string; type: string }> }; labels: { nodes: Array<{ id: string; name: string; color?: string }> } }> };
        projectStatuses: { nodes: Array<{ id: string; name: string; type: string }> };
      }>(
        `query($archived: Boolean) {
          viewer { id name email }
          teams(includeArchived: $archived) {
            nodes { id name key states { nodes { id name type } } labels { nodes { id name color } } }
          }
          projectStatuses { nodes { id name type } }
        }`,
        { archived: includeArchived },
        signal,
      );

      const lines: string[] = [];
      lines.push(`Viewer: ${data.viewer.name} <${data.viewer.email}> (id ${data.viewer.id})`);
      lines.push("");
      for (const t of data.teams.nodes) {
        lines.push(`Team ${t.key}: ${t.name} (id ${t.id})`);
        const states = t.states.nodes;
        if (states.length) {
          lines.push("  Workflow states:");
          for (const s of states) lines.push(`    ${s.name} [${s.type}] — ${s.id}`);
        }
        const labels = t.labels.nodes;
        if (labels.length) {
          lines.push("  Labels:");
          for (const l of labels) lines.push(`    ${l.name} — ${l.id}`);
        }
        lines.push("");
      }
      const statuses = data.projectStatuses.nodes;
      if (statuses.length) {
        lines.push("Project statuses:");
        for (const s of statuses) lines.push(`  ${s.name} [${s.type}] — ${s.id}`);
      }
      return {
        content: [{ type: "text", text: truncateOutput(lines.join("\n")).text }],
        details: { kind: "teams", teamCount: data.teams.nodes.length },
      };
    },
    renderResult(result, _opts, theme) {
      const d = result.details as { kind?: string; teamCount?: number } | undefined;
      if (d?.teamCount != null)
        return new Text(theme.fg("success", `✓ ${d.teamCount} team${d.teamCount === 1 ? "" : "s"}`), 0, 0);
      return new Text(theme.fg("dim", "linear"), 0, 0);
    },
  });

  // --- linear_list_projects ---------------------------------------------------
  pi.registerTool({
    name: "linear_list_projects",
    label: "Linear: List/Search Projects",
    description:
      "Query Linear projects (milestones). Pass `id` (UUID or slugId) to fetch a single project " +
      "with full details (milestones, issues, members, content). Otherwise lists projects matching " +
      "the given filters. `statusType` filters by project status type " +
      "(backlog/planned/started/paused/completed/canceled). Results are truncated to ~2000 lines/50KB.",
    promptSnippet: "Search and read Linear projects/milestones by filter or id",
    promptGuidelines: [
      "Use linear_list_projects to find Linear projects/milestones; pass a slugId or UUID as id to fetch one project's full details including its issues and milestones.",
    ],
    parameters: Type.Object({
      id: Type.Optional(
        Type.String({ description: "Project UUID or slugId. Returns that single project in full." }),
      ),
      query: Type.Optional(
        Type.String({ description: "Free-text search across project name and description." }),
      ),
      teamKey: Type.Optional(Type.String({ description: "Team key, e.g. 'HOR'." })),
      statusType: Type.Optional(
        StringEnum(
          ["backlog", "planned", "started", "paused", "completed", "canceled"] as const,
          { description: "Filter by project status type." },
        ),
      ),
      includeArchived: Type.Optional(Type.Boolean({ description: "Include archived projects. Default false." })),
      limit: Type.Optional(Type.Number({ description: "Max results (1-50, default 25)." })),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
      // Single-project fetch path.
      if (params.id) {
        const data = await linearFetch<{ project: LinearProject | null }>(
          `query($id: String!) { project(id: $id) { ${PROJECT_FULL_FIELDS} } }`,
          { id: params.id },
          signal,
        );
        if (!data.project) throw new Error(`Project not found: ${params.id}`);
        return {
          content: [{ type: "text", text: truncateOutput(formatProjectFull(data.project)).text }],
          details: { kind: "project", slugId: data.project.slugId, url: data.project.url },
        };
      }

      const and: Record<string, unknown>[] = [];
      if (params.query) and.push({ searchableContent: { contains: params.query } });
      if (params.teamKey)
        and.push({ accessibleTeams: { some: { key: { eq: params.teamKey.toUpperCase() } } } });
      if (params.statusType) and.push({ status: { type: { eq: params.statusType } } });
      let filter: Record<string, unknown> | undefined;
      if (and.length === 1) filter = and[0];
      else if (and.length > 1) filter = { and };

      const first = clamp(params.limit ?? 25, 1, 50);
      const includeArchived = params.includeArchived ?? false;
      const data = await linearFetch<{ projects: { nodes: LinearProject[] } }>(
        `query($filter: ProjectFilter, $first: Int, $archived: Boolean) {
          projects(filter: $filter, first: $first, includeArchived: $archived, orderBy: updatedAt) {
            nodes { ${PROJECT_SUMMARY_FIELDS} }
          }
        }`,
        { filter, first, includeArchived },
        signal,
      );
      const nodes = data.projects.nodes;
      if (nodes.length === 0) {
        return {
          content: [{ type: "text", text: "No projects matched the given filters." }],
          details: { kind: "list", count: 0 },
        };
      }
      let text = `Found ${nodes.length} project${nodes.length === 1 ? "" : "s"}:\n\n`;
      text += nodes.map(formatProjectSummary).join("\n\n");
      return {
        content: [{ type: "text", text: truncateOutput(text).text }],
        details: { kind: "list", count: nodes.length },
      };
    },
    renderResult(result, _opts, theme) {
      const d = result.details as { kind?: string; count?: number; slugId?: string } | undefined;
      if (d?.kind === "list") {
        const c = d.count ?? 0;
        return new Text(c === 0 ? theme.fg("dim", "No projects") : theme.fg("success", `${c} project${c === 1 ? "" : "s"}`), 0, 0);
      }
      if (d?.kind === "project" && d.slugId) {
        return new Text(theme.fg("success", `✓ ${d.slugId}`), 0, 0);
      }
      return new Text(theme.fg("dim", "linear"), 0, 0);
    },
  });

  // --- linear_create_project --------------------------------------------------
  pi.registerTool({
    name: "linear_create_project",
    label: "Linear: Create Project",
    description:
      "Create a new Linear project (milestone). `name` and `teamIds` (one or more team UUIDs) are " +
      "required; get teamIds and statusId from linear_list_teams. `startDate`/`targetDate` are " +
      "YYYY-MM-DD. `content` is the project brief (markdown).",
    promptSnippet: "Create a new Linear project/milestone",
    promptGuidelines: [
      "linear_create_project requires name and teamIds (one or more team UUIDs from linear_list_teams).",
    ],
    parameters: Type.Object({
      name: Type.String({ description: "Project name (required)." }),
      teamIds: Type.Array(Type.String(), {
        description: "One or more team UUIDs (required). Get from linear_list_teams.",
      }),
      description: Type.Optional(Type.String({ description: "Short description." })),
      content: Type.Optional(Type.String({ description: "Project brief / document content (markdown)." })),
      statusId: Type.Optional(
        Type.String({ description: "Project status UUID. Get from linear_list_teams." }),
      ),
      leadId: Type.Optional(Type.String({ description: "Project lead user UUID." })),
      priority: Type.Optional(
        Type.Number({ description: "0=No priority, 1=Urgent, 2=High, 3=Medium, 4=Low." }),
      ),
      startDate: Type.Optional(Type.String({ description: "Start date as YYYY-MM-DD." })),
      targetDate: Type.Optional(Type.String({ description: "Target date as YYYY-MM-DD." })),
      icon: Type.Optional(Type.String({ description: "Emoji icon, e.g. '🚀'." })),
      color: Type.Optional(Type.String({ description: "Hex color, e.g. '#5e6ad2'." })),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
      const input: Record<string, unknown> = {
        name: params.name,
        teamIds: params.teamIds,
      };
      if (params.description !== undefined) input.description = params.description;
      if (params.content !== undefined) input.content = params.content;
      if (params.statusId) input.statusId = params.statusId;
      if (params.leadId) input.leadId = params.leadId;
      if (typeof params.priority === "number") input.priority = params.priority;
      if (params.startDate) input.startDate = params.startDate;
      if (params.targetDate) input.targetDate = params.targetDate;
      if (params.icon) input.icon = params.icon;
      if (params.color) input.color = params.color;

      const data = await linearFetch<{
        projectCreate: { success: boolean; project: LinearProject };
      }>(
        `mutation($input: ProjectCreateInput!) {
          projectCreate(input: $input) { success project { id name slugId url status { name } } }
        }`,
        { input },
        signal,
      );
      if (!data.projectCreate.success) throw new Error("Linear did not confirm project creation.");
      const p = data.projectCreate.project;
      return {
        content: [
          { type: "text", text: `Created project ${p.name} (slug ${p.slugId})\n${p.url}` },
        ],
        details: { kind: "created", slugId: p.slugId, url: p.url },
      };
    },
    renderResult(result, _opts, theme) {
      const d = result.details as { kind?: string; slugId?: string } | undefined;
      if (d?.slugId) return new Text(theme.fg("success", `✓ Created ${d.slugId}`), 0, 0);
      return new Text(theme.fg("dim", "linear"), 0, 0);
    },
  });

  // --- linear_update_project --------------------------------------------------
  pi.registerTool({
    name: "linear_update_project",
    label: "Linear: Update Project",
    description:
      "Update an existing Linear project (milestone). `id` accepts a UUID or slugId. Only provided " +
      "fields are changed. For nullable date fields, use 'none' to clear (startDate='none', " +
      "targetDate='none'). Get statusId from linear_list_teams.",
    promptSnippet: "Update an existing Linear project/milestone",
    promptGuidelines: [
      "Use linear_update_project to change an existing Linear project by UUID or slugId; only provided fields are changed.",
    ],
    parameters: Type.Object({
      id: Type.String({ description: "Project UUID or slugId." }),
      name: Type.Optional(Type.String()),
      description: Type.Optional(Type.String()),
      content: Type.Optional(Type.String({ description: "Project brief / document content (markdown)." })),
      statusId: Type.Optional(Type.String({ description: "New project status UUID." })),
      leadId: Type.Optional(Type.String({ description: "Project lead user UUID." })),
      priority: Type.Optional(
        Type.Number({ description: "0=No priority, 1=Urgent, 2=High, 3=Medium, 4=Low." }),
      ),
      startDate: Type.Optional(Type.String({ description: "Start date YYYY-MM-DD, or 'none' to clear." })),
      targetDate: Type.Optional(Type.String({ description: "Target date YYYY-MM-DD, or 'none' to clear." })),
      icon: Type.Optional(Type.String({ description: "Emoji icon." })),
      color: Type.Optional(Type.String({ description: "Hex color." })),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
      const uuid = await resolveProjectId(params.id, signal);
      const input: Record<string, unknown> = {};
      if (params.name !== undefined) input.name = params.name;
      if (params.description !== undefined) input.description = params.description;
      if (params.content !== undefined) input.content = params.content;
      if (params.statusId !== undefined) input.statusId = params.statusId;
      if (params.leadId !== undefined) input.leadId = params.leadId;
      if (params.priority !== undefined) input.priority = params.priority;
      if (params.startDate !== undefined) {
        input.startDate = params.startDate.toLowerCase() === "none" ? null : params.startDate;
      }
      if (params.targetDate !== undefined) {
        input.targetDate = params.targetDate.toLowerCase() === "none" ? null : params.targetDate;
      }
      if (params.icon !== undefined) input.icon = params.icon;
      if (params.color !== undefined) input.color = params.color;
      if (Object.keys(input).length === 0) {
        throw new Error("No update fields provided. Specify at least one field to change.");
      }

      const data = await linearFetch<{
        projectUpdate: { success: boolean; project: LinearProject };
      }>(
        `mutation($id: String!, $input: ProjectUpdateInput!) {
          projectUpdate(id: $id, input: $input) { success project { id name slugId url status { name } } }
        }`,
        { id: uuid, input },
        signal,
      );
      if (!data.projectUpdate.success) throw new Error("Linear did not confirm project update.");
      const p = data.projectUpdate.project;
      return {
        content: [
          { type: "text", text: `Updated project ${p.name} (slug ${p.slugId})\n${p.url}` },
        ],
        details: { kind: "updated", slugId: p.slugId, url: p.url },
      };
    },
    renderResult(result, _opts, theme) {
      const d = result.details as { kind?: string; slugId?: string } | undefined;
      if (d?.slugId) return new Text(theme.fg("success", `✓ Updated ${d.slugId}`), 0, 0);
      return new Text(theme.fg("dim", "linear"), 0, 0);
    },
  });
}

// re-export for index
export { isUuid };
