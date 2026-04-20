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

## Test Case IDs And Automation Priority

Behavior test matrices must use stable test case ids for every matrix row that represents a required
behavior assertion. Summary tables such as `Test Layers` or reference lists do not need ids.

Use an id format that stays readable inside test names:

- command admission: `<OPERATION>-ADM-###`
- workflow or guided entry flow: `<OPERATION>-WF-###`
- async progression: `<OPERATION>-ASYNC-###`
- event handling: `<OPERATION>-EVT-###`
- read/query behavior: `<OPERATION>-QRY-###`
- entrypoint behavior: `<OPERATION>-ENTRY-###`

Examples: `DEP-CREATE-ADM-001`, `QUICK-DEPLOY-WF-001`, `RES-CREATE-ENTRY-001`.

Each matrix row must also declare the preferred automation level:

- `e2e-preferred`: execute the real CLI command or HTTP/oRPC API against a composed runtime when
  the behavior crosses an entrypoint, command/query dispatch, persistence/read model, workflow, or
  observable user result. Browser automation is optional unless the Web workflow itself is the
  behavior under test.
- `integration`: exercise the command/query bus, use case, process manager, persistence adapter, or
  transport contract without a full external runtime.
- `unit`: exercise value objects, aggregates, pure planners, normalizers, renderers, and other
  deterministic boundaries.
- `contract`: assert route/schema/error mapping for API/oRPC, CLI serialization, or provider port
  contracts.

Prefer the highest useful executable chain first. For deployment and workflow behaviors, that is
usually a CLI or HTTP/oRPC e2e test that proves the command or workflow can be executed end to end
and observed through a read/query surface. Add integration and unit tests underneath it for branch
coverage, rare failures, pure domain rules, and fast diagnostics.

## Assertion Visibility Classification

The `Preferred automation` column is the required test category for the row. Choose it by the
strongest boundary that can actually observe the assertion:

- use `e2e-preferred` only when the assertion can be proven through a real user-facing chain such
  as CLI, HTTP/oRPC, Web, and a public read/query surface;
- use `integration` when the assertion needs command/query bus behavior, repository state, emitted
  domain events, read-model projection internals, process-manager state, or adapter behavior that
  the external entrypoint cannot observe directly;
- use `unit` when the assertion is a pure domain/value-object/planner/normalizer rule with no
  meaningful entrypoint chain;
- use `contract` when the assertion is about schema, route, serialization, provider port, or error
  mapping compatibility.

Do not mark a row `e2e-preferred` just because the broader scenario is user-facing. If an e2e can
only prove "the user created a server and can list it", but cannot prove "the repository stored
edgeProxy.status = disabled" or "the handler called a specific method", split those into separate
rows: an `e2e-preferred` row for the observable user chain and an `integration`, `unit`, or
`contract` row for the internal assertion.

## First-Class Operation Test Placement

Every operation catalog entry is a first-class behavior for testing. New or changed tests for an
explicit operation must live in operation-named test files instead of generic smoke files.

Examples:

- `servers.register` CLI/HTTP e2e coverage belongs in `server-register.command.e2e.ts`, not in a
  broad CLI/HTTP smoke suite;
- Quick Deploy workflow coverage belongs in `quick-deploy-*.workflow.e2e.ts`;
- command/application coverage for `servers.register` belongs in a register-server command test,
  not only as setup inside proxy or deployment tests.

Generic smoke suites may still prove broad system wiring, but they do not satisfy new first-class
operation coverage by themselves. If an operation has separate command, CLI, HTTP/oRPC, Web, or MCP
entrypoints, the matrix should split those boundaries into separate rows when each boundary has
distinct behavior or transport mapping to verify.

## Aggregate Mutation Command Naming

Mutation tests must follow
[ADR-026: Aggregate Mutation Command Boundary](../decisions/ADR-026-aggregate-mutation-command-boundary.md).

Do not add test matrices or automated tests for generic aggregate-root operations such as
`projects.update`, `servers.update`, `resources.update`, `{aggregate}.patch`, or
`Update{Aggregate}Command`. If a behavior changes several fields, split the matrix into rows for
the specific domain commands or specify a workflow that sequences those commands.

Every new aggregate mutation matrix should include at least one entrypoint or contract row proving
that the public surface does not expose a generic update command when that risk exists.

## Test Name Binding

Automated tests that implement a behavior matrix row must include the matrix id in the test name.
Use the bracketed id at the start of the test name:

```ts
test("[QUICK-DEPLOY-WF-001] accepts an existing-context quick deploy through the CLI", async () => {
  // ...
});
```

One matrix row must map to at least one automated test with the same id in its name before the row
can be considered covered. Prefer one primary matrix id per test. If an executable e2e test proves a
broad chain while lower-level tests cover branches, keep the e2e test id tied to the matrix row it
primarily proves and use additional numbered tests for branch-specific matrix rows.

