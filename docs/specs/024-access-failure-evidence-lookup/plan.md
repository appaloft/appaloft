# Plan: Access Failure Evidence Lookup

## Governing Sources

- Domain model: `docs/DOMAIN_MODEL.md`
- Decisions/ADRs: ADR-002, ADR-006, ADR-017, ADR-019, ADR-029, ADR-030
- Local specs: `docs/workflows/resource-access-failure-diagnostics.md`,
  `docs/errors/resource-access-failure-diagnostics.md`,
  `docs/specs/020-route-intent-status-and-access-diagnostics/spec.md`
- Test matrix: `docs/testing/resource-access-failure-diagnostics-test-matrix.md`

## Architecture Approach

- Domain/application placement: application owns the query message, handler, service,
  provider-neutral evidence recorder port, and evidence read-model port. Core aggregate state is
  unchanged.
- Repository/specification/visitor impact: persistence adapter adds a short-retention read-model
  table and Kysely-backed evidence projection. Lookup uses `findOne(spec)` rather than ad-hoc
  finder methods. No aggregate repository is added.
- Event/CQRS/read-model impact: public lookup dispatches through `QueryBus`; request-time capture
  records operational evidence through a port and does not publish domain events.
- Entrypoint impact: add oRPC/HTTP and CLI read entrypoints; Web remains read-model consumer only
  for existing access/health/diagnostic panels in this slice.
- Persistence/migration impact: add PG/PGlite table keyed by request id with safe diagnostic JSON,
  related ids, host/path filters, `captured_at`, and `expires_at`.

## Roadmap And Compatibility

- Roadmap target: Phase 6 / `0.8.0`.
- Version target: `0.8.0` gate, additive before first formal release.
- Compatibility impact: `pre-1.0-policy`; adds a public read query and contract without changing
  deployment admission, domain/TLS lifecycle, or route repair semantics.

## Testing Strategy

- Matrix ids:
  - `RES-ACCESS-DIAG-EVIDENCE-001`
  - `RES-ACCESS-DIAG-EVIDENCE-002`
  - `RES-ACCESS-DIAG-EVIDENCE-003`
  - `RES-ACCESS-DIAG-EVIDENCE-004`
- Test-first rows:
  - application query service lookup behavior and safe not-found response;
  - PG/PGlite evidence projection/read-model retention/filter behavior;
  - contract schema validation;
  - HTTP/oRPC and CLI dispatch through `QueryBus`;
  - renderer capture sanitization and non-blocking persistence failure behavior.
- Acceptance/e2e: no real Traefik e2e in this slice; retain hermetic adapter tests.
- Contract/integration/unit: application, persistence, contracts, oRPC/HTTP, CLI.

## Risks And Migration Gaps

- Authentication/tenant ownership filtering is not modeled in this slice. Optional filters reduce
  accidental mismatches, and the returned record remains copy-safe.
- Automatic route/resource context lookup from applied provider metadata remains a Phase 6 gap.
- Companion/static renderer support for one-shot CLI or remote SSH runtimes remains a Phase 6 gap.
