# Project Lifecycle Test Matrix

## Scope

This matrix covers:

- `projects.show`
- `projects.rename`
- `projects.archive`
- archived-project guards for new environment/resource/deployment admission
- entrypoint parity for Web, CLI, and HTTP/oRPC

It also verifies that no entrypoint exposes generic `projects.update`.

## Global References

- [Project Lifecycle Workflow](../workflows/project-lifecycle.md)
- [projects.show Query Spec](../queries/projects.show.md)
- [projects.rename Command Spec](../commands/projects.rename.md)
- [projects.archive Command Spec](../commands/projects.archive.md)
- [Project Lifecycle Error Spec](../errors/projects.lifecycle.md)
- [ADR-013](../decisions/ADR-013-project-resource-navigation-and-deployment-ownership.md)
- [ADR-026](../decisions/ADR-026-aggregate-mutation-command-boundary.md)

## Coverage Rows

| ID | Operation | Level | Scenario | Expected |
| --- | --- | --- | --- | --- |
| PROJ-LIFE-SHOW-001 | `projects.show` | integration | Existing active project. | Returns `ok` with project identity and `lifecycleStatus = "active"`. |
| PROJ-LIFE-SHOW-002 | `projects.show` | integration | Missing project id. | Returns `not_found`, `phase = project-read`. |
| PROJ-LIFE-SHOW-003 | `projects.show` | integration | Archived project. | Returns project identity plus archived lifecycle metadata. |
| PROJ-LIFE-RENAME-001 | `projects.rename` | integration | Active project renamed to a unique name. | Persists name and derived slug, publishes `project-renamed`, returns `ok({ id })`. |
| PROJ-LIFE-RENAME-002 | `projects.rename` | integration | Rename to the same normalized name. | Returns idempotent `ok({ id })` without duplicate event. |
| PROJ-LIFE-RENAME-003 | `projects.rename` | integration | Rename would reuse another project's slug. | Returns `project_slug_conflict`, no mutation, no event. |
| PROJ-LIFE-RENAME-004 | `projects.rename` | integration | Archived project renamed. | Returns `project_archived`, no mutation, no event. |
| PROJ-LIFE-ARCHIVE-001 | `projects.archive` | integration | Active project archived. | Persists archived lifecycle, publishes `project-archived`, returns `ok({ id })`. |
| PROJ-LIFE-ARCHIVE-002 | `projects.archive` | integration | Already archived project. | Returns idempotent `ok({ id })` without duplicate event. |
| PROJ-LIFE-ARCHIVE-003 | `projects.archive` | integration | Project has resources or deployments. | Archive succeeds without cascading child lifecycle changes. |
| PROJ-LIFE-GUARD-001 | `environments.create` | integration | Archived project selected. | Returns `project_archived`, `phase = project-lifecycle-guard`. |
| PROJ-LIFE-GUARD-002 | `resources.create` | integration | Archived project selected. | Returns `project_archived`, `phase = project-lifecycle-guard`. |
| PROJ-LIFE-GUARD-003 | `deployments.create` | integration | Archived project selected. | Returns `project_archived`, `phase = project-lifecycle-guard`. |
| PROJ-LIFE-ENTRY-001 | CLI | e2e-preferred | Project show command. | Dispatches `ShowProjectQuery`; no repository bypass. |
| PROJ-LIFE-ENTRY-002 | CLI | e2e-preferred | Project rename/archive commands. | Dispatch matching command messages; no `project update` command exists. |
| PROJ-LIFE-ENTRY-003 | HTTP/oRPC | e2e-preferred | Show, rename, archive routes. | Reuse application schemas and dispatch through QueryBus/CommandBus. |
| PROJ-LIFE-ENTRY-004 | Operation catalog | contract | Public exposure in Code Round. | `CORE_OPERATIONS.md` and `operation-catalog.ts` include show, rename, and archive. |
| PROJ-LIFE-ENTRY-005 | Web | e2e-preferred | Project detail/settings lifecycle controls. | Reads `projects.show`, dispatches `projects.rename` and `projects.archive`, and does not expose `projects.update`. |
| PROJ-LIFE-ENTRY-006 | Web | e2e-preferred | Project detail/settings side-effect clarity. | Shows resource/environment/deployment/access rollups and makes clear project lifecycle changes do not create deployments, mutate historical deployment snapshots, or immediately affect runtime state. |
| PROJ-LIFE-ENTRY-007 | Web | e2e-preferred | Archived project affordance guard. | Disables project-scoped creation affordances when archived while preserving read access to history and rollups. |
| PROJ-LIFE-EVT-001 | `project-renamed` | integration | Rename succeeds. | Event includes previous/next name and slug, timestamp, and no secrets. |
| PROJ-LIFE-EVT-002 | `project-archived` | integration | Archive succeeds with safe reason. | Event includes project id, slug, archived timestamp, optional reason, and no secrets. |

## Required Non-Coverage Assertions

Tests must assert project lifecycle operations do not:

- create deployments;
- create or mutate resources;
- create or mutate environments except through child-operation guards;
- mutate source links, domains, certificates, runtime state, logs, or audit retention;
- expose generic `projects.update`, `UpdateProjectCommand`, or `PATCH /api/projects/{id}`.

## Current Implementation Notes And Migration Gaps

Automated tests should live in operation-named files:

- `packages/application/test/project-lifecycle.test.ts`
- `packages/adapters/cli/test/project-command.test.ts`
- `packages/orpc/test/project-lifecycle.http.test.ts`
- `apps/web/test/e2e-webview/home.webview.test.ts`

WebView coverage now exercises `PROJ-LIFE-ENTRY-005`, `PROJ-LIFE-ENTRY-006`, and
`PROJ-LIFE-ENTRY-007` through the project detail/settings page.

## Open Questions

- None for the first lifecycle slice.
