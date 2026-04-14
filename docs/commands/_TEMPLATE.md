# Command Spec Template

> Copy this file to `docs/commands/<operation-key>.md`.
>
> A command spec is a business contract. It is not a page description, CLI help text, or
> implementation note.

## Metadata

- Operation key:
- Command class:
- Input schema:
- Handler:
- Use case or application service:
- Domain / bounded context:
- Current status: implemented / partial / proposed / legacy compatibility
- Source classification: current code / recommended target / needs verification

## Purpose

State the user/business intent in one or two sentences.

## Domain Semantics

- Aggregate roots involved:
- Entities/value objects involved:
- Invariants protected:
- State machine transitions:
- Consistency boundary:

## Entrypoints

| Entrypoint | Mapping | Notes |
| --- | --- | --- |
| Web | | |
| CLI | | |
| oRPC / HTTP | | |
| Automation / MCP | | |

Entrypoints may collect input differently, but they must not redefine the business meaning of this
command.

## Input Model

| Field | Required | Conditional rules | Domain meaning | Validation source |
| --- | --- | --- | --- | --- |
| | | | | |

## Preconditions

- Required existing aggregates:
- Required external capabilities:
- Authorization/policy rules:
- Idempotency/dedupe requirements:

## Main Flow

1. Validate command input.
2. Load required aggregates.
3. Apply domain behavior.
4. Persist aggregate changes.
5. Publish domain/application events.
6. Return command result.

Replace this with the actual flow for the command.

## Branches

| Branch | Condition | Behavior | Events | Result |
| --- | --- | --- | --- | --- |
| | | | | |

## Sync vs Async Behavior

| Step | Sync or async | Owner | State before | State after | Failure visibility |
| --- | --- | --- | --- | --- | --- |
| | | | | | |

Explicitly state whether command success means:

- the business change is fully complete
- the request is accepted and background work is pending
- a plan was created but execution has not started
- an operational action was requested but may fail later

## Events

| Event | Type | Publisher | Consumer | Required? |
| --- | --- | --- | --- | --- |
| | domain/application/integration/technical | | | |

## Result

Success shape:

```ts
type CommandResult = unknown;
```

Failure shape:

```ts
type CommandFailure = DomainError;
```

## Error Contract

| Code | Layer | Sync/async | Retriable | Phase/step | Meaning | Consumer behavior |
| --- | --- | --- | --- | --- | --- | --- |
| | validation/domain/application/infra/integration/async | | | | | |

Do not use message text as the test contract. Tests should assert code, category/type, phase, and
important details.

## neverthrow Contract

- Command factory returns: `Result<Command, DomainError>`
- Handler returns: `Promise<Result<ResultShape, DomainError>>`
- Use case/application service returns: `Promise<Result<ResultShape, DomainError>>`
- Expected business failures must return `err(...)`.
- Adapter/runtime exceptions may be caught at boundaries and converted to `DomainError`.

## Workflow Relationship

- UI input collection:
- CLI interactive collection:
- API strict input behavior:
- Future automation/MCP behavior:

Input collection flows belong in workflow specs, not in this command spec, except for the final
command payload they produce.

## Related Commands / Events / Process Managers

- Related commands:
- Related events:
- Process manager or saga involvement:
- Projection/read-model impact:

## Tests

| Test layer | Required scenarios |
| --- | --- |
| Value object / schema | |
| Aggregate | |
| Command handler / use case | |
| Event handler / async flow | |
| API/oRPC contract | |
| CLI | |
| Web workflow | |
| E2E | |

## Idempotency, Retry, Recovery

- Idempotency key or natural dedupe key:
- Retry policy:
- Recovery procedure:
- Duplicate event/command behavior:
- State exposed to user after failure:

## Open Questions

- 
