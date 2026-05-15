# runtime-monitoring.rollup Query Spec

## Metadata

- Operation key: `runtime-monitoring.rollup`
- Query class: `RuntimeMonitoringRollupQuery`
- Input schema: `RuntimeMonitoringRollupQueryInput`
- Handler: `RuntimeMonitoringRollupQueryHandler`
- Query service: `RuntimeMonitoringRollupQueryService`
- Domain / bounded context: DeploymentTarget runtime observation / runtime monitoring read model
- Current status: active read query for the first retained monitoring Code Round
- Source classification: bounded rollup read contract over retained monitoring samples and
  deployment marker read models

## Normative Contract

`runtime-monitoring.rollup` returns bounded time-window series, totals, top contributors, and
deployment markers for one runtime monitoring scope. It reads retained monitoring samples and safe
read models only. It must not collect fresh samples, connect to runtime targets, run Docker,
mutate runtime targets, load aggregates for business predicates, or enforce thresholds.

The query exists to power Appaloft Observe surfaces without becoming a Prometheus, dashboard
builder, arbitrary metrics query language, or causal analysis engine.

## Global References

This query inherits:

- [ADR-063: Runtime Monitoring Observation Boundary](../decisions/ADR-063-runtime-monitoring-observation-boundary.md)
- [Runtime Monitoring Observation Boundary](../specs/069-runtime-monitoring-observation-boundary/spec.md)
- [Runtime Usage Attribution Test Matrix](../testing/runtime-usage-attribution-test-matrix.md)
- [runtime-monitoring.samples.list](./runtime-monitoring.samples.list.md)
- [runtime-usage.inspect](./runtime-usage.inspect.md)
- [ADR-062: Runtime Usage Attribution Boundary](../decisions/ADR-062-runtime-usage-attribution-boundary.md)
- [ADR-020: Resource Health Observation](../decisions/ADR-020-resource-health-observation.md)
- [Adapter Command/Query Boundary](../architecture/adapter-command-query-boundary.md)
- [Error Model](../errors/model.md)

## Input Model

```ts
type RuntimeMonitoringRollupQueryInput = {
  scope: RuntimeMonitoringScope;
  window: {
    from: string;
    to: string;
  };
  bucket: "minute" | "five-minute" | "hour";
  signals?: Array<"cpu" | "memory" | "disk" | "inode" | "docker" | "network">;
  includeDeploymentMarkers?: boolean;
  includeTopContributors?: boolean;
};
```

| Field | Required | Meaning |
| --- | --- | --- |
| `scope` | Yes | The server, project, environment, resource, or deployment scope to summarize. |
| `window.from` / `window.to` | Yes | Inclusive rollup window. `to` must be after `from`. |
| `bucket` | Yes | Output bucket size. The first implementation supports minute, five-minute, and hour buckets. |
| `signals` | No | Optional signal filter. Omitted means all retained signals. |
| `includeDeploymentMarkers` | No | Include deployment markers from read models/events when true. Defaults to true for resource/deployment scopes. |
| `includeTopContributors` | No | Include resource/deployment/artifact contributors when true. Defaults to true for server/project/environment scopes. |

The first implementation must reject windows longer than 14 days and must reject bucket/window
combinations that would return more than 720 buckets.

## Output Model

```ts
type RuntimeMonitoringRollupResult = Result<RuntimeMonitoringRollup, DomainError>;

type RuntimeMonitoringRollup = {
  schemaVersion: "runtime-monitoring.rollup/v1";
  scope: RuntimeMonitoringScope;
  from: string;
  to: string;
  bucket: "minute" | "five-minute" | "hour";
  generatedAt: string;
  freshness: "recent-sample" | "stale" | "unknown";
  partial: boolean;
  retention: RuntimeMonitoringRetentionSummary;
  series: RuntimeMonitoringSeries[];
  totals: RuntimeMonitoringRollupTotals;
  topContributors: RuntimeMonitoringContributor[];
  deploymentMarkers: RuntimeMonitoringDeploymentMarker[];
  warnings: RuntimeMonitoringWarning[];
  sourceErrors: RuntimeMonitoringSourceError[];
};
```

