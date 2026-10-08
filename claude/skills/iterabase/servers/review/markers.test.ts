import { describe, expect, test } from "bun:test";
import {
  countReopenedMarkers,
  findingMarkerState,
  founderRequiredMarker,
  hasFounderRequiredMarker,
  parseFounderRequiredMarker,
  reopenedMarker,
  responseMarker,
} from "./markers.ts";

function reply(body: string, second: number): { body: string; created_at: string } {
  return { body, created_at: `2026-08-21T12:00:${String(second).padStart(2, "0")}Z` };
}

describe("founder-required review transition", () => {
  test("round-trips a durable decision reference", () => {
    const marker = founderRequiredMarker(42, "linear-comment:f98aa512-35fb-4f60-a887-4a5d1a3cac46");
    expect(hasFounderRequiredMarker(marker)).toBe(true);
    expect(parseFounderRequiredMarker(marker)).toEqual({
      reviewSummaryId: "42",
      decisionRef: "linear-comment:f98aa512-35fb-4f60-a887-4a5d1a3cac46",
    });
  });

  test("makes an addressed stalemate developer-actionable without incrementing counters", () => {
    const replies = [
      reply(responseMarker(42, "fixed", "aaa111"), 1),
      reply(reopenedMarker(42, 1), 2),
      reply(responseMarker(42, "fixed", "bbb222"), 3),
      reply(reopenedMarker(42, 2), 4),
      reply(responseMarker(42, "fixed", "ccc333"), 5),
      reply(
        `Observe the blocking rollback itself.\n\nFounder decision: linear-comment:decision\n\n${founderRequiredMarker(42, "linear-comment:decision")}`,
        6,
      ),
    ];

    expect(countReopenedMarkers(replies)).toBe(2);
    expect(findingMarkerState(replies)).toEqual({
      status: "contested",
      founderRequired: true,
      founderDecisionRef: "linear-comment:decision",
      founderRequirement: "Observe the blocking rollback itself.\n\nFounder decision: linear-comment:decision",
    });
  });

  test("returns to reviewer verification after the developer replies", () => {
    const replies = [
      reply(founderRequiredMarker(42, "linear-comment:decision"), 1),
      reply(responseMarker(42, "fixed", "ddd444"), 2),
    ];

    expect(findingMarkerState(replies)).toEqual({ status: "addressed", decision: "fixed" });
  });
});
