# Tasks: Environment Profile Duplication

## Phase 0: Source Of Truth

- [x] ENV-PROFILE-DUP-001..010: create governing feature spec with scenarios.
- [x] Add ADR-085 for the profile duplication boundary.
- [x] Add environment profile duplication test matrix.
- [x] Update Core Operations with planned profile operations and clone compatibility wording.

## Phase 1: Safe Read Models

- [x] ENV-PROFILE-DUP-001: add `environments.plan-duplicate` operation catalog entry, query,
  schema, handler, query service, CLI/API contract tests, and docs.
- [ ] ENV-PROFILE-DUP-008: add `environments.diff-profile` operation catalog entry, query,
  schema, handler, query service, CLI/API contract tests, and docs.
- [ ] ENV-PROFILE-DUP-001 / ENV-PROFILE-DUP-008: fix or verify all environment diff/profile views
  mask secret values.
- [ ] Update public docs for Duplicate Environment plan and Profile Diff read models.

## Phase 2: Duplicate Apply

- [x] Add first `environments.duplicate-profile` apply slice: require reviewed dependency
  decisions before mutation, dispatch `environments.clone`, dispatch `resources.create` for copied
  resource shape, and return deferred decisions for unsupported profile parts.
- [x] ENV-PROFILE-DUP-002: dispatch public neutral `ProvisionDependencyResourceCommand` for
  reviewed `create-new-managed` dependency decisions.
- [x] ENV-PROFILE-DUP-003: implement `reuse-source` binding with explicit acknowledgement and
  shared-source warning readback.
- [x] ENV-PROFILE-DUP-004: validate reviewed `bind-existing` dependency ids and dispatch public
  neutral `BindResourceDependencyCommand` for copied resource bindings.
- [x] ENV-PROFILE-DUP-005: persist/project unresolved dependency binding decisions, surface them
  in `deployments.plan`, and block `deployments.create` before runtime/provider side effects.
- [ ] ENV-PROFILE-DUP-006 / ENV-PROFILE-DUP-007: implement route regeneration/defer and storage
  requirement decisions.
- [ ] Add Web staged apply surface for `environments.duplicate-profile`.
- [ ] Persist or project shared-source warning for deployment readiness, audit, and Web surfaces.

## Phase 3: Sync And Promote

- [ ] ENV-PROFILE-DUP-008: extend diff-profile to resource/source/runtime/network/dependency/route
  shape.
- [ ] ENV-PROFILE-DUP-009: implement selected sync with staged decisions.
- [ ] Define whether profile promotion is a separate command or a constrained sync mode.
- [ ] Add Web owner-scoped controls under Project Environment management and Resource detail.

## Phase 4: Preview Integration

- [ ] Connect product-grade preview policy to an Environment Profile base without replacing
  existing preview environment lifecycle.
- [ ] Ensure fork previews cannot resolve secret-backed decisions unless policy explicitly allows
  safe no-secret previews.
- [ ] Ensure preview cleanup removes only preview-owned runtime/dependency/route/source-link state.

## Verification

- [x] Run focused unit/contract tests for each implemented phase.
- [ ] Run source-truth sync checks after operation catalog/doc changes.
- [ ] Run CLI help/SDK descriptor verification after new operations are cataloged.

## Post-Implementation Sync

- [x] Keep `spec.md`, `plan.md`, `tasks.md`, ADR, Core Operations, test matrix, public docs,
  operation catalog, and code aligned after each phase commit.
