import { requestUrl } from "obsidian";
import { SlackMessage } from "./types";

const SLACK_API = "https://slack.com/api";

// ── Internal API response shapes ──

interface SlackApiResponse {
  ok: boolean;
  error?: string;
}

interface SlackAuthTestResponse extends SlackApiResponse {
  user_id: string;
  user: string;
  team: string;
  team_id: string;
}

interface SlackChannelRaw {
  id: string;
  name: string;
  is_channel: boolean;
  is_archived: boolean;
}

interface SlackConversationsListResponse extends SlackApiResponse {
  channels: SlackChannelRaw[];
  response_metadata?: { next_cursor?: string };
}

interface SlackPinItem {
  type: string;
  message?: {
    text: string;
    user: string;
    ts: string;
    permalink?: string;
    reactions?: { name: string; count: number }[];
  };
}

interface SlackPinsListResponse extends SlackApiResponse {
  items: SlackPinItem[];
}

interface SlackBookmarkRaw {
  id: string;
  title: string;
  link: string;
  type: string;
  created: number;
}

interface SlackBookmarksListResponse extends SlackApiResponse {
  bookmarks: SlackBookmarkRaw[];
}

interface SlackReactionItem {
  type: string;
  channel: string;
  message: {
    text: string;
    user: string;
    ts: string;
    permalink?: string;
    reactions?: { name: string; count: number }[];
  };
}

interface SlackReactionsListResponse extends SlackApiResponse {
  items: SlackReactionItem[];
  response_metadata?: { next_cursor?: string };
}

interface SlackReplyMessage {
  user: string;
  text: string;
  ts: string;
  thread_ts?: string;
  reactions?: { name: string; count: number }[];
}

interface SlackRepliesResponse extends SlackApiResponse {
  messages: SlackReplyMessage[];
}

// ── Exported types ──

export interface SlackChannel {
  id: string;
  name: string;
}

export interface SlackBookmark {
  id: string;
  title: string;
  link: string;
  type: string;
  created: number;
}

// ── Client ──

export class SlackClient {
  private token: string;

  constructor(token: string) {
    this.token = token;
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.get<SlackAuthTestResponse>("auth.test");
      return true;
    } catch {
      return false;
    }
  }

  async fetchChannels(): Promise<SlackChannel[]> {
    const channels: SlackChannel[] = [];
    let cursor: string | undefined;

    do {
      const params: Record<string, string> = {
        types: "public_channel",
        limit: "200",
      };
      if (cursor) params.cursor = cursor;

      const data = await this.get<SlackConversationsListResponse>(
        "conversations.list",
        params,
      );
      for (const ch of data.channels ?? []) {
        if (!ch.is_archived) {
          channels.push({ id: ch.id, name: ch.name });
        }
      }

      cursor = data.response_metadata?.next_cursor || undefined;
      if (cursor) {
        await new Promise((r) => setTimeout(r, 250));
      }
    } while (cursor);

    return channels;
  }

  async fetchPins(channelId: string): Promise<SlackMessage[]> {
    const data = await this.get<SlackPinsListResponse>("pins.list", {
      channel: channelId,
    });
    return (data.items ?? [])
      .filter((item) => item.type === "message" && item.message)
      .map((item) => ({
        id: item.message!.ts,
        channel: channelId,
        channelName: "",
        user: item.message!.user ?? "",
        userName: "",
        text: item.message!.text ?? "",
        timestamp: item.message!.ts,
        threadTs: null,
        reactions: item.message!.reactions ?? [],
        permalink: item.message!.permalink ?? "",
      }));
  }

  async fetchBookmarks(channelId: string): Promise<SlackBookmark[]> {
    const data = await this.get<SlackBookmarksListResponse>("bookmarks.list", {
      channel_id: channelId,
    });
    return (data.bookmarks ?? []).map((b) => ({
      id: b.id,
      title: b.title,
      link: b.link,
      type: b.type,
      created: b.created,
    }));
  }

  async fetchReactedMessages(): Promise<SlackMessage[]> {
    const messages: SlackMessage[] = [];
    let cursor: string | undefined;

    do {
      const params: Record<string, string> = { limit: "100" };
      if (cursor) params.cursor = cursor;

      const data = await this.get<SlackReactionsListResponse>(
        "reactions.list",
        params,
      );
      for (const item of data.items ?? []) {
        if (item.type === "message" && item.message) {
          messages.push({
            id: item.message.ts,
            channel: item.channel ?? "",
            channelName: "",
            user: item.message.user ?? "",
            userName: "",
            text: item.message.text ?? "",
            timestamp: item.message.ts,
            threadTs: null,
            reactions: item.message.reactions ?? [],
            permalink: item.message.permalink ?? "",
          });
        }
      }

      cursor = data.response_metadata?.next_cursor || undefined;
      if (cursor) {
        await new Promise((r) => setTimeout(r, 250));
      }
    } while (cursor);

    return messages;
  }

  async fetchThreadReplies(
    channelId: string,
    threadTs: string,
  ): Promise<SlackMessage[]> {
    const data = await this.get<SlackRepliesResponse>("conversations.replies", {
      channel: channelId,
      ts: threadTs,
    });
    return (data.messages ?? [])
      .filter((m) => m.ts !== threadTs)
      .map((m) => ({
        id: m.ts,
        channel: channelId,
        channelName: "",
        user: m.user ?? "",
        userName: "",
        text: m.text ?? "",
        timestamp: m.ts,
        threadTs: m.thread_ts ?? null,
        reactions: m.reactions ?? [],
        permalink: "",
      }));
  }

  private async get<T>(
    endpoint: string,
    params?: Record<string, string>,
  ): Promise<T> {
    let queryString = "";
    if (params) {
      const searchParams = new URLSearchParams(params);
      queryString = "?" + searchParams.toString();
    }

    const response = await requestUrl({
      url: `${SLACK_API}/${endpoint}${queryString}`,
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.token}`,
      },
    });

    const json = response.json as SlackApiResponse;
    if (!json.ok) {
      throw new Error(json.error ?? `Slack API error on ${endpoint}`);
    }
    return response.json as T;
  }
}
