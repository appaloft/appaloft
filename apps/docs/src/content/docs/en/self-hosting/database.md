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

<h2 id="self-hosting-database-state">Database state</h2>

Appaloft can use local-first state or a self-hosted database. Users need to understand state ownership, backup, and migration windows.

<h2 id="self-hosting-database-backup">Backup</h2>

Backups should include control-plane state, deployment history, and required configuration snapshots without exporting plaintext secrets.
