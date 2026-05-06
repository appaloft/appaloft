# Dependency Runtime Secret Value Resolution Tasks

## Spec Round

- [x] Add ADR-041 for dependency runtime secret value storage and resolution ownership.
- [x] Add `spec.md` with scenarios and acceptance criteria.
- [x] Add `plan.md` with package impact and test strategy.
- [x] Update operation map, core operations, workflow notes, roadmap, and test matrices.

## Test-First Round

- [ ] Add failing import tests for `DEP-BIND-SECRET-RESOLVE-001` and
  `DEP-BIND-SECRET-RESOLVE-002`.
- [ ] Add provider-managed Postgres reference validation tests for
  `DEP-BIND-SECRET-RESOLVE-003`.
- [ ] Add deployment plan/create blocked-resolution tests for `DEP-BIND-SECRET-RESOLVE-004`.
- [ ] Add runtime adapter tests for single-server resolution and redaction
  `DEP-BIND-SECRET-RESOLVE-005`.
- [ ] Add Swarm secret materialization tests for `DEP-BIND-SECRET-RESOLVE-006`.
- [ ] Add historical rotation resolution tests for `DEP-BIND-SECRET-RESOLVE-007`.

## Code Round

- [ ] Add dependency secret-value storage and runtime resolver ports in `packages/application`.
- [ ] Store imported Postgres connection URLs through the dependency secret-value store.
- [ ] Store imported Redis connection URLs through the dependency secret-value store.
- [ ] Validate managed Postgres realization refs before marking binding readiness ready.
- [ ] Block deployment plan/create on unresolved Appaloft-owned dependency secret refs.
- [ ] Add PG/PGlite persistence for dependency secret values and resolver lookup.
- [ ] Inject resolved values through local-shell/generic-SSH single-server execution.
- [ ] Create/update Docker Swarm secrets from resolved dependency values.
- [ ] Preserve historical rotated refs needed by retry/redeploy/rollback candidates.
- [ ] Keep CLI/oRPC/Web surfaces schema-reused and secret-safe.

## Docs Round

- [ ] Confirm existing dependency runtime injection docs still explain the user-visible behavior.
- [ ] Update public docs only if Code Round changes setup, blocked reasons, or recovery steps.

## Verification

- [ ] Run targeted application tests.
- [ ] Run targeted PGlite persistence tests.
- [ ] Run targeted runtime adapter tests.
- [ ] Run contracts/docs tests if reason-code or help output changes.
- [ ] Run `bun run lint`.
- [ ] Run `bun turbo run typecheck`.
- [ ] Run `git diff --check`.

## Post-Implementation Sync

- [ ] Update `docs/PRODUCT_ROADMAP.md` only after Postgres and Redis closed loops are actually
  verified.
- [ ] Reconcile migration notes in dependency workflow and runtime injection specs after Code Round.
