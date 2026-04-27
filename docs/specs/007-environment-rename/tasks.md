# Tasks: Environment Rename

## Test-First

- [x] `ENV-LIFE-RENAME-001..006`: add application/core tests for rename behavior and event payload.
- [x] `ENV-LIFE-RENAME-ENTRY-001`: add CLI dispatch test.
- [x] `ENV-LIFE-RENAME-ENTRY-002`: add HTTP/oRPC dispatch test.
- [x] `ENV-LIFE-RENAME-ENTRY-003`: add Web dispatch test.
- [x] `ENV-LIFE-RENAME-ENTRY-004`: add operation catalog test.
- [x] `ENV-LIFE-RENAME-DOCS-001`: add public docs registry coverage test.

## Source Of Truth

- [x] Update `docs/BUSINESS_OPERATION_MAP.md`.
- [x] Update `docs/CORE_OPERATIONS.md`.
- [x] Add `docs/commands/environments.rename.md`.
- [x] Add `docs/events/environment-renamed.md`.
- [x] Update `docs/workflows/environment-lifecycle.md`.
- [x] Update `docs/errors/environments.lifecycle.md`.
- [x] Update `docs/testing/environment-lifecycle-test-matrix.md`.
- [x] Update public docs/help coverage and pages.
- [x] Update `docs/PRODUCT_ROADMAP.md`.

## Implementation

- [x] Add core environment rename transition.
- [x] Add application command, schema, handler, use case, exports, token, and shell registration.
- [x] Add operation catalog entry.
- [x] Add contracts/oRPC route and client contract.
- [x] Add CLI subcommand.
- [x] Add Web project detail rename affordance with i18n copy.

## Verification

- [x] Run focused unit/contract tests for application, core, CLI, oRPC, docs registry, and Web e2e.
- [x] Run focused typecheck/lint where needed.

## Post-Implementation Sync

- [x] Reconcile feature artifacts, roadmap, durable specs, tests, docs, and code.
