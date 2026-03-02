import { App, TFile, normalizePath } from "obsidian";
import { GranolaAdoraSettings } from "./types";

interface LinkResult {
  meetingsLinked: number;
  issuesLinked: number;
  designsLinked: number;
  slackLinked: number;
  prsLinked: number;
  hubspotLinked: number;
}

export class Linker {
  private app: App;
  private getSettings: () => GranolaAdoraSettings;

  constructor(app: App, getSettings: () => GranolaAdoraSettings) {
    this.app = app;
    this.getSettings = getSettings;
  }

  async runFullLinkingPass(): Promise<LinkResult> {
    const settings = this.getSettings();
    const result: LinkResult = {
      meetingsLinked: 0,
      issuesLinked: 0,
      designsLinked: 0,
      slackLinked: 0,
      prsLinked: 0,
      hubspotLinked: 0,
    };

    const meetingFiles = this.getFilesInFolder(
      `${settings.baseFolderPath}/${settings.meetingsFolderName}`,
    );
    const issueFiles = settings.syncLinear
      ? this.getFilesInFolder(
          `${settings.baseFolderPath}/${settings.linearFolderName}/Issues`,
        )
      : [];
    const designFiles = settings.syncFigma
      ? this.getFilesInFolder(
          `${settings.baseFolderPath}/${settings.designsFolderName}`,
        )
      : [];
    const customerFiles = this.getFilesInFolder(
      `${settings.baseFolderPath}/${settings.customersFolderName}`,
    );

    const issueIndex = await this.buildIssueIndex(issueFiles);
    const designIndex = this.buildDesignIndex(designFiles);

    for (const meeting of meetingFiles) {
      const updated = await this.linkMeetingNote(
        meeting,
        issueIndex,
        designIndex,
      );
      if (updated) result.meetingsLinked++;
    }

    for (const issue of issueFiles) {
      const updated = await this.linkIssueToCustomers(issue, customerFiles);
      if (updated) result.issuesLinked++;
    }

    for (const customer of customerFiles) {
      const updated = await this.enrichCustomer360(customer, settings);
      if (updated) result.designsLinked++;
    }

    const slackFiles = settings.syncSlack
      ? this.getFilesInFolder(
          `${settings.baseFolderPath}/${settings.slackFolderName}`,
        )
      : [];

    for (const message of slackFiles) {
      if (await this.linkSlackToCustomers(message, customerFiles))
        result.slackLinked++;
      if (await this.linkSlackToIssues(message, issueIndex))
        result.slackLinked++;
    }

    const prFiles = settings.syncGithub
      ? this.getFilesInFolder(
          `${settings.baseFolderPath}/${settings.githubFolderName}`,
        )
      : [];

    for (const pr of prFiles) {
      result.prsLinked += await this.linkPRsToIssues(pr, issueFiles);
    }

    const hubspotContacts = settings.syncHubspot
      ? this.getFilesInFolder(
          `${settings.baseFolderPath}/${settings.hubspotFolderName}/Contacts`,
        )
      : [];
    const hubspotDeals = settings.syncHubspot
      ? this.getFilesInFolder(
          `${settings.baseFolderPath}/${settings.hubspotFolderName}/Deals`,
        )
      : [];
    const hubspotTickets = settings.syncHubspot
      ? this.getFilesInFolder(
          `${settings.baseFolderPath}/${settings.hubspotFolderName}/Tickets`,
        )
      : [];
    const hubspotMeetings = settings.syncHubspot
      ? this.getFilesInFolder(
          `${settings.baseFolderPath}/${settings.hubspotFolderName}/Meetings`,
        )
      : [];

    for (const contact of hubspotContacts) {
      result.hubspotLinked += await this.linkHubSpotContactToCustomers(
        contact,
        customerFiles,
      );
    }

    for (const deal of hubspotDeals) {
      result.hubspotLinked += await this.linkHubSpotDealToCustomers(
        deal,
        customerFiles,
      );
    }

    for (const ticket of hubspotTickets) {
      result.hubspotLinked += await this.linkHubSpotTicketToCustomers(
        ticket,
        customerFiles,
      );
    }

    for (const meeting of hubspotMeetings) {
      result.hubspotLinked += await this.linkHubSpotMeetingToGranolaMeetings(
        meeting,
        meetingFiles,
      );
    }

    return result;
  }

