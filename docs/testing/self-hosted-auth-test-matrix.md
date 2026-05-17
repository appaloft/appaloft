# Self-Hosted Auth Test Matrix

## Normative Contract

Phase 8 auth tests must prove that self-hosted Action mutation endpoints require an Appaloft deploy
token before mutation, that token scope gates authorization, and that token lifecycle behavior never
persists or returns raw token material except one-time trusted output.

## Global References

- [ADR-043: Self-Hosted Action Deploy Token Authorization](../decisions/ADR-043-self-hosted-action-deploy-token-authorization.md)
- [Self-Hosted Action Deploy Token Auth](../specs/052-self-hosted-action-deploy-token-auth/spec.md)
- [Self-Hosted Action API Authentication](../workflows/self-hosted-action-api-authentication.md)
- [Self-Hosted Action Auth Error Spec](../errors/self-hosted-action-auth.md)
- [Control-Plane Modes Test Matrix](./control-plane-modes-test-matrix.md)
- [Error Model](../errors/model.md)

## Matrix

| Test ID | Preferred automation | Case | Given | Expected result | Expected error | Expected operation sequence |
| --- | --- | --- | --- | --- | --- | --- |
| SELF-AUTH-ACTION-001 | HTTP/oRPC contract | Missing Action bearer token | `POST /api/action/deployments/from-source-link`, `POST /api/action/deployments/from-config-package`, or self-hosted Action `POST /api/deployments/cleanup-preview` has no bearer token | Request rejects before command dispatch or state mutation | `action_auth_missing`, `401`, phase `action-authentication` | Parse request -> auth reject -> no command dispatch |
| SELF-AUTH-ACTION-002 | HTTP/oRPC contract | Invalid Action bearer token | Action mutation endpoint receives malformed, unknown, expired, revoked, or unverifiable token | Request rejects before command dispatch or state mutation | `action_auth_invalid`, `401`, phase `action-authentication` | Parse request -> token verify -> auth reject -> no command dispatch |
| SELF-AUTH-ACTION-003 | HTTP/application contract | Valid token actor context | Action mutation endpoint receives a valid token with matching scope | Existing Action workflow command dispatch receives an authenticated Action actor with token id and safe scopes only | None | Auth verify -> authorization -> existing workflow command dispatch |
| SELF-AUTH-ACTION-004 | HTTP/application contract | Scope mismatch | Valid token lacks endpoint, project, environment, resource, repository, preview workflow, or command scope for the request | Request rejects before package, source-link, profile, route, preview, or deployment mutation | `action_auth_forbidden`, `403`, phase `action-authorization` | Auth verify -> scope reject -> no command dispatch |
| SELF-AUTH-ACTION-005 | HTTP/application contract | Source-link deploy auth gate | Source-link Action deploy request is valid and token scope permits source-link deployment | Route dispatches `CreateActionSourceLinkDeploymentCommand` only after auth succeeds | None | Auth verify -> scope check -> source-link deployment command |
| SELF-AUTH-ACTION-006 | HTTP/application contract | Server config deploy auth gate | Server config deploy request has valid package metadata and token scope permits server config deploy | Route begins package/config workflow only after auth succeeds | None | Auth verify -> scope check -> package validation -> config workflow |
| SELF-AUTH-ACTION-007 | HTTP/application contract | Preview cleanup auth gate | Self-hosted Action preview cleanup request includes valid token scope for preview cleanup | Route dispatches `deployments.cleanup-preview` only after auth succeeds | None | Auth verify -> scope check -> cleanup command |
| SELF-AUTH-TOKEN-001 | unit/integration | One-time deploy token creation | Installer/bootstrap requests initial deploy token | Raw value is returned once through trusted output, verifier/hash is persisted, and safe metadata omits raw value | None or `deploy_token_bootstrap_failed` | Generate token -> persist verifier -> return one-time raw value |
| SELF-AUTH-TOKEN-002 | unit/integration | Deploy token rotation | Existing active token is rotated | New raw value is returned once, old verifier no longer authenticates according to policy, scopes are preserved, and safe metadata records rotation | None or `deploy_token_rotation_blocked` | Load token -> rotate verifier -> return one-time raw value |
| SELF-AUTH-TOKEN-003 | unit/integration | Deploy token revocation | Existing active token is revoked | Future Action requests with that token return `action_auth_invalid`; safe metadata records revoked status | None or `deploy_token_revoke_blocked` | Load token -> mark revoked -> verify rejects old token |
| SELF-AUTH-TOKEN-004 | persistence/pg | Token storage redaction | Token persistence and read models are inspected | No raw token, verifier secret, or bearer header appears in read models, logs, errors, or public responses | None | Persist verifier -> read safe metadata |
| SELF-AUTH-TOKEN-005 | HTTP/oRPC contract | Admin-protected lifecycle entrypoints | `GET/POST /api/deploy-tokens*` is called with and without an admin product session | Missing or insufficient product sessions reject before command/query dispatch; admin sessions dispatch `deploy-tokens.*`; list/show return safe metadata, create/rotate return raw token only once | `product_auth_missing` 401 or `product_auth_forbidden` 403 | Product session auth -> command/query dispatch |
| SELF-AUTH-TOKEN-006 | CLI contract | Operator lifecycle entrypoints | `appaloft deploy-token create/list/show/rotate/revoke` is invoked with explicit organization and confirmation input | CLI dispatches the matching `deploy-tokens.*` command/query through CommandBus/QueryBus and prints only command/query output JSON | Validation error for malformed scope or confirmation | CLI parse -> command/query dispatch |
| SELF-AUTH-DOCS-001 | docs/help | Public docs and help coverage | Deploy token auth is user-visible | Docs/help explain setup, GitHub Secret use, 401/403, scopes, rotation, revocation, and that self-hosted Action mutation endpoints no longer accept anonymous requests | None | Docs registry/help lookup |

