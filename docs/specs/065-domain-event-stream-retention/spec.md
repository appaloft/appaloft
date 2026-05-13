# Domain Event Stream Retention

## Status

- Round: Post-Implementation Sync
- Artifact state: implemented slice; broader Phase 9 audit/event retention remains open

## Business Outcome

Operators can preview and prune old retained domain event stream rows without deleting audit
history, process delivery state, logs, snapshots, runtime artifacts, or business aggregates.

## Ubiquitous Language

| Term | Meaning | Context | Compatibility aliases |
| --- | --- | --- | --- |
| Domain event stream | Persisted ordered domain lifecycle facts retained for observation, replay, or recovery diagnostics. | Event and async progression | event stream |
| Event stream retention | Policy that keeps or removes old retained event stream rows. | Operator/Internal State | event retention |
| Event stream prune | Dry-run-first command that deletes only eligible old domain event stream rows. | Operator maintenance | event cleanup |
| Replay retention guard | Reason an old event stream row must remain because a replay, cursor, recovery, or rollback candidate still depends on it. | Event observation | replay guard |
| Retained event observation store | Appaloft-owned read-side store for cursor-stable event observation rows retained for replay and pruning. | Event and async progression | event stream store |
| Prune watermark | Retained metadata that lets event reads report a gap when a cursor points before retained history. | Event observation | retention watermark |

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| DOMAIN-EVENT-RETENTION-001 | Dry-run by default | retained domain event stream rows exist older than `before` | `domain-events.prune` omits `dryRun` | matching counts are returned and no event stream row is deleted. |
| DOMAIN-EVENT-RETENTION-002 | Destructive prune | retained domain event stream rows are older than `before` and not guarded | prune runs with `dryRun = false` | only eligible old event stream rows are deleted and counts by event type are returned. |
| DOMAIN-EVENT-RETENTION-003 | Cutoff and scope safety | rows are newer, cutoff-equal, outside event type/aggregate/deployment scope, or replay-guarded | prune runs | those rows remain retained and guarded/skipped counts are returned. |
| DOMAIN-EVENT-RETENTION-004 | Entrypoints dispatch shared command | CLI or HTTP/oRPC invokes prune | inputs are parsed | adapters dispatch `PruneDomainEventsCommand` through `CommandBus` using the shared command schema. |
| DOMAIN-EVENT-RETENTION-005 | Event observation reports gaps and follows stable cursors | event stream rows were pruned before a requested cursor, or retained stream state exists for follow mode | `deployments.stream-events` replays or follows from that cursor | the read surface returns the governed stream-gap/error contract for pruned cursors and uses retained stable cursors for follow-mode continuation. |

## Domain Ownership

- Bounded context: Event and async progression, with Operator/Internal State for maintenance
  visibility.
- Aggregate/resource owner: none. Event stream rows are retained facts emitted by aggregate or
  process owners; pruning retained rows must not mutate those owners.
- Upstream/downstream contexts: deployment event observation, recovery readiness, rollback
  candidate evidence, and future replay consumers may guard records from prune.

## Public Surfaces

- API: `POST /api/domain-events/prune`.
- CLI: `appaloft domain-event prune --before <iso>`.
- Web/UI: future operator maintenance panel may expose dry-run previews.
- Config: none in the first slice.
- Events: no new event publication in the first slice.
- Public docs/help: uses the operator retention/diagnostics help coverage registered for the active
  command.

## Non-Goals

- Event sourcing.
- Outbox/inbox/process-attempt retention.
- Audit row retention, legal holds, immutable archives, or global audit export.
- Runtime logs, provider job logs, deployment logs, deployment snapshots, remote-state backups,
  runtime artifacts, source workspaces, build cache, route state, resource/server/deployment state,
  dependencies, or storage volume retention.
- Organization retention defaults or scheduled retention automation.

## Current Implementation Notes And Migration Gaps

- `domain-events.prune` is implemented as a dry-run-first maintenance command over retained event
  observation rows.
- ADR-059 selects a dedicated retained event observation store, implemented as a
  `domain_event_stream_records` persistence boundary with stable cursors and prune watermark state,
  as the canonical first retention target.
- Published deployment domain events are recorded into retained event observation rows after the
  owning deployment event is published from durable application state.
- `deployments.stream-events` prefers retained observation rows for bounded replay, pruned-cursor
  gap detection, and follow-mode cursor continuation. The legacy embedded deployment-log and live
  progress observer path remains a fallback for streams without retained rows.
- Organization retention defaults and scheduled history retention automation are separate
  implemented Phase 9 slices. ADR-054 defines durable process attempts as the current
  outbox/inbox-equivalent baseline, so accepted background-work retention is covered by
  `operator-work.prune`; a separate outbox/inbox retention command remains not applicable unless a
  future ADR introduces a separate store.

## Open Questions And Deferred Gaps

- Historical embedded deployment logs are not backfilled into retained stream rows in this slice;
  streams without retained rows continue using the legacy observer fallback.
- Future read surfaces beyond `deployments.stream-events` must document their retained event
  observation source before consuming the store.
