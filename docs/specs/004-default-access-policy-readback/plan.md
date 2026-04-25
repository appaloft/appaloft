# Plan: Default Access Policy Readback

## Governing Sources
- Domain model: `docs/DOMAIN_MODEL.md`
- Decisions/ADRs: `docs/decisions/ADR-017-default-access-domain-and-proxy-routing.md`, `docs/decisions/ADR-019-edge-proxy-provider-and-observable-configuration.md`, `docs/decisions/ADR-030-public-documentation-round-and-platform.md`
- Local specs: `docs/commands/default-access-domain-policies.configure.md`, `docs/workflows/default-access-domain-and-proxy-routing.md`, `docs/queries/default-access-domain-policies.show.md`, `docs/queries/default-access-domain-policies.list.md`
- Test matrix: `docs/testing/default-access-domain-and-proxy-routing-test-matrix.md`

## Architecture Approach
- Domain/application placement: add query messages, handlers, and query services under `packages/application/src/operations/default-access-domain-policies`.
- Repository/specification/visitor impact: extend the existing default access policy repository with `list()`; `show` reuses `DefaultAccessDomainPolicyByScopeSpec`.
- Event/CQRS/read-model impact: read-only queries; no event or projection ownership change.
- Entrypoint impact: operation catalog, oRPC/HTTP, CLI, and Web forms dispatch query messages.
- Persistence/migration impact: no schema migration; the existing `default_access_domain_policies` table already stores policy records.

## Roadmap And Compatibility
- Roadmap target: Phase 6 access policy and observability hardening, pulled forward as a v1 minimum access-loop closure slice while Phase 4 continues.
- Version target: next pre-1.0 release line.
- Compatibility impact: pre-1.0-policy; backward-compatible new read/query surfaces and Web form readback.

## Testing Strategy
- Matrix ids: `DEF-ACCESS-POLICY-008` through `DEF-ACCESS-POLICY-011`, `DEF-ACCESS-ENTRY-007`, `PUB-DOCS-002`, `PUB-DOCS-012`, `PUB-DOCS-016`.
- Test-first rows: application query-service tests for show/list; oRPC HTTP dispatch tests; CLI dispatch tests; Web readback test.
- Acceptance/e2e: Web server pages prefill policy forms from query results and invalidate readback after save.
- Contract/integration/unit: operation catalog/doc coverage and PG repository list round-trip.

## Risks And Migration Gaps

No remaining migration gaps are planned for this behavior. Static config fallback remains an
explicit fallback when no durable policy exists; it is not exposed as a persisted policy record.
