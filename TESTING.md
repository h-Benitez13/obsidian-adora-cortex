# Manual testing in Obsidian

This checklist is for manual QA inside Obsidian after installing the plugin.

## Recommended test setup

Use a test vault with these conditions:

1. The plugin is enabled.
2. `Settings → Adora Cortex` is open in a second pane for quick toggles.
3. You have at least a few meeting notes, customer notes, and optionally synced Linear / Slack / GitHub / HubSpot content.
4. API keys are added only for the integrations you plan to validate.
5. If you are testing outbound flows, use a safe Slack channel and a test Notion destination.

## How to run a command in Obsidian

1. Press `Cmd/Ctrl+P`.
2. Type the command name exactly as shown below.
3. Press `Enter`.
4. Watch the notice popup and the target vault folder.

---

## 1. Startup, settings, and entry points

### 1. Sync on startup
- **Run**: Turn on `syncOnStartup`, reload Obsidian.
- **Expect**: A sync starts automatically after a short delay.

### 2. Auto-sync interval
- **Run**: Change `syncIntervalMinutes` to a small value like `1`, save settings, wait.
- **Expect**: Sync runs on the new interval, not the previous one.

### 3. Sync ribbon icon
- **Run**: Click the `Sync Cortex` ribbon icon.
- **Expect**: A sync notice appears and notes are created or updated.

### 4. Ask Adora ribbon icon
- **Run**: Click the `Ask Adora` ribbon icon.
- **Expect**: The Ask Adora view opens in the right sidebar.

### 5. Settings persistence
- **Run**: Change a folder name or toggle, reload the plugin.
- **Expect**: The saved value persists.

---

## 2. Sync engine

### 6. Core sync
- **Run**: `Sync meetings`
- **Expect**: Notes appear under `Adora/Meetings/` and the completion notice shows created or updated counts.

### 7. Shared docs sync toggle
- **Run**: Turn `syncSharedDocs` on, sync, then turn it off and sync again.
- **Expect**: Shared notes appear only when the toggle is enabled.

### 8. Workspace lists sync toggle
- **Run**: Turn `syncWorkspaceLists` on, sync.
- **Expect**: Workspace-list documents are imported and keep their list context.

### 9. Incremental sync
- **Run**: Sync twice in a row without changing source data.
- **Expect**: The second sync has few or no updates and does not duplicate notes.

### 10. Full re-sync
- **Run**: `Full re-sync (reset and re-import all)`
- **Expect**: Sync state resets and all supported content is rebuilt from source.

### 11. Sync in progress guard
- **Run**: Trigger sync twice quickly.
- **Expect**: The second attempt shows `Cortex: Sync already in progress.`

### 12. Auth failure path
- **Run**: Close or sign out of the Granola desktop session, then run sync.
- **Expect**: A friendly auth failure notice appears; the plugin does not crash.

### 13. Linear sync
- **Run**: Enable `syncLinear`, add a Linear API key, then sync.
- **Expect**: Issues and projects appear under `Adora/Linear/`.

### 14. Figma sync
- **Run**: Enable `syncFigma`, set token + team ID, then sync.
- **Expect**: Design reference notes appear under `Adora/Designs/`.

### 15. Slack sync
- **Run**: Enable `syncSlack`, add a Slack token, then sync.
- **Expect**: Slack notes appear under `Adora/Slack/`.

### 16. GitHub sync
- **Run**: Enable `syncGithub`, add token + org, optionally add a repo allowlist, then sync.
- **Expect**: PR notes appear under `Adora/GitHub/`, limited to allowed repos if configured.

### 17. Google Drive sync
- **Run**: Enable `syncGoogleDrive`, configure OAuth or access token + folder ID, then sync.
- **Expect**: Drive folders or shared-drive roots sync recursively under `Adora/Google Drive/`; Google Docs and text-friendly files become notes, and supported binary files sync with attachment notes.

### 18. HubSpot sync
- **Run**: Enable `syncHubspot`, add an access token, then sync.
- **Expect**: Contacts, companies, deals, meetings, and tickets appear under `Adora/HubSpot/`.

### 19. Missing credentials guardrails
- **Run**: Enable an integration but leave its credentials blank, then sync or run its related command.
- **Expect**: The plugin skips or blocks the action with a clear notice instead of failing silently.

### 20. Source sync budgets
- **Run**: Lower one of the `sourceSyncBudgets` values, sync against a larger data set.
- **Expect**: Only the allowed volume is processed in that run.

---

## 3. Ask Adora chat panel

### 21. Open panel command
- **Run**: `Open Ask Adora chat panel`
- **Expect**: The panel opens or focuses the existing one.

### 22. Send message command
- **Run**: Type a prompt in the panel and run `Ask Adora: Send message`.
- **Expect**: A new assistant response appears in the thread.

### 23. Clear conversation command
- **Run**: `Ask Adora: Clear conversation`
- **Expect**: The current thread is cleared.

### 24. Save conversation command
- **Run**: `Ask Adora: Save conversation`
- **Expect**: A conversation note is saved for later retrieval.

