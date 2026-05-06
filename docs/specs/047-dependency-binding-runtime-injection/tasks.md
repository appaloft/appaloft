# Dependency Binding Runtime Injection Tasks

## Spec Round

- [x] Add ADR-040 for dependency binding runtime injection ownership and boundaries.
- [x] Add `spec.md` with scenarios and acceptance criteria.
- [x] Add `plan.md` with package impact and test strategy.
- [x] Update operation map, core operations, workflow notes, roadmap, and test matrices.

## Test-First Round

- [x] Add failing application tests for `DEP-BIND-RUNTIME-INJECT-001` and
  `DEP-BIND-RUNTIME-INJECT-002`.
- [x] Add plan-preview tests for `DEP-BIND-RUNTIME-INJECT-003`.
- [x] Add deployment admission rejection tests for `DEP-BIND-RUNTIME-INJECT-004`.
- [x] Add historical snapshot/rotation tests for `DEP-BIND-RUNTIME-INJECT-005`.
- [x] Add runtime adapter redaction tests for `DEP-BIND-RUNTIME-INJECT-006`.
- [x] Add contract tests for runtime injection `ready | blocked | not-applicable` schema.

## Code Round

- [x] Implement dependency runtime-injection materializer in `packages/application`.
- [x] Extend application ports and contracts for runtime injection readiness.
- [x] Gate `deployments.create` on active non-injectable bindings.
- [x] Keep `deployments.plan`, `deployments.create`, and `deployments.show` readiness aligned.
- [x] Add runtime target capability checks for dependency secret delivery.
- [x] Implement redacted single-server dependency env delivery of safe secret handles.
- [x] Implement redacted Swarm dependency secret delivery of safe secret handles.
- [x] Persist new deployment snapshot fields if required.
- [x] Confirm CLI/oRPC/Web read surfaces use shared schemas; no transport-only shapes changed.

## Docs Round

- [x] Add/update public docs for binding a dependency and deploying with runtime injection.
- [x] Add stable help anchors for plan/show blocked injection readiness.
- [x] Confirm CLI/API/Web/future MCP help points to the same anchor.

## Verification

- [x] Run targeted application tests.
- [x] Run targeted contracts and PGlite tests.
- [x] Run targeted runtime adapter tests.
- [x] Run public docs checks after Docs Round.
- [x] Run `bun run lint`.
- [x] Run `bun turbo run typecheck`.
- [x] Run `git diff --check`.

## Post-Implementation Sync

- [x] Update `docs/PRODUCT_ROADMAP.md` without checking Phase 7 exit criteria until Postgres and
  Redis closed loops are actually verified.
- [x] Reconcile `docs/specs/035-dependency-binding-snapshot-reference-baseline/spec.md` migration
  notes after runtime injection Code Round.
