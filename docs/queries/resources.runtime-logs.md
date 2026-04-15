# resources.runtime-logs Query Spec

## Metadata

- Operation key: `resources.runtime-logs`
- Query class: `ResourceRuntimeLogsQuery`
- Input schema: `ResourceRuntimeLogsQueryInput`
- Handler: `ResourceRuntimeLogsQueryHandler`
- Query service: `ResourceRuntimeLogsQueryService`
- Application port: `ResourceRuntimeLogReader`
- Domain / bounded context: Workload Delivery / Resource runtime observation
- Current status: active query, implemented
- Source classification: target contract

## Normative Contract

`resources.runtime-logs` observes application process stdout/stderr for a resource-owned runtime
instance.

It is not:

- `deployments.logs`;
- a deployment progress stream;
- a Docker-specific API;
- a command that mutates resource or deployment state;
- a log archival, search, drain, metrics, or retention operation.

The query must support:

- bounded tail reads;
- follow/stream mode;
- cancellation when the caller disconnects;
- runtime-agnostic line normalization;
- secret masking before lines reach transports.

## Global References

This query inherits:

- [ADR-017: Resource Runtime Log Observation](../decisions/ADR-017-resource-runtime-log-observation.md)
- [ADR-012: Resource Runtime Profile And Deployment Snapshot Boundary](../decisions/ADR-012-resource-runtime-profile-and-deployment-snapshot-boundary.md)
- [ADR-013: Project Resource Navigation And Deployment Ownership](../decisions/ADR-013-project-resource-navigation-and-deployment-ownership.md)
- [ADR-016: Deployment Command Surface Reset](../decisions/ADR-016-deployment-command-surface-reset.md)
- [Resource Runtime Log Observation Workflow Spec](../workflows/resource-runtime-log-observation.md)
- [Resource Runtime Logs Error Spec](../errors/resources.runtime-logs.md)
- [Resource Runtime Logs Test Matrix](../testing/resource-runtime-logs-test-matrix.md)
- [Resource Runtime Logs Implementation Plan](../implementation/resource-runtime-logs-plan.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)

## Purpose

Let CLI, HTTP/oRPC, Web, and future MCP clients read or stream application runtime logs for a
selected resource without knowing whether the runtime backend is Docker, PM2, systemd, file tailing,
or a provider API.

## Input Model

| Field | Required | Domain meaning | Validation source |
| --- | --- | --- | --- |
| `resourceId` | Yes | Resource whose application runtime logs are being observed. | Resource id value object / query schema |
| `deploymentId` | No | Specific deployment/runtime instance to observe. When omitted, the query resolves the latest observable runtime instance for the resource. | Deployment id value object / query schema |
| `serviceName` | No | Named service or process inside a compose-stack or multi-process resource. | Resource service name value object / query schema |
| `tailLines` | No | Maximum historical lines to return before follow mode continues. Defaults to a bounded value and must have an upper limit. | Query schema |
| `since` | No | Optional timestamp cursor for runtime backends that support time-bounded reads. | Query schema |
| `cursor` | No | Optional opaque log cursor returned by a previous stream. | Query schema |
| `follow` | No | Whether the caller expects live streaming after the bounded tail. Transport-specific streaming endpoints may imply `true`. | Query schema |

`resourceId` and optional `deploymentId` are platform ids. They must not be replaced by container
ids, PM2 process names, log file paths, or provider-native instance ids in public input.

## Output Model

The normalized stream event contract is:

```ts
type ResourceRuntimeLogEvent =
  | { kind: "line"; line: ResourceRuntimeLogLine }
  | { kind: "heartbeat"; at: string }
  | { kind: "closed"; reason: "completed" | "cancelled" | "source-ended" }
  | { kind: "error"; error: DomainError };

type ResourceRuntimeLogLine = {
  resourceId: string;
  deploymentId?: string;
  serviceName?: string;
  runtimeKind?: string;
  runtimeInstanceId?: string;
  stream?: "stdout" | "stderr" | "unknown";
  timestamp?: string;
  sequence?: number;
  cursor?: string;
  message: string;
  masked: boolean;
};
```

The transport may serialize the same contract as:

- a bounded JSON list when `follow = false`;
- Server-Sent Events when HTTP streaming is used;
- line-delimited JSON or formatted text in CLI streaming mode;
- future MCP stream events.

The application query service must not return Docker-specific, PM2-specific, systemd-specific, or
provider-native output types.

## Application Port Contract

The target application port is:

