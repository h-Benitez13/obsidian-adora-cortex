import { requestUrl } from "obsidian";
import { GranolaAdoraSettings, HealthScore } from "./types";
import { CanonicalIncidentRecord } from "./learning-schema";
import {
  buildIncidentNotionProperties,
  renderIncidentNotionMarkdown,
} from "./notion-incidents";

const SLACK_API = "https://slack.com/api";
const NOTION_API = "https://api.notion.com/v1";

export interface NotifyResult {
  sent: number;
  skipped: number;
  errors: string[];
}

function emptyResult(): NotifyResult {
  return { sent: 0, skipped: 0, errors: [] };
}

// ── Slack ──

export class SlackNotifier {
  private token: string;
  private getSettings: () => GranolaAdoraSettings;
  private saveSettings: () => Promise<void>;

  constructor(
    token: string,
    getSettings: () => GranolaAdoraSettings,
    saveSettings: () => Promise<void>,
  ) {
    this.token = token;
    this.getSettings = getSettings;
    this.saveSettings = saveSettings;
  }

  async postDigest(
    channelId: string,
    digestTitle: string,
    digestBody: string,
  ): Promise<NotifyResult> {
    const result = emptyResult();
    const itemKey = `slack-digest:${digestTitle}`;

    if (this.wasAlreadyNotified(itemKey)) {
      result.skipped++;
      return result;
    }

    try {
      const truncatedBody =
        digestBody.length > 2800
          ? digestBody.substring(0, 2800) + "\n\n_…truncated. See Obsidian vault for full digest._"
          : digestBody;

      await this.postMessage(channelId, `*${digestTitle}*\n\n${truncatedBody}`);
      await this.markNotified(itemKey);
      result.sent++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      result.errors.push(`Slack digest failed: ${msg}`);
    }

    return result;
  }

  async postHealthAlerts(
    channelId: string,
    healthScores: { customer: string; health: HealthScore }[],
    threshold: number,
  ): Promise<NotifyResult> {
    const result = emptyResult();
    const today = new Date().toISOString().split("T")[0];

    const alerts = healthScores.filter((h) => h.health.score < threshold);
    if (alerts.length === 0) {
      return result;
    }

    for (const alert of alerts) {
      const itemKey = `slack-health:${alert.customer}:${today}`;
      if (this.wasAlreadyNotified(itemKey)) {
        result.skipped++;
        continue;
      }

      try {
        const emoji =
          alert.health.tier === "critical" ? ":rotating_light:" : ":warning:";
        const text = [
          `${emoji} *Customer Health Alert: ${alert.customer}*`,
          `Score: ${alert.health.score}/100 (${alert.health.tier})`,
          `Meetings (30d): ${alert.health.meeting_frequency} | Open issues: ${alert.health.open_issues}`,
          alert.health.sentiment !== undefined
            ? `Sentiment: ${alert.health.sentiment}/100`
            : "",
        ]
          .filter(Boolean)
          .join("\n");

        await this.postMessage(channelId, text);
        await this.markNotified(itemKey);
        result.sent++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        result.errors.push(`Health alert for ${alert.customer}: ${msg}`);
      }
    }

    return result;
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await requestUrl({
        url: `${SLACK_API}/auth.test`,
        method: "GET",
        headers: { Authorization: `Bearer ${this.token}` },
      });
      const json = response.json as { ok: boolean };
      return json.ok;
    } catch {
      return false;
    }
  }

  private async postMessage(channel: string, text: string): Promise<void> {
    const response = await requestUrl({
      url: `${SLACK_API}/chat.postMessage`,
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ channel, text }),
    });

    const json = response.json as { ok: boolean; error?: string };
    if (!json.ok) {
      throw new Error(json.error ?? "Slack chat.postMessage failed");
    }
  }

  private wasAlreadyNotified(itemKey: string): boolean {
    return itemKey in this.getSettings().notifiedItems;
  }

  private async markNotified(itemKey: string): Promise<void> {
    this.getSettings().notifiedItems[itemKey] = new Date().toISOString();
    await this.saveSettings();
  }
}

// ── Notion ──

interface NotionBlock {
  object: "block";
  type: string;
  [key: string]: unknown;
}

export class NotionPublisher {
  private token: string;
  private getSettings: () => GranolaAdoraSettings;
  private saveSettings: () => Promise<void>;

  constructor(
    token: string,
    getSettings: () => GranolaAdoraSettings,
    saveSettings: () => Promise<void>,
  ) {
    this.token = token;
    this.getSettings = getSettings;
    this.saveSettings = saveSettings;
  }