### 25. Start new conversation command
- **Run**: `Ask Adora: Start new conversation`
- **Expect**: The panel resets and focuses the prompt field.

### 26. Active note context option
- **Run**: In the panel, enable active note context and ask a question about the current note.
- **Expect**: The answer reflects that note's contents.

### 27. Recent meetings context option
- **Run**: Enable recent meetings context and ask for a recent summary.
- **Expect**: The answer references recent meeting content.

### 28. Recent digests context option
- **Run**: Enable recent digests context and ask for recent themes.
- **Expect**: The answer reflects digest content when available.

---

## 4. AI note-generation workflows

### 29. Prepare customer brief
- **Run**: `Prepare customer brief (AI)`, then enter a customer name from recent meetings.
- **Expect**: A prep brief note is created in `Adora/Customers/` and opened.

### 30. Weekly digest
- **Run**: `Generate weekly digest (AI)`
- **Expect**: `Adora/Digests/Week of YYYY-MM-DD.md` is created or updated.

### 31. Theme analysis
- **Run**: `Analyze meeting themes (AI)`
- **Expect**: `Adora/Digests/Theme Analysis — YYYY-MM-DD.md` is created or updated.

### 32. Top customer asks
- **Run**: `Extract top customer asks (AI)`
- **Expect**: `Adora/Digests/Customer Asks — YYYY-MM-DD.md` is created or updated.

### 33. Idea extraction
- **Run**: Open a source note and run `Extract ideas from current note (AI)`.
- **Expect**: An ideas note is written to `Adora/Ideas/`.

### 34. Release notes
- **Run**: `Generate release notes`
- **Expect**: `Adora/Releases/release-notes--YYYY-MM-DD.md` is created and opened.

### 35. AI disabled guardrail
- **Run**: Turn off `aiEnabled` or remove the Claude key, then run any AI command.
- **Expect**: A notice tells you to enable AI and add a Claude API key.

---

## 5. Decisions, linking, and health

### 36. Create idea from meeting
- **Run**: Open a meeting note, run `Create idea from meeting`, and complete the modal.
- **Expect**: A new idea note is created and opened.

### 37. Extract decisions from meeting
- **Run**: Open a meeting note under `Adora/Meetings/`, run `Extract decisions from meeting`, then save selected entries.
- **Expect**: One or more decision notes are created in `Adora/Decisions/`.

### 38. Manual decision logging
- **Run**: `Log a decision manually`, fill the modal, save.
- **Expect**: A decision note is created even without a source meeting.

### 39. Re-link all notes
- **Run**: `Re-link all notes (cross-integration)`
- **Expect**: Linking finishes successfully and references between related notes are refreshed.

### 40. Recalculate health scores
- **Run**: `Recalculate all customer health scores`
- **Expect**: Customer files are updated and the plugin shows `Health scores updated!`.

### 41. Health tier boundaries
- **Run**: Adjust `healthTierHealthyMin` and `healthTierAtRiskMin`, then recalculate.
- **Expect**: Customer `health_tier` values change consistently with the configured thresholds.

### 42. Health score weighting
- **Run**: Change weight settings, recalculate, compare the same customer note before and after.
- **Expect**: Health component values and final score react to the weight changes.

### 43. HubSpot-enriched health
- **Run**: Enable HubSpot sync, sync HubSpot data, then recalculate health.
- **Expect**: Tickets, deals, and lifecycle information influence score output.

---

## 6. Linear automation

### 44. Create Linear issues from decisions
- **Run**: `Create Linear issues from decisions`
- **Expect**: The first unlinked decision gets a new Linear issue, plus `linear_issue_id` and `linear_issue_url` frontmatter.

### 45. All decisions already linked
- **Run**: Re-run `Create Linear issues from decisions` after all decision notes have a Linear ID.
- **Expect**: The plugin shows `All decisions already have linked Linear issues.`

### 46. Auto-create Linear issues from customer asks
- **Run**: Enable `autoCreateLinearFromCustomerAsks`, sync fresh customer meetings, then sync again.
- **Expect**: Up to a few Linear issues are created automatically and logged.

### 47. Customer-ask dry run
- **Run**: Turn on `autoCreateLinearFromCustomerAsksDryRun`, sync recent customer meetings.
- **Expect**: No Linear issues are created; the plugin logs dry-run candidates instead.

### 48. Automation audit log
- **Run**: Trigger customer-ask creation or dry run.
- **Expect**: A log file appears under `Adora/Digests/Automation Logs/` with created, failed, or dry-run entries.

### 49. Duplicate prevention
- **Run**: Sync the same recent meetings twice with customer-ask automation enabled.
- **Expect**: The second run does not create duplicate issues for the same ask.

---

## 7. Outbound notifications

### 50. Post latest digest to Slack
- **Run**: Generate a weekly digest, then run `Post latest digest to Slack`.
- **Expect**: The latest weekly digest is sent to configured outbound channels and the plugin shows a result notice.

