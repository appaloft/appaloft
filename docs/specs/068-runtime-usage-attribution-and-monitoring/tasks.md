# Tasks: Runtime Usage Attribution And Monitoring

## Spec Round

- [x] Add `docs/specs/068-runtime-usage-attribution-and-monitoring/` feature artifacts.
- [x] Position runtime usage attribution in `docs/BUSINESS_OPERATION_MAP.md` as a roadmap/spec
  candidate.
- [x] Add `0.12.0` roadmap visibility without marking the behavior implemented.
- [x] Add objective operator requirement baseline and exclude dashboard-only metrics from the
  `0.12.0` slice.
- [x] Draft ADR for runtime usage attribution boundaries before Code Round.
- [x] Add `docs/testing/runtime-usage-attribution-test-matrix.md` with `RT-USAGE-*` rows.
- [x] Decide accepted operation name for the first slice as `runtime-usage.inspect`; route/CLI
  naming is specified as first-Code-Round guidance in `docs/queries/runtime-usage.inspect.md`.

## Test-First

- [x] RT-USAGE-001: prove the application query/handler boundary for `runtime-usage.inspect` is
  read-only and has no command-bus dependency.
- [x] RT-USAGE-002: prove application DTOs carry ownership evidence and report uncertain artifacts
  as unattributed/unknown.
- [x] RT-USAGE-003: prove application DTOs expose project/environment/resource/deployment rollups as
  query-shaped data.
- [x] RT-USAGE-004: prove application partial/freshness/source-error behavior for unavailable
  sources and unexpected inspector failures.
- [x] RT-USAGE-005: prove application DTOs preserve disk classes, including volume exclusion.
- [x] RT-USAGE-006: prove application DTOs expose current deployment/runtime identity only from
  supplied evidence.
- [x] RT-USAGE-007: add collector/process-attempt tests after sample persistence entered scope.
  Runtime monitoring collection and retry-scheduled process visibility are covered by
  `RT-MON-001` in `packages/application/test/runtime-monitoring-collector.test.ts`,
  `packages/persistence/pg/test/runtime-monitoring-read-model.pglite.test.ts`,
  `packages/application/test/scheduled-history-retention.test.ts`, and
  `apps/shell/test/runtime-monitoring-collector-runner.test.ts`.
- [x] RT-USAGE-008: prove CLI, HTTP/oRPC, and Web dispatch/read through shared query schemas and
  typed DTOs; application
  schema defaults are covered in `packages/application/test/runtime-usage-inspect.test.ts`, CLI
  dispatch is covered in `packages/adapters/cli/test/runtime-usage-command.test.ts`, HTTP/oRPC
  dispatch is covered in `packages/orpc/test/runtime-usage.http.test.ts`, and operation catalog
  exposure is covered in `packages/application/test/operation-catalog-boundary.test.ts`; Web
  readback/i18n coverage is in `apps/web/src/lib/console/runtime-usage.test.ts`.
- [x] RT-USAGE-009: prove threshold evaluation is non-enforcing and does not mutate runtime state.
  The accepted threshold slice is governed by `RT-MON-006` and covered by
  `packages/application/test/runtime-monitoring-thresholds.test.ts`,
  `packages/persistence/pg/test/runtime-monitoring-read-model.pglite.test.ts`,
  `packages/adapters/cli/test/runtime-monitoring-command.test.ts`,
  `packages/orpc/test/runtime-monitoring.http.test.ts`,
  `packages/ai/mcp/test/tool-descriptors.test.ts`, and
  `apps/web/src/lib/console/runtime-usage.test.ts`.
- [x] RT-USAGE-010: preserve existing rejection for unsupported CPU/memory/replicas/runtime sizing
  config fields until sizing ADR/specs are accepted. Coverage remains in deployment config, CLI
  config, deployment create contract, and quick deploy workflow tests; runtime usage does not add
  sizing/enforcement inputs.

## Implementation

- [x] Add application query messages and handlers for the accepted first read-only operation.
- [x] Add runtime usage inspector port and deterministic application test fake.
- [x] Add server-scope local-shell/generic-SSH/Docker capacity-backed adapter translation for safe
  point-in-time usage inspection.
- [x] Add shell dependency registration for the runtime usage inspector adapter.
- [x] Add conservative project/environment/resource/deployment scope resolution through read models
  that returns partial attribution instead of guessing totals without ownership evidence.
- [x] Add Appaloft-managed Docker container label attribution for current container writable bytes,
  deployment/resource context, and current runtime ids.
- [x] Add source workspace metadata attribution and deployment read-model enrichment for
  deployment-id-only artifacts.
- [x] Add retained runtime identity metadata enrichment from deployment read models for
  deployment-id-only artifacts.
- [x] Add CLI and HTTP/oRPC entrypoints through `QueryBus`.
- [x] Add Web compact readback after contracts and i18n keys exist.
- [x] Add sample persistence, collector worker, rollup queries, and short-term server/resource Web
  Monitor readback, plus WebView Observe verification governed by
  `docs/specs/069-runtime-monitoring-observation-boundary/`.
- [x] Add exact-scope threshold policy command/query plus CLI/API/Web/MCP readback and operator
  visibility. Notification hooks and external alert delivery remain outside the active threshold
  slice until governed by a separate ADR/spec; cross-scope inheritance is implemented and governed by
  `docs/specs/069-runtime-monitoring-observation-boundary/`.
- [ ] Add runtime sizing/quota enforcement only after a separate accepted ADR.

## Entrypoints And Docs

- [x] Update `docs/CORE_OPERATIONS.md` and `packages/application/src/operation-catalog.ts` when
  the Code Round adds active query schemas and handlers.
- [x] Add command/query specs for accepted operations.
- [x] Add public docs anchors under diagnostics/observability.
- [x] Add CLI help, HTTP/oRPC descriptions, and SDK metadata from the same operation catalog
  entries.
- [x] Add generated MCP/tool descriptors and handler dispatch for `runtime-usage.inspect` and
  retained runtime monitoring samples, rollups, and thresholds after MCP surfaces entered scope.
- [x] Keep Web usage text localized through `packages/i18n`.

## Verification

- [x] Run focused application, runtime adapter, CLI, oRPC, docs-registry, SDK generator, SDK,
  typecheck, and lint checks for the current Code Round slice.
- [x] Run Web checks when the Web readback slice changes `apps/web`.
- [x] Run `git diff --check`.
- [x] Prove the current `0.12.0` operator questions with automated coverage:
  current attribution and rollups in `packages/application/test/runtime-usage-inspect.test.ts`,
  capacity pressure and disk class evidence in `packages/adapters/runtime/test/runtime-usage-inspector.test.ts`,
  current deployment/runtime context in application enrichment tests, and next diagnostic action
  through warning/source-error readback plus public diagnostics help coverage.
- [x] Add GitHub Actions/local explicit Docker/SSH smoke gates after the read path is proven
  non-mutating. Direct local test invocation remains environment-gated with
  `APPALOFT_RUNTIME_USAGE_DOCKER_SMOKE=1` or `APPALOFT_RUNTIME_USAGE_SSH_SMOKE=1`.

## Post-Implementation Sync

- [x] Reconcile ADR, feature artifacts, business operation map, core operations, operation catalog,
  local command/query specs, runtime target capacity docs, public docs/help, tests, and roadmap
  status for the active read-only query and Appaloft-managed container label attribution slice.
- [x] Record governed follow-ups for unavailable backend metrics, monitoring retention/threshold
  boundaries, and runtime sizing.
