# Plan: Runtime Monitoring Observation Boundary

## Governing Sources

- Domain model: [Domain Model](../../DOMAIN_MODEL.md)
- Decisions/ADRs: [ADR-063](../../decisions/ADR-063-runtime-monitoring-observation-boundary.md),
  [ADR-062](../../decisions/ADR-062-runtime-usage-attribution-boundary.md),
  [ADR-018](../../decisions/ADR-018-resource-runtime-log-observation.md),
  [ADR-020](../../decisions/ADR-020-resource-health-observation.md),
  [ADR-023](../../decisions/ADR-023-runtime-orchestration-target-boundary.md),
  [ADR-047](../../decisions/ADR-047-runtime-artifact-workspace-prune-boundary.md),
  [ADR-050](../../decisions/ADR-050-docker-cache-and-image-prune-boundary.md),
  [ADR-053](../../decisions/ADR-053-resource-runtime-log-archive-retention-boundary.md)
- Existing query spec: [runtime-usage.inspect](../../queries/runtime-usage.inspect.md)
- Existing test matrix:
  [Runtime Usage Attribution Test Matrix](../../testing/runtime-usage-attribution-test-matrix.md)
- Operation map: [Business Operation Map](../../BUSINESS_OPERATION_MAP.md)
- Operation catalog: `packages/application/src/operation-catalog.ts`

## Architecture Approach

- Domain/application placement: keep runtime monitoring as query-side observation and policy
  configuration. Do not add monitoring behavior to aggregates.
- Repository/specification/visitor impact: retained sample and threshold persistence belongs in
  `packages/persistence/pg`; query services use read-model ports, not aggregate repositories.
- Event/CQRS/read-model impact: sample collection writes read-side observation records; threshold
  configuration is a command; sample/rollup/threshold readback are queries. Deployment events are
  joined as markers, not copied into metric samples.
- Entrypoint impact: CLI, HTTP/oRPC, Web, SDK metadata, and future MCP/tool descriptors must be
  generated or wired from shared command/query schemas.
- Persistence/migration impact: add bounded sample tables, optional rollup tables, threshold policy
  records, and retention pruning only after the next Test-First Round accepts exact shapes.

## Slice Plan

### Slice 2A: Sample Store And Collector

- Define `runtime-monitoring.samples.list` query spec.
- Define retained sample record shape with schema version, scope evidence, observedAt, generatedAt,
  totals, partial state, warnings, source errors, and sanitized labels.
- Add collector scheduling and failure visibility. The collector must use runtime target adapter
  read ports and must not dispatch prune, repair, deployment, stop/start/restart, or sizing work.
- Add retention policy for samples before enabling background writes.

### Slice 2B: Rollups And Charts

- Define `runtime-monitoring.rollup` query spec.
- Add server/resource Web Observe surfaces with CPU, memory, disk, inode, Docker/cache, and optional
  network charts.
- Add deployment markers from deployment events/read models.
- Link chart windows to runtime logs, deployment logs, diagnostics, capacity inspect, and safe prune
  dry-run.

### Slice 2C: Non-Enforcing Thresholds

- Define `runtime-monitoring-thresholds.configure` and `runtime-monitoring-thresholds.show` specs.
- Persist warning/critical threshold policy with explicit scope and inheritance rules.
- Evaluate latest threshold state from samples or rollups.
- Surface threshold state in Web/API/CLI without enforcing runtime behavior.

### Slice 2D: Public Docs And Tooling

- Add task-oriented public docs for observing resources and servers.
- Add stable help anchors for monitoring charts, threshold state, and external observability
  handoff.
- Add generated SDK metadata and future MCP/tool descriptors from operation catalog entries.

## Roadmap And Compatibility

- Roadmap target: post-`0.12.0`; candidate for `1.0.0-rc` readiness if maintainers pull it into
  the GA observation loop.
- Version target: not selected in this Spec Round.
- Compatibility impact: additive pre-1.0 query/command surfaces; no runtime enforcement or config
  acceptance.
- Release note requirement: yes when implemented, because Web/API/CLI observation behavior changes.

## Testing Strategy

- Matrix ids: add `RT-MON-*` rows to the runtime usage attribution matrix until a dedicated runtime
  monitoring matrix is created.
- Test-first rows:
  - `RT-MON-001`: sample retention and no raw output.
  - `RT-MON-002`: rollup query is read-only.
  - `RT-MON-004`: deployment markers are correlation, not causality.
  - `RT-MON-006`: thresholds never enforce runtime behavior.
  - `RT-MON-010`: Prometheus-class features remain out of scope.
- Acceptance/e2e: Web Observe surface should prove server/resource charts, logs/events links,
  threshold state, and i18n copy.
- Contract/integration/unit: operation catalog, CLI dispatch, HTTP/oRPC dispatch, persistence
  migrations, collector behavior, retention pruning, and runtime adapter translation.

## Risks And Migration Gaps

- Sample retention can grow unexpectedly if cadence or labels are too broad. Keep default cadence
  and label cardinality conservative.
- Local/PGlite installs need a smaller retention profile than hosted PostgreSQL.
- Thresholds may be mistaken for enforcement. UI/API copy must say warning/critical state only.
- Chart/deployment marker correlation can be mistaken for causality. Public copy and DTO names must
  avoid claiming causal analysis.
- Logs are already separate query surfaces. Web should link and filter them, not create a second
  log retention path.
- External observability handoff is not implemented; document it when the public docs round begins.
