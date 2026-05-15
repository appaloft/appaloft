---
title: "Errors and statuses"
description: "User-visible errors, phases, and status values."
docType: reference
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "error"
  - "status"
  - "phase"
relatedOperations:
  - operator-work.list
  - operator-work.show
  - audit-events.list
  - audit-events.show
  - audit-events.export
  - audit-events.export-global
sidebar:
  label: "Errors and statuses"
  order: 4
---

<h2 id="reference-error-shape">Error shape</h2>

User-visible errors should include stable code, category, phase, and actionable recovery guidance.

<h2 id="error-knowledge-contract">Error Knowledge Contract</h2>

Appaloft errors should not collapse to a message string. Public entrypoints should preserve stable `code`, `category`, `phase`, `retryable`, safe details, and known error knowledge:

- `responsibility`: whether the failure mainly belongs to the user, operator, system, provider, or Appaloft.
- `actionability`: whether callers should fix input, wait and retry, run diagnostics, rely on automatic recovery, report a bug, or take no user action.
- `links`: human public docs, agent-readable guides, related specs, runbooks, or source symbols.
- `remedies`: recovery actions that are safe to show or suggest.

Web, CLI, HTTP/API, and future MCP tools should render errors from those fields instead of branching on message text.

<h2 id="operator-work-ledger">Operator work ledger</h2>

When deployment, proxy bootstrap, certificate, or remote-state background work does not finish as expected, inspect the work ledger before guessing which recovery command to run:

```bash title="View background work"
appaloft work list
appaloft work show <workId>
```

The work ledger is read-only. It summarizes attempt kind, status, phase, related resource/server/deployment/certificate ids, stable error code/category, retriability, and safe `nextActions`. `diagnostic` means run a diagnostic first; `manual-review` means an operator should inspect the item; `retry` only means a future recovery command may consider retrying, and the query itself will not execute a retry; `no-action` means the item does not currently require user action.

This entrypoint does not retry, cancel, recover, dead-letter, delete, or prune anything. Recovery, cleanup, and retry capabilities are exposed through separate explicit commands so viewing status cannot accidentally mutate runtime or remote SSH state.

<h2 id="operator-audit-events">Audit events</h2>

When you need to explain historical changes for one resource, server, certificate, or other object, inspect retained audit events by aggregate id:

```bash title="View audit events"
appaloft audit-event list --aggregate <aggregateId>
appaloft audit-event show <auditEventId> --aggregate <aggregateId>
```

Audit event queries are read-only. The list returns only event id, aggregate id, event type, and creation time. Detail returns a safe payload and marks masked fields in `redactedFields`. Private keys, tokens, secrets, environment values, certificate material, signatures, credential payloads, and complex provider/native payloads are not returned raw.

For a bounded copy-safe export before prune or delete review, export one aggregate:

```bash title="Export redacted audit events"
appaloft audit-event export --aggregate <aggregateId> --limit 100
```

For incident triage or support handoff across aggregates, use a required time window:

```bash title="Export a bounded global audit window"
appaloft audit-event export-global --from 2026-01-01T00:00:00.000Z --to 2026-01-02T00:00:00.000Z --limit 100
```

Global export is still bounded, redacted, and read-only. It is not a legal hold, immutable archive, replay source, organization retention default, or scheduled retention policy. Reading or exporting audit events does not delete history, clean runtime state, recover state, or trigger retries.

Use a legal hold when old retained audit rows must survive destructive prune during support, incident, or compliance review:

```bash title="Hold and release audit rows"
appaloft audit-event legal-hold configure --aggregate <aggregateId> --reason "support review"
appaloft audit-event legal-hold list --status active
appaloft audit-event legal-hold release <holdId> --reason "review complete"
```

Legal holds are retention blockers, not immutable archives or discovery workflows. `appaloft audit-event prune` reports held rows and skips rows matched by active holds until every matching hold is released.

<h2 id="operator-provider-job-logs">Provider job logs</h2>

Provider job logs are retained separately from deployment rows and embedded deployment logs. Run a dry-run before destructive cleanup:

```bash title="Dry-run provider job log retention"
appaloft provider-job-log prune --before 2026-01-01T00:00:00.000Z
```

