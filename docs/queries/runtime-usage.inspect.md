# runtime-usage.inspect Query Spec

## Metadata

- Operation key: `runtime-usage.inspect`
- Query class: `InspectRuntimeUsageQuery`
- Input schema: `InspectRuntimeUsageQueryInput`
- Handler: `InspectRuntimeUsageQueryHandler`
- Query service: `RuntimeUsageInspectionQueryService`
- Domain / bounded context: DeploymentTarget runtime observation / runtime usage read model
- Current status: implemented for the first read-only `0.12.0` slice
- Source classification: accepted query contract with runtime adapter, read-model resolution, CLI,
  HTTP/oRPC, Web readback, public docs, and generated SDK metadata implemented for current
  inspection

## Normative Contract

`runtime-usage.inspect` returns current safe usage attribution for one requested scope without
mutating Appaloft state or runtime target state.

The query exists because operators need to understand current capacity pressure and ownership across
deployment targets, projects, environments, resources, and deployment attempts without SSHing into
targets, reading raw Docker output, or running cleanup commands.

## Global References

This query inherits:

- [ADR-062: Runtime Usage Attribution Boundary](../decisions/ADR-062-runtime-usage-attribution-boundary.md)
- [Runtime Usage Attribution And Monitoring](../specs/068-runtime-usage-attribution-and-monitoring/spec.md)
- [Runtime Usage Attribution Test Matrix](../testing/runtime-usage-attribution-test-matrix.md)
- [ADR-023: Runtime Orchestration Target Boundary](../decisions/ADR-023-runtime-orchestration-target-boundary.md)
- [ADR-047: Runtime Artifact And Workspace Prune Boundary](../decisions/ADR-047-runtime-artifact-workspace-prune-boundary.md)
- [ADR-050: Docker Cache And Image Prune Boundary](../decisions/ADR-050-docker-cache-and-image-prune-boundary.md)
- [Runtime Target Capacity Test Matrix](../testing/runtime-target-capacity-test-matrix.md)
- [Adapter Command/Query Boundary](../architecture/adapter-command-query-boundary.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)

## Input Model

```ts
type RuntimeUsageScope =
  | { kind: "server"; serverId: string }
  | { kind: "project"; projectId: string }
  | { kind: "environment"; environmentId: string }
  | { kind: "resource"; resourceId: string }
  | { kind: "deployment"; deploymentId: string };

type InspectRuntimeUsageQueryInput = {
  scope: RuntimeUsageScope;
  mode?: "current";
  includeArtifacts?: boolean;
  includeWarnings?: boolean;
};
```

| Field | Required | Meaning |
| --- | --- | --- |
| `scope` | Yes | The server, project, environment, resource, or deployment scope to inspect. |
| `mode` | No | First slice supports only `current`; retained samples and time windows are deferred. |
| `includeArtifacts` | No | Includes artifact-level attribution records when true. Defaults to true for detail surfaces. |
| `includeWarnings` | No | Includes bounded partial/freshness/source warnings when true. Defaults to true. |

The query input must not accept cleanup flags, prune categories, cutoff timestamps, runtime sizing
fields, quota policy, billing dimensions, raw container ids, image digests, provider-native ids,
shell commands, host paths, tokens, credentials, secrets, or mutable runtime policy fields.

## Output Model

```ts
type InspectRuntimeUsageResult = Result<RuntimeUsageInspection, DomainError>;

type RuntimeUsageInspection = {
  schemaVersion: "runtime-usage.inspect/v1";
  scope: RuntimeUsageScope;
  generatedAt: string;
  observedAt?: string;
  freshness: "live" | "recent-sample" | "stale" | "unknown";
  partial: boolean;
  totals: RuntimeUsageTotals;
  byProject: RuntimeUsageRollup[];
  byEnvironment: RuntimeUsageRollup[];
  byResource: RuntimeUsageRollup[];
  byDeployment: RuntimeUsageRollup[];
  artifacts: RuntimeArtifactUsage[];
  warnings: RuntimeUsageWarning[];
  sourceErrors: RuntimeUsageSourceError[];
};
```

Usage totals:

```ts
type RuntimeUsageTotals = {
  cpu?: RuntimeCpuUsage;
  memory?: RuntimeMemoryUsage;
  disk?: RuntimeDiskUsage;
  inode?: RuntimeInodeUsage;
  docker?: RuntimeDockerUsage;
  network?: RuntimeNetworkUsage;
};
```

Rollups:

```ts
type RuntimeUsageRollup = {
  scope: RuntimeUsageScope;
  ownership: "attributed" | "partially-attributed" | "unattributed" | "unknown";
  totals: RuntimeUsageTotals;
  currentDeploymentId?: string;
  currentRuntimeId?: string;
  artifactCount?: number;
  warnings: RuntimeUsageWarning[];
};
```

Artifact usage:

```ts
type RuntimeArtifactKind =
  | "active-runtime"
  | "rollback-candidate"
  | "source-workspace"
  | "docker-image"
  | "docker-build-cache"
  | "appaloft-state-root"
  | "volume"
  | "unknown";

type RuntimeArtifactUsage = {
  kind: RuntimeArtifactKind;
  ownership: "attributed" | "partially-attributed" | "unattributed" | "unknown";
  serverId?: string;
  projectId?: string;
  environmentId?: string;
  resourceId?: string;
  deploymentId?: string;
  destinationId?: string;
  runtimeId?: string;
  bytes?: number;
  inodeCount?: number;
  observedAt?: string;
  evidence: RuntimeUsageEvidence[];
  reclaimable: "yes" | "no" | "unknown";
  reclaimBlockedReason?: string;
  warnings: RuntimeUsageWarning[];
};
```

