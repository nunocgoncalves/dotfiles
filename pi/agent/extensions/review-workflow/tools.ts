/**
 * review-workflow tools — the only sanctioned way to post review artifacts to
 * a GitHub PR. Each tool enforces an invariant that the prompt-based skills
 * alone could not (markers always present, one completion signal per round,
 * every finding replied before completion, line findings anchored inline, ...).
 *
 * The LLM does the judgement (smells, agree/disagree, fixes); these tools own
 * the protocol.
 */

import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  countReopenedMarkers,
  findingMarkerState,
  findingMetaTag,
  founderRequiredMarker,
  hasFounderRequiredMarker,
  hasReopenedMarker,
  hasResponseMarker,
  hasReviewMarker,
  parseFindingMeta,
  parseResponseMarker,
  reopenedMarker,
  responseMarker,
  stripMarkers,
  REVIEW_MARKER,
} from "./markers";
import { isAddedLine, parseAddedLines } from "./diff";
import {
  defaultBranch,
  gh,
  listIssueComments,
  listReviewComments,
  listReviewThreads,
  postInlineReviewComment,
  postIssueComment,
  postReviewCommentReply,
  postReviewEvent,
  prDiff,
  prMeta,
  repoSlug,
  resolveReviewThread,
  type ExecOpts,
  type IssueComment,
  type ReviewComment,
  type ReviewThreadInfo,
} from "./github";
import { loadState, saveState, type ReviewState } from "./state";
import { linearFetch, resolveIssueId } from "../linear/client";
import {
  canonicalPath,
  commitContainedIn,
  ensureTicketWorktree,
  inspectWorktree,
  removeTicketWorktree,
  repoIdentity,
  requireTicketWorktree,
  ticketIdFromBranch,
  ticketWorktreePath,
  type WorktreeState,
} from "./worktrees";

// --- small helpers -----------------------------------------------------------

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  details: Record<string, unknown>;
  isError?: boolean;
};

function text(t: string): ToolResult {
  return { content: [{ type: "text", text: t }], details: {} };
}

function err(t: string): ToolResult {
  return { content: [{ type: "text", text: t }], details: {}, isError: true };
}

/**
 * Developer-side workspace gate: replies and response summaries must come from
 * the dedicated ticket worktree at the PR head, never the primary checkout.
 * Legacy branches without a `<TICKET>-` prefix are reported, not blocked.
 */
async function requireAddressWorkspace(
  pi: ExtensionAPI,
  opts: ExecOpts,
  headBranch: string,
  requirement: { action: string; requireHead?: string; requireClean?: boolean },
): Promise<{ ticketId: string; state: WorktreeState } | null> {
  const ticketId = ticketIdFromBranch(headBranch);
  if (!ticketId) return null;
  return { ticketId, ...(await requireTicketWorktree(pi, opts, ticketId, requirement)) };
}

/** Read-only workspace report for review_init; never throws. */
async function workspaceReport(
  pi: ExtensionAPI,
  opts: ExecOpts,
  headBranch: string,
): Promise<Record<string, unknown> | null> {
  const ticketId = ticketIdFromBranch(headBranch);
  if (!ticketId) return null;
  try {
    const identity = await repoIdentity(pi, opts);
    const state = await inspectWorktree(pi, opts, identity, ticketId);
    return {
      ticketId,
      convention: state.expected,
      exists: state.exists,
      linked: state.linked,
      branch: state.branch,
      head: state.head,
      clean: state.clean,
      dirty: state.dirty.slice(0, 5),
      problem: state.problem,
    };
  } catch (e) {
    return { ticketId, error: String((e as Error).message ?? e) };
  }
}

interface PrCheck {
  bucket: "pass" | "fail" | "pending" | "skipping" | "cancel";
  link?: string;
  name: string;
  state: string;
  workflow?: string;
}

interface PrCiResult {
  checks: PrCheck[];
  headSha: string;
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("CI wait aborted."));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new Error("CI wait aborted."));
      },
      { once: true },
    );
  });
}

/**
 * Wait for every check on the current PR head to reach a successful terminal
 * state. A head update restarts the observation window so callers never accept
 * checks from an obsolete commit. Absence of checks is a failure, not a pass.
 */
async function waitForPrCi(
  pi: ExtensionAPI,
  opts: ExecOpts,
  pr: string | number,
): Promise<PrCiResult> {
  const startedAt = Date.now();
  const noChecksDeadline = startedAt + 2 * 60_000;
  const deadline = startedAt + 45 * 60_000;
  let observedHead = "";

  while (Date.now() < deadline) {
    const meta = await prMeta(pi, opts, pr);
    if (meta.headRefOid !== observedHead) observedHead = meta.headRefOid;

    const res = await gh(pi, { ...opts, timeout: 90_000 }, [
      "pr",
      "checks",
      String(meta.number),
      "--json",
      "bucket,link,name,state,workflow",
    ]);
    let checks: PrCheck[] = [];
    if (res.stdout.trim()) {
      try {
        checks = JSON.parse(res.stdout) as PrCheck[];
      } catch {
        throw new Error(`Could not parse CI status for PR #${meta.number}: ${res.stdout.slice(0, 500)}`);
      }
    }
    if (res.code !== 0 && res.code !== 8 && checks.length === 0) {
      throw new Error(`Could not read CI status for PR #${meta.number}: ${(res.stderr || res.stdout).trim()}`);
    }

    if (checks.length === 0) {
      if (Date.now() >= noChecksDeadline) {
        throw new Error(`PR #${meta.number} has no CI checks after two minutes; refusing to treat absence of CI as success.`);
      }
      await wait(10_000, opts.signal);
      continue;
    }

    const failed = checks.filter((check) => check.bucket === "fail" || check.bucket === "cancel");
    if (failed.length > 0) {
      throw new Error(
        `CI failed for PR #${meta.number} at ${meta.headRefOid}: ` +
          failed.map((check) => `${check.name} (${check.state})`).join(", "),
      );
    }

    const pending = checks.filter((check) => check.bucket === "pending");
    if (pending.length > 0) {
      await wait(10_000, opts.signal);
      continue;
    }

    const confirmed = await prMeta(pi, opts, pr);
    if (confirmed.headRefOid !== observedHead) {
      observedHead = confirmed.headRefOid;
      await wait(2_000, opts.signal);
      continue;
    }
    return { checks, headSha: confirmed.headRefOid };
  }

  throw new Error(`Timed out after 45 minutes waiting for CI on PR ${String(pr)}.`);
}

