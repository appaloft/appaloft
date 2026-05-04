# Tasks: Resource Secret Operations And Effective Config Baseline

## Test-First

- [x] `RES-PROFILE-CONFIG-013`: add application test for runtime `.env` import with secret
  classification and masked response.
- [x] `RES-PROFILE-CONFIG-014`: add application test for invalid `.env` key rejection.
- [x] `RES-PROFILE-CONFIG-015`: add application test for build-time prefix and build-time secret
  rejection.
- [x] `RES-PROFILE-CONFIG-016`: add application test for duplicate last-wins and existing override
  reporting.
- [x] `RES-PROFILE-CONFIG-017`: add effective-config override summary test.
- [x] `RES-PROFILE-ENTRY-015`: add CLI import command dispatch test.
- [x] `RES-PROFILE-ENTRY-016`: add HTTP/oRPC import command dispatch test.

## Source Of Truth

- [x] Add feature artifact under
  `docs/specs/031-resource-secret-operations-and-effective-config/`.
- [x] Add `docs/commands/resources.import-variables.md`.
- [x] Update `docs/workflows/resource-profile-lifecycle.md`.
- [x] Update `docs/testing/resource-profile-lifecycle-test-matrix.md`.
- [x] Update `docs/BUSINESS_OPERATION_MAP.md`, `docs/CORE_OPERATIONS.md`, and
  `packages/application/src/operation-catalog.ts`.
- [x] Update `docs/DOMAIN_MODEL.md`.
- [x] Update public docs/help anchor for resource variables/secrets.
- [x] Update `docs/PRODUCT_ROADMAP.md` Phase 7 verification notes without checking the release
  rule.

## Implementation

- [x] Add `ImportResourceVariablesCommand`, schema, handler, use case, parser, and registration.
- [x] Extend `ResourceEffectiveConfigView` with safe override summaries.
- [x] Update contract schemas/types and oRPC route/client contract.
- [x] Add CLI command for pasted `.env` import.

## Verification

- [x] Run targeted application tests.
- [x] Run targeted CLI tests.
- [x] Run targeted oRPC tests.
- [x] Run operation catalog boundary tests.
- [x] Run `bun install --frozen-lockfile`.
- [x] Run `bun run typecheck`.
- [x] Run `bun run lint`.

## Post-Implementation Sync

- [x] Reconcile spec, plan, tasks, matrix ids, docs, tests, operation catalog, and roadmap notes.
- [ ] Commit, push, create PR, and inspect CI without merging unstable PRs.
