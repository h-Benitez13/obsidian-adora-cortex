import { describe, expect, it } from "vitest";

import { renderReviewSummary } from "../src/reporting";

describe("renderReviewSummary", () => {
  it("renders useful empty-state output", () => {
    const summary = renderReviewSummary({
      generatedAt: "2026-03-10T00:00:00.000Z",
      recommendations: [],
      incidents: [],
    });

    expect(summary).toContain("Recommendations: 0");
    expect(summary).toContain("- No pending recommendations.");
    expect(summary).toContain("- No incidents available.");
  });

  it("renders populated recommendation and incident sections", () => {
    const summary = renderReviewSummary({
      generatedAt: "2026-03-10T00:00:00.000Z",
      recommendations: [
        {
          title: "Add publish debugger skill",
          targetKind: "skill",
          reviewState: "reviewing",
          confidenceScore: 0.88,
        },
      ],
      incidents: [
        {
          title: "Publish flow degraded",
          severity: "high",
          status: "resolved",
          repo: "web",
          learningSummary: "Retry-sensitive flows need contract coverage.",
        },
      ],
    });

    expect(summary).toContain("Pending recommendations: 1");
    expect(summary).toContain("[skill] Add publish debugger skill");
    expect(summary).toContain("[high] Publish flow degraded (web, resolved)");
    expect(summary).toContain("Retry-sensitive flows need contract coverage.");
  });
});
