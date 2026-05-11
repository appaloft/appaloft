# Self-Hosted Action API Authentication Workflow

## Normative Contract

Self-hosted Action API authentication is the transport and application admission workflow that
protects GitHub Action mutation endpoints with Appaloft deploy tokens.

The installer/bootstrap subflow is:

```text
install.sh
  -> starts the self-hosted app container with APPALOFT_BOOTSTRAP_DEPLOY_TOKEN_OUTPUT_FILE
  -> Shell startup queries active deploy tokens for org_self_hosted
  -> if none exists, dispatches CreateDeployTokenCommand
  -> writes one-time raw token handoff output to the configured container-local file
  -> install.sh reads and removes that file, then prints the token in trusted install output
```

When an active token already exists, the handoff output must omit raw token material and report safe
metadata only.

The workflow is:

```text
GitHub Action
  -> reads deploy token from trusted GitHub Secret or explicit Action input
  -> sends Authorization: Bearer <token> to self-hosted Appaloft
  -> HTTP/oRPC parses bearer token without logging it
  -> application token verifier authenticates token and loads safe scope metadata
  -> application authorization checks endpoint, workflow command, repository, project,
     environment, resource, preview, and organization scope
  -> existing Action workflow command dispatch runs only after authorization succeeds
```

Authentication and authorization must finish before any source-link lookup/upsert, source package
validation that persists state, resource profile mutation, route mutation, preview cleanup mutation,
or deployment admission.

## Protected Endpoints

The first protected endpoints are:

- `POST /api/action/deployments/from-source-link`
- `POST /api/action/deployments/from-config-package`
- `POST /api/deployments/cleanup-preview` when called by self-hosted Action server mode

Public endpoints that remain unauthenticated include:

- `/api/health`
- `/api/readiness`
- `/api/version`
- static console and docs assets
- explicit auth/login/bootstrap endpoints once they are specified

## Deploy Token Scope Evaluation

A valid deploy token may still be forbidden. Scope evaluation must consider the safe facts available
before mutation:

- organization id;
- operation/workflow command, such as source-link deploy, server config deploy, or preview cleanup;
- project id;
- environment id;
- resource id;
- source repository id or full name;
- preview workflow kind and preview id/pull request context when present.

When an endpoint cannot safely determine enough facts to prove scope before mutation, it must fail
with `action_auth_forbidden` instead of guessing.

## Boundary Rules

- HTTP/oRPC may parse bearer headers and build an `AuthenticatedActionActor` or equivalent
  execution context.
- HTTP/oRPC must not call repositories or inspect aggregates to decide source-link, resource,
  route, or deployment business rules.
- Repository config and source packages must not contain deploy tokens.
- Error responses, logs, request summaries, workflow outputs, and read models must not include raw
  bearer tokens or token verifier values.
- Valid auth does not bypass existing workflow validation; it only allows the workflow to reach
  normal command/query dispatch.

## Error Phases

Expected phases:

- `action-authentication`
- `action-authorization`
- `deploy-token-bootstrap`
- `deploy-token-rotation`
- `deploy-token-revocation`

## References

- [ADR-043: Self-Hosted Action Deploy Token Authorization](../decisions/ADR-043-self-hosted-action-deploy-token-authorization.md)
- [Self-Hosted Action Deploy Token Auth](../specs/052-self-hosted-action-deploy-token-auth/spec.md)
- [Self-Hosted Action Auth Error Spec](../errors/self-hosted-action-auth.md)
- [Self-Hosted Auth Test Matrix](../testing/self-hosted-auth-test-matrix.md)
