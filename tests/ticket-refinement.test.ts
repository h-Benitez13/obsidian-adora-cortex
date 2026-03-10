import { describe, expect, it } from "vitest";

import {
  buildTicketRefinementPrompt,
  parseTicketRefinementResponse,
  shouldRunTicketRefinement,
} from "../src/ticket-refinement";
import { scoreEasyTicketHeuristics } from "../src/ticket-scoring";

describe("ticket refinement", () => {
  const heuristic = scoreEasyTicketHeuristics({
    sourceCanonicalId: "linear:WEB-42",
    repo: "web",
    changedFileCount: 2,
    affectedAreas: ["publishing"],
    hasTests: true,
    hasDeterministicVerification: true,
    requiredContextAvailable: true,
    touchesInfrastructure: false,
    touchesAuthOrPermissions: false,
    touchesDataModel: false,
    repeatedPatternCount: 3,
    fixType: "small_bugfix",
  });

  it("only runs refinement for heuristically eligible tickets", () => {
    expect(shouldRunTicketRefinement(heuristic)).toBe(true);
    expect(
      shouldRunTicketRefinement(
        scoreEasyTicketHeuristics({
          sourceCanonicalId: "linear:IAC-9",
          repo: "iac",
          changedFileCount: 8,
          affectedAreas: ["terraform", "deployments"],
          hasTests: true,
          hasDeterministicVerification: true,
          requiredContextAvailable: true,
          touchesInfrastructure: true,
          touchesAuthOrPermissions: false,
          touchesDataModel: false,
          repeatedPatternCount: 1,
          fixType: "small_bugfix",
        }),
      ),
    ).toBe(false);
  });

  it("builds a structured prompt and parses valid refinement JSON", () => {
    const prompt = buildTicketRefinementPrompt(
      {
        sourceCanonicalId: "linear:WEB-42",
        repo: "web",
        changedFileCount: 2,
        affectedAreas: ["publishing"],
        hasTests: true,
        hasDeterministicVerification: true,
        requiredContextAvailable: true,
        touchesInfrastructure: false,
        touchesAuthOrPermissions: false,
        touchesDataModel: false,
        repeatedPatternCount: 3,
        fixType: "small_bugfix",
      },
      heuristic,
    );

    expect(prompt).toContain("Return valid JSON");
    expect(prompt).toContain("Heuristic score");

    const parsed = parseTicketRefinementResponse(`{
      "summary": "Small retry regression with strong existing test coverage.",
      "confidenceScore": 0.91,
      "missingContext": [],
      "nextAction": "promote",
      "rationale": "The issue is bounded, testable, and matches a repeated known pattern."
    }`);

    expect(parsed.nextAction).toBe("promote");
    expect(parsed.reviewRequired).toBe(false);
    expect(parsed.confidenceScore).toBe(0.91);
  });

  it("falls back safely when model output is malformed", () => {
    const parsed = parseTicketRefinementResponse("not valid json");

    expect(parsed.nextAction).toBe("review");
    expect(parsed.reviewRequired).toBe(true);
    expect(parsed.parseError).toBe("invalid-json");
  });
});
