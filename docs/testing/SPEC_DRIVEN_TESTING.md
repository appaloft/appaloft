# Spec-Driven Testing Guide

> Analysis date: 2026-04-13.
>
> This complements `docs/TESTING.md`. It explains how command/event/error specs should drive
> future tests.

## Test Layering

| Layer | Primary source | What to assert |
| --- | --- | --- |
| Value object | Domain spec / command input rules | accepted values, normalized values, stable error code |
| Aggregate | Domain/state-machine spec | invariant, state transition, emitted domain events |
| Command factory/schema | Command spec input model | validation errors and parsed command fields |
| Command handler/use case | Command spec main/branch flows | loaded aggregates, persisted state, events, Result error |
| Event handler/process manager | Event/workflow spec | idempotency, state progression, retry/failure behavior |
| Query/read model | Query spec / projection rules | read shape, masking, stale/empty state behavior |
| oRPC/HTTP contract | Command/query spec | route maps to message, error mapping, response schema |
| CLI workflow | Workflow + command spec | input collection, final command payload, stable error code |
| Web workflow | Workflow + command spec | UI gating vs command behavior, no domain rule drift |
| E2E | End-to-end workflow spec | user-visible result, persisted state, logs, progress visibility |

## Command Test Matrix Template

| Case | Given | Command input | Expected Result | Expected state | Expected events | Expected errors |
| --- | --- | --- | --- | --- | --- | --- |
| happy path | | | `ok(...)` | | | |
| validation failure | | | `err(...)` | no mutation | no event | code/category/details |
| not found | | | `err(...)` | no mutation | no event | `not_found` |
| conflict | | | `err(...)` | unchanged | no event | `conflict` or specific code |
| async accepted | | | accepted result | pending state | requested event | none |
| async failure | | | accepted or final failure per spec | failed state | failed event | phase/step error |
| idempotent retry | existing state | same input | stable result | no duplicate effect | no duplicate event or deduped | none |

## Event Flow Test Matrix Template

| Case | Given event | Existing state | Handler action | Expected state | Expected follow-up events | Expected error |
| --- | --- | --- | --- | --- | --- | --- |
| success | | | | | | |
| duplicate event | same event twice | | | unchanged or idempotent | none/deduped | none |
| missing aggregate | aggregate absent | | skip or error per spec | unchanged | none | code if error |
| retriable failure | dependency unavailable | | record retryable failure | retrying/failed | failure event if any | retryable code |
| permanent failure | invalid dependency state | | record terminal failure | failed | failure event if any | non-retryable code |

## Async Workflow Test Matrix Template

| Phase | Trigger | Owner | Sync result | Async state | Failure state | Retry behavior |
| --- | --- | --- | --- | --- | --- | --- |
| request accepted | command | command handler | | | | |
| planned | aggregate/use case | process manager | | | | |
| running | process manager | runtime adapter | | | | |
| verification | runtime adapter | process manager | | | | |
| completed | runtime adapter | aggregate | | | | |
| failed | runtime adapter/event handler | aggregate | | | | |

## Given / When / Then Template

```ts
test("operation: scenario", async () => {
  // Given: named domain state, not implementation trivia.

  // When: dispatch the command/event through the intended boundary.

  // Then: assert Result, state transition, emitted events, and error contract.
});
```

## neverthrow Assertions

Prefer:

```ts
expect(result.isErr()).toBe(true);
if (result.isErr()) {
  expect(result.error.code).toBe("validation_error");
  expect(result.error.retryable).toBe(false);
  expect(result.error.details?.phase).toBe("plan");
}
```

Avoid:

```ts
expect(() => call()).toThrow("some translated message");
expect(stderr).toContain("some prose");
```

Boundary tests may assert CLI stderr or HTTP status, but they should also assert the stable domain
code or mapped `domainCode` when available.

## Naming Convention

- Aggregate rule: `DeploymentStatusValue transitions running deployment to failed on failed execution`
- Command use case: `deployments.create rejects non-terminal latest deployment`
- Event handler: `deployment_target.registered records proxy bootstrap failure without deleting server`
- Workflow: `quick deploy submits CreateDeploymentCommand after creating selected context records`
- E2E: `cli-http deploy flow persists logs and progress visibility`

## Mapping Docs To Tests

For every command/event spec:

- Add a `Tests` section in the spec.
- Link existing tests that already cover the behavior.
- Mark missing tests as `Missing coverage`.
- When a behavior changes, update the spec first or in the same change as tests and code.

## Anti-Patterns

- Testing only that a mocked method was called.
- Treating UI wizard steps as domain invariants.
- Treating event publication as proof of handler success.
- Treating deployment progress stream events as durable domain events.
- Asserting translated message text as the only error contract.
