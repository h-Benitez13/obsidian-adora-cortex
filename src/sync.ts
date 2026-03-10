import { App, normalizePath, TFile } from "obsidian";
import { GranolaApiClient } from "./api";
import { FigmaClient } from "./figma";
import { LinearClient } from "./linear";
import { GitHubClient } from "./github";
import { GoogleDriveClient } from "./gdrive";
import { HubSpotClient } from "./hubspot";
import { SlackClient } from "./slack";
import { AutoTagger } from "./tagger";
import {
  renderMeetingNote,
  renderCustomerNote,
  sanitizeFileName,
} from "./renderer";
import {
  generateCustomer360,
  generateTeamProfile,
  calculateHealthScore,
  updateHealthScoreInContent,
} from "./profiles";
import { AICortex } from "./ai";
import {
  buildSourceRegistry,
  mergeLatestUpdatedAt,
  selectGitHubReposForSync,
  shouldProcessEntityByUpdatedAt,
} from "./source-registry";
import {
  FigmaFile,
  GoogleDriveFile,
  GitHubPR,
  GranolaAdoraSettings,
  GranolaDocument,
  GranolaDocumentList,
  HubSpotCompany,
  HubSpotContact,
  HubSpotDeal,
  HubSpotMeeting,
  HubSpotTicket,
  LinearIssue,
  LinearProject,
  SlackMessage,
  SyncResult,
  WorkspaceMember,
} from "./types";

