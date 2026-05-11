# Plan: Self-Hosted First Admin Bootstrap

## Governing Sources

- Domain model: [Identity Governance](../../DOMAIN_MODEL.md), Organization.
- Decisions/ADRs: [ADR-044](../../decisions/ADR-044-self-hosted-first-admin-bootstrap.md).
- Local specs: [Self-Hosted First Admin Bootstrap Workflow](../../workflows/self-hosted-first-admin-bootstrap.md),
  [Self-Hosted Product Auth Errors](../../errors/self-hosted-product-auth.md).
- Test matrix: [Self-Hosted Product Auth Test Matrix](../../testing/self-hosted-product-auth-test-matrix.md).

## Architecture Approach

- Domain/application placement:
  - keep user/session provider specifics out of core and application;
  - expose first-admin bootstrap/status through application messages and ports;
  - let `@appaloft/auth-better` implement local email/password user creation and organization
    bootstrap through Better Auth capabilities.
- Repository/read-model impact:
  - add Appaloft-owned status/read ports for existing first-admin and organization-owner presence;
  - persistence may inspect Better Auth-compatible tables inside `packages/persistence/pg` only.
- Entrypoint impact:
  - installer/shell may call bootstrap during startup from trusted config;
  - HTTP/oRPC bootstrap/status endpoints dispatch messages and remain explicitly public only for
    bootstrap status/setup.
- Secret handling:
  - generated password material is one-time output;
  - supplied or generated bootstrap secrets are masked in logs and read models.

## Testing Strategy

- Matrix ids:
  - `FIRST-ADMIN-STATUS-001`;
  - `FIRST-ADMIN-BOOTSTRAP-001` through `FIRST-ADMIN-BOOTSTRAP-004`;
  - `PRODUCT-AUTH-GATE-001` through `PRODUCT-AUTH-GATE-003`;
  - `PRODUCT-AUTH-DOCS-001`.
- Test-first rows:
  - application bootstrap use case with fake auth adapter/read model/password issuer;
  - Better Auth adapter test proving Appaloft port can create local user + organization owner;
  - installer/shell bootstrap output test for generated password redaction;
  - HTTP/oRPC 401/403 gate tests after policy implementation starts.

## Risks And Migration Gaps

- Better Auth APIs can change; adapter tests must pin the Appaloft-owned contract.
- Direct persistence reads of Better Auth-compatible tables must stay inside `packages/persistence/pg`.
- Public deploy-token lifecycle operations remain blocked until admin authorization is active.