  async publishDigest(
    parentPageId: string,
    title: string,
    markdownBody: string,
  ): Promise<NotifyResult> {
    const result = emptyResult();
    const itemKey = `notion-digest:${title}`;

    if (this.wasAlreadyNotified(itemKey)) {
      result.skipped++;
      return result;
    }

    try {
      await this.createPage(parentPageId, title, markdownBody);
      await this.markNotified(itemKey);
      result.sent++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      result.errors.push(`Notion digest publish failed: ${msg}`);
    }

    return result;
  }

  async publishCustomerAsks(
    databaseId: string,
    title: string,
    markdownBody: string,
  ): Promise<NotifyResult> {
    const result = emptyResult();
    const itemKey = `notion-asks:${title}`;

    if (this.wasAlreadyNotified(itemKey)) {
      result.skipped++;
      return result;
    }

    try {
      await this.createDatabasePage(databaseId, title, markdownBody);
      await this.markNotified(itemKey);
      result.sent++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      result.errors.push(`Notion customer asks publish failed: ${msg}`);
    }

    return result;
  }

  async publishIncident(
    databaseId: string,
    incident: CanonicalIncidentRecord,
  ): Promise<NotifyResult> {
    const result = emptyResult();
    const itemKey = `notion-incident:${incident.canonicalId}`;

    if (this.wasAlreadyNotified(itemKey)) {
      result.skipped++;
      return result;
    }

    try {
      await this.createDatabasePageWithProperties(
        databaseId,
        buildIncidentNotionProperties(incident) as unknown as Record<string, unknown>,
        renderIncidentNotionMarkdown(incident),
      );
      await this.markNotified(itemKey);
      result.sent++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      result.errors.push(`Notion incident publish failed: ${msg}`);
    }

    return result;
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await requestUrl({
        url: `${NOTION_API}/users/me`,
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Notion-Version": "2022-06-28",
        },
      });
      return response.status === 200;
    } catch {
      return false;
    }
  }

  private async createPage(
    parentPageId: string,
    title: string,
    markdownBody: string,
  ): Promise<void> {
    const blocks = this.markdownToBlocks(markdownBody);

    const response = await requestUrl({
      url: `${NOTION_API}/pages`,
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        parent: { page_id: parentPageId },
        properties: {
          title: {
            title: [{ text: { content: title } }],
          },
        },
        children: blocks,
      }),
    });

    if (response.status >= 400) {
      throw new Error(`Notion API error ${response.status}: ${response.text}`);
    }
  }

  private async createDatabasePage(
    databaseId: string,
    title: string,
    markdownBody: string,
  ): Promise<void> {
    await this.createDatabasePageWithProperties(
      databaseId,
      {
        Name: {
          title: [{ text: { content: title } }],
        },
      },
      markdownBody,
    );
  }

  private async createDatabasePageWithProperties(
    databaseId: string,
    properties: Record<string, unknown>,
    markdownBody: string,
  ): Promise<void> {
    const blocks = this.markdownToBlocks(markdownBody);

    const response = await requestUrl({
      url: `${NOTION_API}/pages`,
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        parent: { database_id: databaseId },
        properties,
        children: blocks,
      }),
    });

    if (response.status >= 400) {
      throw new Error(`Notion API error ${response.status}: ${response.text}`);
    }
  }

  private markdownToBlocks(markdown: string): NotionBlock[] {
    const lines = markdown.split("\n");
    const blocks: NotionBlock[] = [];
    const MAX_BLOCKS = 90;

    for (const line of lines) {
      if (blocks.length >= MAX_BLOCKS) break;

      const trimmed = line.trim();
      if (!trimmed) continue;

      if (trimmed.startsWith("## ")) {
        blocks.push({
          object: "block",
          type: "heading_2",
          heading_2: {
            rich_text: [{ type: "text", text: { content: trimmed.slice(3) } }],
          },
        });
      } else if (trimmed.startsWith("### ")) {
        blocks.push({
          object: "block",
          type: "heading_3",
          heading_3: {
            rich_text: [{ type: "text", text: { content: trimmed.slice(4) } }],
          },
        });
      } else if (trimmed.startsWith("# ")) {
        blocks.push({
          object: "block",
          type: "heading_1",
          heading_1: {
            rich_text: [{ type: "text", text: { content: trimmed.slice(2) } }],
          },
        });
      } else if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
        blocks.push({
          object: "block",
          type: "bulleted_list_item",
          bulleted_list_item: {
            rich_text: [{ type: "text", text: { content: trimmed.slice(2) } }],
          },
        });
      } else if (/^\d+\.\s/.test(trimmed)) {
        const content = trimmed.replace(/^\d+\.\s/, "");
        blocks.push({
          object: "block",
          type: "numbered_list_item",
          numbered_list_item: {
            rich_text: [{ type: "text", text: { content } }],
          },
        });
      } else if (trimmed.startsWith("> ")) {
        blocks.push({
          object: "block",
          type: "quote",
          quote: {
            rich_text: [{ type: "text", text: { content: trimmed.slice(2) } }],
          },
        });
      } else if (trimmed === "---") {
        blocks.push({
          object: "block",
          type: "divider",
          divider: {},
        });
      } else {
        const truncated =
          trimmed.length > 2000 ? trimmed.substring(0, 2000) : trimmed;
        blocks.push({
          object: "block",
          type: "paragraph",
          paragraph: {
            rich_text: [{ type: "text", text: { content: truncated } }],
          },
        });
      }
    }

    return blocks;
  }

  private wasAlreadyNotified(itemKey: string): boolean {
    return itemKey in this.getSettings().notifiedItems;
  }

  private async markNotified(itemKey: string): Promise<void> {
    this.getSettings().notifiedItems[itemKey] = new Date().toISOString();
    await this.saveSettings();
  }
}

