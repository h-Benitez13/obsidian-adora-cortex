import { describe, expect, it } from "vitest";

import {
  buildIncidentRecordFromActiveNote,
  buildRecommendationSeedFromActiveNote,
} from "../src/active-note-recommendations";

describe("active note recommendation helpers", () => {
  it("builds a recommendation seed from frontmatter", () => {
    const seed = buildRecommendationSeedFromActiveNote(
      "Adora/Incidents/publish.md",
      "Publish Incident",
      {
        title: "Add publish debugger command",
        summary: "Reusable command for publish regressions.",
        repo: "web",
        recommendation_kind: "command",
        source_canonical_id: "linear:WEB-42",
        related_ids: ["incident:web:publish"],
        changed_file_count: 2,
        affected_areas: ["publishing"],
        has_tests: true,
        has_deterministic_verification: true,
        required_context_available: true,
        touches_infrastructure: false,
        touches_auth: false,
        touches_data_model: false,
        repeated_pattern_count: 3,
        fix_type: "small_bugfix",
        source_url: "https://github.com/adora/web/pull/42",
      },
      "Body summary",
    );

    expect(seed.repo).toBe("web");
    expect(seed.heuristicInput.changedFileCount).toBe(2);
    expect(seed.evidence.some((item) => item.url?.includes("github.com"))).toBe(
      true,
    );
  });

  it("builds an incident record from frontmatter", () => {
    const incident = buildIncidentRecordFromActiveNote(
      "Adora/Incidents/publish.md",
      "Publish Incident",
      {
        title: "Publish flow degraded",
        summary: "Publishing failed for some accounts.",
        repo: "web",
        status: "resolved",
        severity: "high",
        root_cause_category: "code_regression",
        fix_summary: "Restored retry handling.",
        learning_summary: "Retry paths need tests.",
      },
      "Body summary",
    );

    expect(incident.entityKind).toBe("incident");
    expect(incident.fixSummary).toBe("Restored retry handling.");
    expect(incident.learningSummary).toBe("Retry paths need tests.");
  });
});
