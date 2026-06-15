# Deployment Timeline Error Spec

## Normative Contract

`deployments.timeline` and `deployments.timeline.stream` use the shared platform error model and
neverthrow conventions.

The read query returns whole-query errors for invalid input, missing deployments, permission
failures, and journal-source failures. The stream should emit structured gap/error envelopes after
it has opened when the transport can still write.

## Error Details

```ts
type DeploymentTimelineErrorDetails = {
  queryName?: "deployments.timeline" | "deployments.timeline.stream";
  phase:
    | "query-validation"
    | "deployment-resolution"
    | "permission-resolution"
    | "cursor-resolution"
    | "timeline-source-load"
    | "timeline-replay"
    | "live-follow";
  deploymentId?: string;
  cursor?: string;
  lastSequence?: number;
};
```

Error details must not include secrets, unmasked environment values, raw provider handles, worker
leases, container ids, shell credentials, or raw runtime output beyond the already-redacted
timeline message.

## Codes

| Error code | Category | Phase | Retriable | Meaning |
| --- | --- | --- | --- | --- |
| `validation_error` | `validation` | `query-validation` | No | Input shape, cursor, filters, or limit is invalid. |
| `deployment_timeline_cursor_invalid` | `validation` | `cursor-resolution` | No | Cursor is malformed, expired, or cannot be matched safely. |
| `not_found` | `not-found` | `deployment-resolution` | No | Deployment cannot be found or is not visible. |
| `permission_denied` | `permission` | `permission-resolution` | No | Caller is not allowed to observe the deployment timeline. |
| `deployment_timeline_unavailable` | `infra` | `timeline-source-load` | Conditional | Timeline journal entries cannot be loaded safely enough to start the read. |
| `deployment_timeline_gap` | `infra` | `timeline-replay` or `live-follow` | Yes | Ordered continuity cannot be guaranteed from the requested cursor. |
| `deployment_timeline_follow_failed` | `infra` | `live-follow` | Conditional | Follow source failed after the stream had already opened. |

## Global References

- [deployments.timeline Query Spec](../queries/deployments.timeline.md)
- [Deployment Timeline Journal](../specs/095-deployment-timeline-journal/spec.md)
- [ADR-084: Deployment Timeline Journal Boundary](../decisions/ADR-084-deployment-timeline-journal-boundary.md)
- [Error Model](./model.md)
- [neverthrow Conventions](./neverthrow-conventions.md)
