# Plan: Platform Migration Journey

## Governing Sources

- ADR-113, Spec 135 and `docs/testing/platform-migration-journey-test-matrix.md`.
- Existing Project, Environment, Resource, deployment-config, DomainBinding, DependencyResource,
  StorageVolume, Deployment, recovery and proof decisions/specs.

## Architecture Approach

1. Add a versioned migration-bundle schema and vendor source-adapter interface outside core.
2. Implement Railway translation as an adapter; never leak Railway DTOs into domain/application.
3. Add a presentation/application coordinator that creates existing Command/Query messages only.
4. Use a digest-bound plan and safe receipts for resumability; add no aggregate, table or event.
5. Expose the same coordinator through CLI, HTTP/oRPC/SDK and Web.
6. Add an acceptance runner for web, Compose and stateful fixtures with exact manifests/cleanup.

## Test-First Strategy

- Parser/translation contract tests for `MIG-BUNDLE-001` and `MIG-SOURCE-002`.
- Coordinator/CommandBus/QueryBus tests for `MIG-PLAN-003` through `MIG-CLEAN-008`.
- CLI/HTTP/SDK/Web contract tests for `MIG-SURFACE-009` and `MIG-AUTH-013`.
- Real local Docker/composed control-plane packets for `MIG-WEB-010` through `MIG-STATEFUL-012`.

## Risks

- Vendor drift: strict versioned adapters and explicit unsupported fields.
- Partial mutation: dependency-ordered receipts, idempotency and reverse cleanup ownership.
- Secret exposure: secret references, stdin/credential-store boundaries and redaction tests.
- Scope duplication: coordinator may dispatch only catalog operations.

## Delivery Order

Governance merge -> ready Ticket -> RED tests -> public implementation/docs -> Cloud adoption and
three composed acceptance packets -> final boundary and sync.
