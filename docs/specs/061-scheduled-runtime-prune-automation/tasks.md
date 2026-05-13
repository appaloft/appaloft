# Tasks: Scheduled Runtime Prune Automation

## Spec Round

- [x] Add ADR-055 and decision index entry.
- [x] Add `docs/specs/061-scheduled-runtime-prune-automation/` feature artifacts.
- [x] Position scheduled runtime prune automation in `docs/BUSINESS_OPERATION_MAP.md`.
- [x] Extend `docs/testing/runtime-target-capacity-test-matrix.md` with scheduled automation rows.
- [x] Keep roadmap item open until implementation and verification exist.

## Test-First

- [x] RT-CAP-SCHED-001: add in-memory policy precedence and safe readback tests.
- [x] RT-CAP-SCHED-001: add persistence-backed policy precedence and safe readback tests.
- [x] RT-CAP-SCHED-001: add repository config parse/readback tests for `retention.runtimePrune`.
- [x] RT-CAP-SCHED-002: add scheduled dry-run default dispatch test.
- [x] RT-CAP-SCHED-003: add destructive policy-gated dispatch test.
- [x] RT-CAP-SCHED-004: add durable process attempt creation test for accepted scheduled prune.
- [x] RT-CAP-SCHED-005: add retry/failure operator-work visibility tests.
- [x] RT-CAP-SCHED-005: add application-level dead-letter and recovery visibility tests for
  scheduled runtime prune process attempts.
- [x] RT-CAP-SCHED-005: add persistence-backed worker handoff visibility test for discovered
  scheduled runtime prune policies.
- [x] RT-CAP-SCHED-006: add destructive scheduled prune audit output test at the application
  service boundary.
- [x] RT-CAP-SCHED-007: add application service test proving prune execution goes through a
  bus-like command dispatch boundary.
- [x] RT-CAP-SCHED-007: add shell runner test proving configured policies are dispatched through
  the scheduled runtime prune application service.
- [x] RT-CAP-SCHED-007: add config parsing test for the scheduled runtime prune runner.
- [x] RT-CAP-SCHED-007: add shell runner policy discovery test through the injected read model.
- [x] RT-CAP-SCHED-007: add application command/query tests for scheduled runtime prune policy
  configure/list/show surfaces.
- [x] RT-CAP-SCHED-007: add public entrypoint CQRS boundary tests when those surfaces are
  implemented.

## Implementation

- [x] Add application runtime prune policy resolver for already-loaded policy input.
- [x] Add runtime prune policy persistence/read model for enabled policy discovery.
- [x] Add scheduled runtime prune application service and durable process attempt recording for
  already-resolved policy input.
- [x] Add scheduled runtime prune application worker path that dispatches `PruneServerCapacityCommand` through the
  command bus.
- [x] Add shell runner module for explicitly supplied scheduled runtime prune policies.
- [x] Add disabled-by-default config and shell lifecycle wiring for the scheduled runtime prune
  runner.
- [x] Add persistence-backed policy discovery and feed discovered policies into shell composition.
- [x] Reuse existing runtime target capacity pruner port; do not call runtime adapters directly.
- [x] Reuse existing destructive prune audit recorder path.
- [x] Add scheduled runtime prune policy configure/list/show command/query application surfaces.
- [x] Add repository/deployment-snapshot config materialization for `retention.runtimePrune`.

## Entrypoints And Docs

- [x] Keep manual prune public surface at `servers.capacity.prune`.
- [x] Add policy configuration command/query docs for the application command/query surfaces.
- [x] Add CLI and HTTP/oRPC policy configure/list/show entrypoints through command/query buses.
- [x] Add repository config `retention.runtimePrune` readback through deployment config parsing.
- [x] Link public docs/help to stable runtime capacity or retention anchors.
- [x] Keep Web as future policy/status surface unless a governed UI slice is in scope.

## Verification

- [x] Run focused application, persistence, shell scheduler, CLI/oRPC/docs-registry tests as
  applicable to the Code Round.
- [x] Run touched package typecheck and lint.
- [x] Run `git diff --check`.

## Post-Implementation Sync

- [x] Reconcile ADR-055, feature artifacts, runtime target capacity matrix, roadmap, operation map,
  docs/help, code, tests, and remaining migration gaps.
