# Plan: Certificate Lifecycle Closure

## Governing Sources

- Domain model: `docs/DOMAIN_MODEL.md`
- Decisions/ADRs: ADR-002, ADR-007, ADR-008, ADR-009, ADR-035
- Local specs: certificate show/retry/revoke/delete specs, routing/domain/TLS workflow and errors
- Test matrix: `docs/testing/routing-domain-and-tls-test-matrix.md`

## Architecture Approach

- Domain/application placement: `Certificate` owns status transitions for retry admission, revoke,
  and delete; use cases coordinate repository, provider, secret-store, clock/id, and event
  publication.
- Repository/specification/visitor impact: add certificate-by-id read model support for
  `certificates.show`; persist new `revoked` and `deleted` statuses through existing text status
  storage.
- Event/CQRS/read-model impact: retry is a command producing a new attempt and
  `certificate-requested`; revoke/delete are commands producing `certificate-revoked` and
  `certificate-deleted`; show is a query.
- Entrypoint impact: operation catalog, oRPC/OpenAPI, CLI, and Web resource affordances must reuse
  command/query schemas.
- Persistence/migration impact: no schema migration is required for text status values; read model
  filtering must hide deleted certificates from list only if the query contract requires active-only
  listing.

## Roadmap And Compatibility

- Roadmap target: Phase 6 / `0.8.0`
- Version target: `0.8.0`
- Compatibility impact: `pre-1.0-policy`, backward-compatible new public operations and read fields
- Public surfaces: CLI, HTTP/oRPC, Web, public docs/help, operation catalog

## Testing Strategy

- Matrix ids:
  `ROUTE-TLS-CMD-024..029`, `ROUTE-TLS-READMODEL-013..014`,
  `ROUTE-TLS-ENTRY-026..029`, `ROUTE-TLS-EVT-015..016`,
  `ROUTE-TLS-BOUNDARY-007`
- Test-first rows: application command/query tests first, then persistence/read-model, shell e2e,
  Web resource affordance coverage.
- Acceptance/e2e: CLI/API public operation chains over hermetic state.
- Contract/integration/unit: core certificate transition tests, application use case tests,
  persistence/read-model tests.

## Risks And Migration Gaps

- Provider revocation is hermetic until real provider adapters implement CA-specific revoke. The
  port must be provider-neutral and safe.
- Imported certificate revocation is Appaloft-local; docs and output must not imply external CA
  revocation.
- No intentional post-Code-Round migration gap is planned for the minimal closure slice.
