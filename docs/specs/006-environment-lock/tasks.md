# Tasks: Environment Lock

## Test-First

- [x] ENV-LIFE-LOCK-001 and ENV-LIFE-LOCK-002: add aggregate and application lock tests.
- [x] ENV-LIFE-UNLOCK-001 and ENV-LIFE-UNLOCK-002: add aggregate and application unlock tests.
- [x] ENV-LIFE-READ-002: add read-model lock metadata tests.
- [x] ENV-LIFE-GUARD-006 through ENV-LIFE-GUARD-009: add application guard tests.
- [x] ENV-LIFE-ARCHIVE-004: add locked-to-archived transition test.
- [x] ENV-LIFE-PERSIST-002: add PG/PGlite environment lock persistence test.
- [x] ENV-LIFE-ENTRY-006: add HTTP/oRPC, CLI, and Web dispatch tests.
- [x] ENV-LIFE-DOCS-002: add operation catalog/docs registry coverage.

## Source Of Truth

- [x] Add ADR-032 for environment lock lifecycle.
- [x] Add `docs/commands/environments.lock.md`.
- [x] Add `docs/commands/environments.unlock.md`.
- [x] Add `docs/events/environment-locked.md`.
- [x] Add `docs/events/environment-unlocked.md`.
- [x] Update `docs/workflows/environment-lifecycle.md`.
- [x] Update `docs/errors/environments.lifecycle.md`.
- [x] Update `docs/testing/environment-lifecycle-test-matrix.md`.
- [x] Update `docs/BUSINESS_OPERATION_MAP.md`, `docs/CORE_OPERATIONS.md`, and roadmap.
- [x] Update public docs registry, public docs pages, and public docs traceability.

## Implementation

- [x] Add environment locked lifecycle value object/status, aggregate lock/unlock state, events, and
  guards.
- [x] Add application command schemas/messages/handlers/use cases and exports.
- [x] Add persistence schema/migration/repository/read-model support.
- [x] Add contract schema/types and oRPC route/client mapping.
- [x] Add CLI `env lock` and `env unlock` subcommands.
- [x] Add Web project-detail lock/unlock controls using shared contracts and i18n copy.

## Verification

- [x] Run targeted core, application, persistence, HTTP/oRPC, CLI, docs-registry, and Web tests.
- [x] Run formatting/lint/type checks required by changed files.

## Post-Implementation Sync

- [x] Reconcile feature artifacts, command/event/workflow/error specs, test matrix, roadmap,
  operation map, `CORE_OPERATIONS.md`, operation catalog, public docs/help, tests, and code.
