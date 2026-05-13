# Runtime Usage Attribution And Monitoring

## Status

- Round: Spec Round / accepted boundary planning
- Artifact state: accepted candidate, not implemented
- Roadmap target: `0.12.0`
- Compatibility impact: pre-1.0 policy; additive read surfaces first, later enforcement requires a
  separate accepted ADR

## Business Outcome

Operators can answer how much runtime capacity Appaloft-managed workloads consume across
deployment targets, projects, environments, resources, and deployment attempts without SSHing into
the target or interpreting raw Docker output.

The first product goal is read-only attribution and monitoring. Appaloft should show safe CPU,
memory, disk, Docker artifact/cache, source workspace, and optional network signals beside existing
health, logs, diagnostics, and capacity inspect surfaces. Later slices may add thresholds,
operator alerts, quotas, and runtime sizing enforcement only after their command/spec/test
boundaries are accepted.

## Objective Requirement Baseline

The `0.12.0` slice is driven by Appaloft operator questions, not by feature parity for its own
sake. A requirement belongs in this track only when it helps answer one of these recurring
operational questions without requiring target shell access or raw Docker/provider interpretation:

| Operator question | Objective need | `0.12.0` disposition |
| --- | --- | --- |
| Which project, environment, resource, or deployment is consuming target capacity right now? | Safe scope attribution over current runtime target observations. | Required for the first read-only slice. |
| Is this target close to disk, inode, memory, CPU, or Docker cache/image pressure? | Current capacity totals, partial-state warnings, and freshness metadata. | Required through reuse of the existing capacity diagnostic base. |
| Which Appaloft-owned artifacts explain disk usage? | Separate active runtime, rollback candidate, source workspace, Docker image/cache, Appaloft state-root, volume, and unknown buckets. | Required for disk attribution; unknown must stay explicit. |
| Did a recent deployment likely coincide with a usage change? | Deployment-scoped current attribution now; retained samples and deployment markers later. | Current attribution required; time-series correlation deferred. |
| Can an operator decide whether to inspect, clean up, or resize safely? | Read-only summary and next diagnostic context without executing cleanup or enforcement. | Required; mutation and enforcement remain out of scope. |
| Can Appaloft warn before a target runs out of usable capacity? | Threshold policy, evaluation, and operator visibility. | Deferred unless explicitly pulled into `0.12.0`. |
| Can Appaloft enforce CPU/memory/replica limits or project quotas? | Runtime sizing and quota policy with adapter enforcement. | Out of scope for the first slice; separate ADR required. |

The baseline intentionally excludes requirements that are only nice-to-have dashboards, provider
vanity metrics, billing analytics, or application-level APM. If a metric cannot change an operator
decision about diagnosis, cleanup, capacity planning, or runtime configuration, it should not be a
`0.12.0` requirement.

## Ubiquitous Language

