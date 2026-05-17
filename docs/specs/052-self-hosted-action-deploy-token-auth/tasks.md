# Tasks: Self-Hosted Action Deploy Token Auth

## Test-First

- [x] `SELF-AUTH-ACTION-001`: add HTTP/oRPC test proving missing bearer token rejects
  `POST /api/action/deployments/from-source-link` before command dispatch.
- [x] `SELF-AUTH-ACTION-002`: add HTTP/oRPC test proving invalid, expired, or revoked token rejects
  Action mutation endpoints before command dispatch.
- [x] `SELF-AUTH-ACTION-003`: add application/HTTP test proving valid token actor context reaches
  Action workflow dispatch without exposing raw token value.
- [x] `SELF-AUTH-ACTION-004`: add application/HTTP test proving scope mismatch returns `403`
  before mutation.
- [x] `SELF-AUTH-ACTION-007`: add HTTP/application and deploy-action wrapper tests proving
  self-hosted Action preview cleanup sends an Action auth marker, requires a bearer token, and
  dispatches cleanup only after auth succeeds.
- [x] `SELF-AUTH-TOKEN-001`: add unit/persistence tests for one-time token creation and verifier
  storage without raw token persistence.
- [x] `SELF-AUTH-TOKEN-002`: add tests for rotate preserving scopes and invalidating the old
  verifier according to the accepted grace policy.
- [x] `SELF-AUTH-TOKEN-003`: add tests for revoke blocking future Action calls.

## Source Of Truth

- [x] Add ADR-043 for deploy-token authorization.
- [x] Add feature artifact `docs/specs/052-self-hosted-action-deploy-token-auth`.
- [x] Add self-hosted Action auth workflow spec.
- [x] Add self-hosted Action auth error spec.
- [x] Add self-hosted auth test matrix rows.
- [x] Add command/query specs for accepted-candidate deploy-token lifecycle operations.
- [x] Add application command/handler and operation-catalog entries for `deploy-tokens.create`,
  `deploy-tokens.rotate`, and `deploy-tokens.revoke`.
- [x] Add application query/handler and operation-catalog entries for `deploy-tokens.list` and
  `deploy-tokens.show`.
- [x] Activate deploy-token lifecycle HTTP/oRPC operations behind first-admin/admin product
  authorization with catalog, contract, and entrypoint tests aligned.
- [x] Activate deploy-token lifecycle CLI operations through the same application command/query
  messages with catalog, public docs, and entrypoint tests aligned.

## Implementation

- [x] Add identity-governance deploy-token domain model or value objects for token id, token scope,
  token status, token verifier metadata, and one-time raw token output boundary.
- [x] Add application authenticator/verifier port, initial static-token verifier, and scope
  evaluator.
- [x] Add PG/PGlite persistence for token verifier and safe read models under
  `packages/persistence/pg`.
- [x] Add application `CreateDeployTokenUseCase` and deploy-token material issuer port so raw
  token generation stays behind an application-owned abstraction and Better Auth stays swappable.
- [x] Add HTTP/oRPC bearer-token guard for source-link and server-config Action mutation endpoints.
- [x] Add self-hosted Action preview-cleanup auth marker and bearer-token guard without changing
  ordinary non-Action cleanup semantics.
- [x] Add installer/bootstrap token generation and safe one-time output.
- [x] Add application rotate/revoke use cases that preserve safe one-time token output and block
  revoked verifier authentication; entrypoints and catalog activation remain pending.

## Entrypoints And Docs

- [x] Update deploy-action wrapper to send deploy token from trusted Action input/env.
- [x] Update public self-hosted Action docs/help with token setup, scopes, 401/403, rotation, and
  revocation.
- [x] Add Web token management after CLI/HTTP/oRPC authorization is active, and record future MCP
  token management as a named migration gap.

## Verification

- [x] Run targeted HTTP/oRPC tests for Action auth rows.
- [x] Run targeted application/config/HTTP tests for the static deploy-token verifier slice.
- [x] Run targeted core tests for deploy-token lifecycle, verifier metadata redaction boundary, and
  scope evaluation.
- [x] Run targeted PG/PGlite tests for deploy-token verifier persistence, safe read models, rotation,
  and revocation.
- [x] Run targeted auth-adapter tests for persisted verifier authorization through the
  application-owned deploy-token repository port.
- [x] Run targeted application tests for deploy-token create/rotate/revoke one-time raw material
  and verifier lifecycle behavior.
- [x] Run deploy-action wrapper tests for token forwarding.
- [x] Run installer/bootstrap tests for one-time deploy-token handoff output.
- [x] Run docs/help registry tests for `SELF-AUTH-DOCS-001`.
- [x] Run targeted HTTP/oRPC tests for admin-protected deploy-token lifecycle routes.
- [x] Run targeted CLI tests for deploy-token lifecycle commands.

## Post-Implementation Sync

- [x] Reconcile roadmap Phase 8 notes, `BUSINESS_OPERATION_MAP.md`, `CORE_OPERATIONS.md`,
  operation catalog, specs, test matrix, public docs, and remaining migration gaps.