// ── Orchestrator ──

export class OutboundNotifier {
  private slack: SlackNotifier | null = null;
  private notion: NotionPublisher | null = null;
  private getSettings: () => GranolaAdoraSettings;
  private saveSettings: () => Promise<void>;

  constructor(
    getSettings: () => GranolaAdoraSettings,
    saveSettings: () => Promise<void>,
  ) {
    this.getSettings = getSettings;
    this.saveSettings = saveSettings;
    this.rebuildClients();
  }

  rebuildClients(): void {
    const s = this.getSettings();

    if (s.notifySlackEnabled && s.slackBotToken) {
      this.slack = new SlackNotifier(
        s.slackBotToken,
        this.getSettings,
        this.saveSettings,
      );
    } else {
      this.slack = null;
    }

    if (s.notifyNotionEnabled && s.notionApiToken) {
      this.notion = new NotionPublisher(
        s.notionApiToken,
        this.getSettings,
        this.saveSettings,
      );
    } else {
      this.notion = null;
    }
  }

  private isActive(): boolean {
    const s = this.getSettings();
    return s.outboundEnabled && s.isDesignatedBrain;
  }

  async notifyDigest(title: string, body: string): Promise<NotifyResult> {
    const combined = emptyResult();
    if (!this.isActive()) return combined;
    const s = this.getSettings();

    if (this.slack && s.slackDigestChannelId) {
      const r = await this.slack.postDigest(s.slackDigestChannelId, title, body);
      mergeResult(combined, r);
    }

    if (this.notion && s.notionDigestParentId) {
      const r = await this.notion.publishDigest(
        s.notionDigestParentId,
        title,
        body,
      );
      mergeResult(combined, r);
    }

    return combined;
  }

  async notifyHealthAlerts(
    scores: { customer: string; health: HealthScore }[],
  ): Promise<NotifyResult> {
    const combined = emptyResult();
    if (!this.isActive()) return combined;
    const s = this.getSettings();

    if (this.slack && s.slackHealthAlertChannelId) {
      const r = await this.slack.postHealthAlerts(
        s.slackHealthAlertChannelId,
        scores,
        s.healthAlertThreshold,
      );
      mergeResult(combined, r);
    }

    return combined;
  }

  async notifyCustomerAsks(title: string, body: string): Promise<NotifyResult> {
    const combined = emptyResult();
    if (!this.isActive()) return combined;
    const s = this.getSettings();

    if (this.notion && s.notionCustomerAsksDbId) {
      const r = await this.notion.publishCustomerAsks(
        s.notionCustomerAsksDbId,
        title,
        body,
      );
      mergeResult(combined, r);
    }

    return combined;
  }

  getNotionPublisher(): NotionPublisher | null {
    return this.notion;
  }
}

function mergeResult(target: NotifyResult, source: NotifyResult): void {
  target.sent += source.sent;
  target.skipped += source.skipped;
  target.errors.push(...source.errors);
}

export function formatNotifyResult(result: NotifyResult): string {
  const parts: string[] = [];
  if (result.sent > 0) parts.push(`${result.sent} sent`);
  if (result.skipped > 0) parts.push(`${result.skipped} skipped`);
  if (result.errors.length > 0)
    parts.push(`${result.errors.length} error(s)`);
  return parts.length > 0 ? `Outbound: ${parts.join(", ")}` : "Outbound: nothing to send";
}
