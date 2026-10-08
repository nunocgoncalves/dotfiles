/**
 * Parse a unified diff (`gh pr diff`) into the set of added (+) line numbers
 * per file path. Used by review_post_finding to validate that a finding's line
 * is an actual changed line in the PR (so inline comments always anchor).
 */

export function parseAddedLines(diff: string): Map<string, Set<number>> {
  const map = new Map<string, Set<number>>();
  let path = "";
  let newLine = 0;

  for (const raw of diff.split("\n")) {
    const fileMatch = raw.match(/^\+\+\+ b\/(.*)$/);
    if (fileMatch) {
      path = fileMatch[1];
      if (!map.has(path)) map.set(path, new Set());
      newLine = 0;
      continue;
    }

    const hunkMatch = raw.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunkMatch) {
      newLine = parseInt(hunkMatch[1], 10);
      continue;
    }

    if (!path) continue;

    if (raw.startsWith("+") && !raw.startsWith("+++")) {
      map.get(path)!.add(newLine);
      newLine++;
    } else if (raw.startsWith("-") && !raw.startsWith("---")) {
      // removed line: new-file cursor does not advance
    } else if (raw.startsWith("\\")) {
      // "\\ No newline at end of file" marker — ignore
    } else {
      // context line (or hunk remainder)
      newLine++;
    }
  }

  return map;
}

export function isAddedLine(map: Map<string, Set<number>>, path: string, line: number): boolean {
  return map.get(path)?.has(line) ?? false;
}
