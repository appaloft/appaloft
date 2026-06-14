# Project Lifecycle Workflow Spec

## Normative Contract

Project lifecycle operations manage only the Workspace `Project` aggregate identity and lifecycle.
They do not own deployments directly and do not mutate Resource-owned source, runtime, network,
health, domain, access, log, or diagnostic state.

The active project lifecycle operations are:

- `projects.show`
- `projects.rename`
- `projects.reorder`
- `projects.set-description`
- `projects.archive`
- `projects.restore`
- `projects.delete-check`
- `projects.delete`

Generic `projects.update` remains forbidden by ADR-026.

## Governing Sources

- [ADR-013: Project Resource Navigation And Deployment Ownership](../decisions/ADR-013-project-resource-navigation-and-deployment-ownership.md)
- [ADR-026: Aggregate Mutation Command Boundary](../decisions/ADR-026-aggregate-mutation-command-boundary.md)
- [projects.show Query Spec](../queries/projects.show.md)
- [projects.rename Command Spec](../commands/projects.rename.md)
- [projects.reorder Command Spec](../commands/projects.reorder.md)
- [projects.archive Command Spec](../commands/projects.archive.md)
- [Project Lifecycle Error Spec](../errors/projects.lifecycle.md)
- [Project Lifecycle Test Matrix](../testing/project-lifecycle-test-matrix.md)

## Lifecycle States

Project lifecycle status is value-object backed.

| Status | Meaning | Allowed public mutations |
| --- | --- | --- |
| `active` | Project can be used for project-scoped child creation and deployment admission. | `projects.rename`, `projects.reorder`, `projects.set-description`, `projects.archive`, `projects.restore` idempotently, child operations where their own specs allow. |
| `archived` | Project identity and history are retained, but new project-scoped mutations are blocked. | Read queries, `projects.restore`, `projects.delete-check`, and guarded `projects.delete` only when no retained blockers exist. |
| `deleted` | Project is tombstoned and omitted from normal project read paths. | Idempotent write-side retry of `projects.delete` only when the tombstone is resolvable. |

## Workflow Rules

`projects.show` reads project identity and lifecycle metadata.

`projects.rename` changes only project display name and derived slug. It must reject archived
projects and slug conflicts.

`projects.reorder` changes only active project list display order within one organization. It must
reject duplicate project ids, missing or invisible projects, archived projects, and project id sets
that cross organization boundaries. It must not change project names, slugs, descriptions,
lifecycle state, child resources, environments, deployments, source links, domains, certificates,
logs, audit retention, or runtime state.

`projects.set-description` changes only project description metadata. Empty or omitted description
clears the description. It must reject archived projects and must not change name, slug, lifecycle,
child resources, environments, deployments, source links, domains, certificates, logs, audit
retention, or runtime state.

`projects.archive` transitions an active project to archived. It is idempotent for already archived
projects. It must not cascade archive or delete child resources, environments, deployments, domain
bindings, certificates, logs, source links, or audit state.

`projects.restore` transitions an archived project back to active. It is idempotent for already
active projects. It clears archive metadata and reopens future project-scoped admission through the
normal child-operation guards. It must not create resources or environments, create deployments,
retry deployments, mutate historical deployment snapshots, restore deleted child objects, or affect
runtime state.

`projects.delete-check` previews whether an archived project can be deleted without hiding retained
child or support history. Empty active or locked environments are not retained blockers when they
have no environment-owned variables and no non-deleted resources. `projects.delete` soft-deletes
only archived projects with no delete-check blockers and matching typed confirmation, and it may
auto-archive those empty environments through the normal environment lifecycle before the final
blocker check. It does not cascade other cleanup.

Project detail/settings surfaces may compose resource, environment, deployment, and access-route
rollups from their own read models. Those rollups are read-only context. Project lifecycle commands
must not create a deployment, mutate historical deployment snapshots, or immediately affect runtime
state.

Archived project guards apply to child operations that would create new project-scoped work:

- `environments.create`
- `resources.create`
- `deployments.create`

Existing child read operations may remain visible so operators can inspect history and copy support
context.

## Entrypoint Surface Decisions

| Surface | Decision |
| --- | --- |
| CLI | Expose `project show`, `project rename`, `project set-description`, `project archive`, `project restore`, `project delete-check`, and `project delete`; do not expose `project update`. |
| HTTP/oRPC | Expose show, rename, set-description, archive, restore, delete-check, and delete routes that reuse operation schemas. |
| Web | Project detail/settings reads identity through `projects.show`, submits rename/set-description/archive/restore through the named operations, reads `projects.delete-check`, and enables destructive delete only for archived/eligible projects with typed confirmation. |
| Repository config | Not applicable. Repository config must not select project identity. |
| Future MCP/tools | Generate tools from operation catalog entries for the named project lifecycle operations. |
| Public docs | Stable project-management anchors describe show, rename, archive, restore, delete-check, and guarded delete behavior. |

## Current Implementation Notes And Migration Gaps

Normal read paths omit deleted project tombstones. Audit-only deleted project inspection remains a
future read surface.

## Open Questions

- None for this lifecycle slice.
