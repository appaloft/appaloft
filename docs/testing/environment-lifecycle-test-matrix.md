# Environment Lifecycle Test Matrix

## Scope

This matrix covers:

- `environments.show`
- `environments.list`
- `environments.set-variable`
- `environments.unset-variable`
- `environments.clone`
- `environments.promote`
- `environments.archive`
- archived-environment guards for new resource/deployment admission
- entrypoint parity for Web, CLI, HTTP/oRPC, operation catalog, and public docs

It also verifies that no entrypoint exposes generic `environments.update`.

## Global References

- [Environment Lifecycle Workflow](../workflows/environment-lifecycle.md)
- [environments.clone Command Spec](../commands/environments.clone.md)
- [environments.archive Command Spec](../commands/environments.archive.md)
- [environment-archived Event Spec](../events/environment-archived.md)
- [Environment Lifecycle Error Spec](../errors/environments.lifecycle.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)
- [ADR-012](../decisions/ADR-012-resource-runtime-profile-and-deployment-snapshot-boundary.md)
- [ADR-026](../decisions/ADR-026-aggregate-mutation-command-boundary.md)

## Coverage Rows

| ID | Operation | Level | Scenario | Expected |
| --- | --- | --- | --- | --- |
| ENV-LIFE-ARCHIVE-001 | `environments.archive` | core/application | Active environment archived. | Persists archived lifecycle, publishes `environment-archived`, returns `ok({ id })`. |
| ENV-LIFE-ARCHIVE-002 | `environments.archive` | core/application | Already archived environment. | Returns idempotent `ok({ id })`, preserves archive metadata, and publishes no duplicate event. |
| ENV-LIFE-ARCHIVE-003 | `environment-archived` | event payload | Archive has safe reason. | Event includes environment id, project id, name, kind, archived timestamp, optional reason, and no secrets. |
| ENV-LIFE-CLONE-001 | `environments.clone` | core/application | Active environment cloned. | Persists a new active environment in the same project, sets `parentEnvironmentId`, copies environment-owned variables, and returns `ok({ id })`. |
| ENV-LIFE-CLONE-002 | `environments.clone` | core/application | Archived source environment selected. | Returns `environment_archived`, no cloned environment. |
| ENV-LIFE-CLONE-003 | `environments.clone` | application | Target name already exists in the source project. | Returns `conflict`, no cloned environment. |
| ENV-LIFE-CLONE-004 | `environments.clone` | application | Source project is archived. | Returns `project_archived`, no cloned environment. |
| ENV-LIFE-READ-001 | `environments.show` / `environments.list` | read model | Archived environment queried. | Returns lifecycle status, archive metadata, created time, and masked variables. |
| ENV-LIFE-GUARD-001 | `environments.set-variable` | application | Archived environment selected. | Returns `environment_archived`, `phase = environment-lifecycle-guard`, no event. |
| ENV-LIFE-GUARD-002 | `environments.unset-variable` | application | Archived environment selected. | Returns `environment_archived`, `phase = environment-lifecycle-guard`, no event. |
| ENV-LIFE-GUARD-003 | `environments.promote` | application | Archived source environment selected. | Returns `environment_archived`, no promoted environment. |
| ENV-LIFE-GUARD-004 | `resources.create` | application | Archived environment selected. | Returns `environment_archived` before resource persistence. |
| ENV-LIFE-GUARD-005 | `deployments.create` | application | Archived environment selected. | Returns `environment_archived` before deployment state or bootstrap resource creation. |
| ENV-LIFE-PERSIST-001 | PG/PGlite | integration | Environment archive state persisted and read back. | Repository rehydrates archive state; read model exposes lifecycle metadata. |
| ENV-LIFE-CLONE-PERSIST-001 | PG/PGlite | integration | Cloned environment persisted and read back. | Repository rehydrates cloned environment parent id and copied variables. |
| ENV-LIFE-ENTRY-001 | CLI | e2e-preferred | `appaloft env archive <environmentId> --reason ...`. | Dispatches `ArchiveEnvironmentCommand`; no repository bypass. |
| ENV-LIFE-ENTRY-002 | HTTP/oRPC | e2e-preferred | `POST /api/environments/{environmentId}/archive`. | Reuses application schema and dispatches `ArchiveEnvironmentCommand`. |
| ENV-LIFE-ENTRY-003 | Web | e2e-preferred | Project detail environment lifecycle control. | Dispatches `environments.archive`, invalidates environment/project state, and leaves archived environments visible. |
| ENV-LIFE-ENTRY-004 | Operation catalog | contract | Public exposure in Code Round. | `CORE_OPERATIONS.md` and `operation-catalog.ts` include `environments.archive`. |
| ENV-LIFE-DOCS-001 | Public docs | contract | Archive behavior has a public help anchor. | Docs registry maps `environments.archive` to `environment.lifecycle`. |
| ENV-LIFE-CLONE-ENTRY-001 | CLI | e2e-preferred | `appaloft env clone <environmentId> --name ...`. | Dispatches `CloneEnvironmentCommand`; no repository bypass. |
| ENV-LIFE-CLONE-ENTRY-002 | HTTP/oRPC | e2e-preferred | `POST /api/environments/{environmentId}/clone`. | Reuses application schema and dispatches `CloneEnvironmentCommand`. |
| ENV-LIFE-CLONE-ENTRY-003 | Web | e2e-preferred | Project detail environment clone control. | Dispatches `environments.clone`, invalidates environment/project state, and keeps source environment visible. |
| ENV-LIFE-CLONE-ENTRY-004 | Operation catalog | contract | Public exposure in Code Round. | `CORE_OPERATIONS.md` and `operation-catalog.ts` include `environments.clone`. |
| ENV-LIFE-CLONE-DOCS-001 | Public docs | contract | Clone behavior has a public help anchor. | Docs registry maps `environments.clone` to `environment.lifecycle`. |

