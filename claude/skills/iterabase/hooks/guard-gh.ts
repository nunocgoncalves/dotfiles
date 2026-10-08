/**
 * PreToolUse(Bash) guard: block raw GitHub comment/review commands so the
 * model must use the review_* MCP tools, which enforce markers + invariants.
 * gh pr view/diff/create/checks are unaffected; only posting review artifacts
 * is gated. Exit code 2 blocks the call and feeds stderr back to the model.
 */

import { readFileSync } from "node:fs";

const input = JSON.parse(readFileSync(0, "utf8")) as { tool_input?: { command?: string } };
const cmd = input.tool_input?.command ?? "";

const blocked =
  /\bgh\s+pr\s+comment\b/.test(cmd) ||
  /\bgh\s+pr\s+review\b/.test(cmd) ||
  /gh\s+api\b[^\n]*pulls\/\d+\/comments/.test(cmd) ||
  /gh\s+api\b[^\n]*issues\/\d+\/comments/.test(cmd) ||
  /gh\s+api\b[^\n]*pulls\/\d+\/reviews/.test(cmd);

if (blocked) {
  process.stderr.write(
    "Use the review-workflow tools (review_post_finding, review_post_reply, review_post_summary, " +
      "review_post_response_summary, review_post_verdict) instead of raw gh comment/review commands, " +
      "so markers and invariants are enforced.\n",
  );
  process.exit(2);
}
