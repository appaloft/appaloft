# Plan: Audit Event Immutable Archive

## Governing Sources

- Domain model: `docs/DOMAIN_MODEL.md`
- Decisions/ADRs: ADR-048, ADR-051, ADR-056, ADR-057, ADR-058
- Global contracts:
  - `docs/architecture/adapter-command-query-boundary.md`
  - `docs/errors/model.md`
  - `docs/errors/neverthrow-conventions.md`
- Local specs:
  - `docs/commands/audit-events.archives.create.md`
  - `docs/commands/audit-events.archives.prune.md`
  - `docs/queries/audit-events.archives.list.md`
  - `docs/queries/audit-events.archives.show.md`
  - `docs/commands/audit-events.prune.md`
- Test matrix: `docs/testing/audit-event-read-surface-test-matrix.md`

## Architecture Approach

- Domain/application placement: archive create/prune command schemas, list/show query schemas,
  messages, handlers, use cases, and query services belong in `packages/application`.
- Repository/read-model impact: persistence support belongs in `packages/persistence/pg` with an
  audit archive store/read model and archive-aware audit prune selection.
- Event/CQRS impact: create/prune are commands; list/show are queries. No domain events are
  required in the first slice.
- Entrypoint impact: add CLI and HTTP/oRPC surfaces, operation catalog entries, OpenAPI metadata,
  SDK generation coverage, and docs registry help coverage in the same Code Round.
- Persistence/migration impact: the implemented archive table stores immutable archive metadata,
  redacted items, digest, source filters, retention metadata, and prune state.

## Roadmap And Compatibility

- Roadmap target: Phase 9 operator/internal state closure for `0.11.0`.
- Version target: pre-1.0 policy.
- Compatibility impact: additive public command/query operations plus a safer destructive
  `audit-events.prune` rule when retained archives guard source rows.
- Release-note requirement: mention immutable audit archive as a new operator retention surface for
  the Phase 9 release notes.

## Testing Strategy

- Matrix ids: `AUDIT-EVENT-ARCHIVE-001` through `AUDIT-EVENT-ARCHIVE-006`.
- Test-first rows:
  - create aggregate and bounded global archives;
  - prove validation for invalid global windows;
  - list/show immutable redacted archive readback and digest stability;
  - dry-run-first archive prune and destructive archive prune;
  - archive-aware audit prune source-row exclusion;
  - CLI and HTTP/oRPC dispatch through shared schemas;
  - operation catalog, docs registry, OpenAPI/SDK metadata coverage.
- Acceptance/contract: HTTP/oRPC and CLI tests should prove public operations dispatch the same
  command/query input shapes.
- Integration/unit: application services and PGlite read-model/store tests should prove immutable
  archive payloads, source filters, digest determinism, retention guards, and prune behavior.

## Risks And Migration Gaps

- Archive storage can grow quickly. The first implementation must enforce bounded source selection
  and a row cap before destructive retention workflows depend on it.
- Archive-aware source-row retention may cause `audit-events.prune` to leave old audit rows in
  place. Prune output must make archive-retained/skipped counts visible.
- Authorization and organization scoping are broader Phase 8/Phase 9 concerns. Until those rules
  are active, archives remain an operator-scope surface with future auth/org enforcement tracked
  outside this spec.
- Organization retention defaults, domain event stream retention, and scheduled history retention
  automation are separate implemented Phase 9 slices. A separate outbox/inbox retention command
  remains not applicable unless a future ADR introduces a separate outbox/inbox store.
