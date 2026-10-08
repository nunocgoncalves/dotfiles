import { describe, expect, test } from "bun:test";
import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import {
  detectPrimaryCheckoutSync,
  normalizeTicketId,
  parseWorktreeList,
  ticketIdFromBranch,
  worktreeRoot,
} from "./worktrees.ts";

describe("workspace convention", () => {
  test("defaults to ~/Developer/worktrees and honors PI_WORKTREE_ROOT", () => {
    expect(worktreeRoot({})).toBe(join(homedir(), "Developer", "worktrees"));
    expect(worktreeRoot({ PI_WORKTREE_ROOT: "/tmp/wt" })).toBe("/tmp/wt");
    expect(worktreeRoot({ PI_WORKTREE_ROOT: "~/wt" })).toBe(join(homedir(), "wt"));
    expect(worktreeRoot({ PI_WORKTREE_ROOT: "  " })).toBe(join(homedir(), "Developer", "worktrees"));
  });

  test("normalizes ticket identifiers", () => {
    expect(normalizeTicketId(" hor-559 ")).toBe("HOR-559");
  });

  test("extracts the ticket id from a convention branch only", () => {
    expect(ticketIdFromBranch("HOR-559-model-reconcile-loop")).toBe("HOR-559");
    expect(ticketIdFromBranch("hor-12-short")).toBe("HOR-12");
    expect(ticketIdFromBranch("HOR-559")).toBeNull();
    expect(ticketIdFromBranch("feature/HOR-559-thing")).toBeNull();
    expect(ticketIdFromBranch("master")).toBeNull();
    expect(ticketIdFromBranch("")).toBeNull();
  });
});

describe("worktree list parsing", () => {
  test("parses primary, linked, and detached worktrees", () => {
    const output = [
      "worktree /repo/mono",
      "HEAD 8352c41e4eb89f4319f8c0972ce9b60a49519b37",
      "branch refs/heads/HOR-559-model-reconcile-loop",
      "",
      "worktree /worktrees/mono/HOR-539",
      "HEAD 840e62766861290987239af685d8424c57dc5edc",
      "branch refs/heads/HOR-539-detach-draft",
      "",
      "worktree /worktrees/mono/HOR-540-release",
      "HEAD 6ec2e5e0000000000000000000000000000000000",
      "detached",
      "",
    ].join("\n");
    const entries = parseWorktreeList(output);
    expect(entries).toHaveLength(3);
    expect(entries[0]).toEqual({
      path: "/repo/mono",
      branch: "HOR-559-model-reconcile-loop",
      head: "8352c41e4eb89f4319f8c0972ce9b60a49519b37",
      detached: false,
    });
    expect(entries[2].branch).toBeNull();
    expect(entries[2].detached).toBe(true);
  });
});

describe("primary checkout detection", () => {
  test("a .git directory marks the primary checkout, a .git file a linked worktree", () => {
    const root = mkdtempSync(join(tmpdir(), "pi-wt-test-"));
    try {
      const primary = join(root, "mono");
      mkdirSync(join(primary, ".git"), { recursive: true });
      mkdirSync(join(primary, "sub", "dir"), { recursive: true });
      expect(detectPrimaryCheckoutSync(primary)).toBe(true);
      expect(detectPrimaryCheckoutSync(join(primary, "sub", "dir"))).toBe(true);

      const linked = join(root, "worktrees", "mono", "HOR-559");
      mkdirSync(linked, { recursive: true });
      writeFileSync(join(linked, ".git"), "gitdir: /repo/mono/.git/worktrees/HOR-559\n");
      expect(detectPrimaryCheckoutSync(linked)).toBe(false);

      expect(detectPrimaryCheckoutSync(root)).toBeNull();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