Deployment markers are time correlation only. They may include deployment id, resource id,
environment id, status, observed event time, and safe label text. They must not claim a deployment
caused a metric change unless a later governed diagnostic feature adds causal evidence.

## Rollup Rules

1. Rollups aggregate retained samples by persisted safe scope evidence.
2. Project and environment scopes return shallow rollups and top contributors from retained
   resource/deployment/server evidence; they do not become runtime-state owners themselves. Deep
   diagnosis links to resource, deployment, or server detail.
3. Server scopes may include resource/deployment/artifact contributors when evidence exists.
4. Top contributors are ordered by observed retained usage, with stable scope-key ordering only as
   a tie-breaker. Missing values are not treated as evidence of zero unless a retained sample
   explicitly records zero.
5. Missing buckets are represented as partial/stale/unknown, not zero, unless a retained sample
   explicitly records a zero value.
6. Runtime logs, deployment logs, health, access, and diagnostics remain separate query surfaces.
   This query may return stable links or ids, but it must not copy log lines into rollup output.
7. Threshold evaluation is out of scope until threshold command/query specs are accepted.

## Query Flow

1. Transport parses `RuntimeMonitoringRollupQueryInput` and dispatches
   `RuntimeMonitoringRollupQuery` through `QueryBus`.
2. Handler delegates to `RuntimeMonitoringRollupQueryService`.
3. Query service validates the window/bucket bounds and reads retained monitoring samples through a
   read-model port.
4. Query service optionally joins deployment marker read models/events for the selected window.
5. Query service assembles bounded series, totals, contributors, markers, warnings, and source
   errors without mutating aggregates or runtime targets.

## Error Semantics

Expected source gaps such as no retained samples, stale data, missing signal sources, partial
collection, or missing deployment markers should return `ok(...)` with `partial = true`, warnings,
and source errors.

Whole-query failures are reserved for invalid input, unauthorized scope, missing requested scope,
unsupported signal filters, and window/bucket combinations outside bounded query limits.

## Entrypoints

| Surface | Contract |
| --- | --- |
| CLI | `appaloft runtime-monitoring rollup <scope> --from <iso> --to <iso> --bucket <bucket>` dispatches the shared query through `QueryBus`. |
| HTTP/oRPC | `GET /api/runtime-monitoring/rollup` uses the shared query schema and returns the typed response contract. |
| Web | Observe charts, top contributors, and deployment markers must render from this typed DTO and i18n keys. |
| SDK / MCP | SDK metadata and MCP/tool descriptors are generated from the operation catalog; MCP/tool handlers dispatch this shared query and must return schema errors without dispatching invalid inputs. |

## Current Implementation Notes And Migration Gaps

- Local query spec and bounded rollup semantics are accepted here.
- Application schema/handler/service, operation-catalog entry, CLI command, HTTP/oRPC route, SDK
  operation metadata, public docs anchor, PG/PGlite retained sample migration, PG sample read model,
  PG/PGlite sample write and retention prune stores, internal collector service, scheduled history
  retention dispatch, and PG deployment marker read model now exist and are covered by targeted
  application, CLI, HTTP/oRPC, SDK metadata, and PGlite tests.
- The disabled-by-default background collector runner exists for active servers and
  runtime-owning resources/deployments/projects/environments. MCP/tool handler dispatch through the
  shared query boundary now exists. MCP-facing tool server registration and Web Observe/WebView
  coverage for server/resource Monitor surfaces and project/environment rollup-only surfaces are
  implemented.
- Project and environment rollups now return shallow top contributors ordered by retained observed
  usage without treating the project or environment scope as a runtime-state owner.
- Threshold state and enforcement remain out of scope.
