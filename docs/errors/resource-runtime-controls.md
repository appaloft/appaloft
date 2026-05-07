# Resource Runtime Controls Error Spec

## Status

Spec Round error contract for accepted candidate Resource runtime stop/start/restart operations.
These errors become active only when their owning command slices are implemented.

## Governing Sources

- [Error Model](./model.md)
- [neverthrow Conventions](./neverthrow-conventions.md)
- [ADR-038: Resource Runtime Control Ownership](../decisions/ADR-038-resource-runtime-control-ownership.md)
- [resources.runtime.stop Command Spec](../commands/resources.runtime.stop.md)
- [resources.runtime.start Command Spec](../commands/resources.runtime.start.md)
- [resources.runtime.restart Command Spec](../commands/resources.runtime.restart.md)
- [resources.health Query Spec](../queries/resources.health.md)
- [Resource Runtime Controls Test Matrix](../testing/resource-runtime-controls-test-matrix.md)

## Stable Error Codes

| Code | Category | Phase | Retriable | Owner | Required safe details |
| --- | --- | --- | --- | --- | --- |
| `resource_runtime_control_blocked` | `conflict` | `runtime-control-admission` | No | runtime control commands | resource id, operation, blocked reason |
| `resource_runtime_metadata_missing` | `application` or `not-found` | `runtime-control-admission` | No | runtime control commands | resource id, deployment id when supplied, missing metadata kind |
| `resource_runtime_profile_acknowledgement_required` | `conflict` | `runtime-control-admission` | No | start/restart | resource id, operation, drift summary when safe |
| `resource_runtime_already_in_state` | `conflict` | `runtime-control-admission` | No | stop/start | resource id, operation, current runtime state |
| `resource_runtime_control_failed` | `infra` or `provider` | `runtime-control-execution` | Conditional | runtime control commands | runtime control attempt id, resource id, operation, phase, safe adapter error code |
| `coordination_timeout` | `timeout` | `operation-coordination` | Yes | runtime control commands | coordination scope kind/key, mode, waited seconds, retry hint when available |

## Blocked Reason Codes

Blocked reasons may appear in errors and `resources.health` runtime-control readback:

- `resource-archived`
- `resource-deleted`
- `runtime-not-found`
- `runtime-metadata-stale`
- `runtime-already-running`
- `runtime-already-stopped`
- `runtime-control-in-progress`
- `deployment-in-progress`
- `profile-acknowledgement-required`
- `adapter-unsupported`

## Consumer Mapping

- Web maps top-level error code plus blocked reason to i18n keys and links to runtime-control help
  anchors.
- CLI structured output includes `code`, `category`, `phase`, `operation`, `resourceId`, and safe
  runtime-control attempt id when one exists.
- HTTP/oRPC maps validation to 400, not-found to 404, conflict to 409, coordination timeout to 409
  or 503 according to adapter policy, and provider/infra execution failures to 502/503 when the
  command did not reach a safe terminal state.
- Future MCP/tool output must preserve runtime-control operation, attempt id, status, phase, and
  blocked reason without relying on localized prose.

## Secret And Provider Detail Handling

Errors and runtime-control read models must not include raw container ids as public inputs, raw
Docker/Compose/SSH commands, provider SDK responses, environment variables, secret values, private
source paths, registry credentials, or unbounded runtime output.
