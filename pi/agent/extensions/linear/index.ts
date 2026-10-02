/**
 * pi extension: Linear integration
 *
 * Adds tools for querying, creating, and updating Linear issues (tickets) and
 * projects (milestones) via the Linear GraphQL API. Authenticates with the
 * `LINEAR_API_KEY` environment variable.
 *
 * Global extension — place at ~/.pi/agent/extensions/linear/index.ts
 * Reload with /reload after changes.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerIssueTools } from "./issues";
import { registerProjectTools } from "./projects";
import { registerDependencyTools } from "./dependencies";
import { registerCycleTools } from "./cycles";

export default function (pi: ExtensionAPI) {
  registerIssueTools(pi);
  registerProjectTools(pi);
  registerDependencyTools(pi);
  registerCycleTools(pi);

  // Surface a hint on startup when the API key is missing, so the user knows
  // why the tools would fail. Non-blocking; only shown in interactive/RPC modes.
  pi.on("session_start", (_event, ctx) => {
    if (process.env.LINEAR_API_KEY) return;
    if (!ctx.hasUI) return;
    ctx.ui.notify(
      "Linear extension loaded but LINEAR_API_KEY is not set. Export it and /reload.",
      "warning",
    );
  });
}
