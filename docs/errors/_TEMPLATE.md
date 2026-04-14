# Error Spec Template

> Copy this file or sections of it into `docs/errors/error-catalog.md`.
>
> Errors are part of the business contract. Do not rely on message text as the contract.

## Metadata

- Error code:
- Layer: validation / domain / application / infra / integration / async-processing
- Category in current code: user / infra / provider / retryable
- Retriable: yes / no / conditional
- Current status: implemented / proposed / legacy compatibility
- Source classification: current code / recommended target / needs verification

## Meaning

Explain what the error means and which business branch it represents.

## Structure

Current base structure:

```ts
interface DomainError {
  code: string;
  category: "user" | "infra" | "provider" | "retryable";
  message: string;
  retryable: boolean;
  details?: Record<string, string | number | boolean | null>;
}
```

Recommended additional details for async/process work:

```ts
interface RecommendedErrorDetails {
  commandName?: string;
  eventName?: string;
  phase?: string;
  step?: string;
  correlationId?: string;
  causationId?: string;
  relatedEntityId?: string;
  relatedState?: string;
  retryAfter?: string;
}
```

Add fields incrementally through `details` until a stable richer type is justified.

## Producers

| Producer | Location | Sync/async | Notes |
| --- | --- | --- | --- |
| | | | |

## Consumers And Mapping

| Consumer | Mapping | Required behavior |
| --- | --- | --- |
| Web UI | | |
| CLI | | |
| oRPC / HTTP | | |
| Background job logs | | |
| Event consumer monitoring | | |
| Tests | | |

## neverthrow Usage

- Value object factory:
  - Expected validation failure returns `Result<T, DomainError>`.
- Aggregate behavior:
  - Invariant failure returns `Result<void, DomainError>`.
- Command factory:
  - Schema/shape failure returns `Result<Command, DomainError>`.
- Use case:
  - Expected business failure returns `Promise<Result<T, DomainError>>`.
- Adapter:
  - Expected external dependency failure should be converted to `DomainError`.
  - Unexpected programmer/runtime failures may throw inside the adapter boundary, but must not be
    treated as normal business control flow.

## Sync vs Async Semantics

| Timing | Meaning | User visibility | State impact |
| --- | --- | --- | --- |
| Synchronous rejection | command did not accept/perform the action | immediate CLI/API/UI error | usually no domain state change |
| Async failure | command accepted or event occurred, but follow-up work failed | read model/status/log/event | state records failed phase |
| Retriable async failure | follow-up work failed but may be retried | status should say retrying or retryable | retry owner must be explicit |
| Permanent async failure | follow-up work reached terminal failure | status should expose final failure | compensation if any |

## Test Contract

Tests should assert:

- `result.isErr()`
- `result.error.code`
- `result.error.category` or richer type once available
- `result.error.retryable`
- meaningful `details` fields such as `phase`, `step`, `entity`, `id`, or `status`

Tests should not assert only:

- thrown exception text
- translated user-facing message
- generic non-zero exit code without error code

## Open Questions

- 