  private getFilesInFolder(folderPath: string): TFile[] {
    const prefix = normalizePath(folderPath) + "/";
    return this.app.vault
      .getMarkdownFiles()
      .filter((f) => f.path.startsWith(prefix));
  }

  private async buildIssueIndex(
    issueFiles: TFile[],
  ): Promise<Map<string, { identifier: string; title: string; path: string }>> {
    const index = new Map<
      string,
      { identifier: string; title: string; path: string }
    >();
    for (const file of issueFiles) {
      const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
      if (!fm) continue;
      const identifier = fm.identifier ?? "";
      const title = fm.title ?? file.basename;
      if (identifier) {
        index.set(identifier, { identifier, title, path: file.path });
      }
    }
    return index;
  }

  private buildDesignIndex(
    designFiles: TFile[],
  ): Map<string, { name: string; path: string }> {
    const index = new Map<string, { name: string; path: string }>();
    for (const file of designFiles) {
      const name = file.basename;
      index.set(name.toLowerCase(), { name, path: file.path });
    }
    return index;
  }

  private async buildSlackIndex(
    slackFiles: TFile[],
  ): Promise<
    Map<string, { permalink: string; channel: string; path: string }>
  > {
    const index = new Map<
      string,
      { permalink: string; channel: string; path: string }
    >();
    for (const file of slackFiles) {
      const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
      if (!fm) continue;
      const permalink = fm.permalink ?? "";
      const channel = fm.channel ?? "";
      if (permalink) {
        index.set(permalink, { permalink, channel, path: file.path });
      }
    }
    return index;
  }

  private buildPRIndex(
    prFiles: TFile[],
  ): Map<
    string,
    { repo: string; number: number; path: string; related_issues: string[] }
  > {
    const index = new Map<
      string,
      {
        repo: string;
        number: number;
        path: string;
        related_issues: string[];
      }
    >();
    for (const file of prFiles) {
      const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
      if (!fm) continue;
      const repo = fm.repo ?? "";
      const prNumber = fm.pr_number ?? 0;
      const relatedIssues: string[] = fm.related_issues ?? [];
      if (repo && prNumber) {
        index.set(`${repo}--${prNumber}`, {
          repo,
          number: prNumber,
          path: file.path,
          related_issues: relatedIssues,
        });
      }
    }
    return index;
  }

  private async linkMeetingNote(
    meetingFile: TFile,
    issueIndex: Map<
      string,
      { identifier: string; title: string; path: string }
    >,
    designIndex: Map<string, { name: string; path: string }>,
  ): Promise<boolean> {
    const content = await this.app.vault.read(meetingFile);
    const bodyContent = content.replace(/^---[\s\S]*?---/, "").toLowerCase();

    const matchedIssues: string[] = [];
    for (const [identifier] of issueIndex) {
      if (bodyContent.includes(identifier.toLowerCase())) {
        matchedIssues.push(identifier);
      }
    }

    const matchedDesigns: string[] = [];
    for (const [nameLower, design] of designIndex) {
      if (nameLower.length > 3 && bodyContent.includes(nameLower)) {
        matchedDesigns.push(design.name);
      }
    }

    if (matchedIssues.length === 0 && matchedDesigns.length === 0) {
      return false;
    }

    const updatedContent = this.upsertFrontmatterArrays(content, {
      related_issues: matchedIssues,
      related_designs: matchedDesigns,
    });

    if (updatedContent !== content) {
      await this.app.vault.modify(meetingFile, updatedContent);
      return true;
    }
    return false;
  }

  private async linkIssueToCustomers(
    issueFile: TFile,
    customerFiles: TFile[],
  ): Promise<boolean> {
    const content = await this.app.vault.read(issueFile);
    const bodyLower = content.replace(/^---[\s\S]*?---/, "").toLowerCase();

    const matchedCustomers: string[] = [];
    for (const customerFile of customerFiles) {
      const customerName = customerFile.basename;
      if (
        customerName.length > 2 &&
        bodyLower.includes(customerName.toLowerCase())
      ) {
        matchedCustomers.push(customerName);
      }
    }

    if (matchedCustomers.length === 0) return false;

    const updatedContent = this.upsertFrontmatterArrays(content, {
      related_customers: matchedCustomers,
    });

    if (updatedContent !== content) {
      await this.app.vault.modify(issueFile, updatedContent);
      return true;
    }
    return false;
  }

