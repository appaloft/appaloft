# operator-work.stream-events Query Spec

## Metadata

- Operation key: `operator-work.stream-events`
- Query class: `StreamOperatorWorkEventsQuery`
- Input schema: `StreamOperatorWorkEventsQueryInput`
- Handler: `StreamOperatorWorkEventsQueryHandler`
- Query service: `StreamOperatorWorkEventsQueryService`
- Status: active query

## Normative Contract

`operator-work.stream-events` replays or follows one durable work item's parent status stream. It is
read-only and must not retry, cancel, mark recovered, dead-letter, prune, claim, lease, or execute
the work.

This query is for operator/support observation of long-running Appaloft work that has a durable
work id, such as parent workflow work. It does not replace:

- `operator-work.show`, which remains the snapshot detail query;
- `deployments.stream-events`, which remains the deployment lifecycle/log-adjacent event stream;
- `deployments.logs` or `resources.runtime-logs`, which remain log surfaces.

## Input

```ts
type StreamOperatorWorkEventsQueryInput = {
  workId: string;
  cursor?: string;
  historyLimit?: number;
  includeHistory?: boolean;
  follow?: boolean;
  untilTerminal?: boolean;
  pollIntervalMs?: number;
};
```

## Output

The normalized envelope contract is:

```ts
type OperatorWorkEventStreamEnvelope =
  | { schemaVersion: "operator-work.stream-events/v1"; kind: "accepted"; event: OperatorWorkObservedEvent }
  | { schemaVersion: "operator-work.stream-events/v1"; kind: "running"; event: OperatorWorkObservedEvent }
  | { schemaVersion: "operator-work.stream-events/v1"; kind: "progress"; event: OperatorWorkObservedEvent }
  | { schemaVersion: "operator-work.stream-events/v1"; kind: "retry-scheduled"; event: OperatorWorkObservedEvent }
  | { schemaVersion: "operator-work.stream-events/v1"; kind: "succeeded"; event: OperatorWorkObservedEvent }
  | { schemaVersion: "operator-work.stream-events/v1"; kind: "failed"; event: OperatorWorkObservedEvent }
  | { schemaVersion: "operator-work.stream-events/v1"; kind: "canceled"; event: OperatorWorkObservedEvent }
  | { schemaVersion: "operator-work.stream-events/v1"; kind: "dead-lettered"; event: OperatorWorkObservedEvent }
  | { schemaVersion: "operator-work.stream-events/v1"; kind: "heartbeat"; at: string; cursor?: string }
  | { schemaVersion: "operator-work.stream-events/v1"; kind: "closed"; reason: string; cursor?: string }
  | { schemaVersion: "operator-work.stream-events/v1"; kind: "gap"; gap: OperatorWorkEventStreamGap }
  | { schemaVersion: "operator-work.stream-events/v1"; kind: "error"; error: DomainError };
```

The envelope must not expose worker lease owner, worker id, worker group, worker heartbeat rows,
provider-native process ids, raw command lines, tokens, credentials, or internal attempt counters.

## Entrypoints

| Entrypoint | Mapping | Status |
| --- | --- | --- |
| CLI | `appaloft work events <workId> --follow --json` and `appaloft work watch <workId> --json` | Active |
| oRPC / HTTP | `GET /api/operator-work/{workId}/events` and `GET /api/operator-work/{workId}/events/stream` | Active |
| SDK | Streaming route can be wrapped as an `AsyncIterable` over the same envelope contract. | Active |
| Web | Operator/support UI may reuse the same stream; ordinary user UI should prefer workflow-specific progress and deployment event surfaces. | Future |

## Error Contract

Missing work returns `not_found`. A missing durable work stream adapter returns
`operator_work_event_stream_unavailable`. Stream failures after open should use `error` envelopes
when transport can still write.
