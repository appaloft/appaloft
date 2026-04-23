# deployments.stream-events Query Spec

## Metadata

- Operation key: `deployments.stream-events`
- Query class: `StreamDeploymentEventsQuery`
- Input schema: `StreamDeploymentEventsQueryInput`
- Handler: `StreamDeploymentEventsQueryHandler`
- Query service: `StreamDeploymentEventsQueryService`
- Domain / bounded context: Release orchestration / Deployment event observation
- Current status: active query
- Source classification: normative contract

## Normative Contract

`deployments.stream-events` is the source-of-truth query for replaying and following one accepted
deployment attempt's structured event stream.

It is read-only. It must not:

- create, retry, redeploy, cancel, clean up, or roll back deployments;
- replace `deployments.show` as the immutable deployment-detail query;
- replace `deployments.logs` as the full attempt-log query;
- expose raw runtime stdout/stderr as if it were deployment lifecycle facts;
- require the original `deployments.create` transport to remain open after command acceptance.

The query must support:

- bounded replay from durable event/progress state;
- cursor-based reconnect after the caller disconnects;
- optional follow/stream mode for new events;
- structured stream-gap and stream-error signaling instead of silent loss;
- caller cancellation that closes the stream without mutating deployment state.

## Global References

This query inherits:

- [ADR-016: Deployment Command Surface Reset](../decisions/ADR-016-deployment-command-surface-reset.md)
- [ADR-029: Deployment Event Stream And Recovery Boundary](../decisions/ADR-029-deployment-event-stream-and-recovery-boundary.md)
- [deployments.show Query Spec](./deployments.show.md)
- [Deployment Detail And Observation Workflow Spec](../workflows/deployment-detail-and-observation.md)
- [Deployment Event Stream Error Spec](../errors/deployments.stream-events.md)
- [Deployment Event Stream Test Matrix](../testing/deployments.stream-events-test-matrix.md)
- [Deployment Event Stream Implementation Plan](../implementation/deployments.stream-events-plan.md)
- [deployments.create Command Spec](../commands/deployments.create.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)

## Purpose

Let Web, CLI, HTTP/oRPC, and future MCP/tool clients continue observing one accepted deployment
attempt after initial command acceptance.

This query exists so deployment observation can outlive:

- the original `deployments.create` request/response;
- page navigation or refresh;
- CLI reconnect after process interruption;
- later inspection of a historical deployment timeline.

## Input Model

| Field | Required | Meaning |
| --- | --- | --- |
| `deploymentId` | Yes | Deployment attempt whose event stream is being observed. |
| `cursor` | No | Opaque stream cursor returned by a previous event envelope. When present, replay begins strictly after that cursor. |
| `historyLimit` | No | Maximum number of historical envelopes to replay before follow mode continues. Must be bounded by schema. |
| `includeHistory` | No | Whether the stream should replay historical envelopes before following new ones. Defaults to `true` when no cursor is supplied. |
| `follow` | No | Whether the caller expects live events after the bounded replay. |
| `untilTerminal` | No | Whether the stream may close automatically after the deployment reaches terminal state and the backlog is drained. Defaults to `true` for watch-style entrypoints. |

Public input must not accept:

- raw runtime log cursors;
- container ids, process ids, or provider-native event handles;
- retry/redeploy/rollback action flags;
- deployment mutation input.

## Output Model

The normalized envelope contract is:

```ts
type DeploymentEventStreamEnvelope =
  | { schemaVersion: "deployments.stream-events/v1"; kind: "event"; event: DeploymentObservedEvent }
  | { schemaVersion: "deployments.stream-events/v1"; kind: "heartbeat"; at: string; cursor?: string }
  | { schemaVersion: "deployments.stream-events/v1"; kind: "gap"; gap: DeploymentEventStreamGap }
  | {
      schemaVersion: "deployments.stream-events/v1";
      kind: "closed";
      reason: "completed" | "cancelled" | "source-ended" | "idle-timeout";
      cursor?: string;
    }
  | { schemaVersion: "deployments.stream-events/v1"; kind: "error"; error: DomainError };

type DeploymentObservedEvent = {
  deploymentId: string;
  sequence: number;
  cursor: string;
  emittedAt: string;
  source: "domain-event" | "process-observation" | "progress-projection";
  eventType:
    | "deployment-requested"
    | "build-requested"
    | "deployment-started"
    | "deployment-succeeded"
    | "deployment-failed"
    | "deployment-progress";
  phase?: "detect" | "plan" | "package" | "deploy" | "verify" | "rollback";
  status?: string;
  retriable?: boolean;
  summary?: string;
};

type DeploymentEventStreamGap = {
  code: string;
  phase: string;
  retriable: boolean;
  cursor?: string;
  lastSequence?: number;
  recommendedAction?: "restart-stream" | "open-deployment-detail";
};
```