  private async linkSlackToCustomers(
    message: TFile,
    customerFiles: TFile[],
  ): Promise<boolean> {
    const content = await this.app.vault.read(message);
    const bodyLower = content.replace(/^---[\s\S]*?---/, "").toLowerCase();

    const matchedCustomers: string[] = [];
    for (const customerFile of customerFiles) {
      const customerName = customerFile.basename;
      if (
        customerName.length > 2 &&
        bodyLower.includes(customerName.toLowerCase())
      ) {
        matchedCustomers.push(customerName);
      }
    }

    if (matchedCustomers.length === 0) return false;

    const updatedContent = this.upsertFrontmatterArrays(content, {
      related_customers: matchedCustomers,
    });

    if (updatedContent !== content) {
      await this.app.vault.modify(message, updatedContent);
      return true;
    }
    return false;
  }

  private async linkSlackToIssues(
    message: TFile,
    issueIndex: Map<
      string,
      { identifier: string; title: string; path: string }
    >,
  ): Promise<boolean> {
    const content = await this.app.vault.read(message);
    const bodyContent = content.replace(/^---[\s\S]*?---/, "");

    const matchedIssues: string[] = [];
    const identifierPattern = /\b[A-Z]+-\d+\b/g;
    let match: RegExpExecArray | null;
    while ((match = identifierPattern.exec(bodyContent)) !== null) {
      const id = match[0];
      if (issueIndex.has(id) && !matchedIssues.includes(id)) {
        matchedIssues.push(id);
      }
    }

    if (matchedIssues.length === 0) return false;

    const updatedContent = this.upsertFrontmatterArrays(content, {
      related_issues: matchedIssues,
    });

    if (updatedContent !== content) {
      await this.app.vault.modify(message, updatedContent);
      return true;
    }
    return false;
  }

  private async linkPRsToIssues(
    prFile: TFile,
    issueFiles: TFile[],
  ): Promise<number> {
    const fm = this.app.metadataCache.getFileCache(prFile)?.frontmatter;
    if (!fm) return 0;

    const relatedIssues: string[] = fm.related_issues ?? [];
    const repo: string = fm.repo ?? "";
    const prNumber: number = fm.pr_number ?? 0;
    if (relatedIssues.length === 0 || !repo || !prNumber) return 0;

    const prRef = `${repo}#${prNumber}`;
    let backlinksCreated = 0;

    for (const issueId of relatedIssues) {
      const issueFile = issueFiles.find((f) => {
        const issueFm = this.app.metadataCache.getFileCache(f)?.frontmatter;
        return issueFm?.identifier === issueId;
      });
      if (!issueFile) continue;

      const content = await this.app.vault.read(issueFile);
      const updatedContent = this.upsertFrontmatterArrays(content, {
        related_prs: [prRef],
      });

      if (updatedContent !== content) {
        await this.app.vault.modify(issueFile, updatedContent);
        backlinksCreated++;
      }
    }

    return backlinksCreated;
  }

  private async enrichCustomer360(
    customerFile: TFile,
    settings: GranolaAdoraSettings,
  ): Promise<boolean> {
    const content = await this.app.vault.read(customerFile);
    const fm = this.app.metadataCache.getFileCache(customerFile)?.frontmatter;

    if (fm?.type !== "customer-360") return false;

    const customerName = fm.company ?? customerFile.basename;
    let modified = false;
    let updated = content;

    if (settings.syncLinear && !content.includes("## Related Issues")) {
      const issuesSection = this.buildLinearIssuesSection(
        customerName,
        settings,
      );
      updated = this.insertBeforeUserContent(updated, issuesSection);
      modified = true;
    }

    if (settings.syncFigma && !content.includes("## Related Designs")) {
      const designsSection = this.buildFigmaDesignsSection(
        customerName,
        settings,
      );
      updated = this.insertBeforeUserContent(updated, designsSection);
      modified = true;
    }

    if (settings.syncSlack && !content.includes("## Related Slack Messages")) {
      const slackSection = this.buildSlackMessagesSection(settings);
      updated = this.insertBeforeUserContent(updated, slackSection);
      modified = true;
    }

    if (settings.syncHubspot && !content.includes("## Related HubSpot")) {
      const hubspotSection = this.buildHubSpotSection(settings);
      updated = this.insertBeforeUserContent(updated, hubspotSection);
      modified = true;
    }

    if (modified) {
      await this.app.vault.modify(customerFile, updated);
    }
    return modified;
  }

