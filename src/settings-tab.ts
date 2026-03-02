import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type GranolaAdoraPlugin from "./main";

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
