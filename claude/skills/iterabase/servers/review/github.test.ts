import { describe, expect, test } from "bun:test";
import type { Host } from "../lib/host.ts";
import {
  listReviewThreads,
  parsePrRef,
  postReviewEvent,
  prDiff,
  prMeta,
  prRepoArgs,
  prRepoSlug,
} from "./github.ts";

interface Call {
  cmd: string;
  args: string[];
}

/** Records every `gh` invocation; answers each with the first matching reply. */
function recordingHost(replies: Array<{ match: (args: string[]) => boolean; code?: number; stdout?: string; stderr?: string }>) {
  const calls: Call[] = [];
  const host = {
    exec: async (cmd: string, args: string[]) => {
      calls.push({ cmd, args });
      const reply = replies.find((r) => r.match(args));
      return { code: reply?.code ?? 0, stdout: reply?.stdout ?? "", stderr: reply?.stderr ?? "" };
    },
  } as unknown as Host;
  return { host, calls };
}

const opts = { cwd: "/session/iterabase-mono" };
const OVERLAY_URL = "https://github.com/iterabase/iterabase-overlay-opo1/pull/107";

describe("parsePrRef", () => {
  test("reads the repository and number from a PR URL", () => {
    expect(parsePrRef(OVERLAY_URL)).toEqual({ repo: "iterabase/iterabase-overlay-opo1", number: "107" });
    expect(parsePrRef(`${OVERLAY_URL}/files`)).toEqual({ repo: "iterabase/iterabase-overlay-opo1", number: "107" });
    expect(parsePrRef(`${OVERLAY_URL}?w=1`).number).toBe("107");
    expect(parsePrRef(`${OVERLAY_URL}#discussion_r1`).number).toBe("107");
    expect(parsePrRef(` http://www.github.com/o/r.js/pull/7 `)).toEqual({ repo: "o/r.js", number: "7" });
  });

  test("reads owner/repo#N", () => {
    expect(parsePrRef("iterabase/iterabase-overlay-opo1#107")).toEqual({
      repo: "iterabase/iterabase-overlay-opo1",
      number: "107",
    });
  });

  test("keeps a bare number on the session's repository", () => {
    expect(parsePrRef("107")).toEqual({ number: "107" });
    expect(parsePrRef(107)).toEqual({ number: "107" });
    expect(parsePrRef("#107")).toEqual({ number: "107" });
    expect(prRepoArgs(parsePrRef("107"))).toEqual([]);
  });

  test("fails closed on references whose repository cannot be resolved", () => {
    expect(() => parsePrRef("https://github.example.com/o/r/pull/1")).toThrow(/Could not resolve/);
    expect(() => parsePrRef("https://github.com/o/r/issues/1")).toThrow(/Could not resolve/);
    expect(() => parsePrRef("https://github.com/o/pull/1")).toThrow(/Could not resolve/);
    expect(() => parsePrRef("HOR-646-branch")).toThrow(/Could not resolve/);
    expect(() => parsePrRef("")).toThrow(/Could not resolve/);
  });
});

describe("gh arguments follow the PR's repository", () => {
  test("pr view / pr diff / pr review carry -R for a named repository", async () => {
    const { host, calls } = recordingHost([{ match: (a) => a[1] === "view", stdout: "{}" }]);
    await prMeta(host, opts, OVERLAY_URL);
    await prDiff(host, opts, "iterabase/iterabase-overlay-opo1#107");
    await postReviewEvent(host, opts, OVERLAY_URL, "comment", "body");
    expect(calls.map((c) => c.args.slice(0, 5))).toEqual([
      ["pr", "view", "107", "-R", "iterabase/iterabase-overlay-opo1"],
      ["pr", "diff", "107", "-R", "iterabase/iterabase-overlay-opo1"],
      ["pr", "review", "107", "-R", "iterabase/iterabase-overlay-opo1"],
    ]);
    expect(calls.every((c) => c.cmd === "gh")).toBe(true);
  });

  test("a bare number never passes -R and resolves the slug from the working directory", async () => {
    const { host, calls } = recordingHost([
      { match: (a) => a[0] === "repo", stdout: JSON.stringify({ nameWithOwner: "iterabase/iterabase-mono" }) },
      { match: (a) => a[1] === "view", stdout: "{}" },
    ]);
    await prMeta(host, opts, "107");
    expect(calls[0].args).not.toContain("-R");
    expect(await prRepoSlug(host, opts, "107")).toBe("iterabase/iterabase-mono");
    expect(await prRepoSlug(host, opts, OVERLAY_URL)).toBe("iterabase/iterabase-overlay-opo1");
    // Only the bare number consulted the working directory's repository.
    expect(calls.filter((c) => c.args[0] === "repo")).toHaveLength(1);
  });

  test("the oversized-diff fallback reads files from the PR's repository", async () => {
    const { host, calls } = recordingHost([
      { match: (a) => a[1] === "diff", code: 1, stderr: "HTTP 406: too_large" },
      { match: (a) => a[0] === "api", stdout: "" },
    ]);
    await prDiff(host, opts, OVERLAY_URL);
    expect(calls[1].args).toContain("repos/iterabase/iterabase-overlay-opo1/pulls/107/files?per_page=100");
    expect(calls.some((c) => c.args[0] === "repo")).toBe(false);
  });

  test("GraphQL owner/name variables come from the PR's repository", async () => {
    const { host, calls } = recordingHost([{ match: (a) => a[1] === "graphql", stdout: "{}" }]);
    await listReviewThreads(host, opts, await prRepoSlug(host, opts, OVERLAY_URL), 107);
    expect(calls[0].args).toContain("owner=iterabase");
    expect(calls[0].args).toContain("name=iterabase-overlay-opo1");
  });
});
