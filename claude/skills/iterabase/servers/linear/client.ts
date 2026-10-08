/**
 * Linear GraphQL API client and shared helpers.
 *
 * Authentication: reads the `LINEAR_API_KEY` environment variable at call time
 * and sends it directly as the `Authorization` header (Linear API keys do not
 * use a "Bearer" prefix). OAuth tokens are not supported.
 */

import { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES, formatSize, truncateHead } from "../lib/truncate.ts";

const LINEAR_ENDPOINT = "https://api.linear.app/graphql";

/** Returns the configured Linear API key, throwing a helpful error if missing. */
export function getApiKey(): string {
  const key = process.env.LINEAR_API_KEY;
  if (!key || !key.trim()) {
    throw new Error(
      "LINEAR_API_KEY environment variable is not set. Export it in your shell " +
        "(export LINEAR_API_KEY=lin_api_...) and restart Claude Code.",
    );
  }
  return key.trim();
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

/**
 * Execute a GraphQL operation against the Linear API.
 * Throws an Error with a consolidated message on HTTP or GraphQL errors.
 */
export async function linearFetch<T = unknown>(
  query: string,
  variables?: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(LINEAR_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: getApiKey(),
      },
      body: JSON.stringify({ query, variables }),
      signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") throw err;
    throw new Error(
      `Linear request failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  let body: GraphQLResponse<T>;
  try {
    body = (await res.json()) as GraphQLResponse<T>;
  } catch {
    throw new Error(`Linear API returned a non-JSON response (HTTP ${res.status})`);
  }

  if (!res.ok) {
    const msgs = body.errors?.map((e) => e.message).join("; ");
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        `Linear authentication failed (HTTP ${res.status}). Verify LINEAR_API_KEY is valid and not expired.`,
      );
    }
    throw new Error(`Linear API error (HTTP ${res.status}): ${msgs ?? res.statusText}`);
  }
  if (body.errors && body.errors.length) {
    throw new Error(`Linear API error: ${body.errors.map((e) => e.message).join("; ")}`);
  }
  return body.data as T;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(s: string): boolean {
  return typeof s === "string" && UUID_RE.test(s);
}

/**
 * Resolve an issue reference (UUID or identifier like "HOR-255") to a UUID.
 * The `issue(id:)` query only accepts UUIDs, so identifiers are resolved via
 * the `id` filter which Linear matches against identifiers.
 */
export async function resolveIssueId(
  idOrIdentifier: string,
  signal?: AbortSignal,
): Promise<string> {
  if (isUuid(idOrIdentifier)) return idOrIdentifier;
  const data = await linearFetch<{
    issues: { nodes: Array<{ id: string; identifier: string }> };
  }>(
    `query($f: IssueFilter!) { issues(filter: $f, first: 1) { nodes { id identifier } } }`,
    { f: { id: { eq: idOrIdentifier.toUpperCase() } } },
    signal,
  );
  const node = data.issues.nodes[0];
  if (!node) throw new Error(`Issue not found: ${idOrIdentifier}`);
  return node.id;
}

/**
 * Resolve a project reference (UUID or slugId like "a1be212bc129") to a UUID.
 * `project(id:)` accepts slugIds too, but mutations are safest with UUIDs.
 */
export async function resolveProjectId(
  idOrSlug: string,
  signal?: AbortSignal,
): Promise<string> {
  if (isUuid(idOrSlug)) return idOrSlug;
  const data = await linearFetch<{ project: { id: string; name: string } | null }>(
    `query($id: String!) { project(id: $id) { id name slugId } }`,
    { id: idOrSlug },
    signal,
  );
  if (!data.project) throw new Error(`Project not found: ${idOrSlug}`);
  return data.project.id;
}

let cachedViewerId: string | undefined;

/** Fetch (and cache) the authenticated user's Linear UUID. For assignee "me". */
export async function getViewerId(signal?: AbortSignal): Promise<string> {
  if (cachedViewerId) return cachedViewerId;
  const data = await linearFetch<{ viewer: { id: string } }>(
    `query { viewer { id } }`,
    undefined,
    signal,
  );
  cachedViewerId = data.viewer.id;
  return cachedViewerId;
}

export interface TruncatedText {
  text: string;
  truncated: boolean;
}

/** Truncate tool output to the default output limits and append a notice if needed. */
export function truncateOutput(text: string): TruncatedText {
  const t = truncateHead(text, {
    maxLines: DEFAULT_MAX_LINES,
    maxBytes: DEFAULT_MAX_BYTES,
  });
  if (!t.truncated) return { text: t.content, truncated: false };
  const note =
    `\n\n[Output truncated: showing ${t.outputLines} of ${t.totalLines} lines ` +
    `(${formatSize(t.outputBytes)} of ${formatSize(t.totalBytes)}). ` +
    `Refine filters or fetch fewer results to see more.]`;
  return { text: t.content + note, truncated: true };
}

/** Clamp a number into [min, max]. */
export function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

/** Linear priority number -> human label. */
export function priorityLabel(priority: number | null | undefined): string {
  switch (priority) {
    case 1:
      return "Urgent";
    case 2:
      return "High";
    case 3:
      return "Medium";
    case 4:
      return "Low";
    case 0:
      return "No priority";
    default:
      return priority == null ? "No priority" : `Priority ${priority}`;
  }
}

/** YYYY-MM-DD-ish date string from an ISO timestamp, or "—" if missing. */
export function day(iso: string | null | undefined): string {
  if (!iso) return "—";
  return iso.slice(0, 10);
}
