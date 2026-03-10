# PR Learning Canonical Schema

This document defines the canonical source taxonomy and normalized record shape for the PR learning automation system.

## Why

The current plugin already writes source-specific notes for:

- Linear issues/projects (`src/sync.ts:335-450`)
- Slack messages/support context (`src/sync.ts:669-705`)
- GitHub PRs (`src/sync.ts:725-817`)
- Customer-ask driven automation logs and issue creation (`src/main.ts:1842-1917`)

To learn across repos and systems, the automation layer needs a canonical model that preserves evidence and traceability without forcing every source into one source-native format.

## Source taxonomy

### Supported source systems

- github
- linear
- slack
- granola
- hubspot
- notion
- gdrive
- figma
- manual

### Supported canonical entity kinds

- pull_request
- issue
- project
- support_signal
- meeting
- incident
- learning
- recommendation
- hoverboard_proposal

### Current source-to-kind mapping

| Source | Canonical kinds |
|--------|-----------------|
| GitHub | `pull_request` |
| Linear | `issue`, `project`, `incident` |
| Slack | `support_signal`, `incident` |
| Granola | `meeting`, `learning` |
| HubSpot | `support_signal`, `incident` |
| Notion | `incident`, `learning`, `recommendation` |
| Google Drive | `learning` |
| Figma | `learning` |
| Manual/system-generated | `support_signal`, `incident`, `learning`, `recommendation`, `hoverboard_proposal` |

## Canonical record contract

Every canonical record must include:

- `canonicalId`: globally unique durable ID
- `sourceSystem`: origin system
- `entityKind`: normalized type
- `title`: short human-readable label
- `summary`: concise explanation of what happened / what this is
- `status`: current state in source or normalized workflow
- `updatedAt`: ISO timestamp
- `tags`: query-friendly taxonomy labels
- `relatedIds`: links to other canonical records
- `evidence[]`: one or more evidence pointers

Optional but commonly useful:

- `repo`: owning engineering repo
- `openedAt`: first seen / created timestamp

## Evidence pointer contract

Every evidence pointer should include:

- `sourceSystem`
- `entityKind`
- `externalId`
- `capturedAt`

Recommended when available:

- `obsidianPath`
- `url`
- `excerpt`

This is the minimum traceability requirement for recommendations.

## Specialized normalized records

### Incident

Additional required fields:

- `severity`
- `rootCauseCategory`
- `fixSummary`
- `learningSummary`

### Recommendation

Additional required fields:

- `recommendationKind` = `skill` | `command`
- `state` = `candidate` | `reviewing` | `approved` | `rejected` | `exported`
- `confidenceScore` in `[0,1]`
- `proposedDestination` = `hoverboard`
- non-empty `evidence[]`

## Mapping from current notes

### GitHub PR note → canonical `pull_request`

Current note fields include:

- `type: github-pr`
- `pr_number`
- `repo`
- `author`
- `state`
- `head_branch`
- `base_branch`
- `created`
- `updated`
- `html_url`
- `related_issues[]`

Canonical mapping:

- `canonicalId` = `github:{repo}:pr:{pr_number}`
- `sourceSystem` = `github`
- `entityKind` = `pull_request`
- `status` = `state`
- `repo` = `repo`
- `relatedIds[]` includes linked Linear issues when present
- `evidence[]` includes the PR URL and/or Obsidian note path

### Slack support note → canonical `support_signal`

Current note fields include:

- `type: slack-message`
- `source_type`
- `channel`
- `author`
- `timestamp`
- `permalink`
- `reactions[]`

Canonical mapping:

- `canonicalId` = stable Slack message ID / permalink-derived ID
- `sourceSystem` = `slack`
- `entityKind` = `support_signal`
- `status` = normalized triage state
- `evidence[]` includes permalink and Obsidian note path

### Linear issue note → canonical `issue`

Current note fields include:

- `type: linear-issue`
- `linear_id`
- `identifier`
- `title`
- `status`
- `priority`
- `assignee`
- `project`
- `labels[]`
- `created`
- `updated`

Canonical mapping:

- `canonicalId` = `linear:{identifier}`
- `sourceSystem` = `linear`
- `entityKind` = `issue`
- `status` = `status`
- `repo` comes from future repo-correlation layer or labels/project metadata
- `evidence[]` includes Linear URL and/or Obsidian note path

## Recommendation rule

A recommendation is invalid unless it contains evidence pointers back to source material.

That requirement exists so every proposed skill/command generated for hoverboard can be audited back to:

- the PR(s) it learned from
- the incident/support signal that motivated it
- the Obsidian notes from which it was derived
