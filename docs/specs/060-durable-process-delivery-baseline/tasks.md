# Tasks: Durable Process Delivery Baseline

## Test-First

- [x] PROC-DELIVERY-001: add application test proving accepted work records durable attempt state.
- [x] PROC-DELIVERY-002: add PG/PGlite atomic claim test for due delivery candidates, duplicate
  claims, future, terminal, and missing claim outcomes plus selected workflow runner handoff.
- [x] PROC-DELIVERY-003: add retry candidate dedupe-authority test for stale attempts.
- [x] PROC-DELIVERY-004: add PG/PGlite claimed-attempt completion test for retriable failure
  scheduling and safe failure details.
- [x] PROC-DELIVERY-005: add PG/PGlite claimed-attempt completion test for terminal failure,
  non-running refusal, missing refusal, and safe detail redaction.
- [x] PROC-DELIVERY-006: add test proving `operator-work.retry` does not execute workflow work
  without a governed durable worker.
- [x] PROC-DELIVERY-007: add retry selection test proving dead-lettered attempts are skipped.
- [x] PROC-DELIVERY-008: add test proving recovery annotations do not mutate business aggregates.
- [x] PROC-DELIVERY-009: bind active `operator-work.mark-recovered`, `operator-work.dead-letter`,
  `operator-work.cancel`, `operator-work.retry`, and `operator-work.prune` CLI/HTTP entrypoint
  tests to the durable-process CQRS boundary; adapters dispatch command/query buses and do not
  claim process work directly.
- [x] PROC-DELIVERY-010: add PG/PGlite retry-generation test proving a due retry-scheduled source
  creates one fresh pending delivery attempt and clears source retry eligibility.
- [x] PROC-DELIVERY-011: add shell runner test proving generated scheduled-task retry attempts are
  drained through the scheduled-task durable worker handoff.
- [x] Add traceability for scheduled runtime prune as the second durable workflow binding using
  existing RT-CAP-SCHED automation tests plus PROC-DELIVERY matrix ids.

## Source Of Truth

- [x] Add ADR-054 and decision index entry.
- [x] Add `docs/specs/060-durable-process-delivery-baseline/` feature artifacts.
- [x] Add durable process delivery test matrix.
- [x] Select scheduled-task accepted-run worker as the first workflow-specific Code Round for
  durable worker execution.
- [x] Update the selected workflow test matrix for scheduled-task worker durable claim/completion
  binding.
- [x] Sync scheduled runtime prune into this baseline as the second workflow-specific durable worker
  binding after its governed Code Round.

## Implementation

- [x] Add application process delivery port for atomic due-attempt claim.
- [x] Add application process delivery port for due delivery candidate selection.
- [x] Add application process delivery port for worker completion.
- [x] Add or extend application process delivery ports for retry generation.
- [x] Add persistence adapter support for atomic due-attempt claim.
- [x] Add persistence adapter support for due delivery candidate selection.
- [x] Add persistence adapter support for worker retry generation across delivery generations.
- [x] Add persistence adapter support for retry selection dedupe authority across process attempt
  rows.
- [x] Add persistence adapter support for claimed-attempt worker completion.
- [x] Wire shell composition tokens for process attempt claim/completion ports.
- [x] Wire selected scheduled-task runner input from pending durable process attempts.
- [x] Wire selected scheduled-task runner retry generation from due retry-scheduled attempts into
  pending durable process attempts.
- [x] Keep existing operator-work commands as annotations unless the selected workflow spec governs
  executable retry.

## Entrypoints And Docs

- [x] Reuse `operator-work.*` for public visibility and manual annotations.
- [x] Add no new API/CLI entrypoint unless the selected workflow requires one.
- [x] Link selected workflow public docs/help to operator work delivery visibility through existing
  operator work ledger help coverage; no new public help anchor was added in this Code Round.
- [x] Keep Web as read-only/status-only unless a governed operator UI affordance is in scope.

## Verification

- [x] Run selected application, persistence, shell, CLI, oRPC, and docs-registry tests for durable
  handoff, operator-work delivery controls, and public help/catalog coverage.
- [x] Run touched package typecheck and lint.

## Post-Implementation Sync

- [x] Reconcile ADR-054, feature artifacts, selected workflow specs, test matrix, docs, code, and
  remaining migration gaps.
