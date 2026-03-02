import {
  ItemView,
  MarkdownRenderer,
  Notice,
  TFile,
  WorkspaceLeaf,
  setIcon,
} from "obsidian";
import type GranolaAdoraPlugin from "./main";
import { AskAdoraMessage } from "./types";

export const ASK_ADORA_VIEW_TYPE = "granola-ask-adora-view";

export class AskAdoraView extends ItemView {
  private plugin: GranolaAdoraPlugin;
  private messages: AskAdoraMessage[] = [];
  private isSending = false;
  private currentConversationPath: string | null = null;
  private messagesEl: HTMLElement | null = null;
  private textareaEl: HTMLTextAreaElement | null = null;
  private sendBtnEl: HTMLButtonElement | null = null;
  private sessionPillEl: HTMLElement | null = null;

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

  focusInput(): void {
    this.textareaEl?.focus();
  }

  async sendFromCommand(): Promise<void> {
    if (!this.textareaEl) {
      this.render();
    }
    if (!this.textareaEl) {
      return;
    }
    if (!this.textareaEl.value.trim()) {
      this.textareaEl.focus();
      new Notice("Type a question in Ask Adora, then send.");
      return;
    }
    await this.sendMessage();
  }

  clearConversationFromCommand(): void {
    this.clearConversation(true);
  }

  async saveConversationFromCommand(): Promise<void> {
    await this.saveConversation(false);
    this.refreshSessionPill();
  }

  startNewConversationFromCommand(): void {
    this.clearConversation(false);
    this.currentConversationPath = null;
    this.refreshSessionPill();
    new Notice("Started a new Ask Adora conversation.");
  }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("ask-adora-root");

    const headerEl = contentEl.createDiv({ cls: "ask-adora-header" });
    const titleWrap = headerEl.createDiv({ cls: "ask-adora-title-wrap" });
    const iconEl = titleWrap.createSpan();
    setIcon(iconEl, "message-square");
    const titleBlock = titleWrap.createDiv();
    titleBlock.createEl("h2", { text: "Ask Adora", cls: "ask-adora-title" });
    titleBlock.createEl("p", {
      cls: "ask-adora-subtitle",
      text: "Ask about meetings, customer asks, and synced context.",
    });
    this.sessionPillEl = headerEl.createSpan({ cls: "ask-adora-session-pill" });
    this.refreshSessionPill();

    const contextDetails = contentEl.createEl("details", { cls: "ask-adora-context" });
    const contextSummary = contextDetails.createEl("summary");
    contextSummary.setText("Context settings");
    const controls = contextDetails.createDiv({ cls: "ask-adora-context-grid" });

    const activeWrap = controls.createEl("label", { cls: "ask-adora-context-option" });
    const activeCb = activeWrap.createEl("input", { type: "checkbox" });
    activeCb.checked = this.includeActiveNote;
    activeCb.addEventListener("change", () => {
      this.includeActiveNote = activeCb.checked;
    });
    activeWrap.appendText("Include active note");

    const meetingsWrap = controls.createEl("label", { cls: "ask-adora-context-option" });
    const meetingsCb = meetingsWrap.createEl("input", { type: "checkbox" });
    meetingsCb.checked = this.includeRecentMeetings;
    meetingsCb.addEventListener("change", () => {
      this.includeRecentMeetings = meetingsCb.checked;
    });
    meetingsWrap.appendText("Include recent meetings");

    const digestsWrap = controls.createEl("label", { cls: "ask-adora-context-option" });
    const digestsCb = digestsWrap.createEl("input", { type: "checkbox" });
    digestsCb.checked = this.includeRecentDigests;
    digestsCb.addEventListener("change", () => {
      this.includeRecentDigests = digestsCb.checked;
    });
    digestsWrap.appendText("Include recent digests");

    const countRow = controls.createDiv({ cls: "ask-adora-context-count" });
    countRow.createEl("span", { text: "Recent meetings:" });
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

    this.messagesEl = contentEl.createDiv({ cls: "ask-adora-messages" });
    void this.renderMessages();

    const inputArea = contentEl.createDiv({ cls: "ask-adora-input-wrap" });
    this.textareaEl = inputArea.createEl("textarea", { cls: "ask-adora-input" });
    this.textareaEl.placeholder = "Ask Adora anything...";
    this.textareaEl.rows = 1;

    this.sendBtnEl = inputArea.createEl("button", {
      cls: "ask-adora-btn ask-adora-btn-primary",
      text: "Send",
    });
    this.sendBtnEl.addEventListener("click", async () => {
      await this.sendMessage();
    });

    const toolbar = inputArea.createDiv({ cls: "ask-adora-toolbar" });
    toolbar.appendChild(this.sendBtnEl);

