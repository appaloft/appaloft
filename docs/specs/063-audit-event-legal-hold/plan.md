# Plan: Audit Event Legal Hold

## Governing Sources

- Domain model: `docs/DOMAIN_MODEL.md`
- Decisions/ADRs: ADR-048, ADR-051, ADR-056, ADR-057
- Global contracts:
  - `docs/architecture/adapter-command-query-boundary.md`
  - `docs/errors/model.md`
  - `docs/errors/neverthrow-conventions.md`
- Local specs:
  - `docs/commands/audit-events.prune.md`
  - `docs/commands/audit-events.legal-holds.configure.md`
  - `docs/commands/audit-events.legal-holds.release.md`
  - `docs/queries/audit-events.legal-holds.list.md`
  - `docs/queries/audit-events.legal-holds.show.md`
- Test matrix: `docs/testing/audit-event-read-surface-test-matrix.md`

## Architecture Approach

- Domain/application placement: legal hold command/query schemas, messages, handlers, use cases,
  and query services belong in `packages/application`.
- Repository/read-model impact: persistence support belongs in `packages/persistence/pg` with an
  audit legal hold store/read model and a hold-aware audit prune path.
- Event/CQRS impact: configure/release are commands; list/show are queries. No domain events are
  required in the first slice.
- Entrypoint impact: add CLI and HTTP/oRPC surfaces, operation catalog entries, OpenAPI metadata,
  SDK generation coverage, and docs registry help coverage in the same Code Round.
- Persistence/migration impact: Code Round requires a migration for audit legal hold records and
  PGlite tests for configure/list/show/release plus prune exclusion.

## Roadmap And Compatibility

- Roadmap target: Phase 9 operator/internal state closure for `0.11.0`.
- Version target: pre-1.0 policy.
- Compatibility impact: additive public command/query operations and a safer destructive prune
  rule. Existing `audit-events.prune` destructive behavior changes by preserving rows matched by an
  active legal hold.

## Testing Strategy

- Matrix ids: `AUDIT-EVENT-HOLD-001` through `AUDIT-EVENT-HOLD-006`.
- Test-first rows:
  - configure aggregate hold and bounded global-window hold;
  - prune dry-run/destructive exclusion of held rows;
  - list/show safe hold readback;
  - release hold and subsequent prune eligibility;
  - CLI and HTTP/oRPC dispatch through shared schemas;
  - operation catalog, docs registry, OpenAPI/SDK metadata coverage.
- Acceptance/contract: HTTP/oRPC and CLI tests should prove public operations dispatch the same
  command/query input shapes.
- Integration/unit: application services and PGlite read-model/store tests should prove hold scope,
  release state, metadata, and prune exclusion.

## Risks And Migration Gaps

- Legal hold can cause prune to leave old audit rows in place. Prune output must make held/skipped
  counts visible so operators understand why storage was not reclaimed.
- Authorization and organization scoping are broader Phase 8/Phase 9 concerns. Until those rules
  are active, legal hold remains an operator-scope surface with future auth/org enforcement tracked
  outside this spec.
- Immutable archives, organization defaults, domain event stream retention, and scheduled history
  retention automation are separate implemented Phase 9 slices. A separate outbox/inbox retention
  command remains not applicable unless a future ADR introduces a separate outbox/inbox store.
