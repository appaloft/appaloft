# Plan: Domain Event Stream Retention

## Governing Sources

- Domain model: `docs/DOMAIN_MODEL.md`
- Decisions/ADRs: ADR-029, ADR-048, ADR-054, ADR-059
- Global contracts:
  - `docs/architecture/async-lifecycle-and-acceptance.md`
  - `docs/architecture/adapter-command-query-boundary.md`
  - `docs/errors/model.md`
  - `docs/errors/neverthrow-conventions.md`
- Local specs:
  - `docs/queries/deployments.timeline.md`
  - `docs/errors/deployments.timeline.md`
  - `docs/commands/domain-events.prune.md`
- Test matrix: `docs/testing/domain-event-stream-retention-test-matrix.md`

## Architecture Approach

- Domain/application placement: event stream retention is an application maintenance command over
  retained event observation rows. It must not mutate aggregate state or treat events as the write
  model.
- Repository/specification/visitor impact: Code Round introduced an event stream retention store
  port that can dry-run and destructively prune eligible rows while reporting guarded/skipped
  counts. PostgreSQL/PGlite translation lives in `packages/persistence/pg`.
- Event/CQRS/read-model impact: `domain-events.prune` is a command. Event stream observation
  remains query-shaped, and `deployments.stream-events` must report gap semantics when requested
  cursors reference pruned rows.
- Entrypoint impact: CLI and HTTP/oRPC entrypoints dispatch through `CommandBus`.
- Persistence/migration impact: Code Round added a dedicated `domain_event_stream_records`
  persistence boundary and prune watermark state, then migrated retained
  `deployments.stream-events` replay, gap behavior, and follow-mode cursor continuation away from
  embedded deployment-log-derived cursors when retained state exists.

## Store Inventory

Discovery on 2026-05-12 found no canonical persisted domain event stream table before this slice.
Code Round introduced the selected retained observation store.

- Core aggregates record `DomainEvent` objects and application use cases publish them through the
  `EventBus`; the shell runtime records deployment lifecycle domain events into
  `domain_event_stream_records` through the retained stream recorder before dispatching handlers.
- `deployments.stream-events` first asks the retained observation reader for bounded replay or
  follow-mode cursor continuation. If no retained stream state exists, the query service falls back
  to `DeploymentEventObserver`.
- Retained stream cursors are stable row cursors. The legacy `deploymentId:sequence` cursor shape is
  limited to fallback streams without retained state.
- Because deployment log retention is governed separately, pruning embedded deployment logs would
  also affect the active stream source. That is not the same as pruning retained domain event stream
  rows and remains outside `domain-events.prune`.

ADR-059 now selects option 1 as the canonical first retention target:

1. introduce a canonical retained event observation/domain event stream store with stable row ids,
   event time, event type, aggregate/deployment metadata, and cursor/gap semantics;

The rejected fallback is to defer `domain-events.prune` until a later durable event-store slice.

## Store Decision

The first Code Round introduced an application port for retained event stream records and a
PostgreSQL/PGlite adapter backed by a dedicated `domain_event_stream_records` persistence boundary.
The retained store is read-side observation state, not the source of truth for aggregate
rehydration.

Minimum retained record fields:

- stable record id;
- stream scope, with deployment id for deployment observation rows;
- stable cursor or enough fields to derive one without depending on rebuilt sequence position;
- event time;
- event type;
- source kind;
- aggregate id and aggregate type when available;
- correlation id, causation id, and request id when available;
- safe redacted summary or payload fields needed by event observation.

The store must also retain prune watermark metadata, either in the same persistence boundary or a
separate small table, so event reads can distinguish "cursor older than retained history" from
"deployment not found" and return the governed stream-gap/error contract.

`deployments.stream-events` prefers the retained store for bounded replay and cursor continuation
when retained state exists. Existing embedded deployment log reconstruction remains a fallback for
streams that have not produced retained observation rows.

Current Code Round status:

- `domain-events.prune` application command/use case and the PostgreSQL/PGlite retention store are
  implemented for dry-run, destructive prune, scoped filters, guard skipping, counts, and prune
  watermark writes.
- Published deployment domain events are recorded into `domain_event_stream_records`.
- `deployments.stream-events` bounded replay prefers retained event rows and returns a governed gap
  envelope when a requested cursor falls behind prune watermark state.
- `deployments.stream-events` follow mode prefers retained event rows when they exist, continues
  from retained stable cursors, and emits a governed gap envelope if the retained continuation
  cursor disappears during follow.
- CLI, HTTP/oRPC, operation catalog, public docs/help, and generated SDK/OpenAPI metadata are wired.
- `deployments.stream-events` still falls back to the shell progress observer when no retained
  stream state exists yet.

## Roadmap And Compatibility

- Roadmap target: Phase 9 operator/internal state closure for `0.11.0`.
- Version target: pre-1.0 policy.
- Compatibility impact: additive maintenance command plus possible explicit event stream gap
  behavior. Destructive prune must stay dry-run-first and explicit.

## Testing Strategy

- Matrix ids: `DOMAIN-EVENT-RETENTION-001` through `DOMAIN-EVENT-RETENTION-005`.
- Test-first rows:
  - dry-run default;
  - destructive prune of eligible old event stream rows;
  - cutoff/scope/replay-guard safety;
  - CLI and HTTP/oRPC command-bus dispatch;
  - stream-gap behavior after prune.
- Acceptance/e2e: CLI and HTTP/oRPC prune dispatch plus retained replay/follow readback/gap
  scenarios are covered by focused command and query tests.
- Contract/integration/unit: application retention use-case tests, persistence PGlite tests, and
  stream-events query contract tests.

## Risks And Migration Gaps

- Progress observations that are not recorded as retained domain event stream rows still depend on
  the legacy shell progress observer fallback.
- Cursor guard semantics depend on retained store cursors and prune watermarks. There is no durable
  active cursor lease store in the first slice; old cursors are handled by explicit gap signaling
  rather than blocking prune unless a future cursor lease store is added.
- Organization defaults and scheduled history retention automation are separate implemented Phase 9
  slices. A separate outbox/inbox retention command remains not applicable unless a future ADR
  introduces a separate outbox/inbox store.
