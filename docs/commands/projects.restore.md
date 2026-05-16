# projects.restore Command Spec

## Metadata

- Operation key: `projects.restore`
- Command class: `RestoreProjectCommand`
- Input schema: `RestoreProjectCommandInput`
- Handler: `RestoreProjectCommandHandler`
- Use case: `RestoreProjectUseCase`
- Domain / bounded context: Workspace / Project lifecycle
- Current status: active command
- Source classification: normative contract

## Normative Contract

`projects.restore` is the source-of-truth command for returning an archived project to active
project-scoped admission.

Command success means the project lifecycle status is durably `active`.

```ts
type RestoreProjectResult = Result<{ id: string }, DomainError>;
```

The command contract is:

- admission failure returns `err(DomainError)`;
- success returns `ok({ id })`;
- success clears archive metadata and persists active lifecycle status;
- success publishes or records `project-restored` only when state changes;
- active projects are idempotent for this command.

## Global References

This command inherits:

- [ADR-013: Project Resource Navigation And Deployment Ownership](../decisions/ADR-013-project-resource-navigation-and-deployment-ownership.md)
- [ADR-026: Aggregate Mutation Command Boundary](../decisions/ADR-026-aggregate-mutation-command-boundary.md)
- [projects.show Query Spec](../queries/projects.show.md)
- [project-restored Event Spec](../events/project-restored.md)
- [Project Lifecycle Workflow](../workflows/project-lifecycle.md)
- [Project Lifecycle Error Spec](../errors/projects.lifecycle.md)
- [Project Lifecycle Test Matrix](../testing/project-lifecycle-test-matrix.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)

## Input Model

```ts
type RestoreProjectCommandInput = {
  projectId: string;
};
```

| Field | Requirement | Meaning |
| --- | --- | --- |
| `projectId` | Required | Archived project being restored. |

## Lifecycle Rules

An archived project can transition back to `active`. Restoring a project removes `archivedAt` and
`archiveReason`, then allows future project-scoped child creation and deployment admission to use the
normal child-operation guards.

Restoring a project does not restore deleted child resources, create resources or environments,
create deployments, mutate historical deployment snapshots, re-run failed deployments, change source
links, domains, certificates, logs, audit retention, or runtime state.

Already active projects are idempotent for this command: the command returns `ok({ id })`, does not
publish a duplicate `project-restored` event, and does not mutate child state.

Guarded project delete remains a separate operation and is not implied by restore.

## Admission Flow

The command must:

1. Validate command input.
2. Resolve `projectId`.
3. Reject missing or invisible project with `not_found`.
4. Treat an already active project as idempotent success.
5. Capture restore time through the injected clock.
6. Persist active lifecycle status and cleared archive metadata.
7. Publish or record `project-restored` when the state changes.
8. Return `ok({ id })`.

## Error Contract

All errors use [Project Lifecycle Error Spec](../errors/projects.lifecycle.md).

| Error code | Phase | Retriable | Meaning |
| --- | --- | --- | --- |
| `validation_error` | `command-validation` | No | `projectId` shape is invalid. |
| `not_found` | `context-resolution` | No | Project does not exist or is not visible. |
| `invariant_violation` | `project-lifecycle-guard` | No | Project lifecycle state cannot transition to active. |
| `infra_error` | `project-persistence` | Conditional | Restore state could not be safely persisted. |
| `infra_error` | `event-publication` | Conditional | Event publication could not be recorded before command success. |

## Entrypoints

| Entrypoint | Mapping | Status |
| --- | --- | --- |
| Web | Archived project settings/lifecycle action dispatches this command after confirmation. | Active |
| CLI | `appaloft project restore <projectId>`. | Active |
| oRPC / HTTP | `POST /api/projects/{projectId}/restore` using the command schema. | Active |
| Automation / MCP | Future command/tool over the same operation key. | Future |

## Current Implementation Notes And Migration Gaps

Project delete is specified separately by `projects.delete-check` and `projects.delete`. Restore
only reopens the project lifecycle guard for future project-scoped mutations.

## Open Questions

- None for project restore semantics.
