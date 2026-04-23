# Deployment Event Stream Error Spec

## Normative Contract

`deployments.stream-events` uses the shared platform error model and neverthrow conventions.

Initialization failures return `err(DomainError)`. Failures after the stream has opened should be
represented as structured stream envelopes when the transport can still write.

The query should prefer explicit gap/error signaling over silent event loss.

## Global References

This spec inherits:

- [deployments.stream-events Query Spec](../queries/deployments.stream-events.md)
- [Deployment Detail And Observation Workflow Spec](../workflows/deployment-detail-and-observation.md)
- [Deployment Event Stream Test Matrix](../testing/deployments.stream-events-test-matrix.md)
- [Deployment Event Stream Implementation Plan](../implementation/deployments.stream-events-plan.md)
- [ADR-029: Deployment Event Stream And Recovery Boundary](../decisions/ADR-029-deployment-event-stream-and-recovery-boundary.md)
- [Error Model](./model.md)
- [neverthrow Conventions](./neverthrow-conventions.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)

## Error Details

```ts
type DeploymentEventStreamErrorDetails = {
  queryName?: "deployments.stream-events";
  phase:
    | "query-validation"
    | "deployment-resolution"
    | "permission-resolution"
    | "cursor-resolution"
    | "event-source-load"
    | "event-replay"
    | "live-follow";
  deploymentId?: string;
  cursor?: string;
  lastSequence?: number;
  relatedEntityId?: string;
  relatedEntityType?: "deployment" | "event-projection";
  relatedState?: string;
  correlationId?: string;
  causationId?: string;
};
```

Error details must not include secrets, unmasked environment values, raw provider handles, shell
commands, container ids, or raw runtime output.

## Whole-Query Errors

These errors return `err(DomainError)`.

| Error code | Category | Phase | Retriable | Meaning |
| --- | --- | --- | --- | --- |
| `validation_error` | `validation` | `query-validation` | No | Input shape, `historyLimit`, or boolean flag combination is invalid. |
| `deployment_event_cursor_invalid` | `validation` | `cursor-resolution` | No | Cursor is malformed, expired, or cannot be matched safely. |
| `not_found` | `not-found` | `deployment-resolution` | No | Deployment cannot be found or is not visible. |
| `permission_denied` | `permission` | `permission-resolution` | No | Caller is not allowed to observe the deployment stream. |
| `deployment_event_stream_unavailable` | `infra` | `event-source-load` | Conditional | Event or progress sources cannot be loaded safely enough to start the stream. |
| `deployment_event_replay_failed` | `infra` | `event-replay` | Conditional | Replay source loaded, but bounded ordered replay cannot be produced safely. |

## In-Stream Error And Gap Envelopes

After the stream is open, failures should prefer structured envelopes:

```ts
type DeploymentEventStreamGapEnvelope = {
  kind: "gap";
  gap: {
    code: string;
    phase: "event-replay" | "live-follow";
    retriable: boolean;
    cursor?: string;
    lastSequence?: number;
    recommendedAction?: "restart-stream" | "open-deployment-detail";
  };
};

type DeploymentEventStreamErrorEnvelope = {
  kind: "error";
  error: DomainError;
};
```

Typical post-open conditions:

| Envelope kind | Error code | Phase | Meaning |
| --- | --- | --- | --- |
| `gap` | `deployment_event_stream_gap` | `event-replay` or `live-follow` | Ordered continuity cannot be guaranteed from the requested cursor. |
| `error` | `deployment_event_follow_failed` | `live-follow` | Follow source failed after the stream had already opened. |

The stream must not silently skip historical or live events after detecting a continuity break.

## Consumer Mapping

Web, CLI, HTTP API, automation, and future MCP consumers must:

- treat whole-query errors as fatal stream-start failures;
- render `gap` envelopes as "restart observation" guidance, not as successful continuity;
- render post-open `error` envelopes as observation failure without inferring deployment mutation;
- avoid exposing retry/redeploy/rollback buttons unless those commands are public.

## Test Assertions

Tests must assert:

- initialization failures use `Result` and stable error fields;
- malformed cursor and missing deployment are whole-query failures;
- replay/follow gaps become explicit stream envelopes instead of silent omission;
- stream failure does not mutate deployment state or fabricate write affordances.

## Current Implementation Notes And Migration Gaps

There is no standalone `deployments.stream-events` error surface in current code.

Current progress streaming failures are transport-specific to `deployments.create` and do not yet
provide the durable replay/gap semantics required by this spec.

## Open Questions

- Should a gap after a previously valid cursor always be represented as a `gap` envelope, or are
  there cases where the product should fail the stream immediately with `err(...)` before any
  replay begins?
