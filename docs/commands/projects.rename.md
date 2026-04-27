# projects.rename Command Spec

## Metadata

- Operation key: `projects.rename`
- Command class: `RenameProjectCommand`
- Input schema: `RenameProjectCommandInput`
- Handler: `RenameProjectCommandHandler`
- Use case: `RenameProjectUseCase`
- Domain / bounded context: Workspace / Project lifecycle
- Current status: active command
- Source classification: normative contract

## Normative Contract

`projects.rename` is the source-of-truth command for changing a project's display name and derived
slug.

It is not a generic project update command. It must not mutate description, source identity,
resources, environments, deployments, access policy, credentials, or any resource-owned profile.
It must not create a deployment, mutate historical deployment snapshots, or immediately affect
runtime state.

```ts
type RenameProjectResult = Result<{ id: string }, DomainError>;
```

The command contract is:

- admission failure returns `err(DomainError)`;
- success returns `ok({ id })`;
- success persists the new project name and derived slug;
- success publishes or records `project-renamed` only when state changes;
- archiving blocks rename with a project lifecycle error.

## Global References

This command inherits:

- [ADR-013: Project Resource Navigation And Deployment Ownership](../decisions/ADR-013-project-resource-navigation-and-deployment-ownership.md)
- [ADR-026: Aggregate Mutation Command Boundary](../decisions/ADR-026-aggregate-mutation-command-boundary.md)
- [projects.show Query Spec](../queries/projects.show.md)
- [project-renamed Event Spec](../events/project-renamed.md)
- [Project Lifecycle Workflow](../workflows/project-lifecycle.md)
- [Project Lifecycle Error Spec](../errors/projects.lifecycle.md)
- [Project Lifecycle Test Matrix](../testing/project-lifecycle-test-matrix.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)

## Input Model

```ts
type RenameProjectCommandInput = {
  projectId: string;
  name: string;
};
```

| Field | Requirement | Meaning |
| --- | --- | --- |
| `projectId` | Required | Project being renamed. |
| `name` | Required | New project display name. |

The slug is always derived from `name` through the project slug value object. Callers must not pass a
slug override.

## Admission Flow

The command must:

1. Validate command input.
2. Resolve `projectId`.
3. Reject missing or invisible project with `not_found`.
4. Reject archived projects with `project_archived`.
5. Normalize the requested project name and derive the next slug.
6. If the name and slug are unchanged, return idempotent `ok({ id })` without a duplicate event.
7. Reject slug conflicts with another project.
8. Persist the project.
9. Publish or record `project-renamed`.
10. Return `ok({ id })`.

## Error Contract

All errors use [Project Lifecycle Error Spec](../errors/projects.lifecycle.md).

| Error code | Phase | Retriable | Meaning |
| --- | --- | --- | --- |
| `validation_error` | `command-validation` | No | Input shape or name is invalid. |
| `not_found` | `context-resolution` | No | Project does not exist or is not visible. |
| `project_archived` | `project-lifecycle-guard` | No | Archived project cannot be renamed. |
| `project_slug_conflict` | `project-admission` | No | Derived slug is already owned by another project. |
| `infra_error` | `project-persistence` | Conditional | Rename state could not be safely persisted. |
| `infra_error` | `event-publication` | Conditional | Event publication could not be recorded before command success. |

## Entrypoints

| Entrypoint | Mapping | Status |
| --- | --- | --- |
| Web | Project settings/name form dispatches this command. | Active |
| CLI | `appaloft project rename <projectId> --name <name>`. | Active |
| oRPC / HTTP | `POST /api/projects/{projectId}/rename` using the command schema. | Active |
| Automation / MCP | Future command/tool over the same operation key. | Future |

## Current Implementation Notes And Migration Gaps

Project description editing remains intentionally absent until a named command such as
`projects.set-description` is specified. No generic `projects.update` entrypoint is allowed.

## Open Questions

- None for rename semantics.
