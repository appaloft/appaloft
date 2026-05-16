# projects.delete Command Spec

## Metadata

- Operation key: `projects.delete`
- Command class: `DeleteProjectCommand`
- Input schema: `DeleteProjectCommandInput`
- Handler: `DeleteProjectCommandHandler`
- Use case: `DeleteProjectUseCase`
- Domain / bounded context: Workspace / Project lifecycle
- Current status: active command
- Source classification: normative contract

## Normative Contract

`projects.delete` soft-deletes an archived project only after `projects.delete-check` proves no
retained project-scoped state remains.

Success removes the project from normal project list/show read paths through a tombstone lifecycle
state and records `project-deleted` once. It does not cascade child cleanup, delete runtime state,
delete deployment history, prune logs, remove source events, revoke domains/certificates, or erase
audit/event retention.

## Input Model

```ts
type DeleteProjectCommandInput = {
  projectId: string;
  confirmation: { projectId: string };
  idempotencyKey?: string;
};
```

`confirmation.projectId` must exactly match `projectId`.

## Lifecycle Rules

Allowed transition:

```text
archived -> deleted
```

Active projects return `project_delete_blocked` with an `active-project` blocker. Deleted
tombstones are idempotent when resolvable through the write-side repository.

## Entrypoints

| Entrypoint | Mapping | Status |
| --- | --- | --- |
| CLI | `appaloft project delete <projectId> --confirm <projectId>` | Active |
| HTTP/oRPC | `DELETE /api/projects/{projectId}` | Active |
| Web | Project detail enables delete only after `projects.delete-check` reports eligible and exact typed confirmation matches. | Active |
| Public docs | `project.lifecycle` anchor. | Active |
| Future tools | Future command/tool over the same operation key. | Future |
