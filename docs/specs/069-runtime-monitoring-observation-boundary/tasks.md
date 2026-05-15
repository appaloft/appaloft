# Tasks: Runtime Monitoring Observation Boundary

## Source Of Truth

- [x] Add ADR-063 for runtime monitoring observation boundaries.
- [x] Add feature `spec.md` with long-term product boundary and scenarios.
- [x] Add feature `plan.md` with slice sequencing.
- [x] Add feature `tasks.md` with Code Round prerequisites.
- [x] Sync ADR index, Business Operation Map, Core Operations, Product Roadmap, and runtime usage
  test matrix with the accepted monitoring boundary.
- [x] Add local query specs for `runtime-monitoring.samples.list` and `runtime-monitoring.rollup`.
- [x] Add local command/query specs for `runtime-monitoring.thresholds.configure` and
  `runtime-monitoring.thresholds.show`.
- [x] Add or split a dedicated runtime monitoring test matrix if `RT-MON-*` rows outgrow the
  runtime usage attribution matrix.
- [x] Add public docs anchors during Docs Round after implementation scope is selected.

## Test-First

- [x] RT-MON-001: add sample retention tests for bounded sanitized records.
- [x] RT-MON-002: add rollup query read-only tests.
- [x] RT-MON-003: add sample query bounded-window and partial-state tests.
- [x] RT-MON-004: add deployment marker correlation tests.
- [x] RT-MON-005: add Web/API linkage tests for logs/events without log duplication.
- [x] RT-MON-006: add threshold non-enforcement tests.
- [x] RT-MON-007: add server Monitor retained-sample and threshold-state readback coverage.
- [x] RT-MON-008: add resource Monitor retained-sample and threshold-state readback coverage.
- [x] RT-MON-009: add project/environment shallow rollup tests.
- [x] RT-MON-010: add contract rejection/docs guard for Prometheus/APM/custom metric scope creep.

## Implementation

- [x] Add retained sample schema and migrations under `packages/persistence/pg`.
- [x] Add PG/PGlite retained sample retention prune store.
- [x] Add application ports and query services for sample list and rollup reads.
- [x] Add collector orchestration with durable process/failure visibility.
- [x] Add disabled-by-default background collector runner for active server targets.
- [x] Add background collector runner target selection for runtime-owning resources, projects, and
  environments.
- [x] Add background collector runner target selection for current runtime-owning deployments.
- [x] Add scheduled retention worker orchestration for retained runtime monitoring samples.
- [x] Add operation catalog entries and shared schemas for monitoring queries.
- [x] Add CLI and HTTP/oRPC entrypoints dispatching through buses.
- [x] Add server and resource Web Monitor retained-sample and threshold-state readback with
  logs/events/diagnostics links and i18n keys.
- [x] Add server and resource Web Monitor latest deployment marker and top-contributor readback
  from `runtime-monitoring.rollup`.
- [x] Add server and resource Web Monitor exact-scope CPU/memory/disk threshold configuration while
  preserving other advanced policy rules.
- [x] Add sample-evidence-based threshold policy inheritance with exact-scope override precedence.
- [x] Add server and resource Web Monitor sparklines, rollup summaries, deployment markers, top
  contributors, logs/events/diagnostics links, retained sample readback, and exact-scope
  CPU/memory/disk threshold configuration.
- [x] Add MCP-facing runtime monitoring tool server registration for generated descriptors and
  shared command/query handler dispatch.
- [x] Add full Observe visual/browser verification for server/resource Monitor surfaces and
  project/environment Web rollup-only surfaces.
- [x] Add cross-surface time-window filtering for Monitor handoffs to runtime logs, deployment
  lists, deployment logs, and resource diagnostics.
- [x] Add short-term server/resource Monitor tabs with browser-local CPU, memory, and disk
  sparklines over `runtime-usage.inspect` polling, plus logs/events/diagnostics links where the
  page has those surfaces.
- [x] Add threshold policy persistence and readback after threshold specs are accepted.
- [x] Add generated SDK metadata after operation catalog entries.
- [x] Add MCP/tool descriptors after operation catalog entries.
- [x] Add MCP server handlers after command/query execution over tools is implemented.

## Verification

- [x] Run targeted application tests for runtime monitoring query services.
- [x] Run targeted persistence migration/repository tests.
- [x] Run targeted CLI and HTTP/oRPC tests.
- [x] Run targeted SDK metadata tests.
- [x] Run targeted MCP/tool descriptor tests.
- [x] Run targeted scheduled history retention worker tests for runtime monitoring sample pruning.
- [x] Run targeted Web source/unit tests for current server/resource Monitor surfaces.
- [x] Run visual/browser verification for full Observe surfaces after the full Observe UI slice is
  pulled forward.
- [x] Run `bun run lint` or narrower package checks before release readiness.

## Post-Implementation Sync

- [x] Reconcile ADR-063, spec, plan, tasks, operation map, core operations, query specs, test
  matrix, public docs, code, and governed follow-ups.
- [x] Confirm `runtime-usage.inspect` remains point-in-time attribution and monitoring does not
  gain cleanup, enforcement, quota, APM, dashboard-builder, or Prometheus responsibilities.
