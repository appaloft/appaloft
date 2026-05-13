# Plan: Resource Runtime Log Archive Retention

## Governing Sources

- Domain model: `docs/DOMAIN_MODEL.md`
- Decisions/ADRs: ADR-018, ADR-053
- Local specs: `docs/queries/resources.runtime-logs.md`,
  `docs/workflows/resource-runtime-log-observation.md`
- Test matrix: `docs/testing/resource-runtime-log-archive-retention-test-matrix.md`

## Architecture Approach

- Domain/application placement: command/query schemas, messages, handlers, and use cases live in
  `packages/application` and dispatch through CQRS buses.
- Repository/specification/visitor impact: add an Appaloft-owned archive snapshot store/read model
  in persistence. Do not add runtime-log archive state to core aggregate state.
- Event/CQRS/read-model impact: archive and prune are commands; list/show are queries. The first
  slice does not require new domain events.
- Entrypoint impact: CLI and HTTP/oRPC reuse application schemas and operation catalog metadata.
  SDK/OpenAPI/tool generation metadata remains covered by the operation catalog, with dedicated SDK
  parity work governed elsewhere.
- Persistence/migration impact: schema stores bounded redacted lines, safe context metadata,
  capture reason, captured-at time, retention state, and optional resource/server/deployment/service
  scopes.

## Roadmap And Compatibility

- Roadmap target: Phase 9 operator/internal state closure for `0.11.0`.
- Version target: pre-1.0 policy.
- Compatibility impact: additive active public commands/queries; destructive prune requires
  explicit `dryRun = false`.

## Testing Strategy

- Matrix ids: `RUNTIME-LOG-ARCHIVE-001` through `RUNTIME-LOG-ARCHIVE-006`.
- Test-first rows: application archive capture, readback redaction, prune dry-run/destructive
  behavior, delete-safety blocker composition, CLI/oRPC dispatch.
- Acceptance/e2e: CLI and HTTP/oRPC dispatch over shared schemas; Web can remain future until the
  operator maintenance surface exists.
- Contract/integration/unit: runtime log reader fake, archive store integration, PG/PGlite
  retention behavior, delete-check integration.

## Risks And Migration Gaps

- Runtime log volume can grow quickly; Code Round must define line and byte limits before storage
  is activated.
- Archive snapshots may contain sensitive application output. Redaction must happen before
  persistence and tests must prove secret-like content is absent from stored/read output.
- This Code Round implements storage, public CLI/HTTP entrypoints, operation catalog rows, docs
  registry coverage, and delete-safety blockers. Legal hold, immutable archive, organization
  defaults, and scheduled history retention automation are implemented in separate Phase 9 slices.
  Search, drains, metrics, and Web maintenance affordances remain outside this slice.
