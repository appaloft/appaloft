# Environment Lifecycle Test Matrix

## Scope

This matrix covers:

- `environments.show`
- `environments.list`
- `environments.set-variable`
- `environments.unset-variable`
- `environments.promote`
- `environments.archive`
- archived-environment guards for new resource/deployment admission
- entrypoint parity for Web, CLI, HTTP/oRPC, operation catalog, and public docs

It also verifies that no entrypoint exposes generic `environments.update`.

## Global References

- [Environment Lifecycle Workflow](../workflows/environment-lifecycle.md)
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
| ENV-LIFE-READ-001 | `environments.show` / `environments.list` | read model | Archived environment queried. | Returns lifecycle status, archive metadata, created time, and masked variables. |
| ENV-LIFE-GUARD-001 | `environments.set-variable` | application | Archived environment selected. | Returns `environment_archived`, `phase = environment-lifecycle-guard`, no event. |
| ENV-LIFE-GUARD-002 | `environments.unset-variable` | application | Archived environment selected. | Returns `environment_archived`, `phase = environment-lifecycle-guard`, no event. |
| ENV-LIFE-GUARD-003 | `environments.promote` | application | Archived source environment selected. | Returns `environment_archived`, no promoted environment. |
| ENV-LIFE-GUARD-004 | `resources.create` | application | Archived environment selected. | Returns `environment_archived` before resource persistence. |
| ENV-LIFE-GUARD-005 | `deployments.create` | application | Archived environment selected. | Returns `environment_archived` before deployment state or bootstrap resource creation. |
| ENV-LIFE-PERSIST-001 | PG/PGlite | integration | Environment archive state persisted and read back. | Repository rehydrates archive state; read model exposes lifecycle metadata. |
| ENV-LIFE-ENTRY-001 | CLI | e2e-preferred | `appaloft env archive <environmentId> --reason ...`. | Dispatches `ArchiveEnvironmentCommand`; no repository bypass. |
| ENV-LIFE-ENTRY-002 | HTTP/oRPC | e2e-preferred | `POST /api/environments/{environmentId}/archive`. | Reuses application schema and dispatches `ArchiveEnvironmentCommand`. |
| ENV-LIFE-ENTRY-003 | Web | e2e-preferred | Project detail environment lifecycle control. | Dispatches `environments.archive`, invalidates environment/project state, and leaves archived environments visible. |
| ENV-LIFE-ENTRY-004 | Operation catalog | contract | Public exposure in Code Round. | `CORE_OPERATIONS.md` and `operation-catalog.ts` include `environments.archive`. |
| ENV-LIFE-DOCS-001 | Public docs | contract | Archive behavior has a public help anchor. | Docs registry maps `environments.archive` to `environment.lifecycle`. |

## Required Non-Coverage Assertions

Tests must assert environment archive does not:

- delete or archive resources;
- create deployments;
- mutate historical deployment snapshots;
- stop runtime;
- bind or unbind domains;
- issue, renew, revoke, or import certificates;
- apply or remove proxy routes;
- retarget source links;
- expose generic `environments.update`, `UpdateEnvironmentCommand`, or
  `PATCH /api/environments/{id}`;
- write plaintext secret values into events, read models, errors, logs, or diagnostics.

## Current Implementation Notes And Migration Gaps

Automated coverage exists for all rows in this matrix:

- `ENV-LIFE-ARCHIVE-001` through `ENV-LIFE-ARCHIVE-003`, `ENV-LIFE-READ-001`, and
  `ENV-LIFE-GUARD-001` through `ENV-LIFE-GUARD-005` in
  `packages/application/test/environment-lifecycle.test.ts` and
  `packages/core/test/environment.test.ts`;
- `ENV-LIFE-PERSIST-001` in `packages/persistence/pg/test/environment-lifecycle.pglite.test.ts`;
- `ENV-LIFE-ENTRY-001` in `packages/adapters/cli/test/environment-command.test.ts`;
- `ENV-LIFE-ENTRY-002` in `packages/orpc/test/environment-lifecycle.http.test.ts`;
- `ENV-LIFE-ENTRY-003` in `apps/web/test/e2e-webview/home.webview.test.ts`;
- `ENV-LIFE-ENTRY-004` in `packages/application/test/operation-catalog-boundary.test.ts`;
- `ENV-LIFE-DOCS-001` in `packages/docs-registry/test/operation-coverage.test.ts`.

No migration gaps are recorded for this slice.

## Open Questions

- None for archive.
