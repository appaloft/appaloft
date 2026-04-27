# environments.rename Command Spec

## Metadata

- Operation key: `environments.rename`
- Command class: `RenameEnvironmentCommand`
- Input schema: `RenameEnvironmentCommandInput`
- Handler: `RenameEnvironmentCommandHandler`
- Use case: `RenameEnvironmentUseCase`
- Domain / bounded context: Workspace / Environment lifecycle
- Current status: active command
- Source classification: normative contract

## Normative Contract

`environments.rename` is the source-of-truth command for changing an environment's display name
inside its owning project.

It is not a generic environment update command. It must not mutate environment variables, kind,
parent environment, resources, deployments, domains, certificates, runtime state, or cleanup state.

```ts
type RenameEnvironmentResult = Result<{ id: string }, DomainError>;
```

The command contract is:

- admission failure returns `err(DomainError)`;
- success returns `ok({ id })`;
- success persists the new environment name;
- success publishes or records `environment-renamed` only when state changes;
- locked and archived environments reject rename through lifecycle guards.

## Global References

- [ADR-026: Aggregate Mutation Command Boundary](../decisions/ADR-026-aggregate-mutation-command-boundary.md)
- [Environment Lifecycle Workflow](../workflows/environment-lifecycle.md)
- [environment-renamed Event Spec](../events/environment-renamed.md)
- [Environment Lifecycle Error Spec](../errors/environments.lifecycle.md)
- [Environment Lifecycle Test Matrix](../testing/environment-lifecycle-test-matrix.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)

## Input Model

```ts
type RenameEnvironmentCommandInput = {
  environmentId: string;
  name: string;
};
```

| Field | Requirement | Meaning |
| --- | --- | --- |
| `environmentId` | Required | Environment being renamed. |
| `name` | Required | New environment display name. |

The environment id is stable and is never changed by rename.

## Admission Flow

The command must:

1. Validate command input.
2. Resolve `environmentId`.
3. Reject missing or invisible environments with `not_found`.
4. Reject locked environments with `environment_locked`.
5. Reject archived environments with `environment_archived`.
6. Normalize the requested environment name.
7. If the normalized name is unchanged, return idempotent `ok({ id })` without a duplicate event.
8. Reject duplicate names inside the same project with `conflict`, phase `environment-admission`.
9. Persist the environment.
10. Publish or record `environment-renamed`.
11. Return `ok({ id })`.

## Error Contract

All errors use [Environment Lifecycle Error Spec](../errors/environments.lifecycle.md).

| Error code | Phase | Retriable | Meaning |
| --- | --- | --- | --- |
| `validation_error` | `command-validation` | No | Input shape or name is invalid. |
| `not_found` | `context-resolution` | No | Environment does not exist or is not visible. |
| `environment_locked` | `environment-lifecycle-guard` | No | Locked environment cannot be renamed. |
| `environment_archived` | `environment-lifecycle-guard` | No | Archived environment cannot be renamed. |
| `conflict` | `environment-admission` | No | Requested environment name is already used in the same project. |
| `infra_error` | `environment-persistence` | Conditional | Rename state could not be safely persisted. |
| `infra_error` | `event-publication` | Conditional | Event publication could not be recorded before command success. |

## Entrypoints

| Entrypoint | Mapping | Status |
| --- | --- | --- |
| Web | Project detail environment lifecycle row dispatches this command for active environments. | Active |
| CLI | `appaloft env rename <environmentId> --name <name>`. | Active |
| oRPC / HTTP | `POST /api/environments/{environmentId}/rename` using the command schema. | Active |
| Automation / MCP | Future command/tool over the same operation key. | Future |

## Current Implementation Notes And Migration Gaps

No migration gaps are recorded for this slice.

## Open Questions

- None.
