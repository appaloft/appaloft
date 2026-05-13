# Runtime Usage Attribution Test Matrix

## Scope

This matrix governs `0.12.0` runtime usage attribution and monitoring behavior.

The first governed Code Round is the read-only `runtime-usage.inspect` query. Retained samples,
rollups, background collectors, thresholds, alert delivery, quotas, and runtime sizing enforcement
remain deferred until their own rows are activated by accepted specs.

## Governing Sources

- [ADR-062: Runtime Usage Attribution Boundary](../decisions/ADR-062-runtime-usage-attribution-boundary.md)
- [ADR-063: Runtime Monitoring Observation Boundary](../decisions/ADR-063-runtime-monitoring-observation-boundary.md)
- [Runtime Usage Attribution And Monitoring](../specs/068-runtime-usage-attribution-and-monitoring/spec.md)
- [Runtime Monitoring Observation Boundary](../specs/069-runtime-monitoring-observation-boundary/spec.md)
- [runtime-usage.inspect Query Spec](../queries/runtime-usage.inspect.md)
- [Runtime Target Capacity Test Matrix](./runtime-target-capacity-test-matrix.md)
- [Adapter Command/Query Boundary](../architecture/adapter-command-query-boundary.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)
- [Error Model](../errors/model.md)

## Matrix

| ID | Behavior | Level | Automation |
| --- | --- | --- | --- |
| RT-USAGE-001 | `runtime-usage.inspect` is read-only and never dispatches prune, repair, stop/start/restart, deployment, cleanup, sizing, quota, or runtime mutation commands. | Application/query bus | Application query/handler boundary automated in `packages/application/test/runtime-usage-inspect.test.ts`; server-scope capacity-backed adapter delegation automated in `packages/adapters/runtime/test/runtime-usage-inspector.test.ts`. |
| RT-USAGE-002 | Attribution uses Appaloft ownership labels, deployment snapshots, runtime identity records, workspace metadata, and safe read models; uncertain artifacts are reported as unattributed or unknown rather than guessed. | Application/adapter | Application DTO propagation, deployment read-model enrichment, and retained runtime identity metadata enrichment are automated in `packages/application/test/runtime-usage-inspect.test.ts`; Appaloft-managed Docker container label and source workspace metadata capture are automated in `packages/adapters/runtime/test/runtime-target-capacity.test.ts`; adapter ownership evidence translation is automated in `packages/adapters/runtime/test/runtime-usage-inspector.test.ts`. |
| RT-USAGE-003 | Server, project, environment, resource, and deployment rollups aggregate query-shaped observations/read models without loading aggregates for business predicates or mutating write-side state. | Application/read model | Application query-shaped output, conservative missing-evidence resolution, and attributed resource-scope rollup assembly from Appaloft ownership evidence are automated in `packages/application/test/runtime-usage-inspect.test.ts`; project/environment/deployment scope resolution uses the same read-model path. |
| RT-USAGE-004 | Unsupported provider, Docker unavailable, target timeout, and missing metric sources return bounded partial/freshness/source-error sections instead of treating missing metrics as zero or exposing raw runtime output. | Application/adapter/error contract | Application partial/source-error semantics automated in `packages/application/test/runtime-usage-inspect.test.ts`; unsupported capacity adapter translation plus Docker unavailable and timeout warning translation are automated in `packages/adapters/runtime/test/runtime-usage-inspector.test.ts`. |
| RT-USAGE-005 | Disk attribution separates active runtime artifacts, rollback candidates, source workspaces, Docker images/cache, Appaloft state roots, volumes, and unknown storage; volumes are not marked safely reclaimable. | Adapter/application | Application output contract automated in `packages/application/test/runtime-usage-inspect.test.ts`; server-scope capacity-to-usage disk-class translation, source workspace metadata, rollback-candidate markers, and volume exclusion are automated in `packages/adapters/runtime/test/runtime-usage-inspector.test.ts`. |
| RT-USAGE-006 | Current deployment/runtime identity is visible only when evidence exists and does not imply historical time-series correlation. | Application/read model | Application DTO behavior, current deployment id resolution, and retained runtime identity metadata enrichment from deployment read models are automated in `packages/application/test/runtime-usage-inspect.test.ts`; Appaloft-managed container labels can provide current runtime id and deployment id in `packages/adapters/runtime/test/runtime-usage-inspector.test.ts`. |
| RT-USAGE-007 | Retained sample collection is opt-in, bounded, and records process visibility only after sample persistence enters scope; first `runtime-usage.inspect` Code Round must not write samples. | Future collector/persistence | Deferred until Slice 2; no automated test required for Slice 1 beyond RT-USAGE-001 no-write coverage. |
| RT-USAGE-008 | CLI and HTTP/oRPC dispatch `runtime-usage.inspect` through shared query schemas and `QueryBus`; Web consumes typed DTOs and i18n keys only after the query contract exists. | Entrypoint/API/CLI/Web | Shared application query schema defaults automated in `packages/application/test/runtime-usage-inspect.test.ts`; operation catalog exposure automated in `packages/application/test/operation-catalog-boundary.test.ts`; CLI dispatch automated in `packages/adapters/cli/test/runtime-usage-command.test.ts`; HTTP/oRPC dispatch automated in `packages/orpc/test/runtime-usage.http.test.ts`; Web readback and i18n use automated in `apps/web/src/lib/console/runtime-usage.test.ts`. |
| RT-USAGE-009 | Usage thresholds are non-enforcing when later accepted and never throttle, stop, prune, redeploy, reject deployments, or mutate runtime targets without a separate governed command. | Future policy/application | Deferred until Slice 3. |
| RT-USAGE-010 | Repository config, CLI, HTTP/oRPC, and Web continue rejecting unsupported CPU, memory, replicas, restart policy, rollout sizing, quota, and runtime enforcement fields until a separate runtime sizing ADR/spec is accepted. | Config/application/entrypoint | Existing rejection coverage remains in `packages/deployment-config/test/appaloft-config.test.ts`, `packages/adapters/cli/test/deployment-config.test.ts`, `packages/contracts/test/deployment-create-contract.test.ts`, and `packages/contracts/test/quick-deploy-workflow.test.ts`; add explicit runtime usage regression when sizing work is proposed. |

