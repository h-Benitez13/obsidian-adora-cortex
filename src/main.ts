import {
  App,
  Modal,
  Notice,
  Plugin,
  Setting,
  normalizePath,
  TFile,
  WorkspaceLeaf,
} from "obsidian";
import {
  GranolaAdoraSettings,
  DEFAULT_SETTINGS,
  Decision,
  TeamConfigTemplate,
  AskAdoraMessage,
} from "./types";
import { GranolaApiClient } from "./api";
import { AutoTagger } from "./tagger";
import { SyncEngine, formatSyncResult } from "./sync";
import { renderIdeaNote } from "./renderer";
import { GranolaAdoraSettingTab } from "./settings-tab";
import { IdeaFromMeetingModal } from "./modals";
import { AICortex } from "./ai";
import { Linker, formatLinkResult } from "./linker";
import { calculateHealthScore, updateHealthScoreInContent } from "./profiles";
import { LinearClient } from "./linear";
import { ASK_ADORA_VIEW_TYPE, AskAdoraView } from "./ask-adora-view";

export default class GranolaAdoraPlugin extends Plugin {
  settings: GranolaAdoraSettings = DEFAULT_SETTINGS;
  private api: GranolaApiClient = new GranolaApiClient();
  private tagger: AutoTagger = new AutoTagger([], []);
  private syncEngine!: SyncEngine;
  private autoSyncIntervalId: number | null = null;
  private isSyncing = false;

  async onload(): Promise<void> {
    await this.loadPluginSettings();

    this.tagger = new AutoTagger(
      this.settings.knownCustomers,
      this.settings.knownTopics,
    );
    this.syncEngine = new SyncEngine(
      this.app,
      this.api,
      this.tagger,
      () => this.settings,
      () => this.savePluginSettings(),
    );

    this.addSettingTab(new GranolaAdoraSettingTab(this.app, this));

    this.addRibbonIcon("refresh-cw", "Sync Granola", () => {
      this.runSync();
    });
    this.addRibbonIcon("message-square", "Ask Adora", () => {
      this.activateAskAdoraView();
    });

    this.registerView(
      ASK_ADORA_VIEW_TYPE,
      (leaf) => new AskAdoraView(leaf, this),
    );

    this.addCommand({
      id: "granola-sync",
      name: "Sync meetings from Granola",
      callback: () => this.runSync(),
    });

    this.addCommand({
      id: "granola-open-ask-adora",
      name: "Open Ask Adora chat panel",
      callback: () => this.activateAskAdoraView(),
    });
    this.addCommand({
      id: "granola-ask-adora-send",
      name: "Ask Adora: Send message",
      callback: () => this.sendAskAdoraMessage(),
    });
    this.addCommand({
      id: "granola-ask-adora-clear",
      name: "Ask Adora: Clear conversation",
      callback: () => this.clearAskAdoraConversation(),
    });
    this.addCommand({
      id: "granola-ask-adora-save",
      name: "Ask Adora: Save conversation",
      callback: () => this.saveAskAdoraConversation(),
    });
    this.addCommand({
      id: "granola-ask-adora-new",
      name: "Ask Adora: Start new conversation",
      callback: () => this.startAskAdoraConversation(),
    });

    this.addCommand({
      id: "granola-create-idea",
      name: "Create idea from meeting",
      callback: () => this.createIdeaFromMeeting(),
    });

    this.addCommand({
      id: "granola-full-resync",
      name: "Full re-sync (reset and re-import all)",
      callback: async () => {
        this.settings.lastSyncTimestamp = null;
        this.settings.syncedDocIds = [];
        await this.savePluginSettings();
        await this.runSync();
      },
    });

    this.addCommand({
      id: "granola-prep-brief",
      name: "Prepare customer brief (AI)",
      callback: () => this.generatePrepBrief(),
    });

    this.addCommand({
      id: "granola-weekly-digest",
      name: "Generate weekly digest (AI)",
      callback: () => this.generateWeeklyDigest(),
    });

    this.addCommand({
      id: "granola-detect-themes",
      name: "Analyze meeting themes (AI)",
      callback: () => this.generateThemeAnalysis(),
    });

    this.addCommand({
      id: "granola-customer-asks",
      name: "Extract top customer asks (AI)",
      callback: () => this.generateTopCustomerAsks(),
    });

    this.addCommand({
      id: "granola-extract-ideas",
      name: "Extract ideas from current note (AI)",
      callback: () => this.extractIdeasFromNote(),
    });

    this.addCommand({
      id: "granola-auto-link",
      name: "Re-link all notes (cross-integration)",
      callback: () => this.runLinking(),
    });

    this.addCommand({
      id: "granola-recalculate-health",
      name: "Recalculate all customer health scores",
      callback: () => this.recalculateHealthScores(),
    });

    this.addCommand({
      id: "granola-generate-release-notes",
      name: "Generate release notes",
      callback: () => this.generateReleaseNotes(),
    });

    this.addCommand({
      id: "granola-extract-decisions",
      name: "Extract decisions from meeting",
      callback: async () => {
        const ai = this.requireAI();
        if (!ai) return;

        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) {
          new Notice("No active file. Open a meeting note first.");
          return;
        }

        const { baseFolderPath, meetingsFolderName } = this.settings;
        const meetingsPrefix = `${baseFolderPath}/${meetingsFolderName}/`;
        if (!activeFile.path.startsWith(meetingsPrefix)) {
          new Notice("Current file is not in the Meetings folder.");
          return;
        }

        new Notice("Extracting decisions...");
        try {
          const content = await this.app.vault.read(activeFile);
          const decisions = await ai.extractDecisions(content);

          if (decisions.length === 0) {
            new Notice("No decisions detected in this meeting.");
            return;
          }

          const meetingLink = `[[${activeFile.path.replace(/\.md$/, "")}]]`;
          for (const dec of decisions) {
            dec.sourceMeetingId = meetingLink;
          }

          const modal = new DecisionConfirmModal(
            this.app,
            decisions,
            async (confirmed) => {
              await this.saveDecisionNotes(confirmed);
            },
          );
          modal.open();
        } catch (err) {
          const message = err instanceof Error ? err.message : "Unknown error";
          new Notice(`Failed to extract decisions: ${message}`);
        }
      },
    });

