import { requestUrl } from "obsidian";
import {
  AskAdoraMessage,
  LinearIssue,
  Decision,
  CustomerAskSignal,
} from "./types";

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";

interface ClaudeResponse {
  content: { type: string; text: string }[];
}

export class AICortex {
  private apiKey: string;
  private model: string;
  private fastModel: string;
  private deepModel: string;

  constructor(apiKey: string, fastModel: string, deepModel: string) {
    this.apiKey = apiKey;
    this.fastModel = fastModel;
    this.deepModel = deepModel;
    this.model = deepModel;
  }

  async generateCustomerPrepBrief(
    customerName: string,
    meetingSummaries: string[],
  ): Promise<string> {
    const truncated = meetingSummaries
      .slice(0, 10)
      .map((s) => this.truncate(s))
      .join("\n\n---\n\n");

    return this.callClaudeDeep(
      "You are a customer intelligence analyst for Adora AI, a Seattle-based SaaS startup with 17 people. You help the team prepare for customer meetings by synthesizing past interactions into actionable briefs. Output clean markdown.",
      `Customer: ${customerName}\n\nRecent meeting notes with this customer:\n\n${truncated}\n\nGenerate a customer prep brief with these sections:\n## Relationship Summary\nBrief overview of the relationship history and current status.\n\n## Recent Discussion Topics\nKey topics from recent meetings.\n\n## Open Items & Action Items\nAnything unresolved or pending.\n\n## Suggested Talking Points\nRecommended topics for the next conversation.`,
    );
  }

  async generateWeeklyDigest(
    meetingSummaries: string[],
    issuesSummary: string,
    slackMessages: string[],
    pullRequests: string[],
    decisions: string[],
    healthScores: string[],
  ): Promise<string> {
    const truncated = meetingSummaries
      .slice(0, 15)
      .map((s) => this.truncate(s))
      .join("\n\n---\n\n");

    const issuesBlock = issuesSummary
      ? `\n\nActive engineering issues:\n${this.truncate(issuesSummary, 4000)}`
      : "";

    const slackBlock =
      slackMessages.length > 0
        ? `\n\nSlack Highlights:\n${this.truncate(slackMessages.join("\n"), 3000)}`
        : "";

    const prBlock =
      pullRequests.length > 0
        ? `\n\nDevelopment Activity (PRs):\n${this.truncate(pullRequests.join("\n"), 3000)}`
        : "";

    const decisionsBlock =
      decisions.length > 0
        ? `\n\nDecisions Made:\n${this.truncate(decisions.join("\n"), 2000)}`
        : "";

    const healthBlock =
      healthScores.length > 0
        ? `\n\nCustomer Health Overview:\n${this.truncate(healthScores.join("\n"), 2000)}`
        : "";

    const allData = `${truncated}${issuesBlock}${slackBlock}${prBlock}${decisionsBlock}${healthBlock}`;
    const finalTruncated = this.truncate(allData, 12000);

    return this.callClaudeDeep(
      "You are a company intelligence analyst for Adora AI, a Seattle-based SaaS startup with 17 people. Synthesize the week's activity into a concise, actionable digest for the whole team. Output clean markdown.",
      `Generate a comprehensive weekly digest from the following data sources. Only include sections with data:\n\n${finalTruncated}\n\nCreate these sections:\n## Meeting Summary\nKey themes and decisions from meetings.\n\n## Issue Updates\nActive engineering work and progress.\n\n## Slack Highlights\nImportant discussions and announcements from Slack.\n\n## Development Activity\nPull requests and code changes by repository.\n\n## Decisions Made\nKey decisions made this week with context.\n\n## Customer Health Overview\nCustomer health scores and at-risk accounts.\n\nBe concise but informative. Focus on actionable insights.`,
    );
  }

  async detectThemes(meetingSummaries: string[]): Promise<string> {
    const truncated = meetingSummaries
      .slice(0, 20)
      .map((s) => this.truncate(s))
      .join("\n\n---\n\n");

    return this.callClaudeDeep(
      "You are a pattern detection analyst for Adora AI, a Seattle-based SaaS startup. Analyze meeting content to surface recurring themes and emerging patterns. Output clean markdown.",
      `Recent meeting notes:\n\n${truncated}\n\nAnalyze these meetings and generate a theme report with:\n## Recurring Themes\nTopics that come up repeatedly.\n\n## Emerging Patterns\nNew trends or shifts in conversation.\n\n## Customer Sentiment\nOverall tone and satisfaction indicators.\n\n## Feature Requests\nProduct features or improvements mentioned.\n\n## Risks & Concerns\nPotential issues to watch.`,
    );
  }

