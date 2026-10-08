/**
 * Thin helpers over the GitHub CLI (`gh`) via host.exec. All review-artifact
 * writes go through here so the review-workflow tools control markers and ids.
 */

import type { Host } from "../lib/host.ts";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface ExecOpts {
  cwd: string;
  timeout?: number;
  signal?: AbortSignal;
}

export interface GhResult {
  code: number;
  stdout: string;
  stderr: string;
}

export async function gh(host: Host, opts: ExecOpts, args: string[]): Promise<GhResult> {
  const res = await host.exec("gh", args, {
    cwd: opts.cwd,
    timeout: opts.timeout ?? 90_000,
    signal: opts.signal,
  });
  return { code: res.code, stdout: res.stdout, stderr: res.stderr };
}

async function ghJson<T>(host: Host, opts: ExecOpts, args: string[]): Promise<T> {
  const res = await gh(host, opts, args);
  if (res.code !== 0) {
    throw new Error(`gh ${args.join(" ")} failed (code ${res.code}): ${(res.stderr || res.stdout).trim()}`);
  }
  try {
    return JSON.parse(res.stdout) as T;
  } catch {
    throw new Error(`gh ${args.join(" ")} returned non-JSON output: ${res.stdout.slice(0, 500)}`);
  }
}

export async function repoSlug(host: Host, opts: ExecOpts): Promise<string> {
  const r = await ghJson<{ nameWithOwner: string }>(host, opts, ["repo", "view", "--json", "nameWithOwner"]);
  return r.nameWithOwner;
}

export async function defaultBranch(host: Host, opts: ExecOpts): Promise<string> {
  const r = await ghJson<{ defaultBranchRef: { name: string } }>(host, opts, [
    "repo",
    "view",
    "--json",
    "defaultBranchRef",
  ]);
  return r.defaultBranchRef.name;
}

export function normalizePr(pr: string | number): string {
  const s = String(pr).trim();
  const m = s.match(/\/pull\/(\d+)/);
  return m ? m[1] : s;
}

export interface PRMeta {
  number: number;
  title: string;
  body: string;
  headRefName: string;
  baseRefName: string;
  headRefOid: string;
  url: string;
  state: string;
  commits: Array<{ oid: string; messageHeadline: string }>;
}

export async function prMeta(host: Host, opts: ExecOpts, pr: string | number): Promise<PRMeta> {
  return ghJson<PRMeta>(host, opts, [
    "pr",
    "view",
    normalizePr(pr),
    "--json",
    "number,title,body,headRefName,baseRefName,headRefOid,url,state,commits",
  ]);
}

export async function prDiff(host: Host, opts: ExecOpts, pr: string | number): Promise<string> {
  const res = await gh(host, opts, ["pr", "diff", normalizePr(pr)]);
  if (res.code !== 0) throw new Error(`gh pr diff failed: ${res.stderr.trim()}`);
  return res.stdout;
}

export interface IssueComment {
  id: number;
  body: string;
  created_at: string;
  user?: { login: string };
}

export interface ReviewComment {
  id: number;
  body: string;
  created_at: string;
  path?: string;
  line?: number | null;
  in_reply_to_id?: number | null;
  user?: { login: string };
}

export async function listIssueComments(
  host: Host,
  opts: ExecOpts,
  slug: string,
  pr: number,
): Promise<IssueComment[]> {
  return ghJson<IssueComment[]>(host, opts, ["api", `repos/${slug}/issues/${pr}/comments`, "--paginate"]);
}

export async function listReviewComments(
  host: Host,
  opts: ExecOpts,
  slug: string,
  pr: number,
): Promise<ReviewComment[]> {
  return ghJson<ReviewComment[]>(host, opts, ["api", `repos/${slug}/pulls/${pr}/comments`, "--paginate"]);
}

