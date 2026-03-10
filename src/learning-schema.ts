export const SOURCE_SYSTEMS = [
  "github",
  "linear",
  "slack",
  "granola",
  "hubspot",
  "notion",
  "gdrive",
  "figma",
  "manual",
] as const;

export const ENTITY_KINDS = [
  "pull_request",
  "issue",
  "project",
  "support_signal",
  "meeting",
  "incident",
  "learning",
  "recommendation",
  "hoverboard_proposal",
] as const;

export const RECOMMENDATION_KINDS = ["skill", "command"] as const;

export const RECOMMENDATION_STATES = [
  "candidate",
  "reviewing",
  "approved",
  "rejected",
  "exported",
] as const;

export const ROOT_CAUSE_CATEGORIES = [
  "code_regression",
  "missing_context",
  "config_drift",
  "dependency_change",
  "process_gap",
  "unknown",
] as const;

export type SourceSystem = (typeof SOURCE_SYSTEMS)[number];
export type EntityKind = (typeof ENTITY_KINDS)[number];
export type RecommendationKind = (typeof RECOMMENDATION_KINDS)[number];
export type RecommendationState = (typeof RECOMMENDATION_STATES)[number];
export type RootCauseCategory = (typeof ROOT_CAUSE_CATEGORIES)[number];

export const SOURCE_ENTITY_KIND_MAP: Record<SourceSystem, EntityKind[]> = {
  github: ["pull_request"],
  linear: ["issue", "project", "incident"],
  slack: ["support_signal", "incident"],
  granola: ["meeting", "learning"],
  hubspot: ["support_signal", "incident"],
  notion: ["incident", "learning", "recommendation"],
  gdrive: ["learning"],
  figma: ["learning"],
  manual: [
    "support_signal",
    "incident",
    "learning",
    "recommendation",
    "hoverboard_proposal",
  ],
};

export interface EvidencePointer {
  sourceSystem: SourceSystem;
  entityKind: EntityKind;
  externalId: string;
  obsidianPath?: string;
  url?: string;
  excerpt?: string;
  capturedAt: string;
}

export interface CanonicalRecordBase {
  canonicalId: string;
  sourceSystem: SourceSystem;
  entityKind: EntityKind;
  title: string;
  summary: string;
  status: string;
  repo?: string;
  tags: string[];
  evidence: EvidencePointer[];
  relatedIds: string[];
  openedAt?: string;
  updatedAt: string;
}

export interface CanonicalIncidentRecord extends CanonicalRecordBase {
  entityKind: "incident";
  severity: "low" | "medium" | "high" | "critical";
  rootCauseCategory: RootCauseCategory;
  fixSummary: string;
  learningSummary: string;
}

export interface CanonicalRecommendationRecord extends CanonicalRecordBase {
  entityKind: "recommendation";
  recommendationKind: RecommendationKind;
  state: RecommendationState;
  confidenceScore: number;
  proposedDestination: "hoverboard";
}

export type CanonicalRecord =
  | CanonicalRecordBase
  | CanonicalIncidentRecord
  | CanonicalRecommendationRecord;

function isIsoDate(value: string | undefined): boolean {
  if (!value) return false;
  return !Number.isNaN(Date.parse(value));
}

export function validateCanonicalRecord(record: CanonicalRecord): string[] {
  const errors: string[] = [];

  if (!record.canonicalId.trim()) errors.push("canonicalId is required");
  if (!record.title.trim()) errors.push("title is required");
  if (!record.summary.trim()) errors.push("summary is required");
  if (!record.status.trim()) errors.push("status is required");
  if (!record.updatedAt || !isIsoDate(record.updatedAt)) {
    errors.push("updatedAt must be an ISO timestamp");
  }

  if (!SOURCE_ENTITY_KIND_MAP[record.sourceSystem].includes(record.entityKind)) {
    errors.push(
      `${record.sourceSystem} cannot emit entity kind ${record.entityKind}`,
    );
  }

  if (record.evidence.length === 0) {
    errors.push("at least one evidence pointer is required");
  }

  for (const evidence of record.evidence) {
    if (!evidence.externalId.trim()) {
      errors.push("evidence.externalId is required");
    }
    if (!isIsoDate(evidence.capturedAt)) {
      errors.push("evidence.capturedAt must be an ISO timestamp");
    }
  }

  if (record.entityKind === "incident") {
    const incident = record as CanonicalIncidentRecord;
    if (!incident.fixSummary.trim()) {
      errors.push("incident.fixSummary is required");
    }
    if (!incident.learningSummary.trim()) {
      errors.push("incident.learningSummary is required");
    }
  }

  if (record.entityKind === "recommendation") {
    const recommendation = record as CanonicalRecommendationRecord;
    if (
      recommendation.confidenceScore < 0 ||
      recommendation.confidenceScore > 1
    ) {
      errors.push("recommendation.confidenceScore must be between 0 and 1");
    }
    if (recommendation.evidence.length === 0) {
      errors.push("recommendation must include evidence pointers");
    }
  }

  return errors;
}
