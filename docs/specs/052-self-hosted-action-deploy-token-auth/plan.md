# Plan: Self-Hosted Action Deploy Token Auth

## Governing Sources

- Domain model: [Identity Governance](../../DOMAIN_MODEL.md), Organization.
- Decisions/ADRs: [ADR-025](../../decisions/ADR-025-control-plane-modes-and-action-execution.md),
  [ADR-043](../../decisions/ADR-043-self-hosted-action-deploy-token-authorization.md).
- Local specs: [Self-Hosted Action API Authentication](../../workflows/self-hosted-action-api-authentication.md),
  [Self-Hosted Action Auth Errors](../../errors/self-hosted-action-auth.md),
  [Action Server Config Deploy](../050-action-server-config-deploy/spec.md).
- Test matrix: [Self-Hosted Auth Test Matrix](../../testing/self-hosted-auth-test-matrix.md).

## Architecture Approach

- Domain/application placement:
  - model deploy-token identity, lifecycle status, scope, and safe metadata in identity governance;
  - expose an application token verifier/authenticator port for HTTP/oRPC and future CLI/server
    workflows;
  - keep Action workflow commands and deployment admission unchanged after actor authorization.
- Repository/specification/visitor impact:
  - add a deploy-token repository/read model in persistence during Code Round;
  - store only verifier/hash and safe metadata, never raw token values;
  - prefer selection specs such as token id, verifier digest, active status, organization, and scope.
- Event/CQRS/read-model impact:
  - token lifecycle commands are write-side operations with safe read models for list/show;
  - Action auth itself is an admission gate, not a deployment event producer.
- Entrypoint impact:
  - HTTP/oRPC protects `POST /api/action/deployments/from-source-link`,
    `POST /api/action/deployments/from-config-package`, and self-hosted Action
    `POST /api/deployments/cleanup-preview`;
  - installer and deploy-action wrapper need token creation/passing surfaces;
  - Web/CLI token management can be implemented after the first guarded endpoint slice if recorded
    as a migration gap.
- Persistence/migration impact:
  - add deploy token tables or extend Better Auth-compatible storage only through
    `packages/persistence/pg`;
  - include token id, verifier digest, organization id, optional scope fields, lifecycle status,
    created/rotated/revoked timestamps, and safe display name.

## Roadmap And Compatibility

- Roadmap target: Phase 8, `0.10.0`.
- Version target: pre-`1.0.0`; current roadmap release rule remains `0.9.x` until Phase 8 closes.
- Compatibility impact: `pre-1.0-policy`; self-hosted Action mutation endpoints change from
  effectively anonymous to token-required. Release notes and migration guidance are required.

## Testing Strategy

- Matrix ids:
  - `SELF-AUTH-ACTION-001` through `SELF-AUTH-ACTION-007`;
  - `SELF-AUTH-TOKEN-001` through `SELF-AUTH-TOKEN-004`;
  - `SELF-AUTH-DOCS-001`.
- Test-first rows:
  - HTTP/oRPC endpoint rejection before command dispatch;
  - token verifier/authenticator unit and persistence tests;
  - installer/deploy-action wrapper token passing tests.
- Acceptance/e2e:
  - self-hosted Action source-link deploy and server config deploy require bearer token before
    mutation;
  - preview cleanup requires token in self-hosted Action server mode.
- Contract/integration/unit:
  - contract schemas for auth failure responses;
  - application scope evaluation;
  - PG/PGlite token storage redaction and lifecycle.

## Risks And Migration Gaps

- First-admin login and OAuth remain separate Phase 8 slices.
- Web token management can remain a migration gap only if installer/CLI token bootstrap and
  rotation/revocation have another supported operator path.
- Existing users of self-hosted Action server mode need a migration note because Action mutation
  endpoints become token-required.
- Authorization must fail closed when token storage or verifier configuration is unavailable.