  async extractTopCustomerAsks(
    meetingSummaries: string[],
    revenueContext?: string,
  ): Promise<string> {
    const truncated = meetingSummaries
      .slice(0, 40)
      .map((s) => this.truncate(s, 1500))
      .join("\n\n---\n\n");

    const revenueBlock = revenueContext
      ? `\n\nCustomer Revenue Data (use this to weight asks by business impact):\n${this.truncate(revenueContext, 3000)}`
      : "";

    const revenueInstruction = revenueContext
      ? "\n- Estimated revenue impact (based on deal/company data below)"
      : "";

    const revenueSection = revenueContext
      ? "\n\n## Revenue-Weighted Priority\nRe-rank the top asks by estimated revenue impact. Show which high-revenue customers are asking for what."
      : "";

    return this.callClaudeDeep(
      "You are a product intelligence analyst for Adora AI. Synthesize sales and customer success conversations into a ranked customer ask report. Output clean markdown.",
      `Meeting notes from the last 30 days:\n\n${truncated}${revenueBlock}\n\nGenerate a report titled "Top 10 Customer Asks" with these sections:\n## Top 10 Customer Asks\nA numbered list from most frequent to least frequent.\nFor each ask include:\n- Ask summary (one line)\n- Mention frequency estimate (number of meetings/customers)\n- Customers who mentioned it (if known)\n- Why it matters (business impact)${revenueInstruction}\n- One representative quote or evidence line from notes\n\n## Segment Notes\nHighlight any differences between sales and customer success asks.${revenueSection}\n\n## Recommended Next Actions\n3-5 concrete product follow-ups for the team.\n\nKeep it concise and practical.`,
    );
  }

  async askAnything(
    messages: AskAdoraMessage[],
    context: string,
  ): Promise<string> {
    const systemPrompt = [
      "You are Ask Adora, an internal analyst assistant for Adora AI.",
      "Answer using the provided vault context when relevant.",
      "If the context does not contain enough evidence, say what is missing and suggest next steps.",
      "Be concise, accurate, and practical.",
      "",
      "Vault context:",
      this.truncate(context || "No additional context provided.", 12000),
    ].join("\n");

    const sanitizedMessages = messages
      .slice(-20)
      .map((m) => ({ role: m.role, content: this.truncate(m.content, 4000) }));

    return this.callClaudeWithMessages(
      this.deepModel,
      systemPrompt,
      sanitizedMessages,
    );
  }

  async analyzeSentiment(meetingExcerpts: string[]): Promise<number> {
    const truncated = meetingExcerpts
      .slice(0, 5)
      .map((s) => this.truncate(s, 500))
      .join("\n\n---\n\n");

    const response = await this.callClaudeFast(
      "Rate the overall customer sentiment from these meeting excerpts on a 0-100 scale. Return ONLY a number.",
      truncated,
    );

    const parsed = parseInt(response.trim(), 10);
    if (isNaN(parsed)) return 50;
    return Math.max(0, Math.min(100, parsed));
  }

  async extractIdeas(meetingContent: string): Promise<string> {
    return this.callClaudeDeep(
      "You are a product strategist for Adora AI, a Seattle-based SaaS startup. Extract actionable ideas from meeting notes. Output clean markdown as a numbered list.",
      `Meeting content:\n\n${this.truncate(meetingContent, 12000)}\n\nExtract all actionable ideas, product suggestions, feature requests, and process improvements. For each idea, provide:\n- A clear title\n- Brief description\n- Potential impact (high/medium/low)\n\nFormat as a numbered list.`,
    );
  }

