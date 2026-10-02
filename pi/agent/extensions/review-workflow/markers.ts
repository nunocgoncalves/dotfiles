/**
 * Hidden HTML markers that link code-review and address-review into a state
 * machine. These are appended to comment bodies by the review-workflow tools
 * (never written by the LLM directly) so the markers are always well-formed.
 *
 * - REVIEW_MARKER           -> on every review summary + every inline finding
 * - RESPONSE_MARKER_PREFIX  -> on every in-thread reply + the response summary
 * - TERMINAL_MARKER         -> posted only after explicit reviewer finalization
 */

export const REVIEW_MARKER = "<!-- pi-code-review -->";
export const RESPONSE_MARKER_PREFIX = "<!-- pi-code-review-response";
export const REOPENED_MARKER_PREFIX = "<!-- pi-code-review-reopened";
export const FOUNDER_REQUIRED_MARKER_PREFIX = "<!-- pi-code-review-founder-required";
export const TERMINAL_MARKER = "<!-- pi-code-review-terminal -->";

export interface ResponseMarkerInfo {
  reviewSummaryId: string;
  decision?: string;
  sha?: string;
}

export interface FounderRequiredMarkerInfo {
  reviewSummaryId: string;
  decisionRef: string;
}

export type FindingMarkerStatus = "addressed" | "contested" | "open";

export interface FindingMarkerState {
  status: FindingMarkerStatus;
  decision?: string;
  founderRequired?: boolean;
  founderDecisionRef?: string;
  founderRequirement?: string;
}

/** Build a response marker, e.g. `<!-- pi-code-review-response review=42 decision=fixed sha=abc123 -->`. */
export function responseMarker(reviewSummaryId: string | number, decision?: string, sha?: string): string {
  const parts = [`review=${reviewSummaryId}`];
  if (decision) parts.push(`decision=${decision}`);
  if (sha) parts.push(`sha=${sha}`);
  return `<!-- pi-code-review-response ${parts.join(" ")} -->`;
}

/** Reviewer pushback marker. Posted by review_post_counter to reopen a `disagreed` finding. */
export function reopenedMarker(reviewSummaryId: string | number, round?: number): string {
  const parts = [`review=${reviewSummaryId}`];
  if (round) parts.push(`round=${round}`);
  return `<!-- pi-code-review-reopened ${parts.join(" ")} -->`;
}

/** Founder-directed correction after the ordinary two-counter stalemate limit. */
export function founderRequiredMarker(reviewSummaryId: string | number, decisionRef: string): string {
  return `<!-- pi-code-review-founder-required review=${reviewSummaryId} source=${encodeURIComponent(decisionRef)} -->`;
}

/** Parse the first response marker in `text`, if any. */
export function parseResponseMarker(text: string): ResponseMarkerInfo | null {
  const m = text.match(/<!--\s*pi-code-review-response\s+(.*?)\s*-->/);
  if (!m) return null;
  const info: Record<string, string> = {};
  for (const part of m[1].split(/\s+/)) {
    const eq = part.indexOf("=");
    if (eq > 0) info[part.slice(0, eq)] = part.slice(eq + 1);
  }
  return info.review ? { reviewSummaryId: info.review, decision: info.decision, sha: info.sha } : null;
}

/** Parse the first founder-required marker in `text`, if any. */
export function parseFounderRequiredMarker(text: string): FounderRequiredMarkerInfo | null {
  const m = text.match(/<!--\s*pi-code-review-founder-required\s+(.*?)\s*-->/);
  if (!m) return null;
  const info: Record<string, string> = {};
  for (const part of m[1].split(/\s+/)) {
    const eq = part.indexOf("=");
    if (eq > 0) info[part.slice(0, eq)] = part.slice(eq + 1);
  }
  if (!info.review || !info.source) return null;
  try {
    return { reviewSummaryId: info.review, decisionRef: decodeURIComponent(info.source) };
  } catch {
    return null;
  }
}

export function hasReviewMarker(text: string): boolean {
  return text.includes(REVIEW_MARKER);
}

export function hasResponseMarker(text: string): boolean {
  return text.includes(RESPONSE_MARKER_PREFIX);
}

export function hasReopenedMarker(text: string): boolean {
  return text.includes(REOPENED_MARKER_PREFIX);
}

export function hasFounderRequiredMarker(text: string): boolean {
  return text.includes(FOUNDER_REQUIRED_MARKER_PREFIX);
}

/**
 * State is controlled by the latest protocol reply. A founder-required marker
 * is developer-actionable like a reopen, but is deliberately not a counter.
 */
export function findingMarkerState(
  replies: Array<{ body: string; created_at: string }>,
): FindingMarkerState {
  const markerReplies = replies
    .filter((r) => hasResponseMarker(r.body) || hasReopenedMarker(r.body) || hasFounderRequiredMarker(r.body))
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  if (markerReplies.length === 0) return { status: "open" };
  const last = markerReplies[markerReplies.length - 1];
  if (hasFounderRequiredMarker(last.body)) {
    const marker = parseFounderRequiredMarker(last.body);
    return {
      status: "contested",
      founderRequired: true,
      founderDecisionRef: marker?.decisionRef,
      founderRequirement: stripMarkers(last.body),
    };
  }
  if (hasReopenedMarker(last.body)) return { status: "contested" };
  return { status: "addressed", decision: parseResponseMarker(last.body)?.decision };
}

/** Count reopened markers in a thread (for stalemate detection). */
export function countReopenedMarkers(comments: Array<{ body: string }>): number {
  let n = 0;
  for (const c of comments) {
    const m = c.body.match(/<!--\s*pi-code-review-reopened[\s\S]*?-->/g);
    if (m) n += m.length;
  }
  return n;
}

export function hasTerminalMarker(text: string): boolean {
  return text.includes(TERMINAL_MARKER);
}

/** The axis/severity hidden tag embedded in finding bodies by review_post_finding. */
export function findingMetaTag(axis: string, severity: string): string {
  return `<!-- axis=${axis} severity=${severity} -->`;
}

export interface FindingMeta {
  axis?: string;
  severity?: string;
}

export function parseFindingMeta(body: string): FindingMeta {
  const m = body.match(/<!--\s*axis=(\w+)\s+severity=(\w+)\s*-->/);
  return m ? { axis: m[1], severity: m[2] } : {};
}

/** Strip all hidden markers from a comment body for display. */
export function stripMarkers(body: string): string {
  return body
    .replace(/<!--\s*pi-code-review[\s\S]*?-->/g, "")
    .replace(/<!--\s*axis=\w+\s+severity=\w+\s*-->/g, "")
    .replace(/<!--\s*pi-code-review-terminal\s*-->/g, "")
    .trim();
}
