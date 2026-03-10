import {
  CanonicalIncidentRecord,
  EvidencePointer,
} from "./learning-schema";
import {
  EasyTicketHeuristicInput,
  EasyTicketFixType,
} from "./ticket-scoring";

function toString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function toNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function toBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }

  const single = toString(value);
  return single ? [single] : [];
}

function buildEvidencePointers(
  filePath: string,
  frontmatter: Record<string, unknown>,
  body: string,
): EvidencePointer[] {
  const evidenceUrls = [
    ...toStringArray(frontmatter.evidence_urls),
    ...toStringArray(frontmatter.source_urls),
  ];
  const singleUrl = toString(frontmatter.source_url);
  if (singleUrl) evidenceUrls.push(singleUrl);

  const excerpt = body.trim().slice(0, 240);
  const capturedAt = new Date().toISOString();
  const evidence: EvidencePointer[] = [
    {
      sourceSystem: "manual",
      entityKind: "learning",
      externalId: filePath,
      obsidianPath: filePath,
      excerpt: excerpt || undefined,
      capturedAt,
    },
  ];

  for (const url of evidenceUrls) {
    evidence.push({
      sourceSystem: "manual",
      entityKind: "learning",
      externalId: url,
      url,
      capturedAt,
    });
  }

  return evidence;
}

function toFixType(value: unknown): EasyTicketFixType {
  const allowed: EasyTicketFixType[] = [
    "copy_change",
    "config_small",
    "ui_text",
    "small_bugfix",
    "unknown",
  ];
  return allowed.includes(value as EasyTicketFixType)
    ? (value as EasyTicketFixType)
    : "unknown";
}

export interface ActiveNoteRecommendationSeed {
  title: string;
  summary: string;
  recommendationKind: "skill" | "command";
  sourceCanonicalId: string;
  relatedIds: string[];
  repo: string;
  evidence: EvidencePointer[];
  heuristicInput: EasyTicketHeuristicInput;
}

export function buildRecommendationSeedFromActiveNote(
  filePath: string,
  titleFallback: string,
  frontmatter: Record<string, unknown>,
  body: string,
): ActiveNoteRecommendationSeed {
  const title = toString(frontmatter.title) ?? titleFallback;
  const summary =
    toString(frontmatter.summary) ?? body.trim().split("\n")[0] ?? titleFallback;
  const repo = toString(frontmatter.repo) ?? "";
  const recommendationKind =
    frontmatter.recommendation_kind === "skill" ? "skill" : "command";
  const sourceCanonicalId =
    toString(frontmatter.source_canonical_id) ??
    toString(frontmatter.canonical_id) ??
    filePath;
  const relatedIds = [
    ...toStringArray(frontmatter.related_ids),
    ...toStringArray(frontmatter.related_issues),
  ];

  return {
    title,
    summary,
    recommendationKind,
    sourceCanonicalId,
    relatedIds,
    repo,
    evidence: buildEvidencePointers(filePath, frontmatter, body),
    heuristicInput: {
      sourceCanonicalId,
      repo,
      changedFileCount: toNumber(frontmatter.changed_file_count, 99),
      affectedAreas: toStringArray(frontmatter.affected_areas),
      hasTests: toBoolean(frontmatter.has_tests, false),
      hasDeterministicVerification: toBoolean(
        frontmatter.has_deterministic_verification,
        false,
      ),
      requiredContextAvailable: toBoolean(
        frontmatter.required_context_available,
        false,
      ),
      touchesInfrastructure: toBoolean(frontmatter.touches_infrastructure, true),
      touchesAuthOrPermissions: toBoolean(frontmatter.touches_auth, false),
      touchesDataModel: toBoolean(frontmatter.touches_data_model, false),
      repeatedPatternCount: toNumber(frontmatter.repeated_pattern_count, 0),
      fixType: toFixType(frontmatter.fix_type),
    },
  };
}

export function buildIncidentRecordFromActiveNote(
  filePath: string,
  titleFallback: string,
  frontmatter: Record<string, unknown>,
  body: string,
): CanonicalIncidentRecord {
  const title = toString(frontmatter.title) ?? titleFallback;
  const summary =
    toString(frontmatter.summary) ?? body.trim().split("\n")[0] ?? titleFallback;

  return {
    canonicalId:
      toString(frontmatter.canonical_id) ??
      toString(frontmatter.source_canonical_id) ??
      `incident:${filePath}`,
    sourceSystem: "manual",
    entityKind: "incident",
    title,
    summary,
    status: toString(frontmatter.status) ?? "open",
    repo: toString(frontmatter.repo),
    tags: ["incident"],
    relatedIds: [
      ...toStringArray(frontmatter.related_ids),
      ...toStringArray(frontmatter.related_issues),
    ],
    updatedAt:
      toString(frontmatter.updated) ??
      toString(frontmatter.generated_at) ??
      new Date().toISOString(),
    severity:
      (toString(frontmatter.severity) as CanonicalIncidentRecord["severity"]) ??
      "medium",
    rootCauseCategory:
      (toString(frontmatter.root_cause_category) as CanonicalIncidentRecord["rootCauseCategory"]) ??
      "unknown",
    fixSummary: toString(frontmatter.fix_summary) ?? "",
    learningSummary: toString(frontmatter.learning_summary) ?? "",
    evidence: buildEvidencePointers(filePath, frontmatter, body),
  };
}
