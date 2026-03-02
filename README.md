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