The transport may serialize the same contract as:

- a bounded JSON list when `follow = false`;
- Server-Sent Events or streaming oRPC when `follow = true`;
- line-delimited JSON or concise formatted text in CLI watch mode.

## Event Semantics

`deployments.stream-events` may emit:

- canonical deployment lifecycle facts sourced from durable events or equivalent projections;
- normalized progress observations when they are clearly labeled as `source = "progress-projection"`
  and do not masquerade as new domain facts;
- gap/error/heartbeat/closed envelopes for stream lifecycle.

It must not:

- expose unbounded application stdout/stderr lines; those remain `deployments.logs` or
  `resources.runtime-logs`;
- silently invent success/failure facts not backed by durable state or accepted projections;
- expose retry or rollback actions as event payloads before those commands exist publicly.

## Main Flow

1. Validate query input.
2. Resolve that the deployment exists and is visible.
3. Resolve the ordered event observation source from durable deployment events and persisted or
   safely derived progress/timeline projections.
4. If `cursor` is present, start strictly after that cursor.
5. Otherwise replay at most `historyLimit` historical envelopes when `includeHistory = true`.
6. Yield normalized event envelopes in sequence order.
7. If `follow = true`, keep the stream open for new envelopes and emit heartbeat envelopes when
   transport/runtime policy requires them.
8. If a replay or follow gap is detected, emit `kind = "gap"` with restart guidance instead of
   silently dropping events.
9. On caller cancellation, close the stream and emit `closed(cancelled)` when the transport can
   still write.

## Branches

| Branch | Condition | Behavior | Result |
| --- | --- | --- | --- |
| Deployment missing | `deploymentId` cannot be resolved or is not visible | Return `err(not_found)` | No stream opened |
| Invalid cursor | `cursor` is malformed or cannot be matched safely | Return `err(deployment_event_cursor_invalid)` | No stream opened |
| No durable event source | Deployment exists but event/progress source cannot be loaded safely | Return `err(deployment_event_stream_unavailable)` | No stream opened |
| Historical replay only | `follow = false` | Yield bounded replay then close | Finite result |
| Replay plus follow | `follow = true` | Yield replay, then new envelopes | Stream remains open until close policy triggers |
| Stream gap | Replay or follow cannot continue from the requested cursor | Emit `gap` envelope | Caller can restart safely |
| Caller cancels | Abort signal fires or transport disconnects | Close source and emit/return closed result when possible | No orphan follow process |

## Error Contract

All errors use [Deployment Event Stream Error Spec](../errors/deployments.stream-events.md).

Synchronous initialization failures return `err(DomainError)`.

Failures after the stream has opened should be represented as:

- `kind = "gap"` when ordered replay continuity cannot be guaranteed but the caller can restart; or
- `kind = "error"` when a structured stream failure occurs after open and the transport can still
  write.

## Handler Boundary

The query handler must delegate to the query service and return the typed `Result`.

It must not:

- call transport request objects directly;
- open runtime log readers;
- mutate deployment or resource state;
- schedule retry/redeploy/rollback work;
- assume Web/CLI formatting concerns.

## Entrypoints

| Entrypoint | Mapping | Status |
| --- | --- | --- |
| Web | Deployment detail timeline tab replays and optionally follows this query. | Active |
| CLI | `appaloft deployments events <deploymentId> [--follow] [--cursor <cursor>] [--json]` | Active |
| oRPC / HTTP | Bounded replay and streaming endpoint(s) over the same query schema. | Active |
| Automation / MCP | Future read-only watch/query tool over the same operation key. | Future |

## Current Implementation Notes And Migration Gaps

`deployments.stream-events` is active through the application query slice, operation catalog,
HTTP/oRPC bounded replay endpoint, HTTP/oRPC streaming endpoint, CLI `deployments events` command,
shell deployment event observer, and Web deployment detail timeline.

The first active implementation uses deployment log/progress projection data plus live progress
observation to produce ordered envelopes with `deploymentId:sequence` cursor tokens. This satisfies
the standalone replay/follow boundary without requiring the original `deployments.create` transport
to stay open.

Remaining hardening gaps:

- projection-rebuild-stable cursors beyond the current deployment sequence token;
- broader executable coverage for CLI follow/cancellation and stream gap/failure envelopes;
- richer durable lifecycle fact sourcing when outbox/process state becomes first-class.

## Open Questions

- None for the active query boundary. Projection-rebuild-stable cursor durability remains future
  observability hardening.
