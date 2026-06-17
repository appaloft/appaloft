# Tasks: Environment Profile Duplication

## Phase 0: Source Of Truth

- [x] ENV-PROFILE-DUP-001..010: create governing feature spec with scenarios.
- [x] Add ADR-085 for the profile duplication boundary.
- [x] Add environment profile duplication test matrix.
- [x] Update Core Operations with planned profile operations and clone compatibility wording.

## Phase 1: Safe Read Models

- [x] ENV-PROFILE-DUP-001: add `environments.plan-duplicate` operation catalog entry, query,
  schema, handler, query service, CLI/API contract tests, and docs.
- [x] ENV-PROFILE-DUP-008: add `environments.diff-profile` operation catalog entry, query,
  schema, handler, query service, CLI dispatch test, and docs for safe profile drift.
- [x] ENV-PROFILE-DUP-001 / ENV-PROFILE-DUP-008: fix or verify implemented environment
  profile views mask secret values.
- [x] Update public docs for Duplicate Environment plan and Profile Diff read models.

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
- [x] ENV-PROFILE-DUP-006: classify source custom domain routes in duplicate plan and persist
  deferred target route decisions during apply without copying production domains.
- [x] ENV-PROFILE-DUP-007: classify source storage volume attachments in duplicate plan and
  persist deferred target storage decisions during apply without copying source volume data.
- [x] Expose `environments.plan-duplicate` and `environments.duplicate-profile` through public
  HTTP/oRPC routes with product-session-gated dispatch tests.
- [ ] Add Web staged apply surface for `environments.duplicate-profile`.
- [ ] Persist or project shared-source warning for deployment readiness, audit, and Web surfaces.

## Phase 3: Sync And Promote

- [x] ENV-PROFILE-DUP-008: extend diff-profile to resource/source/runtime/network/dependency/route
  shape, storage mounts, and pending target decisions.
- [x] ENV-PROFILE-DUP-009: implement selected resource-shape sync with staged dependency, route,
  storage, and unsupported resource-profile decisions.
- [x] Expose `environments.diff-profile` and `environments.sync-profile` through public HTTP/oRPC
  routes with product-session-gated dispatch tests.
- [ ] Define whether profile promotion is a separate command or a constrained sync mode.
- [ ] Add Web owner-scoped controls under Project Environment management and Resource detail.

## Phase 4: Preview Integration

- [x] ENV-PROFILE-DUP-011: connect product-grade preview policy to an Environment Profile base without replacing
  existing preview environment lifecycle.
- [x] ENV-PROFILE-DUP-011: ensure fork previews cannot resolve secret-backed decisions unless policy explicitly allows
  safe no-secret previews.
- [x] ENV-PROFILE-DUP-011: ensure preview cleanup remains scoped to preview-owned runtime/route/source-link
  state by keeping the base profile id out of `deployments.create` and cleanup dispatch payloads.

## Verification

- [x] Run focused unit/contract tests for each implemented phase.
- [ ] Run source-truth sync checks after operation catalog/doc changes.
- [x] Run CLI help/SDK descriptor verification after new operations are cataloged for Phase 9.

## Post-Implementation Sync

- [x] Keep `spec.md`, `plan.md`, `tasks.md`, ADR, Core Operations, test matrix, public docs,
  operation catalog, and code aligned after each phase commit.