function escapeYaml(input: string): string {
  return input.replace(/"/g, '\\"').replace(/\n/g, " ");
}

export class SyncEngine {
  private app: App;
  private api: GranolaApiClient;
  private tagger: AutoTagger;
  private getSettings: () => GranolaAdoraSettings;
  private saveSettings: () => Promise<void>;

  constructor(
    app: App,
    api: GranolaApiClient,
    tagger: AutoTagger,
    getSettings: () => GranolaAdoraSettings,
    saveSettings: () => Promise<void>,
  ) {
    this.app = app;
    this.api = api;
    this.tagger = tagger;
    this.getSettings = getSettings;
    this.saveSettings = saveSettings;
  }

  async sync(): Promise<SyncResult> {
    const settings = this.getSettings();
    const result: SyncResult = {
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [],
      linearIssues: 0,
      linearProjects: 0,
      figmaFiles: 0,
      slackMessages: 0,
      githubPRs: 0,
      googleDriveDocs: 0,
      hubspotContacts: 0,
      hubspotCompanies: 0,
      hubspotDeals: 0,
      hubspotMeetings: 0,
      hubspotTickets: 0,
    };

    await this.ensureFolderStructure(settings);

    const allDocs = await this.gatherAllDocuments(settings, result);

    const docs = settings.lastSyncTimestamp
      ? allDocs.filter((d) => d.updated_at > settings.lastSyncTimestamp!)
      : allDocs;

    for (const doc of docs) {
      try {
        if (settings.includeTranscript) {
          try {
            doc.transcript = await this.api.fetchTranscript(doc.id);
          } catch {
            doc.transcript = null;
          }
        }

        const tags = this.tagger.extract(doc);
        const customersFolderPath = `${settings.baseFolderPath}/${settings.customersFolderName}`;
        const markdown = renderMeetingNote(
          doc,
          tags,
          settings.includeTranscript,
          customersFolderPath,
        );
        const filePath = this.buildMeetingFilePath(doc, settings);
        const existingFile = this.app.vault.getAbstractFileByPath(filePath);

        if (existingFile instanceof TFile) {
          const existingContent = await this.app.vault.read(existingFile);
          const existingUpdated =
            this.extractFrontmatterField(existingContent, "updated") ?? "";
          if (existingUpdated >= doc.updated_at) {
            result.skipped++;
            continue;
          }
          await this.app.vault.modify(existingFile, markdown);
          result.updated++;
        } else {
          await this.app.vault.create(filePath, markdown);
          result.created++;
        }

        await this.ensureCustomerNotes(tags.customers, settings);

        if (!settings.syncedDocIds.includes(doc.id)) {
          settings.syncedDocIds.push(doc.id);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        result.errors.push(`Failed to sync doc ${doc.id}: ${message}`);
      }
    }

    try {
      await this.withTimeout(
        this.syncCustomer360Pages(allDocs),
        30000,
        "Customer360",
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      result.errors.push(`Customer 360 sync failed: ${message}`);
    }

    try {
      const members = await this.api.fetchWorkspaceMembers();
      await this.withTimeout(
        this.syncTeamProfiles(members),
        30000,
        "TeamProfiles",
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      result.errors.push(`Team profiles sync failed: ${message}`);
    }

    if (settings.syncLinear && settings.linearApiKey) {
      try {
        const linearStats = await this.withTimeout(
          (async () => {
            const issues = await this.syncLinearIssues();
            const projects = await this.syncLinearProjects();
            return { issues, projects };
          })(),
          30000,
          "Linear",
        );
        result.linearIssues = linearStats.issues;
        result.linearProjects = linearStats.projects;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        result.errors.push(`Linear sync failed: ${message}`);
      }
    }

    if (
      settings.syncFigma &&
      settings.figmaAccessToken &&
      settings.figmaTeamId
    ) {
      try {
        result.figmaFiles = await this.withTimeout(
          this.syncFigmaFiles(),
          30000,
          "Figma",
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        result.errors.push(`Figma sync failed: ${message}`);
      }
    }

    if (settings.syncSlack && settings.slackBotToken) {
      try {
        const slackClient = new SlackClient(settings.slackBotToken);
        result.slackMessages = await this.withTimeout(
          this.syncSlackMessages(slackClient),
          60000,
          "Slack",
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        result.errors.push(`Slack sync failed: ${message}`);
      }
    }

    if (settings.syncGithub && settings.githubToken && settings.githubOrg) {
      try {
        const githubClient = new GitHubClient(settings.githubToken);
        result.githubPRs = await this.withTimeout(
          this.syncGitHubPRs(githubClient),
          30000,
          "GitHub",
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        result.errors.push(`GitHub sync failed: ${message}`);
      }
    }

    if (
      settings.syncGoogleDrive &&
      settings.googleDriveFolderId &&
      (settings.googleDriveAccessToken || settings.googleDriveRefreshToken)
    ) {
      try {
        const driveClient = new GoogleDriveClient(
          settings.googleDriveClientId,
          settings.googleDriveClientSecret,
          settings.googleDriveRefreshToken,
          settings.googleDriveAccessToken,
        );
        result.googleDriveDocs = await this.withTimeout(
          this.syncGoogleDriveDocs(driveClient),
          30000,
          "GoogleDrive",
        );
        const nextAccessToken = driveClient.getAccessToken();
        if (
          nextAccessToken &&
          nextAccessToken !== settings.googleDriveAccessToken
        ) {
          settings.googleDriveAccessToken = nextAccessToken;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        result.errors.push(`Google Drive sync failed: ${message}`);
      }
    }

    if (settings.syncHubspot && settings.hubspotAccessToken) {
      try {
        const hubspotClient = new HubSpotClient(settings.hubspotAccessToken);
        const stats = await this.withTimeout(
          this.syncHubSpotData(hubspotClient),
          30000,
          "HubSpot",
        );
        result.hubspotContacts = stats.contacts;
        result.hubspotCompanies = stats.companies;
        result.hubspotDeals = stats.deals;
        result.hubspotMeetings = stats.meetings;
        result.hubspotTickets = stats.tickets;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        result.errors.push(`HubSpot sync failed: ${message}`);
      }
    }

    settings.lastSyncTimestamp = new Date().toISOString();
    await this.saveSettings();

    return result;
  }

  private async syncLinearIssues(): Promise<number> {
    const settings = this.getSettings();
    const client = new LinearClient(settings.linearApiKey);
    const issues = await client.fetchMyIssues();
    const basePath = `${settings.baseFolderPath}/${settings.linearFolderName}/Issues`;
    const meetingsPath = `${settings.baseFolderPath}/${settings.meetingsFolderName}`;

    let count = 0;
    for (const issue of issues) {
      const fileName = sanitizeFileName(`${issue.identifier} ${issue.title}`);
      const filePath = normalizePath(`${basePath}/${fileName}.md`);
      const content = this.renderLinearIssueNote(issue, meetingsPath);
      const existingFile = this.app.vault.getAbstractFileByPath(filePath);

      if (existingFile instanceof TFile) {
        const existing = await this.app.vault.read(existingFile);
        const existingUpdated =
          this.extractFrontmatterField(existing, "updated") ?? "";
        if (existingUpdated >= issue.updatedAt) continue;
        await this.app.vault.modify(existingFile, content);
      } else {
        await this.app.vault.create(filePath, content);
      }
      count++;
    }
    return count;
  }

  private async syncLinearProjects(): Promise<number> {
    const settings = this.getSettings();
    const client = new LinearClient(settings.linearApiKey);
    const projects = await client.fetchProjects();
    const basePath = `${settings.baseFolderPath}/${settings.linearFolderName}/Projects`;
    const issuesPath = `${settings.baseFolderPath}/${settings.linearFolderName}/Issues`;

    let count = 0;
    for (const project of projects) {
      const fileName = sanitizeFileName(project.name);
      const filePath = normalizePath(`${basePath}/${fileName}.md`);
      const content = this.renderLinearProjectNote(project, issuesPath);
      const existingFile = this.app.vault.getAbstractFileByPath(filePath);

      if (existingFile instanceof TFile) {
        await this.app.vault.modify(existingFile, content);
      } else {
        await this.app.vault.create(filePath, content);
      }
      count++;
    }
    return count;
  }

  private renderLinearIssueNote(
    issue: LinearIssue,
    meetingsPath: string,
  ): string {
    const labels = issue.labels.nodes.map((l) => l.name);
    const tags = ["linear", "issue", `status/${escapeYaml(issue.state.type)}`];

    const fm = [
      "---",
      `type: "linear-issue"`,
      `linear_id: "${escapeYaml(issue.id)}"`,
      `identifier: "${escapeYaml(issue.identifier)}"`,
      `title: "${escapeYaml(issue.title)}"`,
      `status: "${escapeYaml(issue.state.name)}"`,
      `priority: "${escapeYaml(issue.priorityLabel)}"`,
    ];

    if (issue.assignee) {
      fm.push(`assignee: "${escapeYaml(issue.assignee.name)}"`);
    }
    if (issue.project) {
      fm.push(`project: "${escapeYaml(issue.project.name)}"`);
    }
    if (labels.length > 0) {
      fm.push("labels:");
      for (const label of labels) {
        fm.push(`  - "${escapeYaml(label)}"`);
      }
    }
    fm.push(`created: "${issue.createdAt}"`);
    fm.push(`updated: "${issue.updatedAt}"`);
    fm.push("tags:");
    for (const tag of tags) {
      fm.push(`  - "${tag}"`);
    }
    fm.push("---");

    const body: string[] = [
      `\n# ${issue.identifier}: ${issue.title}\n`,
      `> **Status:** ${issue.state.name} | **Priority:** ${issue.priorityLabel}${issue.assignee ? ` | **Assignee:** ${issue.assignee.name}` : ""}\n`,
    ];

    if (issue.description) {
      body.push("## Description\n");
      body.push(issue.description);
      body.push("");
    }

    body.push("## Related Meetings\n");
    body.push("```dataview");
    body.push(`TABLE date as "Date", title as "Meeting"`);
    body.push(`FROM "${meetingsPath}"`);
    body.push(
      `WHERE contains(file.content, "${escapeYaml(issue.identifier)}")`,
    );
    body.push("SORT date DESC");
    body.push("```");
    body.push("");

    return [...fm, ...body].join("\n");
  }

  private renderLinearProjectNote(
    project: LinearProject,
    issuesPath: string,
  ): string {
    const tags = ["linear", "project"];
    const progressPct = Math.round(project.progress * 100);

    const fm = [
      "---",
      `type: "linear-project"`,
      `linear_id: "${escapeYaml(project.id)}"`,
      `name: "${escapeYaml(project.name)}"`,
      `state: "${escapeYaml(project.state)}"`,
      `progress: ${progressPct}`,
    ];

    if (project.lead) {
      fm.push(`lead: "${escapeYaml(project.lead.name)}"`);
    }
    if (project.startDate) {
      fm.push(`start_date: "${project.startDate}"`);
    }
    if (project.targetDate) {
      fm.push(`target_date: "${project.targetDate}"`);
    }
    fm.push("tags:");
    for (const tag of tags) {
      fm.push(`  - "${tag}"`);
    }
    fm.push("---");

    const body: string[] = [
      `\n# ${project.name}\n`,
      `> **Progress:** ${progressPct}%${project.lead ? ` | **Lead:** ${project.lead.name}` : ""}${project.targetDate ? ` | **Target:** ${project.targetDate}` : ""}\n`,
    ];

    if (project.description) {
      body.push("## Description\n");
      body.push(project.description);
      body.push("");
    }

    body.push("## Issues\n");
    body.push("```dataview");
    body.push(
      `TABLE status as "Status", priority as "Priority", assignee as "Assignee"`,
    );
    body.push(`FROM "${issuesPath}"`);
    body.push(`WHERE project = "${escapeYaml(project.name)}"`);
    body.push("SORT priority ASC");
    body.push("```");
    body.push("");

    return [...fm, ...body].join("\n");
  }

  private async syncFigmaFiles(): Promise<number> {
    const settings = this.getSettings();
    const client = new FigmaClient(settings.figmaAccessToken);
    const projects = await client.fetchTeamProjects(settings.figmaTeamId);

    const MAX_FILES = 100;
    const allFiles: FigmaFile[] = [];

    for (const project of projects) {
      if (allFiles.length >= MAX_FILES) break;

      const files = await client.fetchProjectFiles(String(project.id));
      for (const file of files) {
        if (allFiles.length >= MAX_FILES) break;
        file.project_name = project.name;
        allFiles.push(file);
      }
    }

    const basePath = settings.baseFolderPath;
    const designsFolder = `${basePath}/${settings.designsFolderName}`;
    await this.ensureFolder(designsFolder);

    let count = 0;
    for (const file of allFiles) {
      const projectFolder = `${designsFolder}/${sanitizeFileName(file.project_name || "Uncategorized")}`;
      await this.ensureFolder(projectFolder);

      const fileName = sanitizeFileName(file.name);
      const filePath = normalizePath(`${projectFolder}/${fileName}.md`);
      const existingFile = this.app.vault.getAbstractFileByPath(filePath);

      if (existingFile instanceof TFile) {
        const existingContent = await this.app.vault.read(existingFile);
        const existingModified =
          this.extractFrontmatterField(existingContent, "last_modified") ?? "";
        if (existingModified >= file.last_modified) continue;
        await this.app.vault.modify(
          existingFile,
          this.renderFigmaNote(file, basePath),
        );
      } else {
        await this.app.vault.create(
          filePath,
          this.renderFigmaNote(file, basePath),
        );
      }
      count++;
    }
    return count;
  }

  private renderFigmaNote(file: FigmaFile, basePath: string): string {
    const meetingsPath = `${basePath}/${this.getSettings().meetingsFolderName}`;
    const ideasPath = `${basePath}/${this.getSettings().ideasFolderName}`;

    const fm = [
      "---",
      `type: "design"`,
      `figma_key: "${escapeYaml(file.key)}"`,
      `project: "${escapeYaml(file.project_name)}"`,
      `last_modified: "${escapeYaml(file.last_modified)}"`,
      `tags:`,
      `  - "design"`,
      `  - "figma"`,
      `synced: "${new Date().toISOString()}"`,
      "---",
    ];

    const body: string[] = [
      "",
      `# ${file.name}`,
      "",
      `![${escapeYaml(file.name)}](${file.thumbnail_url})`,
      "",
      `[Open in Figma](https://www.figma.com/file/${file.key})`,
      "",
      "## Related Meetings",
      "",
      "```dataview",
      `TABLE date as "Date", title as "Meeting"`,
      `FROM "${meetingsPath}"`,
      `WHERE contains(title, "${escapeYaml(file.name)}")`,
      `SORT date DESC`,
      "```",
      "",
      "## Related Ideas",
      "",
      "```dataview",
      `LIST`,
      `FROM "${ideasPath}"`,
      `WHERE contains(file.outlinks, this.file.link) OR contains(title, "${escapeYaml(file.name)}")`,
      `SORT file.ctime DESC`,
      "```",
      "",
    ];

    return [...fm, ...body].join("\n");
  }

  private async syncSlackMessages(client: SlackClient): Promise<number> {
    const settings = this.getSettings();
    const basePath = settings.baseFolderPath;
    const slackFolder = `${basePath}/${settings.slackFolderName}`;
    await this.ensureFolder(slackFolder);

    const existingPermalinks = new Set<string>();
    const allVaultFiles = this.app.vault.getMarkdownFiles();
    const normalizedSlack = normalizePath(slackFolder);
    for (const file of allVaultFiles) {
      if (file.path.startsWith(normalizedSlack + "/")) {
        const content = await this.app.vault.read(file);
        const permalink = this.extractFrontmatterField(content, "permalink");
        if (permalink) {
          existingPermalinks.add(permalink);
        }
      }
    }

    const channels = await client.fetchChannels();
    const channelMap = new Map<string, string>();
    for (const ch of channels) {
      channelMap.set(ch.id, ch.name);
    }

    let count = 0;

    const slackErrors: string[] = [];

    for (const channel of channels) {
      try {
        const pins = await client.fetchPins(channel.id);
        for (const msg of pins) {
          msg.channelName = channel.name;
          if (msg.permalink && existingPermalinks.has(msg.permalink)) continue;
          const filePath = this.buildSlackFilePath(
            channel.name,
            msg.timestamp,
            slackFolder,
          );
          if (this.app.vault.getAbstractFileByPath(filePath)) continue;
          if (msg.user) msg.userName = await client.resolveUserName(msg.user);
          const content = this.renderSlackNote(msg, "pin");
          await this.app.vault.create(filePath, content);
          if (msg.permalink) existingPermalinks.add(msg.permalink);
          count++;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        slackErrors.push(`Pins failed for #${channel.name}: ${msg}`);
      }

      try {
        const bookmarks = await client.fetchBookmarks(channel.id);
        for (const bookmark of bookmarks) {
          if (existingPermalinks.has(bookmark.link)) continue;

          const bookmarkMsg: SlackMessage = {
            id: bookmark.id,
            channel: channel.id,
            channelName: channel.name,
            user: "",
            userName: "",
            text: `[${bookmark.title}](${bookmark.link})`,
            timestamp: String(bookmark.created),
            threadTs: null,
            reactions: [],
            permalink: bookmark.link,
          };
          const filePath = this.buildSlackFilePath(
            channel.name,
            bookmarkMsg.timestamp,
            slackFolder,
          );
          if (this.app.vault.getAbstractFileByPath(filePath)) continue;
          const content = this.renderSlackNote(bookmarkMsg, "bookmark");
          await this.app.vault.create(filePath, content);
          existingPermalinks.add(bookmark.link);
          count++;
        }
      } catch {
        // bookmarks.list is not available on all Slack plans; skip silently
      }

      await new Promise((r) => setTimeout(r, 250));
    }

    try {
      const reacted = await client.fetchReactedMessages();
      for (const msg of reacted) {
        msg.channelName = channelMap.get(msg.channel) ?? msg.channel;
        if (msg.permalink && existingPermalinks.has(msg.permalink)) continue;
        const filePath = this.buildSlackFilePath(
          msg.channelName,
          msg.timestamp,
          slackFolder,
        );
        if (this.app.vault.getAbstractFileByPath(filePath)) continue;
        if (msg.user) msg.userName = await client.resolveUserName(msg.user);
        const content = this.renderSlackNote(msg, "reaction");
        await this.app.vault.create(filePath, content);
        if (msg.permalink) existingPermalinks.add(msg.permalink);
        count++;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      slackErrors.push(`Reacted messages failed: ${msg}`);
    }

    if (slackErrors.length > 0) {
      throw new Error(slackErrors.join("; "));
    }

    return count;
  }

  private renderSlackNote(msg: SlackMessage, sourceType: string): string {
    const ts = new Date(parseFloat(msg.timestamp) * 1000).toISOString();

    const fm = [
      "---",
      `type: "slack-message"`,
      `source_type: "${sourceType}"`,
      `channel: "${escapeYaml(msg.channelName)}"`,
      `author: "${escapeYaml(msg.userName || msg.user)}"`,
      `timestamp: "${ts}"`,
      `permalink: "${escapeYaml(msg.permalink)}"`,
    ];

    if (msg.reactions.length > 0) {
      fm.push("reactions:");
      for (const r of msg.reactions) {
        fm.push(`  - "${escapeYaml(r.name)} (${r.count})"`);
      }
    } else {
      fm.push("reactions: []");
    }

    fm.push("tags:");
    fm.push(`  - "slack"`);
    fm.push(`  - "${sourceType}"`);
    fm.push(`synced: "${new Date().toISOString()}"`);
    fm.push("---");

    const body = ["", `# Slack: ${msg.channelName}`, "", msg.text, ""];

    if (msg.permalink) {
      body.push(`[View in Slack](${msg.permalink})`);
      body.push("");
    }

    return [...fm, ...body].join("\n");
  }

  private buildSlackFilePath(
    channelName: string,
    timestamp: string,
    slackFolder: string,
  ): string {
    const epochMs = parseFloat(timestamp) * 1000;
    const date = new Date(epochMs);
    const y = date.getFullYear();
    const mo = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    const h = String(date.getHours()).padStart(2, "0");
    const mi = String(date.getMinutes()).padStart(2, "0");
    const s = String(date.getSeconds()).padStart(2, "0");
    const slug = `${y}-${mo}-${d}-${h}${mi}${s}`;
    const fileName = sanitizeFileName(`${channelName}--${slug}`);
    return normalizePath(`${slackFolder}/${fileName}.md`);
  }

  private async syncGitHubPRs(githubClient: GitHubClient): Promise<number> {
    const settings = this.getSettings();
    const githubFolder = `${settings.baseFolderPath}/${settings.githubFolderName}`;
    const githubRegistry = buildSourceRegistry(settings).github;
    await this.ensureFolder(githubFolder);

    const repos = selectGitHubReposForSync(
      await githubClient.fetchOrgRepos(settings.githubOrg),
      settings,
    );
    let prCount = 0;

    for (const repo of repos) {
      if (prCount >= githubRegistry.budget.maxItemsPerRun) {
        break;
      }

      const prs = await githubClient.fetchPullRequests(
        repo.owner.login,
        repo.name,
      );
      const checkpointKey = `repo:${repo.full_name}`;
      const lastSeenUpdatedAt =
        githubRegistry.checkpoint.entityUpdatedAt[checkpointKey];
      let latestRepoUpdatedAt = lastSeenUpdatedAt;
      const prsToProcess = prs
        .filter((pr) => {
          latestRepoUpdatedAt = mergeLatestUpdatedAt(
            latestRepoUpdatedAt,
            pr.updatedAt,
          );
          return shouldProcessEntityByUpdatedAt(pr.updatedAt, lastSeenUpdatedAt);
        })
        .slice(0, githubRegistry.budget.maxItemsPerContainer);

      for (const pr of prsToProcess) {
        if (prCount >= githubRegistry.budget.maxItemsPerRun) {
          break;
        }

        const fileName = sanitizeFileName(`${repo.name}--PR-${pr.number}`);
        const filePath = normalizePath(`${githubFolder}/${fileName}.md`);
        const existingFile = this.app.vault.getAbstractFileByPath(filePath);

        if (existingFile instanceof TFile) {
          const existing = await this.app.vault.read(existingFile);
          const existingUpdated =
            this.extractFrontmatterField(existing, "updated") ?? "";
          if (existingUpdated >= pr.updatedAt) continue;
          const linearIssueIds = githubClient.extractLinearIssueIds(
            pr.title,
            pr.body,
          );
          await this.app.vault.modify(
            existingFile,
            this.renderGitHubPRNote(pr, linearIssueIds),
          );
        } else {
          const linearIssueIds = githubClient.extractLinearIssueIds(
            pr.title,
            pr.body,
          );
          await this.app.vault.create(
            filePath,
            this.renderGitHubPRNote(pr, linearIssueIds),
          );
        }
        prCount++;
      }

      if (latestRepoUpdatedAt) {
        githubRegistry.checkpoint.entityUpdatedAt[checkpointKey] =
          latestRepoUpdatedAt;
      }
    }

    githubRegistry.checkpoint.lastSuccessfulSyncAt = new Date().toISOString();

    return prCount;
  }

  private renderGitHubPRNote(pr: GitHubPR, linearIssueIds: string[]): string {
    const tags = ["github", "pr", `state/${pr.state}`];

    const fm = [
      "---",
      `type: "github-pr"`,
      `pr_number: ${pr.number}`,
      `repo: "${escapeYaml(pr.repo)}"`,
      `author: "${escapeYaml(pr.author)}"`,
      `state: "${pr.state}"`,
      `head_branch: "${escapeYaml(pr.headBranch)}"`,
      `base_branch: "${escapeYaml(pr.baseBranch)}"`,
      `created: "${pr.createdAt}"`,
      `updated: "${pr.updatedAt}"`,
    ];

    if (pr.mergedAt) {
      fm.push(`merged: "${pr.mergedAt}"`);
    }

    fm.push(`html_url: "${escapeYaml(pr.url)}"`);

    if (linearIssueIds.length > 0) {
      fm.push("related_issues:");
      for (const id of linearIssueIds) {
        fm.push(`  - "${escapeYaml(id)}"`);
      }
    }

    fm.push("tags:");
    for (const tag of tags) {
      fm.push(`  - "${tag}"`);
    }
    fm.push("---");

    const body: string[] = ["", `# ${pr.title}`, ""];

    if (pr.body) {
      body.push(pr.body);
      body.push("");
    }

    return [...fm, ...body].join("\n");
  }

  private async syncGoogleDriveDocs(
    client: GoogleDriveClient,
  ): Promise<number> {
    const settings = this.getSettings();
    const folderPath = `${settings.baseFolderPath}/${settings.googleDriveFolderName}`;
    await this.ensureFolder(folderPath);

    const docs = await client.fetchGoogleDocsInFolder(
      settings.googleDriveFolderId,
      100,
    );

    let count = 0;
    for (const doc of docs) {
      const fileName = sanitizeFileName(doc.name);
      const filePath = normalizePath(`${folderPath}/${fileName}.md`);
      const existingFile = this.app.vault.getAbstractFileByPath(filePath);

      if (existingFile instanceof TFile) {
        const existingContent = await this.app.vault.read(existingFile);
        const existingUpdated =
          this.extractFrontmatterField(existingContent, "updated") ?? "";
        if (existingUpdated >= doc.modifiedTime) {
          continue;
        }
      }

      const plainText = await client.exportAsPlainText(doc.id);
      const content = this.renderGoogleDriveNote(doc, plainText);

      if (existingFile instanceof TFile) {
        await this.app.vault.modify(existingFile, content);
      } else {
        await this.app.vault.create(filePath, content);
      }
      count++;
    }
    return count;
  }

  private renderGoogleDriveNote(
    doc: GoogleDriveFile,
    plainText: string,
  ): string {
    const fm = [
      "---",
      `type: "google-doc"`,
      `google_drive_id: "${escapeYaml(doc.id)}"`,
      `title: "${escapeYaml(doc.name)}"`,
      `updated: "${doc.modifiedTime}"`,
      `url: "${escapeYaml(doc.webViewLink)}"`,
      `tags:`,
      `  - "google-drive"`,
      `  - "google-doc"`,
      `synced: "${new Date().toISOString()}"`,
      "---",
    ];

    const body = [
      "",
      `# ${doc.name}`,
      "",
      `[Open in Google Docs](${doc.webViewLink})`,
      "",
      "## Content",
      "",
      plainText.trim() || "_No content available from export._",
      "",
    ];

    return [...fm, ...body].join("\n");
  }

  private async syncHubSpotData(client: HubSpotClient): Promise<{
    contacts: number;
    companies: number;
    deals: number;
    meetings: number;
    tickets: number;
  }> {
    const contacts = await client.fetchContacts();
    const companies = await client.fetchCompanies();
    const deals = await client.fetchDeals();
    const meetings = await client.fetchMeetings();
    const tickets = await client.fetchTickets();

    const companiesById = new Map<string, HubSpotCompany>();
    for (const company of companies) {
      companiesById.set(company.id, company);
    }

    const contactsById = new Map<string, HubSpotContact>();
    for (const contact of contacts) {
      contactsById.set(contact.id, contact);
    }

    const dealsById = new Map<string, HubSpotDeal>();
    for (const deal of deals) {
      dealsById.set(deal.id, deal);
    }

    return {
      contacts: await this.syncHubSpotContacts(contacts, companiesById),
      companies: await this.syncHubSpotCompanies(companies),
      deals: await this.syncHubSpotDeals(deals, companiesById, contactsById),
      meetings: await this.syncHubSpotMeetings(
        meetings,
        companiesById,
        contactsById,
        dealsById,
      ),
      tickets: await this.syncHubSpotTickets(
        tickets,
        companiesById,
        contactsById,
        dealsById,
      ),
    };
  }

  private async syncHubSpotContacts(
    contacts: HubSpotContact[],
    companiesById: Map<string, HubSpotCompany>,
  ): Promise<number> {
    const settings = this.getSettings();
    const folderPath = `${settings.baseFolderPath}/${settings.hubspotFolderName}/Contacts`;
    await this.ensureFolder(folderPath);

    let count = 0;
    for (const contact of contacts) {
      const title =
        contact.fullName || contact.email || `Contact ${contact.id}`;
      const fileName = sanitizeFileName(title);
      const filePath = normalizePath(`${folderPath}/${fileName}.md`);
      const existingFile = this.app.vault.getAbstractFileByPath(filePath);
      const updatedAt =
        contact.updatedAt ?? contact.createdAt ?? new Date().toISOString();

      if (existingFile instanceof TFile) {
        const existingContent = await this.app.vault.read(existingFile);
        const existingUpdated =
          this.extractFrontmatterField(existingContent, "updated") ?? "";
        if (existingUpdated >= updatedAt) {
          continue;
        }
      }

      const associatedCompanies = contact.associatedCompanyIds
        .map((id) => companiesById.get(id)?.name)
        .filter((name): name is string => Boolean(name));
      const content = this.renderHubSpotContactNote(
        contact,
        associatedCompanies,
      );
      if (existingFile instanceof TFile) {
        await this.app.vault.modify(existingFile, content);
      } else {
        await this.app.vault.create(filePath, content);
      }
      count++;
    }

    return count;
  }

  private async syncHubSpotCompanies(
    companies: HubSpotCompany[],
  ): Promise<number> {
    const settings = this.getSettings();
    const folderPath = `${settings.baseFolderPath}/${settings.hubspotFolderName}/Companies`;
    await this.ensureFolder(folderPath);

    let count = 0;
    for (const company of companies) {
      const fileName = sanitizeFileName(
        company.name || `Company ${company.id}`,
      );
      const filePath = normalizePath(`${folderPath}/${fileName}.md`);
      const existingFile = this.app.vault.getAbstractFileByPath(filePath);
      const updatedAt =
        company.updatedAt ?? company.createdAt ?? new Date().toISOString();

      if (existingFile instanceof TFile) {
        const existingContent = await this.app.vault.read(existingFile);
        const existingUpdated =
          this.extractFrontmatterField(existingContent, "updated") ?? "";
        if (existingUpdated >= updatedAt) {
          continue;
        }
      }

      const content = this.renderHubSpotCompanyNote(company);
      if (existingFile instanceof TFile) {
        await this.app.vault.modify(existingFile, content);
      } else {
        await this.app.vault.create(filePath, content);
      }
      count++;
    }

    return count;
  }

  private async syncHubSpotDeals(
    deals: HubSpotDeal[],
    companiesById: Map<string, HubSpotCompany>,
    contactsById: Map<string, HubSpotContact>,
  ): Promise<number> {
    const settings = this.getSettings();
    const folderPath = `${settings.baseFolderPath}/${settings.hubspotFolderName}/Deals`;
    await this.ensureFolder(folderPath);

    let count = 0;
    for (const deal of deals) {
      const fileName = sanitizeFileName(deal.name || `Deal ${deal.id}`);
      const filePath = normalizePath(`${folderPath}/${fileName}.md`);
      const existingFile = this.app.vault.getAbstractFileByPath(filePath);
      const updatedAt =
        deal.updatedAt ?? deal.createdAt ?? new Date().toISOString();

      if (existingFile instanceof TFile) {
        const existingContent = await this.app.vault.read(existingFile);
        const existingUpdated =
          this.extractFrontmatterField(existingContent, "updated") ?? "";
        if (existingUpdated >= updatedAt) {
          continue;
        }
      }

      const companyNames = deal.associatedCompanyIds
        .map((id) => companiesById.get(id)?.name)
        .filter((name): name is string => Boolean(name));
      const contactNames = deal.associatedContactIds
        .map(
          (id) => contactsById.get(id)?.fullName || contactsById.get(id)?.email,
        )
        .filter((name): name is string => Boolean(name));
      const content = this.renderHubSpotDealNote(
        deal,
        companyNames,
        contactNames,
      );
      if (existingFile instanceof TFile) {
        await this.app.vault.modify(existingFile, content);
      } else {
        await this.app.vault.create(filePath, content);
      }
      count++;
    }

    return count;
  }

  private async syncHubSpotMeetings(
    meetings: HubSpotMeeting[],
    companiesById: Map<string, HubSpotCompany>,
    contactsById: Map<string, HubSpotContact>,
    dealsById: Map<string, HubSpotDeal>,
  ): Promise<number> {
    const settings = this.getSettings();
    const folderPath = `${settings.baseFolderPath}/${settings.hubspotFolderName}/Meetings`;
    await this.ensureFolder(folderPath);

    let count = 0;
    for (const meeting of meetings) {
      const fileName = sanitizeFileName(
        meeting.title || `Meeting ${meeting.id}`,
      );
      const filePath = normalizePath(`${folderPath}/${fileName}.md`);
      const existingFile = this.app.vault.getAbstractFileByPath(filePath);
      const updatedAt =
        meeting.updatedAt ?? meeting.createdAt ?? new Date().toISOString();

      if (existingFile instanceof TFile) {
        const existingContent = await this.app.vault.read(existingFile);
        const existingUpdated =
          this.extractFrontmatterField(existingContent, "updated") ?? "";
        if (existingUpdated >= updatedAt) {
          continue;
        }
      }

      const companyNames = meeting.associatedCompanyIds
        .map((id) => companiesById.get(id)?.name)
        .filter((name): name is string => Boolean(name));
      const contactNames = meeting.associatedContactIds
        .map(
          (id) => contactsById.get(id)?.fullName || contactsById.get(id)?.email,
        )
        .filter((name): name is string => Boolean(name));
      const contactEmails = meeting.associatedContactIds
        .map((id) => contactsById.get(id)?.email)
        .filter((email): email is string => Boolean(email));
      const dealNames = meeting.associatedDealIds
        .map((id) => dealsById.get(id)?.name)
        .filter((name): name is string => Boolean(name));
      const content = this.renderHubSpotMeetingNote(
        meeting,
        companyNames,
        contactNames,
        contactEmails,
        dealNames,
      );
      if (existingFile instanceof TFile) {
        await this.app.vault.modify(existingFile, content);
      } else {
        await this.app.vault.create(filePath, content);
      }
      count++;
    }

    return count;
  }

  private async syncHubSpotTickets(
    tickets: HubSpotTicket[],
    companiesById: Map<string, HubSpotCompany>,
    contactsById: Map<string, HubSpotContact>,
    dealsById: Map<string, HubSpotDeal>,
  ): Promise<number> {
    const settings = this.getSettings();
    const folderPath = `${settings.baseFolderPath}/${settings.hubspotFolderName}/Tickets`;
    await this.ensureFolder(folderPath);

    let count = 0;
    for (const ticket of tickets) {
      const fileName = sanitizeFileName(
        ticket.subject || `Ticket ${ticket.id}`,
      );
      const filePath = normalizePath(`${folderPath}/${fileName}.md`);
      const existingFile = this.app.vault.getAbstractFileByPath(filePath);
      const updatedAt =
        ticket.updatedAt ?? ticket.createdAt ?? new Date().toISOString();

      if (existingFile instanceof TFile) {
        const existingContent = await this.app.vault.read(existingFile);
        const existingUpdated =
          this.extractFrontmatterField(existingContent, "updated") ?? "";
        if (existingUpdated >= updatedAt) {
          continue;
        }
      }

      const companyNames = ticket.associatedCompanyIds
        .map((id) => companiesById.get(id)?.name)
        .filter((name): name is string => Boolean(name));
      const contactNames = ticket.associatedContactIds
        .map(
          (id) => contactsById.get(id)?.fullName || contactsById.get(id)?.email,
        )
        .filter((name): name is string => Boolean(name));
      const dealNames = ticket.associatedDealIds
        .map((id) => dealsById.get(id)?.name)
        .filter((name): name is string => Boolean(name));
      const content = this.renderHubSpotTicketNote(
        ticket,
        companyNames,
        contactNames,
        dealNames,
      );
      if (existingFile instanceof TFile) {
        await this.app.vault.modify(existingFile, content);
      } else {
        await this.app.vault.create(filePath, content);
      }
      count++;
    }

    return count;
  }

  private renderHubSpotContactNote(
    contact: HubSpotContact,
    associatedCompanies: string[],
  ): string {
    const now = new Date().toISOString();
    const fm = [
      "---",
      `type: "hubspot-contact"`,
      `hubspot_contact_id: "${escapeYaml(contact.id)}"`,
      `title: "${escapeYaml(contact.fullName || contact.email || `Contact ${contact.id}`)}"`,
      `email: "${escapeYaml(contact.email ?? "")}"`,
      `company: "${escapeYaml(contact.company ?? "")}"`,
      `job_title: "${escapeYaml(contact.jobTitle ?? "")}"`,
      `lifecycle_stage: "${escapeYaml(contact.lifecycleStage ?? "")}"`,
      `lead_status: "${escapeYaml(contact.leadStatus ?? "")}"`,
      `updated: "${contact.updatedAt ?? now}"`,
      `synced: "${now}"`,
    ];
    if (associatedCompanies.length > 0) {
      fm.push("associated_companies:");
      for (const name of associatedCompanies) {
        fm.push(`  - "${escapeYaml(name)}"`);
      }
    }
    fm.push(`tags:`);
    fm.push(`  - "hubspot"`);
    fm.push(`  - "hubspot/contact"`);
    fm.push("---");

    const body = [
      "",
      `# ${contact.fullName || contact.email || `Contact ${contact.id}`}`,
      "",
      contact.phone ? `- Phone: ${contact.phone}` : "",
      associatedCompanies.length > 0
        ? `- Associated companies: ${associatedCompanies.join(", ")}`
        : "",
      "",
    ].filter((line) => line !== "");

    return [...fm, ...body].join("\n");
  }

  private renderHubSpotCompanyNote(company: HubSpotCompany): string {
    const now = new Date().toISOString();
    const fm = [
      "---",
      `type: "hubspot-company"`,
      `hubspot_company_id: "${escapeYaml(company.id)}"`,
      `company: "${escapeYaml(company.name)}"`,
      `domain: "${escapeYaml(company.domain ?? "")}"`,
      `industry: "${escapeYaml(company.industry ?? "")}"`,
      `lifecycle_stage: "${escapeYaml(company.lifecycleStage ?? "")}"`,
      `lead_status: "${escapeYaml(company.leadStatus ?? "")}"`,
      `updated: "${company.updatedAt ?? now}"`,
      `synced: "${now}"`,
      `tags:`,
      `  - "hubspot"`,
      `  - "hubspot/company"`,
      "---",
      "",
      `# ${company.name}`,
      "",
    ];
    if (company.numberOfEmployees) {
      fm.push(`- Employees: ${company.numberOfEmployees}`);
    }
    if (company.annualRevenue) {
      fm.push(`- Annual Revenue: ${company.annualRevenue}`);
    }
    fm.push("");
    return fm.join("\n");
  }

  private renderHubSpotDealNote(
    deal: HubSpotDeal,
    companyNames: string[],
    contactNames: string[],
  ): string {
    const now = new Date().toISOString();
    const fm = [
      "---",
      `type: "hubspot-deal"`,
      `hubspot_deal_id: "${escapeYaml(deal.id)}"`,
      `deal_name: "${escapeYaml(deal.name)}"`,
      `deal_stage: "${escapeYaml(deal.stage ?? "")}"`,
      `amount: "${escapeYaml(deal.amount ?? "")}"`,
      `close_date: "${escapeYaml(deal.closeDate ?? "")}"`,
      `pipeline: "${escapeYaml(deal.pipeline ?? "")}"`,
      `updated: "${deal.updatedAt ?? now}"`,
      `synced: "${now}"`,
    ];
    if (companyNames.length > 0) {
      fm.push("related_companies:");
      for (const name of companyNames) {
        fm.push(`  - "${escapeYaml(name)}"`);
      }
    }
    if (contactNames.length > 0) {
      fm.push("related_contacts:");
      for (const name of contactNames) {
        fm.push(`  - "${escapeYaml(name)}"`);
      }
    }
    fm.push(`tags:`);
    fm.push(`  - "hubspot"`);
    fm.push(`  - "hubspot/deal"`);
    fm.push("---");

    const body = [
      "",
      `# ${deal.name}`,
      "",
      deal.stage ? `- Stage: ${deal.stage}` : "",
      deal.amount ? `- Amount: ${deal.amount}` : "",
      deal.closeDate ? `- Close date: ${deal.closeDate}` : "",
      companyNames.length > 0 ? `- Companies: ${companyNames.join(", ")}` : "",
      contactNames.length > 0 ? `- Contacts: ${contactNames.join(", ")}` : "",
      "",
    ].filter((line) => line !== "");

    return [...fm, ...body].join("\n");
  }

  private renderHubSpotMeetingNote(
    meeting: HubSpotMeeting,
    companyNames: string[],
    contactNames: string[],
    contactEmails: string[],
    dealNames: string[],
  ): string {
    const now = new Date().toISOString();
    const fm = [
      "---",
      `type: "hubspot-meeting"`,
      `hubspot_meeting_id: "${escapeYaml(meeting.id)}"`,
      `title: "${escapeYaml(meeting.title)}"`,
      `start_time: "${escapeYaml(meeting.startTime ?? "")}"`,
      `end_time: "${escapeYaml(meeting.endTime ?? "")}"`,
      `outcome: "${escapeYaml(meeting.outcome ?? "")}"`,
      `updated: "${meeting.updatedAt ?? now}"`,
      `synced: "${now}"`,
    ];
    if (companyNames.length > 0) {
      fm.push("related_companies:");
      for (const name of companyNames) {
        fm.push(`  - "${escapeYaml(name)}"`);
      }
    }
    if (contactNames.length > 0) {
      fm.push("related_contacts:");
      for (const name of contactNames) {
        fm.push(`  - "${escapeYaml(name)}"`);
      }
    }
    if (contactEmails.length > 0) {
      fm.push("contact_emails:");
      for (const email of contactEmails) {
        fm.push(`  - "${escapeYaml(email)}"`);
      }
    }
    if (dealNames.length > 0) {
      fm.push("related_deals:");
      for (const name of dealNames) {
        fm.push(`  - "${escapeYaml(name)}"`);
      }
    }
    fm.push(`tags:`);
    fm.push(`  - "hubspot"`);
    fm.push(`  - "hubspot/meeting"`);
    fm.push("---");

    const body = [
      "",
      `# ${meeting.title}`,
      "",
      meeting.startTime ? `- Start: ${meeting.startTime}` : "",
      meeting.endTime ? `- End: ${meeting.endTime}` : "",
      meeting.outcome ? `- Outcome: ${meeting.outcome}` : "",
      companyNames.length > 0 ? `- Companies: ${companyNames.join(", ")}` : "",
      contactNames.length > 0 ? `- Contacts: ${contactNames.join(", ")}` : "",
      dealNames.length > 0 ? `- Deals: ${dealNames.join(", ")}` : "",
      "",
      "## Notes",
      "",
      meeting.body?.trim() || "_No notes provided._",
      "",
    ].filter((line) => line !== "");

    return [...fm, ...body].join("\n");
  }

  private renderHubSpotTicketNote(
    ticket: HubSpotTicket,
    companyNames: string[],
    contactNames: string[],
    dealNames: string[],
  ): string {
    const now = new Date().toISOString();
    const fm = [
      "---",
      `type: "hubspot-ticket"`,
      `hubspot_ticket_id: "${escapeYaml(ticket.id)}"`,
      `subject: "${escapeYaml(ticket.subject)}"`,
      `priority: "${escapeYaml(ticket.priority ?? "")}"`,
      `pipeline_stage: "${escapeYaml(ticket.pipelineStage ?? "")}"`,
      `updated: "${ticket.updatedAt ?? now}"`,
      `synced: "${now}"`,
    ];
    if (companyNames.length > 0) {
      fm.push("related_companies:");
      for (const name of companyNames) {
        fm.push(`  - "${escapeYaml(name)}"`);
      }
    }
    if (contactNames.length > 0) {
      fm.push("related_contacts:");
      for (const name of contactNames) {
        fm.push(`  - "${escapeYaml(name)}"`);
      }
    }
    if (dealNames.length > 0) {
      fm.push("related_deals:");
      for (const name of dealNames) {
        fm.push(`  - "${escapeYaml(name)}"`);
      }
    }
    fm.push(`tags:`);
    fm.push(`  - "hubspot"`);
    fm.push(`  - "hubspot/ticket"`);
    fm.push("---");

    const body = [
      "",
      `# ${ticket.subject}`,
      "",
      ticket.priority ? `- Priority: ${ticket.priority}` : "",
      ticket.pipelineStage ? `- Pipeline stage: ${ticket.pipelineStage}` : "",
      companyNames.length > 0 ? `- Companies: ${companyNames.join(", ")}` : "",
      contactNames.length > 0 ? `- Contacts: ${contactNames.join(", ")}` : "",
      dealNames.length > 0 ? `- Deals: ${dealNames.join(", ")}` : "",
      "",
      "## Content",
      "",
      ticket.content?.trim() || "_No ticket content provided._",
      "",
    ].filter((line) => line !== "");

    return [...fm, ...body].join("\n");
  }

  private async syncCustomer360Pages(
    allDocs: GranolaDocument[],
  ): Promise<void> {
    const settings = this.getSettings();
    const basePath = settings.baseFolderPath;
    const meetingsFolderPath = `${basePath}/${settings.meetingsFolderName}`;
    const customersFolderPath = `${basePath}/${settings.customersFolderName}`;

    const customerSet = new Set<string>();
    for (const doc of allDocs) {
      const tags = this.tagger.extract(doc);
      for (const customer of tags.customers) {
        customerSet.add(customer);
      }
    }

    const meetingFiles = settings.healthScoreEnabled
      ? this.app.vault
          .getMarkdownFiles()
          .filter((f) => f.path.startsWith(meetingsFolderPath + "/"))
      : [];
    const issueFiles =
      settings.healthScoreEnabled && settings.syncLinear
        ? this.app.vault
            .getMarkdownFiles()
            .filter((f) =>
              f.path.startsWith(
                `${basePath}/${settings.linearFolderName}/Issues/`,
              ),
            )
        : [];
    const hubspotDeals =
      settings.healthScoreEnabled && settings.syncHubspot
        ? this.app.vault
            .getMarkdownFiles()
            .filter((f) =>
              f.path.startsWith(
                `${basePath}/${settings.hubspotFolderName}/Deals/`,
              ),
            )
        : [];
    const hubspotTickets =
      settings.healthScoreEnabled && settings.syncHubspot
        ? this.app.vault
            .getMarkdownFiles()
            .filter((f) =>
              f.path.startsWith(
                `${basePath}/${settings.hubspotFolderName}/Tickets/`,
              ),
            )
        : [];
    const hubspotCompanies =
      settings.healthScoreEnabled && settings.syncHubspot
        ? this.app.vault
            .getMarkdownFiles()
            .filter((f) =>
              f.path.startsWith(
                `${basePath}/${settings.hubspotFolderName}/Companies/`,
              ),
            )
        : [];

    for (const customer of customerSet) {
      const fileName = sanitizeFileName(customer);
      const filePath = normalizePath(`${customersFolderPath}/${fileName}.md`);
      const existingFile = this.app.vault.getAbstractFileByPath(filePath);

      let finalContent: string;

      if (existingFile instanceof TFile) {
        const existingContent = await this.app.vault.read(existingFile);
        const markerIndex = existingContent.indexOf("<!-- user-content -->");
        if (markerIndex !== -1) {
          const userContent = existingContent.substring(markerIndex);
          const generated = generateCustomer360(
            customer,
            meetingsFolderPath,
            basePath,
          );
          const generatedMarkerIndex = generated.indexOf(
            "<!-- user-content -->",
          );
          const generatedAbove =
            generatedMarkerIndex !== -1
              ? generated.substring(0, generatedMarkerIndex)
              : generated;
          finalContent = generatedAbove + userContent;
        } else {
          finalContent = generateCustomer360(
            customer,
            meetingsFolderPath,
            basePath,
          );
        }
      } else {
        finalContent = generateCustomer360(
          customer,
          meetingsFolderPath,
          basePath,
        );
      }

      if (settings.healthScoreEnabled) {
        let sentimentScore: number | undefined;

        if (settings.aiEnabled && settings.claudeApiKey) {
          try {
            const customerLower = customer.toLowerCase();
            const customerMeetings = meetingFiles.filter((f) =>
              f.basename.toLowerCase().includes(customerLower),
            );
            const excerpts: string[] = [];
            for (const mf of customerMeetings.slice(0, 5)) {
              const raw = await this.app.vault.read(mf);
              const stripped = raw.replace(/^---[\s\S]*?---/, "").trim();
              excerpts.push(stripped.substring(0, 500));
            }
            if (excerpts.length > 0) {
              const cortex = new AICortex(
                settings.claudeApiKey,
                settings.aiModelFast,
                settings.aiModelDeep,
              );
              sentimentScore = await cortex.analyzeSentiment(excerpts);
            }
          } catch {}
        }

        const health = calculateHealthScore(
          customer,
          meetingFiles,
          issueFiles,
          sentimentScore,
          {
            openDeals: hubspotDeals.filter((f) =>
              f.basename.toLowerCase().includes(customer.toLowerCase()),
            ).length,
            ticketCount: hubspotTickets.filter((f) =>
              f.basename.toLowerCase().includes(customer.toLowerCase()),
            ).length,
            lifecycleStage: hubspotCompanies.find((f) =>
              f.basename.toLowerCase().includes(customer.toLowerCase()),
            )
              ? "customer"
              : undefined,
          },
          {
            componentWeights: {
              customerSatisfaction: settings.healthWeightCustomerSatisfaction,
              performanceGoals: settings.healthWeightPerformanceGoals,
              productEngagement: settings.healthWeightProductEngagement,
            },
            customerSatisfactionWeights: {
              sentiment: settings.healthCustomerSatisfactionSentimentWeight,
              issues: settings.healthCustomerSatisfactionIssuesWeight,
            },
            performanceGoalsWeights: {
              issues: settings.healthPerformanceGoalsIssuesWeight,
              crm: settings.healthPerformanceGoalsCrmWeight,
            },
            productEngagementWeights: {
              meetings: settings.healthProductEngagementMeetingWeight,
              sentiment: settings.healthProductEngagementSentimentWeight,
            },
            tiers: {
              healthyMin: settings.healthTierHealthyMin,
              atRiskMin: settings.healthTierAtRiskMin,
            },
          },
        );
        finalContent = updateHealthScoreInContent(finalContent, health);
      }

      if (existingFile instanceof TFile) {
        await this.app.vault.modify(existingFile, finalContent);
      } else {
        await this.app.vault.create(filePath, finalContent);
      }
    }
  }

  private async syncTeamProfiles(members: WorkspaceMember[]): Promise<void> {
    const settings = this.getSettings();
    const basePath = settings.baseFolderPath;
    const meetingsFolderPath = `${basePath}/${settings.meetingsFolderName}`;
    const peopleFolderPath = `${basePath}/${settings.peopleFolderName}`;

    const internalMembers = members.filter((m) =>
      m.email.endsWith("@adora-ai.com"),
    );

    for (const member of internalMembers) {
      const fileName = sanitizeFileName(member.name);
      const filePath = normalizePath(`${peopleFolderPath}/${fileName}.md`);
      const existingFile = this.app.vault.getAbstractFileByPath(filePath);

      if (existingFile instanceof TFile) {
        const existingContent = await this.app.vault.read(existingFile);
        const markerIndex = existingContent.indexOf("<!-- user-content -->");
        if (markerIndex !== -1) {
          const userContent = existingContent.substring(markerIndex);
          const generated = generateTeamProfile(
            member,
            basePath,
            meetingsFolderPath,
          );
          const generatedMarkerIndex = generated.indexOf(
            "<!-- user-content -->",
          );
          const generatedAbove =
            generatedMarkerIndex !== -1
              ? generated.substring(0, generatedMarkerIndex)
              : generated;
          await this.app.vault.modify(
            existingFile,
            generatedAbove + userContent,
          );
        }
      } else {
        const content = generateTeamProfile(
          member,
          basePath,
          meetingsFolderPath,
        );
        await this.app.vault.create(filePath, content);
      }
    }
  }

  private async gatherAllDocuments(
    settings: GranolaAdoraSettings,
    result: SyncResult,
  ): Promise<GranolaDocument[]> {
    const seen = new Map<string, GranolaDocument>();

    try {
      const myDocs = await this.api.fetchMyDocuments();
      for (const doc of myDocs) {
        seen.set(doc.id, doc);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      result.errors.push(`Failed to fetch your documents: ${message}`);
    }

    if (settings.syncSharedDocs) {
      try {
        const shared = await this.api.fetchSharedDocuments();
        for (const doc of shared) {
          if (!seen.has(doc.id)) {
            seen.set(doc.id, doc);
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        result.errors.push(`Failed to fetch shared documents: ${message}`);
      }
    }

    if (settings.syncWorkspaceLists) {
      try {
        const lists = await this.api.fetchDocumentLists();
        for (const list of lists) {
          await this.ensureListFolder(list, settings);
          for (const doc of list.documents) {
            doc._listTitle = list.title;
            if (!seen.has(doc.id)) {
              seen.set(doc.id, doc);
            }
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        result.errors.push(`Failed to fetch workspace lists: ${message}`);
      }
    }

    return [...seen.values()];
  }

  private async ensureFolderStructure(
    settings: GranolaAdoraSettings,
  ): Promise<void> {
    const folders = [
      settings.baseFolderPath,
      `${settings.baseFolderPath}/${settings.meetingsFolderName}`,
      `${settings.baseFolderPath}/${settings.ideasFolderName}`,
      `${settings.baseFolderPath}/${settings.customersFolderName}`,
      `${settings.baseFolderPath}/${settings.peopleFolderName}`,
      `${settings.baseFolderPath}/${settings.prioritiesFolderName}`,
    ];

    if (settings.syncLinear) {
      folders.push(`${settings.baseFolderPath}/${settings.linearFolderName}`);
      folders.push(
        `${settings.baseFolderPath}/${settings.linearFolderName}/Issues`,
      );
      folders.push(
        `${settings.baseFolderPath}/${settings.linearFolderName}/Projects`,
      );
    }

    if (settings.syncFigma) {
      folders.push(`${settings.baseFolderPath}/${settings.designsFolderName}`);
    }

    if (settings.aiEnabled) {
      folders.push(`${settings.baseFolderPath}/${settings.digestsFolderName}`);
    }

    if (settings.syncSlack) {
      folders.push(`${settings.baseFolderPath}/${settings.slackFolderName}`);
    }

    if (settings.syncGithub) {
      folders.push(`${settings.baseFolderPath}/${settings.githubFolderName}`);
    }

    if (settings.syncGoogleDrive) {
      folders.push(
        `${settings.baseFolderPath}/${settings.googleDriveFolderName}`,
      );
    }

    if (settings.syncHubspot) {
      folders.push(`${settings.baseFolderPath}/${settings.hubspotFolderName}`);
      folders.push(
        `${settings.baseFolderPath}/${settings.hubspotFolderName}/Contacts`,
      );
      folders.push(
        `${settings.baseFolderPath}/${settings.hubspotFolderName}/Companies`,
      );
      folders.push(
        `${settings.baseFolderPath}/${settings.hubspotFolderName}/Deals`,
      );
      folders.push(
        `${settings.baseFolderPath}/${settings.hubspotFolderName}/Meetings`,
      );
      folders.push(
        `${settings.baseFolderPath}/${settings.hubspotFolderName}/Tickets`,
      );
    }

    folders.push(`${settings.baseFolderPath}/${settings.decisionsFolderName}`);
    folders.push(
      `${settings.baseFolderPath}/${settings.releaseNotesFolderName}`,
    );

    for (const folder of folders) {
      await this.ensureFolder(folder);
    }
  }

  private async ensureListFolder(
    list: GranolaDocumentList,
    settings: GranolaAdoraSettings,
  ): Promise<void> {
    const folderName = sanitizeFileName(list.title);
    await this.ensureFolder(
      `${settings.baseFolderPath}/${settings.meetingsFolderName}/${folderName}`,
    );
  }

  private async ensureFolder(path: string): Promise<void> {
    const normalized = normalizePath(path);
    if (!this.app.vault.getAbstractFileByPath(normalized)) {
      await this.app.vault.createFolder(normalized);
    }
  }

  private async ensureCustomerNotes(
    customers: string[],
    settings: GranolaAdoraSettings,
  ): Promise<void> {
    for (const customer of customers) {
      const fileName = sanitizeFileName(customer);
      const filePath = normalizePath(
        `${settings.baseFolderPath}/${settings.customersFolderName}/${fileName}.md`,
      );
      if (!this.app.vault.getAbstractFileByPath(filePath)) {
        const meetingsPath = `${settings.baseFolderPath}/${settings.meetingsFolderName}`;
        await this.app.vault.create(
          filePath,
          renderCustomerNote(customer, meetingsPath),
        );
      }
    }
  }

  private buildMeetingFilePath(
    doc: GranolaDocument,
    settings: GranolaAdoraSettings,
  ): string {
    const datePrefix = new Date(doc.created_at).toISOString().split("T")[0];
    const title = sanitizeFileName(doc.title ?? "Untitled Meeting");

    if (doc._listTitle) {
      const listFolder = sanitizeFileName(doc._listTitle);
      return normalizePath(
        `${settings.baseFolderPath}/${settings.meetingsFolderName}/${listFolder}/${datePrefix} ${title}.md`,
      );
    }

    return normalizePath(
      `${settings.baseFolderPath}/${settings.meetingsFolderName}/${datePrefix} ${title}.md`,
    );
  }

  private extractFrontmatterField(
    content: string,
    field: string,
  ): string | null {
    const match = content.match(new RegExp(`${field}:\\s*"([^"]+)"`));
    return match ? match[1] : null;
  }

  private async withTimeout<T>(
    promise: Promise<T>,
    ms: number,
    label: string,
  ): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(
          () => reject(new Error(`${label} sync timed out after ${ms}ms`)),
          ms,
        ),
      ),
    ]);
  }
}

export function formatSyncResult(result: SyncResult): string {
  const parts: string[] = [];
  if (result.created > 0) parts.push(`${result.created} new`);
  if (result.updated > 0) parts.push(`${result.updated} updated`);
  if (result.skipped > 0) parts.push(`${result.skipped} unchanged`);
  if (result.linearIssues > 0)
    parts.push(`${result.linearIssues} Linear issues`);
  if (result.linearProjects > 0)
    parts.push(`${result.linearProjects} Linear projects`);
  if (result.figmaFiles > 0) parts.push(`${result.figmaFiles} Figma files`);
  if (result.slackMessages > 0)
    parts.push(`${result.slackMessages} Slack messages`);
  if (result.githubPRs > 0) parts.push(`${result.githubPRs} GitHub PRs`);
  if (result.googleDriveDocs > 0)
    parts.push(`${result.googleDriveDocs} Google Drive docs`);
  if (result.hubspotContacts > 0)
    parts.push(`${result.hubspotContacts} HubSpot contacts`);
  if (result.hubspotCompanies > 0)
    parts.push(`${result.hubspotCompanies} HubSpot companies`);
  if (result.hubspotDeals > 0)
    parts.push(`${result.hubspotDeals} HubSpot deals`);
  if (result.hubspotMeetings > 0)
    parts.push(`${result.hubspotMeetings} HubSpot meetings`);
  if (result.hubspotTickets > 0)
    parts.push(`${result.hubspotTickets} HubSpot tickets`);

  const summary =
    parts.length > 0
      ? `Granola sync: ${parts.join(", ")}`
      : "Granola sync: no new notes";
  return result.errors.length > 0
    ? `${summary} (${result.errors.length} errors)`
    : summary;
}