```ts
interface ResourceRuntimeLogReader {
  open(
    context: ResourceRuntimeLogContext,
    request: ResourceRuntimeLogRequest,
    signal: AbortSignal,
  ): Promise<Result<ResourceRuntimeLogStream, DomainError>>;
}

interface ResourceRuntimeLogStream extends AsyncIterable<ResourceRuntimeLogEvent> {
  close(): Promise<void>;
}
```

`ResourceRuntimeLogContext` is resolved by the application layer from resource/deployment read
models and runtime snapshots. It may contain platform ids, target/destination placement, selected
runtime strategy, runtime plan snapshot references, and redaction inputs.

`ResourceRuntimeLogRequest` contains query options such as `serviceName`, `tailLines`, `since`,
`cursor`, and `follow`.

The port implementation must stop remote commands, child processes, sockets, or provider streams
when `signal` aborts or `close()` is called.

## Main Flow

1. Validate query input.
2. Load the resource read model or aggregate reference needed to prove the resource exists and is
   visible.
3. Resolve the selected runtime instance:
   - use `deploymentId` when supplied and ensure it belongs to the resource;
   - otherwise use the latest observable deployment/runtime instance for the resource.
4. Resolve the selected service/process when `serviceName` is supplied or required.
5. Build `ResourceRuntimeLogContext` from platform ids, runtime placement, runtime plan snapshot,
   and redaction context.
6. Call the injected `ResourceRuntimeLogReader.open(...)`.
7. For bounded reads, collect no more than the requested or default tail limit.
8. For follow mode, yield normalized events from the returned `AsyncIterable`.
9. On cancellation, close the stream and return a cancellation/closed event rather than leaking a
   running runtime process.

## Branches

| Branch | Condition | Behavior | Result |
| --- | --- | --- | --- |
| Resource missing | `resourceId` cannot be resolved or is not visible | Return `err(not_found)` | No stream opened |
| Deployment mismatch | `deploymentId` does not belong to `resourceId` | Return `err(resource_runtime_logs_context_mismatch)` | No stream opened |
| No observable instance | Resource has no running or recent runtime placement | Return `err(resource_runtime_logs_unavailable)` | No stream opened |
| Service required | Resource has multiple services and no default log service can be selected | Return `err(validation_error)` with service details | No stream opened |
| Adapter unsupported | Runtime backend has no log reader implementation | Return `err(resource_runtime_logs_not_configured)` | No stream opened |
| Stream starts | Adapter opens log source | Yield normalized line events | Stream remains open until source closes or caller cancels |
| Stream source failure | Adapter loses the source after opening | Yield `kind = "error"` or close with structured error, depending on transport | Caller can display retry affordance when retriable |
| Caller cancels | Abort signal fires | Close runtime stream and yield/return `closed(cancelled)` when transport supports it | No orphan runtime process |

## Error Contract

All errors use [Resource Runtime Logs Error Spec](../errors/resources.runtime-logs.md).

Synchronous query admission errors return `err(DomainError)`.

Failures after a stream has opened must be represented as structured stream error events when the
transport can still write. If the transport cannot write, the boundary adapter may terminate the
stream after recording structured error details in logs/monitoring.

## Handler Boundary

The query handler must delegate to the query service and return the typed `Result`.

It must not:

- call Docker, PM2, systemd, shell, filesystem, provider SDK, or SSH APIs directly;
- inspect transport request objects;
- branch on Web/CLI-specific formatting needs;
- persist log lines;
- mutate resource or deployment state.

## Entrypoints

| Entrypoint | Mapping | Status |
| --- | --- | --- |
| Web | Resource detail log panel reads bounded tail and may open stream mode. | Implemented |
| CLI | `yundu resource logs <resourceId> [--follow] [--tail <n>] [--service <name>]` | Implemented |
| oRPC / HTTP | Bounded read endpoint plus streaming endpoint using the same query schema. | Implemented via oRPC |
| Automation / MCP | Future stream-capable query/tool over the same operation key. | Future |

## Current Implementation Notes And Migration Gaps

`resources.runtime-logs` is implemented as an application query slice with an injected
`ResourceRuntimeLogReader` port, bounded and streaming oRPC procedures, CLI `resource logs`, and a
resource detail Web panel.

The first runtime reader supports host-process file tailing, Docker container logs, and Docker
Compose logs from deployment runtime metadata. PM2, systemd/journalctl, provider-native APIs, and
remote SSH log readers remain future adapter implementations behind the same port.

Runtime application log archival, search, and retention are still out of scope. `deployments.logs`
remains the separate deployment-attempt log operation.

## Open Questions

- Should bounded HTTP reads and streaming HTTP reads be two physical endpoints or one endpoint that
  negotiates stream behavior by `Accept`/query input?
- Should stream events include an explicit monotonic sequence generated by the application layer when
  the runtime backend does not provide a cursor?
