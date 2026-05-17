# Self-Hosted Action Deploy Token Auth

## Status

- Round: Post-Implementation Sync
- Artifact state: active baseline for Action endpoint admission and deploy-token lifecycle;
  concrete future MCP descriptors remain a named Phase 8 migration gap

## Business Outcome

A self-hosted Appaloft instance must reject unauthenticated GitHub Action mutation requests before
they can create deployments, update source links, apply repository config, mutate routes, or clean
up previews. Operators need a deploy token they can put in GitHub Secrets, rotate when exposed, and
scope so one repository does not get global mutation authority over the whole instance.

This is the first authentication and authorization slice for Phase 8. It hardens Action/API entry
workflows without requiring external OAuth or an interactive user session.

## Ubiquitous Language

| Term | Meaning | Context | Compatibility aliases |
| --- | --- | --- | --- |
| Deploy token | Appaloft-issued machine credential used by automation to call self-hosted Action mutation endpoints. | Identity governance / control-plane entry workflow | action token, server deploy token |
| Token verifier | Stored non-secret verifier/hash used to authenticate a presented deploy token. | Identity governance / persistence | token hash |
| Deploy token scope | Authorization facts that limit a deploy token to organization, project, environment, resource, server, source repository, preview workflow, and workflow command. A complete unique target scope can also resolve ordinary self-hosted Action deploys without workflow-supplied ids. | Identity governance | token claims |
| Action mutation endpoint | A self-hosted HTTP endpoint that can mutate Appaloft state when called by GitHub Actions. | Adapter / entry workflow | Action API |
| Authenticated Action actor | Application execution context derived from a valid deploy token plus safe Action request facts. | Application / authorization | automation actor |

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| ACTION-AUTH-SPEC-001 | Missing token fails before mutation | A request targets an Action mutation endpoint without `Authorization: Bearer ...` | The request reaches HTTP/oRPC | The endpoint returns `401` with `action_auth_missing` and no source-link, resource, route, preview, or deployment mutation is attempted. |
| ACTION-AUTH-SPEC-002 | Invalid token fails before mutation | A request includes an unknown, malformed, expired, or revoked deploy token | The request reaches HTTP/oRPC | The endpoint returns `401` with `action_auth_invalid` and no downstream command dispatch occurs. |
| ACTION-AUTH-SPEC-003 | Valid token builds an Action actor | A request includes a valid deploy token | The endpoint accepts the token | The adapter creates an authenticated Action actor with token id, organization id, scopes, repository facts when supplied, and no raw token value; workflow commands receive that actor context before business admission. |
| ACTION-AUTH-SPEC-004 | Scope mismatch returns forbidden | A token is valid but does not cover the requested project, environment, resource, source repository, preview workflow, or workflow command | The request reaches an Action mutation endpoint | The endpoint returns `403` with `action_auth_forbidden` before mutation. |
| ACTION-AUTH-SPEC-004A | Scope resolves target | A valid token scope uniquely identifies project, environment, resource, and server, and the Action request has no Appaloft ids | Source-link deploy or server-config deploy reaches target resolution | The application resolves the deployment target from token scope, may create the source-link record after admission when missing, and dispatches only ids-only deployment admission. |
| ACTION-AUTH-SPEC-004B | Scope conflicts fail before mutation | A valid token scope conflicts with explicit bootstrap ids, an existing source-link target, or trusted repository facts | Source-link deploy or server-config deploy reaches target resolution | The endpoint returns `403` with `action_auth_forbidden` before package/config/profile/route/deployment mutation. |
| ACTION-AUTH-SPEC-005 | Source-link deploy is protected | `POST /api/action/deployments/from-source-link` is called | Auth succeeds and scope permits source-link deployment | The route may dispatch `CreateActionSourceLinkDeploymentCommand`; otherwise it fails with `401` or `403` before command dispatch. |
| ACTION-AUTH-SPEC-006 | Server config deploy is protected | `POST /api/action/deployments/from-config-package` is called | Auth succeeds and scope permits server config deploy | The route may validate package/config and dispatch server config workflow commands; otherwise it fails with `401` or `403` before package, source-link, profile, route, or deployment mutation. |
| ACTION-AUTH-SPEC-007 | Preview cleanup is protected | `POST /api/deployments/cleanup-preview` is called from self-hosted Action server mode | Auth succeeds and scope permits preview cleanup | The route may dispatch `deployments.cleanup-preview`; otherwise it fails with `401` or `403` before cleanup mutation. |
| ACTION-AUTH-SPEC-008 | Installer-generated token is one-time visible | A self-hosted install has no deploy token yet | The installer/bootstrap flow creates the initial token | The raw token is printed or written only to trusted install output once, a verifier is stored, and logs/readiness/API responses do not expose the raw value. |
| ACTION-AUTH-SPEC-009 | Token rotation preserves audit and scopes | An operator rotates a deploy token | Rotation succeeds | A new raw value is returned once, the old verifier stops authenticating immediately or after an explicitly documented grace policy, safe metadata records rotation time, and scopes are preserved unless an explicit create command chooses new scopes. |
| ACTION-AUTH-SPEC-010 | Token revocation blocks future Action calls | An operator revokes a deploy token | A later Action request presents the old token | Authentication returns `401` with `action_auth_invalid`; safe metadata records revoked state. |

