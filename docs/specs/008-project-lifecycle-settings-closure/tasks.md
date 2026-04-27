# Tasks: Project Lifecycle Settings Closure

## Test-First

- [x] `PROJ-LIFE-ENTRY-005`: add/refresh WebView coverage for `projects.show`,
  `projects.rename`, and `projects.archive`.
- [x] `PROJ-LIFE-ENTRY-006`: assert project settings side-effect clarity in WebView coverage.
- [x] `PROJ-LIFE-ENTRY-007`: assert archived project-scoped creation affordances remain guarded.

## Source Of Truth

- [x] Update `docs/PRODUCT_ROADMAP.md` Phase 4 and Resource/Internal State Coverage Ledger.
- [x] Update `docs/BUSINESS_OPERATION_MAP.md`.
- [x] Update `docs/CORE_OPERATIONS.md`.
- [x] Update `docs/workflows/project-lifecycle.md`.
- [x] Update project lifecycle command/query/event/test matrix docs.
- [x] Update public docs/help traceability and docs registry metadata.

## Implementation

- [x] Update Web project settings copy through `packages/i18n`.
- [x] Add stable Web selectors for project rename/archive controls.
- [x] Add WebView mock routes for project show/rename/archive.
- [x] Add WebView assertions that project settings actions do not call deployment creation.

## Verification

- [x] `bun run lint`
- [x] `bun run typecheck`
- [x] `bun test packages/application/test/project-lifecycle.test.ts`
- [x] `bun test packages/adapters/cli/test/project-command.test.ts`
- [x] `bun test packages/orpc/test/project-lifecycle.http.test.ts`
- [x] `bun test packages/docs-registry/test`
- [x] `bun run --cwd apps/web build`
- [x] `bun test apps/web/test/e2e-webview/home.webview.test.ts`

## Post-Implementation Sync

- [x] Reconcile feature artifacts, roadmap, durable specs, public docs, tests, and code.
