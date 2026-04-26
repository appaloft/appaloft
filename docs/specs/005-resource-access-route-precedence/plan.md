# Plan: Resource Access Route Precedence

## Governing Sources

- Domain model: `docs/DOMAIN_MODEL.md`
- Decisions/ADRs: `docs/decisions/ADR-017-default-access-domain-and-proxy-routing.md`, `docs/decisions/ADR-019-edge-proxy-provider-and-observable-configuration.md`, `docs/decisions/ADR-024-pure-cli-ssh-state-and-server-applied-domains.md`
- Local specs: `docs/workflows/default-access-domain-and-proxy-routing.md`, `docs/workflows/edge-proxy-provider-and-route-realization.md`
- Test matrix: `docs/testing/default-access-domain-and-proxy-routing-test-matrix.md`

## Architecture Approach

- Domain/application placement: no write-side change; this is read-only current-route selection over `ResourceAccessSummary`.
- Repository/specification/visitor impact: none.
- Event/CQRS/read-model impact: CQRS boundary is unchanged; query/read consumers select from existing read-model fields.
- Entrypoint impact: Web resource detail and Quick Deploy completion use a shared helper for current-route precedence.
- Persistence/migration impact: none.

## Roadmap And Compatibility

- Roadmap target: Phase 6 access/domain/TLS closure toward `0.8.0`.
- Version target: pre-`1.0.0` roadmap line; no migration required.
- Compatibility impact: `pre-1.0-policy`, backward-compatible correction to existing Web route display behavior.

## Testing Strategy

- Matrix ids: `DEF-ACCESS-ENTRY-008`, `DEF-ACCESS-QRY-002`.
- Test-first rows: Web unit test for current-route selector precedence.
- Acceptance/e2e: WebView resource detail assertion for server-applied-over-generated display.
- Contract/integration/unit: existing application and persistence tests continue covering read-model route precedence for health, diagnostics, and proxy preview.

## Scope Boundaries

- Route intent update/delete/reconcile remains separate Phase 6 work and is not part of this slice.
- Broader CLI/API regression hardening remains tracked separately; this slice closes the Web current-route display behavior.
