/** Output limits matching the original tool contract (~2000 lines / 50KB). */
export const DEFAULT_MAX_LINES = 2000;
export const DEFAULT_MAX_BYTES = 50 * 1024;

export interface Truncation {
  content: string;
  truncated: boolean;
  outputLines: number;
  totalLines: number;
  outputBytes: number;
  totalBytes: number;
}

/** Keep the head of `text` within both the line and byte limits. */
export function truncateHead(text: string, limits: { maxLines: number; maxBytes: number }): Truncation {
  const lines = text.split("\n");
  const totalBytes = Buffer.byteLength(text);
  const kept: string[] = [];
  let bytes = 0;
  for (const line of lines) {
    const size = Buffer.byteLength(line) + (kept.length ? 1 : 0);
    if (kept.length >= limits.maxLines || bytes + size > limits.maxBytes) break;
    kept.push(line);
    bytes += size;
  }
  return {
    content: kept.join("\n"),
    truncated: kept.length < lines.length,
    outputLines: kept.length,
    totalLines: lines.length,
    outputBytes: bytes,
    totalBytes,
  };
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  return `${(bytes / 1024).toFixed(1)}KB`;
}
