# GitHub Check-Gated Auto Deploy Test Matrix

## Governing Sources

- [GitHub Check-Gated Auto Deploy](../specs/141-github-check-gated-auto-deploy/spec.md)
- [ADR-121](../decisions/ADR-121-source-event-required-check-gate.md)
- [Source Binding Auto Deploy Test Matrix](./source-binding-auto-deploy-test-matrix.md)

## Coverage

| ID | Layer | Scenario | Expected | Automation | Status |
| --- | --- | --- | --- | --- | --- |
| `CHECK-GATE-POLICY-001` | Core/application/persistence | Configure and reload normalized names. | Exact unique case-sensitive names survive all policy boundaries; invalid/generic policy input rejects. | Core/application/PGlite Resource tests | Passing |
| `CHECK-GATE-ENTRY-001` | Config/CLI/API/Web/SDK | Configure and rehydrate required checks. | Every active entrypoint uses the shared schema and preserves names. | Config, CLI, contract, Web and package typecheck tests | Passing |
| `CHECK-GATE-WEBHOOK-001` | GitHub integration/HTTP | Verified completed check run. | Safe repository, revision, name, conclusion, completion and delivery facts dispatch; signature/raw payload remain transport-only. | GitHub integration and oRPC tests | Passing |
| `CHECK-GATE-WAIT-001` | Application | Push waits for two names. | No deployment until both accepted conclusions exist. | `packages/application/test/source-events.test.ts` | Passing |
| `CHECK-GATE-PASS-001` | Application | `success`, `neutral` and `skipped`. | Each conclusion satisfies its exact required name. | `packages/application/test/source-events.test.ts` | Passing |
| `CHECK-GATE-BLOCK-001` | Application | Failure-like conclusion then successful rerun. | Gate blocks, newer rerun replaces evidence, then exactly one dispatch occurs. | Application + PGlite tests | Passing |
| `CHECK-GATE-ORDER-001` | Application/persistence | Older delivery arrives after newer evidence. | Newer completion remains; no status regression or duplicate dispatch. | Application + PGlite tests | Passing |
| `CHECK-GATE-DEDUPE-001` | Persistence/concurrency | Duplicate/concurrent final deliveries. | Atomic delivery dedupe/claim creates at most one deployment target claim. | PGlite concurrency test | Passing |
| `CHECK-GATE-SUPERSEDE-001` | Application/persistence | New push replaces waiting same Resource/ref. | Old result is superseded and old-SHA checks cannot revive it. | Application tests plus transactional PG implementation | Passing |
| `CHECK-GATE-FANOUT-001` | Application | One push matches immediate and differently gated Resources. | Results progress independently and every Resource dispatches at most once. | `packages/application/test/source-events.test.ts` | Passing |
| `CHECK-GATE-DIAG-001` | Query/Web | List/show waiting/blocked/superseded event. | Safe gate summary is visible without raw webhook/check output. | Application/PGlite/Web tests | Passing |
