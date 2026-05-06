# Dependency Runtime Secret Value Resolution Tasks

## Spec Round

- [x] Add ADR-041 for dependency runtime secret value storage and resolution ownership.
- [x] Add `spec.md` with scenarios and acceptance criteria.
- [x] Add `plan.md` with package impact and test strategy.
- [x] Update operation map, core operations, workflow notes, roadmap, and test matrices.

## Test-First Round

- [x] Add failing import tests for `DEP-BIND-SECRET-RESOLVE-001` and
  `DEP-BIND-SECRET-RESOLVE-002`.
- [x] Add provider-managed Postgres reference validation tests for
  `DEP-BIND-SECRET-RESOLVE-003`.
- [x] Add deployment plan/create blocked-resolution tests for `DEP-BIND-SECRET-RESOLVE-004`.
- [x] Add runtime adapter tests for single-server resolution and redaction
  `DEP-BIND-SECRET-RESOLVE-005`.
- [x] Add Swarm secret materialization tests for `DEP-BIND-SECRET-RESOLVE-006`.
- [ ] Add historical rotation resolution tests for `DEP-BIND-SECRET-RESOLVE-007`.

## Code Round

- [x] Add dependency secret-value storage and runtime resolver ports in `packages/application`.
- [x] Store imported Postgres connection URLs through the dependency secret-value store.
- [x] Store imported Redis connection URLs through the dependency secret-value store.
- [x] Validate managed Postgres realization refs before marking binding readiness ready.
- [x] Block deployment plan/create on unresolved Appaloft-owned dependency secret refs.
- [x] Add PG/PGlite persistence for dependency secret values and resolver lookup.
- [x] Inject resolved values through local-shell/generic-SSH single-server execution.
- [x] Create/update Docker Swarm secrets from resolved dependency values.
- [ ] Preserve historical rotated refs needed by retry/redeploy/rollback candidates.
- [ ] Keep CLI/oRPC/Web surfaces schema-reused and secret-safe.

## Docs Round

- [x] Confirm existing dependency runtime injection docs still explain the user-visible behavior.
- [x] Update public docs only if Code Round changes setup, blocked reasons, or recovery steps.

## Verification

- [x] Run targeted application tests.
- [x] Run targeted PGlite persistence tests.
- [x] Run targeted runtime adapter tests.
- [x] Run contracts/docs tests if reason-code or help output changes.
- [x] Run `bun run lint`.
- [x] Run `bun turbo run typecheck`.
- [x] Run `git diff --check`.

## Post-Implementation Sync

- [ ] Update `docs/PRODUCT_ROADMAP.md` only after Postgres and Redis closed loops are actually
  verified.
- [ ] Reconcile migration notes in dependency workflow and runtime injection specs after Code Round.