The first slice may omit a measurement when the backend cannot safely provide it. Missing values
mean unavailable, not zero.

## Attribution Rules

1. Use Appaloft labels, deployment snapshots, runtime identity records, workspace metadata, and
   safe read models as ownership evidence.
2. Do not infer ownership from raw names alone.
3. Report ambiguous items as `unattributed` or `unknown`.
4. Preserve per-scope rollups even when some sources fail; set `partial = true` and include
   bounded warnings/source errors.
5. Keep Docker volumes in their own class and do not mark them safely reclaimable.
6. Treat Docker build cache and unused images as diagnostic attribution only. Deletion remains
   exclusively owned by `servers.capacity.prune`.
7. Show current deployment/runtime identity only when evidence exists. Do not imply historical
   time-series correlation in the first slice.

## Query Flow

1. Transport parses input with `InspectRuntimeUsageQueryInput` and dispatches
   `InspectRuntimeUsageQuery` through `QueryBus`.
2. Handler delegates to `RuntimeUsageInspectionQueryService`.
3. Query service resolves the requested scope to eligible deployment targets and safe ownership
   read models.
4. Query service invokes an injected runtime usage inspector/read port for current target
   observations.
5. Runtime adapter translates Docker, local-shell, generic-SSH, Swarm, or future backend evidence
   into provider-neutral usage DTOs.
6. Query service aggregates only query-shaped observations/read models into the output DTO.
7. Query returns `ok(RuntimeUsageInspection)` with partial-state sections when possible; expected
   source failures are bounded `sourceErrors`, not raw runtime output.

## Error Semantics

Whole-query failures are reserved for input validation, authorization, missing requested scope, or
no eligible deployment target when the requested scope cannot be inspected at all.

Backend source failures such as timeout, Docker unavailable, unsupported provider, missing metric
source, or incomplete ownership evidence should usually return `ok(...)` with `partial = true`,
`warnings`, and `sourceErrors`.

Error payloads must follow the global error model and must not include raw shell output, private
paths, credentials, environment values, registry secrets, tokens, or unbounded provider responses.

## Entrypoints

| Surface | Contract |
| --- | --- |
| CLI | First Code Round exposes `appaloft runtime-usage inspect <kind:id>` through the shared query schema. Compatibility aliases such as `appaloft server usage <serverId>`, `appaloft resource usage <resourceId>`, and `appaloft project usage <projectId>` may dispatch the same query only after help naming is accepted. |
| HTTP/oRPC | First Code Round should expose a shared-schema read route such as `GET /api/runtime-usage/inspect` with query parameters derived from `InspectRuntimeUsageQueryInput`. |
| Web | Detail pages may show compact usage readback only after typed DTOs and i18n keys exist. Web must not compute ownership or parse runtime output. |
| SDK | Generated SDK metadata must come from the operation catalog after the query is implemented. |
| Automation / MCP | Future read-only tool over the same operation key and query schema. |

## Current Implementation Notes And Migration Gaps

- `runtime-usage.inspect` is implemented as an application query/schema/handler/service boundary
  with a `RuntimeUsageInspector` port and deterministic application tests.
- A server-scope capacity-backed runtime adapter translator exists for safe point-in-time usage
  inspection and is registered in the shell composition root.
- `runtime-usage.inspect` is wired in the operation catalog, `CORE_OPERATIONS.md`, CLI,
  HTTP/oRPC, contracts, public diagnostics docs, and generated SDK operation metadata for the
  read-only query. Web server/resource readback exists over typed oRPC DTOs. Future MCP/tool
  descriptors remain pending.
- Project, environment, resource, and deployment scopes resolve through read models to candidate
  current deployments and server capacity context. When ownership evidence is incomplete, the query
  returns partial attribution with empty totals, `missing-metric-source` warnings, and sourceErrors
  instead of guessing server usage belongs to the requested scope.
- Appaloft-managed Docker containers labeled with `appaloft.managed=true` now provide current
  container writable bytes, artifact ownership, deployment/resource rollups, and runtime ids when
  ownership labels are present.
- Docker Compose stack deployments generate an Appaloft-owned compose override file during
  deployment so compose-created service containers receive the same ownership labels as
  `docker-container` deployments and can participate in resource/deployment attribution.
- Source workspace directories under the Appaloft source workspace root now provide
  workspace-metadata evidence keyed by deployment id; deployment read models enrich those artifacts
  before project, environment, resource, and deployment rollups are returned.
- Retained runtime identity metadata from deployment read models enriches deployment-id-only
  artifacts when `containerName`, `swarm.serviceName`, or `swarm.stackName` is present.
- `servers.capacity.inspect` already provides server-level capacity diagnostics and may be reused,
  but it is not a substitute for cross-scope usage attribution.
- Retained samples, time-window rollups, charts, thresholds, alert delivery, quotas, and runtime
  sizing remain deferred.
