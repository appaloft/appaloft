# Tasks: Storage Volume Runtime Realization And Cleanup

## Spec Round

- [x] Create ADR-064 for storage runtime realization and cleanup ownership.
- [x] Create `docs/specs/070-storage-volume-runtime-realization-and-cleanup/spec.md`.
- [x] Create `docs/specs/070-storage-volume-runtime-realization-and-cleanup/plan.md`.
- [x] Create `docs/specs/070-storage-volume-runtime-realization-and-cleanup/tasks.md`.
- [x] Create `docs/commands/storage-volumes.cleanup-runtime.md` command spec.
- [x] Update `docs/BUSINESS_OPERATION_MAP.md`.
- [x] Update `docs/CORE_OPERATIONS.md`.
- [x] Update `docs/DOMAIN_MODEL.md`.
- [x] Update `docs/workflows/storage-volume-lifecycle.md`.
- [x] Update `docs/testing/storage-volume-test-matrix.md`.
- [x] Update public docs/help wording to distinguish provider-neutral delete from runtime cleanup.

## Test-First

- [x] STOR-REALIZE-001/002/003: add runtime/application tests proving deployment-driven
  realization, no upfront provisioning on create, and Swarm Compose stack realization semantics.
- [x] STOR-CLEANUP-001/002/003/004/005: add failing application/runtime/CLI/HTTP tests for the
  future cleanup command.

## Code Round

- [x] Add `storage-volumes.cleanup-runtime` operation catalog row and command/query schema.
- [x] Implement application use case and handler.
- [x] Add runtime target cleanup port and conservative local/generic-SSH Docker implementation.
- [x] Add Docker Swarm Compose stack candidate deploy planning with generated storage mount
  overrides and superseded stack/service cleanup.
- [x] Add local explicit real Docker Swarm Compose storage smoke for generated override, named-volume
  creation, route reachability, and cleanup.
- [x] Add reusable GitHub Actions gate for real storage cleanup Docker/SSH smoke in nightly and
  release.
- [x] Add CLI and HTTP/oRPC entrypoints.
- [x] Add Resource detail Web dry-run-first cleanup controls.
- [x] Add public docs/help coverage for the cleanup command.

## Verification

- [x] Focused storage/runtime cleanup tests.
- [x] `bun run typecheck`.
- [x] `bun run lint`.

## Post-Implementation Sync

- [x] Mark matrix rows with passing automation bindings.
- [x] Reconcile ADR/spec/plan/tasks, durable docs, operation catalog, entrypoints, and tests.
