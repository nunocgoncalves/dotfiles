/**
 * pi extension: review-workflow
 *
 * The protocol layer for the code-review ⇄ address-review loop. Provides the
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
 *   - PR creation, review entry, and post-update completion wait for CI;
 *   - raw `gh pr comment` / `gh pr review` / `gh api .../comments` are blocked
 *     so the LLM can't bypass the tools.
 *
 * The judgement (smells, agree/disagree, fixes) stays in the SKILLs; this
 * extension owns the protocol + state.
 *
 * Product tool — lives in the overlay repo at pi/product/extensions/review-workflow/.
 * For localhost, symlink it into ~/.pi/agent/extensions/ (see the overlay README).
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerReviewTools } from "./tools";
import { registerReviewCommands } from "./commands";
import { loadState } from "./state";
import { detectPrimaryCheckoutSync } from "./worktrees";

export default function (pi: ExtensionAPI) {
  registerReviewTools(pi);
  registerReviewCommands(pi);

  // Inject the active review state into the system prompt so a resumed session
  // (or the next turn) knows the PR/mode without re-deriving it from GitHub.
  // Also name the workspace boundary: mutating ticket work belongs in the
  // dedicated ticket worktree, never the primary checkout.
  pi.on("before_agent_start", async (event, ctx) => {
    const st = loadState(ctx);
    const lines: string[] = [];
    if (st) {
      lines.push(
        `[review-workflow] Active: PR #${st.pr}, mode=${st.mode}` +
          (st.reviewSummaryId ? `, latest review summary #${st.reviewSummaryId}` : "") +
          `. Use the review_* tools; do not post review artifacts via raw gh.`,
      );
    }
    if (detectPrimaryCheckoutSync(ctx.cwd) === true && st?.mode !== "review") {
      lines.push(
        "[review-workflow] cwd is the primary checkout. Ticket edits, commits, and pushes belong in the dedicated ticket worktree " +
          "(<PI_WORKTREE_ROOT or ~/Developer/worktrees>/<repo>/<TICKET>) — call worktree_ensure and use absolute paths.",
      );
    }
    if (lines.length === 0) return;
    return { systemPrompt: (event.systemPrompt ?? "") + "\n" + lines.join("\n") };
  });

  // Block raw GitHub comment/review commands so the LLM must use the review_*
  // tools (which enforce markers + invariants). gh pr view/diff/create are
  // unaffected; only posting review artifacts is gated.
  pi.on("tool_call", async (event) => {
    if (event.toolName !== "bash") return;
    const cmd = (event.input as { command?: string }).command;
    if (!cmd) return;
    const blocked =
      /\bgh\s+pr\s+comment\b/.test(cmd) ||
      /\bgh\s+pr\s+review\b/.test(cmd) ||
      /gh\s+api\b[^\n]*pulls\/\d+\/comments/.test(cmd) ||
      /gh\s+api\b[^\n]*issues\/\d+\/comments/.test(cmd) ||
      /gh\s+api\b[^\n]*pulls\/\d+\/reviews/.test(cmd);
    if (blocked) {
      return {
        block: true,
        reason:
          "Use the review-workflow tools (review_post_finding, review_post_reply, review_post_summary, " +
          "review_post_response_summary, review_post_verdict) instead of raw gh comment/review commands, " +
          "so markers and invariants are enforced.",
      };
    }
  });
}