    const rightActions = toolbar.createDiv({ cls: "ask-adora-toolbar-right" });
    const clearBtn = rightActions.createEl("button", {
      cls: "ask-adora-btn",
      text: "Clear",
    });
    clearBtn.setAttr("aria-label", "Clear current chat");
    clearBtn.addEventListener("click", () => {
      this.clearConversation(true);
    });

    const saveBtn = rightActions.createEl("button", {
      cls: "ask-adora-btn",
      text: "Save",
    });
    saveBtn.setAttr("aria-label", "Save chat (Shift+click: save as new)");
    saveBtn.addEventListener("click", async (evt: MouseEvent) => {
      const saveAsNew = evt.shiftKey;
      await this.saveConversation(saveAsNew);
      this.refreshSessionPill();
    });

    const loadLatestBtn = rightActions.createEl("button", {
      cls: "ask-adora-btn",
      text: "Load latest",
    });
    loadLatestBtn.setAttr("aria-label", "Load latest saved conversation");
    loadLatestBtn.addEventListener("click", async () => {
      await this.loadLatestConversation();
      this.refreshSessionPill();
      void this.renderMessages();
    });

    const loadActiveBtn = rightActions.createEl("button", {
      cls: "ask-adora-btn",
      text: "Load active",
    });
    loadActiveBtn.setAttr("aria-label", "Load conversation from active file");
    loadActiveBtn.addEventListener("click", async () => {
      await this.loadConversationFromActiveFile();
      this.refreshSessionPill();
      void this.renderMessages();
    });

    const autosize = (): void => {
      if (!this.textareaEl) return;
      this.textareaEl.style.height = "auto";
      this.textareaEl.style.height = `${Math.min(this.textareaEl.scrollHeight, 150)}px`;
    };
    this.textareaEl.addEventListener("input", autosize);
    autosize();

    this.textareaEl.addEventListener("keydown", async (evt) => {
      if ((evt.metaKey || evt.ctrlKey) && evt.key === "Enter") {
        evt.preventDefault();
        await this.sendMessage();
      }
    });

    this.textareaEl.focus();
  }

  private refreshSessionPill(): void {
    if (!this.sessionPillEl) {
      return;
    }
    if (this.currentConversationPath) {
      const basename = this.currentConversationPath.split("/").pop() ?? "saved";
      this.sessionPillEl.setText(`Saved: ${basename}`);
      this.sessionPillEl.addClass("ask-adora-status-saved");
    } else {
      this.sessionPillEl.setText("Unsaved conversation");
      this.sessionPillEl.removeClass("ask-adora-status-saved");
    }
  }

  private async renderMessages(): Promise<void> {
    if (!this.messagesEl) {
      return;
    }
    this.messagesEl.empty();

    if (this.messages.length === 0 && !this.isSending) {
      this.messagesEl.createDiv({
        cls: "ask-adora-empty",
        text: "Ask Adora a question to start the conversation.",
      });
      return;
    }

    for (const msg of this.messages) {
      const row = this.messagesEl.createDiv({
        cls: `ask-adora-message-row ask-adora-message-row-${msg.role === "user" ? "user" : "assistant"}`,
      });
      const bubble = row.createDiv({
        cls: `ask-adora-message ask-adora-message-${msg.role === "user" ? "user" : "assistant"}`,
      });
      bubble.createDiv({
        cls: "ask-adora-message-role",
        text: msg.role === "user" ? "You" : "Adora",
      });
      const messageContent = bubble.createDiv({ cls: "ask-adora-message-content" });
      await MarkdownRenderer.render(this.app, msg.content, messageContent, "", this);
    }

    if (this.isSending) {
      const row = this.messagesEl.createDiv({
        cls: "ask-adora-message-row ask-adora-message-row-assistant",
      });
      const typing = row.createDiv({ cls: "ask-adora-typing" });
      typing.createEl("span", { text: "Adora is thinking" });
      typing.createDiv({ cls: "ask-adora-typing-dot" });
      typing.createDiv({ cls: "ask-adora-typing-dot" });
      typing.createDiv({ cls: "ask-adora-typing-dot" });
    }

    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }

  private clearConversation(notify: boolean): void {
    this.messages = [];
    void this.renderMessages();
    if (notify) {
      new Notice("Ask Adora chat cleared.");
    }
  }

  private async sendMessage(): Promise<void> {
    const text = this.textareaEl?.value.trim() ?? "";
    if (!text || this.isSending) {
      return;
    }

    this.isSending = true;
    if (this.sendBtnEl) {
      this.sendBtnEl.disabled = true;
      this.sendBtnEl.textContent = "Sending...";
    }

    this.messages.push({ role: "user", content: text });
    if (this.textareaEl) {
      this.textareaEl.value = "";
      this.textareaEl.style.height = "auto";
    }
    await this.renderMessages();

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
      if (this.sendBtnEl) {
        this.sendBtnEl.disabled = false;
        this.sendBtnEl.textContent = "Send";
      }
      await this.renderMessages();
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
