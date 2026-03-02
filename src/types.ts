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
  meeting_frequency: number;
  open_issues: number;
  sentiment?: number;
  last_calculated: string;
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
  githubFolderName: string;
  syncGoogleDrive: boolean;
  googleDriveClientId: string;
  googleDriveClientSecret: string;
  googleDriveRefreshToken: string;
  googleDriveAccessToken: string;
  googleDriveFolderId: string;
  googleDriveFolderName: string;
  healthScoreEnabled: boolean;
  decisionsFolderName: string;
  releaseNotesFolderName: string;
  aiModelFast: string;
  aiModelDeep: string;
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
  githubFolderName: string;
  syncGoogleDrive: boolean;
  googleDriveFolderId: string;
  googleDriveFolderName: string;
  healthScoreEnabled: boolean;
  decisionsFolderName: string;
  releaseNotesFolderName: string;
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
  githubFolderName: "GitHub",
  syncGoogleDrive: false,
  googleDriveClientId: "",
  googleDriveClientSecret: "",
  googleDriveRefreshToken: "",
  googleDriveAccessToken: "",
  googleDriveFolderId: "",
  googleDriveFolderName: "Google Drive",
  healthScoreEnabled: false,
  decisionsFolderName: "Decisions",
  releaseNotesFolderName: "Releases",
  aiModelFast: "claude-haiku-4-20250414",
  aiModelDeep: "claude-sonnet-4-20250514",
};

export interface SyncResult {
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
  slackMessages: number;
  githubPRs: number;
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