    this.addCommand({
      id: "granola-log-decision",
      name: "Log a decision manually",
      callback: () => {
        const now = new Date().toISOString().split("T")[0];
        const emptyDecision: Decision = {
          id: `dec-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
          title: "",
          context: "",
          decision: "",
          rationale: "",
          participants: [],
          sourceMeetingId: null,
          date: now,
          status: "proposed",
          tags: ["decision"],
        };

        const modal = new DecisionConfirmModal(
          this.app,
          [emptyDecision],
          async (confirmed) => {
            await this.saveDecisionNotes(confirmed);
          },
        );
        modal.open();
      },
    });

    this.addCommand({
      id: "granola-export-config",
      name: "Export team config template",
      callback: () => this.exportTeamConfigTemplate(),
    });

    this.addCommand({
      id: "granola-import-config",
      name: "Import team config from active file",
      callback: () => this.importTeamConfigFromActiveFile(),
    });

    this.addCommand({
      id: "granola-team-one-step-setup",
      name: "Team one-step setup (import + full sync)",
      callback: () => this.runTeamOneStepSetup(),
    });

    if (this.settings.syncOnStartup) {
      setTimeout(() => this.runSync(), 3000);
    }

    this.startAutoSync();
  }

  onunload(): void {
    this.app.workspace.detachLeavesOfType(ASK_ADORA_VIEW_TYPE);
    this.stopAutoSync();
  }

  async loadPluginSettings(): Promise<void> {
    const loaded = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, loaded);
  }

  async savePluginSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  async exportTeamConfigTemplate(): Promise<void> {
    const template: TeamConfigTemplate = {
      syncIntervalMinutes: this.settings.syncIntervalMinutes,
      syncOnStartup: this.settings.syncOnStartup,
      baseFolderPath: this.settings.baseFolderPath,
      meetingsFolderName: this.settings.meetingsFolderName,
      ideasFolderName: this.settings.ideasFolderName,
      customersFolderName: this.settings.customersFolderName,
      peopleFolderName: this.settings.peopleFolderName,
      prioritiesFolderName: this.settings.prioritiesFolderName,
      includeTranscript: this.settings.includeTranscript,
      autoTagEnabled: this.settings.autoTagEnabled,
      knownCustomers: [...this.settings.knownCustomers],
      knownTopics: [...this.settings.knownTopics],
      syncSharedDocs: this.settings.syncSharedDocs,
      syncWorkspaceLists: this.settings.syncWorkspaceLists,
      syncLinear: this.settings.syncLinear,
      linearFolderName: this.settings.linearFolderName,
      syncFigma: this.settings.syncFigma,
      designsFolderName: this.settings.designsFolderName,
      aiEnabled: this.settings.aiEnabled,
      aiModel: this.settings.aiModel,
      aiModelFast: this.settings.aiModelFast,
      aiModelDeep: this.settings.aiModelDeep,
      digestsFolderName: this.settings.digestsFolderName,
      syncSlack: this.settings.syncSlack,
      slackFolderName: this.settings.slackFolderName,
      syncGithub: this.settings.syncGithub,
      githubOrg: this.settings.githubOrg,
      githubFolderName: this.settings.githubFolderName,
      syncGoogleDrive: this.settings.syncGoogleDrive,
      googleDriveFolderId: this.settings.googleDriveFolderId,
      googleDriveFolderName: this.settings.googleDriveFolderName,
      syncHubspot: this.settings.syncHubspot,
      hubspotFolderName: this.settings.hubspotFolderName,
      healthScoreEnabled: this.settings.healthScoreEnabled,
      decisionsFolderName: this.settings.decisionsFolderName,
      releaseNotesFolderName: this.settings.releaseNotesFolderName,
    };

    const exportPath = normalizePath(
      `${this.settings.baseFolderPath}/_setup/team-config.template.json`,
    );
    const payload = `${JSON.stringify(template, null, 2)}\n`;
    const existing = this.app.vault.getAbstractFileByPath(exportPath);
    if (existing instanceof TFile) {
      await this.app.vault.modify(existing, payload);
    } else {
      const setupFolder = normalizePath(`${this.settings.baseFolderPath}/_setup`);
      if (!this.app.vault.getAbstractFileByPath(setupFolder)) {
        await this.app.vault.createFolder(setupFolder);
      }
      await this.app.vault.create(exportPath, payload);
    }

    new Notice(`Team config template exported: ${exportPath}`);
  }

  async importTeamConfigFromActiveFile(): Promise<void> {
    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile) {
      new Notice("Open a team-config JSON file first, then run import.");
      return;
    }
    if (!activeFile.path.endsWith(".json")) {
      new Notice("Active file must be a JSON file.");
      return;
    }

    try {
      await this.importTeamConfigFromFile(activeFile);
      new Notice("Team config imported. Add your API keys/tokens in settings.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      new Notice(`Failed to import team config: ${message}`);
    }
  }

  async runTeamOneStepSetup(): Promise<void> {
    const defaultPath = normalizePath(
      `${this.settings.baseFolderPath}/_setup/team-config.template.json`,
    );
    const defaultConfig = this.app.vault.getAbstractFileByPath(defaultPath);
    const activeFile = this.app.workspace.getActiveFile();

    let configFile: TFile | null = null;
    if (defaultConfig instanceof TFile) {
      configFile = defaultConfig;
    } else if (activeFile && activeFile.path.endsWith(".json")) {
      configFile = activeFile;
    }

    if (!configFile) {
      new Notice(
        `No team config found. Add ${defaultPath} or open a config JSON file first.`,
      );
      return;
    }

    new Notice("Running team one-step setup...");

    try {
      await this.importTeamConfigFromFile(configFile);

      const missing = this.getMissingIntegrationRequirements();
      if (missing.length > 0) {
        new Notice(
          `Setup imported, but some integrations are missing credentials: ${missing.join(", ")}`,
          10000,
        );
      }

      this.settings.lastSyncTimestamp = null;
      this.settings.syncedDocIds = [];
      await this.savePluginSettings();

      await this.runSync();
      await this.runLinking();
      new Notice("Team one-step setup complete.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      new Notice(`Team setup failed: ${message}`);
    }
  }

  private getMissingIntegrationRequirements(): string[] {
    const missing: string[] = [];

    if (this.settings.syncLinear && !this.settings.linearApiKey) {
      missing.push("Linear API key");
    }
    if (this.settings.syncFigma) {
      if (!this.settings.figmaAccessToken) {
        missing.push("Figma access token");
      }
      if (!this.settings.figmaTeamId) {
        missing.push("Figma team ID");
      }
    }
    if (this.settings.syncSlack && !this.settings.slackBotToken) {
      missing.push("Slack bot token");
    }
    if (this.settings.syncGithub) {
      if (!this.settings.githubToken) {
        missing.push("GitHub token");
      }
      if (!this.settings.githubOrg) {
        missing.push("GitHub org");
      }
    }
    if (this.settings.syncGoogleDrive) {
      if (!this.settings.googleDriveFolderId) {
        missing.push("Google Drive folder ID");
      }
      const hasAccessToken = Boolean(this.settings.googleDriveAccessToken);
      const hasRefreshFlow = Boolean(
        this.settings.googleDriveClientId &&
          this.settings.googleDriveClientSecret &&
          this.settings.googleDriveRefreshToken,
      );
      if (!hasAccessToken && !hasRefreshFlow) {
        missing.push("Google Drive OAuth credentials");
      }
    }
    if (this.settings.syncHubspot && !this.settings.hubspotAccessToken) {
      missing.push("HubSpot access token");
    }
    if (this.settings.aiEnabled && !this.settings.claudeApiKey) {
      missing.push("Claude API key");
    }

    return missing;
  }

  private async importTeamConfigFromFile(file: TFile): Promise<void> {
    const raw = await this.app.vault.read(file);
    const parsed = JSON.parse(raw) as Partial<TeamConfigTemplate>;
    const apply = <K extends keyof TeamConfigTemplate>(key: K): void => {
      if (parsed[key] !== undefined) {
        (this.settings[key as keyof GranolaAdoraSettings] as unknown) =
          parsed[key];
      }
    };

    apply("syncIntervalMinutes");
    apply("syncOnStartup");
    apply("baseFolderPath");
    apply("meetingsFolderName");
    apply("ideasFolderName");
    apply("customersFolderName");
    apply("peopleFolderName");
    apply("prioritiesFolderName");
    apply("includeTranscript");
    apply("autoTagEnabled");
    apply("knownCustomers");
    apply("knownTopics");
    apply("syncSharedDocs");
    apply("syncWorkspaceLists");
    apply("syncLinear");
    apply("linearFolderName");
    apply("syncFigma");
    apply("designsFolderName");
    apply("aiEnabled");
    apply("aiModel");
    apply("aiModelFast");
    apply("aiModelDeep");
    apply("digestsFolderName");
    apply("syncSlack");
    apply("slackFolderName");
    apply("syncGithub");
    apply("githubOrg");
    apply("githubFolderName");
    apply("syncGoogleDrive");
    apply("googleDriveFolderId");
    apply("googleDriveFolderName");
    apply("syncHubspot");
    apply("hubspotFolderName");
    apply("healthScoreEnabled");
    apply("decisionsFolderName");
    apply("releaseNotesFolderName");

    this.updateTaggerConfig();
    this.restartAutoSync();
    await this.savePluginSettings();
  }

  async checkAuth(): Promise<boolean> {
    return this.api.ensureAuthenticated();
  }

  updateTaggerConfig(): void {
    this.tagger.updateKnownCustomers(this.settings.knownCustomers);
    this.tagger.updateKnownTopics(this.settings.knownTopics);
  }

  startAutoSync(): void {
    this.stopAutoSync();
    if (this.settings.syncIntervalMinutes > 0) {
      const ms = this.settings.syncIntervalMinutes * 60 * 1000;
      this.autoSyncIntervalId = window.setInterval(() => this.runSync(), ms);
      this.registerInterval(this.autoSyncIntervalId);
    }
  }

  restartAutoSync(): void {
    this.startAutoSync();
  }

  stopAutoSync(): void {
    if (this.autoSyncIntervalId !== null) {
      window.clearInterval(this.autoSyncIntervalId);
      this.autoSyncIntervalId = null;
    }
  }

  async activateAskAdoraView(): Promise<void> {
    const { workspace } = this.app;
    let leaf: WorkspaceLeaf | null = null;
    const leaves = workspace.getLeavesOfType(ASK_ADORA_VIEW_TYPE);

    if (leaves.length > 0) {
      leaf = leaves[0];
    } else {
      leaf = workspace.getRightLeaf(false);
      if (leaf) {
        await leaf.setViewState({
          type: ASK_ADORA_VIEW_TYPE,
          active: true,
        });
      }
    }

    if (leaf) {
      workspace.revealLeaf(leaf);
    }
  }

  private async getAskAdoraView(): Promise<AskAdoraView | null> {
    await this.activateAskAdoraView();
    const leaves = this.app.workspace.getLeavesOfType(ASK_ADORA_VIEW_TYPE);
    if (leaves.length === 0) {
      new Notice("Could not find Ask Adora panel.");
      return null;
    }

    const view = leaves[0].view;
    if (view instanceof AskAdoraView) {
      return view;
    }

    new Notice("Ask Adora view is not ready yet. Try again.");
    return null;
  }

  async sendAskAdoraMessage(): Promise<void> {
    const view = await this.getAskAdoraView();
    if (!view) return;
    await view.sendFromCommand();
  }

  async clearAskAdoraConversation(): Promise<void> {
    const view = await this.getAskAdoraView();
    if (!view) return;
    view.clearConversationFromCommand();
  }

  async saveAskAdoraConversation(): Promise<void> {
    const view = await this.getAskAdoraView();
    if (!view) return;
    await view.saveConversationFromCommand();
  }

  async startAskAdoraConversation(): Promise<void> {
    const view = await this.getAskAdoraView();
    if (!view) return;
    view.startNewConversationFromCommand();
    view.focusInput();
  }

  async askAdora(messages: AskAdoraMessage[], context: string): Promise<string> {
    const ai = this.requireAI();
    if (!ai) {
      throw new Error(
        "AI features are disabled. Enable AI and add Claude API key in settings.",
      );
    }
    return ai.askAnything(messages, context);
  }

  async buildAskAdoraContext(options: {
    includeActiveNote: boolean;
    includeRecentMeetings: boolean;
    includeRecentDigests: boolean;
    recentMeetingCount: number;
  }): Promise<string> {
    const blocks: string[] = [];

    if (options.includeActiveNote) {
      const activeFile = this.app.workspace.getActiveFile();
      if (activeFile) {
        const content = await this.app.vault.read(activeFile);
        blocks.push(
          `## Active Note: ${activeFile.path}\n${content.substring(0, 4000)}`,
        );
      }
    }

    if (options.includeRecentMeetings) {
      const meetingFiles = this.getMeetingFiles().sort((a, b) => {
        const aDate =
          this.app.metadataCache.getFileCache(a)?.frontmatter?.date ?? "";
        const bDate =
          this.app.metadataCache.getFileCache(b)?.frontmatter?.date ?? "";
        return bDate.localeCompare(aDate);
      });
      const summaries: string[] = [];
      for (const file of meetingFiles.slice(0, options.recentMeetingCount)) {
        summaries.push(await this.getMeetingSummary(file));
      }
      if (summaries.length > 0) {
        blocks.push(`## Recent Meetings\n${summaries.join("\n\n---\n\n")}`);
      }
    }

    if (options.includeRecentDigests) {
      const digestFolderPrefix = `${this.settings.baseFolderPath}/${this.settings.digestsFolderName}/`;
      const digestFiles = this.app.vault
        .getMarkdownFiles()
        .filter((f) => f.path.startsWith(digestFolderPrefix))
        .sort((a, b) => b.stat.mtime - a.stat.mtime)
        .slice(0, 8);

      const digestSummaries: string[] = [];
      for (const file of digestFiles) {
        const content = await this.app.vault.read(file);
        const stripped = content.replace(/^---[\s\S]*?---/, "").trim();
        digestSummaries.push(
          `### ${file.basename}\n${stripped.substring(0, 1200)}`,
        );
      }
      if (digestSummaries.length > 0) {
        blocks.push(`## Recent Digests\n${digestSummaries.join("\n\n")}`);
      }
    }

    return blocks.join("\n\n");
  }

