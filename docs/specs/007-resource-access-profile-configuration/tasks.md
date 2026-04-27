# Tasks: Resource Access Profile Configuration

## Test-First

- [x] `RES-PROFILE-ACCESS-001`: add application command test for storing disabled generated access.
- [x] `RES-PROFILE-ACCESS-002`: add application/read-model test for restoring inheritance.
- [x] `RES-PROFILE-ACCESS-003`: add planned/deployment route test for custom path prefix.
- [x] `RES-PROFILE-ACCESS-004`: add validation test for unsafe path prefix.
- [x] `RES-PROFILE-ACCESS-005`: add archived-resource guard test.
- [x] `RES-PROFILE-ENTRY-009`: add HTTP/oRPC dispatch test.
- [x] `RES-PROFILE-ENTRY-010`: add CLI dispatch test.
- [x] `RES-PROFILE-ENTRY-011`: add Web resource detail dispatch test.

## Source Of Truth

- [x] Update operation map, core operations, command/event/workflow/error/testing specs, public
  docs/help registry, and roadmap.

## Implementation

- [x] Add resource access profile value objects/state and aggregate mutation.
- [x] Add application command/schema/handler/use case and exports.
- [x] Add persistence schema/migration/rehydration/read-model support.
- [x] Add route resolution/read-model behavior for generated access disable and path prefix.
- [x] Add operation catalog, DI registration, HTTP/oRPC route, CLI command, and Web form.

## Entrypoints And Docs

- [x] Update public docs pages, docs registry coverage, CLI/API descriptions, and Web help links.

## Verification

- [x] Run targeted application/orpc/cli/web/docs-registry tests.
- [x] Run `bun run lint`.

## Post-Implementation Sync

- [x] Reconcile spec, plan, tasks, tests, docs, roadmap, and code.
