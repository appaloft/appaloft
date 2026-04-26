# Plan: Environment Lock

## Governing Sources

- Domain model: `docs/DOMAIN_MODEL.md`
- Operation map: `docs/BUSINESS_OPERATION_MAP.md`
- Public operation catalog source: `docs/CORE_OPERATIONS.md`
- Decisions/ADRs: ADR-012, ADR-013, ADR-026, ADR-030, ADR-032
- Global contracts: `docs/errors/model.md`, `docs/errors/neverthrow-conventions.md`,
  `docs/architecture/async-lifecycle-and-acceptance.md`
- Local specs: `docs/commands/environments.lock.md`,
  `docs/commands/environments.unlock.md`, `docs/workflows/environment-lifecycle.md`,
  `docs/events/environment-locked.md`, `docs/events/environment-unlocked.md`,
  `docs/errors/environments.lifecycle.md`
- Test matrix: `docs/testing/environment-lifecycle-test-matrix.md`

## Architecture Approach

- Domain/application placement: extend the `Environment` aggregate lifecycle status value object
  with `locked`, add idempotent `lock` and `unlock` methods, and return structured lifecycle guard
  errors for locked mutation/admission attempts.
- Repository/specification/visitor impact: extend environment state serialization with `lockedAt`
  and optional `lockReason`; add a PG/PGlite migration.
- Event/CQRS/read-model impact: add `LockEnvironmentCommand` and `UnlockEnvironmentCommand`,
  handlers, use cases, command schemas, operation catalog entries, and `environment-locked` /
  `environment-unlocked` events.
- Entrypoint impact: add CLI subcommands, HTTP/oRPC routes/client contract, Web project-detail
  lock/unlock actions, and public docs/help coverage.
- Admission impact: guard environment config writes, environment promotion, resource creation, and
  deployment context/bootstrap admission when a locked environment is selected.

## Decision State

- Decision state: new accepted ADR added
- Governing decision: `docs/decisions/ADR-032-environment-lock-lifecycle.md`
- Rationale: lock introduces a new lifecycle stage, durable state shape, public operations, and
  lifecycle guard error, so ADR-level lifecycle semantics are warranted before local specs and code.

## Roadmap And Compatibility

- Roadmap target: Phase 4 / `0.6.0` Resource Ownership And CRUD Foundation.
- Version target: next Phase 4-capable release after the current `0.5.x` line.
- Compatibility impact: `pre-1.0-policy`; new public command/API/CLI/Web capability, additive
  read-model fields, and additive lifecycle status.
- Release-note requirement: note that environments can now be locked/unlocked and remain readable.
- Migration requirement: add nullable environment lock metadata columns; existing environments
  remain active.

## Testing Strategy

- Matrix ids: `ENV-LIFE-LOCK-*`, `ENV-LIFE-UNLOCK-*`, `ENV-LIFE-GUARD-006` through
  `ENV-LIFE-GUARD-009`, `ENV-LIFE-ENTRY-006`, and existing archive/read rows where affected.
- Test-first rows:
  - core aggregate lock/unlock/idempotency/guard behavior;
  - application lock/unlock use cases, read model metadata, set/unset/promote/resource/deployment
    guards;
  - PG/PGlite persistence round trip;
  - HTTP/oRPC dispatch;
  - CLI dispatch;
  - Web project-detail lock/unlock dispatch;
  - operation catalog/docs registry coverage.

## Risks And Migration Gaps

- Risk: lock could be confused with archive or runtime stop. Mitigation: command/event/docs state
  that lock is reversible and read-only, while cleanup remains explicit future work.
- Risk: locked environments could block maintenance unexpectedly. Mitigation: unlock is shipped in
  the same slice and is idempotent for active environments.
- Migration gaps: none planned for this behavior.
