import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type GranolaAdoraPlugin from "./main";
import { FigmaClient } from "./figma";
import { LinearClient } from "./linear";
import { Linker, formatLinkResult } from "./linker";

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
      .setName("Model")
      .setDesc("Which Claude model to use for AI features.")
      .addDropdown((dd) =>
        dd
          .addOption("claude-sonnet-4-20250514", "Claude Sonnet 4")
          .addOption("claude-haiku-4-20250414", "Claude Haiku 4")
          .setValue(this.plugin.settings.aiModel)
          .onChange(async (value) => {
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
  }
}
