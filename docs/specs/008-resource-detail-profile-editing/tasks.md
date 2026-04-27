# Tasks: Resource Detail Profile Editing

## Test-First

- [x] `RES-PROFILE-ENTRY-012`: add WebView assertion that resource detail profile editing clearly
  states durable future-only semantics and no immediate runtime restart.
- [x] `PUB-DOCS-002` / `PUB-DOCS-016`: keep docs registry operation coverage and traceability for
  source/runtime/network profile topics current.

## Source Of Truth

- [x] Update `docs/workflows/resource-profile-lifecycle.md` for the Web detail confirmation
  affordance.
- [x] Update `docs/testing/resource-profile-lifecycle-test-matrix.md` with the new matrix row and
  automated binding.
- [x] Update `docs/PRODUCT_ROADMAP.md` Phase 4 to mark resource detail profile editing affordance
  closure without claiming unrelated Phase 4 gaps.
- [x] Update public docs traceability for source/runtime/network profile topics.

## Implementation

- [x] Update resource detail Web copy through `packages/i18n` keys.
- [x] Render the profile edit boundary on the resource detail profile section.
- [x] Keep existing oRPC typed client calls and query invalidation behavior.

## Entrypoints And Docs

- [x] Update public docs pages for source/runtime/network profile future-only semantics.
- [x] Update docs registry topic metadata for source/runtime/network traceability.

## Verification

- [x] Run `bun run lint`.
- [x] Run `bun run typecheck`.
- [x] Run targeted resource profile/application/oRPC/CLI/docs-registry tests.
- [x] Run `bun run --cwd apps/web build`.
- [x] Run `bun test apps/web/test/e2e-webview/home.webview.test.ts`.

## Post-Implementation Sync

- [x] Reconcile spec, plan, tasks, roadmap, durable specs, public docs, tests, and code.
