# Plan: Applied Route Context Metadata Contract Baseline

## Governing Sources

- `docs/DOMAIN_MODEL.md`
- ADR-002, ADR-017, ADR-019, ADR-024, ADR-029, ADR-030
- `docs/specs/020-route-intent-status-and-access-diagnostics/spec.md`
- `docs/specs/024-access-failure-evidence-lookup/spec.md`
- `docs/specs/025-automatic-route-context-lookup/spec.md`
- `docs/workflows/resource-access-failure-diagnostics.md`
- `docs/errors/resource-access-failure-diagnostics.md`
- `docs/testing/resource-access-failure-diagnostics-test-matrix.md`
- `docs/testing/routing-domain-and-tls-test-matrix.md`
- `docs/testing/resource-diagnostic-summary-test-matrix.md`

## Architecture Approach

- Add a provider-neutral `AppliedRouteContextMetadata` type at the application/contract boundary.
- Let `resources.proxy-configuration.preview` build metadata from existing resource, deployment,
  domain binding, server, destination, and route-source read state.
- Let edge proxy providers echo the metadata into provider-rendered route views and optional
  diagnostics without interpreting provider-native payloads.
- Let evidence capture prefer supplied applied metadata and fall back to the existing hostname/path
  automatic route context lookup.
- Keep core aggregates unchanged; this is read-model/adapter metadata, not mutable domain state.

## Testing Strategy

- `RES-ACCESS-DIAG-APPLIED-001`: generated access proxy preview includes safe applied route context.
- `RES-ACCESS-DIAG-APPLIED-002`: durable domain proxy preview includes safe domain binding route context.
- `RES-ACCESS-DIAG-APPLIED-003`: server-applied proxy preview includes safe server route context.
- `RES-ACCESS-DIAG-APPLIED-004`: evidence capture prefers supplied applied metadata before host/path lookup.
- `RES-ACCESS-DIAG-APPLIED-005`: applied metadata and enriched evidence stay redacted.

## Compatibility And Catalog

No new operation-catalog row is needed. Existing operation `resources.proxy-configuration.preview`
keeps its query boundary and receives additive safe output fields. `resources.access-failure-evidence.lookup`
keeps the same public operation and envelope shape, with route fields populated from the same safe
metadata when available.

## Verification

- Targeted application tests for proxy preview and automatic/evidence enrichment.
- Provider renderer tests for Traefik and Caddy route metadata echo.
- Contract schema test for proxy preview metadata.
- HTTP renderer/evidence capture test for applied metadata preference and redaction.
- `bun run typecheck`.
- `bun run lint`.
