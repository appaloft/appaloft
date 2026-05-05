# Tasks: Source Binding And Auto Deploy

## Spec Round

- [x] Locate auto-deploy/source-event behavior in `docs/BUSINESS_OPERATION_MAP.md`.
- [x] Read ADR-024, ADR-025, and ADR-028.
- [x] Create `docs/specs/042-source-binding-auto-deploy/spec.md`.
- [x] Create `docs/specs/042-source-binding-auto-deploy/plan.md`.
- [x] Create `docs/specs/042-source-binding-auto-deploy/tasks.md`.
- [x] Position candidate operations and workflow in `docs/BUSINESS_OPERATION_MAP.md`.
- [x] Add implementation plan and testing matrix placeholders.
- [x] Update `docs/PRODUCT_ROADMAP.md` with Spec Round status.

## Decision Follow-Up

- [x] Decide whether source event ownership/retry semantics require ADR-037 before Code Round.
- [x] Decide whether Resource auto-deploy policy disables or blocks after source binding changes.
- [x] Decide generic signed webhook secret custody and rotation model.
- [x] Decide first Code Round process-state baseline versus Phase 8 outbox/inbox dependency.

## Local Spec Follow-Up

- [x] Add `resources.configure-auto-deploy` command spec.
- [x] Add `source-events.ingest` command spec.
- [x] Add `source-events.list` and `source-events.show` query specs.
- [x] Add source auto-deploy error spec.
- [x] Add public docs/help anchors for setup, signatures, dedupe, ignored events, and recovery.

## Test-First Round

- [x] Add `SRC-AUTO-POLICY-001` Resource policy tests.
- [x] Add `SRC-AUTO-POLICY-002` source-binding guard tests.
- [x] Add `SRC-AUTO-POLICY-003` source-binding drift tests.
- [x] Add inactive `resources.configure-auto-deploy` application and persistence tests.
- [ ] Add `SRC-AUTO-EVENT-001` matching push deployment dispatch tests.
- [x] Add `SRC-AUTO-EVENT-002` dedupe tests.
- [ ] Add `SRC-AUTO-EVENT-003` ignored ref tests.
- [ ] Add `SRC-AUTO-EVENT-004` invalid signature tests.
- [ ] Add `SRC-AUTO-ENTRY-001` CLI/HTTP/Web/schema tests.
- [x] Add `SRC-AUTO-QUERY-001` and `SRC-AUTO-QUERY-002` source event read-model tests.
- [ ] Add `SRC-AUTO-SURFACE-003` public docs/help anchor tests.

## Implementation

- [x] Add Resource auto-deploy policy domain model.
- [x] Add inactive `resources.configure-auto-deploy` command schema, handler, use case, and
  Resource repository persistence.
- [x] Add source event command/query schemas, handlers, use cases, and tokens.
- [ ] Add provider-neutral source event normalization and verification ports.
- [x] Add durable source event dedupe and read models.
- [ ] Dispatch matching events through existing deployment admission semantics.
- [ ] Add CLI, HTTP/oRPC, and Web entrypoints only after tests pass.

## Verification

- [x] Run targeted core/application source auto-deploy tests.
- [x] Run targeted Resource auto-deploy policy persistence tests.
- [x] Run targeted persistence tests.
- [ ] Run targeted CLI/oRPC/HTTP tests.
- [ ] Run targeted Web semantic/browser tests.
- [ ] Run `bun run typecheck`.
- [ ] Run `bun run lint`.
- [ ] Run `git diff --check`.

## Post-Implementation Sync

- [ ] Reconcile ADRs, command/query specs, event specs, error specs, test matrix, public docs,
  operation catalog, `CORE_OPERATIONS.md`, and roadmap notes after Code Round.
