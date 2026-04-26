# Plan: Resource Access Profile Configuration

## Governing Sources

- Domain model: `docs/DOMAIN_MODEL.md`
- Decisions/ADRs: ADR-012, ADR-015, ADR-017, ADR-026, ADR-030
- Local specs: `docs/commands/resources.configure-access.md`,
  `docs/workflows/resource-profile-lifecycle.md`, `docs/errors/resources.lifecycle.md`
- Test matrix: `docs/testing/resource-profile-lifecycle-test-matrix.md`

## Architecture Approach

- Domain/application placement: add `ResourceAccessProfile` state to the `Resource` aggregate and a
  `resources.configure-access` vertical slice in `packages/application`.
- Repository/specification/visitor impact: persist access profile as resource aggregate JSON through
  the existing `ResourceRepository`.
- Event/CQRS/read-model impact: emit `resource-access-configured`; expose profile through
  `resources.show` / resource read model.
- Entrypoint impact: operation catalog, HTTP/oRPC route, CLI subcommand, Web resource detail access
  settings.
- Persistence/migration impact: add nullable `resources.access_profile` JSON column.

## Roadmap And Compatibility

- Roadmap target: Phase 4 / `0.6.0`
- Version target: next minor after `0.5.0`
- Compatibility impact: pre-1.0-policy, additive public operation and response field.

## Testing Strategy

- Matrix ids: `RES-PROFILE-ACCESS-001` through `RES-PROFILE-ACCESS-006`,
  `RES-PROFILE-ENTRY-009` through `RES-PROFILE-ENTRY-011`.
- Test-first rows: application command, planned generated route suppression/prefix, HTTP route,
  CLI dispatch, Web form dispatch.
- Acceptance/e2e: HTTP/oRPC, CLI dispatch, Web resource detail mutation.
- Contract/integration/unit: core aggregate, repository persistence, planned access/read model,
  deployment route snapshot.

## Risks And Migration Gaps

- No intentional migration gaps. Existing resources without `access_profile` inherit generated
  access policy and use `/` path prefix.
