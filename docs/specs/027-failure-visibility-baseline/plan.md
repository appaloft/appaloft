# Plan: Access/Proxy/Log/Health Failure Visibility Baseline

## Governing Sources

- Domain model: `docs/DOMAIN_MODEL.md`
- Decisions/ADRs: ADR-017, ADR-018, ADR-019, ADR-020, ADR-024, ADR-029, ADR-030
- Local specs: `docs/specs/020-route-intent-status-and-access-diagnostics`,
  `docs/specs/024-access-failure-evidence-lookup`,
  `docs/specs/025-automatic-route-context-lookup`,
  `docs/specs/026-applied-route-context-metadata`,
  `docs/workflows/resource-access-failure-diagnostics.md`,
  `docs/errors/resource-access-failure-diagnostics.md`
- Test matrix: `docs/testing/resource-access-failure-diagnostics-test-matrix.md`,
  `docs/testing/resource-diagnostic-summary-test-matrix.md`,
  `docs/testing/routing-domain-and-tls-test-matrix.md`,
  `docs/testing/resource-health-test-matrix.md`

## Architecture Approach

- Domain/application placement: keep behavior in application read/query services and shared
  diagnostic sanitization helpers. Do not move provider-specific parsing into core or aggregates.
- Repository/specification/visitor impact: none. Existing read models and query services are reused.
- Event/CQRS/read-model impact: no events; queries remain read-only and dispatch through existing
  `QueryBus` entrypoints.
- Entrypoint impact: existing API/oRPC, CLI JSON, Web helpers, and future tool consumers reuse the
  same query responses. No new operation catalog row.
- Persistence/migration impact: none.

## Roadmap And Compatibility

- Roadmap target: Phase 6 / `0.8.0`.
- Version target: `0.8.0` gate, not release-selected until all Phase 6 required rows are complete.
- Compatibility impact: `pre-1.0-policy`; this slice tightens safe diagnostic output and does not
  add a public operation.

## Testing Strategy

- Matrix ids:
  - `RES-DIAG-QRY-019`
  - `ACCESS-DIAG-005`
  - `ROUTE-TLS-READMODEL-016`
  - `RES-HEALTH-QRY-021`
- Test-first rows:
  - application diagnostic summary test for proxy/log/access source error sanitization and copy JSON
    safety;
  - application health test for probe/source error sanitization and latest access failure context.
- Acceptance/e2e: existing API/oRPC and CLI access regression harness remains sufficient because no
  public schema or operation is added.
- Contract/integration/unit: application unit/integration tests cover shared sanitizer behavior.

## Risks And Migration Gaps

- Real Traefik middleware e2e, companion/static renderer support, provider-native metadata lookup,
  and Web request-id lookup remain separate Phase 6 gaps.
- The baseline redacts unsafe failure messages; it does not claim log archival, search, or full raw
  runtime-log scrub coverage when the caller explicitly requests bounded log lines.
