/**
 * Per-session review-workflow state, persisted via pi.appendEntry so a resumed
 * session (and the before_agent_start context injection) knows the active PR,
 * mode, and latest review summary without re-deriving it from GitHub.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

export type ReviewMode = "review" | "address";

export interface ReviewState {
  pr: number;
  mode: ReviewMode;
  reviewSummaryId?: number;
}

const STATE_TYPE = "review-workflow-state";

export function saveState(pi: ExtensionAPI, st: ReviewState): void {
  pi.appendEntry<ReviewState>(STATE_TYPE, st);
}

/** Latest state in the current branch (last matching custom entry wins). */
export function loadState(ctx: ExtensionContext): ReviewState | undefined {
  let st: ReviewState | undefined;
  for (const e of ctx.sessionManager.getBranch()) {
    if (e.type === "custom" && e.customType === STATE_TYPE) {
      st = e.data as ReviewState;
    }
  }
  return st;
}
