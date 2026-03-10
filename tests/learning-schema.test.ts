import { describe, expect, it } from "vitest";

import {
  type CanonicalIncidentRecord,
  type CanonicalRecommendationRecord,
  validateCanonicalRecord,
} from "../src/learning-schema";

describe("validateCanonicalRecord", () => {
  const now = "2026-03-10T00:00:00.000Z";

  it("accepts a github PR record fixture", () => {
    const errors = validateCanonicalRecord({
      canonicalId: "github:adora/web:pr:42",
      sourceSystem: "github",
      entityKind: "pull_request",
      title: "Fix image upload retry handling",
      summary: "Merged fix for retry logic in upload flow.",
      status: "merged",
      repo: "web",
      tags: ["github", "pr"],
      relatedIds: ["linear:WEB-42"],
      updatedAt: now,
      evidence: [
        {
          sourceSystem: "github",
          entityKind: "pull_request",
          externalId: "42",
          url: "https://github.com/adora/web/pull/42",
          capturedAt: now,
        },
      ],
    });

    expect(errors).toEqual([]);
  });

  it("accepts a slack support signal fixture", () => {
    const errors = validateCanonicalRecord({
      canonicalId: "slack:support:173",
      sourceSystem: "slack",
      entityKind: "support_signal",
      title: "Customer reports failing publish flow",
      summary: "Support escalation from Slack triage channel.",
      status: "open",
      repo: "delorean",
      tags: ["slack", "support"],
      relatedIds: [],
      updatedAt: now,
      evidence: [
        {
          sourceSystem: "slack",
          entityKind: "support_signal",
          externalId: "173",
          obsidianPath: "Adora/Slack/support--173.md",
          capturedAt: now,
        },
      ],
    });

    expect(errors).toEqual([]);
  });

  it("accepts a linear issue fixture", () => {
    const errors = validateCanonicalRecord({
      canonicalId: "linear:WEB-42",
      sourceSystem: "linear",
      entityKind: "issue",
      title: "Fix publish timeout",
      summary: "Low-level ticket derived from support signal.",
      status: "backlog",
      repo: "web",
      tags: ["linear", "issue"],
      relatedIds: ["slack:support:173"],
      updatedAt: now,
      evidence: [
        {
          sourceSystem: "linear",
          entityKind: "issue",
          externalId: "WEB-42",
          url: "https://linear.app/adora/issue/WEB-42",
          capturedAt: now,
        },
      ],
    });

    expect(errors).toEqual([]);
  });

  it("accepts an incident fixture", () => {
    const incident: CanonicalIncidentRecord = {
      canonicalId: "incident:web:2026-03-10-publish",
      sourceSystem: "manual",
      entityKind: "incident",
      title: "Publish flow degraded",
      summary: "Publishing failed for a subset of accounts.",
      status: "resolved",
      repo: "web",
      tags: ["incident"],
      relatedIds: ["github:adora/web:pr:42", "linear:WEB-42"],
      updatedAt: now,
      severity: "high",
      rootCauseCategory: "code_regression",
      fixSummary: "Restored retry handling and deployed patch.",
      learningSummary: "Retry-sensitive paths need contract tests.",
      evidence: [
        {
          sourceSystem: "github",
          entityKind: "pull_request",
          externalId: "42",
          capturedAt: now,
        },
      ],
    };

    expect(validateCanonicalRecord(incident)).toEqual([]);
  });

  it("requires evidence pointers for recommendations", () => {
    const recommendation: CanonicalRecommendationRecord = {
      canonicalId: "recommendation:hoverboard:command:retry-playbook",
      sourceSystem: "manual",
      entityKind: "recommendation",
      title: "Add retry-debugging command",
      summary: "Recommend a reusable command for retry-related incidents.",
      status: "candidate",
      tags: ["recommendation", "command"],
      relatedIds: ["incident:web:2026-03-10-publish"],
      updatedAt: now,
      recommendationKind: "command",
      state: "candidate",
      confidenceScore: 0.92,
      proposedDestination: "hoverboard",
      evidence: [],
    };

    expect(validateCanonicalRecord(recommendation)).toContain(
      "at least one evidence pointer is required",
    );
  });
});
