# Tasks: Storage Volume Lifecycle And Resource Attachment

## Test-First

- [x] STOR-VOL-CREATE-001/002/003: add core/application tests for named volume and bind mount creation.
- [x] STOR-ATTACH-001/002/003/004: add resource attachment tests for active resource, duplicate
  destination, archived resource, and unsafe destination.
- [x] STOR-DETACH-001: add detach test proving the StorageVolume remains.
- [x] STOR-VOL-DELETE-001/002/003: add delete safety tests.
- [x] STOR-READ-001/002: add query/read-model tests for volume and resource attachment summaries.
- [x] STOR-SNAPSHOT-001: add deployment snapshot metadata test if snapshot materialization is in
  this Code Round; otherwise record deferred-gap.
- [x] STOR-ENTRY-001/002/003: add operation catalog, CLI, and oRPC/HTTP dispatch tests.

## Source Of Truth

- [x] Create feature artifacts under
  `docs/specs/032-storage-volume-lifecycle-and-resource-attachment/`.
- [x] Update `docs/DOMAIN_MODEL.md`.
- [x] Update `docs/BUSINESS_OPERATION_MAP.md`.
- [x] Update `docs/CORE_OPERATIONS.md`.
- [x] Update `docs/workflows/storage-volume-lifecycle.md`.
- [x] Update `docs/workflows/resource-profile-lifecycle.md`.
- [x] Update `docs/testing/storage-volume-test-matrix.md`.
- [x] Update storage command/query specs.
- [x] Update public docs/help anchor coverage or migration notes.
- [x] Update `docs/PRODUCT_ROADMAP.md` Phase 7 verification notes without closing the `0.9.0`
  release rule.

## Implementation

- [x] Implement core StorageVolume aggregate, value objects, specs, and Resource attachment
  behavior.
- [x] Implement application command/query messages, schemas, handlers, use cases/query services,
  ports/tokens, and operation catalog entries.
- [x] Implement persistence/pg migration, repository, and read model.
- [x] Implement contracts and oRPC/HTTP routes.
- [x] Implement CLI commands.
- [x] Register application services and runtime dependencies in shell composition.
- [x] Record deployment snapshot materialization as a deferred gap for this baseline.

## Entrypoints And Docs

- [x] CLI: create/list/show/rename/delete/attach/detach dispatch through bus.
- [x] oRPC/HTTP: routes reuse command/query schemas.
- [x] Web: classify as deferred or add read-only display with i18n and tests.
- [x] Future MCP/tool manifest: operation catalog entries are AI-native small operations.

## Verification

- [x] `bun install --frozen-lockfile`
- [x] focused core/application/persistence tests, plus operation catalog/public docs route coverage.
- [x] `bun run typecheck`
- [x] `bun run lint` exits 0; existing Web CSS `!important` warnings remain outside this storage slice.

## Post-Implementation Sync

- [x] Mark matrix rows passing/deferred with test bindings.
- [x] Reconcile spec, plan, tasks, durable docs, operation catalog, tests, and code.
- [ ] Commit, push, create PR, and report CI status.
