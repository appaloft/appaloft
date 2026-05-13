# Runtime Usage Attribution Test Matrix

## Scope

This matrix governs `0.12.0` runtime usage attribution and monitoring behavior.

The first governed Code Round is the read-only `runtime-usage.inspect` query. Retained samples,
rollups, background collectors, thresholds, alert delivery, quotas, and runtime sizing enforcement
remain deferred until their own rows are activated by accepted specs.

## Governing Sources

- [ADR-062: Runtime Usage Attribution Boundary](../decisions/ADR-062-runtime-usage-attribution-boundary.md)
- [Runtime Usage Attribution And Monitoring](../specs/068-runtime-usage-attribution-and-monitoring/spec.md)
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
- Real Docker and SSH usage smoke tests are opt-in because they touch local or remote runtime
  targets. The opt-in gates live in `packages/adapters/runtime/test/runtime-usage-smoke.test.ts`
  and run only with `APPALOFT_RUNTIME_USAGE_DOCKER_SMOKE=1` or
  `APPALOFT_RUNTIME_USAGE_SSH_SMOKE=1`.
