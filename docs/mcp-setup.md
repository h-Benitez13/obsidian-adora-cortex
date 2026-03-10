# Obsidian MCP Setup

Use this setup when you want Obsidian to be the central context layer for Claude Desktop, Claude Code, Cursor, or any MCP-compatible client.

## 1) Install Obsidian Local REST API plugin

1. In Obsidian, install and enable **Local REST API** community plugin.
2. Generate an API key in the plugin settings.
3. Keep the default API port (`27123`) unless you already use it.

## 2) Install an Obsidian MCP server

Recommended server: `obsidian-mcp-server` (community TypeScript implementation).

```bash
npx -y obsidian-mcp-server
```

## 3) Add MCP server config to your client

Use this in your MCP client configuration (Claude Desktop / Cursor):

```json
{
  "mcpServers": {
    "obsidian": {
      "command": "npx",
      "args": ["-y", "obsidian-mcp-server"],
      "env": {
        "OBSIDIAN_API_KEY": "your_local_rest_api_key",
        "OBSIDIAN_API_PORT": "27123"
      }
    }
  }
}
```

## 4) Recommended operating model

- Keep this plugin as your **context ingestion pipeline** (Granola, Linear, Figma, Slack, GitHub, Google Drive).
- Use MCP clients as **context consumers** for open-ended questions and workflows.
- Keep repeatable routines inside Obsidian commands (`weekly digest`, `top customer asks`, etc.).

### What MCP clients can expect to find in the vault

Once this plugin is configured, MCP clients can search and read:

- synced meeting notes
- customer and people notes
- Linear issue/project notes
- GitHub PR notes
- Slack highlight notes
- generated digests, release notes, and customer ask reports
- decision logs and decision-linked Linear issue references
- recommendation queue notes
- hoverboard proposal notes
- automation logs

That makes Obsidian useful as both a memory layer and a review surface for agent workflows.

### Useful command-driven workflows in Obsidian

Important commands now available in the vault include:

- `Generate weekly digest (AI)`
- `Extract top customer asks (AI)`
- `Generate release notes`
- `Create Linear issues from decisions`
- `Create Linear issues from recent customer asks`
- `Generate bot review summary`
- `Generate bot recommendation from active note`
- `Publish active incident to Notion`

### Recommendation note contract

If you want MCP clients or humans to generate recommendation artifacts from a note, include frontmatter like:

- `repo`
- `summary`
- `recommendation_kind`
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

### Incident note contract

If you want to publish an active Obsidian note to the Notion incidents database, include fields like:

- `title`
- `summary`
- `repo`
- `status`
- `severity`
- `root_cause_category`
- `fix_summary`
- `learning_summary`

Optional evidence fields such as `source_url`, `evidence_urls`, and `related_ids` will also be carried into the resulting incident record.

## 5) Example prompts

- "Find the top 10 customer asks from the last 30 days across sales and CS meetings."
- "Summarize product risks mentioned by customers in the last two weeks."
- "List all open asks tied to Verizon and Servco with supporting note links."
