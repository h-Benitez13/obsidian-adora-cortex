import { requestUrl, RequestUrlParam } from "obsidian";
import { GranolaNote, GranolaListResponse } from "./types";

const BASE_URL = "https://public-api.granola.ai";
const MAX_PAGE_SIZE = 30;

/**
 * Granola Enterprise API client.
 *
 * Uses Obsidian's built-in `requestUrl` so network calls work on all
 * platforms (desktop + mobile) without CORS issues.
 *
 * Rate limits: 25 burst / 5 per second — we add a small delay between
 * paginated fetches to stay well within limits.
 */
export class GranolaApiClient {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /** Update the API key (e.g. when user changes settings). */
  setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
  }

  // ─── Public Methods ───────────────────────────────────────────────

  /**
   * Fetch all notes, optionally filtering by updated_after for incremental sync.
   * Handles pagination automatically.
   */
  async fetchAllNotes(updatedAfter?: string): Promise<GranolaNote[]> {
    const allNotes: GranolaNote[] = [];
    let cursor: string | null = null;

    do {
      const response = await this.listNotes({
        updatedAfter,
        cursor: cursor ?? undefined,
        pageSize: MAX_PAGE_SIZE
      });

      allNotes.push(...response.data);
      cursor = response.next_cursor;

      // Respect rate limits — small pause between pages
      if (cursor) {
        await this.sleep(250);
      }
    } while (cursor);

    return allNotes;
  }

  /**
   * Fetch a single note by ID, optionally including the full transcript.
   */
  async fetchNote(noteId: string, includeTranscript = false): Promise<GranolaNote> {
    const params: Record<string, string> = {};
    if (includeTranscript) {
      params["include"] = "transcript";
    }
    return this.request<GranolaNote>(`/v1/notes/${noteId}`, params);
  }

  // ─── Private Helpers ──────────────────────────────────────────────

  private async listNotes(options: {
    updatedAfter?: string;
    createdAfter?: string;
    createdBefore?: string;
    cursor?: string;
    pageSize?: number;
  }): Promise<GranolaListResponse> {
    const params: Record<string, string> = {};

    if (options.updatedAfter) params["updated_after"] = options.updatedAfter;
    if (options.createdAfter) params["created_after"] = options.createdAfter;
    if (options.createdBefore) params["created_before"] = options.createdBefore;
    if (options.cursor) params["cursor"] = options.cursor;
    if (options.pageSize) params["page_size"] = String(options.pageSize);

    return this.request<GranolaListResponse>("/v1/notes", params);
  }

  private async request<T>(path: string, params?: Record<string, string>): Promise<T> {
    let url = `${BASE_URL}${path}`;

    if (params && Object.keys(params).length > 0) {
      const query = new URLSearchParams(params).toString();
      url = `${url}?${query}`;
    }

    const reqParams: RequestUrlParam = {
      url,
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json"
      }
    };

    const response = await requestUrl(reqParams);

    if (response.status >= 400) {
      throw new Error(`Granola API error ${response.status}: ${response.text}`);
    }

    return response.json as T;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
