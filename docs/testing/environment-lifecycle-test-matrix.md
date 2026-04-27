# Environment Lifecycle Test Matrix

## Scope

This matrix covers:

- `environments.show`
- `environments.list`
- `environments.rename`
- `environments.set-variable`
- `environments.unset-variable`
- `environments.clone`
- `environments.promote`
- `environments.lock`
- `environments.unlock`
- `environments.archive`
- locked/archived environment guards for new resource/deployment admission
- entrypoint parity for Web, CLI, HTTP/oRPC, operation catalog, and public docs

It also verifies that no entrypoint exposes generic `environments.update`.

## Global References

- [Environment Lifecycle Workflow](../workflows/environment-lifecycle.md)
- [environments.rename Command Spec](../commands/environments.rename.md)
- [environments.clone Command Spec](../commands/environments.clone.md)
- [environments.lock Command Spec](../commands/environments.lock.md)
- [environments.unlock Command Spec](../commands/environments.unlock.md)
- [environments.archive Command Spec](../commands/environments.archive.md)
- [environment-renamed Event Spec](../events/environment-renamed.md)
- [environment-locked Event Spec](../events/environment-locked.md)
- [environment-unlocked Event Spec](../events/environment-unlocked.md)
- [environment-archived Event Spec](../events/environment-archived.md)
- [Environment Lifecycle Error Spec](../errors/environments.lifecycle.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)
- [ADR-012](../decisions/ADR-012-resource-runtime-profile-and-deployment-snapshot-boundary.md)
- [ADR-026](../decisions/ADR-026-aggregate-mutation-command-boundary.md)

## Coverage Rows