## Current Implementation Notes

- 2026-05-10 Code Round slice covers `SELF-AUTH-ACTION-001`, `SELF-AUTH-ACTION-002`, and
  `SELF-AUTH-ACTION-003` for `POST /api/action/deployments/from-source-link` with
  `packages/orpc/test/deployment-create.http.test.ts`.
- The same Code Round now covers `SELF-AUTH-ACTION-004` with safe request-scope facts and a 403
  pre-dispatch rejection for source-link deploy scope mismatch.
- The same Code Round wires the guard ahead of `POST /api/action/deployments/from-config-package`;
  `packages/orpc/test/deployment-create.http.test.ts` now covers
  `[SELF-AUTH-ACTION-001][SELF-AUTH-ACTION-006]` for missing-token rejection before config-deploy
  mutation, and existing config-deploy tests pass only when the test deploy-token verifier and
  bearer token are present.
- `SELF-AUTH-ACTION-007` is covered by `packages/orpc/test/deployment-create.http.test.ts` for the
  Action-marked cleanup admission gate and by `scripts/test/deploy-action-wrapper.test.ts` for
  wrapper forwarding of the bearer token plus `X-Appaloft-Action-Command: preview-cleanup`.
- Shell static-token verification from `APPALOFT_ACTION_DEPLOY_TOKEN` is covered by
  `apps/shell/test/action-deploy-token-authorization.test.ts`; runtime feature advertisement is
  covered by `packages/adapters/http-elysia/test/version.test.ts`.
- `packages/core/test/deploy-token.test.ts` covers the foundational core model for
  `SELF-AUTH-TOKEN-001`, `SELF-AUTH-TOKEN-002`, and `SELF-AUTH-TOKEN-003`; public release
  readiness still requires entrypoint/catalog coverage even though core, persistence, and
  application-layer behavior are now covered.
- `packages/persistence/pg/test/deploy-token.pglite.test.ts` covers verifier digest persistence,
  safe read-model redaction, rotation persistence, and revocation blocking active verifier lookup for
  `SELF-AUTH-TOKEN-001` through `SELF-AUTH-TOKEN-004`.
- `packages/application/test/deploy-token-create.test.ts` covers the application one-time token
  creation boundary for `SELF-AUTH-TOKEN-001`: `CreateDeployTokenUseCase` returns the raw token once,
  persists only verifier digest and safe suffix metadata, and emits safe lifecycle events through an
  application-owned `DeployTokenMaterialIssuer` port.
- The same application test file covers `SELF-AUTH-TOKEN-002` and `SELF-AUTH-TOKEN-003` for
  `RotateDeployTokenUseCase` and `RevokeDeployTokenUseCase`: rotation preserves scopes, returns the
  new raw token once, invalidates the old verifier immediately, and revocation blocks later active
  verifier lookup.
- The same application test file covers command/handler dispatch and operation-catalog entries for
  `deploy-tokens.create`, `deploy-tokens.rotate`, and `deploy-tokens.revoke`; the catalog entries
  now declare admin-protected HTTP/oRPC transports.
- The same application test file covers query/handler dispatch and operation-catalog entries for
  `deploy-tokens.list` and `deploy-tokens.show`; list/show return safe metadata only and the show
  query returns `not_found` with phase `deploy-token-read` for absent tokens.
- `packages/orpc/test/deploy-token-lifecycle.http.test.ts` covers `SELF-AUTH-TOKEN-005` for
  missing-session rejection, admin-session dispatch, actor propagation, safe list/show metadata, and
  one-time raw token output from create/rotate HTTP/oRPC routes.
- `packages/adapters/cli/test/deploy-token-command.test.ts` covers `SELF-AUTH-TOKEN-006` for
  deploy-token create/list/show/rotate/revoke CLI dispatch using the same application
  command/query messages.
- `apps/shell/test/deploy-token-bootstrap.test.ts` and `scripts/test/install-sh.test.ts` cover
  `SELF-AUTH-TOKEN-001` / `ACTION-AUTH-SPEC-008` for installer bootstrap handoff output: Shell
  startup creates the initial token through `CreateDeployTokenCommand` only when no active token
  exists, writes the raw value to the configured handoff file once, and Docker installer output
  prints the token without storing it in `.env`.
- `apps/shell/test/action-deploy-token-authorization.test.ts` covers both static bootstrap token
  authorization and the `@appaloft/auth-better` persisted verifier authorization port through the
  application-owned deploy-token repository interface.
- Shell composition now wires persisted verifier storage by default while preserving the static
  bootstrap verifier when `APPALOFT_ACTION_DEPLOY_TOKEN` is configured.
- Deploy-token lifecycle CLI, HTTP/oRPC, Web `/organization`, and catalog activation are covered.
  Future MCP token management remains a named migration gap.