  private async runSync(): Promise<void> {
    if (this.isSyncing) {
      new Notice("Granola: Sync already in progress.");
      return;
    }

    const authenticated = await this.api.ensureAuthenticated();
    if (!authenticated) {
      new Notice(
        "Granola: Could not find local session. Make sure Granola desktop app is open and you're signed in.",
      );
      return;
    }

    this.isSyncing = true;

    try {
      new Notice("Granola: Starting sync...");
      const result = await this.syncEngine.sync();
      new Notice(formatSyncResult(result));

      if (result.errors.length > 0) {
        console.error("Granola sync errors:", result.errors);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      new Notice(`Granola sync failed: ${message}`);
      console.error("Granola sync failed:", err);
    } finally {
      this.isSyncing = false;
    }
  }

  private createIdeaFromMeeting(): void {
    const modal = new IdeaFromMeetingModal(
      this.app,
      async (title: string, meetingPaths: string[]) => {
        const { baseFolderPath, ideasFolderName } = this.settings;
        const fileName = title.replace(/[<>:"/\\|?*]/g, "-").substring(0, 80);
        const filePath = normalizePath(
          `${baseFolderPath}/${ideasFolderName}/${fileName}.md`,
        );
        const content = renderIdeaNote(title, meetingPaths);

        try {
          await this.app.vault.create(filePath, content);
          const file = this.app.vault.getAbstractFileByPath(filePath);
          if (file instanceof TFile) {
            const leaf = this.app.workspace.getLeaf(false);
            await leaf.openFile(file);
          }
          new Notice(`Created idea: ${title}`);
        } catch (err) {
          const message = err instanceof Error ? err.message : "Unknown error";
          new Notice(`Failed to create idea: ${message}`);
        }
      },
    );
    modal.open();
  }

  private requireAI(): AICortex | null {
    if (!this.settings.aiEnabled || !this.settings.claudeApiKey) {
      new Notice(
        "AI features are disabled. Enable them in plugin settings and add your Claude API key.",
      );
      return null;
    }
    return new AICortex(
      this.settings.claudeApiKey,
      this.settings.aiModelFast,
      this.settings.aiModelDeep,
    );
  }

  private getMeetingFiles(): TFile[] {
    const { baseFolderPath, meetingsFolderName } = this.settings;
    const prefix = `${baseFolderPath}/${meetingsFolderName}/`;
    return this.app.vault
      .getMarkdownFiles()
      .filter((f) => f.path.startsWith(prefix));
  }

  private async getMeetingSummary(file: TFile): Promise<string> {
    const content = await this.app.vault.read(file);
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
    const title = fm?.title ?? file.basename;
    const date = fm?.date ?? "";
    const owner = fm?.owner ?? "";
    return `## ${title}\nDate: ${date} | Owner: ${owner}\n\n${content.replace(/^---[\s\S]*?---/, "").trim()}`;
  }

  private async writeAINote(
    filePath: string,
    title: string,
    aiType: string,
    aiOutput: string,
  ): Promise<void> {
    const now = new Date().toISOString();
    const content = [
      "---",
      `title: "${title.replace(/"/g, '\\"')}"`,
      `type: "${aiType}"`,
      `generated_at: "${now}"`,
      `tags:`,
      `  - "ai"`,
      `  - "${aiType}"`,
      "---",
      "",
      `# ${title}`,
      "",
      `> Generated on ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}`,
      "",
      aiOutput,
      "",
    ].join("\n");

    const existing = this.app.vault.getAbstractFileByPath(filePath);
    if (existing instanceof TFile) {
      await this.app.vault.modify(existing, content);
    } else {
      await this.app.vault.create(filePath, content);
    }

    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (file instanceof TFile) {
      const leaf = this.app.workspace.getLeaf(false);
      await leaf.openFile(file);
    }
  }

  private generatePrepBrief(): void {
    const ai = this.requireAI();
    if (!ai) return;

    const modal = new CustomerNameModal(
      this.app,
      async (customerName: string) => {
        if (!customerName.trim()) return;
        new Notice(`Generating prep brief for ${customerName}...`);

        try {
          const meetingFiles = this.getMeetingFiles();
          const matching: TFile[] = [];
          for (const file of meetingFiles) {
            const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
            const customers: string[] = fm?.customers ?? [];
            if (
              customers.some((c: string) =>
                c.toLowerCase().includes(customerName.toLowerCase()),
              )
            ) {
              matching.push(file);
            }
          }

          if (matching.length === 0) {
            new Notice(`No meetings found for customer "${customerName}".`);
            return;
          }

          matching.sort((a, b) => {
            const aDate =
              this.app.metadataCache.getFileCache(a)?.frontmatter?.date ?? "";
            const bDate =
              this.app.metadataCache.getFileCache(b)?.frontmatter?.date ?? "";
            return bDate.localeCompare(aDate);
          });

          const summaries: string[] = [];
          for (const file of matching.slice(0, 10)) {
            summaries.push(await this.getMeetingSummary(file));
          }

          const result = await ai.generateCustomerPrepBrief(
            customerName,
            summaries,
          );
          const safeName = customerName
            .replace(/[<>:"/\\|?*]/g, "-")
            .substring(0, 60);
          const filePath = normalizePath(
            `${this.settings.baseFolderPath}/${this.settings.customersFolderName}/${safeName} — Prep Brief.md`,
          );

          await this.writeAINote(
            filePath,
            `${customerName} — Prep Brief`,
            "prep-brief",
            result,
          );
          new Notice(`Prep brief generated for ${customerName}`);
        } catch (err) {
          const message = err instanceof Error ? err.message : "Unknown error";
          new Notice(`Failed to generate prep brief: ${message}`);
        }
      },
    );
    modal.open();
  }

  private async generateWeeklyDigest(): Promise<void> {
    const ai = this.requireAI();
    if (!ai) return;

    new Notice("Generating weekly digest...");
    try {
      const meetingFiles = this.getMeetingFiles();
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);

      const recentFiles = meetingFiles.filter((f) => {
        const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
        return fm?.date && new Date(fm.date) >= weekAgo;
      });

      if (recentFiles.length === 0) {
        new Notice("No meetings found in the last 7 days.");
        return;
      }

      const summaries: string[] = [];
      for (const file of recentFiles.slice(0, 15)) {
        summaries.push(await this.getMeetingSummary(file));
      }

      let issuesSummary = "";
      if (this.settings.syncLinear) {
        const issueFiles = this.app.vault
          .getMarkdownFiles()
          .filter((f) =>
            f.path.startsWith(
              `${this.settings.baseFolderPath}/${this.settings.linearFolderName}/Issues/`,
            ),
          );
        const issueTitles = issueFiles.map((f) => f.basename).slice(0, 30);
        if (issueTitles.length > 0) {
          issuesSummary = issueTitles.join("\n");
        }
      }

      const slackMessages: string[] = [];
      if (this.settings.syncSlack) {
        const slackFolder = `${this.settings.baseFolderPath}/${this.settings.slackFolderName}`;
        const slackFiles = this.app.vault
          .getMarkdownFiles()
          .filter((f) => f.path.startsWith(slackFolder + "/"));

        for (const file of slackFiles.slice(0, 20)) {
          const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
          const timestamp = fm?.timestamp;
          if (timestamp && new Date(timestamp) >= weekAgo) {
            const content = await this.app.vault.read(file);
            const stripped = content.replace(/^---[\s\S]*?---/, "").trim();
            const excerpt = stripped.substring(0, 500);
            const channel = fm?.channel ?? "unknown";
            slackMessages.push(`[${channel}] ${excerpt}`);
          }
        }
      }

      const pullRequests: string[] = [];
      if (this.settings.syncGithub) {
        const githubFolder = `${this.settings.baseFolderPath}/${this.settings.githubFolderName}`;
        const githubFiles = this.app.vault
          .getMarkdownFiles()
          .filter((f) => f.path.startsWith(githubFolder + "/"));

        for (const file of githubFiles.slice(0, 20)) {
          const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
          const createdAt = fm?.created_at;
          const updatedAt = fm?.updated_at;
          const relevantDate = updatedAt || createdAt;
          if (relevantDate && new Date(relevantDate) >= weekAgo) {
            const repo = fm?.repo ?? "unknown";
            const prNumber = fm?.pr_number ?? "?";
            const state = fm?.state ?? "unknown";
            const title = file.basename;
            pullRequests.push(`[${repo}] #${prNumber} ${title} (${state})`);
          }
        }
      }

      const decisions: string[] = [];
      const decisionsFolder = `${this.settings.baseFolderPath}/${this.settings.decisionsFolderName}`;
      const decisionFiles = this.app.vault
        .getMarkdownFiles()
        .filter((f) => f.path.startsWith(decisionsFolder + "/"));

      for (const file of decisionFiles.slice(0, 15)) {
        const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
        const date = fm?.date;
        if (date && new Date(date) >= weekAgo) {
          const summary = fm?.summary ?? file.basename;
          const stakeholders = fm?.stakeholders ?? [];
          const stakeholderStr = Array.isArray(stakeholders)
            ? stakeholders.join(", ")
            : "";
          decisions.push(
            `${summary}${stakeholderStr ? ` (${stakeholderStr})` : ""}`,
          );
        }
      }

      const healthScores: string[] = [];
      if (this.settings.healthScoreEnabled) {
        const customersFolderPath = `${this.settings.baseFolderPath}/${this.settings.customersFolderName}`;
        const customerFiles = this.app.vault
          .getMarkdownFiles()
          .filter((f) => f.path.startsWith(customersFolderPath + "/"));

        for (const file of customerFiles.slice(0, 20)) {
          const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
          const healthScore = fm?.health_score;
          const healthTier = fm?.health_tier;
          if (healthScore !== undefined) {
            const company = fm?.company ?? file.basename;
            healthScores.push(
              `${company}: ${healthScore}/100 (${healthTier || "unknown"})`,
            );
          }
        }
      }

      const result = await ai.generateWeeklyDigest(
        summaries,
        issuesSummary,
        slackMessages,
        pullRequests,
        decisions,
        healthScores,
      );
      const dateStr = new Date().toISOString().split("T")[0];
      const filePath = normalizePath(
        `${this.settings.baseFolderPath}/${this.settings.digestsFolderName}/Week of ${dateStr}.md`,
      );

      await this.writeAINote(
        filePath,
        `Weekly Digest — ${dateStr}`,
        "weekly-digest",
        result,
      );
      new Notice("Weekly digest generated!");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      new Notice(`Failed to generate digest: ${message}`);
    }
  }

  private async generateThemeAnalysis(): Promise<void> {
    const ai = this.requireAI();
    if (!ai) return;

    new Notice("Analyzing meeting themes...");
    try {
      const meetingFiles = this.getMeetingFiles();
      const monthAgo = new Date();
      monthAgo.setDate(monthAgo.getDate() - 30);

      const recentFiles = meetingFiles.filter((f) => {
        const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
        return fm?.date && new Date(fm.date) >= monthAgo;
      });

      if (recentFiles.length === 0) {
        new Notice("No meetings found in the last 30 days.");
        return;
      }

      const summaries: string[] = [];
      for (const file of recentFiles.slice(0, 20)) {
        summaries.push(await this.getMeetingSummary(file));
      }

      const result = await ai.detectThemes(summaries);
      const dateStr = new Date().toISOString().split("T")[0];
      const filePath = normalizePath(
        `${this.settings.baseFolderPath}/${this.settings.digestsFolderName}/Theme Analysis — ${dateStr}.md`,
      );

      await this.writeAINote(
        filePath,
        `Theme Analysis — ${dateStr}`,
        "theme-analysis",
        result,
      );
      new Notice("Theme analysis generated!");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      new Notice(`Failed to generate theme analysis: ${message}`);
    }
  }

  private frontmatterArray(value: unknown): string[] {
    if (Array.isArray(value)) {
      return value.filter((item): item is string => typeof item === "string");
    }
    if (typeof value === "string" && value.trim().length > 0) {
      return [value];
    }
    return [];
  }

  private async generateTopCustomerAsks(): Promise<void> {
    const ai = this.requireAI();
    if (!ai) return;

    new Notice("Analyzing top customer asks...");
    try {
      const meetingFiles = this.getMeetingFiles();
      const monthAgo = new Date();
      monthAgo.setDate(monthAgo.getDate() - 30);

      const relevantFiles = meetingFiles.filter((file) => {
        const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
        const customers = this.frontmatterArray(fm?.customers);
        if (customers.length === 0) {
          return false;
        }
        const dateValue = typeof fm?.date === "string" ? fm.date : null;
        if (!dateValue) {
          return false;
        }
        return new Date(dateValue) >= monthAgo;
      });

      if (relevantFiles.length === 0) {
        new Notice("No customer-tagged meetings found in the last 30 days.");
        return;
      }

      const summaries: string[] = [];
      for (const file of relevantFiles.slice(0, 40)) {
        summaries.push(await this.getMeetingSummary(file));
      }

      const result = await ai.extractTopCustomerAsks(summaries);
      const dateStr = new Date().toISOString().split("T")[0];
      const filePath = normalizePath(
        `${this.settings.baseFolderPath}/${this.settings.digestsFolderName}/Customer Asks — ${dateStr}.md`,
      );

      await this.writeAINote(
        filePath,
        `Top Customer Asks — ${dateStr}`,
        "customer-asks",
        result,
      );
      new Notice("Top customer asks report generated!");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      new Notice(`Failed to generate customer asks report: ${message}`);
    }
  }

  private async extractIdeasFromNote(): Promise<void> {
    const ai = this.requireAI();
    if (!ai) return;

    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile) {
      new Notice("No active file. Open a meeting note first.");
      return;
    }

    new Notice("Extracting ideas...");
    try {
      const content = await this.app.vault.read(activeFile);
      const result = await ai.extractIdeas(content);
      const title = `Ideas from ${activeFile.basename}`;
      const safeName = title.replace(/[<>:"/\\|?*]/g, "-").substring(0, 80);
      const filePath = normalizePath(
        `${this.settings.baseFolderPath}/${this.settings.ideasFolderName}/${safeName}.md`,
      );

      await this.writeAINote(filePath, title, "extracted-ideas", result);
      new Notice("Ideas extracted!");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      new Notice(`Failed to extract ideas: ${message}`);
    }
  }

  private async runLinking(): Promise<void> {
    new Notice("Linking notes across integrations...");
    try {
      const linker = new Linker(this.app, () => this.settings);
      const result = await linker.runFullLinkingPass();
      new Notice(formatLinkResult(result));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      new Notice(`Linking failed: ${message}`);
    }
  }

  private getIssueFiles(): TFile[] {
    const { baseFolderPath, linearFolderName } = this.settings;
    const prefix = `${baseFolderPath}/${linearFolderName}/Issues/`;
    return this.app.vault
      .getMarkdownFiles()
      .filter((f) => f.path.startsWith(prefix));
  }

  private async recalculateHealthScores(): Promise<void> {
    const settings = this.settings;
    const customersFolderPath = `${settings.baseFolderPath}/${settings.customersFolderName}`;
    const customerFiles = this.app.vault
      .getMarkdownFiles()
      .filter((f) => f.path.startsWith(customersFolderPath + "/"));

    if (customerFiles.length === 0) {
      new Notice("No customer files found.");
      return;
    }

    new Notice(
      `Recalculating health scores for ${customerFiles.length} customers...`,
    );

    const meetingFiles = this.getMeetingFiles();
    const issueFiles = this.getIssueFiles();
    const hubspotDeals = settings.syncHubspot
      ? this.app.vault
          .getMarkdownFiles()
          .filter((f) =>
            f.path.startsWith(
              `${settings.baseFolderPath}/${settings.hubspotFolderName}/Deals/`,
            ),
          )
      : [];
    const hubspotTickets = settings.syncHubspot
      ? this.app.vault
          .getMarkdownFiles()
          .filter((f) =>
            f.path.startsWith(
              `${settings.baseFolderPath}/${settings.hubspotFolderName}/Tickets/`,
            ),
          )
      : [];
    const hubspotCompanies = settings.syncHubspot
      ? this.app.vault
          .getMarkdownFiles()
          .filter((f) =>
            f.path.startsWith(
              `${settings.baseFolderPath}/${settings.hubspotFolderName}/Companies/`,
            ),
          )
      : [];

    let ai: AICortex | null = null;
    if (settings.aiEnabled && settings.claudeApiKey) {
      ai = new AICortex(
        settings.claudeApiKey,
        settings.aiModelFast,
        settings.aiModelDeep,
      );
    }

    for (const customerFile of customerFiles) {
      try {
        const fm =
          this.app.metadataCache.getFileCache(customerFile)?.frontmatter;
        const customerName = fm?.company ?? customerFile.basename;

        let sentimentScore: number | undefined;
        if (ai) {
          const customerLower = customerName.toLowerCase();
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
            try {
              sentimentScore = await ai.analyzeSentiment(excerpts);
            } catch {}
          }
        }

        const health = calculateHealthScore(
          customerName,
          meetingFiles,
          issueFiles,
          sentimentScore,
          {
            openDeals: hubspotDeals.filter((f) =>
              f.basename.toLowerCase().includes(customerName.toLowerCase()),
            ).length,
            ticketCount: hubspotTickets.filter((f) =>
              f.basename.toLowerCase().includes(customerName.toLowerCase()),
            ).length,
            lifecycleStage: hubspotCompanies.find((f) =>
              f.basename.toLowerCase().includes(customerName.toLowerCase()),
            )
              ? "customer"
              : undefined,
          },
        );

        let content = await this.app.vault.read(customerFile);
        content = updateHealthScoreInContent(content, health);
        await this.app.vault.modify(customerFile, content);
      } catch (err) {
        console.error(`Health score failed for ${customerFile.basename}:`, err);
      }
    }

    new Notice("Health scores updated!");
  }

  private async generateReleaseNotes(): Promise<void> {
    if (!this.settings.syncLinear || !this.settings.linearApiKey) {
      new Notice(
        "Linear sync is disabled. Enable it in plugin settings and add your Linear API key.",
      );
      return;
    }

    const ai = this.requireAI();
    if (!ai) return;

    new Notice("Generating release notes...");
    try {
      const linearClient = new LinearClient(this.settings.linearApiKey);
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const sinceDate = thirtyDaysAgo.toISOString().split("T")[0];

      const completedIssues =
        await linearClient.fetchCompletedIssues(sinceDate);

      if (completedIssues.length === 0) {
        new Notice("No completed issues found in the last 30 days.");
        return;
      }

      const issuesByProject: Record<string, typeof completedIssues> = {};
      for (const issue of completedIssues) {
        const projectName = issue.project?.name || "Uncategorized";
        if (!issuesByProject[projectName]) {
          issuesByProject[projectName] = [];
        }
        issuesByProject[projectName].push(issue);
      }

      const releaseNotesContent =
        await ai.generateReleaseNotes(issuesByProject);

      const dateStr = new Date().toISOString().split("T")[0];
      const filePath = normalizePath(
        `${this.settings.baseFolderPath}/${this.settings.releaseNotesFolderName}/release-notes--${dateStr}.md`,
      );

      const projectNames = Object.keys(issuesByProject);
      const now = new Date().toISOString();
      const frontmatter = [
        "---",
        `type: "release-notes"`,
        `generated_at: "${now}"`,
        `issue_count: ${completedIssues.length}`,
        `projects: [${projectNames.map((p) => `"${p.replace(/"/g, '\\"')}"`).join(", ")}]`,
        `tags:`,
        `  - "release"`,
        "---",
        "",
      ].join("\n");

      const content = [
        frontmatter,
        `# Release Notes — ${dateStr}`,
        "",
        `> Generated on ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}`,
        "",
        releaseNotesContent,
        "",
      ].join("\n");

      const existing = this.app.vault.getAbstractFileByPath(filePath);
      if (existing instanceof TFile) {
        await this.app.vault.modify(existing, content);
      } else {
        await this.app.vault.create(filePath, content);
      }

      const file = this.app.vault.getAbstractFileByPath(filePath);
      if (file instanceof TFile) {
        const leaf = this.app.workspace.getLeaf(false);
        await leaf.openFile(file);
      }

      new Notice(`Release notes generated: ${filePath}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      new Notice(`Failed to generate release notes: ${message}`);
    }
  }

  private async saveDecisionNotes(decisions: Decision[]): Promise<void> {
    const { baseFolderPath, decisionsFolderName } = this.settings;
    const folder = `${baseFolderPath}/${decisionsFolderName}`;
    let saved = 0;

    for (const dec of decisions) {
      if (!dec.decision.trim()) continue;

      const slug = dec.decision
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .substring(0, 60);
      const fileName = `${dec.date}--${slug}.md`;
      const filePath = normalizePath(`${folder}/${fileName}`);

      const sourceRef = dec.sourceMeetingId ?? "Manually logged";
      const stakeholdersYaml =
        dec.participants.length > 0
          ? `[${dec.participants.map((p) => `"${p}"`).join(", ")}]`
          : "[]";
      const stakeholdersBullets =
        dec.participants.length > 0
          ? dec.participants.map((p) => `- ${p}`).join("\n")
          : "_No stakeholders listed._";

      const content = [
        "---",
        `type: "decision"`,
        `summary: "${dec.decision.replace(/"/g, '\\"')}"`,
        `source_meeting: "${sourceRef}"`,
        `stakeholders: ${stakeholdersYaml}`,
        `date: "${dec.date}"`,
        `tags: ["decision"]`,
        "---",
        "",
        `# ${dec.decision}`,
        "",
        "## Context",
        dec.context || "_No context provided._",
        "",
        "## Stakeholders",
        stakeholdersBullets,
        "",
        "## Source",
        sourceRef,
        "",
      ].join("\n");

      try {
        const existing = this.app.vault.getAbstractFileByPath(filePath);
        if (existing instanceof TFile) {
          await this.app.vault.modify(existing, content);
        } else {
          await this.app.vault.create(filePath, content);
        }
        saved++;
      } catch (err) {
        console.error(`Failed to save decision: ${fileName}`, err);
      }
    }

    if (saved > 0) {
      new Notice(
        `Saved ${saved} decision${saved > 1 ? "s" : ""} to ${folder}/`,
      );
    } else {
      new Notice("No decisions were saved.");
    }
  }
}

