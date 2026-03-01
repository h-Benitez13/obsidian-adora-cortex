/**
 * Granola API data types — mirrors the public API schema at https://public-api.granola.ai
 */

// ─── Granola API Response Types ─────────────────────────────────────────────

export interface GranolaNote {
  id: string; // Pattern: ^not_[a-zA-Z0-9]{14}$
  object: "note";
  title: string | null;
  owner: GranolaUser;
  created_at: string; // ISO 8601
  updated_at: string; // ISO 8601
  calendar_event: GranolaCalendarEvent | null;
  attendees: GranolaUser[];
  folder_membership: GranolaFolder[];
  summary_text: string;
  summary_markdown: string | null;
  transcript: GranolaTranscriptEntry[] | null;
}

export interface GranolaUser {
  name: string | null;
  email: string;
}

export interface GranolaCalendarEvent {
  event_title: string | null;
  invitees: GranolaCalendarInvitee[];
  organiser: string | null; // email
  calendar_event_id: string | null;
  scheduled_start_time: string | null; // ISO 8601
  scheduled_end_time: string | null; // ISO 8601
}

export interface GranolaCalendarInvitee {
  name: string | null;
  email: string;
}

export interface GranolaTranscriptEntry {
  speaker: {
    source: "microphone" | "speaker";
  };
  text: string;
  start_time: string;
  end_time: string;
}

export interface GranolaFolder {
  id: string; // Pattern: ^fol_[a-zA-Z0-9]{14}$
  object: "folder";
  name: string;
}

export interface GranolaListResponse {
  object: "list";
  data: GranolaNote[];
  next_cursor: string | null;
}

// ─── Plugin Internal Types ──────────────────────────────────────────────────

export interface GranolaAdoraSettings {
  apiKey: string;
  syncIntervalMinutes: number;
  syncOnStartup: boolean;
  baseFolderPath: string;
  meetingsFolderName: string;
  ideasFolderName: string;
  customersFolderName: string;
  prioritiesFolderName: string;
  includeTranscript: boolean;
  autoTagEnabled: boolean;
  knownCustomers: string[]; // company/person names to auto-detect
  knownTopics: string[]; // product areas or themes to auto-detect
  lastSyncTimestamp: string | null; // ISO 8601 — used for incremental sync
  syncedNoteIds: string[]; // track which notes we've already synced
}

export const DEFAULT_SETTINGS: GranolaAdoraSettings = {
  apiKey: "",
  syncIntervalMinutes: 30,
  syncOnStartup: true,
  baseFolderPath: "Adora",
  meetingsFolderName: "Meetings",
  ideasFolderName: "Ideas",
  customersFolderName: "Customers",
  prioritiesFolderName: "Priorities",
  includeTranscript: false,
  autoTagEnabled: true,
  knownCustomers: [],
  knownTopics: [],
  lastSyncTimestamp: null,
  syncedNoteIds: []
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
