# ADR-062: Runtime Usage Attribution Boundary

Status: Accepted

Date: 2026-05-13

## Context

`0.12.0` introduces runtime usage attribution and monitoring so operators can answer which
deployment targets, projects, environments, resources, and deployment attempts are consuming
runtime capacity without SSHing into the target or interpreting raw Docker output.

Existing capacity and maintenance decisions already define adjacent boundaries:

- ADR-023 keeps runtime target backend details behind provider-neutral runtime target adapters.
- ADR-047 and ADR-050 keep runtime artifact, workspace, Docker build-cache, and unused-image prune
  behavior dry-run-first and destructive only through explicit prune commands.
- ADR-054 defines durable process state for accepted long-running work.
- ADR-055 schedules runtime prune by dispatching `servers.capacity.prune` through command-bus
  boundaries.

Runtime usage attribution overlaps with capacity diagnostics and prune evidence, but it must not
become another cleanup, repair, quota, billing, or runtime-sizing path. The first `0.12.0` slice
needs a durable operation boundary before Code Round because it adds a public read capability,
query-shaped read models, and cross-scope attribution language.

## Decision

Appaloft will model the first runtime usage slice as a read-only query named
`runtime-usage.inspect`.

The query returns current safe usage attribution for exactly one requested scope:

- `server`;
- `project`;
- `environment`;
- `resource`;
- `deployment`.

The canonical domain term is `Runtime usage attribution`: safe mapping from runtime target capacity
signals to Appaloft-owned project, environment, resource, deployment, and server scopes. Public
contracts may use "usage" and "usage breakdown" as compatibility/help language, but source-of-truth
docs, code, tests, and operation catalog entries must use `runtime usage` and `attribution`.

`runtime-usage.inspect` must be implemented as a query:

- transports dispatch through `QueryBus`;
- transport inputs reuse the shared query input schema;
- query handlers delegate to an application query service;
- query services depend on injected runtime usage inspector/read-model ports;
- runtime adapters collect target-specific evidence and return sanitized provider-neutral DTOs;
- query aggregation may join read models and safe current target observations, but must not mutate
  aggregates, runtime targets, process state, repositories, target-local files, containers, images,
  routes, logs, audit rows, or retention state.

Attribution is conservative. A returned item may name project, environment, resource, deployment,
destination, runtime identity, or artifact kind only when Appaloft ownership evidence exists
through labels, deployment snapshots, runtime identity records, workspace metadata, or safe read
models. If ownership evidence is missing or ambiguous, the item is returned as unattributed or
unknown instead of guessed from raw names alone.

The query output must include freshness and partial-state metadata:

- `generatedAt`;
- `observedAt` when an observation source provides one;
- freshness such as live, recent sample, stale, or unknown;
- `partial` when any requested signal is missing;
- bounded warnings and source errors.

Disk attribution must keep these classes separate when evidence exists:

- active runtime artifacts;
- rollback candidates;
- source workspaces;
- Docker images and build cache;
- Appaloft state roots;
- volumes;
- unattributed or unknown storage.

Docker volumes are not safely reclaimable runtime usage, even when they appear related to an
Appaloft workload.

The first Code Round may implement point-in-time inspection without sample persistence. Retained
runtime usage samples, rollup queries, background collectors, threshold policy, alerting, quotas,
and runtime sizing enforcement require separate accepted specs or ADR coverage before
implementation.

## Prohibited Behavior

`runtime-usage.inspect` must not:

- create, retry, cancel, rollback, redeploy, stop, start, restart, prune, repair, resize, or scale
  any workload or runtime target;
- run Docker prune, Docker volume prune, cleanup commands, package managers, install/build/start
  commands, state-root maintenance, proxy repair, or provider repair actions;
- accept CPU, memory, replica, restart-policy, rollout-overlap, quota, billing, or enforcement
  configuration;
- infer ownership from raw container names, image names, workspace paths, or provider ids without
  Appaloft evidence;
- expose raw shell output, private host paths beyond safe Appaloft root summaries, credentials,
  environment values, registry secrets, tokens, or unbounded provider responses;
- write runtime usage samples unless a retained sample store and retention policy have been accepted
  in a later slice.

## Consequences

- `servers.capacity.inspect` remains the base server capacity diagnostic and may be reused as an
  implementation primitive, but `runtime-usage.inspect` is the cross-scope attribution read
  contract.
- `servers.capacity.prune` remains the only runtime target prune mutation for runtime artifacts,
  workspaces, Docker build cache, and unused images.
- `runtime-usage.inspect` is not a dashboard completeness feature. Metrics belong in the query only
  when they answer operator decisions about diagnosis, cleanup planning, capacity planning,
  runtime context, or safe deferral to later sizing/enforcement specs.
- Web can render compact usage readback only from typed query DTOs and localized text; it must not
  parse Docker output or compute ownership in Svelte components.
- Future MCP/tool contracts must use the same operation key and schema as CLI and HTTP/oRPC.
- Background collection, rollups, thresholds, alert delivery, runtime sizing, and quotas remain
  separate slices with their own test matrix rows and release readiness gates.

## Governed Specs

- [Runtime Usage Attribution And Monitoring](../specs/068-runtime-usage-attribution-and-monitoring/spec.md)
- [runtime-usage.inspect Query Spec](../queries/runtime-usage.inspect.md)
- [Runtime Usage Attribution Test Matrix](../testing/runtime-usage-attribution-test-matrix.md)
- [Business Operation Map](../BUSINESS_OPERATION_MAP.md)
- [Product Roadmap](../PRODUCT_ROADMAP.md)
- [Adapter Command/Query Boundary](../architecture/adapter-command-query-boundary.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)
- [Error Model](../errors/model.md)

## Migration Gaps

- `runtime-usage.inspect` has an application query/schema/handler/service boundary, deterministic
  application tests, a server-scope capacity-backed runtime adapter translator, and shell
  dependency registration. It is wired in the operation catalog, `CORE_OPERATIONS.md`, CLI,
  HTTP/oRPC, contracts, public diagnostics docs, and generated SDK operation metadata for the
  read-only query. Web readback, generated MCP/tool descriptors, and the read-only
  `runtime_usage_inspect` MCP handler/server are implemented through the same query schema.
- Project, environment, resource, and deployment scopes now resolve through read models to candidate
  current deployments and server capacity context. The query returns partial attribution instead of
  guessing totals when ownership evidence is incomplete.
- Full cross-scope attribution totals still need stronger ownership evidence from labels,
  deployment snapshots, runtime identity records, and workspace metadata.
- Retained samples, rollups, charts, background collection, thresholds, alert delivery, quotas, and
  runtime sizing enforcement are deferred until their governing specs and tests are accepted.
