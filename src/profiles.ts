import { WorkspaceMember } from "./types";

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
