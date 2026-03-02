import { TFile } from "obsidian";
import { HealthScore, WorkspaceMember } from "./types";

function escapeYaml(input: string): string {
  return input.replace(/"/g, '\\"').replace(/\n/g, " ");
}

export function generateCustomer360(
  customerName: string,
  meetingsFolderPath: string,
  _baseFolderPath: string,
): string {
  const now = new Date().toISOString();
  const escaped = escapeYaml(customerName);

  const fm = [
    "---",
    `type: "customer-360"`,
    `company: "${escaped}"`,
    `created: "${now}"`,
    `updated: "${now}"`,
    `tags:`,
    `  - "customer"`,
    `  - "customer-360"`,
    "---",
  ];

  const body = [
    `\n# ${customerName}\n`,
    "## Overview\n",
    "*Add customer details, context, and strategic notes here.*\n",
    "## Key Contacts\n",
    "```dataview",
    "LIST DISTINCT people",
    `FROM "${meetingsFolderPath}"`,
    `WHERE contains(customers, "${escaped}")`,
    "FLATTEN people",
    "```\n",
    "## Meeting History\n",
    "```dataview",
    `TABLE date as "Date", owner as "Owner", people as "Attendees"`,
    `FROM "${meetingsFolderPath}"`,
    `WHERE contains(customers, "${escaped}")`,
    "SORT date DESC",
    "```\n",
    "## Feedback & Requests\n",
    "- \n",
    "<!-- user-content -->",
    "",
  ];

  return [...fm, ...body].join("\n");
}

// ── Health Score ──

function capitalizeTier(tier: string): string {
  return tier
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("-");
}

function buildHealthScoreSection(health: HealthScore): string {
  const tier = capitalizeTier(health.tier);
  const lines = [
    `## Health Score: ${health.score}/100 (${tier})`,
    "",
    "| Metric | Value |",
    "| --- | --- |",
    `| Meeting Frequency (30d) | ${health.meeting_frequency} meetings |`,
    `| Open Issues | ${health.open_issues} issues |`,
  ];
  if (health.sentiment !== undefined) {
    lines.push(`| AI Sentiment | ${health.sentiment}/100 |`);
  }
  lines.push(`| Last Calculated | ${health.last_calculated.split("T")[0]} |`);
  lines.push("");
  return lines.join("\n");
}

export function calculateHealthScore(
  customerName: string,
  meetings: TFile[],
  issues: TFile[],
  sentimentScore?: number,
): HealthScore {
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const customerLower = customerName.toLowerCase();

  const recentCustomerMeetings = meetings.filter(
    (m) =>
      m.stat.mtime > thirtyDaysAgo &&
      m.basename.toLowerCase().includes(customerLower),
  );
  const meetingCount = recentCustomerMeetings.length;
  const meetingFrequencyScore = Math.min(meetingCount / 4, 1) * 100;

  const customerIssues = issues.filter((i) =>
    i.basename.toLowerCase().includes(customerLower),
  );
  const issueCount = customerIssues.length;
  const issuesScore = Math.max(0, 100 - issueCount * 10);

  let score: number;
  if (sentimentScore !== undefined) {
    score = Math.round(
      meetingFrequencyScore * 0.33 + issuesScore * 0.33 + sentimentScore * 0.34,
    );
  } else {
    score = Math.round(meetingFrequencyScore * 0.5 + issuesScore * 0.5);
  }

  const tier: HealthScore["tier"] =
    score >= 70 ? "healthy" : score >= 40 ? "at-risk" : "critical";

  return {
    score,
    tier,
    meeting_frequency: meetingCount,
    open_issues: issueCount,
    sentiment: sentimentScore,
    last_calculated: new Date().toISOString(),
  };
}

export function updateHealthScoreInContent(
  content: string,
  health: HealthScore,
): string {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (fmMatch) {
    const fmLines = fmMatch[1]
      .split("\n")
      .filter(
        (line) =>
          !line.startsWith("health_score:") &&
          !line.startsWith("health_tier:") &&
          !line.startsWith("health_last_calculated:"),
      );
    fmLines.push(`health_score: ${health.score}`);
    fmLines.push(`health_tier: "${health.tier}"`);
    fmLines.push(`health_last_calculated: "${health.last_calculated}"`);
    content =
      "---\n" +
      fmLines.join("\n") +
      "\n---" +
      content.substring(fmMatch[0].length);
  }

  const healthSection = buildHealthScoreSection(health);
  const lines = content.split("\n");
  const healthIdx = lines.findIndex((l) => l.startsWith("## Health Score:"));

  if (healthIdx !== -1) {
    let endIdx = healthIdx + 1;
    while (endIdx < lines.length) {
      if (
        lines[endIdx].startsWith("## ") ||
        lines[endIdx].includes("<!-- user-content -->")
      ) {
        break;
      }
      endIdx++;
    }
    const before = lines.slice(0, healthIdx);
    const after = lines.slice(endIdx);
    return [...before, healthSection, ...after].join("\n");
  }

  const markerIdx = lines.findIndex((l) => l.includes("<!-- user-content -->"));
  if (markerIdx !== -1) {
    const before = lines.slice(0, markerIdx);
    const after = lines.slice(markerIdx);
    return [...before, healthSection, ...after].join("\n");
  }

  return content.trimEnd() + "\n\n" + healthSection;
}

export function generateTeamProfile(
  member: WorkspaceMember,
  _baseFolderPath: string,
  meetingsFolderPath: string,
): string {
  const escaped = escapeYaml(member.name);

  const fm = [
    "---",
    `type: "team-member"`,
    `name: "${escaped}"`,
    `email: "${escapeYaml(member.email)}"`,
    `role: "${escapeYaml(member.role)}"`,
    `note_count: ${member.note_count}`,
    `tags:`,
    `  - "team"`,
    `  - "people"`,
    "---",
  ];

  const body = [
    `\n# ${member.name}\n`,
    "## Role\n",
    `**${member.role}** — ${member.email}\n`,
    "## Recent Meetings\n",
    "```dataview",
    `TABLE date as "Date", title as "Meeting", customers as "Customers"`,
    `FROM "${meetingsFolderPath}"`,
    `WHERE contains(people, "${escaped}") OR owner = "${escaped}"`,
    "SORT date DESC",
    "LIMIT 20",
    "```\n",
    "## Customers\n",
    "```dataview",
    "LIST DISTINCT customers",
    `FROM "${meetingsFolderPath}"`,
    `WHERE contains(people, "${escaped}") OR owner = "${escaped}"`,
    "FLATTEN customers",
    "```\n",
    "<!-- user-content -->",
    "",
  ];

  return [...fm, ...body].join("\n");
}
