# Plan: Real Traefik Access Failure Middleware E2E Baseline

## Governing Sources

- Domain model: `docs/DOMAIN_MODEL.md`
- Operation map: `docs/BUSINESS_OPERATION_MAP.md` rows for resource access failure diagnostics,
  route intent/status diagnostics, edge proxy provider and route realization, and routing/domain/TLS
- Decisions/ADRs: ADR-017, ADR-018, ADR-019, ADR-024, ADR-029, ADR-030
- Global contracts: `docs/errors/model.md`, `docs/errors/neverthrow-conventions.md`,
  `docs/architecture/async-lifecycle-and-acceptance.md`
- Local specs: `docs/workflows/resource-access-failure-diagnostics.md`,
  `docs/workflows/edge-proxy-provider-and-route-realization.md`,
  `docs/errors/resource-access-failure-diagnostics.md`,
  `docs/specs/024-access-failure-evidence-lookup`,
  `docs/specs/025-automatic-route-context-lookup`,
  `docs/specs/026-applied-route-context-metadata`,
  `docs/specs/028-companion-static-access-failure-renderer`,
  `docs/specs/029-applied-route-context-lookup`
- Test matrix: `docs/testing/resource-access-failure-diagnostics-test-matrix.md`,
  `docs/testing/routing-domain-and-tls-test-matrix.md`

## Architecture Approach

- Domain/application placement: reuse existing application diagnostic classification, sanitization,
  rendering, evidence capture, and applied route context enrichment helpers.
- Provider placement: keep Traefik-specific error middleware labels inside
  `packages/providers/edge-proxy-traefik`; only safe provider-neutral route context may be rendered
  into the diagnostic request.
- Runtime placement: use existing local/SSH runtime `resourceAccessFailureRenderer` target plumbing.
  CLI/runtime one-shot use of an explicit renderer URL is allowed only when configured through the
  existing topology override.
- Repository/specification/visitor impact: none. Evidence lookup already uses composable selection
  specs and PG/PGlite projection storage.
- Event/CQRS/read-model impact: no events and no mutations. Public lookup remains a QueryBus path.
- Entrypoint impact: existing HTTP renderer and evidence lookup surfaces are reused.
- Persistence/migration impact: none.

## Roadmap And Compatibility

- Roadmap target: Phase 6 / `0.8.0`.
- Version target: `0.8.0` only after all required Phase 6 rows close.
- Compatibility impact: additive `pre-1.0-policy`; no public operation or schema change.

## Testing Strategy

- Matrix ids:
  - `RES-ACCESS-DIAG-REAL-001`
  - `RES-ACCESS-DIAG-REAL-002`
  - `RES-ACCESS-DIAG-REAL-003`
  - `ROUTE-TLS-BOUNDARY-009`
- Test-first rows:
  - provider contract proves Traefik served route error middleware can carry safe applied route
    context to the renderer query without leaking unsafe fields;
  - HTTP renderer integration proves safe request headers/forwarded path data are normalized when
    real Traefik supplies them;
  - opt-in Docker/Traefik e2e proves a real gateway-generated upstream failure returns a safe
    diagnostic and can be retrieved by request id.
- Acceptance/e2e: opt-in only through `APPALOFT_E2E_PROXY_DOCKER=true` so default CI is not blocked
  by Docker/port/Traefik availability unless the existing proxy e2e gate is selected.
- Contract/integration/unit: provider and HTTP adapter tests remain default deterministic coverage.

## Risks And Migration Gaps

- Real Traefik e2e is Docker/port dependent and remains opt-in under the existing proxy e2e gate.
- Provider-native metadata lookup beyond safe Appaloft-applied metadata remains a later Phase 6
  slice.
- Web request-id lookup form remains a later UI slice.
