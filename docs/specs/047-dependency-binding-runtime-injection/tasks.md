# Dependency Binding Runtime Injection Tasks

## Spec Round

- [x] Add ADR-040 for dependency binding runtime injection ownership and boundaries.
- [x] Add `spec.md` with scenarios and acceptance criteria.
- [x] Add `plan.md` with package impact and test strategy.
- [x] Update operation map, core operations, workflow notes, roadmap, and test matrices.

## Test-First Round

- [ ] Add failing application tests for `DEP-BIND-RUNTIME-INJECT-001` and
  `DEP-BIND-RUNTIME-INJECT-002`.
- [ ] Add plan-preview tests for `DEP-BIND-RUNTIME-INJECT-003`.
- [ ] Add deployment admission rejection tests for `DEP-BIND-RUNTIME-INJECT-004`.
- [ ] Add historical snapshot/rotation tests for `DEP-BIND-RUNTIME-INJECT-005`.
- [ ] Add runtime adapter redaction tests for `DEP-BIND-RUNTIME-INJECT-006`.
- [ ] Add contract tests for runtime injection `ready | blocked | deferred` schema.

## Code Round

- [ ] Implement dependency runtime-injection materializer in `packages/application`.
- [ ] Extend application ports and contracts for runtime injection readiness.
- [ ] Gate `deployments.create` on active non-injectable bindings.
- [ ] Keep `deployments.plan`, `deployments.create`, and `deployments.show` readiness aligned.
- [ ] Add runtime target capability checks for dependency secret delivery.
- [ ] Implement redacted single-server dependency env delivery.
- [ ] Implement redacted Swarm dependency secret delivery.
- [ ] Persist new deployment snapshot fields if required.
- [ ] Update CLI/oRPC/Web read surfaces only through shared schemas.

## Docs Round

- [ ] Add/update public docs for binding a dependency and deploying with runtime injection.
- [ ] Add stable help anchors for plan/show blocked injection readiness.
- [ ] Confirm CLI/API/Web/future MCP help points to the same anchor.

## Verification

- [ ] Run targeted application tests.
- [ ] Run targeted contracts and PGlite tests.
- [ ] Run targeted runtime adapter tests.
- [ ] Run public docs checks after Docs Round.
- [ ] Run `bun run lint`.
- [ ] Run `bun turbo run typecheck`.
- [ ] Run `git diff --check`.

## Post-Implementation Sync

- [ ] Update `docs/PRODUCT_ROADMAP.md` without checking Phase 7 exit criteria until Postgres and
  Redis closed loops are actually verified.
- [ ] Reconcile `docs/specs/035-dependency-binding-snapshot-reference-baseline/spec.md` migration
  notes after runtime injection Code Round.
