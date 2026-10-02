/**
 * Linear issue dependency (blocked-by) tools: set + list.
 *
 * Linear models "A is blocked by B" as a `blocks` IssueRelation from B (issueId)
 * to A (relatedIssueId). Creating { type: "blocks", issueId: B, relatedIssueId: A }
 * makes A "blocked by" B.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { linearFetch, resolveIssueId, truncateOutput } from "./client";

const BLOCKS = "blocks";

export function registerDependencyTools(pi: ExtensionAPI): void {
  // --- linear_set_blocked_by --------------------------------------------------
  pi.registerTool({
    name: "linear_set_blocked_by",
    label: "Linear: Set Blocked-By",
    description:
      "Mark a Linear issue as blocked by one or more other issues (sets Linear dependencies). " +
      "`issue` is the blocked issue (UUID or identifier like 'HOR-255'); `blockedBy` is a list of " +
      "blocker issues (UUIDs or identifiers). Creates a 'blocks' relation from each blocker to the issue. " +
      "Pass `replace: true` to first remove existing 'blocked by' relations. " +
      "Re-creating an existing relation errors per-relation (others still succeed).",
    promptSnippet: "Set Linear issue dependencies (blocked-by)",
    promptGuidelines: [
      "Use linear_set_blocked_by to make issue A blocked by [B, C]. It creates a 'blocks' relation B->A and C->A. Pass replace:true to overwrite existing blocked-by relations.",
    ],
    parameters: Type.Object({
      issue: Type.String({ description: "The blocked issue (UUID or identifier, e.g. 'HOR-255')." }),
      blockedBy: Type.Array(Type.String(), { description: "Blocker issues (UUIDs or identifiers)." }),
      replace: Type.Optional(Type.Boolean({ description: "Remove existing 'blocked by' relations first. Default false." })),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
      if (params.blockedBy.length === 0) throw new Error("blockedBy must contain at least one issue.");
      const issueUuid = await resolveIssueId(params.issue, signal);
      const blockerUuids = await Promise.all(params.blockedBy.map((b) => resolveIssueId(b, signal)));

      let removed = 0;
      if (params.replace) {
        const rel = await linearFetch<{
          issue: { inverseRelations: { nodes: Array<{ id: string; type: string }> } };
        }>(
          `query($id: String!) { issue(id: $id) { inverseRelations { nodes { id type } } } }`,
          { id: issueUuid },
          signal,
        );
        const toRemove = rel.issue.inverseRelations.nodes.filter((r) => r.type === BLOCKS);
        for (const r of toRemove) {
          await linearFetch<{ issueRelationDelete: { success: boolean } }>(
            `mutation($id: String!) { issueRelationDelete(id: $id) { success } }`,
            { id: r.id },
            signal,
          );
          removed++;
        }
      }

      const created: string[] = [];
      const errors: string[] = [];
      for (const blockerUuid of blockerUuids) {
        try {
          const r = await linearFetch<{
            issueRelationCreate: { success: boolean; issueRelation: { id: string } };
          }>(
            `mutation($input: IssueRelationCreateInput!) { issueRelationCreate(input: $input) { success issueRelation { id } } }`,
            { input: { type: BLOCKS, issueId: blockerUuid, relatedIssueId: issueUuid } },
            signal,
          );
          if (r.issueRelationCreate.success) created.push(r.issueRelationCreate.issueRelation.id);
        } catch (err) {
          errors.push(err instanceof Error ? err.message : String(err));
        }
      }
      const lines: string[] = [];
      lines.push(`Issue ${params.issue} blocked by ${blockerUuids.length} issue(s).`);
      lines.push(`Created ${created.length} relation(s).`);
      if (removed) lines.push(`Removed ${removed} prior 'blocked by' relation(s).`);
      if (errors.length) lines.push(`Errors (${errors.length}):\n  - ` + errors.join("\n  - "));
      return {
        content: [{ type: "text", text: lines.join("\n") }],
        details: { created: created.length, errors: errors.length },
      };
    },
    renderResult(result, _opts, theme) {
      const d = result.details as { created?: number; errors?: number } | undefined;
      const hadErr = (d?.errors ?? 0) > 0;
      return new Text(
        hadErr ? theme.fg("warning", `⚠ ${d?.created ?? 0} deps`) : theme.fg("success", `✓ ${d?.created ?? 0} deps`),
        0,
        0,
      );
    },
  });

  // --- linear_list_issue_relations -------------------------------------------
  pi.registerTool({
    name: "linear_list_issue_relations",
    label: "Linear: List Issue Dependencies",
    description:
      "List an issue's dependency relations: what it blocks and what it is blocked by. " +
      "`issue` is a UUID or identifier like 'HOR-255'.",
    promptSnippet: "List a Linear issue's blocked-by / blocks relations",
    promptGuidelines: [
      "Use linear_list_issue_relations to see what an issue is blocked by and what it blocks.",
    ],
    parameters: Type.Object({
      issue: Type.String({ description: "Issue UUID or identifier (e.g. 'HOR-255')." }),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
      const uuid = await resolveIssueId(params.issue, signal);
      const data = await linearFetch<{
        issue: {
          relations: {
            nodes: Array<{
              type: string;
              relatedIssue: { identifier: string; title: string };
            }>;
          };
          inverseRelations: {
            nodes: Array<{
              type: string;
              issue: { identifier: string; title: string };
            }>;
          };
        };
      }>(
        `query($id: String!) {
          issue(id: $id) {
            relations { nodes { type relatedIssue { identifier title } } }
            inverseRelations { nodes { type issue { identifier title } } }
          }
        }`,
        { id: uuid },
        signal,
      );
      const blocks = data.issue.relations.nodes.filter((r) => r.type === BLOCKS);
      const blockedBy = data.issue.inverseRelations.nodes.filter((r) => r.type === BLOCKS);
      const lines: string[] = [];
      lines.push(`${params.issue} dependencies:`);
      lines.push(`  Blocks (${blocks.length}):`);
      for (const r of blocks) lines.push(`    -> ${r.relatedIssue.identifier} ${r.relatedIssue.title}`);
      lines.push(`  Blocked by (${blockedBy.length}):`);
      for (const r of blockedBy) lines.push(`    <- ${r.issue.identifier} ${r.issue.title}`);
      if (blocks.length === 0 && blockedBy.length === 0) lines.push("  (no blocks/blocked-by relations)");
      return {
        content: [{ type: "text", text: truncateOutput(lines.join("\n")).text }],
        details: { blocks: blocks.length, blockedBy: blockedBy.length },
      };
    },
    renderResult(result, _opts, theme) {
      const d = result.details as { blocks?: number; blockedBy?: number } | undefined;
      return new Text(theme.fg("dim", `blocks:${d?.blocks ?? 0} by:${d?.blockedBy ?? 0}`), 0, 0);
    },
  });
}
