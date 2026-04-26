# Tasks: Default Access Policy Readback

## Test-First
- [x] DEF-ACCESS-POLICY-008/009/010/011: add application query-service tests at `packages/application/test/default-access-domain-policy-readback.test.ts`.
- [x] DEF-ACCESS-POLICY-011: add PG repository list/readback assertion at `packages/persistence/pg/test/default-access-domain-policy-store.integration.test.ts`.
- [x] DEF-ACCESS-ENTRY-007: add CLI dispatch tests at `packages/adapters/cli/test/default-access-command.test.ts`.
- [x] DEF-ACCESS-ENTRY-007/PUB-DOCS-012: add HTTP dispatch tests at `packages/orpc/test/default-access-domain-policy.http.test.ts`.
- [x] DEF-ACCESS-ENTRY-007: add Web readback assertions at `apps/web/test/e2e-webview/home.webview.test.ts`.

## Source Of Truth
- [x] Update `docs/BUSINESS_OPERATION_MAP.md`, `docs/CORE_OPERATIONS.md`, query specs, workflow spec, implementation plan, and test matrix.
- [x] Update public docs and docs registry operation coverage for new query operations.
- [x] Update `docs/PRODUCT_ROADMAP.md` for the completed readback slice.

## Implementation
- [x] Add application query messages, handlers, services, tokens, and operation catalog entries.
- [x] Extend default access policy repository with list/readback support.
- [x] Add contract schemas and oRPC routes/client contract entries.
- [x] Add CLI `default-access list/show` query commands.
- [x] Prefill Web system and server policy forms from persisted policy readback and invalidate readback after save.

## Entrypoints And Docs
- [x] Confirm Web, CLI, API, public docs/help, and future MCP operation coverage all map to the same query schemas.

## Verification
- [x] Run targeted application, persistence, CLI, oRPC, docs-registry, and Web tests.
- [x] Run `bun run lint`.

## Post-Implementation Sync
- [x] Reconcile spec, plan, tasks, durable docs, tests, code, roadmap, and operation catalog.