async function assessTicketTraceability(
  ticketId: string,
  signal?: AbortSignal,
): Promise<string[]> {
  try {
    const id = await resolveIssueId(ticketId, signal);
    const data = await linearFetch<{
      issue: {
        identifier: string;
        title: string;
        description?: string | null;
        labels?: { nodes: Array<{ name: string }> };
      } | null;
    }>(
      `query($id: String!) {
        issue(id: $id) {
          identifier title description
          labels { nodes { name } }
        }
      }`,
      { id },
      signal,
    );
    if (!data.issue) return [`Could not inspect ${ticketId}: issue not found.`];

    const description = data.issue.description ?? "";
    const missingSections = [
      "Outcome",
      "Scope",
      "Acceptance criteria",
      "Non-goals",
      "Dependencies",
      "Validation",
      "Production impact",
    ].filter((heading) => !new RegExp(`^##\\s+${heading}\\s*$`, "im").test(description));

    const warnings: string[] = [];
    if (missingSections.length > 0) {
      warnings.push(`Legacy ticket format; missing sections: ${missingSections.join(", ")}.`);
    }

    const labels = (data.issue.labels?.nodes ?? []).map((label) => label.name.toLowerCase());
    const hasProductLink =
      /\b(?:REQ|SCN)-\d+\b/i.test(description) ||
      /\[\[[^\]]+\]\]/.test(description) ||
      /Areas\/ho\//i.test(description) ||
      /obsidian:\/\//i.test(description);
    const hasDefectEvidence =
      labels.includes("bug") &&
      /reproduc|expected behavior|actual behavior|evidence|regression/i.test(description);
    const hasOperationalObligation =
      labels.some((label) => ["infra", "docs"].includes(label)) &&
      /risk|obligation|hardening|runbook|incident|production/i.test(description);

    if (!hasProductLink && !hasDefectEvidence && !hasOperationalObligation) {
      warnings.push(
        "No PRD requirement/scenario link, reproducible defect evidence, or concrete operational obligation detected.",
      );
    }
    return warnings;
  } catch (error) {
    return [
      `Traceability preflight could not inspect Linear: ${error instanceof Error ? error.message : String(error)}`,
    ];
  }
}

const slugCache = new Map<string, string>();

async function getSlug(pi: ExtensionAPI, opts: ExecOpts): Promise<string> {
  let s = slugCache.get(opts.cwd);
  if (!s) {
    s = await repoSlug(pi, opts);
    slugCache.set(opts.cwd, s);
  }
  return s;
}

// --- round / finding computation (source of truth = GitHub markers) ----------