When a Code Round changes a behavior matrix, Post-Implementation Sync must report any new or changed
matrix id that lacks a matching automated test name as missing coverage. Existing unnumbered tests
are migration gaps until they are renamed or linked by adding the matching matrix id.

## Test-First Change Flow

Every new feature, behavior change, command change, workflow change, or entrypoint behavior change
must update an existing `docs/testing/*-test-matrix.md` file or add a new one before the behavior is
considered specified enough for implementation.

When implementation work is in scope, add or update the automated tests for the changed matrix ids
before or in the same change as business code. A test-first change may intentionally introduce a
failing test before the Code Round implements the behavior. In that case:

- the test name must still include the matrix id;
- the failure must express the intended business behavior, not an incidental implementation detail;
- the final output must call out the failing matrix ids and the implementation work expected to make
  them pass;
- the behavior must remain `not aligned` until the tests pass or the matrix is revised by Spec Round.

Code Round may use those failing tests as the executable target for the implementation, then update
or split tests only when the test itself was wrong about the governing spec.

## Command Test Matrix Template

| Test ID | Preferred automation | Case | Given | Command input | Expected Result | Expected state | Expected events | Expected errors |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `<OP>-ADM-001` | e2e-preferred or integration | happy path | | | `ok(...)` | | | |
| `<OP>-ADM-002` | integration | validation failure | | | `err(...)` | no mutation | no event | code/category/details |
| `<OP>-ADM-003` | integration | not found | | | `err(...)` | no mutation | no event | `not_found` |
| `<OP>-ADM-004` | integration | conflict | | | `err(...)` | unchanged | no event | `conflict` or specific code |
| `<OP>-ASYNC-001` | e2e-preferred or integration | async accepted | | | accepted result | pending state | requested event | none |
| `<OP>-ASYNC-002` | integration | async failure | | | accepted or final failure per spec | failed state | failed event | phase/step error |
| `<OP>-ASYNC-003` | integration | idempotent retry | existing state | same input | stable result | no duplicate effect | no duplicate event or deduped | none |

## Event Flow Test Matrix Template

| Test ID | Preferred automation | Case | Given event | Existing state | Handler action | Expected state | Expected follow-up events | Expected error |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `<OP>-EVT-001` | integration | success | | | | | | |
| `<OP>-EVT-002` | integration | duplicate event | same event twice | | | unchanged or idempotent | none/deduped | none |
| `<OP>-EVT-003` | integration | missing aggregate | aggregate absent | | skip or error per spec | unchanged | none | code if error |
| `<OP>-EVT-004` | integration | retriable failure | dependency unavailable | | record retryable failure | retrying/failed | failure event if any | retryable code |
| `<OP>-EVT-005` | integration | permanent failure | invalid dependency state | | record terminal failure | failed | failure event if any | non-retryable code |

## Async Workflow Test Matrix Template

| Test ID | Preferred automation | Phase | Trigger | Owner | Sync result | Async state | Failure state | Retry behavior |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `<OP>-ASYNC-001` | e2e-preferred or integration | request accepted | command | command handler | | | | |
| `<OP>-ASYNC-002` | integration | planned | aggregate/use case | process manager | | | | |
| `<OP>-ASYNC-003` | integration | running | process manager | runtime adapter | | | | |
| `<OP>-ASYNC-004` | e2e-preferred or integration | verification | runtime adapter | process manager | | | | |
| `<OP>-ASYNC-005` | e2e-preferred or integration | completed | runtime adapter | aggregate | | | | |
| `<OP>-ASYNC-006` | integration | failed | runtime adapter/event handler | aggregate | | | | |

## Given / When / Then Template

```ts
test("[OP-ADM-001] operation: scenario", async () => {
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

- Aggregate rule: `[DEP-CREATE-ASYNC-006] DeploymentStatusValue transitions running deployment to failed on failed execution`
- Command use case: `[DEP-CREATE-ADM-021] deployments.create rejects non-terminal latest deployment`
- Event handler: `[SERVER-BOOTSTRAP-EVT-002] deployment_target.registered records proxy bootstrap failure without deleting server`
- Workflow: `[QUICK-DEPLOY-WF-001] quick deploy submits CreateDeploymentCommand after creating selected context records`
- E2E: `[QUICK-DEPLOY-WF-001] cli quick deploy persists deployment and progress visibility`

## Mapping Docs To Tests

For every command/event spec:

- Add a `Tests` section in the spec.
- Link existing tests that already cover the behavior.
- Mark missing tests as `Missing coverage`.
- Use the matrix ids from the governing `docs/testing/**` file when naming or linking tests.
- Keep matrix ids stable when wording changes; allocate a new id when a materially new behavior row is added.
- When a behavior changes, update the spec first or in the same change as tests and code.

## Anti-Patterns

- Testing only that a mocked method was called.
- Treating UI wizard steps as domain invariants.
- Treating event publication as proof of handler success.
- Treating deployment progress stream events as durable domain events.
- Asserting translated message text as the only error contract.