## Domain Ownership

- Bounded context: identity governance, with control-plane entry workflow integration.
- Aggregate/resource owner: deploy token lifecycle belongs to identity governance under
  organization ownership. Action deployment, config bootstrap, preview cleanup, and resource/profile
  mutations remain owned by their existing contexts.
- Upstream/downstream contexts: HTTP/oRPC authenticates the request and builds actor context;
  application authorization evaluates token scope before dispatch; existing action/deployment
  workflows run only after authorization succeeds.

## Public Surfaces

- API: Action mutation endpoints require bearer deploy tokens. Admin-protected HTTP/oRPC token
  management endpoints use explicit `deploy-tokens.*` command/query operations.
- CLI: installer and `appaloft deploy-token create/list/show/rotate/revoke` surfaces may create,
  rotate, revoke, and print one-time raw token output. Pure SSH CLI mode with
  `control-plane-mode: none` does not require deploy tokens.
- Web/UI: Web `/organization` exposes deploy-token list/create/rotate/revoke controls through the
  same admin-protected oRPC contracts and stable public docs anchor. Future MCP token management
  remains a named Phase 8 migration gap.
- Config: repository config must not contain deploy tokens. GitHub Actions should provide the token
  through trusted secret inputs or environment variables. Config may contain only the narrow
  `controlPlane.deploymentContext` bootstrap ids; those ids are optional advanced context and must
  be checked against token scope before mutation.
- Events: token lifecycle events are safe audit facts only; they must not include raw token values.
- Public docs/help: self-hosted Action server mode docs must explain token creation, storage in
  GitHub Secrets, rotation/revocation, scope failures, and 401/403 recovery.

## Non-Goals

- Replacing Better Auth user sessions.
- Implementing complete first-admin login, OAuth, organization/team invitations, or Web onboarding
  in this first deploy-token slice.
- Adding token fields to `deployments.create` or repository config.
- Letting Action auth own deployment, source-link, profile, route, or cleanup business policy. Auth
  may provide scope facts for application target resolution, but the owning workflow commands still
  enforce source-link and deployment policy.
- Supporting token authentication for pure SSH CLI mode.

## Open Questions

- Should the first installer-generated token be stored in the database immediately or in an
  installer-managed bootstrap secret file that is imported on first backend startup?
- Should token rotation allow an explicit short grace period, or should the old verifier be revoked
  immediately in the first Code Round?
- Which role is required to create/rotate/revoke deploy tokens after first-admin login is active:
  organization owner only, or owner/admin?

## Current Implementation Notes And Migration Gaps

- 2026-05-10 Code Round added an application `ActionDeployTokenAuthorizationPort`, authenticated
  `deploy-token` actor context, oRPC bearer-token admission, Better Auth package static-token
  verification from `APPALOFT_ACTION_DEPLOY_TOKEN`, and
  `/api/version.features.actionDeployTokenAuth`. Later Code Rounds replaced the static verifier as
  the default path with persisted deploy-token storage while preserving the static verifier as an
  operator-provided bootstrap fallback.
- Better Auth is an implementation detail of `@appaloft/auth-better`. Core must not import it, and
  application may only depend on Appaloft-owned ports/interfaces so the auth library can be swapped
  without changing domain or use-case semantics.
- The static bootstrap verifier can be constrained with non-secret environment scope settings:
  `APPALOFT_ACTION_DEPLOY_TOKEN_PROJECT_ID`, `APPALOFT_ACTION_DEPLOY_TOKEN_ENVIRONMENT_ID`,
  `APPALOFT_ACTION_DEPLOY_TOKEN_RESOURCE_ID`, `APPALOFT_ACTION_DEPLOY_TOKEN_SERVER_ID`,
  `APPALOFT_ACTION_DEPLOY_TOKEN_REPOSITORY_FULL_NAME`, and
  `APPALOFT_ACTION_DEPLOY_TOKEN_WORKFLOWS`.
