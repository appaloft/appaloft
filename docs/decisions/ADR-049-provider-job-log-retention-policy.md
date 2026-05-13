# ADR-049: Provider Job Log Retention Policy

Status: Accepted

Date: 2026-05-12

## Context

Phase 9 requires retention coverage beyond aggregate-scoped audit rows. `provider_job_logs` is a
separate retained log table used as a delete-safety blocker for Resources and DeploymentTargets.
Those rows are distinct from deployment-attempt logs embedded in Deployment state, resource runtime
log observation, domain event streams, outbox/inbox records, audit rows, and durable process
attempts.

Without an explicit retention command, old provider job log rows can remain opaque blockers even
when operators intentionally want to prune historical provider diagnostics.

## Decision

Appaloft introduces `provider-job-logs.prune` as the first provider job log retention mutation.

The command is operator maintenance over retained provider job log rows. It must:

- default to dry-run;
- require an ISO `before` cutoff;
- match only rows with `createdAt < before`;
- optionally narrow by `deploymentId`, `providerKey`, `resourceId`, and/or `serverId`;
- return counts by provider key;
- delete only `provider_job_logs` rows when `dryRun` is `false`;
- preserve cutoff-equal and newer rows;
- never mutate deployment rows, embedded deployment logs, resource runtime logs, provider resources,
  audit rows, event streams, outbox/inbox records, process attempts, remote-state backups, runtime
  artifacts, resource/server/deployment state, routes, dependency data, storage volumes, or
  compatibility ledger rows.

Provider job log payloads are not exposed by the prune command. The command returns counts only.

## Consequences

- Delete safety blockers for Resources and DeploymentTargets may change after destructive
  `provider-job-logs.prune` removes old retained rows.
- `provider-job-logs.prune` does not provide log export, legal hold, hosted default retention, or
  immutable archive behavior.
- Deployment log retention and runtime log archival remain separate future decisions because their
  ownership and storage shapes differ from `provider_job_logs`.
- CLI, HTTP/oRPC, and future MCP/tool surfaces must dispatch the same application command schema.

## Governed Specs

- [Provider Job Log Retention](../specs/057-provider-job-log-retention/spec.md)
- [provider-job-logs.prune Command Spec](../commands/provider-job-logs.prune.md)
- [Provider Job Log Retention Test Matrix](../testing/provider-job-log-retention-test-matrix.md)
- [Business Operation Map](../BUSINESS_OPERATION_MAP.md)
- [Core Operations](../CORE_OPERATIONS.md)
- [Adapter Command/Query Boundary](../architecture/adapter-command-query-boundary.md)
- [Error Model](../errors/model.md)

## Migration Gaps

- This slice prunes only `provider_job_logs` rows.
- Domain event streams, outbox/inbox state, embedded deployment logs, resource runtime log archival,
  runtime artifacts, and audit export/hold policy still need separate retention policies before the
  Phase 9 retention exit criterion is complete.
- Organization-level retention defaults and legal holds are not modeled yet.
