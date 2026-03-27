# Adora Cortex

Obsidian plugin that syncs company context into a local vault and turns it into a shared knowledge system for meetings, customers, product asks, and engineering activity.

## What it syncs

- Granola meetings (owned + shared + workspace lists)
- Linear issues/projects
- Figma files
- Slack highlights
- GitHub pull requests
- Google Drive folders, files, and shared-drive roots (recursively from one configured ID)

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

## Manual testing in Obsidian

Use a disposable vault or a copy of your team vault when running these checks. For the most reliable pass:

1. Enable the plugin.
2. Open **Settings → Adora Cortex** and fill in only the integrations you want to test.
3. Open the **Command palette** with `Cmd/Ctrl+P`.
4. Run the command listed below.
5. Confirm the notice text, created note, or outbound side effect matches the expected result.

For the expanded checklist, edge cases, and settings validation, see [`TESTING.md`](./TESTING.md).

### UI entry points

| Test | How to run it | Expected output |
| --- | --- | --- |
| Sync ribbon | Click the `Sync Cortex` ribbon icon | Notice starts with `Cortex: Starting sync...`, then a completion notice with created/updated counts. |
| Ask Adora ribbon | Click the `Ask Adora` ribbon icon | The Ask Adora side panel opens on the right. |

### Ask Adora commands

| Test | How to run it | Expected output |
| --- | --- | --- |
| Open chat panel | Run `Open Ask Adora chat panel` | Ask Adora panel opens or focuses the existing panel. |
| Send message | Type a prompt in the panel, then run `Ask Adora: Send message` | A new assistant reply appears in the conversation. |
| Clear conversation | Run `Ask Adora: Clear conversation` | Current conversation is cleared from the panel. |
| Save conversation | Run `Ask Adora: Save conversation` | Conversation is saved to a note and can be re-opened later. |
| Start new conversation | Run `Ask Adora: Start new conversation` | Panel resets to a fresh thread and focuses the input. |

### Core sync and AI workflows

| Test | How to run it | Expected output |
| --- | --- | --- |
| Sync meetings | Run `Sync meetings` | Meeting notes are created or updated under `Adora/Meetings/`. |
| Full re-sync | Run `Full re-sync (reset and re-import all)` | Sync state resets, then all eligible content is re-imported without duplicate note trees. |
| Create idea from meeting | Open a meeting note, run `Create idea from meeting`, complete the modal | An idea note is created under `Adora/Ideas/` and opened. |
| Prepare customer brief | Run `Prepare customer brief (AI)`, enter a customer name in the modal | A prep brief note is created under `Adora/Customers/` and opened. |
| Weekly digest | Run `Generate weekly digest (AI)` | `Adora/Digests/Week of YYYY-MM-DD.md` is created or updated. |
| Theme analysis | Run `Analyze meeting themes (AI)` | `Adora/Digests/Theme Analysis — YYYY-MM-DD.md` is created or updated. |
| Top customer asks | Run `Extract top customer asks (AI)` | `Adora/Digests/Customer Asks — YYYY-MM-DD.md` is created or updated. |
| Extract ideas from note | Open any source note, run `Extract ideas from current note (AI)` | A generated ideas note appears in `Adora/Ideas/`. |
| Re-link notes | Run `Re-link all notes (cross-integration)` | Completion notice shows linking results across synced content. |
| Recalculate health | Run `Recalculate all customer health scores` | Customer notes get updated health frontmatter and the plugin shows `Health scores updated!`. |
| Generate release notes | Run `Generate release notes` | `Adora/Releases/release-notes--YYYY-MM-DD.md` is created and opened. |

### Decisions, Linear, and outbound actions

| Test | How to run it | Expected output |
| --- | --- | --- |
| Extract decisions from meeting | Open a meeting note in `Adora/Meetings/`, run `Extract decisions from meeting`, confirm entries in the modal | Decision notes are written to `Adora/Decisions/`. |
| Log a decision manually | Run `Log a decision manually`, fill the modal, save | A manual decision note is created in `Adora/Decisions/`. |
| Create Linear issues from decisions | Run `Create Linear issues from decisions` | One unlinked decision gets a new `linear_issue_id` and `linear_issue_url` in frontmatter. |
| Create Linear issues from recent customer asks | Run `Create Linear issues from recent customer asks` after generating a recent asks report | Linear issue creation or dry-run logging occurs based on settings. |
| Post latest digest to Slack | Run `Post latest digest to Slack` | A digest is posted to configured outbound channels and the result notice is shown. |
| Post health alerts to Slack | Run `Post customer health alerts to Slack` | Low-health customers trigger outbound alerts and a result notice is shown. |
| Publish customer asks to Notion | Run `Publish customer asks to Notion` | The latest customer asks report is published and the result notice is shown. |

### Review-loop and onboarding workflows

| Test | How to run it | Expected output |
| --- | --- | --- |
| Generate bot review summary | Run `Generate bot review summary` | `Adora/Digests/bot-review-summary--YYYY-MM-DD.md` is created or updated. |
| Generate bot recommendation from active note | Open a candidate note with the required frontmatter, then run `Generate bot recommendation from active note` | A queue note plus a Hoverboard proposal are created under `Adora/Recommendations/`. |
| Publish active incident to Notion | Open a valid incident note, run `Publish active incident to Notion` | Incident validation passes and the publish result notice is shown. |
| Export team config template | Run `Export team config template` | `Adora/_setup/team-config.template.json` is created or updated. |
| Import team config from active file | Open a shared team JSON file, run `Import team config from active file` | Shared settings are applied and a success notice is shown. |
| Team one-step setup | Open or add `Adora/_setup/team-config.template.json`, then run `Team one-step setup (import + full sync)` | Settings import, sync reset, full sync, and re-linking all complete in sequence. |

### High-value edge cases to spot-check

- **AI disabled**: run any AI command with `aiEnabled` off and expect a notice telling you to enable AI and add a Claude API key.
- **Linear not configured**: run a Linear workflow without a key and expect a configuration notice instead of a crash.
- **No active note**: run an active-note workflow with no note open and expect a clear guardrail notice.
- **Missing source data**: run digest, asks, or outbound workflows with no source notes and expect a friendly `Generate one first`-style message.
- **Duplicate prevention**: run outbound or auto-ticket workflows twice and confirm they do not create duplicate issues or notifications.

## Docs

- MCP setup and central-brain workflow: `docs/mcp-setup.md`
- Perplexity home MCP setup: `docs/perplexity-obsidian-home-setup.md`
- Full manual QA checklist: `TESTING.md`
- Team vault starter template: `templates/vault-template/`
- Shared config template: `templates/team-config.template.json`