## Required Non-Coverage Assertions

Tests must assert environment archive/clone do not:

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
- expose generic `environments.update`, `UpdateEnvironmentCommand`, or
  `PATCH /api/environments/{id}`;
- write plaintext secret values into events, read models, errors, logs, or diagnostics.

## Current Implementation Notes And Migration Gaps

Automated coverage exists for all rows in this matrix:

- `ENV-LIFE-ARCHIVE-001` through `ENV-LIFE-ARCHIVE-003`, `ENV-LIFE-CLONE-001` through
  `ENV-LIFE-CLONE-004`, `ENV-LIFE-READ-001`, and
  `ENV-LIFE-GUARD-001` through `ENV-LIFE-GUARD-005` in
  `packages/application/test/environment-lifecycle.test.ts` and
  `packages/core/test/environment.test.ts`;
- `ENV-LIFE-PERSIST-001` and `ENV-LIFE-CLONE-PERSIST-001` in
  `packages/persistence/pg/test/environment-lifecycle.pglite.test.ts`;
- `ENV-LIFE-ENTRY-001` and `ENV-LIFE-CLONE-ENTRY-001` in
  `packages/adapters/cli/test/environment-command.test.ts`;
- `ENV-LIFE-ENTRY-002` and `ENV-LIFE-CLONE-ENTRY-002` in
  `packages/orpc/test/environment-lifecycle.http.test.ts`;
- `ENV-LIFE-ENTRY-003` and `ENV-LIFE-CLONE-ENTRY-003` in
  `apps/web/test/e2e-webview/home.webview.test.ts`;
- `ENV-LIFE-ENTRY-004` and `ENV-LIFE-CLONE-ENTRY-004` in
  `packages/application/test/operation-catalog-boundary.test.ts`;
- `ENV-LIFE-DOCS-001` and `ENV-LIFE-CLONE-DOCS-001` in
  `packages/docs-registry/test/operation-coverage.test.ts`.

No migration gaps are recorded for this slice.

## Open Questions

- None.