### 51. Post health alerts to Slack
- **Run**: Ensure some customer notes have health scores below the threshold, then run `Post customer health alerts to Slack`.
- **Expect**: Alert posts are sent only for qualifying customers.

### 52. Publish customer asks to Notion
- **Run**: Generate a customer asks report, then run `Publish customer asks to Notion`.
- **Expect**: The report is posted to the configured outbound destination and a result notice is shown.

### 53. Designated brain gating
- **Run**: Turn `outboundEnabled` on but leave `isDesignatedBrain` off, then generate a digest.
- **Expect**: Notes are created locally, but automatic outbound posting does not run.

### 54. Post-sync health alerts
- **Run**: Enable outbound + designated brain + Slack health alerts, then run sync.
- **Expect**: Post-sync health alert logic runs automatically when qualifying scores exist.

---

## 8. Review-loop workflows

### 55. Generate bot review summary
- **Run**: `Generate bot review summary`
- **Expect**: `Adora/Digests/bot-review-summary--YYYY-MM-DD.md` is created or updated.

### 56. Recommendation from active note
- **Run**: Open a note with recommendation frontmatter such as `title`, `summary`, `repo`, `recommendation_kind`, and `source_canonical_id`, then run `Generate bot recommendation from active note`.
- **Expect**: A queue note plus a Hoverboard proposal are created under `Adora/Recommendations/`.

### 57. Recommendation heuristic rejection
- **Run**: Open a candidate note that is intentionally missing key fields or has high-risk metadata, then run `Generate bot recommendation from active note`.
- **Expect**: The plugin shows `Recommendation blocked: ...` with the heuristic reason.

### 58. Recommendation artifact overwrite
- **Run**: Re-run `Generate bot recommendation from active note` on the same candidate note.
- **Expect**: Existing queue and proposal files are updated in place instead of duplicated.

### 59. Publish active incident to Notion
- **Run**: Open an incident note with required fields like `title`, `summary`, `repo`, `status`, `severity`, `root_cause_category`, `fix_summary`, and `learning_summary`, then run `Publish active incident to Notion`.
- **Expect**: Incident validation passes and the publish result notice is shown.

### 60. Incident validation failure
- **Run**: Remove one or more required incident fields and re-run `Publish active incident to Notion`.
- **Expect**: The plugin shows `Incident note is missing required fields: ...`.

---

## 9. Team onboarding flows

### 61. Export team config template
- **Run**: `Export team config template`
- **Expect**: `Adora/_setup/team-config.template.json` is created or updated with non-sensitive shared settings.

### 62. Import team config from active file
- **Run**: Open a team-config JSON file and run `Import team config from active file`.
- **Expect**: Shared settings are applied and the plugin asks you to add your own credentials.

### 63. Import from invalid file type
- **Run**: Open a non-JSON file and run `Import team config from active file`.
- **Expect**: The plugin shows `Active file must be a JSON file.`

### 64. Team one-step setup
- **Run**: Add `Adora/_setup/team-config.template.json` or open a config JSON file, then run `Team one-step setup (import + full sync)`.
- **Expect**: Config import, sync reset, sync, and linking all run in sequence.

### 65. Missing credentials warning during one-step setup
- **Run**: Use a shared config that enables integrations but omits credentials, then run one-step setup.
- **Expect**: The setup warns which integration credentials are still missing.

---

## 10. Filename, folder, and error-handling spot checks

### 66. Special characters in generated names
- **Run**: Use a meeting or customer title containing characters like `:` or `/`, then generate a derived note.
- **Expect**: The resulting filename is sanitized and still created successfully.

### 67. Empty-state digest generation
- **Run**: Run `Generate weekly digest (AI)` in a vault with no recent meetings.
- **Expect**: The plugin shows `No meetings found in the last 7 days.`

### 68. Empty-state health alerts
- **Run**: Run `Post customer health alerts to Slack` before any health scores exist.
- **Expect**: The plugin shows `No health scores found. Run 'Recalculate health scores' first.`

### 69. Empty-state outbound publish
- **Run**: Run `Post latest digest to Slack` or `Publish customer asks to Notion` before generating source notes.
- **Expect**: The plugin tells you to generate the source artifact first.

### 70. Plugin unload / reload
- **Run**: Disable and re-enable the plugin.
- **Expect**: The Ask Adora view detaches cleanly and the plugin restarts without stale timers or duplicated ribbon actions.

---

## Suggested smoke test before shipping

If you only have 10 minutes, run these in order:

1. `Sync meetings`
2. `Open Ask Adora chat panel`
3. `Generate weekly digest (AI)`
4. `Analyze meeting themes (AI)`
5. `Extract top customer asks (AI)`
6. `Re-link all notes (cross-integration)`
7. `Recalculate all customer health scores`
8. `Generate bot review summary`
9. `Generate bot recommendation from active note` using a known-good fixture note
10. `Export team config template`

That smoke pass covers sync, chat, AI generation, vault writes, review workflows, and onboarding output.
