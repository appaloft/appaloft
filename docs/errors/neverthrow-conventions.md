# neverthrow Conventions

## Normative Contract

Expected business and application failures must use typed `Result` semantics. They must not be represented by generic thrown exceptions.

The domain and application layers must make success and expected failure explicit:

```ts
type OperationResult<T> = Result<T, DomainError>;
type AsyncOperationResult<T> = Promise<Result<T, DomainError>>;
```

`ResultAsync<T, DomainError>` is allowed when it improves composition, but it must preserve the same error semantics as `Promise<Result<T, DomainError>>`.

## Layer Return Rules

| Layer | Return convention | Throw policy |
| --- | --- | --- |
| Value object factories | `Result<ValueObject, DomainError>` | Do not throw for invalid input. |
| Aggregate behavior | `Result<void | DomainValue, DomainError>` | Do not throw for invariant/state-machine rejection. |
| Domain services | `Result<T, DomainError>` | Do not throw for expected domain failure. |
| Command factories | `Result<Command, DomainError>` | Do not throw for schema/shape failure. |
| Query factories | `Result<Query, DomainError>` when validation is needed | Do not throw for schema/shape failure. |
| Command handlers | `Promise<Result<T, DomainError>>` | Do not throw for expected application failure. |
| Query handlers | `Promise<Result<T, DomainError>>` when query can fail as a contract | Do not mutate state. |
| Application use cases | `Promise<Result<T, DomainError>>` or `ResultAsync<T, DomainError>` | Do not throw for expected orchestration failure. |
| Event handlers | `Promise<Result<void, DomainError>>` | Do not throw for expected consumer failure. |
| Process managers | `Promise<Result<T, DomainError>>` or `ResultAsync<T, DomainError>` | Persist attempt state for post-acceptance failure. |
| Runtime/provider adapters | `Promise<Result<T, DomainError>>` or structured result objects inside `Result` | Convert expected external failures to `DomainError` or typed failure results. |
| Transport adapters | Result unwrapping and mapping | May catch unknown exceptions and convert to transport errors at the boundary. |

Unexpected programmer errors may throw internally, but they must not be used for expected business control flow.

## ResultAsync Usage

`ResultAsync<T, DomainError>` may be used when:

- multiple async `Result` operations are composed with `andThen`, `map`, or `mapErr`;
- adapter exceptions are wrapped at a boundary;
- a process manager composes several async steps and the code stays readable.

`ResultAsync` should not be introduced only for style consistency if local code already uses `Promise<Result<T, DomainError>>` clearly.

Do not mix `throw`, `Promise.reject`, and `err(...)` for the same expected branch.

## Command Handler Convention

Command handlers must:

- receive an already constructed command message;
- delegate to one application use case or command-specific service;
- return the delegated `Result`;
- avoid transport, persistence, provider, UI, and CLI concerns.

Command handlers must not:

- call `container.resolve(...)`;
- catch expected business errors and replace them with generic messages;
- perform background workflow side effects directly.

## Event Handler Convention

Event handlers must:

- return `Promise<Result<void, DomainError>>`;
- be idempotent for duplicate events;
- distinguish event receipt from downstream work success;
- persist state before publishing terminal follow-up events;
- convert expected consumer failure into structured `DomainError` or durable process state.

Event handlers must not:

- throw for missing aggregates or duplicate events when the event spec defines skip/no-op behavior;
- assume event publication means previous consumers succeeded;
- hide retriable worker failure only in logs.

## Process Manager Convention

Process managers own long-running workflow progression after command acceptance.

They must:

- persist attempt ids;
- persist intermediate, terminal, and retryable state;
- publish formal events only after durable state transitions;
- create a new attempt id for retry;
- treat raw replay of an old fact event as duplicate handling, not as retry.

## Adapter Boundary Convention

Runtime, provider, filesystem, process, and network adapters may catch exceptions from underlying libraries or shell/process APIs.

Expected external failures must be converted into:

- `err(DomainError)` when the command/event cannot be accepted or no durable state can be safely recorded; or
- typed failure result values when the workflow can persist terminal or retryable async state.

Adapters must sanitize error details before returning them.

## Async Failure Mapping

| Failure kind | Result convention | State/event convention |
| --- | --- | --- |
| Command admission error | `err(DomainError)` | No accepted state; no success event. |
| Post-acceptance async failure | Original command remains `ok(...)` | Persist failed/retryable state and publish failure event. |
| Retriable async failure | Worker/process returns `ok` after recording retry state, or `err(retryable_error)` if state cannot be recorded | Retry owner and next attempt are explicit. |
| Terminal async failure | Accepted command remains `ok(...)` | Persist terminal failed state and publish terminal failed event. |
| Event consumer failure | Event handler returns `err(DomainError)` or records consumer failure | Monitoring/retry state records consumer failure separately from domain fact. |

## Testing neverthrow Results

Tests must assert result shape and structured error fields:

```ts
expect(result.isErr()).toBe(true);

if (result.isErr()) {
  expect(result.error.code).toBe("validation_error");
  expect(result.error.retryable).toBe(false);
  expect(result.error.details?.phase).toBe("command-validation");
}
```

For post-acceptance async failure, tests must assert accepted command success plus durable failure state:

```md
Then the command result is ok({ id }).
And the process/deployment/server state is failed or not_ready.
And the terminal failure event is emitted.
And retry creates a new attempt id when retriable.
```

Tests must not assert only:

- `toThrow(...)` for expected failure;
- localized `message`;
- CLI stderr text without the stable error code;
- event bus method calls without state and event contract assertions.

## Current Implementation Notes And Migration Gaps

The codebase already centralizes neverthrow exports in core and uses `Result` for many command factories, value object factories, aggregate operations, and application use cases.

Most async application use cases currently expose `Promise<Result<T, DomainError>>`. `ResultAsync` exists in the shared core result module but is not the dominant public application convention.

Some runtime workflows return typed failure result values inside `ok(...)`, such as proxy bootstrap returning `ok({ status: "failed", errorCode })`. That pattern is valid only when the workflow records or can record the failure as state instead of treating it as command admission failure.

Some existing Web/UI code still maps errors through raw message strings. Future UI work should map structured codes and phases to i18n keys.

## Open Questions

- Should `Promise<Result<T, DomainError>>` remain the primary application convention, or should long-running process managers standardize on `ResultAsync<T, DomainError>`?
- Should the project introduce typed per-operation error unions after enough `details.phase` usage stabilizes?
- Should transport adapters expose a common `domainCode` / `phase` shape for all clients?
