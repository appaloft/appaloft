# projects.show Query Spec

## Metadata

- Operation key: `projects.show`
- Query class: `ShowProjectQuery`
- Input schema: `ShowProjectQueryInput`
- Handler: `ShowProjectQueryHandler`
- Query service: `ShowProjectQueryService`
- Domain / bounded context: Workspace / Project read model
- Current status: active query
- Source classification: normative contract

## Normative Contract

`projects.show` is the source-of-truth query for one project detail surface.

It is read-only. It must not create environments, create resources, create deployments, rename or
archive the project, or synthesize resource-owned deployment actions as project-owned behavior.

```ts
type ShowProjectResult = Result<ProjectSummary, DomainError>;
```

The query contract is:

- validation failure returns `err(DomainError)`;
- missing or invisible project returns `err(DomainError)`;
- success returns `ok(ProjectSummary)`;
- archived projects remain readable with lifecycle metadata.

## Global References

This query inherits:

- [ADR-013: Project Resource Navigation And Deployment Ownership](../decisions/ADR-013-project-resource-navigation-and-deployment-ownership.md)
- [ADR-026: Aggregate Mutation Command Boundary](../decisions/ADR-026-aggregate-mutation-command-boundary.md)
- [Project Lifecycle Workflow](../workflows/project-lifecycle.md)
- [Project Lifecycle Error Spec](../errors/projects.lifecycle.md)
- [Project Lifecycle Test Matrix](../testing/project-lifecycle-test-matrix.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)

## Input Model

```ts
type ShowProjectQueryInput = {
  projectId: string;
};
```

| Field | Requirement | Meaning |
| --- | --- | --- |
| `projectId` | Required | Project to read. |

The input must not accept deployment, resource, provider, source, or config fields.

## Output Model

`ProjectSummary` includes:

- `id`, `name`, `slug`, optional `description`, and `createdAt`;
- `lifecycleStatus` with `active` or `archived` for normal project reads;
- optional `archivedAt` and `archiveReason` when the project is archived.

Project detail pages may separately query resources, environments, or deployment rollups, but those
remain separate read surfaces. `projects.show` is only the project identity and lifecycle read.

## Error Contract

All whole-query failures use [Project Lifecycle Error Spec](../errors/projects.lifecycle.md).

| Error code | Phase | Retriable | Meaning |
| --- | --- | --- | --- |
| `validation_error` | `query-validation` | No | `projectId` is invalid. |
| `not_found` | `project-read` | No | Project does not exist or is not visible. |
| `infra_error` | `project-read` | Conditional | Project read model cannot be safely read. |

## Entrypoints

| Entrypoint | Mapping | Status |
| --- | --- | --- |
| Web | Project detail page reads this query for project identity/lifecycle. | Active |
| CLI | `appaloft project show <projectId>`. | Active |
| oRPC / HTTP | `GET /api/projects/{projectId}` using the query schema. | Active |
| Automation / MCP | Future query/tool over the same operation key. | Future |

## Current Implementation Notes And Migration Gaps

Project rollups such as resources and deployments stay outside this query. Web project detail may
compose `projects.show`, `resources.list`, and deployment list queries.

## Open Questions

- None for the project identity read.
