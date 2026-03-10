import { GitHubRepo } from "./github";
import {
  GranolaAdoraSettings,
  SourceSyncBudget,
  SourceSyncCheckpoint,
} from "./types";

export type SourceRegistryKey =
  | "granola"
  | "linear"
  | "slack"
  | "github"
  | "gdrive"
  | "hubspot"
  | "notion";

export interface GitHubRepoTarget {
  owner: string;
  repo: string;
}

export interface SourceRegistryEntry {
  key: SourceRegistryKey;
  enabled: boolean;
  folderName?: string;
  budget: SourceSyncBudget;
  checkpoint: SourceSyncCheckpoint;
}

export const DEFAULT_SOURCE_SYNC_BUDGETS: Record<SourceRegistryKey, SourceSyncBudget> = {
  granola: { maxContainersPerRun: 50, maxItemsPerContainer: 100, maxItemsPerRun: 500 },
  linear: { maxContainersPerRun: 25, maxItemsPerContainer: 250, maxItemsPerRun: 1000 },
  slack: { maxContainersPerRun: 25, maxItemsPerContainer: 200, maxItemsPerRun: 1000 },
  github: { maxContainersPerRun: 20, maxItemsPerContainer: 100, maxItemsPerRun: 1000 },
  gdrive: { maxContainersPerRun: 10, maxItemsPerContainer: 100, maxItemsPerRun: 500 },
  hubspot: { maxContainersPerRun: 10, maxItemsPerContainer: 250, maxItemsPerRun: 1000 },
  notion: { maxContainersPerRun: 10, maxItemsPerContainer: 100, maxItemsPerRun: 500 },
};

export function createEmptySourceSyncCheckpoint(): SourceSyncCheckpoint {
  return {
    lastSuccessfulSyncAt: null,
    cursors: {},
    entityUpdatedAt: {},
  };
}

export function ensureSourceSyncBudget(
  settings: GranolaAdoraSettings,
  key: SourceRegistryKey,
): SourceSyncBudget {
  return settings.sourceSyncBudgets[key] ?? DEFAULT_SOURCE_SYNC_BUDGETS[key];
}

export function ensureSourceSyncCheckpoint(
  settings: GranolaAdoraSettings,
  key: SourceRegistryKey,
): SourceSyncCheckpoint {
  if (!settings.sourceSyncCheckpoints[key]) {
    settings.sourceSyncCheckpoints[key] = createEmptySourceSyncCheckpoint();
  }

  return settings.sourceSyncCheckpoints[key];
}

export function buildSourceRegistry(
  settings: GranolaAdoraSettings,
): Record<SourceRegistryKey, SourceRegistryEntry> {
  return {
    granola: {
      key: "granola",
      enabled: true,
      budget: ensureSourceSyncBudget(settings, "granola"),
      checkpoint: ensureSourceSyncCheckpoint(settings, "granola"),
    },
    linear: {
      key: "linear",
      enabled: settings.syncLinear,
      folderName: settings.linearFolderName,
      budget: ensureSourceSyncBudget(settings, "linear"),
      checkpoint: ensureSourceSyncCheckpoint(settings, "linear"),
    },
    slack: {
      key: "slack",
      enabled: settings.syncSlack,
      folderName: settings.slackFolderName,
      budget: ensureSourceSyncBudget(settings, "slack"),
      checkpoint: ensureSourceSyncCheckpoint(settings, "slack"),
    },
    github: {
      key: "github",
      enabled: settings.syncGithub,
      folderName: settings.githubFolderName,
      budget: ensureSourceSyncBudget(settings, "github"),
      checkpoint: ensureSourceSyncCheckpoint(settings, "github"),
    },
    gdrive: {
      key: "gdrive",
      enabled: settings.syncGoogleDrive,
      folderName: settings.googleDriveFolderName,
      budget: ensureSourceSyncBudget(settings, "gdrive"),
      checkpoint: ensureSourceSyncCheckpoint(settings, "gdrive"),
    },
    hubspot: {
      key: "hubspot",
      enabled: settings.syncHubspot,
      folderName: settings.hubspotFolderName,
      budget: ensureSourceSyncBudget(settings, "hubspot"),
      checkpoint: ensureSourceSyncCheckpoint(settings, "hubspot"),
    },
    notion: {
      key: "notion",
      enabled: settings.notifyNotionEnabled,
      budget: ensureSourceSyncBudget(settings, "notion"),
      checkpoint: ensureSourceSyncCheckpoint(settings, "notion"),
    },
  };
}

export function parseGitHubRepoAllowlist(
  repos: string[],
  fallbackOwner: string,
): GitHubRepoTarget[] {
  return repos
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .map((value) => {
      const [owner, repo] = value.includes("/")
        ? value.split("/", 2)
        : [fallbackOwner, value];

      return {
        owner: owner.trim(),
        repo: repo.trim(),
      };
    })
    .filter((target) => target.owner.length > 0 && target.repo.length > 0);
}

export function selectGitHubReposForSync(
  repos: GitHubRepo[],
  settings: GranolaAdoraSettings,
): GitHubRepo[] {
  const allowlist = parseGitHubRepoAllowlist(
    settings.githubRepoAllowlist,
    settings.githubOrg,
  );
  const selected =
    allowlist.length === 0
      ? repos
      : repos.filter((repo) =>
          allowlist.some(
            (target) =>
              target.owner.toLowerCase() === repo.owner.login.toLowerCase() &&
              target.repo.toLowerCase() === repo.name.toLowerCase(),
          ),
        );

  const budget = ensureSourceSyncBudget(settings, "github");
  return selected.slice(0, budget.maxContainersPerRun);
}

export function shouldProcessEntityByUpdatedAt(
  updatedAt: string,
  lastSeenUpdatedAt: string | undefined,
): boolean {
  if (!lastSeenUpdatedAt) return true;
  return updatedAt > lastSeenUpdatedAt;
}

export function mergeLatestUpdatedAt(
  current: string | undefined,
  candidate: string,
): string {
  if (!current || candidate > current) {
    return candidate;
  }
  return current;
}
