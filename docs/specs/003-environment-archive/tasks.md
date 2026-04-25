# Tasks: Environment Archive

## Test-First

- [x] ENV-LIFE-ARCHIVE-001 and ENV-LIFE-ARCHIVE-002: add aggregate and application archive tests.
- [x] ENV-LIFE-READ-001: add read-model lifecycle metadata tests.
- [x] ENV-LIFE-GUARD-001 through ENV-LIFE-GUARD-004: add application guard tests.
- [x] ENV-LIFE-PERSIST-001: add PG/PGlite environment lifecycle persistence test.
- [x] ENV-LIFE-ENTRY-001 and ENV-LIFE-ENTRY-002: add HTTP/oRPC and CLI dispatch tests.
- [x] ENV-LIFE-ENTRY-003: add Web project-detail dispatch coverage.
- [x] ENV-LIFE-DOCS-001: add operation catalog/docs registry coverage.

## Source Of Truth

- [x] Add `docs/commands/environments.archive.md`.
- [x] Add `docs/events/environment-archived.md`.
- [x] Add `docs/workflows/environment-lifecycle.md`.
- [x] Add `docs/errors/environments.lifecycle.md`.
- [x] Add `docs/testing/environment-lifecycle-test-matrix.md`.
- [x] Update `docs/BUSINESS_OPERATION_MAP.md`, `docs/CORE_OPERATIONS.md`, and
  `packages/application/src/operation-catalog.ts`.
- [x] Update public docs registry, public docs pages, and public docs traceability.
- [x] Update Phase 4 roadmap rows to separate completed archive from remaining clone/lock/history.

## Implementation

- [x] Add environment lifecycle value object/status, aggregate archive state, event, and guards.
- [x] Add application command schema/message/handler/use case and exports.
- [x] Add persistence schema/migration/repository/read-model support.
- [x] Add deployment/resource admission guards.
- [x] Add contract schema/type and oRPC route/client mapping.
- [x] Add CLI `env archive` subcommand.
- [x] Add Web project-detail archive control using shared contracts and i18n copy.

## Verification

- [x] Run targeted core, application, persistence, HTTP/oRPC, CLI, docs-registry, and Web tests.
- [x] Run formatting/lint/type checks required by changed files.

## Post-Implementation Sync

- [x] Reconcile feature artifacts, command/event/workflow/error specs, test matrix, roadmap,
  operation map, `CORE_OPERATIONS.md`, operation catalog, public docs/help, tests, and code.
