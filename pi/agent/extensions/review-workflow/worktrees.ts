/**
 * Workspace boundary for ticket work.
 *
 * Mutating ticket work happens in ONE dedicated linked git worktree per ticket —
 * never in the primary checkout. This module owns the deterministic mechanics:
 * the path convention, primary-checkout detection, worktree inspection,
 * create/reuse, and removal. Skills state the boundary; these helpers enforce it.
 *
 * Convention:
 *   worktree   <root>/<repo>/<TICKET>          root = $PI_WORKTREE_ROOT || ~/Developer/worktrees
 *   branch     <TICKET>-<short-description>    checked out in that worktree
 *
 * The primary checkout is identified without heuristics: in a linked worktree
 * `git rev-parse --git-dir` differs from `--git-common-dir`. Once the ticket
 * branch is checked out in the ticket worktree, git itself refuses to check it
 * out in the primary checkout, so the primary checkout can no longer receive
 * ticket commits — the boundary is structural, not advisory.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { existsSync, mkdirSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import type { ExecOpts } from "./github";

const GIT_TIMEOUT = 120_000;

/**
 * Canonical path: resolve symlinks when the path exists (macOS `/var` →
 * `/private/var` would otherwise make git-reported paths unequal to
 * user-supplied ones), falling back to a plain absolute path otherwise.
 */