## Runtime Monitoring Follow-Up Matrix

These rows govern the post-`0.12.0` runtime monitoring observation slices. They are not implemented
by the first `runtime-usage.inspect` Code Round.

| ID | Behavior | Level | Automation |
| --- | --- | --- | --- |
| RT-MON-001 | Runtime monitoring collection stores only bounded sanitized samples with cadence, retention, freshness, partial state, warnings, source errors, and safe Appaloft labels. It never stores raw shell output, secrets, private paths, unbounded provider payloads, or runtime logs as samples. | Collector/persistence | Future Test-First Round before sample store implementation. |
| RT-MON-002 | `runtime-monitoring.rollup` returns bounded time-window series and totals for server, project, environment, resource, and deployment scopes without mutating runtime targets or loading aggregates for business predicates. | Application/read model | Future Test-First Round before rollup query implementation. |
| RT-MON-003 | `runtime-monitoring.samples.list` returns a bounded sanitized sample window for diagnostics and charts, with missing metric sources represented as partial/source-error state rather than zero usage. | Application/API | Future Test-First Round before sample query implementation. |
| RT-MON-004 | Web chart deployment markers are derived from deployment events/read models and represent time correlation only; they do not claim causal analysis. | Web/API/read model | Future Web and query contract tests before Observe chart implementation. |
| RT-MON-005 | Runtime logs, deployment logs, deployment events, health, access, and diagnostics remain separate governed query surfaces. The Observe UI may link and filter them by time window and stable ids, but must not duplicate log retention into monitoring samples. | Web/application | Future Web and application tests before Observe UI implementation. |
| RT-MON-006 | Runtime monitoring thresholds are non-enforcing warning/critical policy. Crossed thresholds create readback/operator visibility only and never prune, stop, restart, redeploy, reject, throttle, resize, scale, bill, or mutate runtime targets. | Application/command/query | Future command/query tests before threshold policy implementation. |
| RT-MON-007 | Server Observe surface shows server-level CPU, memory, disk, inode, Docker/cache, source workspace, runtime root, warnings, and resource/deployment rollups from typed DTOs and i18n keys. | Web | Short-term Monitor tab and browser-local CPU/memory/disk sparkline derivation are covered in `apps/web/src/lib/console/runtime-usage.test.ts`; full server Observe e2e remains future. |
| RT-MON-008 | Resource Observe surface shows resource-level charts, current health/access/proxy state, latest deployment markers, runtime logs, deployment logs, and diagnostics links from typed DTOs and i18n keys. | Web | Short-term Monitor tab and logs/events/diagnostics links are covered in `apps/web/src/lib/console/runtime-usage.test.ts`; full resource Observe e2e remains future. |
| RT-MON-009 | Project and environment monitoring stays rollup-only with top contributors and deep links to resource/server detail; those scopes do not become owners of runtime state or resource-level diagnosis. | Web/application | Future query/Web tests before project/environment monitoring release. |
| RT-MON-010 | Prometheus-compatible storage/querying, custom metric ingestion, APM/tracing, dashboard builders, alert routing, billing analytics, quota, autoscaling, cleanup, and enforcement remain out of Appaloft runtime monitoring scope. | Contract/docs/review | Future contract/docs guard when external observability handoff is specified. |

## Current Gaps

- The first application query boundary tests for `runtime-usage.inspect` exist in
  `packages/application/test/runtime-usage-inspect.test.ts`.
- Runtime adapter translation and shell dependency registration exist for server-scope capacity
  inspection. Operation catalog, CLI, HTTP/oRPC, public docs, and SDK metadata exist for the
  read-only query. Application query service now resolves project/environment/resource/deployment
  scopes through read models and returns partial attribution when ownership evidence is incomplete.
  Web server/resource detail readback exists over typed oRPC DTOs. Appaloft-managed Docker
  container labels and source workspace metadata now produce current artifact and scope rollups when
  evidence is present, with deployment read models and retained runtime identity metadata enriching
  deployment-id-only artifacts. Future MCP/tool tests remain pending.
- RT-USAGE-007, RT-USAGE-009, and RT-USAGE-010 are guardrails for later slices. They must not be
  used to claim sample retention, thresholds, quota, or runtime sizing implementation is complete.
- RT-MON-007 and RT-MON-008 now have short-term Web monitor coverage over the existing
  `runtime-usage.inspect` query. Retained samples, backend rollups, threshold policy, and full
  Observe e2e coverage still require local query/command specs and Test-First bindings before their
  Code Rounds.
- Real Docker and SSH usage smoke tests are opt-in because they touch local or remote runtime
  targets. The opt-in gates live in `packages/adapters/runtime/test/runtime-usage-smoke.test.ts`
  and run only with `APPALOFT_RUNTIME_USAGE_DOCKER_SMOKE=1` or
  `APPALOFT_RUNTIME_USAGE_SSH_SMOKE=1`.
