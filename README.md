# Obsidian Granola Adora

Obsidian plugin that syncs company context into a local vault and turns it into a shared knowledge system for meetings, customers, product asks, and engineering activity.

## What it syncs

- Granola meetings (owned + shared + workspace lists)
- Linear issues/projects
- Figma files
- Slack highlights
- GitHub pull requests
- Google Docs (from a configured Drive folder)

## AI workflows

- Customer prep brief
- Weekly digest
- Theme analysis
- Top customer asks (last 30 days)
- Idea extraction
- Release notes
- Decision extraction and logging
- Ask Adora chat panel (free-form Q&A)

## What becomes available in the vault

After sync and AI workflows, the vault can contain:

- Meetings and meeting-derived customer context
- Customer 360 notes and team profile notes
- Linear issues and projects
- GitHub pull request notes
- Slack highlight notes
- Figma and Google Drive reference notes
- Decision notes and decision-to-Linear issue links
- Weekly digests, theme analysis, release notes, and customer ask reports
- Automation logs under `Adora/Digests/Automation Logs/`
- Recommendation queue notes under `Adora/Recommendations/`
- Hoverboard proposal notes under `Adora/Recommendations/Hoverboard Proposals/`

## Command highlights

In addition to the sync and AI commands, the plugin now exposes workflows for:

- `Generate bot review summary`
- `Generate bot recommendation from active note`
- `Publish active incident to Notion`

These are intended to support the review loop for low-risk coding-bot learnings.

### Active note recommendation workflow

The `Generate bot recommendation from active note` command reads the active note and looks for frontmatter such as:

- `title`
- `summary`
- `repo`
- `recommendation_kind` (`skill` or `command`)
- `source_canonical_id`
- `related_ids`
- `changed_file_count`
- `affected_areas`
- `has_tests`
- `has_deterministic_verification`
- `required_context_available`
- `touches_infrastructure`
- `touches_auth`
- `touches_data_model`
- `repeated_pattern_count`
- `fix_type`
- optional `source_url` / `evidence_urls`

If the heuristic gate passes, the plugin can create:

- a recommendation queue note in Obsidian
- a hoverboard proposal note for review

### Incident publishing workflow

The `Publish active incident to Notion` command expects the active note to provide incident fields such as:

- `title`
- `summary`
- `repo`
- `status`
- `severity`
- `root_cause_category`
- `fix_summary`
- `learning_summary`
- optional `related_ids` and source/evidence URLs

The plugin validates these fields before publishing the incident into the configured Notion incidents database.

## Ask Adora chat panel

Open from command palette:

- `Open Ask Adora chat panel`

Or click the ribbon icon:

- `Ask Adora`

The panel supports free-form questions and can include:

- active note context
- recent meeting summaries
- recent AI digest summaries
- save current conversation
- load latest saved conversation
- load conversation from active note

## Team onboarding

1. Open plugin settings.
2. Run `Export team config template` once in a configured vault.
3. Share `Adora/_setup/team-config.template.json` internally.
4. New teammates open that JSON file and run `Import team config from active file`.
5. Each teammate adds their own API keys/tokens.

### One-step onboarding command

Use command palette:

- `Team one-step setup (import + full sync)`

What it does:

1. Loads team config from `Adora/_setup/team-config.template.json` (or active JSON file).
2. Imports shared non-sensitive settings.
3. Resets sync state.
4. Runs full sync.
5. Runs cross-linking pass.

## Docs

- MCP setup and central-brain workflow: `docs/mcp-setup.md`
- Team vault starter template: `templates/vault-template/`
- Shared config template: `templates/team-config.template.json`
