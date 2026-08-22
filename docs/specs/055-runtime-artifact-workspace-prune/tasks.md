# Tasks: Runtime Artifact And Workspace Prune

## Test-First

- [x] RT-CAP-PRUNE-001: add application dry-run/default test.
- [x] RT-CAP-PRUNE-002: add application destructive prune test.
- [x] RT-CAP-PRUNE-003: add runtime adapter skip reason parser test.
- [x] RT-CAP-PRUNE-005: add CLI and oRPC dispatch tests.
- [x] RT-CAP-PRUNE-006: add destructive prune audit output tests.
- [x] RT-CAP-PRUNE-007: add explicit Docker build-cache and unused-image category tests.
- [x] RT-CAP-PRUNE-013: add application protection-set and runtime adapter fail-closed tests.
- [x] CONFIG-FILE-STATE-003/006/019: add strict read-only, guard crash recovery, ENOSPC stderr,
  token-safe transition, public stale-recovery, maintenance entrypoint, and Linux kernel concurrency
  regression coverage.
- [x] RT-CAP-REMOTE-STATE-003: add lifecycle ABA fencing, durable intent ordering, maintenance owner
  publication and heartbeat failure, signal rollback, crash-marker resolution, immutable backup
  symlink, and overlap-based real-`flock` regression coverage.

## Source Of Truth

- [x] Add ADR-047 and decision index entry.
- [x] Add ADR-050 and decision index entry for Docker build-cache and unused-image prune.
- [x] Add `docs/commands/servers.capacity.prune.md`.
- [x] Update operation map, core operations, runtime workflow, implementation plan, roadmap, docs registry.

## Implementation

- [x] Add application command, handler, use case, port types, tokens, exports, and operation catalog entry.
- [x] Add runtime adapter prune implementation for local-shell and generic-SSH.
- [x] Extend runtime adapter prune implementation for explicit Docker build-cache and unused-image
  categories.
- [x] Add contracts/oRPC/CLI entrypoints.
- [x] Add audit recorder port, persistence implementation, and destructive prune audit wiring.
- [x] Derive complete server-scoped active-runtime/rollback protection and pass it to the runtime
  adapter before stopped-container mutation.
- [x] Serialize SSH-PGlite prepare, heartbeat, release, failure cleanup, explicit stale recovery,
  backup, restore, promote, and rollback through the shared kernel transition gate; atomically
  publish UUID-owned guard metadata and prewrite recovery intent before canonical movement.
- [x] Give ordinary lifecycle locks unique tokens, sync recovery intent before canonical movement,
  and make promote/rollback a revision-committed transaction with signal rollback and deterministic
  crash-marker resolution.

## Entrypoints And Docs

- [x] Wire CLI help to `diagnostics.runtime-target-capacity`.
- [x] Add oRPC route `POST /api/servers/{serverId}/capacity/prune`.
- [x] Add Server detail Web Capacity controls with dry-run-first preview, explicit destructive
  confirmation, and Monitor observation-window handoff.

## Verification

- [x] Run focused application, runtime adapter, CLI, oRPC, and docs-registry tests.
- [x] Run typecheck for touched packages.
- [x] Run lint for touched packages.
- [x] Re-run focused application, persistence, runtime adapter, CLI, oRPC, docs-registry tests and
  touched package typecheck/lint after audit output wiring.
- [x] Run focused Web source/WebView coverage for `RT-CAP-WEB-001`.
- [x] Run focused application, persistence read-model, runtime adapter, typecheck, lint, and Ash
  command-safety verification for `RT-CAP-PRUNE-013`.
- [x] Run focused lifecycle and remote-state tests on Darwin with the narrow sequential `flock`
  harness, and run lifecycle tests in Linux with real `flock`, including concurrent contenders.
- [ ] Run the released source CLI against the production Hostinger target and prove exact
  `appaloftdev code --codex` TTY attach before closing the incident.

## Post-Implementation Sync

- [x] Reconcile spec, plan, tasks, durable docs, tests, and code after audit output wiring.
- [x] Reconcile stopped-container protection semantics across ADR-047, command docs, matrix, tests,
  and code.
