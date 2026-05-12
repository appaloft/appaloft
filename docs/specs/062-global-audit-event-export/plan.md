# Plan: Global Audit Event Export

## Governing Sources

- Domain model: `docs/DOMAIN_MODEL.md`
- Decisions/ADRs: ADR-048, ADR-051, ADR-056
- Global contracts:
  - `docs/architecture/adapter-command-query-boundary.md`
  - `docs/errors/model.md`
  - `docs/errors/neverthrow-conventions.md`
- Local specs:
  - `docs/queries/audit-events.list.md`
  - `docs/queries/audit-events.show.md`
  - `docs/queries/audit-events.export.md`
  - `docs/queries/audit-events.export-global.md`
- Test matrix: `docs/testing/audit-event-read-surface-test-matrix.md`

## Architecture Approach

- Domain/application placement: global export is a query-side operator audit-history read. It
  belongs in `packages/application` as `ExportGlobalAuditEventsQuery`, handler, and query service.
- Repository/read-model impact: persistence support belongs in `packages/persistence/pg` on the
  audit event read model. It should reuse redaction and ordering rules while preserving distinct
  input validation and result metadata.
- Event/CQRS impact: no command or event mutation. CLI and HTTP/oRPC adapters dispatch through
  `QueryBus` only.
- Entrypoint impact: add CLI and HTTP/oRPC surfaces, operation catalog entry, OpenAPI metadata, SDK
  generation coverage, and docs registry help coverage in the same Code Round.
- Persistence/migration impact: no schema migration expected for the first slice because export
  reads retained `audit_logs` rows.

## Roadmap And Compatibility

- Roadmap target: Phase 9 operator/internal state closure for `0.11.0`.
- Version target: pre-1.0 policy.
- Compatibility impact: additive public query operation and generated client surface. Existing
  `audit-events.export` aggregate-scope behavior remains unchanged.

## Testing Strategy

- Matrix ids: `AUDIT-EVENT-GLOBAL-EXPORT-001` through `AUDIT-EVENT-GLOBAL-EXPORT-004`.
- Test-first rows:
  - application validation that a time window is required;
  - persistence redaction, ordering, filter, and truncation behavior across aggregates;
  - CLI and HTTP/oRPC dispatch through the shared query schema;
  - operation catalog, docs registry, and OpenAPI/SDK metadata coverage.
- Acceptance/contract: HTTP/oRPC and CLI tests should prove the public operation dispatches the
  same query input shape.
- Unit/integration: application query service and PGlite read-model tests should prove metadata,
  redaction, filtering, and no mutation.

## Risks And Migration Gaps

- Large exports can become operationally expensive. The first Code Round must keep required time
  windows and bounded limits.
- Authorization and organization scoping are broader Phase 8/Phase 9 concerns. Until those rules
  are active, global export remains an operator-scope surface with future auth/org enforcement
  tracked outside this spec.
- Legal holds, immutable archives, organization defaults, domain event stream retention, and
  scheduled history retention automation are separate implemented Phase 9 slices. A separate
  outbox/inbox retention command remains not applicable unless a future ADR introduces a separate
  outbox/inbox store.
