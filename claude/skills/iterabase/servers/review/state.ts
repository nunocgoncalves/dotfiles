/**
 * Per-session review-workflow state: the active PR, mode, and latest review
 * summary. The review MCP server runs once per Claude Code session, so state
 * lives in memory and is mirrored to a file keyed by the session id. The file
 * lets a resumed session keep its reviewer/author mode and lets the context
 * hook remind the model of the active PR on every prompt. GitHub markers stay
 * the authoritative round state; this is only a convenience.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type ReviewMode = "review" | "address";

export interface ReviewState {
  pr: number;
  mode: ReviewMode;
  reviewSummaryId?: number;
}

const STATE_DIR = join(
  process.env.XDG_STATE_HOME || join(homedir(), ".local", "state"),
  "iterabase",
  "review-sessions",
);

export function stateFile(sessionId: string): string {
  return join(STATE_DIR, `${sessionId.replace(/[^\w-]/g, "")}.json`);
}

/** Read a session's persisted state; undefined when absent or unreadable. */
export function readSessionState(sessionId: string | undefined): ReviewState | undefined {
  if (!sessionId) return undefined;
  try {
    return JSON.parse(readFileSync(stateFile(sessionId), "utf8")) as ReviewState;
  } catch {
    return undefined;
  }
}

let current: ReviewState | undefined;

export function saveState(st: ReviewState): void {
  current = st;
  const sessionId = process.env.CLAUDE_CODE_SESSION_ID;
  if (!sessionId) return;
  try {
    mkdirSync(STATE_DIR, { recursive: true });
    writeFileSync(stateFile(sessionId), `${JSON.stringify(st)}\n`);
  } catch {
    // Best effort: in-memory state still gates this session.
  }
}

/** Latest state for this session (in-memory first, then the persisted copy). */
export function loadState(): ReviewState | undefined {
  current ??= readSessionState(process.env.CLAUDE_CODE_SESSION_ID);
  return current;
}
