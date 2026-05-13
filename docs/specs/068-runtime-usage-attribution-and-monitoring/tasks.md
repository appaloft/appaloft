# Tasks: Runtime Usage Attribution And Monitoring

## Spec Round

- [x] Add `docs/specs/068-runtime-usage-attribution-and-monitoring/` feature artifacts.
- [x] Position runtime usage attribution in `docs/BUSINESS_OPERATION_MAP.md` as a roadmap/spec
  candidate.
- [x] Add `0.12.0` roadmap visibility without marking the behavior implemented.
- [x] Add objective operator requirement baseline and exclude dashboard-only metrics from the
  `0.12.0` slice.
- [ ] Draft ADR for runtime usage attribution boundaries before Code Round.
- [ ] Add `docs/testing/runtime-usage-attribution-test-matrix.md` with `RT-USAGE-*` rows.
- [ ] Decide accepted operation names and route/CLI naming for `runtime-usage.inspect` and later
  rollup/sample queries.

## Test-First

- [ ] RT-USAGE-001: prove `runtime-usage.inspect` is read-only and never dispatches prune, repair,
  stop/start/restart, deployment, or runtime mutation commands.
- [ ] RT-USAGE-002: prove attribution uses Appaloft ownership labels/snapshots and reports uncertain
  artifacts as unattributed.
- [ ] RT-USAGE-003: prove project/environment/resource/deployment rollups aggregate query-shaped
  data without aggregate mutation.
- [ ] RT-USAGE-004: prove partial/freshness/warning behavior for unsupported provider, Docker
  unavailable, timeout, and missing metric sources.
- [ ] RT-USAGE-005: prove disk classes separate active runtime, rollback candidate, source
  workspace, Docker image/cache, Appaloft state roots, volumes, and unknown storage.
- [ ] RT-USAGE-006: prove current deployment/runtime identity is visible when ownership evidence
  exists without implying historical time-series correlation.
- [ ] RT-USAGE-007: add collector/process-attempt tests only after sample persistence is in scope.
- [ ] RT-USAGE-008: prove CLI and HTTP/oRPC dispatch through shared query schemas.
- [ ] RT-USAGE-009: prove threshold evaluation is non-enforcing and does not mutate runtime state.
- [ ] RT-USAGE-010: preserve existing rejection for unsupported CPU/memory/replicas/runtime sizing
  config fields until sizing ADR/specs are accepted.

## Implementation

- [ ] Add application query messages and handlers for the accepted first read-only operation.
- [ ] Add runtime usage inspector port and fake/in-memory adapter for deterministic tests.
- [ ] Add local-shell/generic-SSH/Docker adapter support for safe point-in-time usage inspection.
- [ ] Add attribution translator for container labels, runtime snapshots, workspace metadata, and
  deployment/resource context.
- [ ] Add CLI and HTTP/oRPC entrypoints through `QueryBus`.
- [ ] Add Web compact readback after contracts and i18n keys exist.
- [ ] Add sample persistence, collector worker, rollup queries, and charts only in Slice 2.
- [ ] Add threshold policy command/query, operator visibility, and notification hooks only in Slice
  3.
- [ ] Add runtime sizing/quota enforcement only after a separate accepted ADR.

## Entrypoints And Docs

- [ ] Update `docs/CORE_OPERATIONS.md` and `packages/application/src/operation-catalog.ts` when
  operation names are accepted.
- [ ] Add command/query specs for accepted operations.
- [ ] Add public docs anchors under diagnostics/observability.
- [ ] Add CLI help, HTTP/oRPC descriptions, SDK metadata, and future MCP/tool descriptors from the
  same operation catalog entries.
- [ ] Keep Web usage text localized through `packages/i18n`.

## Verification

- [ ] Run focused application, runtime adapter, CLI, oRPC, Web, docs-registry, typecheck, and lint
  checks for any Code Round slice.
- [ ] Run `git diff --check`.
- [ ] Add opt-in Docker/SSH smoke only after the read path is proven non-mutating.

## Post-Implementation Sync

- [ ] Reconcile ADR, feature artifacts, business operation map, core operations, operation catalog,
  local command/query specs, runtime target capacity docs, public docs/help, tests, and roadmap
  status.
- [ ] Record remaining migration gaps for unavailable backend metrics, sample retention, thresholds,
  and runtime sizing.
