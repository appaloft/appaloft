# runtime-monitoring.samples.list Query Spec

## Metadata

- Operation key: `runtime-monitoring.samples.list`
- Query class: `ListRuntimeMonitoringSamplesQuery`
- Input schema: `ListRuntimeMonitoringSamplesQueryInput`
- Handler: `ListRuntimeMonitoringSamplesQueryHandler`
- Query service: `RuntimeMonitoringSamplesQueryService`
- Domain / bounded context: DeploymentTarget runtime observation / runtime monitoring read model
- Current status: active read query for the first retained monitoring Code Round
- Source classification: retained sample read contract; application schema/service, PG/PGlite read
  models, sample write/pruning stores, internal collector service, and scheduled history retention
  dispatch exist; disabled-by-default active-server plus resource/deployment/project/environment
  background collector runner exists; MCP/tool handler dispatch, MCP-facing tool server
  registration, and Web Observe/WebView verification exist

## Normative Contract

`runtime-monitoring.samples.list` returns a bounded, sanitized window of retained runtime
monitoring samples for exactly one scope. It reads persisted observation records only. It must not
connect to runtime targets, poll Docker, run health checks, collect new samples, prune, repair,
deploy, stop, restart, resize, throttle, or enforce thresholds.

The query exists so Web, CLI, API clients, and future tools can render short diagnostic chart
windows without SSH access or raw provider output.

## Global References

This query inherits:

- [ADR-063: Runtime Monitoring Observation Boundary](../decisions/ADR-063-runtime-monitoring-observation-boundary.md)
- [Runtime Monitoring Observation Boundary](../specs/069-runtime-monitoring-observation-boundary/spec.md)
- [Runtime Usage Attribution Test Matrix](../testing/runtime-usage-attribution-test-matrix.md)
- [runtime-usage.inspect](./runtime-usage.inspect.md)
- [ADR-062: Runtime Usage Attribution Boundary](../decisions/ADR-062-runtime-usage-attribution-boundary.md)
- [ADR-018: Resource Runtime Log Observation](../decisions/ADR-018-resource-runtime-log-observation.md)
- [ADR-053: Resource Runtime Log Archive Retention Boundary](../decisions/ADR-053-resource-runtime-log-archive-retention-boundary.md)
- [Adapter Command/Query Boundary](../architecture/adapter-command-query-boundary.md)
- [Error Model](../errors/model.md)

## Input Model

```ts
type RuntimeMonitoringScope =
  | { kind: "server"; serverId: string }
  | { kind: "project"; projectId: string }
  | { kind: "environment"; environmentId: string }
  | { kind: "resource"; resourceId: string }
  | { kind: "deployment"; deploymentId: string };

type ListRuntimeMonitoringSamplesQueryInput = {
  scope: RuntimeMonitoringScope;
  window: {
    from: string;
    to: string;
  };
  signals?: Array<"cpu" | "memory" | "disk" | "inode" | "docker" | "network">;
  limit?: number;
};
```

| Field | Required | Meaning |
| --- | --- | --- |
| `scope` | Yes | The server, project, environment, resource, or deployment scope to read. |
| `window.from` / `window.to` | Yes | Inclusive sample window. `to` must be after `from`. |
| `signals` | No | Optional signal filter. Omitted means all retained signals. |
| `limit` | No | Maximum returned sample count. Defaults to 300 and must not exceed 720. |

The first implementation must reject windows longer than 24 hours. Local/PGlite deployments may
use a smaller retention profile, but they must return an explicit source error when the requested
window is outside retained data instead of pretending old samples are zero.

The query input must not accept shell commands, provider ids, raw container ids, host paths,
cleanup flags, prune categories, threshold mutation fields, CPU/memory sizing fields, billing
dimensions, tokens, credentials, or secret values.

## Output Model

