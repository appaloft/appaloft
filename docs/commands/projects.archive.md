# projects.archive Command Spec

## Metadata

- Operation key: `projects.archive`
- Command class: `ArchiveProjectCommand`
- Input schema: `ArchiveProjectCommandInput`
- Handler: `ArchiveProjectCommandHandler`
- Use case: `ArchiveProjectUseCase`
- Domain / bounded context: Workspace / Project lifecycle
- Current status: active command
- Source classification: normative contract

## Normative Contract

`projects.archive` is the source-of-truth command for retiring a project from new workspace
mutations while retaining project identity and history.

Command success means the project lifecycle status is durably `archived`.

```ts
type ArchiveProjectResult = Result<{ id: string }, DomainError>;
```

The command contract is:

- admission failure returns `err(DomainError)`;
- success returns `ok({ id })`;
- success persists archived lifecycle status and archive metadata;
- success publishes or records `project-archived` only when state changes;
- archived projects remain readable through project read queries.

## Global References

This command inherits:

- [ADR-013: Project Resource Navigation And Deployment Ownership](../decisions/ADR-013-project-resource-navigation-and-deployment-ownership.md)
- [ADR-026: Aggregate Mutation Command Boundary](../decisions/ADR-026-aggregate-mutation-command-boundary.md)
- [projects.show Query Spec](../queries/projects.show.md)
- [project-archived Event Spec](../events/project-archived.md)
- [Project Lifecycle Workflow](../workflows/project-lifecycle.md)
- [Project Lifecycle Error Spec](../errors/projects.lifecycle.md)
- [Project Lifecycle Test Matrix](../testing/project-lifecycle-test-matrix.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)

## Input Model

```ts
type ArchiveProjectCommandInput = {
  projectId: string;
  reason?: string;
};
```

| Field | Requirement | Meaning |
| --- | --- | --- |
| `projectId` | Required | Project being archived. |
| `reason` | Optional | Short safe operator note for audit/read models. |

`reason` uses the same safe archive reason value-object rules as resource archive: trim, reject
empty values when present, reject multiline/control characters, cap length, and reject obvious
secret material.

## Lifecycle Rules

New projects start as `active`. An active project can transition to `archived` exactly once.
Already archived projects are idempotent for this command: the command returns `ok({ id })`, does
not change `archivedAt` or `reason`, and does not publish a duplicate `project-archived` event.

Project archive does not delete or archive resources, environments, deployment records, domain
bindings, certificates, source links, logs, or audit history. It only blocks new project-scoped
mutations and deployment admission from that project context.

Project archive must not create a deployment, mutate historical deployment snapshots, or immediately
stop, restart, delete, or otherwise affect runtime state. Existing runtime cleanup remains owned by
future resource/runtime lifecycle operations.

After archive:

- `projects.show` and `projects.list` may return the project with lifecycle metadata;
- `projects.rename` must reject the project;
- `environments.create`, `resources.create`, and `deployments.create` must reject the archived
  project context;
- existing resource, environment, deployment, health, log, and diagnostic reads may remain visible;
- destructive cleanup requires future explicit commands and safety rules.

## Admission Flow

The command must:

1. Validate command input.
2. Resolve `projectId`.
3. Reject missing or invisible project with `not_found`.
4. Treat an already archived project as idempotent success.
5. Capture archive time through the injected clock.
6. Persist archived lifecycle status, archive timestamp, and optional safe reason.
7. Publish or record `project-archived` when the state changes.
8. Return `ok({ id })`.

## Error Contract

All errors use [Project Lifecycle Error Spec](../errors/projects.lifecycle.md).

| Error code | Phase | Retriable | Meaning |
| --- | --- | --- | --- |
| `validation_error` | `command-validation` | No | `projectId` or `reason` shape is invalid. |
| `not_found` | `context-resolution` | No | Project does not exist or is not visible. |
| `invariant_violation` | `project-lifecycle-guard` | No | Project lifecycle state cannot transition to archived. |
| `infra_error` | `project-persistence` | Conditional | Archive state could not be safely persisted. |
| `infra_error` | `event-publication` | Conditional | Event publication could not be recorded before command success. |

## Entrypoints

| Entrypoint | Mapping | Status |
| --- | --- | --- |
| Web | Project settings/lifecycle action dispatches this command after confirmation. | Active |
| CLI | `appaloft project archive <projectId> [--reason ...]`. | Active |
| oRPC / HTTP | `POST /api/projects/{projectId}/archive` using the command schema. | Active |
| Automation / MCP | Future command/tool over the same operation key. | Future |

## Current Implementation Notes And Migration Gaps

Project hard delete is not specified. Archive is the only public project lifecycle mutation in this
round. Existing child resources remain resource-owned and require their own lifecycle commands.

## Open Questions

- None for project archive semantics. Project hard delete remains future work.
