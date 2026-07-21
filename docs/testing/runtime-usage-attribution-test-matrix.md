# Runtime Usage Attribution Test Matrix

## Scope

This matrix governs `0.12.0` runtime usage attribution behavior.

The first governed Code Round is the read-only `runtime-usage.inspect` query. Follow-up retained
samples, rollups, Observe surfaces, and exact-scope non-enforcing thresholds are governed by the
dedicated [Runtime Monitoring Observation Test Matrix](./runtime-monitoring-observation-test-matrix.md).

## Governing Sources

- [ADR-062: Runtime Usage Attribution Boundary](../decisions/ADR-062-runtime-usage-attribution-boundary.md)
- [Runtime Usage Attribution And Monitoring](../specs/068-runtime-usage-attribution-and-monitoring/spec.md)
- [runtime-usage.inspect Query Spec](../queries/runtime-usage.inspect.md)
- [Runtime Monitoring Observation Test Matrix](./runtime-monitoring-observation-test-matrix.md)
- [Runtime Target Capacity Test Matrix](./runtime-target-capacity-test-matrix.md)
- [Adapter Command/Query Boundary](../architecture/adapter-command-query-boundary.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)
- [Error Model](../errors/model.md)

## Matrix

| ID | Behavior | Level | Automation |
| --- | --- | --- | --- |
| RT-USAGE-001 | `runtime-usage.inspect` is read-only and never dispatches prune, repair, stop/start/restart, deployment, cleanup, sizing, quota, or runtime mutation commands. | Application/query bus | Application query/handler boundary automated in `packages/application/test/runtime-usage-inspect.test.ts`; server-scope capacity-backed adapter delegation automated in `packages/adapters/runtime/test/runtime-usage-inspector.test.ts`. |
| RT-USAGE-002 | Attribution uses Appaloft ownership labels, deployment snapshots, runtime identity records, workspace metadata, and safe read models; uncertain artifacts are reported as unattributed or unknown rather than guessed. Compose target-only network overrides omit the network node entirely for non-target services and init jobs. | Application/adapter | Application DTO propagation, deployment read-model enrichment, and retained runtime identity metadata enrichment are automated in `packages/application/test/runtime-usage-inspect.test.ts`; Appaloft-managed Docker container label and source workspace metadata capture are automated in `packages/adapters/runtime/test/runtime-target-capacity.test.ts`; Compose ownership-label override generation, including multi-service target-only network validity, is automated in `packages/adapters/runtime/test/compose-label-overrides.test.ts`; adapter ownership evidence translation is automated in `packages/adapters/runtime/test/runtime-usage-inspector.test.ts`. |
| RT-USAGE-003 | Server, project, environment, resource, and deployment rollups aggregate query-shaped observations/read models without loading aggregates for business predicates or mutating write-side state. | Application/read model | Application query-shaped output, conservative missing-evidence resolution, and attributed resource-scope rollup assembly from Appaloft ownership evidence are automated in `packages/application/test/runtime-usage-inspect.test.ts`; project/environment/deployment scope resolution uses the same read-model path. |
| RT-USAGE-004 | Unsupported provider, Docker unavailable, target timeout, and missing metric sources return bounded partial/freshness/source-error sections instead of treating missing metrics as zero or exposing raw runtime output. | Application/adapter/error contract | Application partial/source-error semantics automated in `packages/application/test/runtime-usage-inspect.test.ts`; unsupported capacity adapter translation plus Docker unavailable and timeout warning translation are automated in `packages/adapters/runtime/test/runtime-usage-inspector.test.ts`. |
| RT-USAGE-005 | Disk attribution separates active runtime artifacts, rollback candidates, source workspaces, Docker images/cache, Appaloft state roots, volumes, and unknown storage; volumes are not marked safely reclaimable. | Adapter/application | Application output contract automated in `packages/application/test/runtime-usage-inspect.test.ts`; server-scope capacity-to-usage disk-class translation, source workspace metadata, rollback-candidate markers, and volume exclusion are automated in `packages/adapters/runtime/test/runtime-usage-inspector.test.ts`. |
| RT-USAGE-006 | Current deployment/runtime identity is visible only when evidence exists and does not imply historical time-series correlation. | Application/read model | Application DTO behavior, current deployment id resolution, and retained runtime identity metadata enrichment from deployment read models are automated in `packages/application/test/runtime-usage-inspect.test.ts`; Appaloft-managed container labels can provide current runtime id and deployment id in `packages/adapters/runtime/test/runtime-usage-inspector.test.ts`. |
| RT-USAGE-007 | Retained sample collection is disabled by default, explicitly enabled, bounded, and records process visibility after sample persistence enters scope; `runtime-usage.inspect` itself remains read-only and never writes samples. | Collector/persistence | Implemented through the `RT-MON-001` monitoring slice. Internal collector orchestration through the `runtime-usage.inspect` query boundary and retry-scheduled process visibility are automated in `packages/application/test/runtime-monitoring-collector.test.ts`; PG/PGlite sample schema, write-store readback, read-model filtering, safe label readback, dry-run pruning, scope-bounded pruning, and cutoff boundary behavior are automated in `packages/persistence/pg/test/runtime-monitoring-read-model.pglite.test.ts`; scheduled history retention dispatch to the runtime monitoring sample prune store is automated in `packages/application/test/scheduled-history-retention.test.ts`; disabled-by-default background collector runner selection and safe failure logging are automated in `apps/shell/test/runtime-monitoring-collector-runner.test.ts`. |
| RT-USAGE-008 | CLI, HTTP/oRPC, and MCP dispatch `runtime-usage.inspect` through shared query schemas and `QueryBus`; Web consumes typed DTOs and i18n keys only after the query contract exists. | Entrypoint/API/CLI/Web/MCP | Shared application query schema defaults automated in `packages/application/test/runtime-usage-inspect.test.ts`; operation catalog exposure automated in `packages/application/test/operation-catalog-boundary.test.ts`; CLI dispatch automated in `packages/adapters/cli/test/runtime-usage-command.test.ts`; HTTP/oRPC dispatch automated in `packages/orpc/test/runtime-usage.http.test.ts`; Web readback and i18n use automated in `apps/web/src/lib/console/runtime-usage.test.ts`; generated MCP descriptor and read-only handler/server dispatch are automated in `packages/ai/mcp/test/tool-descriptors.test.ts`. |
| RT-USAGE-009 | Usage thresholds are non-enforcing warning/critical policy and never throttle, stop, prune, redeploy, reject deployments, scale, bill, or mutate runtime targets without a separate governed command. | Policy/application/Web | Implemented through the `RT-MON-006` monitoring slice. Application configure/show command-query coverage, validation, disabled-policy behavior, latest-sample evaluation, and no-runtime-mutation boundary are automated in `packages/application/test/runtime-monitoring-thresholds.test.ts`; PG/PGlite exact-scope policy upsert/readback is automated in `packages/persistence/pg/test/runtime-monitoring-read-model.pglite.test.ts`; CLI dispatch is automated in `packages/adapters/cli/test/runtime-monitoring-command.test.ts`; HTTP/oRPC dispatch is automated in `packages/orpc/test/runtime-monitoring.http.test.ts`; generated MCP descriptor/handler dispatch is automated in `packages/ai/mcp/test/tool-descriptors.test.ts`; server/resource Web Monitor threshold readback and exact-scope CPU/memory/disk threshold editing with preservation of other advanced rules are covered in `apps/web/src/lib/console/runtime-usage.test.ts`. |
| RT-USAGE-010 | Repository config, CLI, HTTP/oRPC, and Web continue rejecting unsupported CPU, memory, replicas, restart policy, rollout sizing, quota, and runtime enforcement fields until a separate runtime sizing ADR/spec is accepted. | Config/application/entrypoint | Existing rejection coverage remains in `packages/deployment-config/test/appaloft-config.test.ts`, `packages/adapters/cli/test/deployment-config.test.ts`, `packages/contracts/test/deployment-create-contract.test.ts`, and `packages/contracts/test/quick-deploy-workflow.test.ts`; add explicit runtime usage regression when sizing work is proposed. |