- The implemented guard protects `POST /api/action/deployments/from-source-link` and
  `POST /api/action/deployments/from-config-package` before command dispatch. Missing tokens return
  `action_auth_missing`; invalid or unverifiable tokens return `action_auth_invalid`.
  Source-link/config requests pass safe requested-scope facts to the application-owned
  authorization port; scope mismatch returns `action_auth_forbidden` with `403` before command
  dispatch. Forbidden responses include a stable `deniedScope` plus `reasonCode` so operators can
  distinguish missing requested scope from a requested value outside the token scope without
  exposing token material.
- The authorization port now also returns safe resolved scope arrays to application target
  resolution. `CreateActionSourceLinkDeploymentCommand` and
  `ResolveActionServerConfigDeploymentTargetCommand` can resolve a missing source-link target from
  complete token scope, conflict-check explicit ids/source-link targets/repository facts against the
  scope, and return `action_deployment_target_unresolved` before mutation when no link, scope,
  binding, or trusted bootstrap context identifies the target.
- The deploy-action wrapper sends `X-Appaloft-Action-Command: preview-cleanup` for self-hosted
  preview cleanup. That Action-marked cleanup path is protected by the same application-owned
  deploy-token authorization port before `deployments.cleanup-preview` dispatch; ordinary
  non-Action cleanup semantics are unchanged in this slice.
- Core now contains a foundational `DeployToken` aggregate and value objects for verifier digest,
  safe secret suffix, scope, status, rotation, revocation, and last-used metadata. PG/PGlite now has
  `deploy_tokens` verifier storage plus a safe read model that omits raw token and verifier values.
- `@appaloft/auth-better` now has a persisted verifier authorization port that hashes bearer tokens,
  loads active persisted verifier records through the application-owned repository port, evaluates
  core scope rules, and returns a safe deploy-token actor. Shell runtime wiring uses persisted
  verifier storage by default and keeps the static bootstrap verifier when
  `APPALOFT_ACTION_DEPLOY_TOKEN` is configured.
- Application now has a `CreateDeployTokenUseCase` plus `DeployTokenMaterialIssuer` port. The use
  case creates the `DeployToken` aggregate, persists only verifier digest and safe suffix metadata,
  returns the raw token value once, and lets `@appaloft/auth-better` implement token material
  issuance behind the application-owned abstraction.
- Application also has `RotateDeployTokenUseCase` and `RevokeDeployTokenUseCase`. Rotation preserves
  scopes, returns the new raw token once, updates persisted verifier metadata, and immediately
  invalidates the old verifier. Revocation records safe revoked metadata and makes active verifier
  lookup fail for future Action authentication.
- `deploy-tokens.create`, `deploy-tokens.rotate`, and `deploy-tokens.revoke` now have application
  command/handler classes, operation-catalog transport declarations, typed client contract coverage,
  admin-protected HTTP/oRPC routes, CLI commands, and Web `/organization` management surfaces.
- `deploy-tokens.list` and `deploy-tokens.show` now have application query/handler classes,
  operation-catalog transport declarations, typed client contract coverage, and admin-protected
  HTTP/oRPC routes, CLI commands, and Web `/organization` management surfaces. They return safe
  deploy-token summaries without raw token or verifier values.
- Docker self-host installer bootstrap can opt into deploy-token handoff with
  `--bootstrap-deploy-token`, which configures `APPALOFT_BOOTSTRAP_DEPLOY_TOKEN_OUTPUT_FILE`. Shell
  startup treats that file as an installer-only handoff, queries for an existing active
  `org_self_hosted` deploy token, dispatches `CreateDeployTokenCommand` only when one does not
  exist, writes raw token material to the handoff once, and lets `install.sh` read, remove, and
  print it to trusted install output. Existing active tokens produce safe metadata without raw token
  material. Plain SSH install does not create a deploy token by default.
- Concrete future MCP token management descriptors remain a named Phase 8 migration gap.
- Public docs now cover installer bootstrap output, `APPALOFT_TOKEN` GitHub Secret wiring,
  deploy-token scope meaning, `401`/`403` recovery, CLI plus admin-protected lifecycle endpoints,
  and Web `/organization` token management at
  `self-hosting/action-deploy-token-auth#self-hosting-action-deploy-token-auth`.
