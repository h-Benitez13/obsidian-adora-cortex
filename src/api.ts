import { requestUrl, RequestUrlParam, Platform } from "obsidian";
import {
  GranolaDocument,
  GranolaListResponse,
  GranolaSharedResponse,
  GranolaDocumentList,
  GranolaDocumentListsResponse,
  GranolaTranscriptEntry,
  WorkspaceMember,
  WorkspaceMembersResponse,
} from "./types";

const API_BASE = "https://api.granola.ai";
const CLIENT_VERSION = "5.354.0";
const PAGE_SIZE = 100;
const WORKSPACE_ID = "eb6da842-8cde-4b51-9c66-46313a1585d7";

export class GranolaApiClient {
  private token: string | null = null;

  async ensureAuthenticated(): Promise<boolean> {
    this.token = this.readLocalToken();
    return this.token !== null;
  }

  async fetchMyDocuments(): Promise<GranolaDocument[]> {
    this.requireAuth();

    const allDocs: GranolaDocument[] = [];
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const response = await this.postRequest<GranolaListResponse>(
        "/v2/get-documents",
        {
          limit: PAGE_SIZE,
          offset,
          include_last_viewed_panel: false,
          include_panels: false,
        },
      );

      allDocs.push(...response.docs);

      if (response.docs.length < PAGE_SIZE || !response.next_cursor) {
        hasMore = false;
      } else {
        offset += PAGE_SIZE;
        await this.sleep(250);
      }
    }

    return allDocs;
  }

  async fetchSharedDocuments(): Promise<GranolaDocument[]> {
    this.requireAuth();
    const response = await this.postRequest<GranolaSharedResponse>(
      "/v1/get-shared-documents",
      {
        limit: PAGE_SIZE,
        offset: 0,
      },
    );
    return response.docs.map((d) => ({ ...d, _shared: true }));
  }

  async fetchDocumentLists(): Promise<GranolaDocumentList[]> {
    this.requireAuth();
    const response = await this.postRequest<GranolaDocumentListsResponse>(
      "/v2/get-document-lists",
      {},
    );
    return response.lists;
  }

  async fetchWorkspaceMembers(): Promise<WorkspaceMember[]> {
    this.requireAuth();
    const response = await this.postRequest<WorkspaceMembersResponse>(
      "/v1/get-workspace-members",
      { workspace_id: WORKSPACE_ID },
    );
    return response.members;
  }

  async fetchTranscript(documentId: string): Promise<GranolaTranscriptEntry[]> {
    this.requireAuth();
    return this.postRequest<GranolaTranscriptEntry[]>(
      "/v1/get-document-transcript",
      { document_id: documentId },
    );
  }

  private requireAuth(): void {
    if (!this.token) {
      throw new Error(
        "Not authenticated. Open Granola desktop app and sign in first.",
      );
    }
  }

  private async postRequest<T>(
    path: string,
    body: Record<string, unknown>,
  ): Promise<T> {
    const params: RequestUrlParam = {
      url: `${API_BASE}${path}`,
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
        Accept: "*/*",
        "User-Agent": `Granola/${CLIENT_VERSION}`,
        "X-Client-Version": CLIENT_VERSION,
      },
      body: JSON.stringify(body),
    };

    const response = await requestUrl(params);

    if (response.status >= 400) {
      throw new Error(`Granola API error ${response.status}: ${response.text}`);
    }

    return response.json as T;
  }

  private readLocalToken(): string | null {
    try {
      const fs = require("fs") as typeof import("fs");
      const nodePath = require("path") as typeof import("path");
      const os = require("os") as typeof import("os");

      let credPath: string;
      if (Platform.isMacOS) {
        credPath = nodePath.join(
          os.homedir(),
          "Library",
          "Application Support",
          "Granola",
          "supabase.json",
        );
      } else if (Platform.isWin) {
        const appData =
          process.env["APPDATA"] ??
          nodePath.join(os.homedir(), "AppData", "Roaming");
        credPath = nodePath.join(appData, "Granola", "supabase.json");
      } else {
        credPath = nodePath.join(
          os.homedir(),
          ".config",
          "Granola",
          "supabase.json",
        );
      }

      if (!fs.existsSync(credPath)) {
        return null;
      }

      const fileContent = fs.readFileSync(credPath, "utf-8");
      const data = JSON.parse(fileContent);

      if (!data.workos_tokens) {
        return null;
      }

      const workosTokens = JSON.parse(data.workos_tokens);
      return workosTokens.access_token ?? null;
    } catch {
      return null;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
