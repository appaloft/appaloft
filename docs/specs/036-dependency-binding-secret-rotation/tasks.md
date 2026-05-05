# Tasks: Dependency Binding Secret Rotation

## Test-First

- [ ] DEP-BIND-ROTATE-001: add failing core/application tests for rotating one active
  ResourceBinding secret reference.
- [ ] DEP-BIND-ROTATE-002: add failing admission tests for missing, removed, or cross-resource
  bindings.
- [ ] DEP-BIND-ROTATE-003: add failing masking tests proving rotation input does not leak through
  read models, errors, events, logs, or snapshots.
- [ ] DEP-BIND-ROTATE-004: add failing deployment snapshot immutability test after rotation.
- [ ] DEP-BIND-ROTATE-005: add failing list/show read-model tests for safe latest rotation
  metadata.
- [ ] DEP-BIND-ROTATE-006: add failing operation catalog, CLI, and HTTP/oRPC dispatch tests.
- [ ] Add PG/PGlite persistence/read-model tests for safe rotation metadata.
- [ ] Add contract/schema tests if command or binding read-model schemas change.

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
- [ ] Add the implemented operation row in `docs/CORE_OPERATIONS.md` and
  `packages/application/src/operation-catalog.ts` during Code Round when the command becomes
  active.

## Implementation

- [ ] Extend core `ResourceBinding` with safe secret reference/version metadata and
  `rotateSecret(...)`.
- [ ] Add application command/schema/handler/use case.
- [ ] Extend repository/read-model ports and testkit memory adapters.
- [ ] Add PG/PGlite migration, repository mapping, and read-model projection.
- [ ] Ensure deployment snapshots preserve captured references after later rotations.

## Entrypoints And Docs

- [ ] Add CLI Resource dependency binding secret rotation command.
- [ ] Add oRPC/HTTP route.
- [ ] Record Web/public-docs migration gap or complete a Docs/Web round.

## Verification

- [ ] Run related core/application tests.
- [ ] Run PG/PGlite dependency binding tests.
- [ ] Run deployment snapshot immutability tests.
- [ ] Run CLI/oRPC/HTTP tests touched by routes.
- [ ] Run operation catalog boundary tests.
- [ ] Run `bun install --frozen-lockfile`.
- [ ] Run `bun run typecheck`.
- [ ] Run `bun run lint`.

## Post-Implementation Sync

- [ ] Reconcile spec, plan, tasks, docs, tests, operation catalog, code, roadmap notes, and public
  docs/help outcome.
