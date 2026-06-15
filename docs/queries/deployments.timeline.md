# deployments.timeline Query Spec

## Metadata

- Operation key: `deployments.timeline`
- Query class: `DeploymentTimelineQuery`
- Input schema: `DeploymentTimelineQueryInput`
- Handler: `DeploymentTimelineQueryHandler`
- Query service: `DeploymentTimelineQueryService`
- Domain / bounded context: Release orchestration / Deployment Timeline Journal
- Current status: active query target
- Source classification: normative contract

## Normative Contract

`deployments.timeline` reads one deployment attempt's Deployment Timeline Journal entries.

It is read-only. It must not:

- create, retry, redeploy, cancel, clean up, or roll back deployments;
- replace `deployments.show` as the immutable deployment-detail query;
- read from legacy deployment log or event-stream surfaces;
- expose provider-native handles, worker leases, container ids, or raw secret material;
- require the original `deployments.create` transport to remain open.

The query must support:

- bounded historical reads;
- cursor-based continuation;
- optional filtering by timeline entry kind/source for log-style views;
- explicit gap/error signaling when continuity cannot be guaranteed.

## Input Model

| Field | Required | Meaning |
| --- | --- | --- |
| `deploymentId` | Yes | Deployment attempt whose timeline is being read. |
| `cursor` | No | Opaque timeline cursor. When present, entries begin strictly after that cursor. |
| `limit` | No | Maximum number of entries to return. Must be bounded by schema. |
| `kinds` | No | Optional list of timeline kinds for filtered views, such as log views. |
| `sources` | No | Optional list of timeline sources. |

## Output Model

```ts
type DeploymentTimelineResponse = {
  schemaVersion: "deployments.timeline/v1";
  deploymentId: string;
  entries: DeploymentTimelineEntry[];
  nextCursor?: string;
  hasMore: boolean;
};
```

`DeploymentTimelineEntry` is defined by
[Deployment Timeline Journal](../specs/095-deployment-timeline-journal/spec.md).

## Main Flow

1. Validate query input.
2. Resolve that the deployment exists and is visible.
3. Read ordered timeline journal entries for the deployment.
4. Apply cursor and bounded filters.
5. Return entries with the next cursor when more data exists.

## Global References

- [ADR-084: Deployment Timeline Journal Boundary](../decisions/ADR-084-deployment-timeline-journal-boundary.md)
- [Deployment Timeline Journal](../specs/095-deployment-timeline-journal/spec.md)
- [Deployment Detail And Observation Workflow Spec](../workflows/deployment-detail-and-observation.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)