| Term | Meaning | Context | Compatibility aliases |
| --- | --- | --- | --- |
| Runtime usage attribution | Safe mapping from runtime target capacity signals to Appaloft-owned project, environment, resource, deployment, and server scopes. | DeploymentTarget runtime observation | usage breakdown |
| Runtime usage sample | One bounded, sanitized observation of CPU, memory, disk, Docker, workspace, and optional network usage at a point in time. | Runtime target observation | metrics sample |
| Usage rollup | Aggregated usage values for a scope and time window, with freshness, partial, and source metadata. | Read model / Web/API/CLI | metrics summary |
| Artifact attribution | Ownership classification for Docker images, containers, build cache, source workspaces, runtime roots, and rollback candidates. | Runtime target capacity | disk attribution |
| Usage threshold | A non-mutating policy that marks high usage, warning, or critical states for a scope. | Monitoring policy | alert threshold |
| Runtime sizing policy | Future enforcement policy for CPU, memory, replicas, restart policy, and rollout sizing. | Runtime target configuration | quota / limit |

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| RT-USAGE-001 | Server capacity remains the base signal | a target supports `runtime.capacity` | usage attribution samples target capacity | Appaloft reuses the existing `servers.capacity.inspect` capability or its adapter-safe primitives and never runs prune, stop, repair, or deployment commands while reading usage. |
| RT-USAGE-002 | Resource/deployment attribution is safe | containers, workspaces, images, and runtime labels contain Appaloft ownership metadata | usage is attributed | each attributed item names server, project, environment, resource, deployment, destination, and artifact kind only when evidence is present; uncertain items are reported as unattributed instead of guessed. |
| RT-USAGE-003 | Project and environment rollups are query-shaped | an operator opens project or environment usage | the query reads samples or current target observations | rollups aggregate only read-model/sample data and never load aggregates for business predicates or mutate runtime state. |
| RT-USAGE-004 | Freshness and partial diagnostics are explicit | a target times out, Docker is unavailable, or some metrics are missing | usage is returned | read results include `generatedAt`, `observedAt`, `freshness`, `partial`, warnings, and safe source errors so users do not confuse missing metrics with zero usage. |
| RT-USAGE-005 | Disk attribution separates classes | a target has active runtimes, rollback candidates, source workspaces, build cache, unused images, state roots, and volumes | disk usage is displayed | output separates Appaloft-managed runtime artifacts, rollback candidates, source workspaces, Docker cache/images, Appaloft state roots, and unowned/unknown storage; Docker volumes are not treated as safely reclaimable. |
| RT-USAGE-006 | Current deployment context is visible | a resource has retained deployment/runtime identity | current usage is inspected | the result can show which deployment/runtime identity owns attributed current usage when evidence exists, without pretending to provide historical time-series correlation. |
| RT-USAGE-007 | Time-series collection is opt-in and bounded | monitoring collection is enabled | a scheduler samples targets | samples are retained with bounded resolution/retention, safe labels, and operator-work visibility for collection failures; collection does not execute deploy/prune/repair work. |
| RT-USAGE-008 | Entrypoints share operation contracts | CLI, HTTP/oRPC, Web, or future MCP reads usage | input is parsed | each surface dispatches an explicit Query through `QueryBus` and reuses the same schema/output contract. |
| RT-USAGE-009 | Thresholds do not enforce limits | a usage threshold is configured | usage crosses the threshold | Appaloft marks warning/critical state and can create operator visibility, but it does not throttle, stop, prune, redeploy, or reject deployments without a separate governed command. |
| RT-USAGE-010 | Runtime sizing remains separate | a config file declares CPU, memory, replicas, restart policy, or rollout sizing | current deployment config bootstrap evaluates it | Appaloft keeps rejecting unsupported sizing fields until an accepted runtime sizing ADR/spec/runtime enforcement test matrix exists. |

## Operation Boundary

Proposed read-only operation keys:

| Operation | Kind | Role | Code Round state |
| --- | --- | --- | --- |
| `runtime-usage.inspect` | Query | Return current safe usage attribution for one server, project, environment, resource, or deployment scope. | Accepted for first Code Round. |
| `runtime-usage.rollup` | Query | Return bounded time-window usage rollups for a scope from collected samples. | Proposed after sample persistence exists. |
| `runtime-usage.samples.list` | Query | Return bounded raw sample windows for charts and diagnostics. | Proposed after retention policy exists. |
| `runtime-usage-thresholds.configure` | Command | Persist non-enforcing warning/critical threshold policy for a scope. | Future Spec Round. |
| `runtime-usage-thresholds.show` | Query | Read safe threshold policy and latest evaluation state. | Future Spec Round. |

`runtime-usage.inspect` is the first recommended slice. It must be read-only and must not:

- create, retry, cancel, rollback, redeploy, stop, start, restart, prune, or repair anything;
- mutate project, environment, resource, deployment, server, route, credential, runtime, process,
  audit, or retention state;
- run Docker prune, broad `docker system prune`, Docker volume prune, cleanup commands, package
  managers, install/build/start commands, health probes that mutate state, or provider repair
  actions;
- infer ownership from raw names alone when Appaloft labels/snapshots/state cannot prove it;
- expose raw shell output, private paths beyond safe Appaloft root summaries, credentials,
  environment values, registry secrets, tokens, or unbounded Docker/provider responses.

## Output Contract Sketch

```ts
type RuntimeUsageScope =
  | { kind: "server"; serverId: string }
  | { kind: "project"; projectId: string }
  | { kind: "environment"; environmentId: string }
  | { kind: "resource"; resourceId: string }
  | { kind: "deployment"; deploymentId: string };

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
  thresholds: RuntimeUsageThresholdState[];
  warnings: RuntimeUsageWarning[];
  sourceErrors: RuntimeUsageSourceError[];
};
```

Initial measurement groups:

- CPU: current load/usage where safely available, logical cores, and optional container CPU usage.
- Memory: target total/used/available plus attributed container memory where safely available.
- Disk: filesystem, inode, runtime root, state root, source workspace, Docker image/cache, and
  artifact classes.
