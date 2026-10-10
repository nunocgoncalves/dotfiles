import { describe, expect, test } from "bun:test";
import { isAddedLine, parseAddedLines } from "./diff";
import { filesToDiff } from "./github";

describe("filesToDiff", () => {
  test("rebuilds added lines from PR files API patches", () => {
    const diff = filesToDiff([
      { filename: "a.txt", status: "modified", patch: "@@ -1,2 +1,3 @@\n one\n+two\n three" },
      { filename: "new.py", status: "added", patch: "@@ -0,0 +1,2 @@\n+x = 1\n+y = 2" },
      { filename: "gone.md", status: "removed", patch: "@@ -1 +0,0 @@\n-bye" },
      { filename: "image.png", status: "added" },
    ]);
    const map = parseAddedLines(diff);
    expect(isAddedLine(map, "a.txt", 2)).toBe(true);
    expect(isAddedLine(map, "a.txt", 3)).toBe(false);
    expect(isAddedLine(map, "new.py", 1)).toBe(true);
    expect(isAddedLine(map, "new.py", 2)).toBe(true);
    expect([...map.keys()].sort()).toEqual(["a.txt", "new.py"]);
  });
});
