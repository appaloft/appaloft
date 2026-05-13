# ADR-053: Resource Runtime Log Archive Retention Boundary

Status: Accepted

Date: 2026-05-12

## Context

`resources.runtime-logs` is a live or bounded observation query over application stdout/stderr for
a resource-owned runtime instance. ADR-018 intentionally keeps runtime log archival, search, drains,
metrics, and retention out of that query because the default runtime backend does not persist
application runtime logs inside Appaloft state.

Phase 9 requires documented retention/prune behavior for historical logs. Deployment logs,
provider job logs, and audit rows now have separate retention boundaries, but resource runtime logs
still need a durable boundary that does not confuse external runtime backends with Appaloft-owned
records.

## Decision

Appaloft will model runtime log archival as explicit resource-owned archive snapshots derived from
`resources.runtime-logs`, not as implicit persistence of every live runtime line and not as a
mutation of backend log stores.

The planned operation boundary is:

- `resources.runtime-logs.archive`: capture a bounded, redacted runtime-log snapshot for one
  resource and optional deployment/service scope.
- `resources.runtime-log-archives.list`: list retained archive snapshots for a resource, server, or
  deployment support scope.
- `resources.runtime-log-archives.show`: read one retained redacted archive snapshot.
- `resources.runtime-log-archives.prune`: dry-run-first pruning of old archive snapshots by
  explicit cutoff and optional resource, server, deployment, or service scope.

The archive command must:

- require a resource id;
- optionally accept deployment id, service name, tail/since/cursor options, and an operator-supplied
  reason;
- capture only bounded lines from the runtime-log reader contract;
- mask known secret values before persistence;
- store safe context metadata such as resource id, deployment id, server id, service name,
  runtime kind, captured-at time, line count, retention state, and capture reason;
- never store Docker, Compose, Swarm, SSH, PM2, systemd, file path, or provider-native objects as
  public contract fields;
- never mutate live runtime backends, Deployment logs, provider job logs, audit rows, event streams,
  outbox/inbox records, process attempts, runtime artifacts, source workspaces, build cache,
  deployment snapshots, resources, servers, routes, dependency data, or storage volumes.

The archive read and prune operations operate only on Appaloft-owned archive snapshot records. They
do not prove legal hold, immutable archive, organization default retention, global export, log
search, metrics, or log drains. Those remain future governed slices.

## Consequences

- ADR-018 remains the source of truth for live runtime log observation.
- Runtime-log retention blockers on resource/server delete safety refer only to retained
  Appaloft-owned archive snapshot records, not to external backend logs that Appaloft did not
  capture.
- A later Code Round must add an archive snapshot read model/store before activating the planned
  operations in `CORE_OPERATIONS.md` and `operation-catalog.ts`.
- CLI, HTTP/oRPC, Web, SDK, and future MCP/tool surfaces must use the same command/query schemas
  once the operations become active.

## Governed Specs

- [Resource Runtime Log Archive Retention](../specs/059-resource-runtime-log-archive-retention/spec.md)
- [Resource Runtime Log Archive Retention Test Matrix](../testing/resource-runtime-log-archive-retention-test-matrix.md)
- [resources.runtime-logs Query Spec](../queries/resources.runtime-logs.md)
- [Resource Runtime Log Observation Workflow Spec](../workflows/resource-runtime-log-observation.md)
- [Business Operation Map](../BUSINESS_OPERATION_MAP.md)
- [Core Operations](../CORE_OPERATIONS.md)
- [Adapter Command/Query Boundary](../architecture/adapter-command-query-boundary.md)
- [Error Model](../errors/model.md)

## Migration Gaps

- The first slice is a Spec Round only. No archive snapshot store, commands, queries, CLI, HTTP,
  Web, SDK, or future MCP/tool descriptors are active yet.
- Runtime log archive retention does not close legal hold, immutable archive, organization
  retention defaults, global export, log search, log drains, metrics, domain event stream
  retention, or outbox/inbox retention.
