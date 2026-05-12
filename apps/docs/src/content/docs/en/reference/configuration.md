---
title: "Configuration reference"
description: "Entrypoint, environment variable, and static asset override reference."
docType: reference
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "configuration"
  - "environment variable"
  - "static assets"
  - "scheduled retention"
  - "scheduler"
relatedOperations: []
sidebar:
  label: "Configuration"
  order: 5
---

<h2 id="reference-runtime-configuration">Runtime configuration</h2>

Runtime configuration controls Appaloft serve, databases, static asset directories, and self-hosted behavior.

<h2 id="reference-docs-static-dir">Docs static directory</h2>

`APPALOFT_DOCS_STATIC_DIR` overrides public docs static assets without replacing the Web console.

<h2 id="reference-scheduled-workers">Scheduled workers</h2>

Scheduled workers are disabled by default unless noted otherwise. Enable them only on the instance
that should own the recurring work.

| Variable | Default | Meaning |
| --- | --- | --- |
| `APPALOFT_SCHEDULED_TASK_RUNNER_ENABLED` | `false` | Runs due Resource scheduled tasks. |
| `APPALOFT_SCHEDULED_TASK_RUNNER_INTERVAL_SECONDS` | `60` | Poll interval for scheduled tasks. |
| `APPALOFT_SCHEDULED_TASK_RUNNER_BATCH_SIZE` | `25` | Maximum scheduled task attempts scanned per tick. |
| `APPALOFT_SCHEDULED_RUNTIME_PRUNE_RUNNER_ENABLED` | `false` | Runs scheduled runtime capacity prune policies. |
| `APPALOFT_SCHEDULED_RUNTIME_PRUNE_RUNNER_INTERVAL_SECONDS` | `3600` | Poll interval for runtime capacity prune. |
| `APPALOFT_SCHEDULED_RUNTIME_PRUNE_RUNNER_BATCH_SIZE` | `25` | Maximum runtime prune policies scanned per tick. |
| `APPALOFT_SCHEDULED_HISTORY_RETENTION_RUNNER_ENABLED` | `false` | Runs retention defaults through existing history prune commands. |
| `APPALOFT_SCHEDULED_HISTORY_RETENTION_RUNNER_INTERVAL_SECONDS` | `3600` | Poll interval for scheduled history retention. |
