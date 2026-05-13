# Tasks: Runtime Monitoring Observation Boundary

## Source Of Truth

- [x] Add ADR-063 for runtime monitoring observation boundaries.
- [x] Add feature `spec.md` with long-term product boundary and scenarios.
- [x] Add feature `plan.md` with slice sequencing.
- [x] Add feature `tasks.md` with Code Round prerequisites.
- [x] Sync ADR index, Business Operation Map, Core Operations, Product Roadmap, and runtime usage
  test matrix with the accepted monitoring boundary.
- [ ] Add local query specs for `runtime-monitoring.samples.list` and `runtime-monitoring.rollup`.
- [ ] Add local command/query specs for `runtime-monitoring-thresholds.configure` and
  `runtime-monitoring-thresholds.show`.
- [ ] Add or split a dedicated runtime monitoring test matrix if `RT-MON-*` rows outgrow the
  runtime usage attribution matrix.
- [ ] Add public docs anchors during Docs Round after implementation scope is selected.

## Test-First

- [ ] RT-MON-001: add sample retention tests for bounded sanitized records.
- [ ] RT-MON-002: add rollup query read-only tests.
- [ ] RT-MON-003: add raw sample query bounded-window tests.
- [ ] RT-MON-004: add deployment marker correlation tests.
- [ ] RT-MON-005: add Web/API linkage tests for logs/events without log duplication.
- [ ] RT-MON-006: add threshold non-enforcement tests.
- [ ] RT-MON-007: add server Observe surface e2e-preferred coverage.
- [ ] RT-MON-008: add resource Observe surface e2e-preferred coverage.
- [ ] RT-MON-009: add project/environment shallow rollup tests.
- [ ] RT-MON-010: add contract rejection/docs guard for Prometheus/APM/custom metric scope creep.

## Implementation

- [ ] Add retained sample schema and migrations under `packages/persistence/pg`.
- [ ] Add application ports and query services for sample list and rollup reads.
- [ ] Add collector orchestration with durable process/failure visibility.
- [ ] Add operation catalog entries and shared schemas for monitoring queries.
- [ ] Add CLI and HTTP/oRPC entrypoints dispatching through buses.
- [ ] Add server and resource Web Observe surfaces with charts, markers, logs/events links, and
  i18n keys.
- [x] Add short-term server/resource Monitor tabs with browser-local CPU, memory, and disk
  sparklines over `runtime-usage.inspect` polling, plus logs/events/diagnostics links where the
  page has those surfaces.
- [ ] Add threshold policy persistence and readback after threshold specs are accepted.
- [ ] Add generated SDK metadata and future MCP/tool descriptors after operation catalog entries.

## Verification

- [ ] Run targeted application tests for runtime monitoring query services.
- [ ] Run targeted persistence migration/repository tests.
- [ ] Run targeted CLI and HTTP/oRPC tests.
- [ ] Run targeted Web tests and visual/browser verification for Observe surfaces.
- [ ] Run `bun run lint` or narrower package checks before release readiness.

## Post-Implementation Sync

- [ ] Reconcile ADR-063, spec, plan, tasks, operation map, core operations, query specs, test
  matrix, public docs, code, and migration gaps.
- [ ] Confirm `runtime-usage.inspect` remains point-in-time attribution and monitoring does not
  gain cleanup, enforcement, quota, APM, dashboard-builder, or Prometheus responsibilities.
