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
};

export interface SyncResult {
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
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
