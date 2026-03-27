import * as fs from "fs";
import * as path from "path";
import { VaultAdapter } from "../src/vault-adapter";
import { GranolaApiClient } from "../src/api";
import { AutoTagger } from "../src/tagger";
import { SyncEngine, formatSyncResult } from "./sync-standalone";
import { AdoraCortexSettings, DEFAULT_SETTINGS } from "../src/types";

// ── Argument parsing ──

function parseArgs(): { vaultPath: string; configPath: string } {
  const args = process.argv.slice(2);
  let vaultPath = "";
  let configPath = "";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--vault" && args[i + 1]) {
      vaultPath = args[++i];
    } else if (args[i] === "--config" && args[i + 1]) {
      configPath = args[++i];
    } else if (args[i] === "--help" || args[i] === "-h") {
      console.log(`Usage: cortex-sync --vault /path/to/vault [--config /path/to/config.json]

Options:
  --vault   Path to your Obsidian vault directory (required)
  --config  Path to config JSON file (default: <vault>/.cortex-sync.json)
  --help    Show this help message
`);
      process.exit(0);
    }
  }

  if (!vaultPath) {
    console.error("Error: --vault is required. Run with --help for usage.");
    process.exit(1);
  }

  vaultPath = path.resolve(vaultPath);
  if (!fs.existsSync(vaultPath) || !fs.statSync(vaultPath).isDirectory()) {
    console.error(`Error: vault path does not exist or is not a directory: ${vaultPath}`);
    process.exit(1);
  }

  if (!configPath) {
    configPath = path.join(vaultPath, ".cortex-sync.json");
  } else {
    configPath = path.resolve(configPath);
  }

  return { vaultPath, configPath };
}

// ── Config loading ──

function loadConfig(configPath: string): Partial<AdoraCortexSettings> {
  if (!fs.existsSync(configPath)) {
    console.warn(`Config file not found at ${configPath}, using defaults.`);
    return {};
  }

  try {
    const raw = fs.readFileSync(configPath, "utf-8");
    return JSON.parse(raw);
  } catch (err) {
    console.error(`Error reading config file: ${err}`);
    process.exit(1);
  }
}

function applyEnvOverrides(settings: AdoraCortexSettings): void {
  const envMap: Record<string, keyof AdoraCortexSettings> = {
    CORTEX_LINEAR_API_KEY: "linearApiKey",
    CORTEX_GITHUB_TOKEN: "githubToken",
    CORTEX_SLACK_BOT_TOKEN: "slackBotToken",
    CORTEX_FIGMA_ACCESS_TOKEN: "figmaAccessToken",
    CORTEX_HUBSPOT_ACCESS_TOKEN: "hubspotAccessToken",
    CORTEX_CLAUDE_API_KEY: "claudeApiKey",
    CORTEX_GOOGLE_DRIVE_CLIENT_ID: "googleDriveClientId",
    CORTEX_GOOGLE_DRIVE_CLIENT_SECRET: "googleDriveClientSecret",
    CORTEX_GOOGLE_DRIVE_REFRESH_TOKEN: "googleDriveRefreshToken",
  };

  for (const [envVar, settingsKey] of Object.entries(envMap)) {
    const value = process.env[envVar];
    if (value) {
      (settings as any)[settingsKey] = value;
    }
  }
}

function saveConfig(configPath: string, settings: AdoraCortexSettings): void {
  // Only persist sync-relevant mutable fields back to config
  const existing: Record<string, any> = fs.existsSync(configPath)
    ? JSON.parse(fs.readFileSync(configPath, "utf-8"))
    : {};

  // Update mutable sync state
  existing.lastSyncTimestamp = settings.lastSyncTimestamp;
  existing.syncedDocIds = settings.syncedDocIds;
  existing.sourceSyncCheckpoints = settings.sourceSyncCheckpoints;
  if (settings.googleDriveAccessToken) {
    existing.googleDriveAccessToken = settings.googleDriveAccessToken;
  }

  fs.writeFileSync(configPath, JSON.stringify(existing, null, 2) + "\n", "utf-8");
}

// ── Main ──

async function main(): Promise<void> {
  const { vaultPath, configPath } = parseArgs();

  console.log(`Vault:  ${vaultPath}`);
  console.log(`Config: ${configPath}`);

  // Build settings: defaults → config file → env vars
  const fileConfig = loadConfig(configPath);
  const settings: AdoraCortexSettings = { ...DEFAULT_SETTINGS, ...fileConfig };
  applyEnvOverrides(settings);

  // Create dependencies
  const vault = new VaultAdapter(vaultPath);
  const api = new GranolaApiClient();
  const tagger = new AutoTagger(settings.knownCustomers, settings.knownTopics);

  const getSettings = () => settings;
  const saveSettings = async () => {
    saveConfig(configPath, settings);
  };

  // Authenticate with Granola (reads local token from Granola desktop app)
  const authenticated = await api.ensureAuthenticated();
  if (!authenticated) {
    console.warn("Warning: Granola auth failed. Meeting sync will be skipped.");
    console.warn("Make sure the Granola desktop app is installed and signed in.");
  }

  const engine = new SyncEngine(vault, api, tagger, getSettings, saveSettings);

  console.log("Starting sync...");
  const startTime = Date.now();

  try {
    const result = await engine.sync();
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n${formatSyncResult(result)} (${elapsed}s)`);

    if (result.errors.length > 0) {
      console.error("\nErrors:");
      for (const err of result.errors) {
        console.error(`  - ${err}`);
      }
    }

    process.exit(result.errors.length > 0 ? 1 : 0);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`\nFatal sync error: ${message}`);
    process.exit(1);
  }
}

main();
