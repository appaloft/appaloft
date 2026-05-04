# Plan: Applied Route Context Lookup Baseline

## Governing Sources

- Domain model: `docs/DOMAIN_MODEL.md`
- Operation map: `docs/BUSINESS_OPERATION_MAP.md` rows for resource access failure diagnostics,
  access failure evidence lookup, and route intent/status diagnostics
- Decisions/ADRs: ADR-017, ADR-019, ADR-024, ADR-029, ADR-030
- Local specs: route intent/status, access failure evidence lookup, automatic route context lookup,
  applied route context metadata, failure visibility baseline, companion/static renderer baseline
- Test matrix: `docs/testing/resource-access-failure-diagnostics-test-matrix.md`,
  `docs/testing/routing-domain-and-tls-test-matrix.md`

## Architecture Approach

- Domain/application placement: extend the existing internal automatic route context lookup service
  so `applied-route-context/v1` metadata and derived route metadata use the same read-only
  resolution path.
- Repository/specification/visitor impact: no new persistence API. The baseline reconstructs safe
  context from existing resource, deployment, domain binding, and route summary read models.
- Event/CQRS/read-model impact: no events and no mutations. Evidence lookup remains a QueryBus
  public read operation; renderer enrichment remains internal read behavior.
- Entrypoint impact: existing HTTP renderer, CLI request-id lookup, proxy preview, health,
  diagnostic summary, and static renderer keep their current public boundaries.
- Persistence/migration impact: none.

## Roadmap And Compatibility

- Roadmap target: Phase 6 / `0.8.0`.
- Version target: `0.8.0` only after all required Phase 6 rows close.
- Compatibility impact: additive `pre-1.0-policy`; no public operation/schema change.

## Testing Strategy

- Matrix ids:
  - `RES-ACCESS-DIAG-APPLIED-006`
  - `RES-ACCESS-DIAG-APPLIED-007`
  - `RES-ACCESS-DIAG-APPLIED-008`
  - `RES-ACCESS-DIAG-APPLIED-009`
  - `RES-ACCESS-DIAG-APPLIED-010`
  - `ROUTE-TLS-READMODEL-017`
- Test-first rows:
  - application lookup by diagnostic id;
  - application lookup by route/resource/deployment ids;
  - HTTP evidence capture proving applied metadata uses shared lookup before host/path fallback;
  - source preservation and safe provider/proxy/timestamp fields;
  - redaction and read-only guarantees.
- Acceptance/e2e: no real Traefik e2e in this slice.
- Contract/integration/unit: application unit and HTTP adapter integration tests are sufficient
  because public schemas are unchanged.

## Risks And Migration Gaps

- Lookup remains derived from current read models and supplied safe metadata. A future indexed
  persisted lookup must use composable specs and persistence visitors instead of ad-hoc finder
  methods.
- Real edge middleware e2e, provider-native metadata parsing, and a Web lookup form remain Phase 6
  gaps.