  private buildLinearIssuesSection(
    customerName: string,
    settings: GranolaAdoraSettings,
  ): string {
    const escaped = customerName.replace(/"/g, '\\"');
    const issuesPath = `${settings.baseFolderPath}/${settings.linearFolderName}/Issues`;
    return [
      "## Related Issues\n",
      "```dataview",
      `TABLE status as "Status", priority as "Priority", assignee as "Assignee"`,
      `FROM "${issuesPath}"`,
      `WHERE contains(related_customers, "${escaped}") OR contains(file.content, "${escaped}")`,
      "SORT priority ASC",
      "```\n",
    ].join("\n");
  }

  private buildFigmaDesignsSection(
    customerName: string,
    settings: GranolaAdoraSettings,
  ): string {
    const escaped = customerName.replace(/"/g, '\\"');
    const designsPath = `${settings.baseFolderPath}/${settings.designsFolderName}`;
    return [
      "## Related Designs\n",
      "```dataview",
      `TABLE project as "Project", last_modified as "Updated"`,
      `FROM "${designsPath}"`,
      `WHERE contains(file.name, "${escaped}")`,
      "SORT last_modified DESC",
      "```\n",
    ].join("\n");
  }

  private buildSlackMessagesSection(settings: GranolaAdoraSettings): string {
    const slackPath = `${settings.baseFolderPath}/${settings.slackFolderName}`;
    return [
      "## Related Slack Messages\n",
      "```dataview",
      `TABLE channel as "Channel", source_type as "Type", timestamp as "Time"`,
      `FROM "${slackPath}"`,
      `WHERE contains(related_customers, this.file.name)`,
      "SORT timestamp DESC",
      "```\n",
    ].join("\n");
  }

  private buildHubSpotSection(settings: GranolaAdoraSettings): string {
    const hubspotPath = `${settings.baseFolderPath}/${settings.hubspotFolderName}`;
    return [
      "## Related HubSpot\n",
      "### Contacts",
      "```dataview",
      `TABLE email as "Email", lifecycle_stage as "Lifecycle", lead_status as "Lead Status"`,
      `FROM "${hubspotPath}/Contacts"`,
      `WHERE contains(related_customers, this.file.name)`,
      "SORT updated DESC",
      "```\n",
      "### Deals",
      "```dataview",
      `TABLE deal_stage as "Stage", amount as "Amount", close_date as "Close Date"`,
      `FROM "${hubspotPath}/Deals"`,
      `WHERE contains(related_customers, this.file.name)`,
      "SORT updated DESC",
      "```\n",
      "### Tickets",
      "```dataview",
      `TABLE priority as "Priority", pipeline_stage as "Pipeline Stage", updated as "Updated"`,
      `FROM "${hubspotPath}/Tickets"`,
      `WHERE contains(related_customers, this.file.name)`,
      "SORT updated DESC",
      "```\n",
    ].join("\n");
  }

  private async linkHubSpotContactToCustomers(
    contactFile: TFile,
    customerFiles: TFile[],
  ): Promise<number> {
    const fm = this.app.metadataCache.getFileCache(contactFile)?.frontmatter;
    if (!fm) return 0;

    const email = String(fm.email ?? "").toLowerCase();
    const company = String(fm.company ?? "").toLowerCase();
    const associatedCompanies = this.toStringArray(fm.associated_companies).map(
      (c) => c.toLowerCase(),
    );
    const emailDomain = email.includes("@") ? email.split("@")[1] : "";

    const matchedCustomers = customerFiles
      .map((file) => file.basename)
      .filter((customerName) => {
        const customer = customerName.toLowerCase();
        const compact = customer.replace(/[^a-z0-9]/g, "");
        const domainCompact = emailDomain.replace(/[^a-z0-9.]/g, "");
        return (
          (company && company.includes(customer)) ||
          associatedCompanies.some((name) => name.includes(customer)) ||
          (domainCompact && domainCompact.includes(compact))
        );
      });

    if (matchedCustomers.length === 0) return 0;

    let linked = 0;
    const content = await this.app.vault.read(contactFile);
    const updatedContact = this.upsertFrontmatterArrays(content, {
      related_customers: matchedCustomers,
    });
    if (updatedContact !== content) {
      await this.app.vault.modify(contactFile, updatedContact);
      linked++;
    }

    for (const customerName of matchedCustomers) {
      const customerFile = customerFiles.find((file) => file.basename === customerName);
      if (!customerFile) continue;
      const customerContent = await this.app.vault.read(customerFile);
      const updatedCustomer = this.upsertFrontmatterArrays(customerContent, {
        related_hubspot_contacts: [contactFile.basename],
      });
      if (updatedCustomer !== customerContent) {
        await this.app.vault.modify(customerFile, updatedCustomer);
        linked++;
      }
    }

    return linked;
  }

  private async linkHubSpotDealToCustomers(
    dealFile: TFile,
    customerFiles: TFile[],
  ): Promise<number> {
    const fm = this.app.metadataCache.getFileCache(dealFile)?.frontmatter;
    if (!fm) return 0;

    const relatedCompanies = this.toStringArray(fm.related_companies).map((c) =>
      c.toLowerCase(),
    );
    if (relatedCompanies.length === 0) return 0;

    const matchedCustomers = customerFiles
      .map((file) => file.basename)
      .filter((customerName) =>
        relatedCompanies.some((company) =>
          company.includes(customerName.toLowerCase()),
        ),
      );

    if (matchedCustomers.length === 0) return 0;

    let linked = 0;
    const content = await this.app.vault.read(dealFile);
    const updatedDeal = this.upsertFrontmatterArrays(content, {
      related_customers: matchedCustomers,
    });
    if (updatedDeal !== content) {
      await this.app.vault.modify(dealFile, updatedDeal);
      linked++;
    }

    for (const customerName of matchedCustomers) {
      const customerFile = customerFiles.find((file) => file.basename === customerName);
      if (!customerFile) continue;
      const customerContent = await this.app.vault.read(customerFile);
      const updatedCustomer = this.upsertFrontmatterArrays(customerContent, {
        related_hubspot_deals: [dealFile.basename],
      });
      if (updatedCustomer !== customerContent) {
        await this.app.vault.modify(customerFile, updatedCustomer);
        linked++;
      }
    }

    return linked;
  }

  private async linkHubSpotTicketToCustomers(
    ticketFile: TFile,
    customerFiles: TFile[],
  ): Promise<number> {
    const fm = this.app.metadataCache.getFileCache(ticketFile)?.frontmatter;
    if (!fm) return 0;

    const relatedCompanies = this.toStringArray(fm.related_companies).map((c) =>
      c.toLowerCase(),
    );
    if (relatedCompanies.length === 0) return 0;

    const matchedCustomers = customerFiles
      .map((file) => file.basename)
      .filter((customerName) =>
        relatedCompanies.some((company) =>
          company.includes(customerName.toLowerCase()),
        ),
      );

    if (matchedCustomers.length === 0) return 0;

    let linked = 0;
    const content = await this.app.vault.read(ticketFile);
    const updatedTicket = this.upsertFrontmatterArrays(content, {
      related_customers: matchedCustomers,
    });
    if (updatedTicket !== content) {
      await this.app.vault.modify(ticketFile, updatedTicket);
      linked++;
    }

    for (const customerName of matchedCustomers) {
      const customerFile = customerFiles.find((file) => file.basename === customerName);
      if (!customerFile) continue;
      const customerContent = await this.app.vault.read(customerFile);
      const updatedCustomer = this.upsertFrontmatterArrays(customerContent, {
        related_hubspot_tickets: [ticketFile.basename],
      });
      if (updatedCustomer !== customerContent) {
        await this.app.vault.modify(customerFile, updatedCustomer);
        linked++;
      }
    }

    return linked;
  }

  private async linkHubSpotMeetingToGranolaMeetings(
    hubspotMeetingFile: TFile,
    granolaMeetingFiles: TFile[],
  ): Promise<number> {
    const content = await this.app.vault.read(hubspotMeetingFile);
    const fm = this.app.metadataCache.getFileCache(hubspotMeetingFile)?.frontmatter;
    const contactEmails = this
      .toStringArray(fm?.contact_emails)
      .map((email) => email.toLowerCase());
    if (contactEmails.length === 0) return 0;

    const matchedMeetings: string[] = [];
    for (const granolaMeeting of granolaMeetingFiles) {
      const meetingContent = (await this.app.vault.read(granolaMeeting)).toLowerCase();
      if (contactEmails.some((email) => meetingContent.includes(email))) {
        matchedMeetings.push(granolaMeeting.basename);
      }
    }

    if (matchedMeetings.length === 0) return 0;

    let linked = 0;
    const updatedHubspot = this.upsertFrontmatterArrays(content, {
      related_meetings: matchedMeetings,
    });
    if (updatedHubspot !== content) {
      await this.app.vault.modify(hubspotMeetingFile, updatedHubspot);
      linked++;
    }

    for (const granolaMeeting of granolaMeetingFiles) {
      if (!matchedMeetings.includes(granolaMeeting.basename)) continue;
      const granolaContent = await this.app.vault.read(granolaMeeting);
      const updatedGranola = this.upsertFrontmatterArrays(granolaContent, {
        related_hubspot_meetings: [hubspotMeetingFile.basename],
      });
      if (updatedGranola !== granolaContent) {
        await this.app.vault.modify(granolaMeeting, updatedGranola);
        linked++;
      }
    }

    return linked;
  }

  private toStringArray(value: unknown): string[] {
    if (!value) return [];
    if (Array.isArray(value)) {
      return value.filter((item): item is string => typeof item === "string");
    }
    if (typeof value === "string") return [value];
    return [];
  }

  private insertBeforeUserContent(content: string, section: string): string {
    const marker = "<!-- user-content -->";
    const markerIdx = content.indexOf(marker);
    if (markerIdx !== -1) {
      return (
        content.substring(0, markerIdx) + section + content.substring(markerIdx)
      );
    }
    return content.trimEnd() + "\n\n" + section;
  }

  private upsertFrontmatterArrays(
    content: string,
    fields: Record<string, string[]>,
  ): string {
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!fmMatch) return content;

    let fmBody = fmMatch[1];
    const afterFm = content.substring(fmMatch[0].length);

    for (const [key, values] of Object.entries(fields)) {
      if (values.length === 0) continue;

      const escaped = values
        .map((v) => `  - "${v.replace(/"/g, '\\"')}"`)
        .join("\n");
      const newBlock = `${key}:\n${escaped}`;

      // Regex: match existing YAML array block to replace in-place
      const existingPattern = new RegExp(
        `^${key}:\\s*\\n(?:  - [^\\n]*\\n?)*`,
        "m",
      );
      if (existingPattern.test(fmBody)) {
        fmBody = fmBody.replace(existingPattern, newBlock + "\n");
      } else {
        fmBody = fmBody.trimEnd() + "\n" + newBlock;
      }
    }

    return `---\n${fmBody}\n---${afterFm}`;
  }
}

export function formatLinkResult(result: LinkResult): string {
  const parts: string[] = [];
  if (result.meetingsLinked > 0)
    parts.push(`${result.meetingsLinked} meetings linked`);
  if (result.issuesLinked > 0)
    parts.push(`${result.issuesLinked} issues linked`);
  if (result.designsLinked > 0)
    parts.push(`${result.designsLinked} customers enriched`);
  if (result.slackLinked > 0)
    parts.push(`${result.slackLinked} slack threads linked`);
  if (result.prsLinked > 0) parts.push(`${result.prsLinked} PRs linked`);
  if (result.hubspotLinked > 0)
    parts.push(`${result.hubspotLinked} HubSpot links`);
  return parts.length > 0
    ? `Linking: ${parts.join(", ")}`
    : "Linking: no new connections found";
}
