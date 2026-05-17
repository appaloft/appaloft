# ADR-043: Self-Hosted Action Deploy Token Authorization

## Status

Accepted

## Context

Self-hosted Appaloft server mode lets a user-authored GitHub Action trigger server-owned deployment
workflows such as source-link deploy, server config deploy, and preview cleanup. Those endpoints
mutate durable Appaloft state: source links, resource profiles, route intent, preview cleanup state,
and deployment attempts.

Before the self-hosted auth phase is complete, those Action mutation endpoints need a stable
machine-to-machine authorization boundary that works without requiring OAuth or an interactive user
session. The same boundary must later coexist with first-admin login, organization/team membership,
and optional OAuth.

## Decision

Self-hosted Action mutation endpoints require an Appaloft-issued **deploy token** before any
workflow-specific mutation runs.

- A deploy token is a machine credential for trusted automation. It is not a Better Auth user
  session and not a repository config field.
- Deploy tokens are owned by the identity-governance context and scoped to an organization, with
  optional project, environment, resource, source repository, preview workflow, and workflow-command
  limits.
- The installer may generate an initial deploy token for the first self-hosted instance. The raw
  value is shown only once through trusted installer output or explicit token rotation/create
  output, and stored only as a verifier/hash in Appaloft state.
- Action clients send the token as an HTTP bearer token. Tokens must not be accepted from committed
  repository config, query strings, source packages, or deployment input fields.
- Authentication failure returns `401` before source-link, resource, route, preview, or deployment
  mutation. Authorization failure returns `403` before mutation.
- Deploy-token scope participates in Action deployment target resolution after authentication. A
  complete unique project/environment/resource/server scope may identify the target without
  workflow-supplied ids, and any explicit ids, existing source-link target, or trusted repository
  facts must conflict-check against the token scope before mutation.
- Public health, readiness, version, static assets, and documented login/bootstrap endpoints remain
  explicitly public. Action mutation endpoints are not public.
- Token create, list/show safe metadata, rotate, and revoke are explicit lifecycle operations when
  exposed. Generic token update operations are forbidden.
- Deploy-token authorization gates transport/workflow admission and provides safe scope facts to
  application target resolution. After authorization succeeds, deployment behavior still goes
  through the existing command/query boundaries such as
  `CreateActionSourceLinkDeploymentCommand`, `ResolveActionServerConfigDeploymentTargetCommand`,
  `resources.configure-*`, and ids-only `deployments.create`.

## Consequences

- Self-hosted GitHub Actions can use a non-interactive credential before OAuth and full product auth
  are available.
- Multiple repositories can share one Appaloft instance without sharing a global mutation secret,
  because token scopes are first-class authorization facts.
- A scoped token can remove the need for ordinary Action workflows to carry project/environment/
  resource/server ids, while still returning `403` before mutation when explicit ids or source-link
  state are outside scope.
- Action auth failures are distinct from deployment admission failures: a valid token can still be
  rejected by source-link, config, resource, route, or deployment policy.
- Transport adapters may parse bearer headers and build an authenticated actor context, but they
  must not own source-link, resource, route, or deployment business policy.
- The first Code Round must fail closed: missing auth components or missing token verifier
  configuration must reject Action mutation endpoints rather than falling back to anonymous writes.

## Related Specs

- [Self-Hosted Action Deploy Token Auth](../specs/052-self-hosted-action-deploy-token-auth/spec.md)
- [Self-Hosted Action API Authentication](../workflows/self-hosted-action-api-authentication.md)
- [Self-Hosted Action Auth Error Spec](../errors/self-hosted-action-auth.md)
- [Self-Hosted Auth Test Matrix](../testing/self-hosted-auth-test-matrix.md)
- [Control-Plane Mode Selection And Adoption](../workflows/control-plane-mode-selection-and-adoption.md)
- [Action Server Config Deploy](../specs/050-action-server-config-deploy/spec.md)
- [ADR-025: Control-Plane Modes And Action Execution](./ADR-025-control-plane-modes-and-action-execution.md)
