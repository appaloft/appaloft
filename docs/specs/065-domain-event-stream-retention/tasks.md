# Tasks: Domain Event Stream Retention

## Spec Round

- [x] Add ADR-059 and decision index entry.
- [x] Add `docs/specs/065-domain-event-stream-retention/` feature artifacts.
- [x] Position `domain-events.prune` in `docs/BUSINESS_OPERATION_MAP.md`.
- [x] Add `docs/commands/domain-events.prune.md`.
- [x] Add `docs/testing/domain-event-stream-retention-test-matrix.md`.
- [x] Inventory current `deployments.stream-events` source and record that no canonical persisted
  domain event stream store exists yet.
- [x] Select `domain_event_stream_records` plus prune watermark state as the first retained event
  observation store boundary in ADR-059 and the feature artifacts.
- [x] Keep roadmap audit/event retention item open until implementation and verification exist.

## Test-First

- [x] DOMAIN-EVENT-RETENTION-001: add application and persistence tests for dry-run default.
- [x] DOMAIN-EVENT-RETENTION-002: add application and persistence tests for destructive prune.
- [x] DOMAIN-EVENT-RETENTION-003: add cutoff, scope, and replay-guard safety tests.
- [x] DOMAIN-EVENT-RETENTION-004: add CLI and HTTP/oRPC shared schema dispatch tests.
- [x] DOMAIN-EVENT-RETENTION-005: add event stream gap contract tests for pruned cursors.

## Implementation

- [x] Add retained event stream application port and prune result types.
- [x] Add PostgreSQL/PGlite `domain_event_stream_records` persistence boundary and prune watermark
  migration.
- [x] Add shared `domain-events.prune` schema, command, handler, and use case.
- [x] Wire shell composition to the retained event stream retention store and use case.
- [x] Add record writer/projection path into `domain_event_stream_records`.
- [x] Migrate `deployments.stream-events` bounded replay and pruned-cursor gap detection to the
  retained event observation store.
- [x] Migrate `deployments.stream-events` follow-mode cursor continuation to the retained event
  observation store.
- [x] Add CLI `appaloft domain-event prune` command.
- [x] Add HTTP/oRPC prune route.
- [x] Add operation catalog and public docs registry coverage.
- [x] Add OpenAPI/SDK metadata coverage.

## Entrypoints And Docs

- [x] Add public docs/help anchor for event stream retention or record existing anchor reuse.
- [x] Keep Web as future operator maintenance surface unless a governed UI slice is in scope.

## Verification

- [x] Run focused application and persistence tests for `DOMAIN-EVENT-RETENTION-001` through
  `DOMAIN-EVENT-RETENTION-003`.
- [x] Run touched application, persistence, and shell package typechecks.
- [x] Run CLI, oRPC, openapi, docs-registry, operation catalog, and stream gap tests after those
  surfaces enter scope.
- [x] Run touched lint.
- [x] Run `git diff --check`.

## Post-Implementation Sync

- [x] Reconcile ADR-059, feature artifacts, command spec, event stream query/error specs, test
  matrix, roadmap, operation map, core operations, docs/help, code, tests, and remaining migration
  gaps.