- Network: optional future container or proxy traffic counters when a backend can expose them
  without app-level instrumentation.

## Domain Ownership

- Bounded context: DeploymentTarget runtime observation, with Resource and Deployment read-model
  context for attribution labels.
- Aggregate/resource owner: `DeploymentTarget` supplies target identity and backend capability;
  `Resource` and `Deployment` supply safe ownership context through read models/snapshots, not by
  being mutated.
- Adapter owner: runtime target adapters collect target-specific metrics/evidence and translate
  them into provider-neutral usage DTOs.
- Read-model owner: application query services aggregate sample data into project, environment,
  resource, deployment, and server rollups.

## Public Surfaces

- CLI: `appaloft runtime-usage inspect <kind:id>` dispatches the accepted query. Compatibility
  aliases such as `appaloft server usage`, `appaloft resource usage`, and `appaloft project usage`
  require a later help-naming decision.
- HTTP/oRPC: `GET /api/runtime-usage/inspect` dispatches the accepted query with shared schema
  parsing for the first read-only route.
- Web: resource detail, deployment detail, project detail, and server detail can show compact usage
  cards and charts after query contracts exist.
- Public docs/help: proposed stable anchors under `diagnostics.runtime-usage` and
  `diagnostics.runtime-target-capacity`.
- Future MCP/tools: expose the same query schemas and operation catalog entries; no tool-only
  metric shape.

## Non-Goals

- Billing, cost allocation, chargeback, or plan enforcement.
- Automatic cleanup, prune, stop, restart, rollback, redeploy, scale, or repair.
- Docker volume prune or destructive state cleanup.
- Application-level APM, request latency, error rate, traces, business KPI collection, or metrics
  that do not support diagnosis, cleanup, capacity planning, or runtime configuration decisions.
- CPU/memory/replica/runtime sizing enforcement in the first read-only slices.
- Provider-specific metrics APIs leaking into `core`, `application`, Web components, or public
  command schemas.

## ADR Decision

[ADR-062: Runtime Usage Attribution Boundary](../../decisions/ADR-062-runtime-usage-attribution-boundary.md)
accepts `runtime-usage.inspect` as the first read-only query boundary for `0.12.0`.

A separate accepted ADR/spec is still required before any slice that adds persistent sample storage,
background collection, threshold policy, alert delivery, quota decisions, runtime sizing, or
enforcement.

## Current Implementation Notes And Migration Gaps

- `servers.capacity.inspect` already returns server-level disk, inode, memory, CPU, Docker
  image/build-cache, Appaloft runtime-root/state/source-workspace usage, safe reclaimable
  estimates, warnings, and partial state.
- `servers.capacity.prune` and scheduled runtime prune already provide safe cleanup boundaries, but
  they are maintenance operations and must not be collapsed into usage reads.
- `runtime-usage.inspect` is active as an application query/schema/handler/service boundary with a
  `RuntimeUsageInspector` port. The first runtime adapter supports server-scope live inspection by
  translating `servers.capacity.inspect` output into `runtime-usage.inspect/v1`.
- `runtime-usage.inspect` is exposed through `CORE_OPERATIONS.md`, operation catalog, CLI,
  HTTP/oRPC, contracts, public diagnostics docs, generated SDK operation metadata, and Web
  server/resource readback.
- Project, environment, resource, and deployment scopes resolve through read models to candidate
  current deployments and server capacity context. They return partial attribution with empty totals
  when ownership evidence is incomplete, rather than guessing that server usage belongs to the
  requested scope.
- Appaloft-managed Docker containers labeled with `appaloft.managed=true` now contribute current
  artifact evidence, container writable bytes, deployment/resource ownership, and current runtime ids
  when ownership labels are present.
- Source workspace directories under the Appaloft source workspace root now contribute
  workspace-metadata evidence keyed by deployment id. Project/environment/resource/destination
  context is enriched from deployment read models before scope rollups are assembled.
- Retained runtime identity metadata from deployment read models now enriches deployment-id-only
  artifacts when `containerName`, `swarm.serviceName`, or `swarm.stackName` is present.
- Future MCP/tool descriptors remain pending.
- `resources.health`, `resources.runtime-logs`, and `resources.diagnostic-summary` provide
  resource observation, but they are not usage attribution or time-series metrics.
- Repository config CPU, memory, replicas, restart policy, and rollout sizing remain unsupported
  fields until a separate runtime sizing contract exists.
