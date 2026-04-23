# Project Lifecycle Workflow Spec

## Normative Contract

Project lifecycle operations manage only the Workspace `Project` aggregate identity and lifecycle.
They do not own deployments directly and do not mutate Resource-owned source, runtime, network,
health, domain, access, log, or diagnostic state.

The active project lifecycle operations are:

- `projects.show`
- `projects.rename`
- `projects.archive`

Generic `projects.update` remains forbidden by ADR-026.

## Governing Sources

- [ADR-013: Project Resource Navigation And Deployment Ownership](../decisions/ADR-013-project-resource-navigation-and-deployment-ownership.md)
- [ADR-026: Aggregate Mutation Command Boundary](../decisions/ADR-026-aggregate-mutation-command-boundary.md)
- [projects.show Query Spec](../queries/projects.show.md)
- [projects.rename Command Spec](../commands/projects.rename.md)
- [projects.archive Command Spec](../commands/projects.archive.md)
- [Project Lifecycle Error Spec](../errors/projects.lifecycle.md)
- [Project Lifecycle Test Matrix](../testing/project-lifecycle-test-matrix.md)

## Lifecycle States

Project lifecycle status is value-object backed.

| Status | Meaning | Allowed public mutations |
| --- | --- | --- |
| `active` | Project can be used for project-scoped child creation and deployment admission. | `projects.rename`, `projects.archive`, child operations where their own specs allow. |
| `archived` | Project identity and history are retained, but new project-scoped mutations are blocked. | Read queries only, plus future explicit restore/delete if specified. |

Project hard delete and restore are future behaviors and require separate specs.

## Workflow Rules

`projects.show` reads project identity and lifecycle metadata.

`projects.rename` changes only project display name and derived slug. It must reject archived
projects and slug conflicts.

`projects.archive` transitions an active project to archived. It is idempotent for already archived
projects. It must not cascade archive or delete child resources, environments, deployments, domain
bindings, certificates, logs, source links, or audit state.

Archived project guards apply to child operations that would create new project-scoped work:

- `environments.create`
- `resources.create`
- `deployments.create`

Existing child read operations may remain visible so operators can inspect history and copy support
context.

## Entrypoint Surface Decisions

| Surface | Decision |
| --- | --- |
| CLI | Expose `project show`, `project rename`, and `project archive`; do not expose `project update`. |
| HTTP/oRPC | Expose show, rename, and archive routes that reuse operation schemas. |
| Web | Project detail/settings may read identity, submit rename, and submit archive after confirmation. Project deploy actions still route through Resource or Quick Deploy. |
| Repository config | Not applicable. Repository config must not select project identity. |
| Future MCP/tools | Generate tools from operation catalog entries for the three operations. |
| Public docs | Stable project-management anchors describe show, rename, archive, and archived project behavior. |

## Current Implementation Notes And Migration Gaps

Project description editing is deferred. If product needs it, add `projects.set-description` rather
than `projects.update`.

Project hard delete and restore are deferred.

## Open Questions

- None for this lifecycle slice.
