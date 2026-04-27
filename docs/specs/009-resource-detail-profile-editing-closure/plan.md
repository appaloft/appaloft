# Plan: Resource Detail Profile Editing Closure

## Governing Sources

- Domain model: `docs/DOMAIN_MODEL.md`
- Decisions/ADRs: ADR-011, ADR-012, ADR-013, ADR-014, ADR-015, ADR-017, ADR-020, ADR-026, ADR-030
- Local specs: `docs/workflows/resource-profile-lifecycle.md`,
  `docs/queries/resources.show.md`, `docs/queries/resources.effective-config.md`,
  `docs/commands/resources.configure-source.md`,
  `docs/commands/resources.configure-runtime.md`,
  `docs/commands/resources.configure-network.md`,
  `docs/commands/resources.configure-access.md`,
  `docs/commands/resources.configure-health.md`,
  `docs/commands/resources.set-variable.md`, and
  `docs/commands/resources.unset-variable.md`
- Test matrix: `docs/testing/resource-profile-lifecycle-test-matrix.md`,
  `docs/testing/resource-health-test-matrix.md`, and
  `docs/testing/public-documentation-test-matrix.md`

## Architecture Approach

- Domain/application placement: no new business operation. The existing `Resource` command/query
  slices remain authoritative.
- Repository/specification/visitor impact: none. Existing resource aggregate persistence and
  read-model/query services remain the source of durable profile state.
- Event/CQRS/read-model impact: no new event type. Existing commands emit their existing resource
  profile/configuration events; read paths remain `resources.show`, `resources.effective-config`,
  and `resources.health`.
- Entrypoint impact: close gaps in WebView, CLI dispatch, docs registry, public traceability, and
  roadmap/test-matrix alignment for the full source/runtime/network/access/health/configuration
  resource detail surface.
- Persistence/migration impact: none.

## Roadmap And Compatibility

- Roadmap target: Phase 4 / `0.6.0`
- Version target: next minor after `0.5.0` only after this PR is merged and release preflight
  rechecks `main`.
- Compatibility impact: pre-1.0-policy, additive documentation/test coverage and Web selector/copy
  clarity only. No public schema break.

## Testing Strategy

- Matrix ids: `RES-PROFILE-ENTRY-002`, `RES-PROFILE-ENTRY-003`,
  `RES-PROFILE-ENTRY-012`, `RES-PROFILE-ENTRY-013`, `RES-PROFILE-ENTRY-014`,
  `RES-HEALTH-CFG-006`, `PUB-DOCS-010`, and `PUB-DOCS-016`.
- Test-first rows: add/expand WebView rows for health policy and resource variable removal; expand
  CLI dispatch rows for source/network/health/unset coverage; expand docs-registry coverage for
  source/runtime/network/access/health/config topics.
- Acceptance/e2e: `apps/web/test/e2e-webview/home.webview.test.ts` proves resource detail health
  and configuration removal dispatch the named oRPC operations.
- Contract/integration/unit: existing application and HTTP/oRPC tests prove command/query schemas;
  CLI dispatch tests prove the remaining named commands are exposed without a generic update.

## Risks And Migration Gaps

- No schema migration is required.
- Existing `docs/specs/008-resource-detail-profile-editing` remains the source/runtime/network
  slice. This artifact closes the broader Phase 4 detail/profile editing exit criterion.
- Resource profile drift visibility remains a later roadmap/ledger item and is not implemented by
  this closure.
