# deployments.cancel Error Spec

## Status

Active public error contract for `deployments.cancel`.

## Governing Sources

- [Error Model](./model.md)
- [Neverthrow Conventions](./neverthrow-conventions.md)
- [deployments.cancel Command Spec](../commands/deployments.cancel.md)
- [Deployment Cancel Test Matrix](../testing/deployments.cancel-test-matrix.md)

## Stable Error Codes

| Code | Category | Phase | Retriable | Owner | Required safe details |
| --- | --- | --- | --- | --- | --- |
| `validation_error` | `user` | `command-validation` | No | `deployments.cancel` | deployment id and confirmation mismatch flag; never echo secrets or runtime output |
| `not_found` | `not-found` | repository lookup | No | `deployments.cancel` | deployment id |
| `resource_context_mismatch` | `conflict` | `deployment-resource-context` | No | `deployments.cancel` | requested resource id, actual resource id, deployment id |
| `deployment_cancel_not_allowed` | `application` | `cancel-admission` | No | `deployments.cancel` | deployment id, resource id, current status |
| `coordination_timeout` | `timeout` | `operation-coordination` | Yes | `deployments.cancel` | coordination scope kind/key, mode, waited seconds, retry hint when available |

## Consumer Mapping

- CLI should show the stable code and advise `deployments show` or `deployments recovery-readiness`
  for context instead of suggesting direct runtime edits.
- HTTP/oRPC maps not-found to 404, context/conflict/admission errors to 409 or 400 according to the
  shared error translator, and coordination timeout to retry guidance.
- Web and future MCP/tool surfaces must preserve machine fields and avoid provider output.

## Secret Handling

Cancel errors must not include raw runtime logs, environment values, SSH credentials, provider
tokens, registry credentials, or private source URLs with credentials.
