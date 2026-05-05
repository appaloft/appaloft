# Tasks: Dependency Binding Secret Rotation

## Test-First

- [x] DEP-BIND-ROTATE-001: add failing core/application tests for rotating one active
  ResourceBinding secret reference.
- [x] DEP-BIND-ROTATE-002: add failing admission tests for missing, removed, or cross-resource
  bindings.
- [x] DEP-BIND-ROTATE-003: add failing masking tests proving rotation input does not leak through
  read models, errors, events, logs, or snapshots.
- [x] DEP-BIND-ROTATE-004: add failing deployment snapshot immutability test after rotation.
- [x] DEP-BIND-ROTATE-005: add failing list/show read-model tests for safe latest rotation
  metadata.
- [x] DEP-BIND-ROTATE-006: add failing operation catalog, CLI, and HTTP/oRPC dispatch tests.
- [x] Add PG/PGlite persistence/read-model tests for safe rotation metadata.
- [x] Add contract/schema tests if command or binding read-model schemas change.

## Source Of Truth

- [x] Create `docs/specs/036-dependency-binding-secret-rotation/spec.md`.
- [x] Create `docs/specs/036-dependency-binding-secret-rotation/plan.md`.
- [x] Create `docs/specs/036-dependency-binding-secret-rotation/tasks.md`.
- [x] Create `docs/commands/resources.rotate-dependency-binding-secret.md`.
- [x] Create `docs/events/resource-dependency-binding-secret-rotated.md`.
- [x] Update `docs/testing/dependency-resource-test-matrix.md`.
- [x] Update `docs/workflows/dependency-resource-lifecycle.md`.
- [x] Update `docs/DOMAIN_MODEL.md`.
- [x] Update `docs/BUSINESS_OPERATION_MAP.md`.
- [x] Update `docs/CORE_OPERATIONS.md` accepted-candidate note.
- [x] Update `docs/errors/model.md`.
- [x] Update `docs/PRODUCT_ROADMAP.md`.
- [x] Add the implemented operation row in `docs/CORE_OPERATIONS.md` and
  `packages/application/src/operation-catalog.ts` during Code Round when the command becomes
  active.

## Implementation

- [x] Extend core `ResourceBinding` with safe secret reference/version metadata and
  `rotateSecret(...)`.
- [x] Add application command/schema/handler/use case.
- [x] Extend repository/read-model ports and testkit memory adapters.
- [x] Add PG/PGlite migration, repository mapping, and read-model projection.
- [x] Ensure deployment snapshots preserve captured references after later rotations.

## Entrypoints And Docs

- [x] Add CLI Resource dependency binding secret rotation command.
- [x] Add oRPC/HTTP route.
- [x] Record Web/public-docs migration gap or complete a Docs/Web round.

## Verification

- [x] Run related core/application tests.
- [x] Run PG/PGlite dependency binding tests.
- [x] Run deployment snapshot immutability tests.
- [x] Run CLI/oRPC/HTTP tests touched by routes.
- [x] Run operation catalog boundary tests.
- [x] Run `bun install --frozen-lockfile`.
- [x] Run `bun run typecheck`.
- [x] Run `bun run lint` (passes with existing `apps/web/src/routes/layout.css`
  `noImportantStyles` warnings).

## Post-Implementation Sync

- [x] Reconcile spec, plan, tasks, docs, tests, operation catalog, code, roadmap notes, and public
  docs/help outcome.
