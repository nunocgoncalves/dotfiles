/**
 * Linear cycle tools: list, create, update.
 *
 * Cycles are team-scoped. `linear_update_issue.cycleId` needs a cycle UUID
 * (not the cycle number); `linear_list_cycles` resolves that.
 */

import type { Host } from "../lib/host.ts";
import { StringEnum, Type } from "../lib/schema.ts";
import { day, isUuid, linearFetch, truncateOutput } from "./client.ts";

const CYCLE_FIELDS = `id number name description startsAt endsAt completedAt`;

interface LinearCycle {
  id: string;
  number: number;
  name?: string | null;
  description?: string | null;
  startsAt: string;
  endsAt: string;
  completedAt?: string | null;
}

/** Resolve a team reference (UUID or key like 'HOR') to a team UUID. */
async function resolveTeamId(teamIdOrKey: string, signal?: AbortSignal): Promise<string> {
  if (isUuid(teamIdOrKey)) return teamIdOrKey;
  const data = await linearFetch<{ teams: { nodes: Array<{ id: string }> } }>(
    `query($key: String!) { teams(filter: { key: { eq: $key } }, first: 1) { nodes { id } } }`,
    { key: teamIdOrKey.toUpperCase() },
    signal,
  );
  const t = data.teams.nodes[0];
  if (!t) throw new Error(`Team not found: ${teamIdOrKey}`);
  return t.id;
}

/** Accept YYYY-MM-DD or an ISO string; emit an ISO DateTime. */
function toIso(d: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return `${d}T00:00:00.000Z`;
  return d;
}

