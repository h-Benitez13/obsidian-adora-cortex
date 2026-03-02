import { ItemView, Notice, TFile, WorkspaceLeaf } from "obsidian";
import type GranolaAdoraPlugin from "./main";
import { AskAdoraMessage } from "./types";

export const ASK_ADORA_VIEW_TYPE = "granola-ask-adora-view";

export class AskAdoraView extends ItemView {
  private plugin: GranolaAdoraPlugin;
  private messages: AskAdoraMessage[] = [];
  private isSending = false;
  private currentConversationPath: string | null = null;

  private includeActiveNote = true;
  private includeRecentMeetings = true;
  private includeRecentDigests = true;
  private recentMeetingCount = 10;

  constructor(leaf: WorkspaceLeaf, plugin: GranolaAdoraPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return ASK_ADORA_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Ask Adora";
  }

  getIcon(): string {
    return "message-square";
  }

  async onOpen(): Promise<void> {
    this.render();
  }

  async onClose(): Promise<void> {
    this.contentEl.empty();
  }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl("h2", { text: "Ask Adora" });
    contentEl.createEl("p", {
      text: "Ask anything about meetings, customers, product asks, and synced context.",
    });
    const sessionEl = contentEl.createEl("p", {
      text: this.currentConversationPath
        ? `Conversation: ${this.currentConversationPath}`
        : "Conversation: unsaved",
    });

    const controls = contentEl.createDiv({ cls: "ask-adora-controls" });

    const activeWrap = controls.createEl("label");
    const activeCb = activeWrap.createEl("input", { type: "checkbox" });
    activeCb.checked = this.includeActiveNote;
    activeCb.addEventListener("change", () => {
      this.includeActiveNote = activeCb.checked;
    });
    activeWrap.appendText(" Include active note");

    const meetingsWrap = controls.createEl("label");
    const meetingsCb = meetingsWrap.createEl("input", { type: "checkbox" });
    meetingsCb.checked = this.includeRecentMeetings;
    meetingsCb.addEventListener("change", () => {
      this.includeRecentMeetings = meetingsCb.checked;
    });
    meetingsWrap.appendText(" Include recent meetings");

    const digestsWrap = controls.createEl("label");
    const digestsCb = digestsWrap.createEl("input", { type: "checkbox" });
    digestsCb.checked = this.includeRecentDigests;
    digestsCb.addEventListener("change", () => {
      this.includeRecentDigests = digestsCb.checked;
    });
    digestsWrap.appendText(" Include recent digests");

    const countRow = controls.createDiv();
    countRow.createEl("span", { text: "Recent meetings to include: " });
    const countInput = countRow.createEl("input", { type: "number" });
    countInput.value = String(this.recentMeetingCount);
    countInput.min = "1";
    countInput.max = "30";
    countInput.addEventListener("change", () => {
      const parsed = parseInt(countInput.value, 10);
      if (!isNaN(parsed)) {
        this.recentMeetingCount = Math.max(1, Math.min(30, parsed));
      }
    });

    const messagesEl = contentEl.createDiv({ cls: "ask-adora-messages" });
    this.renderMessages(messagesEl);

    const inputArea = contentEl.createDiv({ cls: "ask-adora-input-area" });
    const textarea = inputArea.createEl("textarea");
    textarea.placeholder = "Ask Adora anything...";
    textarea.rows = 5;
    textarea.style.width = "100%";

    const actions = inputArea.createDiv({ cls: "ask-adora-actions" });
    const sendBtn = actions.createEl("button", { text: "Send" });
    sendBtn.addEventListener("click", async () => {
      await this.sendMessage(textarea, messagesEl, sendBtn);
    });

    const clearBtn = actions.createEl("button", { text: "Clear chat" });
    clearBtn.addEventListener("click", () => {
      this.messages = [];
      this.renderMessages(messagesEl);
      new Notice("Ask Adora chat cleared.");
    });

    const saveBtn = actions.createEl("button", { text: "Save chat" });
    saveBtn.addEventListener("click", async () => {
      await this.saveConversation(false);
      sessionEl.setText(
        this.currentConversationPath
          ? `Conversation: ${this.currentConversationPath}`
          : "Conversation: unsaved",
      );
    });

    const saveAsNewBtn = actions.createEl("button", { text: "Save as new" });
    saveAsNewBtn.addEventListener("click", async () => {
      await this.saveConversation(true);
      sessionEl.setText(
        this.currentConversationPath
          ? `Conversation: ${this.currentConversationPath}`
          : "Conversation: unsaved",
      );
    });

    const loadLatestBtn = actions.createEl("button", { text: "Load latest" });
    loadLatestBtn.addEventListener("click", async () => {
      await this.loadLatestConversation();
      this.renderMessages(messagesEl);
      sessionEl.setText(
        this.currentConversationPath
          ? `Conversation: ${this.currentConversationPath}`
          : "Conversation: unsaved",
      );
    });

    const loadActiveBtn = actions.createEl("button", { text: "Load active file" });
    loadActiveBtn.addEventListener("click", async () => {
      await this.loadConversationFromActiveFile();
      this.renderMessages(messagesEl);
      sessionEl.setText(
        this.currentConversationPath
          ? `Conversation: ${this.currentConversationPath}`
          : "Conversation: unsaved",
      );
    });

