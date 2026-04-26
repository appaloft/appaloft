# Tasks: Environment Clone

## Test-First

- [x] ENV-LIFE-CLONE-001: add aggregate/application clone success tests.
- [x] ENV-LIFE-CLONE-002 through ENV-LIFE-CLONE-004: add source archived, duplicate name, and
  source project archived rejection tests.
- [x] ENV-LIFE-CLONE-PERSIST-001: add PG/PGlite clone persistence round-trip coverage.
- [x] ENV-LIFE-CLONE-ENTRY-001 and ENV-LIFE-CLONE-ENTRY-002: add CLI and HTTP/oRPC dispatch tests.
- [x] ENV-LIFE-CLONE-ENTRY-003: add Web project-detail dispatch coverage.
- [x] ENV-LIFE-CLONE-ENTRY-004 and ENV-LIFE-CLONE-DOCS-001: add operation catalog and docs
  registry coverage.

## Source Of Truth

- [x] Add `docs/commands/environments.clone.md`.
- [x] Update `docs/workflows/environment-lifecycle.md`.
- [x] Update `docs/errors/environments.lifecycle.md`.
- [x] Update `docs/testing/environment-lifecycle-test-matrix.md`.
- [x] Update `docs/BUSINESS_OPERATION_MAP.md`, `docs/CORE_OPERATIONS.md`, and
  `packages/application/src/operation-catalog.ts`.
- [x] Update public docs registry, public docs pages, and public docs traceability.
- [x] Update Phase 4 roadmap rows to separate completed clone from remaining lock/history work.

## Implementation

- [x] Add environment aggregate clone behavior.
- [x] Add application command schema/message/handler/use case and exports.
- [x] Add contract schema/type and oRPC route/client mapping.
- [x] Add CLI `env clone` subcommand.
- [x] Add Web project-detail clone control using shared contracts and i18n copy.

## Verification

- [x] Run targeted core, application, persistence, HTTP/oRPC, CLI, docs-registry, and Web tests.
- [x] Run formatting/lint/type checks required by changed files.

## Post-Implementation Sync

- [x] Reconcile feature artifacts, command/workflow/error specs, test matrix, roadmap, operation
  map, `CORE_OPERATIONS.md`, operation catalog, public docs/help, tests, and code.
