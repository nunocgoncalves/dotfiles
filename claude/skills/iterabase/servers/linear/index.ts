/**
 * MCP server: Linear integration.
 *
 * Tools for querying, creating, and updating Linear issues (tickets), projects,
 * dependencies, and cycles via the Linear GraphQL API. Authenticates with the
 * `LINEAR_API_KEY` environment variable inherited from the shell that started
 * Claude Code.
 */

import { createHost } from "../lib/host.ts";
import { registerCycleTools } from "./cycles.ts";
import { registerDependencyTools } from "./dependencies.ts";
import { registerIssueTools } from "./issues.ts";
import { registerProjectTools } from "./projects.ts";

const host = createHost();
registerIssueTools(host);
registerProjectTools(host);
registerDependencyTools(host);
registerCycleTools(host);

host.serve({
  name: "linear",
  version: "1.0.0",
  instructions:
    "Linear is the source of truth for ticket state, ownership, sequencing, and completion. " +
    "Call linear_list_teams first for team/state/label IDs. Issue tools accept identifiers like HOR-123.",
});
