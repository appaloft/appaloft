# Project Lifecycle Test Matrix

## Scope

This matrix covers:

- `projects.show`
- `projects.rename`
- `projects.set-description`
- `projects.archive`
- `projects.restore`
- `projects.delete-check`
- `projects.delete`
- archived-project guards for new environment/resource/deployment admission
- entrypoint parity for Web, CLI, and HTTP/oRPC

It also verifies that no entrypoint exposes generic `projects.update`.

## Global References

- [Project Lifecycle Workflow](../workflows/project-lifecycle.md)
- [projects.show Query Spec](../queries/projects.show.md)
- [projects.rename Command Spec](../commands/projects.rename.md)
- [projects.set-description Command Spec](../commands/projects.set-description.md)
- [projects.archive Command Spec](../commands/projects.archive.md)
- [projects.restore Command Spec](../commands/projects.restore.md)
- [projects.delete-check Query Spec](../queries/projects.delete-check.md)
- [projects.delete Command Spec](../commands/projects.delete.md)
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
| PROJ-LIFE-DESC-001 | `projects.set-description` | integration | Active project description is changed. | Persists normalized description, publishes `project-description-set`, returns `ok({ id })`, and preserves name, slug, lifecycle, and child state. |
| PROJ-LIFE-DESC-002 | `projects.set-description` | integration | Description is omitted or empty. | Clears the optional description and publishes `project-description-set` only when state changes. |
| PROJ-LIFE-DESC-003 | `projects.set-description` | integration | Description is unchanged. | Returns idempotent `ok({ id })` without duplicate event. |
| PROJ-LIFE-DESC-004 | `projects.set-description` | integration | Archived project description is changed. | Returns `project_archived`, no mutation, no event. |
| PROJ-LIFE-ARCHIVE-001 | `projects.archive` | integration | Active project archived. | Persists archived lifecycle, publishes `project-archived`, returns `ok({ id })`. |
| PROJ-LIFE-ARCHIVE-002 | `projects.archive` | integration | Already archived project. | Returns idempotent `ok({ id })` without duplicate event. |
| PROJ-LIFE-ARCHIVE-003 | `projects.archive` | integration | Project has resources or deployments. | Archive succeeds without cascading child lifecycle changes. |
| PROJ-LIFE-RESTORE-001 | `projects.restore` | integration | Archived project restored. | Persists active lifecycle, clears archive metadata, publishes `project-restored`, returns `ok({ id })`. |
| PROJ-LIFE-RESTORE-002 | `projects.restore` | integration | Already active project. | Returns idempotent `ok({ id })` without duplicate event. |
| PROJ-LIFE-RESTORE-003 | `projects.restore` | integration | Project has resources or deployments. | Restore succeeds without creating, retrying, or mutating child resources, environments, deployments, source links, domains, certificates, logs, audit retention, or runtime state. |
| PROJ-LIFE-DELETE-CHECK-001 | `projects.delete-check` | integration | Active project checked. | Returns `projects.delete-check/v1`, `eligible = false`, and an `active-project` blocker. |
| PROJ-LIFE-DELETE-CHECK-002 | `projects.delete-check` | integration | Archived project has retained blockers. | Returns `eligible = false` with safe typed blockers. |
| PROJ-LIFE-DELETE-001 | `projects.delete` | integration | Archived project has no blockers and confirmation matches. | Persists deleted tombstone, publishes `project-deleted`, omits project from normal read models, and does not cascade child cleanup. |
| PROJ-LIFE-DELETE-002 | `projects.delete` | integration | Archived project has retained blockers. | Returns `project_delete_blocked`, no mutation, no event. |
| PROJ-LIFE-DELETE-003 | `projects.delete` | integration | Active project deleted. | Returns `project_delete_blocked` with `active-project`, no mutation, no event. |
| PROJ-LIFE-GUARD-001 | `environments.create` | integration | Archived project selected. | Returns `project_archived`, `phase = project-lifecycle-guard`. |
| PROJ-LIFE-GUARD-002 | `resources.create` | integration | Archived project selected. | Returns `project_archived`, `phase = project-lifecycle-guard`. |
| PROJ-LIFE-GUARD-003 | `deployments.create` | integration | Archived project selected. | Returns `project_archived`, `phase = project-lifecycle-guard`. |
| PROJ-LIFE-ENTRY-001 | CLI | e2e-preferred | Project show command. | Dispatches `ShowProjectQuery`; no repository bypass. |
| PROJ-LIFE-ENTRY-002 | CLI | e2e-preferred | Project rename/set-description/archive/restore/delete-check/delete commands. | Dispatch matching command/query messages; no `project update` command exists. |
| PROJ-LIFE-ENTRY-003 | HTTP/oRPC | e2e-preferred | Show, rename, set-description, archive, restore, delete-check, and delete routes. | Reuse application schemas and dispatch through QueryBus/CommandBus. |
| PROJ-LIFE-ENTRY-004 | Operation catalog | contract | Public exposure in Code Round. | `CORE_OPERATIONS.md` and `operation-catalog.ts` include show, rename, set-description, archive, restore, delete-check, and delete. |
| PROJ-LIFE-ENTRY-005 | Web | e2e-preferred | Project detail/settings lifecycle controls. | Reads `projects.show`, dispatches `projects.rename`, `projects.archive`, and `projects.restore`, and does not expose `projects.update`. |
| PROJ-LIFE-ENTRY-006 | Web | e2e-preferred | Project detail/settings side-effect clarity. | Shows resource/environment/deployment/access rollups and makes clear project lifecycle changes do not create deployments, mutate historical deployment snapshots, or immediately affect runtime state. |
| PROJ-LIFE-ENTRY-007 | Web | e2e-preferred | Archived project affordance guard. | Disables project-scoped creation affordances when archived while preserving read access to history and rollups. |
| PROJ-LIFE-ENTRY-008-WEB | Web | e2e-preferred | Archived project delete action. | Reads `projects.delete-check`, enables delete only when eligible, requires exact project id confirmation, and dispatches `projects.delete`. |
| PROJ-LIFE-EVT-001 | `project-renamed` | integration | Rename succeeds. | Event includes previous/next name and slug, timestamp, and no secrets. |
| PROJ-LIFE-EVT-003 | `project-description-set` | integration | Description changes or is cleared. | Event includes project id, slug, changed timestamp, optional previous/next description, and no secrets or child/runtime state. |
| PROJ-LIFE-EVT-002 | `project-archived` | integration | Archive succeeds with safe reason. | Event includes project id, slug, archived timestamp, optional reason, and no secrets. |
| PROJ-LIFE-EVT-004 | `project-restored` | integration | Restore succeeds. | Event includes project id, slug, restore timestamp, optional previous archive metadata, and no secrets. |
| PROJ-LIFE-EVT-005 | `project-deleted` | integration | Delete succeeds. | Event includes project id, slug, delete timestamp, optional archive metadata, and no secrets or child/runtime state. |

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
