# domain-bindings.configure-route Command Spec

## Normative Contract

`domain-bindings.configure-route` is the specific route-behavior update operation for a durable
domain binding. It switches a binding between serving traffic and redirecting to an existing served
canonical binding in the same project/environment/resource/path owner scope.

Generic `domain-bindings.update` remains forbidden by ADR-026.

## Input

| Field | Requirement | Meaning |
| --- | --- | --- |
| `domainBindingId` | Required | Binding to configure. |
| `redirectTo` | Optional | Existing served binding hostname. Omit to serve traffic directly. |
| `redirectStatus` | Optional | `301`, `302`, `307`, or `308`; defaults to `308` when `redirectTo` is supplied. |
| `idempotencyKey` | Optional | Caller dedupe key. |

## Rules

- Missing bindings return `not_found`.
- Redirect targets must be active served bindings in the same owner/path scope.
- Redirect chains and self-redirects are rejected.
- Changing route behavior does not confirm ownership, issue certificates, retry certificates, or
  redeploy a resource.

## Errors

| Error code | Phase | Retriable | Meaning |
| --- | --- | --- | --- |
| `validation_error` | `domain-binding-route-configuration` | No | Redirect input is invalid. |
| `not_found` | `domain-binding-route-configuration` | No | Binding does not exist. |