    textarea.addEventListener("keydown", async (evt) => {
      if ((evt.metaKey || evt.ctrlKey) && evt.key === "Enter") {
        evt.preventDefault();
        await this.sendMessage(textarea, messagesEl, sendBtn);
      }
    });
  }

  private renderMessages(messagesEl: HTMLElement): void {
    messagesEl.empty();
    for (const msg of this.messages) {
      const bubble = messagesEl.createDiv({
        cls: `ask-adora-message ask-adora-${msg.role}`,
      });
      bubble.createEl("strong", {
        text: msg.role === "user" ? "You" : "Adora",
      });
      bubble.createEl("p", { text: msg.content });
    }
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  private async sendMessage(
    textarea: HTMLTextAreaElement,
    messagesEl: HTMLElement,
    sendBtn: HTMLButtonElement,
  ): Promise<void> {
    const text = textarea.value.trim();
    if (!text || this.isSending) {
      return;
    }

    this.isSending = true;
    sendBtn.disabled = true;
    sendBtn.textContent = "Sending...";

    this.messages.push({ role: "user", content: text });
    textarea.value = "";
    this.renderMessages(messagesEl);

    try {
      const context = await this.plugin.buildAskAdoraContext({
        includeActiveNote: this.includeActiveNote,
        includeRecentMeetings: this.includeRecentMeetings,
        includeRecentDigests: this.includeRecentDigests,
        recentMeetingCount: this.recentMeetingCount,
      });
      const response = await this.plugin.askAdora(this.messages, context);
      this.messages.push({ role: "assistant", content: response });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      this.messages.push({
        role: "assistant",
        content: `I ran into an issue: ${message}`,
      });
    } finally {
      this.isSending = false;
      sendBtn.disabled = false;
      sendBtn.textContent = "Send";
      this.renderMessages(messagesEl);
    }
  }

  private getChatFolderPath(): string {
    return `${this.plugin.settings.baseFolderPath}/${this.plugin.settings.digestsFolderName}/Ask Adora`;
  }

  private async ensureFolderPath(path: string): Promise<void> {
    const parts = path.split("/").filter(Boolean);
    let current = "";
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      if (!this.app.vault.getAbstractFileByPath(current)) {
        await this.app.vault.createFolder(current);
      }
    }
  }

  private serializeConversation(): string {
    const now = new Date().toISOString();
    const titleSeed =
      this.messages.find((m) => m.role === "user")?.content ?? "Conversation";
    const title = titleSeed.replace(/\s+/g, " ").trim().substring(0, 80);

    const lines: string[] = [
      "---",
      `type: "ask-adora-chat"`,
      `title: "${title.replace(/"/g, '\\"')}"`,
      `updated_at: "${now}"`,
      `message_count: ${this.messages.length}`,
      "---",
      "",
      `# Ask Adora Chat — ${title}`,
      "",
      "## Conversation",
      "",
    ];

    for (const msg of this.messages) {
      const heading = msg.role === "user" ? "### You" : "### Adora";
      lines.push(heading, "", msg.content, "");
    }

    return lines.join("\n");
  }

  private parseConversation(content: string): AskAdoraMessage[] {
    const body = content.replace(/^---[\s\S]*?---\n?/m, "");
    const lines = body.split("\n");
    const parsed: AskAdoraMessage[] = [];

    let role: "user" | "assistant" | null = null;
    let buffer: string[] = [];

    const flush = (): void => {
      if (!role) return;
      const text = buffer.join("\n").trim();
      if (text) {
        parsed.push({ role, content: text });
      }
      buffer = [];
    };

    for (const line of lines) {
      if (
        line === "### You" ||
        line === "### User" ||
        line === "### Adora" ||
        line === "### Assistant"
      ) {
        flush();
        role =
          line === "### You" || line === "### User" ? "user" : "assistant";
        continue;
      }
      if (role) {
        buffer.push(line);
      }
    }
    flush();

    return parsed;
  }

  private async saveConversation(asNew: boolean): Promise<void> {
    if (this.messages.length === 0) {
      new Notice("No messages to save yet.");
      return;
    }

    const folder = this.getChatFolderPath();
    await this.ensureFolderPath(folder);
    const content = this.serializeConversation();

    if (!asNew && this.currentConversationPath) {
      const existing = this.app.vault.getAbstractFileByPath(
        this.currentConversationPath,
      );
      if (existing instanceof TFile) {
        await this.app.vault.modify(existing, content);
        new Notice("Conversation updated.");
        return;
      }
    }

    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const path = `${folder}/chat--${ts}.md`;
    await this.app.vault.create(path, content);
    this.currentConversationPath = path;
    new Notice("Conversation saved.");
  }

  private async loadLatestConversation(): Promise<void> {
    const prefix = `${this.getChatFolderPath()}/`;
    const files = this.app.vault
      .getMarkdownFiles()
      .filter((f) => f.path.startsWith(prefix))
      .sort((a, b) => b.stat.mtime - a.stat.mtime);

    if (files.length === 0) {
      new Notice("No saved Ask Adora conversations found.");
      return;
    }

    const latest = files[0];
    const content = await this.app.vault.read(latest);
    const parsed = this.parseConversation(content);
    if (parsed.length === 0) {
      new Notice("Could not parse messages from latest conversation.");
      return;
    }
    this.messages = parsed;
    this.currentConversationPath = latest.path;
    new Notice(`Loaded conversation: ${latest.basename}`);
  }

  private async loadConversationFromActiveFile(): Promise<void> {
    const file = this.app.workspace.getActiveFile();
    if (!file) {
      new Notice("Open a saved conversation note first.");
      return;
    }
    const content = await this.app.vault.read(file);
    const parsed = this.parseConversation(content);
    if (parsed.length === 0) {
      new Notice("Active file does not contain a recognizable Ask Adora chat.");
      return;
    }
    this.messages = parsed;
    this.currentConversationPath = file.path;
    new Notice(`Loaded conversation: ${file.basename}`);
  }
}
