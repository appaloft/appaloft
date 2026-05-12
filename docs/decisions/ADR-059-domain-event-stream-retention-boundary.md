# ADR-059: Domain Event Stream Retention Boundary

Status: Accepted

Date: 2026-05-12

## Context

ADR-029 defines deployment event-stream observation as a read/query boundary. ADR-048 defines
audit-row pruning and explicitly excludes domain event streams. Phase 9 still requires documented
retention behavior for event streams before audit/event retention can be considered complete.

Domain event streams are not audit rows. They may be used for deployment observation, replay,
debugging, and future process recovery. Pruning them must therefore stay separate from
`audit-events.prune`, log retention, runtime artifact cleanup, and process-attempt retention.

## Decision

Appaloft introduces `domain-events.prune` as the domain event stream retention mutation.

The canonical first retained event stream store is a new Appaloft-owned retained event observation
store, not `audit_logs`, embedded `deployments.logs`, the process attempt journal, provider/runtime
logs, or the in-memory event bus. The PostgreSQL/PGlite implementation should use a dedicated
`domain_event_stream_records` persistence boundary, plus prune watermark state when needed to
detect cursors that fall behind retained history.

Retained stream records are projection/read-side facts captured after the owning aggregate or
process state is durable. They are not the write model and do not make Appaloft event-sourced.
Records must carry enough indexed metadata for first retention and replay behavior:

- stable record id;
- stream scope, with deployment id when the row feeds `deployments.stream-events`;
- event time;
- event type;
- source kind, such as domain event, process observation, or progress projection;
- aggregate id and aggregate type when the row represents an aggregate-owned fact;
- correlation, causation, and request ids when available;
- safe redacted payload or summary fields needed for observation.

Stream cursors must be stable across projection rebuilds. The current `deploymentId:sequence`
cursor shape is a migration gap and must not become the retained store contract. When destructive
prune removes old records, the retained store must keep enough watermark metadata for
`deployments.stream-events` and future event reads to return the governed stream-gap/error contract
when a requested cursor is older than retained history.

The command must:

- default to dry-run;
- require an ISO `before` cutoff;
- delete only persisted domain event stream records whose event time is older than `before` when
  destructive mode is explicit;
- optionally narrow by event type, aggregate id, aggregate type, and deployment id when those
  indexed fields exist in the event stream store;
- preserve cutoff-equal and newer records;
- preserve event records that are still needed by durable replay/read cursor leases when such
  leases exist, recovery readiness, rollback-candidate evidence, or accepted workflow state;
- return counts by event type and skipped-retention reason;
- never mutate audit rows, legal holds, immutable archives, outbox/inbox/process attempts, runtime
  logs, provider job logs, deployment logs, deployment snapshots, runtime artifacts, source
  workspaces, build cache, route state, resources, servers, deployments, dependencies, or storage
  volumes.

This decision does not require event sourcing. It only governs retention for persisted Appaloft
domain event stream rows when such rows are retained for observation or replay.

## Consequences

- `audit-events.prune` remains scoped to retained audit rows.
- `deployments.stream-events` prefers the retained event observation store for cursor-stable
  replay, pruned-cursor gap detection, and follow-mode cursor continuation. Embedded deployment
  logs remain governed by `deployments.logs.prune`, not by `domain-events.prune`.
- Future event observation surfaces must document how destructive event-stream prune affects replay
  cursors and gap responses.
- Persistence implementation must live behind application ports and `packages/persistence/pg`;
  adapters must dispatch through `CommandBus` using shared command input schemas.
- Outbox/inbox retention remains governed separately by ADR-054 durable process delivery and later
  operation-specific specs.

## Governed Specs

- [Domain Event Stream Retention](../specs/065-domain-event-stream-retention/spec.md)
- [domain-events.prune Command Spec](../commands/domain-events.prune.md)
- [Domain Event Stream Retention Test Matrix](../testing/domain-event-stream-retention-test-matrix.md)
- [ADR-029: Deployment Event Stream And Recovery Boundary](./ADR-029-deployment-event-stream-and-recovery-boundary.md)
- [ADR-048: Audit Event Retention Policy](./ADR-048-audit-event-retention-policy.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)
- [Adapter Command/Query Boundary](../architecture/adapter-command-query-boundary.md)

## Current Implementation Notes And Migration Gaps

- Code Round implemented the selected `domain_event_stream_records` retained observation store,
  prune watermark state, application command/schema/handler/use case, CLI and HTTP/oRPC
  entrypoints, operation catalog entries, public docs/help coverage, and tests for
  `DOMAIN-EVENT-RETENTION-001` through `DOMAIN-EVENT-RETENTION-005`.
- Published deployment domain events are recorded into retained observation rows. When retained
  state exists, `deployments.stream-events` uses retained stable cursors for bounded replay,
  pruned-cursor gap detection, and follow-mode cursor continuation.
- The legacy embedded deployment-log and live progress observer path remains a fallback for streams
  without retained rows. Broader retention of non-domain progress observations remains future
  observability hardening.
- Outbox/inbox retention, organization retention defaults, and scheduled audit/event retention
  automation remain separate governed slices.
