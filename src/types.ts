/** Shape returned by Granola internal API for each document. */
export interface GranolaDocument {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
  notes_markdown: string | null;
  notes_plain: string | null;
  overview: string | null;
  summary: string | null;
  people: GranolaPeople | null;
  google_calendar_event: GranolaCalendarEvent | null;
  transcript: GranolaTranscriptEntry[] | null;
  /** Which workspace list (folder) this doc belongs to, if any. */
  _listTitle?: string;
  /** Whether this doc was shared with the user (not owned). */
  _shared?: boolean;
}

export interface GranolaPeople {
  creator: GranolaPersonCreator | null;
  attendees: GranolaPersonAttendee[];
}

/** Creator always has a top-level `name`. */
export interface GranolaPersonCreator {
  name: string;
  email: string;
  details?: GranolaPersonDetails;
}

/** Attendees have `email` and `details` — name is nested. */
export interface GranolaPersonAttendee {
  email: string;
  details?: GranolaPersonDetails;
}

export interface GranolaPersonDetails {
  person?: {
    name?: { fullName?: string };
    avatar?: string;
    linkedin?: { handle?: string };
    employment?: { name?: string; title?: string };
  };
  company?: { name?: string };
}

export interface GranolaCalendarEvent {
  id: string | null;
  summary: string | null;
  start?: GranolaCalendarDateTime | null;
  end?: GranolaCalendarDateTime | null;
  attendees?: GranolaCalendarAttendee[];
}

export interface GranolaCalendarDateTime {
  dateTime: string;
  timeZone?: string;
}

export interface GranolaCalendarAttendee {
  email: string;
  responseStatus?: string;
  self?: boolean;
}

export interface GranolaTranscriptEntry {
  document_id: string;
  start_timestamp: string;
  end_timestamp: string;
  text: string;
  source: "microphone" | "speaker";
  id: string;
  is_final: boolean;
}

// ── API response shapes ──

export interface GranolaListResponse {
  docs: GranolaDocument[];
  next_cursor: string | null;
}

export interface GranolaSharedResponse {
  docs: GranolaDocument[];
}

export interface GranolaDocumentList {
  id: string;
  title: string;
  description: string | null;
  icon: { type: string; color: string; value: string } | null;
  parent_document_list_id: string | null;
  documents: GranolaDocument[];
}

export interface GranolaDocumentListsResponse {
  lists: GranolaDocumentList[];
}

// ── Workspace members ──

export interface WorkspaceMember {
  user_id: string;
  email: string;
  name: string;
  role: string;
  note_count: number;
}

export interface WorkspaceMembersResponse {
  members: WorkspaceMember[];
  invites: unknown[];
}

// ── Linear types ──

export interface LinearIssue {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  state: { name: string; type: string; color: string };
  priority: number;
  priorityLabel: string;
  assignee: { name: string; email: string } | null;
  project: { name: string } | null;
  labels: { nodes: { name: string; color: string }[] };
  createdAt: string;
  updatedAt: string;
}

export interface LinearProject {
  id: string;
  name: string;
  description: string | null;
  state: string;
  icon: string | null;
  color: string | null;
  progress: number;
  lead: { name: string; email: string } | null;
  startDate: string | null;
  targetDate: string | null;
}

// ── Figma types ──

export interface FigmaFile {
  key: string;
  name: string;
  thumbnail_url: string;
  last_modified: string;
  project_name: string;
}

export interface FigmaProject {
  id: number;
  name: string;
}

// ── Slack types ──

export interface SlackMessage {
  id: string;
  channel: string;
  channelName: string;
  user: string;
  userName: string;
  text: string;
  timestamp: string;
  threadTs: string | null;
  reactions: { name: string; count: number }[];
  permalink: string;
}

// ── GitHub types ──

export interface GitHubPR {
  id: number;
  number: number;
  title: string;
  body: string | null;
  state: "open" | "closed" | "merged";
  author: string;
  repo: string;
  headBranch: string;
  baseBranch: string;
  createdAt: string;
  updatedAt: string;
  mergedAt: string | null;
  labels: string[];
  reviewers: string[];
  url: string;
}

// ── Google Drive types ──

export interface GoogleDriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  webViewLink: string;
}

// ── HubSpot types ──

export interface HubSpotContact {
  id: string;
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  jobTitle: string | null;
  lifecycleStage: string | null;
  leadStatus: string | null;
  associatedCompanyIds: string[];
  createdAt: string | null;
  updatedAt: string | null;
}

