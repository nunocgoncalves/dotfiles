/**
 * MCP server: review-workflow.
 *
 * The protocol layer for the review-pr ⇄ address-review loop. Provides the
 * ONLY sanctioned tools for posting review artifacts to a GitHub PR, enforcing
 * the markers and invariants the prompt-based skills cannot reliably enforce
 * alone:
 *   - markers are always present and well-formed (tools append them);
 *   - line findings are always inline (review_post_finding validates the line);
 *   - a round's completion signal is posted exactly once (review_post_summary /
 *     review_post_response_summary refuse duplicates);
 *   - address-review cannot finish until EVERY finding is replied
 *     (review_post_response_summary gates on unresolved findings);
 *   - developer replies never resolve threads; reviewer mode owns acceptance;
 *   - PR creation, review entry, and post-update completion wait for CI.
 *
 * The plugin's PreToolUse hook blocks raw `gh pr comment` / `gh pr review` /
 * `gh api .../comments` so the model can't bypass these tools, and its context
 * hook injects the active PR/mode and the worktree boundary.
 */

import { createHost } from "../lib/host.ts";
import { registerReviewTools } from "./tools.ts";

const host = createHost();
registerReviewTools(host);

host.serve({
  name: "review",
  version: "1.0.0",
  instructions:
    "Post review artifacts to GitHub PRs only through these tools (never raw gh comment/review commands). " +
    "Mutating ticket work happens in the dedicated ticket worktree from worktree_ensure, never the primary checkout. " +
    "Some calls wait for CI and can take many minutes.",
});