```ts
type ListRuntimeMonitoringSamplesResult = Result<RuntimeMonitoringSamplesWindow, DomainError>;

type RuntimeMonitoringSamplesWindow = {
  schemaVersion: "runtime-monitoring.samples.list/v1";
  scope: RuntimeMonitoringScope;
  from: string;
  to: string;
  generatedAt: string;
  freshness: "recent-sample" | "stale" | "unknown";
  partial: boolean;
  retention: RuntimeMonitoringRetentionSummary;
  samples: RuntimeMonitoringSample[];
  warnings: RuntimeMonitoringWarning[];
  sourceErrors: RuntimeMonitoringSourceError[];
};

type RuntimeMonitoringSample = {
  sampleId: string;
  observedAt: string;
  collectedAt: string;
  scopeEvidence: RuntimeMonitoringScopeEvidence;
  totals: RuntimeMonitoringSampleTotals;
  freshness: "live" | "recent-sample" | "stale" | "unknown";
  partial: boolean;
  labels: RuntimeMonitoringSafeLabels;
  warnings: RuntimeMonitoringWarning[];
  sourceErrors: RuntimeMonitoringSourceError[];
};
```

Sample totals reuse the signal vocabulary from `runtime-usage.inspect` where possible. Missing
signals mean unavailable or outside retention, not zero.

## Retention And Bounds

The first Code Round must implement a bounded retention profile before sample writes are enabled:

- default collector cadence: 60 seconds;
- minimum supported cadence: 30 seconds;
- local/PGlite raw sample retention: 6 hours by default;
- PostgreSQL raw sample retention: 24 hours by default;
- returned sample limit: 720 maximum;
- stored labels: safe Appaloft ids, scope kind, provider key, artifact class, and freshness only.

Raw shell output, unbounded provider payloads, runtime logs, deployment logs, request payloads,
environment values, credentials, registry secrets, private keys, tokens, and private host paths must
not be persisted in monitoring samples.

## Query Flow

1. Transport parses `ListRuntimeMonitoringSamplesQueryInput` and dispatches
   `ListRuntimeMonitoringSamplesQuery` through `QueryBus`.
2. Handler delegates to `RuntimeMonitoringSamplesQueryService`.
3. Query service validates the time window and scope, then reads only the monitoring sample read
   model.
4. The read model filters by persisted safe scope evidence and time window.
5. Query service returns a bounded DTO with partial/source-error state when samples are missing,
   stale, or outside retention.

## Error Semantics

Expected source gaps such as no retained samples, a partially collected window, missing signal
sources, or a window partly outside retention should return `ok(...)` with `partial = true`,
bounded warnings, and `sourceErrors`.

Whole-query failures are reserved for invalid input, unauthorized scope, missing requested scope,
unsupported signal filters, and windows outside the maximum bounded contract.

## Entrypoints

| Surface | Contract |
| --- | --- |
| CLI | `appaloft runtime-monitoring samples <scope> --from <iso> --to <iso>` dispatches the shared query through `QueryBus`. |
| HTTP/oRPC | `GET /api/runtime-monitoring/samples` uses the shared query schema and returns the typed response contract. |
| Web | Server/resource Observe surfaces may render sample charts only from this typed DTO. |
| SDK / MCP | SDK metadata and MCP/tool descriptors are generated from the operation catalog; MCP/tool handlers dispatch this shared query and must return schema errors without dispatching invalid inputs. |

## Current Implementation Notes And Migration Gaps

- Local query spec and retention bounds are accepted here.
- Application schema/handler/service, operation-catalog entry, CLI command, HTTP/oRPC route, SDK
  operation metadata, public docs anchor, PG/PGlite retained sample migration, PG sample read model,
  PG/PGlite sample write and retention prune stores, internal collector service, and scheduled
  history retention dispatch now exist and are covered by targeted application, CLI, HTTP/oRPC, SDK
  metadata, and PGlite tests.
- The disabled-by-default background collector runner exists for active servers and
  runtime-owning resources/deployments/projects/environments. MCP/tool handler dispatch through the
  shared query boundary now exists. MCP-facing tool server registration and Web Observe/WebView
  coverage for server/resource Monitor surfaces and project/environment rollup-only surfaces are
  implemented.
- Threshold policy remains out of scope for this query.
