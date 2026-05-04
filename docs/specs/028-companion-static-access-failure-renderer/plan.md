# Plan: Companion/Static Access Failure Renderer Baseline

## Governing Sources

- Domain model: `docs/DOMAIN_MODEL.md`
- Operation map: `docs/BUSINESS_OPERATION_MAP.md` row "Resource access failure diagnostics"
- Decisions/ADRs: ADR-017, ADR-019, ADR-024, ADR-029, ADR-030
- Local specs: resource access failure diagnostics workflow/error specs, route intent/status spec,
  access failure evidence lookup, automatic route context lookup, applied route context metadata,
  failure visibility baseline
- Test matrix: `docs/testing/resource-access-failure-diagnostics-test-matrix.md`,
  `docs/testing/routing-domain-and-tls-test-matrix.md`

## Architecture Approach

- Domain/application placement: keep diagnostic classification, sanitization, and rendering model
  in `packages/application`; transports and runtime adapters call shared helpers.
- Repository/specification/visitor impact: none. Static rendering does not add persistence lookup.
- Event/CQRS/read-model impact: none. Backend evidence capture may still use existing automatic
  route context lookup; static rendering without a backend cannot query read models.
- Entrypoint impact: no new API, CLI, Web, or operation catalog entry.
- Runtime packaging impact: adapter-owned static-site Docker builds package a static renderer asset
  at `/.appaloft/resource-access-failure` for one-shot/static runtime baseline coverage.

## Roadmap And Compatibility

- Roadmap target: Phase 6 / `0.8.0`
- Version target: pre-1.0 development line
- Compatibility impact: additive `pre-1.0-policy`; no public operation or schema change.

## Testing Strategy

- Matrix ids:
  - `RES-ACCESS-DIAG-STATIC-001`
  - `RES-ACCESS-DIAG-STATIC-002`
  - `RES-ACCESS-DIAG-STATIC-003`
  - `RES-ACCESS-DIAG-STATIC-004`
  - `ROUTE-TLS-BOUNDARY-008`
- Test-first rows:
  - application unit tests for shared rendering model and static renderer asset redaction.
  - runtime adapter tests for static Docker build asset packaging and Nginx route config.
- Acceptance/e2e: real Traefik/static companion e2e remains out of scope.
- Contract/integration/unit: no contract or oRPC change expected.

## Risks And Migration Gaps

- The static renderer can display only safe fields supplied to it. Automatic hostname/path route
  context lookup still requires the backend renderer/evidence path or a later provider metadata
  slice.
- Real Traefik middleware e2e, provider-native metadata lookup, and Web request-id lookup remain
  Phase 6 gaps.