async function summaries(pi: ExtensionAPI, opts: ExecOpts, slug: string, pr: number): Promise<IssueComment[]> {
  const all = await listIssueComments(pi, opts, slug, pr);
  return all
    .filter((c) => hasReviewMarker(c.body))
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

async function responses(pi: ExtensionAPI, opts: ExecOpts, slug: string, pr: number): Promise<IssueComment[]> {
  const all = await listIssueComments(pi, opts, slug, pr);
  return all.filter((c) => hasResponseMarker(c.body));
}

function isPending(summary: IssueComment, resps: IssueComment[]): boolean {
  return !resps.some((r) => parseResponseMarker(r.body)?.reviewSummaryId === String(summary.id));
}

async function pendingSummary(
  pi: ExtensionAPI,
  opts: ExecOpts,
  slug: string,
  pr: number,
): Promise<IssueComment | undefined> {
  const sums = await summaries(pi, opts, slug, pr);
  const resps = await responses(pi, opts, slug, pr);
  return sums.filter((s) => isPending(s, resps)).pop();
}

/** The latest review summary that has no response yet (the one to address). */
async function latestSummary(
  pi: ExtensionAPI,
  opts: ExecOpts,
  slug: string,
  pr: number,
): Promise<IssueComment | undefined> {
  const sums = await summaries(pi, opts, slug, pr);
  return sums[sums.length - 1];
}

interface FindingView {
  id: number;
  path?: string;
  line?: number | null;
  axis?: string;
  severity?: string;
  status: "resolved" | "addressed" | "contested" | "open";
  markerStatus: "addressed" | "contested" | "open";
  nativeResolved: boolean;
  resolved: boolean;
  decision?: string;
  round?: number | null;
  reopenCount?: number;
  founderRequired?: boolean;
  founderDecisionRef?: string;
  founderRequirement?: string;
  body: string;
}

type FindingStatus = "resolved" | "addressed" | "contested" | "open";
/** All findings on the PR (every inline review-marker non-reply comment), with status. */
async function allFindings(
  pi: ExtensionAPI,
  opts: ExecOpts,
  slug: string,
  pr: number,
): Promise<FindingView[]> {
  const sums = await summaries(pi, opts, slug, pr);
  const inline = await listReviewComments(pi, opts, slug, pr);
  const threads = await listReviewThreads(pi, opts, slug, pr);
  const threadsByRoot = new Map(threads.map((thread) => [thread.rootDatabaseId, thread]));
  const out: FindingView[] = [];
  for (const c of inline) {
    if (!hasReviewMarker(c.body) || hasResponseMarker(c.body) || hasReopenedMarker(c.body) || hasFounderRequiredMarker(c.body)) continue;
    if (c.in_reply_to_id) continue;
    const replies = inline.filter((r) => r.in_reply_to_id === c.id);
    const marker = findingMarkerState(replies);
    const nativeResolved = threadsByRoot.get(c.id)?.isResolved === true;
    const status: FindingStatus = nativeResolved ? "resolved" : marker.status;
    const meta = parseFindingMeta(c.body);
    // Round = the first review summary posted at/after the finding.
    let round: number | null = null;
    for (const s of sums) if (s.created_at >= c.created_at) { round = s.id; break; }
    out.push({
      id: c.id,
      path: c.path,
      line: c.line,
      axis: meta.axis,
      severity: meta.severity,
      status,
      markerStatus: marker.status,
      nativeResolved,
      resolved: status === "resolved",
      decision: marker.decision,
      round,
      reopenCount: countReopenedMarkers(replies),
      founderRequired: marker.founderRequired,
      founderDecisionRef: marker.founderDecisionRef,
      founderRequirement: marker.founderRequirement,
      body: stripMarkers(c.body),
    });
  }
  return out;
}

// --- tool registration -------------------------------------------------------

export function registerReviewTools(pi: ExtensionAPI): void {
  // --- review_init ----------------------------------------------------------
  pi.registerTool({
    name: "review_init",
    label: "Review init",
    description:
      "Resolve a GitHub PR for a review-workflow run and detect the current review round (latest + pending summary). Call this FIRST in both code-review and address-review. Returns PR metadata and round state.",
    promptSnippet: "Resolve a PR and detect the current review round",
    promptGuidelines: [
      "Call review_init first when starting a code-review or address-review run on a PR.",
    ],
    parameters: Type.Object({
      pr: Type.String({ description: "PR number or URL" }),
      mode: StringEnum(["review", "address"] as const),
    }),
    async execute(_id, params, signal, _onUpdate, ctx) {
      try {
        const opts: ExecOpts = { cwd: ctx.cwd, signal };
        const ci = params.mode === "review" ? await waitForPrCi(pi, opts, params.pr) : undefined;
        const slug = await getSlug(pi, opts);
        const meta = await prMeta(pi, opts, params.pr);
        const pr = meta.number;
        const sums = await summaries(pi, opts, slug, pr);
        const resps = await responses(pi, opts, slug, pr);
        const latest = sums[sums.length - 1];
        const pending = sums.filter((s) => isPending(s, resps)).pop();

        if (params.mode === "address" && !pending) {
          return err(
            "No pending review summary to address. Either no code-review has run, or the latest review already has a response summary.",
          );
        }

        const st: ReviewState = { pr, mode: params.mode, reviewSummaryId: latest?.id };
        saveState(pi, st);

        const workspace =
          params.mode === "address" ? await workspaceReport(pi, opts, meta.headRefName) : null;

        return text(
          JSON.stringify(
            {
              pr,
              title: meta.title,
              url: meta.url,
              state: meta.state,
              head: meta.headRefName,
              base: meta.baseRefName,
              headSha: meta.headRefOid,
              commits: meta.commits.length,
              reviewSummaries: sums.length,
              latestSummaryId: latest?.id ?? null,
              latestSummaryAt: latest?.created_at ?? null,
              pendingSummaryId: pending?.id ?? null,
              isReReview: sums.length > 0,
              workspace,
              ci: ci
                ? { headSha: ci.headSha, checks: ci.checks.length, status: "passed" }
                : { status: "not-waited-in-address-mode" },
            },
            null,
            2,
          ),
        );
      } catch (e) {
        return err(String((e as Error).message ?? e));
      }
    },
  });

  // --- review_list_findings -------------------------------------------------
  pi.registerTool({
    name: "review_list_findings",
    label: "List review findings",
    description:
      "List ALL review findings on the PR. Status is resolved only when the reviewer has natively resolved the GitHub thread; addressed means the developer replied and the reviewer has not accepted it yet; contested means reviewer pushback needs another developer reply; open means no developer reply. Founder-directed contested findings include founderDecisionRef and the exact founderRequirement. Use in address-review and every re-review.",
    promptSnippet: "List findings + reviewer-owned resolution status",
    promptGuidelines: ["Call review_list_findings to enumerate findings and their status before replying or countering."],
    parameters: Type.Object({
      pr: Type.String({ description: "PR number or URL" }),
      reviewSummaryId: Type.Optional(
        Type.Integer({ description: "Filter to findings of a specific review round. Defaults to all findings." }),
      ),
    }),
    async execute(_id, params, signal, _onUpdate, ctx) {
      try {
        const opts: ExecOpts = { cwd: ctx.cwd, signal };
        const slug = await getSlug(pi, opts);
        const meta = await prMeta(pi, opts, params.pr);
        const pr = meta.number;
        let findings = await allFindings(pi, opts, slug, pr);
        if (params.reviewSummaryId) findings = findings.filter((f) => f.round === params.reviewSummaryId);
        return text(
          JSON.stringify(
            {
              total: findings.length,
              resolved: findings.filter((f) => f.status === "resolved").length,
              addressed: findings.filter((f) => f.status === "addressed").length,
              contested: findings.filter((f) => f.status === "contested").length,
              open: findings.filter((f) => f.status === "open").length,
              findings,
            },
            null,
            2,
          ),
        );
      } catch (e) {
        return err(String((e as Error).message ?? e));
      }
    },
  });

  // --- review_post_finding --------------------------------------------------
  pi.registerTool({
    name: "review_post_finding",
    label: "Post review finding",
    description:
      "Post ONE inline review finding anchored to an added (+) line in the PR diff. Appends the review marker + axis/severity tag. Refuses if a review summary is already pending (findings must be posted before the summary) or if the line is not an added line in the diff (demote such findings to the summary narrative). Use during code-review only.",
    promptSnippet: "Post an inline finding on a changed line",
    promptGuidelines: [
      "Use review_post_finding for every line-specific finding during code-review. Every finding (including questions) must be inline so it can be tracked and replied to.",
    ],
    parameters: Type.Object({
      pr: Type.String({ description: "PR number or URL" }),
      path: Type.String({ description: "File path as it appears in the diff (the b/ side, without the 'b/' prefix)" }),
      line: Type.Integer({ description: "New-file (right-side) line number; must be an added (+) line" }),
      axis: StringEnum(["standards", "spec"] as const),
      severity: StringEnum(["blocker", "major", "minor", "question"] as const, {
        description: "Use 'question' for an open question; phrase the body as a question and prefix with ❓.",
      }),
      body: Type.String({ description: "Finding text (markdown). For severity 'question', prefix with ❓." }),
      commitSha: Type.Optional(Type.String({ description: "Commit id to anchor to. Defaults to the PR head." })),
    }),
    async execute(_id, params, signal, _onUpdate, ctx) {
      try {
        const opts: ExecOpts = { cwd: ctx.cwd, signal };
        const slug = await getSlug(pi, opts);
        const meta = await prMeta(pi, opts, params.pr);
        const pr = meta.number;

        const pending = await pendingSummary(pi, opts, slug, pr);
        if (pending) {
          return err(
            `Review summary #${pending.id} is already posted and pending a response. Findings must be posted BEFORE the summary. Either address the pending review (address-review) or you already finished this round's findings.`,
          );
        }

        const diff = await prDiff(pi, opts, params.pr);
        const map = parseAddedLines(diff);
        if (!isAddedLine(map, params.path, params.line)) {
          const known = [...map.keys()];
          return err(
            `Line ${params.line} of ${params.path} is not an added (+) line in the PR diff. Use an added line, or fold this into the review summary narrative. Files with additions: ${known.join(", ") || "(none)"}.`,
          );
        }

        const body = `${params.body}\n\n${findingMetaTag(params.axis, params.severity)}\n\n${REVIEW_MARKER}`;
        const c = await postInlineReviewComment(
          pi,
          opts,
          slug,
          pr,
          body,
          params.path,
          params.line,
          "RIGHT",
          params.commitSha ?? meta.headRefOid,
        );
        return text(`Posted finding #${c.id} on ${params.path}:${params.line} (${params.axis}/${params.severity}).`);
      } catch (e) {
        return err(String((e as Error).message ?? e));
      }
    },
  });

  // --- review_post_summary --------------------------------------------------
  pi.registerTool({
    name: "review_post_summary",
    label: "Post review summary",
    description:
      "Post the code-review summary as a top-level PR comment and emit the code-review COMPLETION SIGNAL (the review marker). Refuses if a review is already pending (no double review). Line-specific findings must already be posted via review_post_finding; this summary is the narrative, not the findings list. This is the start trigger for address-review.",
    promptSnippet: "Finish code-review by posting the summary (completion signal)",
    promptGuidelines: [
      "Finish a code-review round with review_post_summary only after all line findings are posted.",
      "review_post_summary is the code-review completion signal; do not call it twice in one round.",
    ],
    parameters: Type.Object({
      pr: Type.String({ description: "PR number or URL" }),
      verdict: Type.Optional(Type.String({ description: "One-line verdict: totals + worst finding per axis." })),
      standardsReport: Type.String({ description: "The ## Standards section content (markdown)." }),
      specReport: Type.String({ description: "The ## Spec section content (markdown)." }),
      openQuestionCount: Type.Optional(
        Type.Integer({ description: "Number of inline ❓ question findings, if any." }),
      ),
    }),
    async execute(_id, params, signal, _onUpdate, ctx) {
      try {
        const opts: ExecOpts = { cwd: ctx.cwd, signal };
        const slug = await getSlug(pi, opts);
        const meta = await prMeta(pi, opts, params.pr);
        const pr = meta.number;

        const pending = await pendingSummary(pi, opts, slug, pr);
        if (pending) {
          return err(
            `Review summary #${pending.id} is already pending a response. Address it (address-review) before starting a new review round.`,
          );
        }

        const parts: string[] = [];
        if (params.verdict) parts.push(params.verdict);
        parts.push(`## Standards\n\n${params.standardsReport}`);
        parts.push(`## Spec\n\n${params.specReport}`);
        const oq = params.openQuestionCount ?? 0;
        parts.push(
          `## Open questions\n\n${oq > 0 ? `${oq} inline ❓ findings — see review threads.` : "None."}`,
        );
        const body = `${parts.join("\n\n")}\n\n${REVIEW_MARKER}`;

        const c = await postIssueComment(pi, opts, slug, pr, body);
        saveState(pi, { pr, mode: "review", reviewSummaryId: c.id });
        return text(
          `Posted review summary #${c.id}. This is the code-review completion signal — address-review may now start. No threads were resolved automatically; reviewer acceptance remains explicit.`,
        );
      } catch (e) {
        return err(String((e as Error).message ?? e));
      }
    },
  });

  // --- review_post_reply ----------------------------------------------------
  pi.registerTool({
    name: "review_post_reply",
    label: "Reply to a finding",
    description:
      "Reply in-thread to ONE review finding with a developer decision (fixed|partial|disagreed|answered). The reply marks the finding addressed, never resolved: only the reviewer may resolve its GitHub thread after re-review. Refuses duplicate replies. Use during address-review for every finding, including ❓ questions.",
    promptSnippet: "Reply in-thread to a finding with a decision",
    promptGuidelines: [
      "Reply to every open/contested finding with review_post_reply before calling review_post_response_summary.",
      "Use decision='answered' for ❓ questions, 'fixed'/'partial'/'disagreed' for findings.",
    ],
    parameters: Type.Object({
      pr: Type.String({ description: "PR number or URL" }),
      findingCommentId: Type.Integer({ description: "The inline finding comment id to reply to." }),
      decision: StringEnum(["fixed", "partial", "disagreed", "answered"] as const),
      body: Type.String({ description: "Reply text (markdown). For 'fixed'/'partial', reference the fix. For 'disagreed', cite a spec line or an approved rescope (Spec) or an overriding repo standard (Standards)." }),
      commitSha: Type.Optional(Type.String({ description: "Commit sha containing the fix, for 'fixed'/'partial'." })),
    }),
    async execute(_id, params, signal, _onUpdate, ctx) {
      try {
        const opts: ExecOpts = { cwd: ctx.cwd, signal };
        const slug = await getSlug(pi, opts);
        const meta = await prMeta(pi, opts, params.pr);
        const pr = meta.number;

        const workspace = await requireAddressWorkspace(pi, opts, meta.headRefName, {
          action: "review_post_reply",
          requireHead: meta.headRefOid,
        });
        if (workspace && params.commitSha && (params.decision === "fixed" || params.decision === "partial")) {
          const contained = await commitContainedIn(
            pi,
            { cwd: workspace.state.path, signal },
            params.commitSha,
            workspace.state.head,
          );
          if (!contained) {
            return err(
              `commitSha ${params.commitSha} is not contained in the ticket worktree HEAD ${workspace.state.head.slice(0, 12)} ` +
                `(${workspace.state.path}). Commit and push the fix there before replying.`,
            );
          }
        }

        const inline = await listReviewComments(pi, opts, slug, pr);
        const finding = inline.find((c) => c.id === params.findingCommentId);
        if (!finding) return err(`Finding #${params.findingCommentId} not found on PR #${pr}.`);
        if (!hasReviewMarker(finding.body) || hasResponseMarker(finding.body) || hasReopenedMarker(finding.body)) {
          return err(`#${params.findingCommentId} is not a review finding (missing review marker).`);
        }

        const replies = inline.filter((c) => c.in_reply_to_id === params.findingCommentId);
        const markerState = findingMarkerState(replies);
        if (markerState.status === "addressed") {
          return err(
            `Finding #${params.findingCommentId} already has a developer response awaiting reviewer acceptance. ` +
              `Do not post a duplicate or resolve the thread.`,
          );
        }

        const pending = await pendingSummary(pi, opts, slug, pr);
        if (!pending) {
          return err("No pending review summary to respond to. Run code-review (review_post_summary) first.");
        }

        const marker = responseMarker(pending.id, params.decision, params.commitSha);
        const body = `${params.body}\n\n${marker}`;
        const c = await postReviewCommentReply(pi, opts, slug, pr, params.findingCommentId, body);
        return text(
          `Replied to finding #${params.findingCommentId} (decision=${params.decision}) as #${c.id}. ` +
            `The thread remains open until the reviewer verifies and resolves it.`,
        );
      } catch (e) {
        return err(String((e as Error).message ?? e));
      }
    },
  });

  // --- review_post_counter -------------------------------------------------
  pi.registerTool({
    name: "review_post_counter",
    label: "Counter a disagreement",
    description:
      "Reviewer pushback on an addressed finding the developer marked disagreed, partial, fixed, or answered. Posts a reopened marker, making the finding contested so the developer must reply again. Refuses if there is no developer response, the reviewer already resolved it, or the finding has reached the stalemate limit.",
    promptSnippet: "Reopen a finding the dev disagreed with (push back)",
    promptGuidelines: [
      "On re-review, if a `disagreed` finding is still valid (dev cited no spec/approval), push back with review_post_counter — do not silently concede.",
      "If a finding has already been disputed twice, do not counter again: escalate to the user in the summary.",
    ],
    parameters: Type.Object({
      pr: Type.String({ description: "PR number or URL" }),
      findingCommentId: Type.Integer({ description: "The inline finding comment id to reopen." }),
      body: Type.String({ description: "Counter-argument (markdown): cite the spec line or repo standard that upholds the finding; explain why the disagreement doesn't hold." }),
    }),
    async execute(_id, params, signal, _onUpdate, ctx) {
      try {
        const opts: ExecOpts = { cwd: ctx.cwd, signal };
        const slug = await getSlug(pi, opts);
        const meta = await prMeta(pi, opts, params.pr);
        const pr = meta.number;

        const inline = await listReviewComments(pi, opts, slug, pr);
        const finding = inline.find((c) => c.id === params.findingCommentId);
        if (!finding) return err(`Finding #${params.findingCommentId} not found on PR #${pr}.`);
        if (!hasReviewMarker(finding.body) || hasResponseMarker(finding.body) || hasReopenedMarker(finding.body)) {
          return err(`#${params.findingCommentId} is not a review finding (missing review marker).`);
        }

        const replies = inline.filter((c) => c.in_reply_to_id === params.findingCommentId);
        const marker = findingMarkerState(replies);
        const threads = await listReviewThreads(pi, opts, slug, pr);
        const nativeResolved = threads.find((thread) => thread.rootDatabaseId === params.findingCommentId)?.isResolved === true;
        if (nativeResolved) {
          return err(`Finding #${params.findingCommentId} was already accepted and resolved by the reviewer.`);
        }
        if (marker.status === "contested") {
          return err(`Finding #${params.findingCommentId} is already contested (reopened). Wait for the developer to reply again.`);
        }
        if (marker.status === "open") {
          return err(`Finding #${params.findingCommentId} has no developer reply yet; there is no disagreement to counter.`);
        }
        // marker.status === "addressed"
        const reopenCount = countReopenedMarkers(replies);
        if (reopenCount >= 2) {
          return err(
            `Finding #${params.findingCommentId} has already been disputed ${reopenCount} times (stalemate). ` +
              `Do NOT counter again — escalate to the user in the review summary (both positions) for a decision.`,
          );
        }

        const findings = await allFindings(pi, opts, slug, pr);
        const view = findings.find((f) => f.id === params.findingCommentId);
        const reviewId = view?.round ?? (await latestSummary(pi, opts, slug, pr))?.id ?? 0;

        const reopenMarker = reopenedMarker(reviewId, reopenCount + 1);
        const body = `${params.body}\n\n${reopenMarker}`;
        const c = await postReviewCommentReply(pi, opts, slug, pr, params.findingCommentId, body);
        return text(`Reopened finding #${params.findingCommentId} (dispute round ${reopenCount + 1}) as #${c.id}. The developer must reply again.`);
      } catch (e) {
        return err(String((e as Error).message ?? e));
      }
    },
  });

  // --- review_require_correction ------------------------------------------
  pi.registerTool({
    name: "review_require_correction",
    label: "Apply founder-required correction",
    description:
      "Reviewer-only transition after a finding reaches the two-counter stalemate limit and the founder durably requires correction. Posts a distinct marker that makes the existing finding developer-actionable without incrementing the dispute count or creating a duplicate finding.",
    promptSnippet: "Route a founder-required correction back to the developer",
    promptGuidelines: [
      "Use only after the founder durably requires correction and the decision is recorded in Linear or Obsidian.",
      "Do not use for an ordinary reviewer counter or before the two-counter stalemate limit.",
    ],
    parameters: Type.Object({
      pr: Type.String({ description: "PR number or URL" }),
      findingCommentId: Type.Integer({ description: "The existing inline finding comment id requiring correction." }),
      decisionRef: Type.String({ description: "Stable Linear/Obsidian reference for the founder decision." }),
      body: Type.String({ description: "Exact correction the founder requires, with the governing evidence." }),
    }),
    async execute(_id, params, signal, _onUpdate, ctx) {
      try {
        const st = loadState(ctx);
        if (st?.mode !== "review") return err("Only a reviewer-mode session may apply a founder-required correction.");
        if (!params.decisionRef.trim()) return err("A durable founder decision reference is required.");

        const opts: ExecOpts = { cwd: ctx.cwd, signal };
        const slug = await getSlug(pi, opts);
        const meta = await prMeta(pi, opts, params.pr);
        const pr = meta.number;
        const inline = await listReviewComments(pi, opts, slug, pr);
        const finding = inline.find((c) => c.id === params.findingCommentId);
        if (!finding) return err(`Finding #${params.findingCommentId} not found on PR #${pr}.`);
        if (!hasReviewMarker(finding.body) || hasResponseMarker(finding.body) || hasReopenedMarker(finding.body) || hasFounderRequiredMarker(finding.body)) {
          return err(`#${params.findingCommentId} is not a review finding (missing review marker).`);
        }

        const replies = inline.filter((c) => c.in_reply_to_id === params.findingCommentId);
        const marker = findingMarkerState(replies);
        const threads = await listReviewThreads(pi, opts, slug, pr);
        const nativeResolved = threads.find((thread) => thread.rootDatabaseId === params.findingCommentId)?.isResolved === true;
        if (nativeResolved) return err(`Finding #${params.findingCommentId} was already accepted and resolved by the reviewer.`);
        if (marker.status === "contested") {
          return err(`Finding #${params.findingCommentId} is already developer-actionable. Wait for the developer to reply.`);
        }
        if (marker.status === "open") {
          return err(`Finding #${params.findingCommentId} has no developer reply; use the ordinary address-review flow.`);
        }

        const reopenCount = countReopenedMarkers(replies);
        if (reopenCount < 2) {
          return err(
            `Finding #${params.findingCommentId} has only ${reopenCount} reviewer counter(s). ` +
              `Use review_post_counter until the two-counter stalemate limit is reached.`,
          );
        }

        const sums = await summaries(pi, opts, slug, pr);
        const resps = await responses(pi, opts, slug, pr);
        const pending = sums.filter((summary) => isPending(summary, resps)).pop();
        if (!pending) {
          return err("A founder-required correction must be attached to the pending review round.");
        }

        const directiveMarker = founderRequiredMarker(pending.id, params.decisionRef.trim());
        const body = `${params.body}\n\nFounder decision: ${params.decisionRef.trim()}\n\n${directiveMarker}`;
        const c = await postReviewCommentReply(pi, opts, slug, pr, params.findingCommentId, body);
        return text(
          `Applied founder-required correction to finding #${params.findingCommentId} as #${c.id}. ` +
            `The finding is developer-actionable and the ordinary dispute count remains ${reopenCount}.`,
        );
      } catch (e) {
        return err(String((e as Error).message ?? e));
      }
    },
  });

  // --- review_post_response_summary ----------------------------------------
  pi.registerTool({
    name: "review_post_response_summary",
    label: "Post response summary",
    description:
      "THE DEVELOPER GATE. Wait for CI on the current PR head, then post the address-review response summary. Refuses if any finding lacks a developer reply or a response summary already exists. This marks the PR ready for reviewer re-review; it never resolves threads or marks the review final.",
    promptSnippet: "Finish address-review (gated on all findings replied)",
    promptGuidelines: [
      "Call review_post_response_summary only after review_post_reply has been called on every finding.",
      "review_post_response_summary is the address-review completion signal; it refuses if any finding is unreplied.",
    ],
    parameters: Type.Object({
      pr: Type.String({ description: "PR number or URL" }),
      reviewSummaryId: Type.Optional(
        Type.Integer({ description: "The review summary to respond to. Defaults to the latest pending." }),
      ),
      notes: Type.Optional(Type.String({ description: "Extra notes to include in the response summary." })),
    }),
    async execute(_id, params, signal, _onUpdate, ctx) {
      try {
        const opts: ExecOpts = { cwd: ctx.cwd, signal };
        const slug = await getSlug(pi, opts);
        const meta = await prMeta(pi, opts, params.pr);
        const pr = meta.number;

        const workspace = await requireAddressWorkspace(pi, opts, meta.headRefName, {
          action: "review_post_response_summary",
          requireHead: meta.headRefOid,
        });

        const sums = await summaries(pi, opts, slug, pr);
        const resps = await responses(pi, opts, slug, pr);
        const summary = params.reviewSummaryId
          ? sums.find((s) => s.id === params.reviewSummaryId)
          : sums.filter((s) => isPending(s, resps)).pop();
        if (!summary) return err("No pending review summary to respond to.");

        if (!isPending(summary, resps)) {
          return err(`Review #${summary.id} already has a response summary. Not posting a duplicate.`);
        }

        const ci = await waitForPrCi(pi, opts, pr);
        if (workspace) {
          await requireTicketWorktree(pi, opts, workspace.ticketId, {
            action: "review_post_response_summary",
            requireHead: ci.headSha,
          });
        }
        const findings = await allFindings(pi, opts, slug, pr);
        const counts = { fixed: 0, partial: 0, disagreed: 0, answered: 0, unresolved: 0 };
        const unresolved: Array<{ id: number; path?: string; line?: number | null; status?: string }> = [];
        for (const f of findings) {
          if (f.status === "open" || f.status === "contested") {
            counts.unresolved++;
            unresolved.push({ id: f.id, path: f.path, line: f.line, status: f.status });
            continue;
          }
          if (f.decision && f.decision in counts) (counts as Record<string, number>)[f.decision]++;
        }

        if (counts.unresolved > 0) {
          return err(
            `${counts.unresolved} finding(s) are not resolved (status: open = no reply yet; contested = reviewer reopened it, needs your reply). ` +
              `Call review_post_reply on each before posting the response summary.\n${JSON.stringify(unresolved)}`,
          );
        }

        const body =
          `## Review response\n\n` +
          `- Fixed: ${counts.fixed}\n` +
          `- Partial: ${counts.partial}\n` +
          `- Disagreed: ${counts.disagreed}\n` +
          `- Questions answered: ${counts.answered}\n\n` +
          `- CI: passed at ${ci.headSha} (${ci.checks.length} checks)\n` +
          (workspace ? `- Ticket worktree: ${workspace.state.path} @ ${ci.headSha.slice(0, 12)}\n` : "") +
          `\n` +
          `${params.notes ? params.notes + "\n\n" : ""}` +
          `Ready for re-review.\n\n` +
          responseMarker(summary.id);

        const c = await postIssueComment(pi, opts, slug, pr, body);
        saveState(pi, { pr, mode: "address", reviewSummaryId: summary.id });
        return text(
          `Posted response summary #${c.id} for review #${summary.id} after CI passed at ${ci.headSha}. ` +
            `A reviewer re-review may now start; no thread was resolved and no final marker was emitted.`,
        );
      } catch (e) {
        return err(String((e as Error).message ?? e));
      }
    },
  });

  // --- review_post_verdict --------------------------------------------------
  pi.registerTool({
    name: "review_post_verdict",
    label: "Post review verdict",
    description:
      "Optionally post a formal GitHub review state (approve|request_changes|comment) via gh pr review. Provides a machine-readable blocking signal for the workflow state machine. Separate from the summary; call after review_post_summary if a verdict is wanted.",
    promptSnippet: "Post an approve / request-changes review state",
    parameters: Type.Object({
      pr: Type.String({ description: "PR number or URL" }),
      event: StringEnum(["approve", "request_changes", "comment"] as const),
      body: Type.Optional(Type.String({ description: "Optional review body." })),
    }),
    async execute(_id, params, signal, _onUpdate, ctx) {
      try {
        const opts: ExecOpts = { cwd: ctx.cwd, signal };
        await postReviewEvent(pi, opts, params.pr, params.event, params.body);
        return text(`Posted review verdict: ${params.event}.`);
      } catch (e) {
        return err(String((e as Error).message ?? e));
      }
    },
  });

  // --- review_mark_terminal -------------------------------------------------
  pi.registerTool({
    name: "review_mark_terminal",
    label: "Mark review loop terminal",
    description:
      "Reviewer-only finalization. Post the terminal marker only after the reviewer explicitly concludes the review is final, CI passed for the current head, no new findings or questions remain, and every prior thread has been explicitly resolved by the reviewer. Zero new findings alone is not sufficient.",
    promptSnippet: "Reviewer explicitly marks the fully resolved review final",
    parameters: Type.Object({
      pr: Type.String({ description: "PR number or URL" }),
      reviewSummaryId: Type.Optional(Type.Integer({ description: "The round that found nothing. Defaults to latest." })),
      final: Type.Boolean({ description: "Must be true only when the reviewer explicitly concludes this review is final; zero findings alone does not imply final." }),
    }),
    async execute(_id, params, signal, _onUpdate, ctx) {
      try {
        const opts: ExecOpts = { cwd: ctx.cwd, signal };
        const slug = await getSlug(pi, opts);
        const meta = await prMeta(pi, opts, params.pr);
        const pr = meta.number;
        const st = loadState(ctx);
        if (st?.mode !== "review") return err("Only a reviewer-mode session may mark a review terminal.");
        if (params.final !== true) return err("Review not marked final. Post a non-terminal summary or report the remaining decision instead.");
        const sums = await summaries(pi, opts, slug, pr);
        const summary = params.reviewSummaryId
          ? sums.find((s) => s.id === params.reviewSummaryId)
          : sums[sums.length - 1];
        if (params.reviewSummaryId && !summary) return err(`Review summary #${params.reviewSummaryId} was not found.`);

        const findings = await allFindings(pi, opts, slug, pr);
        const unresolved = findings.filter((f) => f.status !== "resolved");
        if (unresolved.length > 0) {
          return err(
            `${unresolved.length} finding(s) are not reviewer-resolved. The reviewer must verify each addressed reply and explicitly resolve accepted threads before finalization.\n${JSON.stringify(unresolved.map((f) => ({ id: f.id, status: f.status })))}`,
          );
        }

        const ci = await waitForPrCi(pi, opts, pr);
        const reviewRef = summary?.id ?? "initial";
        const body = `## Review complete\n\nNo findings, no open questions — the reviewer explicitly concludes the review loop has converged for ${ci.headSha}. Ready to merge (per AGENTS.md, only the user merges).\n\n<!-- pi-code-review-terminal review=${reviewRef} -->`;
        const c = await postIssueComment(pi, opts, slug, pr, body);
        return text(`Posted reviewer-owned terminal marker #${c.id} after CI passed at ${ci.headSha}. The review loop is complete.`);
      } catch (e) {
        return err(String((e as Error).message ?? e));
      }
    },
  });

  // --- review_resolve_thread ---------------------------------------------
  pi.registerTool({
    name: "review_resolve_thread",
    label: "Resolve review thread",
    description:
      "Reviewer-only acceptance action. Natively resolve a GitHub review thread after the reviewer has independently verified the fix, answer, disagreement, or withdrawal. Developers and address-review sessions cannot call it. Idempotent and paginated.",
    promptSnippet: "Reviewer accepts and resolves one verified finding",
    promptGuidelines: [
      "Call only from reviewer mode after independently verifying the developer response. Never resolve from address-review.",
    ],
    parameters: Type.Object({
      pr: Type.String({ description: "PR number or URL" }),
      findingCommentId: Type.Integer({ description: "The inline finding comment id whose thread to resolve." }),
    }),
    async execute(_id, params, signal, _onUpdate, ctx) {
      try {
        const opts: ExecOpts = { cwd: ctx.cwd, signal };
        const st = loadState(ctx);
        if (st?.mode !== "review") return err("Only a reviewer-mode session may resolve review threads.");
        const slug = await getSlug(pi, opts);
        const meta = await prMeta(pi, opts, params.pr);
        const pr = meta.number;
        const threads: ReviewThreadInfo[] = await listReviewThreads(pi, opts, slug, pr);
        const thread = threads.find((t) => t.rootDatabaseId === params.findingCommentId);
        if (!thread) {
          return err(
            `No review thread found for comment #${params.findingCommentId}. It may be deleted, or the comment is not a thread root.`,
          );
        }
        if (thread.isResolved) {
          return text(`Thread for finding #${params.findingCommentId} is already resolved.`);
        }
        await resolveReviewThread(pi, opts, thread.id);
        return text(`Resolved GitHub thread for finding #${params.findingCommentId}.`);
      } catch (e) {
        return err(String((e as Error).message ?? e));
      }
    },
  });

  // --- review_reconcile_threads ------------------------------------------
  pi.registerTool({
    name: "review_reconcile_threads",
    label: "Audit GH thread state",
    description:
      "Read-only audit of developer response state and reviewer-owned GitHub thread resolution. Reports findings awaiting the developer, awaiting reviewer verification, and explicitly resolved by the reviewer. Automatic reconciliation is intentionally disabled so address-review cannot resolve comments or manufacture convergence.",
    promptSnippet: "Audit developer responses and reviewer resolutions",
    promptGuidelines: [
      "Use this read-only audit before acceptance or final review. Resolve accepted findings individually with review_resolve_thread from reviewer mode.",
    ],
    parameters: Type.Object({
      pr: Type.String({ description: "PR number or URL" }),
      fix: Type.Optional(
        Type.Boolean({
          description: "Deprecated. Must be false or omitted; automatic thread mutation is disabled.",
        }),
      ),
    }),
    async execute(_id, params, signal, _onUpdate, ctx) {
      try {
        const opts: ExecOpts = { cwd: ctx.cwd, signal };
        const slug = await getSlug(pi, opts);
        const meta = await prMeta(pi, opts, params.pr);
        const pr = meta.number;
        if (params.fix === true) {
          return err(
            "Automatic thread reconciliation is disabled. The reviewer must verify and resolve each accepted finding explicitly with review_resolve_thread.",
          );
        }

        const findings = await allFindings(pi, opts, slug, pr);
        const threads = await listReviewThreads(pi, opts, slug, pr);

        return text(
          JSON.stringify(
            {
              pr,
              totalFindings: findings.length,
              awaitingDeveloper: findings.filter((f) => f.status === "open" || f.status === "contested").map((f) => f.id),
              awaitingReviewer: findings.filter((f) => f.status === "addressed").map((f) => f.id),
              reviewerResolved: findings.filter((f) => f.status === "resolved").map((f) => f.id),
              totalThreads: threads.length,
              nativeResolvedThreads: threads.filter((t) => t.isResolved).length,
            },
            null,
            2,
          ),
        );
      } catch (e) {
        return err(String((e as Error).message ?? e));
      }
    },
  });

  // --- worktree_ensure ------------------------------------------------------
  pi.registerTool({
    name: "worktree_ensure",
    label: "Ensure ticket worktree",
    description:
      "Create or reuse the dedicated linked git worktree for a Linear ticket at <root>/<repo>/<TICKET> (<root> = PI_WORKTREE_ROOT or ~/Developer/worktrees) and check out its <TICKET>-<description> branch there. All ticket edits, commands, commits, and pushes must use that absolute path, never the primary checkout. Idempotent: reuse never resets or discards existing work.",
    promptSnippet: "Create or reuse the dedicated ticket worktree",
    promptGuidelines: [
      "Call worktree_ensure before any ticket edit and use the returned absolute path for reads, edits, commands, commits, and pushes.",
      "Never implement, commit, or push ticket work in the primary checkout.",
    ],
    parameters: Type.Object({
      ticketId: Type.String({ description: "Linear identifier, e.g. HOR-123" }),
      branch: Type.Optional(
        Type.String({
          description:
            "Branch to check out (<TICKET>-<description>). Defaults to the single existing matching branch; required when no matching branch exists yet.",
        }),
      ),
      base: Type.Optional(
        Type.String({ description: "Base branch for a newly created ticket branch. Defaults to the repository default branch." }),
      ),
    }),
    async execute(_id, params, signal, _onUpdate, ctx) {
      try {
        const result = await ensureTicketWorktree(
          pi,
          { cwd: ctx.cwd, signal },
          params.ticketId,
          params.branch,
          params.base,
        );
        const { state, identity } = result;
        return text(
          `${result.created ? "Created" : "Reusing"} ticket worktree: ${state.path}\n` +
            `Branch: ${state.branch} @ ${state.head.slice(0, 12) || "(no commits yet)"}\n` +
            `Working tree: ${state.clean ? "clean" : `dirty (${state.dirty.length}): ${state.dirty.slice(0, 5).join("; ")}`}\n` +
            `Primary checkout (never use for ticket work): ${identity.primaryRoot}\n\n` +
            `Use absolute paths under ${state.path} for every read, edit, command, commit, and push (or git -C ${state.path} ...).`,
        );
      } catch (e) {
        return err(String((e as Error).message ?? e));
      }
    },
  });

  // --- worktree_remove ------------------------------------------------------
  pi.registerTool({
    name: "worktree_remove",
    label: "Remove ticket worktree",
    description:
      "Remove the dedicated ticket worktree after merge/acceptance and prune stale worktree metadata. Refuses a dirty worktree unless force=true. The ticket branch is not deleted.",
    promptSnippet: "Remove the ticket worktree after acceptance",
    promptGuidelines: [
      "Remove the ticket worktree only after the ticket is done (merge/acceptance), never mid-implementation.",
    ],
    parameters: Type.Object({
      ticketId: Type.String({ description: "Linear identifier, e.g. HOR-123" }),
      force: Type.Optional(
        Type.Boolean({ description: "Discard uncommitted changes in the worktree (default false)." }),
      ),
    }),
    async execute(_id, params, signal, _onUpdate, ctx) {
      try {
        const result = await removeTicketWorktree(
          pi,
          { cwd: ctx.cwd, signal },
          params.ticketId,
          params.force === true,
        );
        return text(
          result.removed
            ? `Removed ticket worktree ${result.state.path} (branch ${result.state.branch} kept). Stale worktree metadata pruned.`
            : `No ticket worktree at ${result.state.path}; stale worktree metadata pruned.`,
        );
      } catch (e) {
        return err(String((e as Error).message ?? e));
      }
    },
  });

  // --- open_pr --------------------------------------------------------------
  pi.registerTool({
    name: "open_pr",
    label: "Open PR",
    description:
      "Open a pull request for a Linear-ticket branch following AGENTS.md conventions, then wait for every CI check on the created head to pass before returning success. Absence, failure, cancellation, timeout, or a newer unchecked head blocks completion. Does NOT merge. After success, move the Linear ticket to In Review.",
    promptSnippet: "Open a convention-correct, traceable PR for a Linear ticket",
    promptGuidelines: [
      "Use open_pr (not raw gh pr create) when opening a PR for a Linear ticket; review any traceability warnings it returns.",
    ],
    parameters: Type.Object({
      ticketId: Type.String({ description: "Linear identifier, e.g. HOR-123" }),
      title: Type.String({ description: "PR title text WITHOUT the ticket prefix; the tool prepends 'HOR-123 — '." }),
      summary: Type.String({ description: "## Summary content (markdown bullets)." }),
      validation: Type.String({ description: "## Validation content (markdown bullets). Mark N/A as 'None'." }),
      productionImpact: Type.String({ description: "## Production impact content. Mark N/A as 'None'." }),
      ticketState: Type.String({ description: "## Ticket state content (markdown bullets)." }),
      base: Type.Optional(Type.String({ description: "Base branch. Defaults to the repo default branch." })),
      push: Type.Optional(
        Type.Boolean({ description: "Push the worktree branch with -u origin HEAD when it differs from origin (default true)." }),
      ),
      worktree: Type.Optional(
        Type.String({ description: "Absolute ticket worktree path from worktree_ensure. Defaults to the convention path." }),
      ),
    }),
    async execute(_id, params, signal, _onUpdate, ctx) {
      const cwd = ctx.cwd;
      try {
        // Boundary: a PR is opened from the dedicated ticket worktree, never the
        // primary checkout. Its HEAD is the commit that must reach CI.
        const identity = await repoIdentity(pi, { cwd, signal });
        const expectedWorktree = ticketWorktreePath(identity, params.ticketId);
        if (params.worktree && canonicalPath(params.worktree) !== expectedWorktree) {
          return err(
            `worktree='${params.worktree}' is not the convention path for ${params.ticketId}. Expected ${expectedWorktree}. ` +
              `Call worktree_ensure(ticketId="${params.ticketId}") and pass the path it returns.`,
          );
        }
        const { state: wt } = await requireTicketWorktree(pi, { cwd, signal }, params.ticketId, {
          action: "open_pr",
          requireClean: true,
        });
        const repoOpts: ExecOpts = { cwd: wt.path, signal };
        const branch = wt.branch;
        const head = wt.head;

        // Migration-safe: surface legacy ticket drift without blocking PRs whose
        // scope is otherwise ready. The skill owns judgment; the tool guarantees
        // the warning is run and preserved in the PR body.
        const traceabilityWarnings = await assessTicketTraceability(params.ticketId, signal);

        const remoteHead = (
          await pi.exec("git", ["rev-parse", "--verify", "--quiet", `refs/remotes/origin/${branch}`], repoOpts)
        ).stdout.trim();
        if (params.push !== false) {
          if (remoteHead !== head) {
            const pushRes = await pi.exec("git", ["push", "-u", "origin", "HEAD"], {
              ...repoOpts,
              timeout: 60_000,
            });
            if (pushRes.code !== 0) return err(`git push failed: ${pushRes.stderr}`);
            const pushed = (
              await pi.exec("git", ["rev-parse", "--verify", "--quiet", `refs/remotes/origin/${branch}`], repoOpts)
            ).stdout.trim();
            if (pushed !== head) {
              return err(
                `origin/${branch} is ${pushed.slice(0, 12) || "(missing)"} but the ticket worktree HEAD is ${head.slice(0, 12)}. ` +
                  `Push the worktree branch explicitly (git -C ${wt.path} push -u origin HEAD) and retry.`,
              );
            }
          }
        } else if (remoteHead !== head) {
          return err(
            `origin/${branch} is ${remoteHead.slice(0, 12) || "(missing)"} but the ticket worktree HEAD is ${head.slice(0, 12)}. ` +
              `Push it before opening the PR (push=true).`,
          );
        }

        const base = params.base ?? (await defaultBranch(pi, repoOpts));
        const title = `${params.ticketId} — ${params.title}`;
        const traceabilityBlock =
          traceabilityWarnings.length === 0
            ? ""
            : "\n\n### Traceability warnings\n\n" +
              traceabilityWarnings.map((warning) => `- ${warning}`).join("\n");
        const body =
          `## Summary\n\n${params.summary}\n\n` +
          `## Validation\n\n${params.validation}\n\n` +
          `## Production impact\n\n${params.productionImpact}\n\n` +
          `## Ticket state\n\n${params.ticketState}${traceabilityBlock}\n`;

        const dir = mkdtempSync(join(tmpdir(), "pi-rw-"));
        const file = join(dir, "body.md");
        writeFileSync(file, body);
        try {
          const res = await gh(pi, repoOpts, [
            "pr",
            "create",
            "--base",
            base,
            "--head",
            branch,
            "--title",
            title,
            "--body-file",
            file,
          ]);
          if (res.code !== 0) return err(`gh pr create failed: ${res.stderr}`);
          const prUrl = res.stdout.trim();
          const ci = await waitForPrCi(pi, repoOpts, prUrl);
          if (ci.headSha !== head) {
            return err(
              `The PR head ${ci.headSha.slice(0, 12)} is not the ticket worktree HEAD ${head.slice(0, 12)}. ` +
                `Push the worktree commit (git -C ${wt.path} push origin HEAD) and retry.`,
            );
          }
          const warningText =
            traceabilityWarnings.length === 0
              ? "Traceability preflight: passed."
              : `Traceability preflight warnings:\n- ${traceabilityWarnings.join("\n- ")}`;
          return {
            content: [
              {
                type: "text",
                text:
                  `Created PR: ${prUrl}\nTitle: ${title}\nBase: ${base} ← ${branch}\n` +
                  `Ticket worktree: ${wt.path} @ ${head.slice(0, 12)}\n` +
                  `CI: passed at ${ci.headSha} (${ci.checks.length} checks).\n` +
                  `${warningText}\n\nNext: call linear_list_teams then linear_update_issue to move ${params.ticketId} to In Review.`,
              },
            ],
            details: { traceabilityWarnings, ci, worktree: wt.path },
          };
        } finally {
          rmSync(dir, { recursive: true, force: true });
        }
      } catch (e) {
        return err(String((e as Error).message ?? e));
      }
    },
  });
}
