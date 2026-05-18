---
title: "Database"
description: "Understand local-first and self-hosted database state."
docType: reference
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "database"
  - "pglite"
  - "postgres"
relatedOperations: []
sidebar:
  label: "Database"
  order: 3
---

## Database state [#self-hosting-database-state]

Appaloft can use local-first state or a self-hosted database. Users need to understand state ownership, backup, and migration windows.

The database stores control-plane state: projects, environments, deployment records, resource status, run history, and configuration snapshots. Application source and build artifacts should not exist only in the database; they should remain reachable from source control, artifacts, or the runtime target.

| Mode | Use it for | Operations focus |
| --- | --- | --- |
| Local-first state | Single-machine use, local trials, portable installs | Back up the local data directory and stop writes before upgrades. |
| Self-hosted database | Shared teams, long-lived instances, server deployments | Monitor connections, disk, backups, migration windows, and restore drills. |

> Note: Secret values should not appear in plaintext backups, diagnostic summaries, or exported state files. When testing recovery, verify that secret references still work after restore instead of exporting the secrets themselves.

## Backup [#self-hosting-database-backup]

Backups should include control-plane state, deployment history, and required configuration snapshots without exporting plaintext secrets.

Keep at least one pre-upgrade backup and one recent automated backup. A restore drill should prove that Appaloft starts, users can sign in, projects list correctly, and deployment history opens. Copying the database file is not enough by itself.

## Check before upgrade [step]

Confirm the current version, target version, database connection, and migration window. Take a restorable backup before upgrading, and pause automation that would create new deployment records.

## Run migrations [step]

Run migrations during the maintenance window, then watch migration logs and Appaloft startup status. Do not switch databases, upgrade Appaloft, and rebuild the server at the same time.

## Verify restore [step]

After upgrade, check the project list, recent deployments, environment snapshots, log entrypoints, and access URL status. Pick one recent deployment and confirm that its status and diagnostic summary still open.
