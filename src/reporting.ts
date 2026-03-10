export interface RecommendationReviewItem {
  title: string;
  targetKind: "skill" | "command";
  reviewState: string;
  confidenceScore: number;
}

export interface IncidentReviewItem {
  title: string;
  severity: string;
  status: string;
  repo: string;
  learningSummary?: string;
}

export interface ReviewSummaryInput {
  generatedAt: string;
  recommendations: RecommendationReviewItem[];
  incidents: IncidentReviewItem[];
}

export function renderReviewSummary(input: ReviewSummaryInput): string {
  const pendingRecommendations = input.recommendations.filter(
    (item) => item.reviewState !== "exported" && item.reviewState !== "rejected",
  );
  const resolvedIncidents = input.incidents.filter(
    (item) => item.status.toLowerCase() === "resolved",
  );

  const lines = [
    `# Bot Review Summary — ${input.generatedAt.split("T")[0]}`,
    "",
    "## Overview",
    `- Recommendations: ${input.recommendations.length}`,
    `- Pending recommendations: ${pendingRecommendations.length}`,
    `- Incidents: ${input.incidents.length}`,
    `- Resolved incidents: ${resolvedIncidents.length}`,
    "",
    "## Pending Recommendations",
  ];

  if (pendingRecommendations.length === 0) {
    lines.push("- No pending recommendations.");
  } else {
    for (const item of pendingRecommendations) {
      lines.push(
        `- [${item.targetKind}] ${item.title} — ${item.reviewState} (${item.confidenceScore.toFixed(2)})`,
      );
    }
  }

  lines.push("", "## Incidents");

  if (input.incidents.length === 0) {
    lines.push("- No incidents available.");
  } else {
    for (const item of input.incidents) {
      const learning = item.learningSummary ? ` — learning: ${item.learningSummary}` : "";
      lines.push(
        `- [${item.severity}] ${item.title} (${item.repo}, ${item.status})${learning}`,
      );
    }
  }

  lines.push("");
  return lines.join("\n");
}