export interface HubSpotCompany {
  id: string;
  name: string;
  domain: string | null;
  industry: string | null;
  numberOfEmployees: string | null;
  annualRevenue: string | null;
  lifecycleStage: string | null;
  leadStatus: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface HubSpotDeal {
  id: string;
  name: string;
  stage: string | null;
  amount: string | null;
  closeDate: string | null;
  pipeline: string | null;
  ownerId: string | null;
  associatedCompanyIds: string[];
  associatedContactIds: string[];
  createdAt: string | null;
  updatedAt: string | null;
}

export interface HubSpotMeeting {
  id: string;
  title: string;
  startTime: string | null;
  endTime: string | null;
  body: string | null;
  outcome: string | null;
  associatedContactIds: string[];
  associatedCompanyIds: string[];
  associatedDealIds: string[];
  createdAt: string | null;
  updatedAt: string | null;
}

export interface HubSpotTicket {
  id: string;
  subject: string;
  content: string | null;
  priority: string | null;
  pipelineStage: string | null;
  associatedContactIds: string[];
  associatedCompanyIds: string[];
  associatedDealIds: string[];
  createdAt: string | null;
  updatedAt: string | null;
}

export interface AskAdoraMessage {
  role: "user" | "assistant";
  content: string;
}

// ── Decision / Release / Health types ──

export interface Decision {
  id: string;
  title: string;
  context: string;
  decision: string;
  rationale: string;
  participants: string[];
  sourceMeetingId: string | null;
  date: string;
  status: "proposed" | "accepted" | "superseded";
  tags: string[];
}

export interface ReleaseNote {
  id: string;
  version: string;
  title: string;
  summary: string;
  features: string[];
  bugfixes: string[];
  breakingChanges: string[];
  date: string;
  prs: number[];
}

export interface HealthScore {
  score: number;
  tier: "healthy" | "at-risk" | "critical";
  customer_satisfaction: number;
  performance_goals: number;
  product_engagement: number;
  meeting_frequency: number;
  open_issues: number;
  sentiment?: number;
  last_calculated: string;
}

export interface CustomerAskSignal {
  summary: string;
  evidence: string;
  requestedBy?: string;
  impact?: "high" | "medium" | "low";
}

export interface SourceSyncCheckpoint {
  lastSuccessfulSyncAt: string | null;
  cursors: Record<string, string>;
  entityUpdatedAt: Record<string, string>;
}

export interface SourceSyncBudget {
  maxContainersPerRun: number;
  maxItemsPerContainer: number;
  maxItemsPerRun: number;
}

// ── Plugin settings ──

export interface GranolaAdoraSettings {
  syncIntervalMinutes: number;
  syncOnStartup: boolean;
  baseFolderPath: string;
  meetingsFolderName: string;
  ideasFolderName: string;
  customersFolderName: string;
  peopleFolderName: string;
  prioritiesFolderName: string;
  includeTranscript: boolean;
  autoTagEnabled: boolean;
  knownCustomers: string[];
  knownTopics: string[];
  lastSyncTimestamp: string | null;
  syncedDocIds: string[];
  /** Sync notes shared with you by teammates. */
  syncSharedDocs: boolean;
  /** Sync workspace folders (document lists) visible to you. */
  syncWorkspaceLists: boolean;
  linearApiKey: string;
  syncLinear: boolean;
  autoCreateLinearFromCustomerAsks: boolean;
  autoCreateLinearFromCustomerAsksDryRun: boolean;
  linearFolderName: string;
  figmaAccessToken: string;
  figmaTeamId: string;
  syncFigma: boolean;
  designsFolderName: string;
  claudeApiKey: string;
  aiEnabled: boolean;
  aiModel: string;
  digestsFolderName: string;
  syncSlack: boolean;
  slackBotToken: string;
  slackFolderName: string;
  syncGithub: boolean;
  githubToken: string;
  githubOrg: string;
  githubRepoAllowlist: string[];
  githubFolderName: string;
  syncGoogleDrive: boolean;
  googleDriveClientId: string;
  googleDriveClientSecret: string;
  googleDriveRefreshToken: string;
  googleDriveAccessToken: string;
  googleDriveFolderId: string;
  googleDriveFolderName: string;
  syncHubspot: boolean;
  hubspotAccessToken: string;
  hubspotFolderName: string;
  healthScoreEnabled: boolean;
  healthWeightCustomerSatisfaction: number;
  healthWeightPerformanceGoals: number;
  healthWeightProductEngagement: number;
  healthCustomerSatisfactionSentimentWeight: number;
  healthCustomerSatisfactionIssuesWeight: number;
  healthPerformanceGoalsIssuesWeight: number;
  healthPerformanceGoalsCrmWeight: number;
  healthProductEngagementMeetingWeight: number;
  healthProductEngagementSentimentWeight: number;
  healthTierHealthyMin: number;
  healthTierAtRiskMin: number;
  decisionsFolderName: string;
  releaseNotesFolderName: string;
  aiModelFast: string;
  aiModelDeep: string;
  // ── Outbound Notifications ──
  /** Post digests, alerts, and asks to Slack / Notion. */
  outboundEnabled: boolean;
  /** Designated brain — only this vault sends outbound notifications. */
  isDesignatedBrain: boolean;
  // Slack outbound
  notifySlackEnabled: boolean;
  slackDigestChannelId: string;
  slackHealthAlertChannelId: string;
  /** Health score threshold — alert when a customer drops below this. */
  healthAlertThreshold: number;
  // Notion outbound
  notifyNotionEnabled: boolean;
  /** Notion integration token (Internal Integration). */
  notionApiToken: string;
  /** Notion parent page ID where digests are published. */
  notionDigestParentId: string;
  /** Notion database ID where customer asks are published. */
  notionCustomerAsksDbId: string;
  notionIncidentsDbId: string;
  sourceSyncCheckpoints: Record<string, SourceSyncCheckpoint>;
  sourceSyncBudgets: Record<string, SourceSyncBudget>;
  /** Tracks already-notified items to prevent duplicates: key = itemType:itemId, value = ISO timestamp. */
  notifiedItems: Record<string, string>;
}

export interface TeamConfigTemplate {
  syncIntervalMinutes: number;
  syncOnStartup: boolean;
  baseFolderPath: string;
  meetingsFolderName: string;
  ideasFolderName: string;
  customersFolderName: string;
  peopleFolderName: string;
  prioritiesFolderName: string;
  includeTranscript: boolean;
  autoTagEnabled: boolean;
  knownCustomers: string[];
  knownTopics: string[];
  syncSharedDocs: boolean;
  syncWorkspaceLists: boolean;
  syncLinear: boolean;
  autoCreateLinearFromCustomerAsks: boolean;
  autoCreateLinearFromCustomerAsksDryRun: boolean;
  linearFolderName: string;
  syncFigma: boolean;
  designsFolderName: string;
  aiEnabled: boolean;
  aiModel: string;
  aiModelFast: string;
  aiModelDeep: string;
  digestsFolderName: string;
  syncSlack: boolean;
  slackFolderName: string;
  syncGithub: boolean;
  githubOrg: string;
  githubRepoAllowlist: string[];
  githubFolderName: string;
  syncGoogleDrive: boolean;
  googleDriveFolderId: string;
  googleDriveFolderName: string;
  syncHubspot: boolean;
  hubspotFolderName: string;
  healthScoreEnabled: boolean;
  healthWeightCustomerSatisfaction: number;
  healthWeightPerformanceGoals: number;
  healthWeightProductEngagement: number;
  healthCustomerSatisfactionSentimentWeight: number;
  healthCustomerSatisfactionIssuesWeight: number;
  healthPerformanceGoalsIssuesWeight: number;
  healthPerformanceGoalsCrmWeight: number;
  healthProductEngagementMeetingWeight: number;
  healthProductEngagementSentimentWeight: number;
  healthTierHealthyMin: number;
  healthTierAtRiskMin: number;
  decisionsFolderName: string;
  releaseNotesFolderName: string;
  outboundEnabled: boolean;
  isDesignatedBrain: boolean;
  notifySlackEnabled: boolean;
  notifyNotionEnabled: boolean;
  healthAlertThreshold: number;
  notionIncidentsDbId: string;
  sourceSyncBudgets: Record<string, SourceSyncBudget>;
}

export const DEFAULT_SETTINGS: GranolaAdoraSettings = {
  syncIntervalMinutes: 30,
  syncOnStartup: true,
  baseFolderPath: "Adora",
  meetingsFolderName: "Meetings",
  ideasFolderName: "Ideas",
  customersFolderName: "Customers",
  peopleFolderName: "People",
  prioritiesFolderName: "Priorities",
  includeTranscript: false,
  autoTagEnabled: true,
  knownCustomers: [],
  knownTopics: [
    "ADR",
    "reporting",
    "onboarding",
    "creative",
    "design",
    "billing",
    "API",
    "mobile",
    "integrations",
    "analytics",
    "campaign",
    "automation",
  ],
  lastSyncTimestamp: null,
  syncedDocIds: [],
  syncSharedDocs: true,
  syncWorkspaceLists: true,
  linearApiKey: "",
  syncLinear: false,
  autoCreateLinearFromCustomerAsks: false,
  autoCreateLinearFromCustomerAsksDryRun: false,
  linearFolderName: "Linear",
  figmaAccessToken: "",
  figmaTeamId: "",
  syncFigma: false,
  designsFolderName: "Designs",
  claudeApiKey: "",
  aiEnabled: false,
  aiModel: "claude-sonnet-4-20250514",
  digestsFolderName: "Digests",
  syncSlack: false,
  slackBotToken: "",
  slackFolderName: "Slack",
  syncGithub: false,
  githubToken: "",
  githubOrg: "",
  githubRepoAllowlist: [],
  githubFolderName: "GitHub",
  syncGoogleDrive: false,
  googleDriveClientId: "",
  googleDriveClientSecret: "",
  googleDriveRefreshToken: "",
  googleDriveAccessToken: "",
  googleDriveFolderId: "",
  googleDriveFolderName: "Google Drive",
  syncHubspot: false,
  hubspotAccessToken: "",
  hubspotFolderName: "HubSpot",
  healthScoreEnabled: false,
  healthWeightCustomerSatisfaction: 33.3,
  healthWeightPerformanceGoals: 33.3,
  healthWeightProductEngagement: 33.4,
  healthCustomerSatisfactionSentimentWeight: 0.7,
  healthCustomerSatisfactionIssuesWeight: 0.3,
  healthPerformanceGoalsIssuesWeight: 0.5,
  healthPerformanceGoalsCrmWeight: 0.5,
  healthProductEngagementMeetingWeight: 0.7,
  healthProductEngagementSentimentWeight: 0.3,
  healthTierHealthyMin: 67,
  healthTierAtRiskMin: 34,
  decisionsFolderName: "Decisions",
  releaseNotesFolderName: "Releases",
  aiModelFast: "claude-haiku-4-20250414",
  aiModelDeep: "claude-sonnet-4-20250514",
  outboundEnabled: false,
  isDesignatedBrain: false,
  notifySlackEnabled: false,
  slackDigestChannelId: "",
  slackHealthAlertChannelId: "",
  healthAlertThreshold: 40,
  notifyNotionEnabled: false,
  notionApiToken: "",
  notionDigestParentId: "",
  notionCustomerAsksDbId: "",
  notionIncidentsDbId: "",
  sourceSyncCheckpoints: {},
  sourceSyncBudgets: {
    granola: { maxContainersPerRun: 50, maxItemsPerContainer: 100, maxItemsPerRun: 500 },
    linear: { maxContainersPerRun: 25, maxItemsPerContainer: 250, maxItemsPerRun: 1000 },
    slack: { maxContainersPerRun: 25, maxItemsPerContainer: 200, maxItemsPerRun: 1000 },
    github: { maxContainersPerRun: 20, maxItemsPerContainer: 100, maxItemsPerRun: 1000 },
    gdrive: { maxContainersPerRun: 10, maxItemsPerContainer: 100, maxItemsPerRun: 500 },
    hubspot: { maxContainersPerRun: 10, maxItemsPerContainer: 250, maxItemsPerRun: 1000 },
    notion: { maxContainersPerRun: 10, maxItemsPerContainer: 100, maxItemsPerRun: 500 },
  },
  notifiedItems: {},
};

export interface SyncResult {
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
  linearIssues: number;
  linearProjects: number;
  figmaFiles: number;
  slackMessages: number;
  githubPRs: number;
  googleDriveDocs: number;
  hubspotContacts: number;
  hubspotCompanies: number;
  hubspotDeals: number;
  hubspotMeetings: number;
  hubspotTickets: number;
}

export interface ExtractedTags {
  customers: string[];
  topics: string[];
  actionItems: string[];
  people: string[];
}

// ── Helpers ──

/** Safely extract display name from an attendee. */
export function getAttendeeName(attendee: GranolaPersonAttendee): string {
  return (
    attendee.details?.person?.name?.fullName ?? attendee.email.split("@")[0]
  );
}

/** Safely extract company name from an attendee. */
export function getAttendeeCompany(
  attendee: GranolaPersonAttendee,
): string | null {
  return attendee.details?.company?.name ?? null;
}
