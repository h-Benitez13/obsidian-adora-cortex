import {
  EasyTicketHeuristicInput,
  EasyTicketHeuristicResult,
} from "./ticket-scoring";

export interface TicketRefinementResult {
  summary: string;
  confidenceScore: number;
  missingContext: string[];
  nextAction: "promote" | "review" | "reject";
  rationale: string;
  reviewRequired: boolean;
  parseError?: string;
}

export function shouldRunTicketRefinement(
  heuristic: EasyTicketHeuristicResult,
): boolean {
  return heuristic.easy;
}

export function buildTicketRefinementPrompt(
  input: EasyTicketHeuristicInput,
  heuristic: EasyTicketHeuristicResult,
): string {
  return [
    "You are refining an easy-ticket heuristic result for a coding bot.",
    "Only refine tickets that already passed heuristic gating.",
    "Return valid JSON with this shape:",
    '{"summary":"...","confidenceScore":0.0,"missingContext":["..."],"nextAction":"promote|review|reject","rationale":"..."}',
    "",
    `Source Canonical ID: ${input.sourceCanonicalId}`,
    `Repo: ${input.repo}`,
    `Changed file count: ${input.changedFileCount}`,
    `Affected areas: ${input.affectedAreas.join(", ") || "none"}`,
    `Has tests: ${input.hasTests}`,
    `Deterministic verification: ${input.hasDeterministicVerification}`,
    `Required context available: ${input.requiredContextAvailable}`,
    `Repeated pattern count: ${input.repeatedPatternCount}`,
    `Fix type: ${input.fixType}`,
    "",
    `Heuristic score: ${heuristic.score}`,
    `Passed rules: ${heuristic.passedRules.join(", ") || "none"}`,
    `Blocking reasons: ${heuristic.blockingReasons.join(", ") || "none"}`,
    `Heuristic rationale: ${heuristic.rationale.join(" | ") || "none"}`,
  ].join("\n");
}

export function fallbackTicketRefinement(parseError: string): TicketRefinementResult {
  return {
    summary: "LLM refinement unavailable; keep ticket in review state.",
    confidenceScore: 0,
    missingContext: ["llm-refinement-parse-failed"],
    nextAction: "review",
    rationale: "The model response could not be parsed safely, so the ticket remains review-required.",
    reviewRequired: true,
    parseError,
  };
}

export function parseTicketRefinementResponse(
  response: string,
): TicketRefinementResult {
  try {
    const cleaned = response
      .replace(/```json?\n?/g, "")
      .replace(/```/g, "")
      .trim();
    const parsed = JSON.parse(cleaned) as Partial<TicketRefinementResult>;

    if (
      typeof parsed.summary !== "string" ||
      typeof parsed.confidenceScore !== "number" ||
      !Array.isArray(parsed.missingContext) ||
      typeof parsed.rationale !== "string" ||
      !["promote", "review", "reject"].includes(parsed.nextAction ?? "")
    ) {
      return fallbackTicketRefinement("invalid-structure");
    }

    const nextAction = parsed.nextAction as TicketRefinementResult["nextAction"];
    const confidenceScore = Math.max(0, Math.min(1, parsed.confidenceScore));

    return {
      summary: parsed.summary.trim(),
      confidenceScore,
      missingContext: parsed.missingContext
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter((item) => item.length > 0),
      nextAction,
      rationale: parsed.rationale.trim(),
      reviewRequired: nextAction !== "promote" || confidenceScore < 0.85,
    };
  } catch {
    return fallbackTicketRefinement("invalid-json");
  }
}
