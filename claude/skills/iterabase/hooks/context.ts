/**
 * SessionStart / UserPromptSubmit context hook.
 *
 * - Names the workspace boundary when the session runs in a primary checkout:
 *   mutating ticket work belongs in the dedicated ticket worktree.
 * - Reminds the model of the active review PR/mode recorded by the review MCP
 *   server for this session.
 * - Warns once at session start when LINEAR_API_KEY is missing.
 */

import { readFileSync } from "node:fs";
import { readSessionState } from "../servers/review/state.ts";
import { detectPrimaryCheckoutSync } from "../servers/review/worktrees.ts";

const input = JSON.parse(readFileSync(0, "utf8")) as {
  hook_event_name: "SessionStart" | "UserPromptSubmit";
  session_id?: string;
  cwd?: string;
};

const st = readSessionState(input.session_id);
const lines: string[] = [];

if (st) {
  lines.push(
    `[review-workflow] Active: PR #${st.pr}, mode=${st.mode}` +
      (st.reviewSummaryId ? `, latest review summary #${st.reviewSummaryId}` : "") +
      `. Use the review_* tools; do not post review artifacts via raw gh.`,
  );
}

// The boundary only needs stating once; the session-start context persists.
if (input.hook_event_name === "SessionStart" && st?.mode !== "review") {
  if (detectPrimaryCheckoutSync(input.cwd ?? process.cwd()) === true) {
    lines.push(
      "[review-workflow] cwd is the primary checkout. Ticket edits, commits, and pushes belong in the dedicated ticket worktree " +
        "(<PI_WORKTREE_ROOT or ~/Developer/worktrees>/<repo>/<TICKET>) — call worktree_ensure and use absolute paths.",
    );
  }
}

const output: Record<string, unknown> = {};
if (lines.length) {
  output.hookSpecificOutput = { hookEventName: input.hook_event_name, additionalContext: lines.join("\n") };
}
if (input.hook_event_name === "SessionStart" && !process.env.LINEAR_API_KEY?.trim()) {
  output.systemMessage = "iterabase: LINEAR_API_KEY is not set, so the Linear tools will fail. Export it and restart Claude Code.";
}
if (Object.keys(output).length) process.stdout.write(JSON.stringify(output));
