# Plan: Resource Detail Profile Editing

## Governing Sources

- Domain model: `docs/DOMAIN_MODEL.md`
- Decisions/ADRs: ADR-011, ADR-012, ADR-015, ADR-026, ADR-030
- Local specs: `docs/workflows/resource-profile-lifecycle.md`,
  `docs/commands/resources.configure-source.md`,
  `docs/commands/resources.configure-runtime.md`,
  `docs/commands/resources.configure-network.md`, `docs/queries/resources.show.md`
- Test matrix: `docs/testing/resource-profile-lifecycle-test-matrix.md`

## Architecture Approach

- Domain/application placement: no new domain operation. The existing `Resource` aggregate
  source/runtime/network command slices remain the write side.
- Repository/specification/visitor impact: none. Existing resource persistence and read models
  remain authoritative.
- Event/CQRS/read-model impact: no new events. Web writes through commands and observes through
  `resources.show` plus existing resource list/health/proxy query invalidation.
- Entrypoint impact: Web resource detail needs clearer profile edit boundary copy and test
  coverage. CLI/HTTP/oRPC remain on existing schemas.
- Persistence/migration impact: none.

## Roadmap And Compatibility

- Roadmap target: Phase 4 / `0.6.0`
- Version target: next minor after `0.5.0` when all Phase 4 gates complete; otherwise next
  `0.5.x` patch remains allowed by the roadmap gate.
- Compatibility impact: pre-1.0-policy, additive Web copy/docs/test coverage only. No schema or
  behavior-breaking public contract change.

## Testing Strategy

- Matrix ids: `RES-PROFILE-ENTRY-002`, `RES-PROFILE-ENTRY-012`, `PUB-DOCS-002`,
  `PUB-DOCS-003`, `PUB-DOCS-010`, `PUB-DOCS-016`.
- Test-first rows: add `RES-PROFILE-ENTRY-012` for the Web durable/future-only confirmation
  affordance.
- Acceptance/e2e: `apps/web/test/e2e-webview/home.webview.test.ts` verifies the resource detail
  page renders the boundary and still dispatches source/runtime/network commands.
- Contract/integration/unit: docs-registry operation/help tests verify public docs coverage and
  traceability.

## Risks And Migration Gaps

- No schema migration is required.
- Existing-resource profile drift visibility is intentionally deferred to Phase 7 and must not be
  implied by this resource detail editing closure.