| ID | Operation | Level | Scenario | Expected |
| --- | --- | --- | --- | --- |
| ENV-LIFE-RENAME-001 | `environments.rename` | core/application | Active environment renamed. | Persists the new environment name, publishes `environment-renamed`, returns `ok({ id })`, and does not mutate variables/resources/deployments. |
| ENV-LIFE-RENAME-002 | `environments.rename` | core/application | Requested name matches the current normalized name. | Returns idempotent `ok({ id })`, persists no duplicate change, and publishes no duplicate event. |
| ENV-LIFE-RENAME-003 | `environments.rename` | application | Another environment in the same project already owns the requested name. | Returns `conflict`, `phase = environment-admission`, no mutation, no event. |
| ENV-LIFE-RENAME-004 | `environments.rename` | core/application | Locked environment selected. | Returns `environment_locked`, `phase = environment-lifecycle-guard`, no mutation, no event. |
| ENV-LIFE-RENAME-005 | `environments.rename` | core/application | Archived environment selected. | Returns `environment_archived`, `phase = environment-lifecycle-guard`, no mutation, no event. |
| ENV-LIFE-RENAME-006 | `environment-renamed` | event payload | Rename succeeds. | Event includes environment id, project id, previous name, next name, environment kind, renamed timestamp, and no secrets. |
| ENV-LIFE-LOCK-001 | `environments.lock` | core/application | Active environment locked. | Persists locked lifecycle, publishes `environment-locked`, returns `ok({ id })`. |
| ENV-LIFE-LOCK-002 | `environments.lock` | core/application | Already locked environment. | Returns idempotent `ok({ id })`, preserves lock metadata, and publishes no duplicate event. |
| ENV-LIFE-LOCK-003 | `environment-locked` | event payload | Lock has safe reason. | Event includes environment id, project id, name, kind, locked timestamp, optional reason, and no secrets. |
| ENV-LIFE-UNLOCK-001 | `environments.unlock` | core/application | Locked environment unlocked. | Persists active lifecycle, clears lock metadata, publishes `environment-unlocked`, returns `ok({ id })`. |
| ENV-LIFE-UNLOCK-002 | `environments.unlock` | core/application | Already active environment. | Returns idempotent `ok({ id })` and publishes no duplicate event. |
| ENV-LIFE-UNLOCK-003 | `environment-unlocked` | event payload | Unlock completes. | Event includes environment id, project id, name, kind, unlocked timestamp, and no secrets. |
| ENV-LIFE-ARCHIVE-001 | `environments.archive` | core/application | Active environment archived. | Persists archived lifecycle, publishes `environment-archived`, returns `ok({ id })`. |
| ENV-LIFE-ARCHIVE-002 | `environments.archive` | core/application | Already archived environment. | Returns idempotent `ok({ id })`, preserves archive metadata, and publishes no duplicate event. |
| ENV-LIFE-ARCHIVE-003 | `environment-archived` | event payload | Archive has safe reason. | Event includes environment id, project id, name, kind, archived timestamp, optional reason, and no secrets. |
| ENV-LIFE-ARCHIVE-004 | `environments.archive` | core/application | Locked environment archived. | Transitions to archived, clears lock metadata, publishes `environment-archived`, and keeps no duplicate lock/unlock event. |
| ENV-LIFE-CLONE-001 | `environments.clone` | core/application | Active environment cloned. | Persists a new active environment in the same project, sets `parentEnvironmentId`, copies environment-owned variables, and returns `ok({ id })`. |
| ENV-LIFE-CLONE-002 | `environments.clone` | core/application | Archived source environment selected. | Returns `environment_archived`, no cloned environment. |
| ENV-LIFE-CLONE-003 | `environments.clone` | application | Target name already exists in the source project. | Returns `conflict`, no cloned environment. |
| ENV-LIFE-CLONE-004 | `environments.clone` | application | Source project is archived. | Returns `project_archived`, no cloned environment. |
| ENV-LIFE-READ-001 | `environments.show` / `environments.list` | read model | Archived environment queried. | Returns lifecycle status, archive metadata, created time, and masked variables. |
| ENV-LIFE-READ-002 | `environments.show` / `environments.list` | read model | Locked environment queried. | Returns lifecycle status, lock metadata, created time, and masked variables. |
| ENV-LIFE-GUARD-001 | `environments.set-variable` | application | Archived environment selected. | Returns `environment_archived`, `phase = environment-lifecycle-guard`, no event. |
| ENV-LIFE-GUARD-002 | `environments.unset-variable` | application | Archived environment selected. | Returns `environment_archived`, `phase = environment-lifecycle-guard`, no event. |
| ENV-LIFE-GUARD-003 | `environments.promote` | application | Archived source environment selected. | Returns `environment_archived`, no promoted environment. |
| ENV-LIFE-GUARD-004 | `resources.create` | application | Archived environment selected. | Returns `environment_archived` before resource persistence. |
| ENV-LIFE-GUARD-005 | `deployments.create` | application | Archived environment selected. | Returns `environment_archived` before deployment state or bootstrap resource creation. |
| ENV-LIFE-GUARD-006 | `environments.set-variable` / `environments.unset-variable` | application | Locked environment selected. | Returns `environment_locked`, `phase = environment-lifecycle-guard`, no event. |
| ENV-LIFE-GUARD-007 | `environments.promote` | application | Locked source environment selected. | Returns `environment_locked`, no promoted environment. |
| ENV-LIFE-GUARD-008 | `resources.create` | application | Locked environment selected. | Returns `environment_locked` before resource persistence. |
| ENV-LIFE-GUARD-009 | `deployments.create` | application | Locked environment selected. | Returns `environment_locked` before deployment state or bootstrap resource creation. |
| ENV-LIFE-PERSIST-001 | PG/PGlite | integration | Environment archive state persisted and read back. | Repository rehydrates archive state; read model exposes lifecycle metadata. |
| ENV-LIFE-PERSIST-002 | PG/PGlite | integration | Environment lock state persisted and read back. | Repository rehydrates lock state; read model exposes lifecycle metadata; unlock clears lock metadata. |
| ENV-LIFE-CLONE-PERSIST-001 | PG/PGlite | integration | Cloned environment persisted and read back. | Repository rehydrates cloned environment parent id and copied variables. |
| ENV-LIFE-ENTRY-001 | CLI | e2e-preferred | `appaloft env archive <environmentId> --reason ...`. | Dispatches `ArchiveEnvironmentCommand`; no repository bypass. |
| ENV-LIFE-ENTRY-002 | HTTP/oRPC | e2e-preferred | `POST /api/environments/{environmentId}/archive`. | Reuses application schema and dispatches `ArchiveEnvironmentCommand`. |
| ENV-LIFE-ENTRY-003 | Web | e2e-preferred | Project detail environment lifecycle control. | Dispatches `environments.archive`, invalidates environment/project state, and leaves archived environments visible. |
| ENV-LIFE-ENTRY-006 | CLI / HTTP/oRPC / Web | e2e-preferred | Lock and unlock controls. | Dispatches `LockEnvironmentCommand` and `UnlockEnvironmentCommand` through shared schemas; no repository bypass. |
| ENV-LIFE-ENTRY-004 | Operation catalog | contract | Public exposure in Code Round. | `CORE_OPERATIONS.md` and `operation-catalog.ts` include `environments.clone`, `environments.lock`, `environments.unlock`, and `environments.archive`. |
| ENV-LIFE-RENAME-ENTRY-001 | CLI | e2e-preferred | `appaloft env rename <environmentId> --name ...`. | Dispatches `RenameEnvironmentCommand`; no repository bypass. |
| ENV-LIFE-RENAME-ENTRY-002 | HTTP/oRPC | e2e-preferred | `POST /api/environments/{environmentId}/rename`. | Reuses application schema and dispatches `RenameEnvironmentCommand`. |
| ENV-LIFE-RENAME-ENTRY-003 | Web | e2e-preferred | Project detail environment rename control. | Dispatches `environments.rename`, invalidates environment/project state, and keeps the same environment id visible. |
| ENV-LIFE-RENAME-ENTRY-004 | Operation catalog | contract | Public exposure in Code Round. | `CORE_OPERATIONS.md` and `operation-catalog.ts` include `environments.rename`. |
| ENV-LIFE-DOCS-001 | Public docs | contract | Archive behavior has a public help anchor. | Docs registry maps `environments.archive` to `environment.lifecycle`. |
| ENV-LIFE-DOCS-002 | Public docs | contract | Lock/unlock behavior has a public help anchor. | Docs registry maps `environments.lock` and `environments.unlock` to `environment.lifecycle`. |
| ENV-LIFE-RENAME-DOCS-001 | Public docs | contract | Rename behavior has a public help anchor. | Docs registry maps `environments.rename` to `environment.lifecycle`. |
| ENV-LIFE-CLONE-ENTRY-001 | CLI | e2e-preferred | `appaloft env clone <environmentId> --name ...`. | Dispatches `CloneEnvironmentCommand`; no repository bypass. |
| ENV-LIFE-CLONE-ENTRY-002 | HTTP/oRPC | e2e-preferred | `POST /api/environments/{environmentId}/clone`. | Reuses application schema and dispatches `CloneEnvironmentCommand`. |
| ENV-LIFE-CLONE-ENTRY-003 | Web | e2e-preferred | Project detail environment clone control. | Dispatches `environments.clone`, invalidates environment/project state, and keeps source environment visible. |
| ENV-LIFE-CLONE-ENTRY-004 | Operation catalog | contract | Public exposure in Code Round. | `CORE_OPERATIONS.md` and `operation-catalog.ts` include `environments.clone`. |
| ENV-LIFE-CLONE-DOCS-001 | Public docs | contract | Clone behavior has a public help anchor. | Docs registry maps `environments.clone` to `environment.lifecycle`. |

