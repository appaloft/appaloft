# source-events.resolve-generic-signed-secret Internal Query Spec

## Normative Contract

`ResolveGenericSignedSourceEventSecretQuery` is an internal query used by the generic signed source
event HTTP route before HMAC verification.

It is not a public API or operation-catalog entry. It returns secret material only to the in-process
webhook verifier and must never be exposed in Web, CLI, OpenAPI output, logs, or read models.

## Purpose

Generic signed source events use a Resource-owned auto-deploy policy with a
`resource-secret:<KEY>` reference. The Resource aggregate owns whether that reference is configured
and whether the matching runtime-scoped Resource variable is a secret.

Adapters must not inspect `Resource.toState()` to resolve this secret.

## Input Model

| Field | Requirement | Meaning |
| --- | --- | --- |
| `resourceId` | Required | Resource scoped by `/api/resources/{resourceId}/source-events/generic-signed`. |

## Query Flow

1. Load the Resource aggregate by `resourceId`.
2. Ask `Resource.genericSignedWebhookSecretValue()` for the verifier secret.
3. Return `{ secretValue }` to the source-event route if available.
4. Return `resource_auto_deploy_secret_unavailable` with phase `source-event-verification` when the
   policy or Resource secret variable is absent or invalid.

## Boundary Rules

- The Resource aggregate owns trigger-kind, secret-ref, variable-scope, runtime-exposure, and
  secret-kind checks.
- The application query owns repository lookup and error translation.
- oRPC owns only request parsing, query dispatch, verifier invocation, and command dispatch for
  `source-events.ingest`.

## References

- [source-events.ingest Command Spec](../commands/source-events.ingest.md)
- [Source Binding Auto Deploy Test Matrix](../testing/source-binding-auto-deploy-test-matrix.md)
- [Adapter Command/Query Boundary](../architecture/adapter-command-query-boundary.md)
