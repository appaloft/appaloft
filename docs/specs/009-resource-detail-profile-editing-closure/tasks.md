# Tasks: Resource Detail Profile Editing Closure

## Test-First

- [x] `RES-PROFILE-ENTRY-013` / `RES-HEALTH-CFG-006`: add WebView coverage for resource detail
  health policy submission through `resources.configure-health`.
- [x] `RES-PROFILE-ENTRY-014`: add WebView coverage for resource detail configuration removal
  through `resources.unset-variable`.
- [x] `RES-PROFILE-ENTRY-003`: add CLI dispatch coverage for `resources.configure-source`,
  `resources.configure-network`, `resources.configure-health`, and `resources.unset-variable`.
- [x] `PUB-DOCS-016`: expand docs-registry coverage for source/runtime/network/access/health/config
  resource detail closure traceability.

## Source Of Truth

- [x] Update `docs/PRODUCT_ROADMAP.md` Phase 4 closure and release-gate notes.
- [x] Update `docs/BUSINESS_OPERATION_MAP.md` and `docs/CORE_OPERATIONS.md` resource profile
  closure language.
- [x] Update resource profile workflow, health/config command/query specs, and test matrices.
- [x] Update public docs traceability and docs-registry metadata.

## Implementation

- [x] Add stable Web test selectors for the resource health policy form without changing business
  behavior.
- [x] Keep Web dispatch through the typed oRPC client and existing operation keys.

## Entrypoints And Docs

- [x] Confirm no generic `resources.update` operation exists in Web, CLI, HTTP/oRPC, operation
  catalog, or public docs.
- [x] Keep future MCP/tool coverage mapped to operation catalog metadata only.

## Verification

- [x] Run `bun run lint`.
- [x] Run `bun run typecheck`.
- [x] Run the requested application, oRPC, CLI, docs-registry, Web build, and WebView tests.

## Post-Implementation Sync

- [x] Reconcile spec, plan, tasks, roadmap, durable specs, public docs, tests, and code.