## Required Non-Coverage Assertions

Tests must assert environment clone/lock/unlock/archive do not:

- delete or archive resources;
- create deployments;
- mutate historical deployment snapshots;
- stop runtime;
- copy resources, deployments, domains, certificates, source links, runtime state, logs, or audit
  records during clone;
- bind or unbind domains;
- issue, renew, revoke, or import certificates;
- apply or remove proxy routes;
- retarget source links;
- rename environment ids or clone/copy environment state during rename;
- expose generic `environments.update`, `UpdateEnvironmentCommand`, or
  `PATCH /api/environments/{id}`;
- write plaintext secret values into events, read models, errors, logs, or diagnostics.

## Current Implementation Notes And Migration Gaps

Automated coverage exists for all rows in this matrix:

- `ENV-LIFE-RENAME-001` through `ENV-LIFE-RENAME-006`,
  `ENV-LIFE-LOCK-001` through `ENV-LIFE-LOCK-003`, `ENV-LIFE-UNLOCK-001` through
  `ENV-LIFE-UNLOCK-003`, `ENV-LIFE-ARCHIVE-001` through `ENV-LIFE-ARCHIVE-004`,
  `ENV-LIFE-CLONE-001` through `ENV-LIFE-CLONE-004`, `ENV-LIFE-READ-001` through
  `ENV-LIFE-READ-002`, and `ENV-LIFE-GUARD-001` through `ENV-LIFE-GUARD-009` in
  `packages/application/test/environment-lifecycle.test.ts` and
  `packages/core/test/environment.test.ts`;
- `ENV-LIFE-PERSIST-001`, `ENV-LIFE-PERSIST-002`, and `ENV-LIFE-CLONE-PERSIST-001` in
  `packages/persistence/pg/test/environment-lifecycle.pglite.test.ts`;
- `ENV-LIFE-RENAME-ENTRY-001`, `ENV-LIFE-ENTRY-001`, `ENV-LIFE-ENTRY-006`, and
  `ENV-LIFE-CLONE-ENTRY-001` CLI coverage in
  `packages/adapters/cli/test/environment-command.test.ts`;
- `ENV-LIFE-RENAME-ENTRY-002`, `ENV-LIFE-ENTRY-002`, `ENV-LIFE-ENTRY-006`, and
  `ENV-LIFE-CLONE-ENTRY-002` HTTP/oRPC coverage in
  `packages/orpc/test/environment-lifecycle.http.test.ts`;
- `ENV-LIFE-RENAME-ENTRY-003`, `ENV-LIFE-ENTRY-003`, `ENV-LIFE-ENTRY-006`, and
  `ENV-LIFE-CLONE-ENTRY-003` Web coverage in
  `apps/web/test/e2e-webview/home.webview.test.ts`;
- `ENV-LIFE-RENAME-ENTRY-004`, `ENV-LIFE-ENTRY-004`, and
  `ENV-LIFE-CLONE-ENTRY-004` in
  `packages/application/test/operation-catalog-boundary.test.ts`;
- `ENV-LIFE-RENAME-DOCS-001`, `ENV-LIFE-DOCS-001`, `ENV-LIFE-DOCS-002`, and
  `ENV-LIFE-CLONE-DOCS-001` in
  `packages/docs-registry/test/operation-coverage.test.ts`.

No migration gaps are recorded for this slice.

## Open Questions

- None.