class CustomerNameModal extends Modal {
  private onSubmit: (name: string) => void;

  constructor(app: App, onSubmit: (name: string) => void) {
    super(app);
    this.onSubmit = onSubmit;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl("h2", { text: "Customer Prep Brief" });

    let inputValue = "";

    new Setting(contentEl)
      .setName("Customer name")
      .setDesc(
        "Enter the customer or company name to generate a prep brief for.",
      )
      .addText((text) =>
        text
          .setPlaceholder("e.g., Verizon, Servco...")
          .onChange((value) => {
            inputValue = value;
          })
          .then((t) => {
            t.inputEl.style.width = "100%";
            t.inputEl.addEventListener("keydown", (e: KeyboardEvent) => {
              if (e.key === "Enter") {
                this.onSubmit(inputValue.trim());
                this.close();
              }
            });
          }),
      );

    new Setting(contentEl).addButton((btn) =>
      btn
        .setButtonText("Generate Brief")
        .setCta()
        .onClick(() => {
          if (inputValue.trim()) {
            this.onSubmit(inputValue.trim());
            this.close();
          }
        }),
    );
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

class DecisionConfirmModal extends Modal {
  private decisions: Decision[];
  private onConfirm: (confirmed: Decision[]) => void;

  constructor(
    app: App,
    decisions: Decision[],
    onConfirm: (confirmed: Decision[]) => void,
  ) {
    super(app);
    this.decisions = decisions;
    this.onConfirm = onConfirm;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl("h2", { text: "Confirm Decisions" });
    contentEl.addClass("decision-confirm-modal");

    const entries: { checked: boolean; decision: Decision }[] = [];

    for (let i = 0; i < this.decisions.length; i++) {
      const dec = this.decisions[i];
      const card = contentEl.createDiv({ cls: "decision-card" });
      card.style.border = "1px solid var(--background-modifier-border)";
      card.style.borderRadius = "8px";
      card.style.padding = "12px";
      card.style.marginBottom = "12px";

      const entry = {
        checked: true,
        decision: {
          ...dec,
          participants: [...dec.participants],
          tags: [...dec.tags],
        },
      };
      entries.push(entry);

      new Setting(card).setName(`Decision ${i + 1}`).addToggle((toggle) =>
        toggle
          .setValue(true)
          .setTooltip("Include this decision")
          .onChange((value) => {
            entry.checked = value;
          }),
      );

      new Setting(card).setName("Summary").addTextArea((text) =>
        text
          .setValue(dec.decision)
          .setPlaceholder("One sentence describing the decision")
          .onChange((value) => {
            entry.decision.decision = value;
            entry.decision.title = value;
          })
          .then((t) => {
            t.inputEl.style.width = "100%";
            t.inputEl.rows = 2;
          }),
      );

      new Setting(card).setName("Context").addTextArea((text) =>
        text
          .setValue(dec.context)
          .setPlaceholder("Why this decision was made")
          .onChange((value) => {
            entry.decision.context = value;
            entry.decision.rationale = value;
          })
          .then((t) => {
            t.inputEl.style.width = "100%";
            t.inputEl.rows = 3;
          }),
      );

      new Setting(card).setName("Stakeholders").addText((text) =>
        text
          .setValue(dec.participants.join(", "))
          .setPlaceholder("Comma-separated names")
          .onChange((value) => {
            entry.decision.participants = value
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
          })
          .then((t) => {
            t.inputEl.style.width = "100%";
          }),
      );
    }

    const buttonRow = new Setting(contentEl);
    buttonRow.addButton((btn) =>
      btn
        .setButtonText("Save Selected")
        .setCta()
        .onClick(() => {
          const confirmed = entries
            .filter((e) => e.checked)
            .map((e) => e.decision);
          this.onConfirm(confirmed);
          this.close();
        }),
    );
    buttonRow.addButton((btn) =>
      btn.setButtonText("Cancel").onClick(() => {
        this.close();
      }),
    );
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