## Runtime Monitoring Follow-Up Matrix

`RT-MON-*` rows moved to the dedicated
[Runtime Monitoring Observation Test Matrix](./runtime-monitoring-observation-test-matrix.md).
`RT-USAGE-007` and `RT-USAGE-009` depend on that monitoring matrix for retained sample collection
and non-enforcing threshold policy coverage.

## Current Implementation Notes And Governed Follow-Ups

- The first application query boundary tests for `runtime-usage.inspect` exist in
  `packages/application/test/runtime-usage-inspect.test.ts`.
- Runtime adapter translation and shell dependency registration exist for server-scope capacity
  inspection. Operation catalog, CLI, HTTP/oRPC, public docs, and SDK metadata exist for the
  read-only query. Application query service now resolves project/environment/resource/deployment
  scopes through read models and returns partial attribution when ownership evidence is incomplete.
  Web server/resource detail readback exists over typed oRPC DTOs. Appaloft-managed Docker
  container labels, Compose ownership-label overrides, and source workspace metadata now produce
  current artifact and scope rollups when evidence is present, with deployment read models and
  retained runtime identity metadata enriching deployment-id-only artifacts. Generated MCP/tool
  descriptors, runtime-usage inspect handler/server dispatch, and runtime-monitoring handler/server
  dispatch are covered in `packages/ai/mcp/test/tool-descriptors.test.ts`.
- RT-USAGE-007 and RT-USAGE-009 now have implementation and automation through the governed
  `RT-MON-001` and `RT-MON-006` monitoring slices. They must not be used to claim alerting,
  notification delivery, quota, runtime sizing, threshold inheritance, or enforcement is complete.
- RT-USAGE-010 remains the sizing/enforcement guardrail. Unsupported CPU, memory, replicas,
  restart policy, rollout sizing, quota, and runtime enforcement fields stay rejected until a
  separate runtime sizing ADR/spec is accepted.
- Runtime monitoring retained sample, rollup, Observe-surface, threshold, and external
  observability handoff follow-ups are tracked in the dedicated
  [Runtime Monitoring Observation Test Matrix](./runtime-monitoring-observation-test-matrix.md).
- Real Docker and SSH usage smoke coverage is a GitHub Actions gate with local explicit
  reproduction scripts because it touches local or remote runtime targets. The local explicit gates
  live in `packages/adapters/runtime/test/runtime-usage-smoke.test.ts` and are exposed through
  `bun run smoke:runtime-usage:docker`, `bun run smoke:runtime-usage:ssh`, and
  `bun run smoke:runtime-usage`. The SSH script runs the shared `smoke:ssh:preflight` gate before
  enabling `APPALOFT_RUNTIME_USAGE_SSH_SMOKE=1`; direct local test invocation still requires
  `APPALOFT_RUNTIME_USAGE_DOCKER_SMOKE=1` or `APPALOFT_RUNTIME_USAGE_SSH_SMOKE=1`.
  `.github/workflows/runtime-usage-e2e.yml` runs the same read-only probes from nightly and release;
  release dispatch can set `require_runtime_usage_e2e=true` to fail closed when SSH runtime-usage
  evidence is required but target secrets are absent.
