/**
 * Slash commands that prime a session for a review-workflow run. Each sends a
 * user message that triggers the matching skill; the skills then drive the
 * review_* tools. Commands are thin — the tools are where the invariants live.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export function registerReviewCommands(pi: ExtensionAPI): void {
  pi.registerCommand("code-review", {
    description: "Start a code-review run on a GitHub PR (code-review skill)",
    handler: async (args, ctx) => {
      const pr = args.trim();
      if (!pr) {
        ctx.ui.notify("Usage: /code-review <pr-number-or-url>", "warning");
        return;
      }
      pi.sendUserMessage(
        `Review GitHub PR ${pr}. Load and follow the code-review skill. ` +
          `Begin by calling review_init with pr="${pr}", mode="review". ` +
          `Apply the product authority hierarchy: Obsidian PRD/product decisions define product behavior, ` +
          `the Linear issue defines the approved delivery slice, and repository docs define implementation standards. ` +
          `Wait for review_init to confirm CI on the current head. Explicitly resolve only responses you verify. ` +
          `Post each new line-specific finding with review_post_finding, then post a non-terminal summary or, only when explicitly final, review_mark_terminal. ` +
          `Do NOT call gh pr comment, gh pr review, or gh api .../comments directly — use the review_* tools.`,
      );
    },
  });

  pi.registerCommand("address-review", {
    description: "Address the latest review on a GitHub PR (address-review skill)",
    handler: async (args, ctx) => {
      const pr = args.trim();
      if (!pr) {
        ctx.ui.notify("Usage: /address-review <pr-number-or-url>", "warning");
        return;
      }
      pi.sendUserMessage(
        `Address the review on GitHub PR ${pr}. Load and follow the address-review skill. ` +
          `Begin by calling review_init with pr="${pr}", mode="address", then review_list_findings to enumerate findings. ` +
          `Investigate each against the Obsidian PRD/product decisions, Linear delivery slice, and repository standards. ` +
          `Fix what you agree with (commit + push), then reply with review_post_reply (one per finding). ` +
          `Do not resolve threads or mark final. Finish with review_post_response_summary, which waits for CI on the updated head. ` +
          `Do NOT call gh pr comment, gh pr review, or gh api .../comments directly — use the review_* tools.`,
      );
    },
  });

  pi.registerCommand("open-pr", {
    description: "Open a PR for a Linear ticket (open-pr skill)",
    handler: async (args, ctx) => {
      const ticket = args.trim();
      if (!ticket) {
        ctx.ui.notify("Usage: /open-pr <HOR-123>", "warning");
        return;
      }
      pi.sendUserMessage(
        `Open a PR for Linear ticket ${ticket}. Load and follow the open-pr skill. ` +
          `Fetch the ticket with linear_list_issues (identifier="${ticket}") and run the open-pr skill's ` +
          `traceability, acceptance, architecture-approval, diff, and validation preflight. ` +
          `Then call open_pr with the ticket id and the four body sections. ` +
          `The open_pr tool waits for CI on the created head. Only after it passes, call linear_list_teams then linear_update_issue to move ${ticket} to In Review.`,
      );
    },
  });
}
