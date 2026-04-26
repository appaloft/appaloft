# environments.unlock Command Spec

## Operation

- Operation key: `environments.unlock`
- Command class: `UnlockEnvironmentCommand`
- Input schema: `UnlockEnvironmentCommandInput`
- Handler: `UnlockEnvironmentCommandHandler`
- Use case: `UnlockEnvironmentUseCase`
- Owner: Workspace / `Environment`

## Normative Contract

`environments.unlock` returns a locked environment to active lifecycle state so it can accept new
environment configuration writes, promotion, resource creation, and deployment admission again.

The command mutates only the `Environment` lifecycle status and clears lock metadata. It must not
mutate resources, deployments, domains, certificates, runtime state, logs, source links, proxy
routes, or audit retention.

The command is synchronous. Success means the lifecycle state is persisted and any resulting domain
event was published/recorded according to the event bus contract.

## Input

```ts
type UnlockEnvironmentCommandInput = {
  environmentId: string;
};
```

Rules:

- `environmentId` is required.

## Result

```ts
type UnlockEnvironmentResult = Result<{ id: string }, DomainError>;
```

## Behavior

- Locked environment:
  - transition lifecycle status to `active`;
  - clear `lockedAt` and `lockReason`;
  - publish `environment-unlocked`;
  - return `ok({ id })`.
- Already active environment:
  - return `ok({ id })`;
  - publish no duplicate event.
- Archived environment:
  - return `environment_archived`;
  - perform no mutation and publish no event.
- Missing environment:
  - return `not_found`.

## Entrypoints

| Surface | Contract |
| --- | --- |
| CLI | `appaloft env unlock <environmentId>` |
| HTTP/oRPC | `POST /api/environments/{environmentId}/unlock` using this command schema. |
| Web | Project detail environment lifecycle controls dispatch this command for locked environments. |
| Repository config | Not applicable. |
| Future MCP/tools | Generated from the operation catalog entry. |

## Errors

All errors use [Environment Lifecycle Error Spec](../errors/environments.lifecycle.md).

| Code | Phase | Retriable | Meaning |
| --- | --- | --- | --- |
| `validation_error` | `command-validation` | No | Input is invalid. |
| `not_found` | `context-resolution` | No | Environment is not visible. |
| `environment_archived` | `environment-lifecycle-guard` | No | Archived environments cannot be unlocked. |
| `invariant_violation` | `environment-lifecycle-guard` | No | Environment lifecycle state cannot transition to active. |
| `infra_error` | `environment-persistence` or `event-publication` | Conditional | Persistence or event publication failed before success could be returned. |

## Tests

Covered by `ENV-LIFE-UNLOCK-*`, `ENV-LIFE-GUARD-*`, and `ENV-LIFE-ENTRY-006` rows in
[Environment Lifecycle Test Matrix](../testing/environment-lifecycle-test-matrix.md).
