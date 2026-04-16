# Resource Runtime Logs Error Spec

## Normative Contract

`resources.runtime-logs` uses the shared platform error model and neverthrow conventions.

Errors must use stable `code`, `category`, `phase`, `retriable`, and resource/runtime details. They
must not rely on message text or runtime-native stderr as the contract.

## Global References

This spec inherits:

- [ADR-018: Resource Runtime Log Observation](../decisions/ADR-018-resource-runtime-log-observation.md)
- [resources.runtime-logs Query Spec](../queries/resources.runtime-logs.md)
- [Resource Runtime Log Observation Workflow Spec](../workflows/resource-runtime-log-observation.md)
- [Error Model](./model.md)
- [neverthrow Conventions](./neverthrow-conventions.md)

## Error Details

```ts
type ResourceRuntimeLogsErrorDetails = {
  queryName?: "resources.runtime-logs";
  phase:
    | "query-validation"
    | "context-resolution"
    | "runtime-instance-resolution"
    | "runtime-log-open"
    | "runtime-log-stream"
    | "runtime-log-cancel";
  step?: string;
  resourceId?: string;
  deploymentId?: string;
  serviceName?: string;
  runtimeKind?: string;
  runtimeInstanceId?: string;
  targetId?: string;
  destinationId?: string;
  adapter?: string;
  relatedEntityId?: string;
  relatedEntityType?: "resource" | "deployment" | "destination" | "deployment-target";
  relatedState?: string;
  correlationId?: string;
  causationId?: string;
};
```

Error details must not include secrets, raw environment variables, source credentials, private keys,
raw log lines, or runtime-native command strings that embed secrets.

## Admission Errors

Admission errors reject the query before the stream opens and return `err(DomainError)`.

| Error code | Category | Phase | Retriable | Meaning |
| --- | --- | --- | --- | --- |
| `validation_error` | `validation` | `query-validation` | No | Input shape, `tailLines`, `since`, `cursor`, or `serviceName` is invalid. |
| `not_found` | `not-found` | `context-resolution` | No | Resource or selected deployment cannot be found or is not visible. |
| `resource_runtime_logs_context_mismatch` | `application` | `context-resolution` | No | Selected deployment, destination, or service does not belong to the resource context. |
| `resource_runtime_logs_unavailable` | `application` | `runtime-instance-resolution` | Conditional | No observable runtime instance exists for the resource, or the latest instance lacks enough placement metadata. |
| `resource_runtime_logs_not_configured` | `integration` | `runtime-log-open` | Conditional | The selected runtime backend has no registered log reader implementation. |
| `infra_error` | `infra` | `runtime-log-open` | Conditional | Local process, SSH, filesystem, or infrastructure setup failed while opening logs. |
| `provider_error` | `integration` | `runtime-log-open` | Conditional | Provider/runtime API rejected or failed the log-open request. |
| `timeout` | `timeout` | `runtime-log-open` | Yes | Opening the runtime log stream exceeded the configured timeout. |

## Stream Errors

Failures after a stream opens must be represented as structured stream errors when possible.

| Error code | Category | Phase | Retriable | Meaning |
| --- | --- | --- | --- | --- |
| `resource_runtime_log_stream_failed` | `infra` or `integration` | `runtime-log-stream` | Conditional | Backend stream failed after opening. |
| `timeout` | `timeout` | `runtime-log-stream` | Yes | Backend stream stalled or timed out according to adapter policy. |
| `resource_runtime_log_cancelled` | `application` | `runtime-log-cancel` | No | Caller intentionally cancelled the stream. This is a normal close reason, not a failure UI state. |

Adapters may map runtime-native failures to these stable codes, but must not expose runtime-native
stderr as the machine contract.

## Consumer Mapping

Web, CLI, HTTP API, workers, and tests must use [Error Model](./model.md).

Resource runtime log consumers additionally must:

- distinguish deployment-attempt log absence from runtime log unavailability;
- show no retry affordance for validation, not-found, context mismatch, or intentional cancellation;
- show retry/reconnect affordances for retriable open/stream failures;
- preserve resource/deployment/service context in debug or machine-readable output;
- avoid rendering raw command strings or secret-bearing details.

## Test Assertions

Tests must assert:

- `Result` shape for open/admission failures;
- stream error event shape for post-open failures;
- `error.code`;
- `error.category`;
- `error.retriable`;
- `phase`;
- resource/deployment/service ids when relevant;
- no raw secret values or raw runtime command strings in error details;
- stream cancellation closes backend resources.

## Current Implementation Notes And Migration Gaps

`resources.runtime-logs` maps synchronous context/runtime resolution failures to `DomainError`
results, maps backend process stream failures to `resource_runtime_log_stream_failed`, and maps
process-backed bounded read stalls to retriable `timeout` stream errors.

Existing deployment log errors remain deployment-attempt specific and do not replace runtime log
open/stream phase errors.

## Open Questions

- Should intentional cancellation be emitted as a stream `closed(cancelled)` event only, or also be
  representable as `resource_runtime_log_cancelled` for transports that need an error-like status?
