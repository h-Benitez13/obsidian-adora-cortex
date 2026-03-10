# Source Registry and Sync Checkpoints

This module adds a grouped configuration layer for source sync behavior.

## What it introduces

- `githubRepoAllowlist`: optional list of `repo` or `owner/repo` entries
- `sourceSyncBudgets`: grouped per-source execution budgets
- `sourceSyncCheckpoints`: grouped runtime state for incremental sync

## Why

The previous sync flow assumed one GitHub org-wide pull request scan every run.

That works for small scope, but it does not scale well to:

- many engineering repos
- repeated syncs with mostly unchanged PRs
- future cross-source correlation passes

## Budget model

Each source now has grouped limits:

- `maxContainersPerRun`
- `maxItemsPerContainer`
- `maxItemsPerRun`

For GitHub, "container" means repository and "item" means PR.

## Incremental checkpoint model

Each source keeps:

- `lastSuccessfulSyncAt`
- `cursors`
- `entityUpdatedAt`

For GitHub, `entityUpdatedAt` currently stores the latest processed `updatedAt`
value per repo key such as `repo:adora/web`.

## Current integration

The GitHub PR sync path now:

1. builds a source registry entry
2. filters repos through the allowlist (if provided)
3. limits repo count via budgets
4. skips unchanged PRs using per-repo checkpoints
5. caps per-repo and total PR processing via budgets

This keeps the design additive while providing a reusable pattern for future
source inventory and incremental sync work.
