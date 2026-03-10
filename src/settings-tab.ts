import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type GranolaAdoraPlugin from "./main";
import { FigmaClient } from "./figma";
import { GoogleDriveClient } from "./gdrive";
import { GitHubClient } from "./github";
import { HubSpotClient } from "./hubspot";
import { LinearClient } from "./linear";
import { SlackClient } from "./slack";
import { Linker, formatLinkResult } from "./linker";
import { SlackNotifier, NotionPublisher } from "./notifier";

export class GranolaAdoraSettingTab extends PluginSettingTab {
  plugin: GranolaAdoraPlugin;

  constructor(app: App, plugin: GranolaAdoraPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Granola for Adora" });

    const statusEl = containerEl.createEl("div", { cls: "setting-item" });
    const statusText = statusEl.createEl("p");
    this.plugin.checkAuth().then((connected) => {
      if (connected) {
        statusText.setText("Granola: Connected");
        statusText.style.color = "var(--text-success)";
      } else {
        statusText.setText(
          "Granola: Not found — open Granola desktop app and sign in",
        );
        statusText.style.color = "var(--text-error)";
      }
    });

    containerEl.createEl("h3", { text: "Sync" });

    new Setting(containerEl)
      .setName("Sync interval (minutes)")
      .setDesc(
        "How often to automatically pull new notes. Set to 0 to disable auto-sync.",
      )
      .addText((text) =>
        text
          .setPlaceholder("30")
          .setValue(String(this.plugin.settings.syncIntervalMinutes))
          .onChange(async (value) => {
            const num = parseInt(value, 10);
            if (!isNaN(num) && num >= 0) {
              this.plugin.settings.syncIntervalMinutes = num;
              await this.plugin.savePluginSettings();
              this.plugin.restartAutoSync();
            }
          }),
      );

    new Setting(containerEl)
      .setName("Sync on startup")
      .setDesc("Automatically sync when Obsidian opens.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.syncOnStartup)
          .onChange(async (value) => {
            this.plugin.settings.syncOnStartup = value;
            await this.plugin.savePluginSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Include transcript")
      .setDesc(
        "Fetch and include the full meeting transcript in each note. Increases sync time.",
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.includeTranscript)
          .onChange(async (value) => {
            this.plugin.settings.includeTranscript = value;
            await this.plugin.savePluginSettings();
          }),
      );

    containerEl.createEl("h3", { text: "Sources" });

    new Setting(containerEl)
      .setName("Sync shared notes")
      .setDesc("Import notes that teammates have shared with you directly.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.syncSharedDocs)
          .onChange(async (value) => {
            this.plugin.settings.syncSharedDocs = value;
            await this.plugin.savePluginSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Sync workspace folders")
      .setDesc(
        "Import notes from Granola workspace folders (e.g. User Interviews, P+E, General).",
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.syncWorkspaceLists)
          .onChange(async (value) => {
            this.plugin.settings.syncWorkspaceLists = value;
            await this.plugin.savePluginSettings();
          }),
      );

    containerEl.createEl("h3", { text: "Linear" });

    new Setting(containerEl)
      .setName("Sync from Linear")
      .setDesc("Import issues and projects from Linear into your vault.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.syncLinear)
          .onChange(async (value) => {
            this.plugin.settings.syncLinear = value;
            await this.plugin.savePluginSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Linear API key")
      .setDesc("Personal API key from Linear Settings → API.")
      .addText((text) =>
        text
          .setPlaceholder("lin_api_...")
          .setValue(this.plugin.settings.linearApiKey)
          .then((t) => {
            t.inputEl.type = "password";
          })
          .onChange(async (value) => {
            this.plugin.settings.linearApiKey = value.trim();
            await this.plugin.savePluginSettings();
          }),
      );

    const linearStatusSetting = new Setting(containerEl)
      .setName("Test connection")
      .setDesc("Verify your Linear API key works.");

    linearStatusSetting.addButton((btn) =>
      btn.setButtonText("Test").onClick(async () => {
        const apiKey = this.plugin.settings.linearApiKey;
        if (!apiKey) {
          new Notice("Linear: Enter an API key first.");
          return;
        }
        btn.setButtonText("Testing...");
        btn.setDisabled(true);
        try {
          const client = new LinearClient(apiKey);
          const ok = await client.testConnection();
          if (ok) {
            new Notice("Linear: Connected successfully.");
            linearStatusSetting.setDesc("Connected ✓");
          } else {
            new Notice("Linear: Invalid API key.");
            linearStatusSetting.setDesc("Connection failed — check your key.");
          }
        } catch {
          new Notice("Linear: Connection failed.");
          linearStatusSetting.setDesc("Connection failed — check your key.");
        } finally {
          btn.setButtonText("Test");
          btn.setDisabled(false);
        }
      }),
    );

    new Setting(containerEl).setName("Linear folder").addText((text) =>
      text
        .setValue(this.plugin.settings.linearFolderName)
        .onChange(async (value) => {
          this.plugin.settings.linearFolderName = value.trim() || "Linear";
          await this.plugin.savePluginSettings();
        }),
    );

    new Setting(containerEl)
      .setName("Auto-create Linear tickets from customer asks")
      .setDesc(
        "After each Granola sync, detect explicit customer asks in recent notes/transcripts and open up to 3 deduped Linear issues.",
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.autoCreateLinearFromCustomerAsks)
          .onChange(async (value) => {
            this.plugin.settings.autoCreateLinearFromCustomerAsks = value;
            await this.plugin.savePluginSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Customer ask Linear automation dry run")
      .setDesc(
        "Preview which tickets would be created and write audit logs without creating Linear issues.",
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.autoCreateLinearFromCustomerAsksDryRun)
          .onChange(async (value) => {
            this.plugin.settings.autoCreateLinearFromCustomerAsksDryRun = value;
            await this.plugin.savePluginSettings();
          }),
      );

    containerEl.createEl("h3", { text: "Figma" });

    new Setting(containerEl)
      .setName("Sync from Figma")
      .setDesc("Import design files from Figma as linked notes.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.syncFigma)
          .onChange(async (value) => {
            this.plugin.settings.syncFigma = value;
            await this.plugin.savePluginSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Figma access token")
      .setDesc(
        "Personal access token from Figma Settings → Account → Personal access tokens.",
      )
      .addText((text) =>
        text
          .setPlaceholder("figd_...")
          .setValue(this.plugin.settings.figmaAccessToken)
          .then((t) => {
            t.inputEl.type = "password";
            t.inputEl.style.width = "100%";
          })
          .onChange(async (value) => {
            this.plugin.settings.figmaAccessToken = value.trim();
            await this.plugin.savePluginSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Figma team ID")
      .setDesc("Your Figma team ID (found in the team URL).")
      .addText((text) =>
        text
          .setPlaceholder("123456789")
          .setValue(this.plugin.settings.figmaTeamId)
          .onChange(async (value) => {
            this.plugin.settings.figmaTeamId = value.trim();
            await this.plugin.savePluginSettings();
          }),
      );

    const figmaStatusSetting = new Setting(containerEl)
      .setName("Test Figma connection")
      .setDesc("Verify your access token is valid.");

    figmaStatusSetting.addButton((btn) =>
      btn.setButtonText("Test").onClick(async () => {
        const token = this.plugin.settings.figmaAccessToken;
        if (!token) {
          new Notice("Figma: Enter an access token first.");
          return;
        }
        btn.setButtonText("Testing...");
        btn.setDisabled(true);
        try {
          const client = new FigmaClient(token);
          const ok = await client.testConnection();
          if (ok) {
            new Notice("Figma: Connection successful!");
            figmaStatusSetting.setDesc("Connected ✓");
          } else {
            new Notice("Figma: Connection failed. Check your access token.");
            figmaStatusSetting.setDesc("Connection failed — check your token.");
          }
        } catch {
          new Notice("Figma: Connection failed.");
          figmaStatusSetting.setDesc("Connection failed — check your token.");
        } finally {
          btn.setButtonText("Test");
          btn.setDisabled(false);
        }
      }),
    );

    new Setting(containerEl).setName("Designs folder").addText((text) =>
      text
        .setValue(this.plugin.settings.designsFolderName)
        .onChange(async (value) => {
          this.plugin.settings.designsFolderName = value.trim() || "Designs";
          await this.plugin.savePluginSettings();
        }),
    );

    containerEl.createEl("h3", { text: "Slack" });

    new Setting(containerEl)
      .setName("Sync from Slack")
      .setDesc("Import messages and threads from Slack channels.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.syncSlack)
          .onChange(async (value) => {
            this.plugin.settings.syncSlack = value;
            await this.plugin.savePluginSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Slack bot token")
      .setDesc("Bot user OAuth token from your Slack app.")
      .addText((text) =>
        text
          .setPlaceholder("xoxb-...")
          .setValue(this.plugin.settings.slackBotToken)
          .then((t) => {
            t.inputEl.type = "password";
            t.inputEl.style.width = "100%";
          })
          .onChange(async (value) => {
            this.plugin.settings.slackBotToken = value.trim();
            await this.plugin.savePluginSettings();
          }),
      );

    const slackStatusSetting = new Setting(containerEl)
      .setName("Test Slack connection")
      .setDesc("Verify your Slack bot token works.");

    slackStatusSetting.addButton((btn) =>
      btn.setButtonText("Test").onClick(async () => {
        const token = this.plugin.settings.slackBotToken;
        if (!token) {
          new Notice("Slack: Enter a bot token first.");
          return;
        }
        btn.setButtonText("Testing...");
        btn.setDisabled(true);
        try {
          const client = new SlackClient(token);
          const ok = await client.testConnection();
          if (ok) {
            new Notice("Slack: Connection successful!");
            slackStatusSetting.setDesc("Connected ✓");
          } else {
            new Notice("Slack: Connection failed. Check your bot token.");
            slackStatusSetting.setDesc("Connection failed — check your token.");
          }
        } catch {
          new Notice("Slack: Connection failed.");
          slackStatusSetting.setDesc("Connection failed — check your token.");
        } finally {
          btn.setButtonText("Test");
          btn.setDisabled(false);
        }
      }),
    );

    new Setting(containerEl).setName("Slack folder").addText((text) =>
      text
        .setValue(this.plugin.settings.slackFolderName)
        .onChange(async (value) => {
          this.plugin.settings.slackFolderName = value.trim() || "Slack";
          await this.plugin.savePluginSettings();
        }),
    );

    containerEl.createEl("h3", { text: "GitHub" });

    new Setting(containerEl)
      .setName("Sync from GitHub")
      .setDesc("Import pull requests and activity from GitHub.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.syncGithub)
          .onChange(async (value) => {
            this.plugin.settings.syncGithub = value;
            await this.plugin.savePluginSettings();
          }),
      );

    new Setting(containerEl)
      .setName("GitHub token")
      .setDesc(
        "Personal access token from GitHub Settings → Developer settings.",
      )
      .addText((text) =>
        text
          .setPlaceholder("ghp_...")
          .setValue(this.plugin.settings.githubToken)
          .then((t) => {
            t.inputEl.type = "password";
            t.inputEl.style.width = "100%";
          })
          .onChange(async (value) => {
            this.plugin.settings.githubToken = value.trim();
            await this.plugin.savePluginSettings();
          }),
      );

    new Setting(containerEl)
      .setName("GitHub organization")
      .setDesc("Your GitHub org or user to sync repos from.")
      .addText((text) =>
        text
          .setPlaceholder("my-org")
          .setValue(this.plugin.settings.githubOrg)
          .onChange(async (value) => {
            this.plugin.settings.githubOrg = value.trim();
            await this.plugin.savePluginSettings();
          }),
      );

    const githubStatusSetting = new Setting(containerEl)
      .setName("Test GitHub connection")
      .setDesc("Verify your GitHub token works.");

    githubStatusSetting.addButton((btn) =>
      btn.setButtonText("Test").onClick(async () => {
        const token = this.plugin.settings.githubToken;
        if (!token) {
          new Notice("GitHub: Enter a token first.");
          return;
        }
        btn.setButtonText("Testing...");
        btn.setDisabled(true);
        try {
          const client = new GitHubClient(token);
          const ok = await client.testConnection();
          if (ok) {
            new Notice("GitHub: Connection successful!");
            githubStatusSetting.setDesc("Connected ✓");
          } else {
            new Notice("GitHub: Connection failed. Check your token.");
            githubStatusSetting.setDesc(
              "Connection failed — check your token.",
            );
          }
        } catch {
          new Notice("GitHub: Connection failed.");
          githubStatusSetting.setDesc("Connection failed — check your token.");
        } finally {
          btn.setButtonText("Test");
          btn.setDisabled(false);
        }
      }),
    );

    new Setting(containerEl).setName("GitHub folder").addText((text) =>
      text
        .setValue(this.plugin.settings.githubFolderName)
        .onChange(async (value) => {
          this.plugin.settings.githubFolderName = value.trim() || "GitHub";
          await this.plugin.savePluginSettings();
        }),
    );

    containerEl.createEl("h3", { text: "HubSpot" });

    new Setting(containerEl)
      .setName("Sync from HubSpot")
      .setDesc("Import contacts, companies, deals, meetings, and tickets.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.syncHubspot)
          .onChange(async (value) => {
            this.plugin.settings.syncHubspot = value;
            await this.plugin.savePluginSettings();
          }),
      );

    new Setting(containerEl)
      .setName("HubSpot access token")
      .setDesc(
        "Private App token from HubSpot Settings → Integrations → Private Apps.",
      )
      .addText((text) =>
        text
          .setPlaceholder("pat-na1-...")
          .setValue(this.plugin.settings.hubspotAccessToken)
          .then((t) => {
            t.inputEl.type = "password";
            t.inputEl.style.width = "100%";
          })
          .onChange(async (value) => {
            this.plugin.settings.hubspotAccessToken = value.trim();
            await this.plugin.savePluginSettings();
          }),
      );

    const hubspotStatusSetting = new Setting(containerEl)
      .setName("Test HubSpot connection")
      .setDesc("Verify your HubSpot token works.");

    hubspotStatusSetting.addButton((btn) =>
      btn.setButtonText("Test").onClick(async () => {
        const token = this.plugin.settings.hubspotAccessToken;
        if (!token) {
          new Notice("HubSpot: Enter an access token first.");
          return;
        }
        btn.setButtonText("Testing...");
        btn.setDisabled(true);
        try {
          const client = new HubSpotClient(token);
          const ok = await client.testConnection();
          if (ok) {
            new Notice("HubSpot: Connection successful!");
            hubspotStatusSetting.setDesc("Connected ✓");
          } else {
            new Notice("HubSpot: Connection failed. Check your token/scopes.");
            hubspotStatusSetting.setDesc(
              "Connection failed — check token and Private App scopes.",
            );
          }
        } catch {
          new Notice("HubSpot: Connection failed.");
          hubspotStatusSetting.setDesc(
            "Connection failed — check token and Private App scopes.",
          );
        } finally {
          btn.setButtonText("Test");
          btn.setDisabled(false);
        }
      }),
    );

    new Setting(containerEl).setName("HubSpot folder").addText((text) =>
      text
        .setValue(this.plugin.settings.hubspotFolderName)
        .onChange(async (value) => {
          this.plugin.settings.hubspotFolderName = value.trim() || "HubSpot";
          await this.plugin.savePluginSettings();
        }),
    );

    containerEl.createEl("h3", { text: "Google Drive" });

    new Setting(containerEl)
      .setName("Sync from Google Drive")
      .setDesc("Import Google Docs from one Drive folder into your vault.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.syncGoogleDrive)
          .onChange(async (value) => {
            this.plugin.settings.syncGoogleDrive = value;
            await this.plugin.savePluginSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Google Drive folder ID")
      .setDesc("Folder ID to sync (from the Google Drive URL).")
      .addText((text) =>
        text
          .setPlaceholder("1AbCdEf...")
          .setValue(this.plugin.settings.googleDriveFolderId)
          .onChange(async (value) => {
            this.plugin.settings.googleDriveFolderId = value.trim();
            await this.plugin.savePluginSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Google access token")
      .setDesc("OAuth access token for Google Drive API.")
      .addText((text) =>
        text
          .setPlaceholder("ya29....")
          .setValue(this.plugin.settings.googleDriveAccessToken)
          .then((t) => {
            t.inputEl.type = "password";
            t.inputEl.style.width = "100%";
          })
          .onChange(async (value) => {
            this.plugin.settings.googleDriveAccessToken = value.trim();
            await this.plugin.savePluginSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Google client ID")
      .setDesc("OAuth client ID (required for automatic token refresh).")
      .addText((text) =>
        text
          .setPlaceholder("...apps.googleusercontent.com")
          .setValue(this.plugin.settings.googleDriveClientId)
          .onChange(async (value) => {
            this.plugin.settings.googleDriveClientId = value.trim();
            await this.plugin.savePluginSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Google client secret")
      .setDesc("OAuth client secret (required for automatic token refresh).")
      .addText((text) =>
        text
          .setPlaceholder("GOCSPX-...")
          .setValue(this.plugin.settings.googleDriveClientSecret)
          .then((t) => {
            t.inputEl.type = "password";
            t.inputEl.style.width = "100%";
          })
          .onChange(async (value) => {
            this.plugin.settings.googleDriveClientSecret = value.trim();
            await this.plugin.savePluginSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Google refresh token")
      .setDesc("OAuth refresh token to refresh expired access tokens.")
      .addText((text) =>
        text
          .setPlaceholder("1//...")
          .setValue(this.plugin.settings.googleDriveRefreshToken)
          .then((t) => {
            t.inputEl.type = "password";
            t.inputEl.style.width = "100%";
          })
          .onChange(async (value) => {
            this.plugin.settings.googleDriveRefreshToken = value.trim();
            await this.plugin.savePluginSettings();
          }),
      );

    const driveStatusSetting = new Setting(containerEl)
      .setName("Test Google Drive connection")
      .setDesc("Verify your Google Drive credentials and folder access.");

    driveStatusSetting.addButton((btn) =>
      btn.setButtonText("Test").onClick(async () => {
        const folderId = this.plugin.settings.googleDriveFolderId;
        if (!folderId) {
          new Notice("Google Drive: Enter a folder ID first.");
          return;
        }
        btn.setButtonText("Testing...");
        btn.setDisabled(true);
        try {
          const client = new GoogleDriveClient(
            this.plugin.settings.googleDriveClientId,
            this.plugin.settings.googleDriveClientSecret,
            this.plugin.settings.googleDriveRefreshToken,
            this.plugin.settings.googleDriveAccessToken,
          );
          const ok = await client.testConnection(folderId);
          if (ok) {
            if (
              client.getAccessToken() &&
              client.getAccessToken() !==
                this.plugin.settings.googleDriveAccessToken
            ) {
              this.plugin.settings.googleDriveAccessToken =
                client.getAccessToken();
              await this.plugin.savePluginSettings();
            }
            new Notice("Google Drive: Connection successful!");
            driveStatusSetting.setDesc("Connected ✓");
          } else {
            new Notice(
              "Google Drive: Connection failed. Check credentials and folder permissions.",
            );
            driveStatusSetting.setDesc(
              "Connection failed — check credentials and folder access.",
            );
          }
        } catch {
          new Notice("Google Drive: Connection failed.");
          driveStatusSetting.setDesc(
            "Connection failed — check credentials and folder access.",
          );
        } finally {
          btn.setButtonText("Test");
          btn.setDisabled(false);
        }
      }),
    );

    new Setting(containerEl).setName("Google Drive folder").addText((text) =>
      text
        .setValue(this.plugin.settings.googleDriveFolderName)
        .onChange(async (value) => {
          this.plugin.settings.googleDriveFolderName =
            value.trim() || "Google Drive";
          await this.plugin.savePluginSettings();
        }),
    );

    containerEl.createEl("h3", { text: "AI (Claude)" });

    new Setting(containerEl)
      .setName("Enable AI features")
      .setDesc(
        "Use Claude to generate prep briefs, weekly digests, theme analysis, and idea extraction.",
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.aiEnabled)
          .onChange(async (value) => {
            this.plugin.settings.aiEnabled = value;
            await this.plugin.savePluginSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Claude API key")
      .setDesc("API key from console.anthropic.com.")
      .addText((text) =>
        text
          .setPlaceholder("sk-ant-...")
          .setValue(this.plugin.settings.claudeApiKey)
          .then((t) => {
            t.inputEl.type = "password";
            t.inputEl.style.width = "100%";
          })
          .onChange(async (value) => {
            this.plugin.settings.claudeApiKey = value.trim();
            await this.plugin.savePluginSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Fast model (routine tasks)")
      .setDesc("Used for tagging, extraction, and quick classifications.")
      .addDropdown((dd) =>
        dd
          .addOption("claude-haiku-4-20250414", "Claude Haiku 4")
          .addOption("claude-sonnet-4-20250514", "Claude Sonnet 4")
          .setValue(this.plugin.settings.aiModelFast)
          .onChange(async (value) => {
            this.plugin.settings.aiModelFast = value;
            await this.plugin.savePluginSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Deep model (complex analysis)")
      .setDesc(
        "Used for briefs, digests, theme detection, and idea extraction.",
      )
      .addDropdown((dd) =>
        dd
          .addOption("claude-sonnet-4-20250514", "Claude Sonnet 4")
          .addOption("claude-haiku-4-20250414", "Claude Haiku 4")
          .setValue(this.plugin.settings.aiModelDeep)
          .onChange(async (value) => {
            this.plugin.settings.aiModelDeep = value;
            this.plugin.settings.aiModel = value;
            await this.plugin.savePluginSettings();
          }),
      );

    new Setting(containerEl).setName("Digests folder").addText((text) =>
      text
        .setValue(this.plugin.settings.digestsFolderName)
        .onChange(async (value) => {
          this.plugin.settings.digestsFolderName = value.trim() || "Digests";
          await this.plugin.savePluginSettings();
        }),
    );

    new Setting(containerEl)
      .setName("Ask Adora chat panel")
      .setDesc("Open the AI chat panel for free-form questions.")
      .addButton((btn) =>
        btn
          .setButtonText("Open panel")
          .setCta()
          .onClick(async () => {
            await this.plugin.activateAskAdoraView();
          }),
      );

    containerEl.createEl("h3", { text: "Outbound Notifications" });

    new Setting(containerEl)
      .setName("Enable outbound")
      .setDesc(
        "Push digests, health alerts, and customer asks to Slack and Notion.",
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.outboundEnabled)
          .onChange(async (value) => {
            this.plugin.settings.outboundEnabled = value;
            await this.plugin.savePluginSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Designated brain")
      .setDesc(
        "Only one vault should send outbound notifications to avoid duplicates. Toggle this on for exactly one team member.",
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.isDesignatedBrain)
          .onChange(async (value) => {
            this.plugin.settings.isDesignatedBrain = value;
            await this.plugin.savePluginSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Post to Slack")
      .setDesc("Send digests and health alerts to Slack channels.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.notifySlackEnabled)
          .onChange(async (value) => {
            this.plugin.settings.notifySlackEnabled = value;
            await this.plugin.savePluginSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Slack digest channel ID")
      .setDesc(
        "Channel ID to post weekly digests (e.g. C01234ABCDE). Find via right-click channel → View channel details.",
      )
      .addText((text) =>
        text
          .setPlaceholder("C01234ABCDE")
          .setValue(this.plugin.settings.slackDigestChannelId)
          .onChange(async (value) => {
            this.plugin.settings.slackDigestChannelId = value.trim();
            await this.plugin.savePluginSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Slack health alert channel ID")
      .setDesc("Channel ID to post customer health alerts.")
      .addText((text) =>
        text
          .setPlaceholder("C01234ABCDE")
          .setValue(this.plugin.settings.slackHealthAlertChannelId)
          .onChange(async (value) => {
            this.plugin.settings.slackHealthAlertChannelId = value.trim();
            await this.plugin.savePluginSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Health alert threshold")
      .setDesc(
        "Alert when a customer health score drops below this value (0–100).",
      )
      .addText((text) =>
        text
          .setPlaceholder("40")
          .setValue(String(this.plugin.settings.healthAlertThreshold))
          .onChange(async (value) => {
            const num = parseInt(value, 10);
            if (!isNaN(num) && num >= 0 && num <= 100) {
              this.plugin.settings.healthAlertThreshold = num;
              await this.plugin.savePluginSettings();
            }
          }),
      );

    containerEl.createEl("h4", { text: "Renewal rubric formula (advanced)" });

    new Setting(containerEl)
      .setName("Component weight: Customer Satisfaction (%)")
      .setDesc("Relative weight in final renewal score.")
      .addText((text) =>
        text
          .setPlaceholder("33.3")
          .setValue(
            String(this.plugin.settings.healthWeightCustomerSatisfaction),
          )
          .onChange(async (value) => {
            const num = parseFloat(value);
            if (!isNaN(num) && num >= 0 && num <= 100) {
              this.plugin.settings.healthWeightCustomerSatisfaction = num;
              await this.plugin.savePluginSettings();
            }
          }),
      );

    new Setting(containerEl)
      .setName("Component weight: Performance Goals (%)")
      .setDesc("Relative weight in final renewal score.")
      .addText((text) =>
        text
          .setPlaceholder("33.3")
          .setValue(String(this.plugin.settings.healthWeightPerformanceGoals))
          .onChange(async (value) => {
            const num = parseFloat(value);
            if (!isNaN(num) && num >= 0 && num <= 100) {
              this.plugin.settings.healthWeightPerformanceGoals = num;
              await this.plugin.savePluginSettings();
            }
          }),
      );

    new Setting(containerEl)
      .setName("Component weight: Product Engagement (%)")
      .setDesc("Relative weight in final renewal score.")
      .addText((text) =>
        text
          .setPlaceholder("33.4")
          .setValue(String(this.plugin.settings.healthWeightProductEngagement))
          .onChange(async (value) => {
            const num = parseFloat(value);
            if (!isNaN(num) && num >= 0 && num <= 100) {
              this.plugin.settings.healthWeightProductEngagement = num;
              await this.plugin.savePluginSettings();
            }
          }),
      );

    new Setting(containerEl)
      .setName("Customer Satisfaction mix: Sentiment weight")
      .setDesc("Used with Issues weight to compute Customer Satisfaction.")
      .addText((text) =>
        text
          .setPlaceholder("0.7")
          .setValue(
            String(
              this.plugin.settings.healthCustomerSatisfactionSentimentWeight,
            ),
          )
          .onChange(async (value) => {
            const num = parseFloat(value);
            if (!isNaN(num) && num >= 0 && num <= 1) {
              this.plugin.settings.healthCustomerSatisfactionSentimentWeight =
                num;
              await this.plugin.savePluginSettings();
            }
          }),
      );

    new Setting(containerEl)
      .setName("Customer Satisfaction mix: Issues weight")
      .setDesc("Used with Sentiment weight to compute Customer Satisfaction.")
      .addText((text) =>
        text
          .setPlaceholder("0.3")
          .setValue(
            String(this.plugin.settings.healthCustomerSatisfactionIssuesWeight),
          )
          .onChange(async (value) => {
            const num = parseFloat(value);
            if (!isNaN(num) && num >= 0 && num <= 1) {
              this.plugin.settings.healthCustomerSatisfactionIssuesWeight = num;
              await this.plugin.savePluginSettings();
            }
          }),
      );

    new Setting(containerEl)
      .setName("Performance Goals mix: Issues weight")
      .setDesc("Used with CRM weight to compute Performance Goals.")
      .addText((text) =>
        text
          .setPlaceholder("0.5")
          .setValue(
            String(this.plugin.settings.healthPerformanceGoalsIssuesWeight),
          )
          .onChange(async (value) => {
            const num = parseFloat(value);
            if (!isNaN(num) && num >= 0 && num <= 1) {
              this.plugin.settings.healthPerformanceGoalsIssuesWeight = num;
              await this.plugin.savePluginSettings();
            }
          }),
      );

    new Setting(containerEl)
      .setName("Performance Goals mix: CRM weight")
      .setDesc("Used with Issues weight to compute Performance Goals.")
      .addText((text) =>
        text
          .setPlaceholder("0.5")
          .setValue(
            String(this.plugin.settings.healthPerformanceGoalsCrmWeight),
          )
          .onChange(async (value) => {
            const num = parseFloat(value);
            if (!isNaN(num) && num >= 0 && num <= 1) {
              this.plugin.settings.healthPerformanceGoalsCrmWeight = num;
              await this.plugin.savePluginSettings();
            }
          }),
      );

    new Setting(containerEl)
      .setName("Product Engagement mix: Meeting weight")
      .setDesc("Used with Sentiment weight to compute Product Engagement.")
      .addText((text) =>
        text
          .setPlaceholder("0.7")
          .setValue(
            String(this.plugin.settings.healthProductEngagementMeetingWeight),
          )
          .onChange(async (value) => {
            const num = parseFloat(value);
            if (!isNaN(num) && num >= 0 && num <= 1) {
              this.plugin.settings.healthProductEngagementMeetingWeight = num;
              await this.plugin.savePluginSettings();
            }
          }),
      );

    new Setting(containerEl)
      .setName("Product Engagement mix: Sentiment weight")
      .setDesc("Used with Meeting weight to compute Product Engagement.")
      .addText((text) =>
        text
          .setPlaceholder("0.3")
          .setValue(
            String(this.plugin.settings.healthProductEngagementSentimentWeight),
          )
          .onChange(async (value) => {
            const num = parseFloat(value);
            if (!isNaN(num) && num >= 0 && num <= 1) {
              this.plugin.settings.healthProductEngagementSentimentWeight = num;
              await this.plugin.savePluginSettings();
            }
          }),
      );

    new Setting(containerEl)
      .setName("Tier threshold: healthy minimum")
      .setDesc("Score at or above this is marked healthy.")
      .addText((text) =>
        text
          .setPlaceholder("67")
          .setValue(String(this.plugin.settings.healthTierHealthyMin))
          .onChange(async (value) => {
            const num = parseInt(value, 10);
            if (!isNaN(num) && num >= 0 && num <= 100) {
              this.plugin.settings.healthTierHealthyMin = num;
              await this.plugin.savePluginSettings();
            }
          }),
      );

    new Setting(containerEl)
      .setName("Tier threshold: at-risk minimum")
      .setDesc("Score at or above this (but below healthy) is marked at-risk.")
      .addText((text) =>
        text
          .setPlaceholder("34")
          .setValue(String(this.plugin.settings.healthTierAtRiskMin))
          .onChange(async (value) => {
            const num = parseInt(value, 10);
            if (!isNaN(num) && num >= 0 && num <= 100) {
              this.plugin.settings.healthTierAtRiskMin = num;
              await this.plugin.savePluginSettings();
            }
          }),
      );

    const slackOutboundTest = new Setting(containerEl)
      .setName("Test Slack outbound")
      .setDesc("Verify your Slack bot can post messages.");

    slackOutboundTest.addButton((btn) =>
      btn.setButtonText("Test").onClick(async () => {
        const token = this.plugin.settings.slackBotToken;
        if (!token) {
          new Notice(
            "Configure a Slack bot token first (in the Slack section above).",
          );
          return;
        }
        btn.setButtonText("Testing...");
        btn.setDisabled(true);
        try {
          const notifier = new SlackNotifier(
            token,
            () => this.plugin.settings,
            () => this.plugin.savePluginSettings(),
          );
          const ok = await notifier.testConnection();
          if (ok) {
            new Notice("Slack outbound: Connected — bot can post messages.");
            slackOutboundTest.setDesc("Connected ✓");
          } else {
            new Notice(
              "Slack outbound: Connection failed. Check bot token and chat:write scope.",
            );
            slackOutboundTest.setDesc(
              "Connection failed — check token and scopes.",
            );
          }
        } catch {
          new Notice("Slack outbound: Connection failed.");
          slackOutboundTest.setDesc("Connection failed.");
        } finally {
          btn.setButtonText("Test");
          btn.setDisabled(false);
        }
      }),
    );

    new Setting(containerEl)
      .setName("Publish to Notion")
      .setDesc("Push digests and customer asks to Notion pages/databases.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.notifyNotionEnabled)
          .onChange(async (value) => {
            this.plugin.settings.notifyNotionEnabled = value;
            await this.plugin.savePluginSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Notion integration token")
      .setDesc("Internal integration token from notion.so/my-integrations.")
      .addText((text) =>
        text
          .setPlaceholder("ntn_...")
          .setValue(this.plugin.settings.notionApiToken)
          .then((t) => {
            t.inputEl.type = "password";
            t.inputEl.style.width = "100%";
          })
          .onChange(async (value) => {
            this.plugin.settings.notionApiToken = value.trim();
            await this.plugin.savePluginSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Notion digest parent page ID")
      .setDesc("Page ID where weekly digests are created as sub-pages.")
      .addText((text) =>
        text
          .setPlaceholder("xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx")
          .setValue(this.plugin.settings.notionDigestParentId)
          .onChange(async (value) => {
            this.plugin.settings.notionDigestParentId = value.trim();
            await this.plugin.savePluginSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Notion customer asks database ID")
      .setDesc("Database ID where customer ask reports are added as pages.")
      .addText((text) =>
        text
          .setPlaceholder("xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx")
          .setValue(this.plugin.settings.notionCustomerAsksDbId)
          .onChange(async (value) => {
            this.plugin.settings.notionCustomerAsksDbId = value.trim();
            await this.plugin.savePluginSettings();
          }),
      );

    const notionSettings = this.plugin.settings as typeof this.plugin.settings & {
      notionIncidentsDbId: string;
    };

    new Setting(containerEl)
      .setName("Notion incidents database ID")
      .setDesc("Database ID where structured incident records are added as pages.")
      .addText((text) =>
        text
          .setPlaceholder("xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx")
          .setValue(notionSettings.notionIncidentsDbId)
          .onChange(async (value) => {
            notionSettings.notionIncidentsDbId = value.trim();
            await this.plugin.savePluginSettings();
          }),
      );

    const notionOutboundTest = new Setting(containerEl)
      .setName("Test Notion outbound")
      .setDesc("Verify your Notion integration token works.");

    notionOutboundTest.addButton((btn) =>
      btn.setButtonText("Test").onClick(async () => {
        const token = this.plugin.settings.notionApiToken;
        if (!token) {
          new Notice("Configure a Notion integration token first.");
          return;
        }
        btn.setButtonText("Testing...");
        btn.setDisabled(true);
        try {
          const publisher = new NotionPublisher(
            token,
            () => this.plugin.settings,
            () => this.plugin.savePluginSettings(),
          );
          const ok = await publisher.testConnection();
          if (ok) {
            new Notice("Notion outbound: Connected.");
            notionOutboundTest.setDesc("Connected ✓");
          } else {
            new Notice("Notion outbound: Connection failed. Check token.");
            notionOutboundTest.setDesc("Connection failed — check token.");
          }
        } catch {
          new Notice("Notion outbound: Connection failed.");
          notionOutboundTest.setDesc("Connection failed.");
        } finally {
          btn.setButtonText("Test");
          btn.setDisabled(false);
        }
      }),
    );

    containerEl.createEl("h3", { text: "Folders" });

    new Setting(containerEl)
      .setName("Base folder")
      .setDesc("Root folder for all Granola content in your vault.")
      .addText((text) =>
        text
          .setPlaceholder("Adora")
          .setValue(this.plugin.settings.baseFolderPath)
          .onChange(async (value) => {
            this.plugin.settings.baseFolderPath = value.trim() || "Adora";
            await this.plugin.savePluginSettings();
          }),
      );

    new Setting(containerEl).setName("Meetings folder").addText((text) =>
      text
        .setValue(this.plugin.settings.meetingsFolderName)
        .onChange(async (value) => {
          this.plugin.settings.meetingsFolderName = value.trim() || "Meetings";
          await this.plugin.savePluginSettings();
        }),
    );

    new Setting(containerEl).setName("Ideas folder").addText((text) =>
      text
        .setValue(this.plugin.settings.ideasFolderName)
        .onChange(async (value) => {
          this.plugin.settings.ideasFolderName = value.trim() || "Ideas";
          await this.plugin.savePluginSettings();
        }),
    );

    new Setting(containerEl).setName("Customers folder").addText((text) =>
      text
        .setValue(this.plugin.settings.customersFolderName)
        .onChange(async (value) => {
          this.plugin.settings.customersFolderName =
            value.trim() || "Customers";
          await this.plugin.savePluginSettings();
        }),
    );

    new Setting(containerEl).setName("People folder").addText((text) =>
      text
        .setValue(this.plugin.settings.peopleFolderName)
        .onChange(async (value) => {
          this.plugin.settings.peopleFolderName = value.trim() || "People";
          await this.plugin.savePluginSettings();
        }),
    );

    containerEl.createEl("h3", { text: "Auto-tagging" });

    new Setting(containerEl)
      .setName("Enable auto-tagging")
      .setDesc(
        "Automatically extract customers, topics, and action items from meeting content.",
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.autoTagEnabled)
          .onChange(async (value) => {
            this.plugin.settings.autoTagEnabled = value;
            await this.plugin.savePluginSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Known customers")
      .setDesc(
        "Comma-separated list of customer/company names to detect in meeting notes.",
      )
      .addTextArea((text) =>
        text
          .setPlaceholder("Acme Corp, BigCo, Startup XYZ")
          .setValue(this.plugin.settings.knownCustomers.join(", "))
          .then((t) => {
            t.inputEl.style.width = "100%";
            t.inputEl.style.height = "60px";
          })
          .onChange(async (value) => {
            this.plugin.settings.knownCustomers = value
              .split(",")
              .map((s) => s.trim())
              .filter((s) => s.length > 0);
            await this.plugin.savePluginSettings();
            this.plugin.updateTaggerConfig();
          }),
      );

    new Setting(containerEl)
      .setName("Known topics")
      .setDesc("Comma-separated list of product areas or themes to detect.")
      .addTextArea((text) =>
        text
          .setPlaceholder("onboarding, billing, API, mobile app")
          .setValue(this.plugin.settings.knownTopics.join(", "))
          .then((t) => {
            t.inputEl.style.width = "100%";
            t.inputEl.style.height = "60px";
          })
          .onChange(async (value) => {
            this.plugin.settings.knownTopics = value
              .split(",")
              .map((s) => s.trim())
              .filter((s) => s.length > 0);
            await this.plugin.savePluginSettings();
            this.plugin.updateTaggerConfig();
          }),
      );

    containerEl.createEl("h3", { text: "Advanced" });

    new Setting(containerEl)
      .setName("Re-link all notes")
      .setDesc(
        "Scan meetings, issues, and designs and add cross-references based on keyword overlap.",
      )
      .addButton((btn) =>
        btn.setButtonText("Re-link").onClick(async () => {
          btn.setButtonText("Linking...");
          btn.setDisabled(true);
          try {
            const linker = new Linker(this.app, () => this.plugin.settings);
            const result = await linker.runFullLinkingPass();
            new Notice(formatLinkResult(result));
          } catch {
            new Notice("Linking failed.");
          } finally {
            btn.setButtonText("Re-link");
            btn.setDisabled(false);
          }
        }),
      );

    new Setting(containerEl)
      .setName("Reset sync state")
      .setDesc("Clear sync history and re-import all notes on next sync.")
      .addButton((btn) =>
        btn
          .setButtonText("Reset")
          .setWarning()
          .onClick(async () => {
            this.plugin.settings.lastSyncTimestamp = null;
            this.plugin.settings.syncedDocIds = [];
            await this.plugin.savePluginSettings();
            new Notice("Sync state reset. Next sync will import all notes.");
          }),
      );

    new Setting(containerEl)
      .setName("Export team config template")
      .setDesc(
        "Create or update a sanitized team config JSON in your vault that others can reuse.",
      )
      .addButton((btn) =>
        btn.setButtonText("Export").onClick(async () => {
          btn.setButtonText("Exporting...");
          btn.setDisabled(true);
          try {
            await this.plugin.exportTeamConfigTemplate();
          } finally {
            btn.setButtonText("Export");
            btn.setDisabled(false);
          }
        }),
      );

    new Setting(containerEl)
      .setName("Import team config from active file")
      .setDesc(
        "Open a team-config JSON file in the editor, then import to prefill non-sensitive settings.",
      )
      .addButton((btn) =>
        btn.setButtonText("Import").onClick(async () => {
          btn.setButtonText("Importing...");
          btn.setDisabled(true);
          try {
            await this.plugin.importTeamConfigFromActiveFile();
          } finally {
            btn.setButtonText("Import");
            btn.setDisabled(false);
          }
        }),
      );

    new Setting(containerEl)
      .setName("One-step team setup")
      .setDesc(
        "Imports team config, resets sync state, runs full sync, then re-links notes.",
      )
      .addButton((btn) =>
        btn
          .setButtonText("Run setup")
          .setCta()
          .onClick(async () => {
            btn.setButtonText("Running...");
            btn.setDisabled(true);
            try {
              await this.plugin.runTeamOneStepSetup();
            } finally {
              btn.setButtonText("Run setup");
              btn.setDisabled(false);
            }
          }),
      );
  }
}
