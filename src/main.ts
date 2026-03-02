import {
  App,
  Modal,
  Notice,
  Plugin,
  Setting,
  normalizePath,
  TFile,
} from "obsidian";
import { GranolaAdoraSettings, DEFAULT_SETTINGS, Decision } from "./types";
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

    this.addCommand({
      id: "granola-sync",
      name: "Sync meetings from Granola",
      callback: () => this.runSync(),
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

    if (this.settings.syncOnStartup) {
      setTimeout(() => this.runSync(), 3000);
    }

    this.startAutoSync();
  }

  onunload(): void {
    this.stopAutoSync();
  }

  async loadPluginSettings(): Promise<void> {
    const loaded = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, loaded);
  }

  async savePluginSettings(): Promise<void> {
    await this.saveData(this.settings);
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