Narrow the scope when needed:

```bash title="Prune one provider scope"
appaloft provider-job-log prune --before 2026-01-01T00:00:00.000Z --provider generic-ssh --dry-run false
```

The command deletes only `provider_job_logs` rows older than the cutoff when `--dry-run false` is explicit. It does not delete deployment rows, embedded deployment logs, runtime logs, audit rows, events, process attempts, snapshots, runtime artifacts, provider resources, or business state.

<h2 id="operator-retention-defaults">Organization retention defaults</h2>

Retention defaults are non-executing policy records. They store the default retention window for each governed history category and whether future scheduled retention may request dry-run or destructive work. They do not delete rows or let manual prune commands infer a cutoff.

```bash title="Configure retention defaults"
appaloft retention-default configure --scope system --category provider-job-logs --retention-days 30
appaloft retention-default configure --scope system --category runtime-monitoring-samples --retention-days 1
appaloft retention-default list --scope system
appaloft retention-default show provider-job-logs --scope system
```

Even when a category allows destructive scheduling, manual prune still requires explicit cutoff and dry-run/destructive input. Legal holds, immutable archives, replay guards, active attempts, and category-specific skip rules remain authoritative.

<h2 id="operator-domain-events">Domain event stream retention</h2>

Domain event stream retention only targets retained event stream observation rows. Dry-run first, then delete by explicit cutoff:

```bash title="Dry-run retained domain events"
appaloft domain-event prune --before 2026-01-01T00:00:00.000Z
```

This command does not delete deployments, audit rows, provider logs, process attempts, snapshots, rollback candidates, runtime artifacts, or business state. Replay guards, cursor continuity, and recovery evidence take precedence over deletion.

<h2 id="remote-state-resolution">SSH remote state resolution</h2>

`infra_error` + `remote-state-resolution` means Appaloft reached the SSH target but could not prepare the server-owned `ssh-pglite` state root before deployment identity resolution. Common causes are insufficient disk or inode capacity, a read-only filesystem, missing write permission for the configured runtime root, an older incompatible PGlite state directory from a pre-upgrade deployment, or a remote shell command failure while creating the state, lock, backup, or journal directories.

Recommended handling:

1. Inspect the error details printed by the CLI, especially `stateBackend`, `host`, `port`, `exitCode`, `reason`, and `stderr`.
2. If `stderr` mentions no space, quota, read-only filesystem, permission denied, or PGlite initialization failure, fix the SSH target capacity/permissions or let the current Appaloft run quarantine the incompatible local mirror and replace it on successful sync.
3. Run `appaloft server capacity inspect` or an equivalent SSH diagnostic before retrying when the error points at target capacity.
4. Retry the deploy after the target can create and write the Appaloft state directories.

<h2 id="remote-state-lock">SSH remote state lock</h2>

`infra_error` + `remote-state-lock` means the SSH `ssh-pglite` state root is protected by another Appaloft process, or a previously cancelled process left a lock that has not aged past its stale window. It is usually an operator-diagnosable infrastructure error, not invalid deployment input.

Recommended handling:

1. Inspect safe details such as `lockOwner`, `correlationId`, `lockHeartbeatAt`, `staleAfterSeconds`, and `waitedSeconds`.
2. Appaloft deploy and cleanup commands already use bounded waiting and stale-only lock recovery when the heartbeat has aged past the stale window. Current clients may cap older lock metadata to the shorter state-root maintenance stale window before recovery.
3. If the heartbeat is still updating, wait for the active deployment or retry later.
4. If the error repeats, run `appaloft remote-state lock inspect --server-host <host>` with the same SSH target options to inspect remote lock owner metadata without entering the deployment mutation path.
5. Run `appaloft remote-state lock recover-stale --server-host <host>` only when diagnostics show the heartbeat is older than the stale window. This archives stale lock metadata and does not force-delete active locks.
6. Do not directly delete the remote lock directory unless diagnostics prove no active process owns it and a recovered journal is retained.

<h2 id="reference-status-shape">Status shape</h2>

Statuses should distinguish resource, deployment, runtime, proxy, access URL, and certificate readiness.