## Current Implementation Notes And Migration Gaps

- 2026-05-10 Code Round slice implemented bearer-token admission for
  `POST /api/action/deployments/from-source-link` and
  `POST /api/action/deployments/from-config-package`.
- The same slice now passes safe request scope facts into the application-owned authorization port
  after body validation and before command dispatch. Scope mismatch returns
  `action_auth_forbidden` with `403`.
- The current target-resolution slice returns safe resolved token scope to source-link/server-config
  application commands. Complete target scope can resolve id-free Action deploys, and explicit ids,
  existing source links, or repository facts outside scope fail before mutation.
- The shell composition root wires the `@appaloft/auth-better` static verifier from
  `APPALOFT_ACTION_DEPLOY_TOKEN`. This is an operator-provided bootstrap path, not the final
  deploy-token lifecycle model.
- Static bootstrap token scope can be constrained through `APPALOFT_ACTION_DEPLOY_TOKEN_PROJECT_ID`,
  `APPALOFT_ACTION_DEPLOY_TOKEN_ENVIRONMENT_ID`, `APPALOFT_ACTION_DEPLOY_TOKEN_RESOURCE_ID`,
  `APPALOFT_ACTION_DEPLOY_TOKEN_SERVER_ID`,
  `APPALOFT_ACTION_DEPLOY_TOKEN_REPOSITORY_FULL_NAME`, and
  `APPALOFT_ACTION_DEPLOY_TOKEN_WORKFLOWS`.
- Better Auth remains behind `@appaloft/auth-better` implementations and application-owned ports;
  core and application must not import Better Auth types.
- The deploy-action wrapper now marks self-hosted `preview-cleanup` calls with
  `X-Appaloft-Action-Command: preview-cleanup`; that Action-marked cleanup path requires the same
  deploy-token auth gate before dispatching `deployments.cleanup-preview`.
- A foundational `DeployToken` aggregate and deploy-token value objects now live in
  `packages/core/src/identity-governance/deploy-token.ts`. They model safe verifier metadata,
  status, scope checks, rotation, revocation, and last-used metadata without storing raw token
  material.
- PG/PGlite migration `061_deploy_tokens`, `PgDeployTokenRepository`, and
  `PgDeployTokenReadModel` now persist verifier digests plus safe metadata and expose list/show
  summaries without raw token or verifier values.
- `@appaloft/auth-better` now includes `PersistedActionDeployTokenAuthorizationPort`, which hashes
  presented bearer tokens, looks up active persisted verifier digests through the application-owned
  deploy-token repository port, evaluates core scope rules, and returns a safe deploy-token actor.
- Application now includes `CreateDeployTokenUseCase` and `DeployTokenMaterialIssuer`. The use case
  returns the raw token once, persists only verifier digest and safe suffix metadata, and keeps raw
  token material generation behind the Appaloft-owned port implemented by `@appaloft/auth-better`.
- Application now also includes `RotateDeployTokenUseCase` and `RevokeDeployTokenUseCase`. Rotation
  preserves existing scopes, returns the new raw token once, and immediately invalidates the old
  verifier. Revocation is idempotent for already revoked tokens and blocks future active verifier
  lookup.
- `deploy-tokens.create`, `deploy-tokens.rotate`, and `deploy-tokens.revoke` now have application
  command/handler classes, operation-catalog entries, typed client contract coverage, and
  admin-protected HTTP/oRPC routes. Raw token material is returned only from create/rotate
  responses.
- `deploy-tokens.list` and `deploy-tokens.show` now have application query/handler classes,
  operation-catalog entries, typed client contract coverage, and admin-protected HTTP/oRPC routes.
  They return safe deploy-token summaries without raw token or verifier values.
- Shell composition now uses persisted verifier storage by default and keeps
  `APPALOFT_ACTION_DEPLOY_TOKEN` as the operator-provided bootstrap fallback when configured.
- Docker self-host installs can opt into deploy-token handoff with `--bootstrap-deploy-token`,
  setting `APPALOFT_BOOTSTRAP_DEPLOY_TOKEN_OUTPUT_FILE`; Shell startup uses `ListDeployTokensQuery`
  and `CreateDeployTokenCommand` to create an initial deploy token only when no active token exists
  for `org_self_hosted`, writes the raw token to the container-local handoff file once, and the
  installer reads and removes that file before printing the token in trusted install output.
  Reinstall output is idempotent and omits raw token material when an active token already exists.
  Plain SSH install does not create a deploy token by default.
- Public docs now cover installer bootstrap output, GitHub Secret wiring through `appaloft-token`,
  scope meaning, 401/403 recovery, and CLI plus admin-protected HTTP/oRPC lifecycle endpoints under
  `self-hosting/action-deploy-token-auth#self-hosting-action-deploy-token-auth`. Web
  `/organization` token management is active; concrete future MCP token management remains a later
  Phase 8 gap.