  async extractDecisions(meetingContent: string): Promise<Decision[]> {
    const truncated = this.truncate(meetingContent, 8000);

    const response = await this.callClaudeDeep(
      'Extract key decisions from this meeting transcript.\nFor each decision, provide:\n- summary: One sentence describing the decision\n- context: Why this decision was made (2-3 sentences)\n- stakeholders: Array of people involved\n\nReturn as JSON array: [{"summary": "...", "context": "...", "stakeholders": ["..."]}]\nReturn ONLY valid JSON, no markdown formatting.',
      `Meeting content:\n\n${truncated}`,
    );

    try {
      const cleaned = response
        .replace(/```json?\n?/g, "")
        .replace(/```/g, "")
        .trim();
      const parsed = JSON.parse(cleaned);
      if (!Array.isArray(parsed)) return [];

      const now = new Date().toISOString().split("T")[0];
      return parsed.map(
        (item: {
          summary?: string;
          context?: string;
          stakeholders?: string[];
        }) => ({
          id: `dec-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
          title: item.summary ?? "",
          context: item.context ?? "",
          decision: item.summary ?? "",
          rationale: item.context ?? "",
          participants: item.stakeholders ?? [],
          sourceMeetingId: null,
          date: now,
          status: "proposed" as const,
          tags: ["decision"],
        }),
      );
    } catch {
      return [];
    }
  }

  async extractCustomerAsksFromMeeting(
    meetingContent: string,
  ): Promise<CustomerAskSignal[]> {
    const truncated = this.truncate(meetingContent, 10000);
    const response = await this.callClaudeDeep(
      'Extract explicit customer asks/requests from this meeting note or transcript. Return ONLY asks that are clear, actionable requests.\nFor each ask return:\n- summary: one-sentence request\n- evidence: exact quote or close paraphrase from the note\n- requestedBy: customer/company name when available\n- impact: high | medium | low\n\nReturn ONLY valid JSON array: [{"summary":"...","evidence":"...","requestedBy":"...","impact":"medium"}]',
      `Meeting content:\n\n${truncated}`,
    );

    try {
      const cleaned = response
        .replace(/```json?\n?/g, "")
        .replace(/```/g, "")
        .trim();
      const parsed = JSON.parse(cleaned);
      if (!Array.isArray(parsed)) return [];

      return parsed
        .filter((item: unknown) => !!item && typeof item === "object")
        .map((item: Record<string, unknown>) => {
          const impactRaw =
            typeof item.impact === "string"
              ? item.impact.toLowerCase()
              : "medium";
          const impact: CustomerAskSignal["impact"] =
            impactRaw === "high" || impactRaw === "low" ? impactRaw : "medium";

          return {
            summary:
              typeof item.summary === "string" ? item.summary.trim() : "",
            evidence:
              typeof item.evidence === "string" ? item.evidence.trim() : "",
            requestedBy:
              typeof item.requestedBy === "string"
                ? item.requestedBy.trim()
                : undefined,
            impact,
          };
        })
        .filter((ask) => ask.summary.length > 0 && ask.evidence.length > 0);
    } catch {
      return [];
    }
  }

  async generateReleaseNotes(
    issuesByProject: Record<string, LinearIssue[]>,
  ): Promise<string> {
    const projectBlocks = Object.entries(issuesByProject)
      .map(([projectName, issues]) => {
        const issueLines = issues
          .map((issue) => {
            const labels = issue.labels.nodes.map((l) => l.name).join(", ");
            const labelStr = labels ? ` [${labels}]` : "";
            return `- **${issue.identifier}**: ${issue.title}${labelStr}`;
          })
          .join("\n");
        return `## ${projectName}\n\n${issueLines}`;
      })
      .join("\n\n");

    const truncated = this.truncate(projectBlocks, 10000);

    return this.callClaudeDeep(
      "Generate professional release notes from these completed issues, grouped by project. For each issue, write a concise user-facing description (1-2 sentences). Focus on what changed for the user, not technical implementation details. Output clean markdown with project headings (## Project Name) and bullet lists.",
      `Completed issues by project:\n\n${truncated}`,
    );
  }

  async refineEasyTicketRecommendation(prompt: string): Promise<string> {
    return this.callClaudeDeep(
      "You are refining low-risk coding-bot work recommendations. Return only valid JSON matching the requested schema.",
      this.truncate(prompt, 12000),
    );
  }

  private truncate(content: string, maxChars: number = 8000): string {
    if (content.length <= maxChars) return content;
    return (
      content.substring(0, maxChars) +
      "\n\n[... content truncated for analysis ...]"
    );
  }

  private async callClaude(
    systemPrompt: string,
    userContent: string,
  ): Promise<string> {
    const response = await requestUrl({
      url: ANTHROPIC_API,
      method: "POST",
      headers: {
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: "user", content: userContent }],
      }),
    });

    if (response.status >= 400) {
      throw new Error(`Claude API error ${response.status}: ${response.text}`);
    }

    const data = response.json as ClaudeResponse;
    return data.content?.[0]?.text ?? "";
  }

  private async callClaudeWithMessages(
    model: string,
    systemPrompt: string,
    messages: AskAdoraMessage[],
  ): Promise<string> {
    const response = await requestUrl({
      url: ANTHROPIC_API,
      method: "POST",
      headers: {
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        system: systemPrompt,
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      }),
    });

    if (response.status >= 400) {
      throw new Error(`Claude API error ${response.status}: ${response.text}`);
    }

    const data = response.json as ClaudeResponse;
    return data.content?.[0]?.text ?? "";
  }

  private async callClaudeFast(
    systemPrompt: string,
    userContent: string,
  ): Promise<string> {
    return this.callClaudeWithMessages(this.fastModel, systemPrompt, [
      { role: "user", content: userContent },
    ]);
  }

  private async callClaudeDeep(
    systemPrompt: string,
    userContent: string,
  ): Promise<string> {
    return this.callClaudeWithMessages(this.deepModel, systemPrompt, [
      { role: "user", content: userContent },
    ]);
  }
}
