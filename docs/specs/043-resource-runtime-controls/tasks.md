# Tasks: Resource Runtime Controls

## Spec Round

- [x] Locate restart/stop/start behavior in `docs/BUSINESS_OPERATION_MAP.md`.
- [x] Read ADR-012, ADR-018, ADR-023, and ADR-028.
- [x] Add ADR-038 for runtime-control ownership and state semantics.
- [x] Create `docs/specs/043-resource-runtime-controls/spec.md`.
- [x] Create `docs/specs/043-resource-runtime-controls/plan.md`.
- [x] Create `docs/specs/043-resource-runtime-controls/tasks.md`.
- [x] Position candidate operations in `docs/BUSINESS_OPERATION_MAP.md`.
- [x] Add implementation plan and testing matrix placeholders.
- [x] Update `docs/PRODUCT_ROADMAP.md` with Spec Round status.

## Local Spec Follow-Up

- [x] Add `resources.runtime.stop` command spec.
- [x] Add `resources.runtime.start` command spec.
- [x] Add `resources.runtime.restart` command spec.
- [x] Add runtime-control error spec.
- [x] Decide whether runtime-control readback belongs in `resources.show`, `resources.health`, or a
  new query. First slice uses `resources.health.latestRuntimeControl`.
- [x] Add public docs/help anchors for runtime controls, blocked start, and restart versus redeploy.

## Test-First Round

- [x] Bind `RUNTIME-CTRL-STOP-001` to command/use-case tests.
- [ ] Bind `RUNTIME-CTRL-STOP-001` to real adapter tests.
- [x] Bind `RUNTIME-CTRL-START-001` to retained runtime metadata command/use-case tests.
- [ ] Bind `RUNTIME-CTRL-START-001` to real adapter tests.
- [x] Bind `RUNTIME-CTRL-RESTART-001` to stop/start phase command/use-case tests.
- [ ] Bind `RUNTIME-CTRL-RESTART-001` to real adapter tests.
- [x] Bind `RUNTIME-CTRL-BLOCK-001` to missing/stale runtime metadata tests.
- [x] Bind `RUNTIME-CTRL-COORD-001` to `resource-runtime` coordination tests.
- [x] Bind `RUNTIME-CTRL-READ-001` to `resources.health.latestRuntimeControl` readback tests.
- [x] Bind `RUNTIME-CTRL-DOCS-001` to public docs/help anchor checks.
- [ ] Bind `RUNTIME-CTRL-SURFACE-001` to CLI/HTTP/Web/docs coverage.

## Implementation

- [x] Add runtime-control command schemas, handlers, use cases, and tokens.
- [x] Add provider-neutral runtime target control port.
- [x] Add runtime-control attempt recorder port.
- [ ] Add durable runtime-control attempt/read model persistence.
- [ ] Implement local/generic-SSH Docker and Compose runtime-control adapters.
- [ ] Add CLI, HTTP/oRPC, and Web entrypoints only after tests pass.
- [ ] Update `CORE_OPERATIONS.md` and `operation-catalog.ts` in the activation commit.

## Verification

- [x] Run targeted runtime-control tests.
- [ ] Run targeted CLI/oRPC/HTTP tests.
- [ ] Run targeted Web semantic/browser tests.
- [x] Run `bun run typecheck`.
- [x] Run `bun run lint`.
- [x] Run `git diff --check`.

## Post-Implementation Sync

- [ ] Reconcile ADR, command specs, error specs, test matrix, public docs, operation catalog,
  `CORE_OPERATIONS.md`, roadmap notes, and release notes after Code Round.
