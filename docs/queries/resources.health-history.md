# resources.health-history Query Spec

## Metadata

- Operation key: `resources.health-history`
- Query class: `ResourceHealthHistoryQuery`
- Input schema: `ResourceHealthHistoryQueryInput`
- Handler: `ResourceHealthHistoryQueryHandler`
- Query service: `ResourceHealthHistoryQueryService`
- Domain / bounded context: Workload Delivery / Resource observation
- Current status: active retained health-observation history query

## Normative Contract

`resources.health-history` returns retained `ResourceHealthSummary` observations for one Resource
and a bounded time window.

The query is read-only. It must not run live health probes, write cached summaries, create
deployments, change health policy, mutate proxy/domain state, restart runtime, or infer health from
deployment success alone.

Health history is populated by explicit internal observation/recording work through a
`ResourceHealthObservationRecorder` boundary. `resources.health` remains the current snapshot
query and must not hide write-side history persistence inside the read request.

## Input Model

```ts
type ResourceHealthHistoryQueryInput = {
  resourceId: string;
  window: {
    from: string;
    to: string;
  };
  limit?: number;
};
```

- `window` must be positive and must not exceed 14 days.
- `limit` defaults to 200 and is capped at 720.

## Output Model

```ts
type ResourceHealthHistory = {
  schemaVersion: "resources.health-history/v1";
  resourceId: string;
  from: string;
  to: string;
  generatedAt: string;
  observations: ResourceHealthHistoryObservation[];
  sourceErrors: ResourceHealthSourceError[];
};
```

Each observation includes the retained `ResourceHealthSummary` plus flattened status fields for
timeline display. Missing retained rows return `ok(...)` with `sourceErrors[]`; whole-query
`err(DomainError)` is reserved for invalid input, permission/resource visibility failure, or read
model/storage failure.

## Entrypoints

| Surface | Contract |
| --- | --- |
| CLI | `appaloft resource health-history <resourceId> --from <iso> --to <iso>` dispatches `ResourceHealthHistoryQuery`. |
| HTTP/oRPC | `GET /api/resources/{resourceId}/health-history` uses the shared query schema. |
| Web | Resource Observe/health surfaces may read this query for bounded timelines; current health remains `resources.health`. |
| MCP tools | Future/generated tool descriptors must use the same operation catalog entry and query schema. |

## Current Implementation Notes And Governed Follow-Ups

The first implementation adds the application query, PG/PGlite
`resource_health_observations` table, recorder/read-model pair, CLI, HTTP/oRPC, operation catalog,
contracts, and documentation coverage.

The disabled-by-default/background observer that decides cadence and retention policy can record
through `ResourceHealthObservationRecorder`; that scheduler remains separate from the public query
and must not be implemented by adding writes to `resources.health`.
