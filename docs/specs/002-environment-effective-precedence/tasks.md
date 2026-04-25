# Tasks: Environment Effective Precedence

## Test-First

- [x] ENV-PRECEDENCE-QRY-001 and ENV-PRECEDENCE-QRY-002: add application query-service test at
  `packages/application/test/environment-effective-precedence.test.ts`.
- [x] ENV-PRECEDENCE-QRY-003: add missing environment query-service test at
  `packages/application/test/environment-effective-precedence.test.ts`.
- [x] ENV-PRECEDENCE-ENTRY-001: add operation catalog/docs registry coverage updates.
- [x] ENV-PRECEDENCE-ENTRY-002: add HTTP/oRPC dispatch test at
  `packages/orpc/test/environment-effective-precedence.http.test.ts`.
- [x] ENV-PRECEDENCE-ENTRY-003: add CLI dispatch test at
  `packages/adapters/cli/test/environment-command.test.ts`.

## Source Of Truth

- [x] Add `docs/queries/environments.effective-precedence.md`.
- [x] Add `docs/testing/environment-effective-precedence-test-matrix.md`.
- [x] Update `docs/BUSINESS_OPERATION_MAP.md`, `docs/CORE_OPERATIONS.md`, and
  `packages/application/src/operation-catalog.ts`.
- [x] Update public docs registry and precedence docs topic.
- [x] Mark the Phase 4 roadmap row complete after Code Round verification.

## Implementation

- [x] Add query schema/message/handler/query-service and exports.
- [x] Add application port DTOs and DI token/registration.
- [x] Add contract schema/type and oRPC route/client mapping.
- [x] Add CLI `env effective-precedence` subcommand.

## Verification

- [x] Run targeted application test.
- [x] Run targeted HTTP/oRPC test.
- [x] Run targeted CLI test.
- [x] Run operation catalog/docs-registry checks.
- [x] Run formatter/lint or targeted package checks required by changed files.

## Post-Implementation Sync

- [x] Reconcile feature artifacts, query spec, test matrix, roadmap, operation map,
  `CORE_OPERATIONS.md`, operation catalog, public docs/help, tests, and implementation notes.