export function registerCycleTools(host: Host): void {
  // --- linear_list_cycles -----------------------------------------------------
  host.registerTool({
    name: "linear_list_cycles",
    label: "Linear: List Cycles",
    description:
      "List a team's Linear cycles (cycle UUID, number, name, dates, completed status), most recent first. " +
      "Pass `teamKey` (e.g. 'HOR') or `teamId` (UUID). Use this to get the cycle UUID needed by " +
      "linear_update_issue.cycleId (the API needs a UUID, not the cycle number).",
    promptSnippet: "List a Linear team's cycles (get cycle UUIDs)",
    promptGuidelines: [
      "Use linear_list_cycles to get cycle UUIDs; linear_update_issue.cycleId requires a UUID, not the cycle number.",
    ],
    parameters: Type.Object({
      teamKey: Type.Optional(Type.String({ description: "Team key, e.g. 'HOR'." })),
      teamId: Type.Optional(Type.String({ description: "Team UUID." })),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
      const ref = params.teamId ?? params.teamKey;
      if (!ref) throw new Error("Provide teamKey or teamId.");
      const tid = await resolveTeamId(ref, signal);
      const data = await linearFetch<{ team: { cycles: { nodes: LinearCycle[] } } }>(
        `query($id: String!) { team(id: $id) { cycles { nodes { ${CYCLE_FIELDS} } } } }`,
        { id: tid },
        signal,
      );
      const nodes = [...data.team.cycles.nodes].sort((a, b) => b.number - a.number);
      if (nodes.length === 0) {
        return { content: [{ type: "text", text: "No cycles." }], details: { count: 0 } };
      }
      const lines = [`Found ${nodes.length} cycle(s):\n`];
      const now = Date.now();
      for (const c of nodes) {
        const ended = c.endsAt ? new Date(c.endsAt).getTime() < now : false;
        const state = c.completedAt ? "completed" : ended ? "ended" : "active";
        lines.push(`#${c.number} ${c.id}${c.name ? ` — ${c.name}` : ""}  [${state}]  ${day(c.startsAt)}..${day(c.endsAt)}`);
      }
      return {
        content: [{ type: "text", text: truncateOutput(lines.join("\n")).text }],
        details: { count: nodes.length },
      };
    },
  });

  // --- linear_create_cycle ----------------------------------------------------
  host.registerTool({
    name: "linear_create_cycle",
    label: "Linear: Create Cycle",
    description:
      "Create a Linear cycle for a team. `teamId` (UUID), `startsAt`, and `endsAt` are required (YYYY-MM-DD or ISO). " +
      "`name` and `description` optional. Returns the new cycle's id/number.",
    promptSnippet: "Create a Linear cycle",
    promptGuidelines: [
      "Use linear_create_cycle to start a new cycle. teamId + startsAt + endsAt required (YYYY-MM-DD).",
    ],
    parameters: Type.Object({
      teamId: Type.String({ description: "Team UUID. Get from linear_list_teams." }),
      startsAt: Type.String({ description: "Start date YYYY-MM-DD (or ISO DateTime)." }),
      endsAt: Type.String({ description: "End date YYYY-MM-DD (or ISO DateTime)." }),
      name: Type.Optional(Type.String({ description: "Cycle name." })),
      description: Type.Optional(Type.String({ description: "Cycle description." })),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
      const input: Record<string, unknown> = {
        teamId: params.teamId,
        startsAt: toIso(params.startsAt),
        endsAt: toIso(params.endsAt),
      };
      if (params.name !== undefined) input.name = params.name;
      if (params.description !== undefined) input.description = params.description;
      const data = await linearFetch<{ cycleCreate: { success: boolean; cycle: LinearCycle } }>(
        `mutation($input: CycleCreateInput!) { cycleCreate(input: $input) { success cycle { ${CYCLE_FIELDS} } } }`,
        { input },
        signal,
      );
      if (!data.cycleCreate.success) throw new Error("Linear did not confirm cycle creation.");
      const c = data.cycleCreate.cycle;
      return {
        content: [{ type: "text", text: `Created cycle #${c.number} ${c.id} (${day(c.startsAt)}..${day(c.endsAt)})` }],
        details: { id: c.id, number: c.number },
      };
    },
  });

  // --- linear_update_cycle ----------------------------------------------------
  host.registerTool({
    name: "linear_update_cycle",
    label: "Linear: Update Cycle",
    description:
      "Update a Linear cycle by UUID. Provide only fields to change. `completedAt` accepts a date, 'now', " +
      "or 'none' to clear (mark uncompleted). `startsAt`/`endsAt` accept YYYY-MM-DD or ISO.",
    promptSnippet: "Update a Linear cycle (rename, reschedule, complete)",
    promptGuidelines: [
      "Use linear_update_cycle to rename/reschedule/complete a cycle. completedAt:'now' completes; 'none' uncompletes.",
    ],
    parameters: Type.Object({
      id: Type.String({ description: "Cycle UUID." }),
      name: Type.Optional(Type.String()),
      description: Type.Optional(Type.String()),
      startsAt: Type.Optional(Type.String({ description: "YYYY-MM-DD or ISO." })),
      endsAt: Type.Optional(Type.String({ description: "YYYY-MM-DD or ISO." })),
      completedAt: Type.Optional(Type.String({ description: "Date, 'now', or 'none' to clear." })),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
      const input: Record<string, unknown> = {};
      if (params.name !== undefined) input.name = params.name;
      if (params.description !== undefined) input.description = params.description;
      if (params.startsAt !== undefined) input.startsAt = toIso(params.startsAt);
      if (params.endsAt !== undefined) input.endsAt = toIso(params.endsAt);
      if (params.completedAt !== undefined) {
        const c = params.completedAt.toLowerCase();
        input.completedAt =
          c === "none" ? null : c === "now" ? new Date().toISOString() : toIso(params.completedAt);
      }
      if (Object.keys(input).length === 0) throw new Error("No update fields provided.");
      const data = await linearFetch<{ cycleUpdate: { success: boolean; cycle: LinearCycle } }>(
        `mutation($id: String!, $input: CycleUpdateInput!) { cycleUpdate(id: $id, input: $input) { success cycle { ${CYCLE_FIELDS} } } }`,
        { id: params.id, input },
        signal,
      );
      if (!data.cycleUpdate.success) throw new Error("Linear did not confirm cycle update.");
      const c = data.cycleUpdate.cycle;
      return { content: [{ type: "text", text: `Updated cycle #${c.number} ${c.id}` }], details: { id: c.id } };
    },
  });
}