export function canonicalPath(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

// --- pure helpers ------------------------------------------------------------

export function worktreeRoot(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.PI_WORKTREE_ROOT?.trim();
  if (!configured) return join(homedir(), "Developer", "worktrees");
  return resolve(configured.replace(/^~(?=$|\/)/, homedir()));
}

export function normalizeTicketId(ticketId: string): string {
  return ticketId.trim().toUpperCase();
}

/** The `<TICKET>` prefix of a `<TICKET>-<description>` branch, or null. */
export function ticketIdFromBranch(branch: string): string | null {
  const match = branch.trim().match(/^([A-Z]+-\d+)-[^/]+$/i);
  return match ? match[1].toUpperCase() : null;
}

/**
 * Cheap, exec-free primary-checkout detection: a linked worktree has a `.git`
 * FILE pointing at the owning repository; the primary checkout has a `.git`
 * DIRECTORY. Returns null when no repository marker is found.
 */
export function detectPrimaryCheckoutSync(cwd: string): boolean | null {
  let dir = resolve(cwd);
  for (;;) {
    try {
      return statSync(join(dir, ".git")).isDirectory();
    } catch {
      const parent = dirname(dir);
      if (parent === dir) return null;
      dir = parent;
    }
  }
}

export interface WorktreeEntry {
  path: string;
  branch: string | null;
  head: string;
  detached: boolean;
}

/** Parse `git worktree list --porcelain`. */
export function parseWorktreeList(output: string): WorktreeEntry[] {
  const entries: WorktreeEntry[] = [];
  let current: WorktreeEntry | null = null;
  for (const raw of output.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("worktree ")) {
      if (current) entries.push(current);
      current = { path: line.slice("worktree ".length), branch: null, head: "", detached: false };
      continue;
    }
    if (!current) continue;
    if (line.startsWith("HEAD ")) current.head = line.slice("HEAD ".length);
    else if (line.startsWith("branch ")) current.branch = line.slice("branch ".length).replace(/^refs\/heads\//, "");
    else if (line === "detached") current.detached = true;
  }
  if (current) entries.push(current);
  return entries;
}

// --- git plumbing ------------------------------------------------------------

interface GitResult {
  code: number;
  stdout: string;
  stderr: string;
}

async function git(
  pi: ExtensionAPI,
  cwd: string,
  args: string[],
  signal?: AbortSignal,
): Promise<GitResult> {
  const res = await pi.exec("git", args, { cwd, timeout: GIT_TIMEOUT, signal });
  return { code: res.code, stdout: res.stdout.trim(), stderr: res.stderr.trim() };
}

async function gitOk(
  pi: ExtensionAPI,
  cwd: string,
  args: string[],
  signal?: AbortSignal,
): Promise<string> {
  const res = await git(pi, cwd, args, signal);
  if (res.code !== 0) {
    throw new Error(`git ${args.join(" ")} failed (code ${res.code}): ${res.stderr || res.stdout}`);
  }
  return res.stdout;
}

export interface RepoIdentity {
  /** Absolute path of the primary checkout (the main worktree). */
  primaryRoot: string;
  /** Absolute path of the checkout containing `opts.cwd`. */
  toplevel: string;
  gitDir: string;
  commonDir: string;
  /** True when `opts.cwd` is inside the primary checkout. */
  isPrimaryCheckout: boolean;
  /** Repository directory name, used in the worktree path convention. */
  repo: string;
}

export async function repoIdentity(pi: ExtensionAPI, opts: ExecOpts): Promise<RepoIdentity> {
  const res = await git(
    pi,
    opts.cwd,
    ["rev-parse", "--git-dir", "--git-common-dir", "--show-toplevel"],
    opts.signal,
  );
  if (res.code !== 0) {
    throw new Error(`Not inside a git repository (${opts.cwd}): ${res.stderr || res.stdout}`);
  }
  const [gitDirRaw, commonDirRaw, toplevelRaw] = res.stdout.split("\n").map((line) => line.trim());
  if (!gitDirRaw || !commonDirRaw || !toplevelRaw) {
    throw new Error(`Could not resolve repository identity in ${opts.cwd}.`);
  }
  const absolute = (p: string) => canonicalPath(isAbsolute(p) ? resolve(p) : resolve(opts.cwd, p));
  const gitDir = absolute(gitDirRaw);
  const commonDir = absolute(commonDirRaw);
  const toplevel = absolute(toplevelRaw);
  const isPrimaryCheckout = gitDir === commonDir;
  const primaryRoot = isPrimaryCheckout ? toplevel : canonicalPath(dirname(commonDir));
  return { primaryRoot, toplevel, gitDir, commonDir, isPrimaryCheckout, repo: basename(primaryRoot) };
}

/** `<root>/<repo>/<TICKET>` — the only sanctioned ticket worktree path. */
export function ticketWorktreePath(identity: RepoIdentity, ticketId: string): string {
  return join(canonicalPath(worktreeRoot()), identity.repo, normalizeTicketId(ticketId));
}

export async function listWorktrees(
  pi: ExtensionAPI,
  opts: ExecOpts,
): Promise<WorktreeEntry[]> {
  const out = await gitOk(pi, opts.cwd, ["worktree", "list", "--porcelain"], opts.signal);
  return parseWorktreeList(out);
}

/** Drop metadata for worktrees whose directory no longer exists. */
export async function pruneWorktrees(pi: ExtensionAPI, opts: ExecOpts): Promise<void> {
  await git(pi, opts.cwd, ["worktree", "prune"], opts.signal);
}

async function originDefaultBranch(
  pi: ExtensionAPI,
  opts: ExecOpts,
): Promise<string> {
  const res = await git(pi, opts.cwd, ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"], opts.signal);
  if (res.code === 0 && res.stdout) return res.stdout.replace(/^origin\//, "");
  return "master";
}

// --- worktree state ----------------------------------------------------------

export interface WorktreeState {
  path: string;
  expected: string;
  exists: boolean;
  /** Valid linked worktree of the same repository. */
  linked: boolean;
  /** Checked-out branch, or "" when detached. */
  branch: string;
  head: string;
  clean: boolean;
  /** `git status --porcelain` lines when dirty. */
  dirty: string[];
  /** Blocking problem, in human-readable form, or null. */
  problem: string | null;
  /** Path of another worktree that already has this ticket's branch checked out. */
  checkedOutElsewhere: string | null;
}

async function dirtyLines(pi: ExtensionAPI, path: string, signal?: AbortSignal): Promise<string[]> {
  const res = await git(pi, path, ["status", "--porcelain"], signal);
  if (res.code !== 0) return [];
  return res.stdout.split("\n").map((line) => line.trim()).filter(Boolean);
}

/**
 * Inspect the conventional worktree for `ticketId`. Never throws for a missing
 * directory — the returned state carries `exists`/`problem` so callers can
 * produce actionable refusals.
 */
export async function inspectWorktree(
  pi: ExtensionAPI,
  opts: ExecOpts,
  identity: RepoIdentity,
  ticketIdRaw: string,
): Promise<WorktreeState> {
  const ticketId = normalizeTicketId(ticketIdRaw);
  const path = ticketWorktreePath(identity, ticketId);

  if (!existsSync(path)) {
    return {
      path,
      expected: path,
      exists: false,
      linked: false,
      branch: "",
      head: "",
      clean: true,
      dirty: [],
      problem: null,
      checkedOutElsewhere: null,
    };
  }

  const res = await git(
    pi,
    path,
    ["rev-parse", "--git-dir", "--git-common-dir", "--show-toplevel"],
    opts.signal,
  );
  if (res.code !== 0) {
    return {
      path,
      expected: path,
      exists: true,
      linked: false,
      branch: "",
      head: "",
      clean: true,
      dirty: [],
      problem: `${path} exists but is not a git worktree (${res.stderr || res.stdout}). Remove or move it before retrying.`,
      checkedOutElsewhere: null,
    };
  }

  const [gitDirRaw, commonDirRaw] = res.stdout.split("\n").map((line) => line.trim());
  const absolute = (p: string) => canonicalPath(isAbsolute(p) ? resolve(p) : resolve(path, p));
  const gitDir = absolute(gitDirRaw ?? "");
  const commonDir = absolute(commonDirRaw ?? "");
  const sameRepo = commonDir === identity.commonDir;
  const linked = sameRepo && gitDir !== commonDir;

  const resolvedPath = canonicalPath(path);
  const branch = (await git(pi, resolvedPath, ["branch", "--show-current"], opts.signal)).stdout;
  const head = (await git(pi, resolvedPath, ["rev-parse", "HEAD"], opts.signal)).stdout;
  const dirty = await dirtyLines(pi, resolvedPath, opts.signal);

  const problem = !sameRepo
    ? `${path} is a worktree of a different repository (${commonDir}), not ${identity.repo}.`
    : linked
      ? null
      : `${path} is the primary checkout itself, not a linked worktree.`;

  let checkedOutElsewhere: string | null = null;
  if (branch) {
    const others = await listWorktrees(pi, opts);
    const owner = others.find(
      (entry) => entry.branch === branch && canonicalPath(entry.path) !== resolvedPath,
    );
    if (owner) checkedOutElsewhere = canonicalPath(owner.path);
  }

  return {
    path: resolvedPath,
    expected: path,
    exists: true,
    linked,
    branch,
    head,
    clean: dirty.length === 0,
    dirty,
    problem,
    checkedOutElsewhere,
  };
}

// --- ensure / remove ---------------------------------------------------------

export interface EnsureResult {
  identity: RepoIdentity;
  state: WorktreeState;
  created: boolean;
}

async function branchesForTicket(
  pi: ExtensionAPI,
  opts: ExecOpts,
  ticketId: string,
  signal?: AbortSignal,
): Promise<string[]> {
  const local = await gitOk(
    pi,
    opts.cwd,
    ["branch", "--list", "--format=%(refname:short)", `${ticketId}-*`],
    signal,
  );
  const names = local.split("\n").map((line) => line.trim()).filter(Boolean);
  return [...new Set(names)].sort();
}

/**
 * Create or reuse the dedicated ticket worktree. Reuse never resets or discards
 * existing work; creation checks the ticket branch out HERE so the primary
 * checkout can no longer hold it.
 */
export async function ensureTicketWorktree(
  pi: ExtensionAPI,
  opts: ExecOpts,
  ticketIdRaw: string,
  branch?: string,
  base?: string,
): Promise<EnsureResult> {
  const ticketId = normalizeTicketId(ticketIdRaw);
  const identity = await repoIdentity(pi, opts);
  const path = ticketWorktreePath(identity, ticketId);
  await pruneWorktrees(pi, opts);

  const existing = await inspectWorktree(pi, opts, identity, ticketId);
  if (existing.exists) {
    if (existing.problem) throw new Error(existing.problem);
    if (existing.branch && ticketIdFromBranch(existing.branch) !== ticketId) {
      throw new Error(
        `${path} is a worktree of ${identity.repo} but is on branch '${existing.branch}', not a ${ticketId}-* branch. ` +
          `Remove it (worktree_remove) or pass the matching ticket.`,
      );
    }
    return { identity, state: existing, created: false };
  }

  let target = branch?.trim() ?? "";
  if (target && ticketIdFromBranch(target) !== ticketId) {
    throw new Error(
      `Branch '${target}' does not match ticket ${ticketId} (expected '${ticketId}-<short-description>').`,
    );
  }
  if (!target) {
    const candidates = await branchesForTicket(pi, opts, ticketId, opts.signal);
    if (candidates.length > 1) {
      throw new Error(
        `Multiple ${ticketId}-* branches exist (${candidates.join(", ")}). Pass branch="<name>" to choose one.`,
      );
    }
    if (candidates.length === 1) target = candidates[0];
  }
  if (!target) {
    throw new Error(
      `No ${ticketId}-* branch exists and no branch was given. Pass branch="${ticketId}-<short-description>".`,
    );
  }

  const elsewhere = (await listWorktrees(pi, opts)).find(
    (entry) => entry.branch === target && canonicalPath(entry.path) !== canonicalPath(path),
  );
  if (elsewhere) {
    const isPrimary = canonicalPath(elsewhere.path) === canonicalPath(identity.primaryRoot);
    throw new Error(
      `Branch '${target}' is already checked out in ${elsewhere.path}${isPrimary ? " (the primary checkout)" : ""}. ` +
        (isPrimary
          ? `Move the primary checkout off the ticket branch first (git -C ${identity.primaryRoot} switch ${await originDefaultBranch(pi, opts)}), then re-run.`
          : `Remove that worktree first (git -C ${identity.primaryRoot} worktree remove ${elsewhere.path}).`),
    );
  }

  mkdirSync(dirname(path), { recursive: true });

  const branchExists =
    (await git(pi, opts.cwd, ["rev-parse", "--verify", "--quiet", `refs/heads/${target}`], opts.signal))
      .code === 0;

  if (branchExists) {
    await gitOk(pi, identity.primaryRoot, ["worktree", "add", path, target], opts.signal);
  } else {
    await git(pi, identity.primaryRoot, ["fetch", "--no-tags", "origin"], opts.signal);
    const startPoint = `origin/${base?.trim() || (await originDefaultBranch(pi, opts))}`;
    await gitOk(
      pi,
      identity.primaryRoot,
      ["worktree", "add", "-b", target, path, startPoint],
      opts.signal,
    );
  }

  const state = await inspectWorktree(pi, opts, identity, ticketId);
  if (state.problem || !state.linked) {
    throw new Error(state.problem ?? `Worktree ${path} was not created correctly.`);
  }
  return { identity, state, created: true };
}

export interface RemoveResult {
  removed: boolean;
  state: WorktreeState;
}

/** Remove the dedicated ticket worktree after merge/acceptance. */
export async function removeTicketWorktree(
  pi: ExtensionAPI,
  opts: ExecOpts,
  ticketIdRaw: string,
  force = false,
): Promise<RemoveResult> {
  const ticketId = normalizeTicketId(ticketIdRaw);
  const identity = await repoIdentity(pi, opts);
  const state = await inspectWorktree(pi, opts, identity, ticketId);

  if (!state.exists) {
    await pruneWorktrees(pi, opts);
    return { removed: false, state };
  }
  if (!state.linked) throw new Error(state.problem ?? `${state.path} is not a linked worktree.`);
  if (!state.clean && !force) {
    throw new Error(
      `Refusing to remove ${state.path}: it has uncommitted changes (${state.dirty.join("; ")}). ` +
        `Commit/stash them or pass force=true to discard.`,
    );
  }

  await gitOk(
    pi,
    identity.primaryRoot,
    ["worktree", "remove", ...(force ? ["--force"] : []), state.path],
    opts.signal,
  );
  await pruneWorktrees(pi, opts);
  return { removed: true, state };
}

// --- gate --------------------------------------------------------------------

export interface WorktreeRequirement {
  /** Action being refused, e.g. "open_pr" or "review_post_reply". */
  action: string;
  /** Require no uncommitted changes (default true). */
  requireClean?: boolean;
  /** Require this exact HEAD commit. */
  requireHead?: string;
}

/**
 * Hard boundary gate: the convention worktree must exist, be a linked worktree
 * of this repository, hold a `<TICKET>-*` branch, and (by default) be clean.
 * Throws an actionable error naming the convention path.
 */
export async function requireTicketWorktree(
  pi: ExtensionAPI,
  opts: ExecOpts,
  ticketIdRaw: string,
  requirement: WorktreeRequirement,
): Promise<{ identity: RepoIdentity; state: WorktreeState }> {
  const ticketId = normalizeTicketId(ticketIdRaw);
  const identity = await repoIdentity(pi, opts);
  const state = await inspectWorktree(pi, opts, identity, ticketId);
  const convention = `${ticketWorktreePath(identity, ticketId)} (branch ${ticketId}-<description>)`;
  const fail = (reason: string): never => {
    const where = canonicalPath(opts.cwd) === identity.primaryRoot ? " (the session is in the primary checkout)" : "";
    throw new Error(
      `${requirement.action} refused: ${reason}${where}. Ticket work must be performed in the dedicated worktree ${convention}. ` +
        `Call worktree_ensure(ticketId="${ticketId}") to create or reuse it, then run the command with absolute paths (or git -C <worktree>).`,
    );
  };

  if (!state.exists) {
    fail(`no ticket worktree exists at ${state.path}`);
  }
  if (state.problem || !state.linked) {
    fail(state.problem ?? `${state.path} is not a linked worktree`);
  }
  if (ticketIdFromBranch(state.branch) !== ticketId) {
    fail(`its branch is '${state.branch || "(detached HEAD)"}', not a ${ticketId}-* branch`);
  }
  if (requirement.requireClean !== false && !state.clean) {
    fail(`it has uncommitted changes: ${state.dirty.slice(0, 5).join("; ")}`);
  }
  if (requirement.requireHead && state.head !== requirement.requireHead) {
    fail(
      `its HEAD ${state.head.slice(0, 12)} is not the expected commit ${requirement.requireHead.slice(0, 12)} ` +
        `(commit and push from the worktree, then retry)`,
    );
  }
  return { identity, state };
}

/** True when `sha` is contained in `head` — used to validate a reply's fix commit. */
export async function commitContainedIn(
  pi: ExtensionAPI,
  opts: ExecOpts,
  sha: string,
  head: string,
): Promise<boolean> {
  const res = await git(pi, opts.cwd, ["merge-base", "--is-ancestor", sha, head], opts.signal);
  return res.code === 0;
}
