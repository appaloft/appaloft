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

The certificate retry scheduler is the default-on exception because it drains already accepted
managed certificate work that is in retry-scheduled state. Runtime execution, runtime prune,
history retention, monitoring collection, and preview cleanup workers stay disabled until an
operator explicitly enables the matching `APPALOFT_*_ENABLED` setting.

These runners do not discover new work outside Appaloft state. They only drain due task runs,
explicit runtime prune policies, retention defaults, monitoring targets with existing runtime
ownership, expired active preview environments, or cleanup attempts already marked for retry.

`appaloft doctor`, `GET /api/system/doctor`, and the Web Instance page report the configured
activation state, interval, batch settings, and safety mode for these workers without starting or
ticking them.

| Variable | Default | Meaning |
| --- | --- | --- |
| `APPALOFT_CERTIFICATE_RETRY_SCHEDULER_ENABLED` | `true` | Retries already accepted managed certificate issue/renew attempts that reached retry-scheduled state. |
| `APPALOFT_CERTIFICATE_RETRY_SCHEDULER_INTERVAL_SECONDS` | `300` | Poll interval for certificate retry. |
| `APPALOFT_CERTIFICATE_RETRY_DEFAULT_DELAY_SECONDS` | `300` | Default delay before retrying retryable certificate work. |
| `APPALOFT_CERTIFICATE_RETRY_SCHEDULER_BATCH_SIZE` | `25` | Maximum certificate retry attempts scanned per tick. |
| `APPALOFT_SCHEDULED_TASK_RUNNER_ENABLED` | `false` | Runs due Resource scheduled tasks. |
| `APPALOFT_SCHEDULED_TASK_RUNNER_INTERVAL_SECONDS` | `60` | Poll interval for scheduled tasks. |
| `APPALOFT_SCHEDULED_TASK_RUNNER_BATCH_SIZE` | `25` | Maximum scheduled task attempts scanned per tick. |
| `APPALOFT_SCHEDULED_RUNTIME_PRUNE_RUNNER_ENABLED` | `false` | Runs scheduled runtime capacity prune policies. |
| `APPALOFT_SCHEDULED_RUNTIME_PRUNE_RUNNER_INTERVAL_SECONDS` | `3600` | Poll interval for runtime capacity prune. |
| `APPALOFT_SCHEDULED_RUNTIME_PRUNE_RUNNER_BATCH_SIZE` | `25` | Maximum runtime prune policies scanned per tick. |
| `APPALOFT_SCHEDULED_DEPENDENCY_BACKUP_RUNNER_ENABLED` | `false` | Runs scheduled dependency backup policies. |
| `APPALOFT_SCHEDULED_DEPENDENCY_BACKUP_RUNNER_INTERVAL_SECONDS` | `3600` | Poll interval for dependency backup policies. |
| `APPALOFT_SCHEDULED_DEPENDENCY_BACKUP_RUNNER_BATCH_SIZE` | `25` | Maximum dependency backup policies scanned per tick. |
| `APPALOFT_SCHEDULED_HISTORY_RETENTION_RUNNER_ENABLED` | `false` | Runs retention defaults through existing history prune commands or governed retention stores. |
| `APPALOFT_SCHEDULED_HISTORY_RETENTION_RUNNER_INTERVAL_SECONDS` | `3600` | Poll interval for scheduled history retention. |
| `APPALOFT_SCHEDULED_HISTORY_RETENTION_RUNNER_BATCH_SIZE` | `25` | Maximum retention default policies scanned per tick. |
| `APPALOFT_RUNTIME_MONITORING_COLLECTOR_RUNNER_ENABLED` | `false` | Runs retained runtime monitoring sample collection; currently collects active servers and runtime-owning resources/deployments/projects/environments. |
| `APPALOFT_RUNTIME_MONITORING_COLLECTOR_RUNNER_INTERVAL_SECONDS` | `60` | Poll interval for the runtime monitoring collector. |
| `APPALOFT_RUNTIME_MONITORING_COLLECTOR_RUNNER_BATCH_SIZE` | `25` | Maximum runtime monitoring targets collected per tick. |
| `APPALOFT_TERMINAL_SESSION_ACTIVE_TTL_SECONDS` | `3600` | Activity-aware active terminal session age used by `terminal-session expire` when no explicit cutoff is supplied. |
| `APPALOFT_TERMINAL_SESSION_OUTPUT_RETENTION_BYTES` | `65536` | Bounded in-memory terminal output tail replayed only when an active terminal transport reconnects; `0` disables replay. |
| `APPALOFT_RUNTIME_MONITORING_RAW_RETENTION_HOURS` | `24` | Default retention hours for retained monitoring raw samples. |
| `APPALOFT_PREVIEW_EXPIRY_CLEANUP_SCHEDULER_ENABLED` | `false` | Scans expired active preview environments and dispatches cleanup through the preview cleanup boundary. |
| `APPALOFT_PREVIEW_EXPIRY_CLEANUP_SCHEDULER_INTERVAL_SECONDS` | `300` | Poll interval for expired preview cleanup scans. |
| `APPALOFT_PREVIEW_EXPIRY_CLEANUP_SCHEDULER_BATCH_SIZE` | `25` | Maximum expired active preview environments scanned per tick. |
| `APPALOFT_PREVIEW_CLEANUP_RETRY_SCHEDULER_ENABLED` | `false` | Retries preview cleanup attempts that were recorded as retry-scheduled. |
| `APPALOFT_PREVIEW_CLEANUP_RETRY_SCHEDULER_INTERVAL_SECONDS` | `300` | Poll interval for preview cleanup retries. |
| `APPALOFT_PREVIEW_CLEANUP_RETRY_SCHEDULER_BATCH_SIZE` | `25` | Maximum preview cleanup retry attempts scanned per tick. |
