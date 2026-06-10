# projects.reorder Command Spec

## Metadata

- Operation key: `projects.reorder`
- Command class: `ReorderProjectsCommand`
- Input schema: `ReorderProjectsCommandInput`
- Handler: `ReorderProjectsCommandHandler`
- Use case: `ReorderProjectsUseCase`
- Domain / bounded context: Workspace / Project lifecycle
- Current status: active command
- Source classification: normative contract

## Normative Contract

`projects.reorder` is the source-of-truth command for changing project list display order.

It is not a generic project update command. It must not mutate name, slug, description, lifecycle,
source identity, resources, environments, deployments, access policy, credentials, or any
resource-owned profile. It must not create deployments, mutate historical deployment snapshots, or
immediately affect runtime state.

```ts
type ReorderProjectsResult = Result<{ reorderedProjectIds: string[] }, DomainError>;
```

The command contract is:

- admission failure returns `err(DomainError)`;
- success returns `ok({ reorderedProjectIds })`;
- success persists display order for the provided active projects in the given order;
- success publishes or records `project-reordered` only for projects whose display order changes;
- archived projects are rejected through the project lifecycle guard.

## Input Model

```ts
type ReorderProjectsCommandInput = {
  projectIds: string[];
};
```

| Field | Requirement | Meaning |
| --- | --- | --- |
| `projectIds` | Required, 1-500 unique ids | Active projects in the desired list order. |

## Admission Flow

The command must:

1. Validate command input.
2. Reject duplicate project ids.
3. Resolve every project id.
4. Reject missing or invisible projects with `not_found`.
5. Reject archived projects with `project_archived`.
6. Reject project id sets that cross organization boundaries.
7. Persist display order according to array position.
8. Publish or record `project-reordered` for changed projects.
9. Return `ok({ reorderedProjectIds })`.

## Entrypoints

| Entrypoint | Mapping | Status |
| --- | --- | --- |
| Web | Project list drag-and-drop reorder dispatches this command. | Active |
| CLI | `appaloft project reorder --project-ids <comma-separated-project-ids>`. | Active |
| oRPC / HTTP | `POST /api/projects/reorder` using the command schema. | Active |
| Automation / MCP | Future command/tool over the same operation key. | Future |

## Open Questions

- None for project display ordering.