async function ghPost<T>(
  host: Host,
  opts: ExecOpts,
  endpoint: string,
  payload: unknown,
): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "pi-rw-"));
  const file = join(dir, "body.json");
  writeFileSync(file, JSON.stringify(payload));
  try {
    return await ghJson<T>(host, opts, ["api", "--method", "POST", endpoint, "--input", file]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function postIssueComment(
  host: Host,
  opts: ExecOpts,
  slug: string,
  pr: number,
  body: string,
): Promise<IssueComment> {
  return ghPost<IssueComment>(host, opts, `repos/${slug}/issues/${pr}/comments`, { body });
}

export function postInlineReviewComment(
  host: Host,
  opts: ExecOpts,
  slug: string,
  pr: number,
  body: string,
  path: string,
  line: number,
  side: string,
  commit_id: string,
): Promise<ReviewComment> {
  return ghPost<ReviewComment>(host, opts, `repos/${slug}/pulls/${pr}/comments`, {
    body,
    path,
    line,
    side,
    commit_id,
  });
}

export function postReviewCommentReply(
  host: Host,
  opts: ExecOpts,
  slug: string,
  pr: number,
  commentId: number,
  body: string,
): Promise<ReviewComment> {
  return ghPost<ReviewComment>(host, opts, `repos/${slug}/pulls/${pr}/comments/${commentId}/replies`, {
    body,
  });
}

export async function postReviewEvent(
  host: Host,
  opts: ExecOpts,
  pr: string | number,
  event: "approve" | "request_changes" | "comment",
  body?: string,
): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "pi-rw-"));
  const file = join(dir, "body.md");
  writeFileSync(file, body ?? "");
  try {
    const flag =
      event === "approve" ? "--approve" : event === "request_changes" ? "--request-changes" : "--comment";
    const res = await gh(host, opts, ["pr", "review", normalizePr(pr), flag, "--body-file", file]);
    if (res.code !== 0) throw new Error(`gh pr review failed: ${res.stderr.trim()}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Run a GitHub GraphQL query/mutation via `gh api graphql`. Variables are passed
 * as -F (typed: number/boolean/null) or -f (string). The query itself goes as
 * `-f query=<query>`; since host.exec takes an args array, no shell escaping is
 * needed. Throws on GraphQL-level errors.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function ghGraphQL<T = any>(
  host: Host,
  opts: ExecOpts,
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  const args = ["api", "graphql", "-f", `query=${query}`];
  for (const [k, v] of Object.entries(variables)) {
    if (typeof v === "number" || typeof v === "boolean") args.push("-F", `${k}=${v}`);
    else if (v === null) args.push("-F", `${k}=null`);
    else args.push("-f", `${k}=${String(v)}`);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res: any = await ghJson<any>(host, opts, args);
  if (res?.errors?.length) {
    throw new Error(`GraphQL errors: ${JSON.stringify(res.errors)}`);
  }
  return res as T;
}

export interface ReviewThreadInfo {
  /** GraphQL node id (for resolve/unresolve mutations). */
  id: string;
  /** GitHub native resolved flag. */
  isResolved: boolean;
  /** databaseId of the thread's root review comment. */
  rootDatabaseId: number;
}

/**
 * List ALL review threads on a PR with pagination, mapping each thread to its
 * root comment's databaseId. Used to reconcile protocol status (from markers)
 * with GitHub's native isResolved flag.
 */
export async function listReviewThreads(
  host: Host,
  opts: ExecOpts,
  slug: string,
  pr: number,
): Promise<ReviewThreadInfo[]> {
  const [owner, name] = slug.split("/");
  if (!owner || !name) throw new Error(`Could not parse owner/repo from slug "${slug}".`);
  const q =
    "query($owner:String!,$name:String!,$pr:Int!,$after:String){" +
    " repository(owner:$owner,name:$name){ pullRequest(number:$pr){" +
    " reviewThreads(first:100,after:$after){ pageInfo{ hasNextPage endCursor }" +
    " nodes{ id isResolved comments(first:1){ nodes{ databaseId } } } } } } }";
  const out: ReviewThreadInfo[] = [];
  let after: string | null = null;
  for (;;) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res: any = await ghGraphQL<any>(host, opts, q, { owner, name, pr, after });
    const rt = res?.data?.repository?.pullRequest?.reviewThreads;
    const nodes: Array<{ id: string; isResolved: boolean; comments?: { nodes: Array<{ databaseId: number }> } }> =
      rt?.nodes ?? [];
    for (const n of nodes) {
      const root = n.comments?.nodes?.[0]?.databaseId;
      if (root != null) out.push({ id: n.id, isResolved: n.isResolved, rootDatabaseId: root });
    }
    if (rt?.pageInfo?.hasNextPage && rt.pageInfo.endCursor) {
      after = rt.pageInfo.endCursor;
    } else {
      break;
    }
  }
  return out;
}

/** Natively resolve a GitHub review thread by its GraphQL node id. */
export async function resolveReviewThread(
  host: Host,
  opts: ExecOpts,
  threadId: string,
): Promise<void> {
  const m = "mutation($id:ID!){ resolveReviewThread(input:{threadId:$id}){ thread{ id isResolved } } }";
  await ghGraphQL(host, opts, m, { id: threadId });
}

/** Natively unresolve a GitHub review thread by its GraphQL node id. */
export async function unresolveReviewThread(
  host: Host,
  opts: ExecOpts,
  threadId: string,
): Promise<void> {
  const m = "mutation($id:ID!){ unresolveReviewThread(input:{threadId:$id}){ thread{ id isResolved } } }";
  await ghGraphQL(host, opts, m, { id: threadId });
}
