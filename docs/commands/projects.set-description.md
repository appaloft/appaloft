# projects.set-description Command Spec

## Metadata

- Operation key: `projects.set-description`
- Command class: `SetProjectDescriptionCommand`
- Input schema: `SetProjectDescriptionCommandInput`
- Handler: `SetProjectDescriptionCommandHandler`
- Use case: `SetProjectDescriptionUseCase`
- Domain / bounded context: Workspace / Project lifecycle
- Current status: active command
- Source classification: normative contract

## Normative Contract

`projects.set-description` is the source-of-truth command for setting or clearing project
description metadata.

It is not a generic project update command. It must not mutate project name, slug, lifecycle,
resources, environments, deployments, access policy, credentials, source links, domains,
certificates, logs, audit retention, or runtime state. It must not create a deployment, mutate
historical deployment snapshots, or immediately affect runtime state.

```ts
type SetProjectDescriptionResult = Result<{ id: string }, DomainError>;
```

The command contract is:

- admission failure returns `err(DomainError)`;
- success returns `ok({ id })`;
- success persists the normalized description, or clears it when omitted/empty;
- success publishes or records `project-description-set` only when state changes;
- archiving blocks description changes with a project lifecycle error.

## Global References

This command inherits:

- [ADR-013: Project Resource Navigation And Deployment Ownership](../decisions/ADR-013-project-resource-navigation-and-deployment-ownership.md)
- [ADR-026: Aggregate Mutation Command Boundary](../decisions/ADR-026-aggregate-mutation-command-boundary.md)
- [projects.show Query Spec](../queries/projects.show.md)
- [project-description-set Event Spec](../events/project-description-set.md)
- [Project Lifecycle Workflow](../workflows/project-lifecycle.md)
- [Project Lifecycle Error Spec](../errors/projects.lifecycle.md)
- [Project Lifecycle Test Matrix](../testing/project-lifecycle-test-matrix.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)

## Input Model

```ts
type SetProjectDescriptionCommandInput = {
  projectId: string;
  description?: string;
};
```

| Field | Requirement | Meaning |
| --- | --- | --- |
| `projectId` | Required | Project whose description is being changed. |
| `description` | Optional | New project description. Omitted or empty input clears the description. |

## Admission Flow

The command must:

1. Validate command input.
2. Resolve `projectId`.
3. Reject missing or invisible project with `not_found`.
4. Reject archived projects with `project_archived`.
5. Normalize the optional description through the project description value object.
6. If the normalized description is unchanged, return idempotent `ok({ id })` without a duplicate
   event.
7. Persist the project.
8. Publish or record `project-description-set`.
9. Return `ok({ id })`.

## Error Contract

All errors use [Project Lifecycle Error Spec](../errors/projects.lifecycle.md).

| Error code | Phase | Retriable | Meaning |
| --- | --- | --- | --- |
| `validation_error` | `command-validation` | No | Input shape or description is invalid. |
| `not_found` | `context-resolution` | No | Project does not exist or is not visible. |
| `project_archived` | `project-lifecycle-guard` | No | Archived project cannot change description. |
| `infra_error` | `project-persistence` | Conditional | Description state could not be safely persisted. |
| `infra_error` | `event-publication` | Conditional | Event publication could not be recorded before command success. |

## Entrypoints

| Entrypoint | Mapping | Status |
| --- | --- | --- |
| Web | Project settings description form dispatches this command. | Future Web affordance |
| CLI | `appaloft project set-description <projectId> --description <description>`. | Active |
| oRPC / HTTP | `POST /api/projects/{projectId}/description` using the command schema. | Active |
| Automation / MCP | Future command/tool over the same operation key. | Future |

## Current Implementation Notes And Migration Gaps

The active CLI and HTTP/oRPC command can also clear a description by omitting or submitting an empty
description. Web description editing remains a UI follow-up; Web must dispatch this operation when
that affordance is added.

Project hard delete remains deferred. No generic `projects.update` entrypoint is allowed.

## Open Questions

- None for description metadata semantics.
