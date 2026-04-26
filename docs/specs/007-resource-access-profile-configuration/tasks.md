# Tasks: Resource Access Profile Configuration

## Test-First

- [ ] `RES-PROFILE-ACCESS-001`: add application command test for storing disabled generated access.
- [ ] `RES-PROFILE-ACCESS-002`: add application/read-model test for restoring inheritance.
- [ ] `RES-PROFILE-ACCESS-003`: add planned/deployment route test for custom path prefix.
- [ ] `RES-PROFILE-ACCESS-004`: add validation test for unsafe path prefix.
- [ ] `RES-PROFILE-ACCESS-005`: add archived-resource guard test.
- [ ] `RES-PROFILE-ENTRY-009`: add HTTP/oRPC dispatch test.
- [ ] `RES-PROFILE-ENTRY-010`: add CLI dispatch test.
- [ ] `RES-PROFILE-ENTRY-011`: add Web resource detail dispatch test.

## Source Of Truth

- [ ] Update operation map, core operations, command/event/workflow/error/testing specs, public
  docs/help registry, and roadmap.

## Implementation

- [ ] Add resource access profile value objects/state and aggregate mutation.
- [ ] Add application command/schema/handler/use case and exports.
- [ ] Add persistence schema/migration/rehydration/read-model support.
- [ ] Add route resolution/read-model behavior for generated access disable and path prefix.
- [ ] Add operation catalog, DI registration, HTTP/oRPC route, CLI command, and Web form.

## Entrypoints And Docs

- [ ] Update public docs pages, docs registry coverage, CLI/API descriptions, and Web help links.

## Verification

- [ ] Run targeted application/orpc/cli/web/docs-registry tests.
- [ ] Run `bun run lint`.

## Post-Implementation Sync

- [ ] Reconcile spec, plan, tasks, tests, docs, roadmap, and code.
