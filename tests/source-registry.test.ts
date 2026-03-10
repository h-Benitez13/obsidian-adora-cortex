import { describe, expect, it } from "vitest";

import { GitHubRepo } from "../src/github";
import {
  buildSourceRegistry,
  createEmptySourceSyncCheckpoint,
  mergeLatestUpdatedAt,
  parseGitHubRepoAllowlist,
  selectGitHubReposForSync,
  shouldProcessEntityByUpdatedAt,
} from "../src/source-registry";
import { DEFAULT_SETTINGS, GranolaAdoraSettings } from "../src/types";

function createSettings(
  overrides: Partial<GranolaAdoraSettings> = {},
): GranolaAdoraSettings {
  return {
    ...DEFAULT_SETTINGS,
    sourceSyncBudgets: {
      ...DEFAULT_SETTINGS.sourceSyncBudgets,
      github: { maxContainersPerRun: 2, maxItemsPerContainer: 3, maxItemsPerRun: 4 },
    },
    sourceSyncCheckpoints: {},
    githubOrg: "adora",
    ...overrides,
  };
}

describe("source registry", () => {
  it("builds registry entries with default checkpoint scaffolding", () => {
    const settings = createSettings({ syncGithub: true });

    const registry = buildSourceRegistry(settings);

    expect(registry.github.enabled).toBe(true);
    expect(registry.github.budget.maxContainersPerRun).toBe(2);
    expect(registry.github.checkpoint).toEqual(createEmptySourceSyncCheckpoint());
    expect(settings.sourceSyncCheckpoints.github).toBeDefined();
  });

  it("parses repo allowlist with and without owner prefixes", () => {
    expect(parseGitHubRepoAllowlist(["web", "other/iac"], "adora")).toEqual([
      { owner: "adora", repo: "web" },
      { owner: "other", repo: "iac" },
    ]);
  });

  it("filters github repos by allowlist and budget", () => {
    const repos: GitHubRepo[] = [
      {
        id: 1,
        name: "web",
        full_name: "adora/web",
        owner: { login: "adora" },
        archived: false,
        fork: false,
        html_url: "https://github.com/adora/web",
      },
      {
        id: 2,
        name: "delorean",
        full_name: "adora/delorean",
        owner: { login: "adora" },
        archived: false,
        fork: false,
        html_url: "https://github.com/adora/delorean",
      },
      {
        id: 3,
        name: "iac",
        full_name: "adora/iac",
        owner: { login: "adora" },
        archived: false,
        fork: false,
        html_url: "https://github.com/adora/iac",
      },
    ];

    const selected = selectGitHubReposForSync(
      repos,
      createSettings({ githubRepoAllowlist: ["web", "iac", "delorean"] }),
    );

    expect(selected.map((repo) => repo.name)).toEqual(["web", "delorean"]);
  });

  it("uses updated checkpoints to skip unchanged entities", () => {
    expect(
      shouldProcessEntityByUpdatedAt("2026-03-10T10:00:00.000Z", undefined),
    ).toBe(true);
    expect(
      shouldProcessEntityByUpdatedAt(
        "2026-03-10T10:00:00.000Z",
        "2026-03-10T09:00:00.000Z",
      ),
    ).toBe(true);
    expect(
      shouldProcessEntityByUpdatedAt(
        "2026-03-10T10:00:00.000Z",
        "2026-03-10T10:00:00.000Z",
      ),
    ).toBe(false);
  });

  it("tracks latest updated timestamp deterministically", () => {
    expect(
      mergeLatestUpdatedAt(
        "2026-03-10T10:00:00.000Z",
        "2026-03-10T11:00:00.000Z",
      ),
    ).toBe("2026-03-10T11:00:00.000Z");
    expect(
      mergeLatestUpdatedAt(
        "2026-03-10T11:00:00.000Z",
        "2026-03-10T10:00:00.000Z",
      ),
    ).toBe("2026-03-10T11:00:00.000Z");
  });
});
