# ADR-052: Deployment Log Retention Policy

Status: Accepted

Date: 2026-05-12

## Context

Deployment logs are attempt/progress records embedded on Deployment rows. They are distinct from
resource runtime log observation, provider job logs, audit rows, domain event streams,
outbox/inbox state, runtime artifacts, and deployment snapshots.

Phase 9 requires documented retention/prune behavior for historical logs. Provider job log and
audit row retention already use standalone table pruning, but embedded Deployment logs need a
separate boundary because pruning log entries mutates a Deployment row without deleting or
rewriting the deployment attempt itself.

## Decision

Appaloft introduces `deployments.logs.prune` as the first deployment-log retention mutation.

The command is operator maintenance over embedded deployment log entries. It must:

- default to dry-run;
- require an ISO `before` cutoff;
- match only log entries with `timestamp < before`;
- optionally narrow by `deploymentId`, `resourceId`, and/or `serverId`;
- return matched/pruned entry counts and affected deployment count;
- delete only matched entries from the `deployments.logs` JSON field when `dryRun` is `false`;
- preserve cutoff-equal and newer log entries;
- preserve deployment rows, deployment status, runtime plan snapshots, environment snapshots,
  rollback fields, dependency binding references, and deployment history;
- never mutate resource runtime logs, provider job logs, audit rows, domain event streams,
  outbox/inbox records, process attempts, remote-state backups, runtime artifacts, source
  workspaces, build cache, resources, servers, routes, dependency data, storage volumes, or
  compatibility ledger rows.

The command does not provide runtime-log archival, legal holds, immutable archive export, or
organization retention defaults. Until those exist, the operator must supply the cutoff explicitly.

## Consequences

- `deployments.logs` remains the read-only deployment log query.
- Deployment detail remains readable after destructive log prune, but its embedded log list and
  `logCount` can shrink because only retained log entries remain.
- Runtime log archival remains separate because runtime logs are resource-owned observation through
  runtime target adapters, not Deployment aggregate state.
- CLI, HTTP/oRPC, and future MCP/tool surfaces must dispatch the same application command schema.

## Governed Specs

- [Deployment Log Retention](../specs/058-deployment-log-retention/spec.md)
- [deployments.logs.prune Command Spec](../commands/deployments.logs.prune.md)
- [Deployment Log Retention Test Matrix](../testing/deployment-log-retention-test-matrix.md)
- [Business Operation Map](../BUSINESS_OPERATION_MAP.md)
- [Core Operations](../CORE_OPERATIONS.md)
- [Adapter Command/Query Boundary](../architecture/adapter-command-query-boundary.md)
- [Error Model](../errors/model.md)

## Migration Gaps

- This slice prunes only embedded Deployment log entries.
- Resource runtime log archival, domain event streams, outbox/inbox state, scheduled retention
  automation, legal holds, immutable archive storage, and organization-level retention defaults
  remain future governed slices before the Phase 9 retention exit criterion is complete.
