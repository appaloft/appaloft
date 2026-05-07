# Plan: Resource Runtime Controls

## Governing Sources

- ADRs: ADR-012, ADR-018, ADR-023, ADR-028, ADR-034, ADR-038
- Operation map: `docs/BUSINESS_OPERATION_MAP.md`
- Core operations: `docs/CORE_OPERATIONS.md`
- Global contracts:
  - `docs/errors/model.md`
  - `docs/errors/neverthrow-conventions.md`
  - `docs/architecture/async-lifecycle-and-acceptance.md`
- Existing local specs:
  - `docs/commands/resources.runtime.stop.md`
  - `docs/commands/resources.runtime.start.md`
  - `docs/commands/resources.runtime.restart.md`
  - `docs/queries/resources.health.md`
  - `docs/queries/resources.runtime-logs.md`
  - `docs/queries/deployments.recovery-readiness.md`
  - `docs/commands/deployments.redeploy.md`
  - `docs/commands/deployments.retry.md`
  - `docs/commands/deployments.rollback.md`
  - `docs/errors/resource-runtime-controls.md`

## Architecture Approach

### Core

- Do not make Resource execute runtime controls directly.
- Add value objects for runtime-control ids/statuses only if Code Round persists control attempt
  state in core-owned objects.
- Keep Resource profile and lifecycle separate from current runtime process state.

### Application

- Add candidate command slices for stop/start/restart.
- Add a runtime-control application service that resolves Resource, latest safe runtime metadata,
  coordination scope, and adapter port input.
- Add a provider-neutral runtime target control port for stop/start/restart.
- Coordinate through the `resource-runtime` scope.

### Persistence And Read Models

- Persist one runtime-control attempt or equivalent process/read-model record before adapter
  execution.
- Record operation kind, Resource id, target/destination identity when safe, status, phase, safe
  diagnostics, started timestamp, and completed timestamp.
- Embed latest attempt detail in `resources.health.latestRuntimeControl` for the first Code Round.
  Defer a separate runtime-control history query until pagination or audit use cases require it.

### Entrypoints

- CLI:
  - `appaloft resource runtime stop <resourceId>`;
  - `appaloft resource runtime start <resourceId>`;
  - `appaloft resource runtime restart <resourceId>`.
- HTTP/oRPC:
  - resource-scoped command routes using shared schemas.
- Web:
  - Resource detail runtime action controls after readiness/blockers are visible.
- Public docs/help:
  - task-oriented docs explaining stop/start/restart versus redeploy.

## Roadmap And Compatibility

- Roadmap target: Phase 7 / `0.9.0` beta.
- Version target: not releasing in this round.
- Compatibility impact: `pre-1.0-policy`, additive operation surface after Code Round.
- Release notes: required when the operations become active.

## Test Strategy

Minimum stable test ids:

- `RUNTIME-CTRL-STOP-001`: stop running runtime.
- `RUNTIME-CTRL-START-001`: start stopped runtime from retained metadata.
- `RUNTIME-CTRL-RESTART-001`: restart records stop/start phases.
- `RUNTIME-CTRL-BLOCK-001`: missing runtime metadata blocks.
- `RUNTIME-CTRL-COORD-001`: active deployment/runtime mutation blocks or times out.
- `RUNTIME-CTRL-READ-001`: `resources.health` exposes latest runtime-control attempt readback.
- `RUNTIME-CTRL-DOCS-001`: public runtime-control anchors resolve and explain restart versus
  redeploy.
- `RUNTIME-CTRL-SURFACE-001`: CLI/HTTP/Web use same schemas and docs links.

## Risks And Migration Gaps

- Runtime target metadata may be insufficient for safe start before adapters expose normalized
  retained-runtime identity.
- Phase 8 durable outbox/job state may replace first synchronous attempt processing.
- Cluster runtime targets must not require public command schema changes.
- User copy must avoid implying restart picks up new config or source.

## Code Round Readiness

Ready for Test-First Round automation binding, not yet Code Round.

Before Code Round, bind tests to the command specs, error vocabulary, `resources.health`
`latestRuntimeControl` readback, public docs anchors, CLI/HTTP/Web entrypoint expectations, and
adapter contracts. Synchronize `CORE_OPERATIONS.md` and `operation-catalog.ts` only when activating
the operations.
