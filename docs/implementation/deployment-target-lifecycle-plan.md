# Deployment Target Lifecycle Implementation Plan

## Source Of Truth

This document plans Code Rounds for deployment target lifecycle operations. It does not replace the
query, command, workflow, error, or test-matrix specs.

## Governed Specs

- [Deployment Target Lifecycle Workflow](../workflows/deployment-target-lifecycle.md)
- [servers.show Query Spec](../queries/servers.show.md)
- [servers.rename Command Spec](../commands/servers.rename.md)
- [servers.deactivate Command Spec](../commands/servers.deactivate.md)
- [servers.delete-check Query Spec](../queries/servers.delete-check.md)
- [servers.delete Command Spec](../commands/servers.delete.md)
- [server-renamed Event Spec](../events/server-renamed.md)
- [server-deactivated Event Spec](../events/server-deactivated.md)
- [server-deleted Event Spec](../events/server-deleted.md)
- [Deployment Target Lifecycle Error Spec](../errors/servers.lifecycle.md)
- [Deployment Target Lifecycle Test Matrix](../testing/deployment-target-lifecycle-test-matrix.md)
- [Server Bootstrap And Proxy Workflow](../workflows/server-bootstrap-and-proxy.md)
- [Core Operations](../CORE_OPERATIONS.md)
- [Domain Model](../DOMAIN_MODEL.md)

## Expected Application Scope

`servers.show` uses a vertical query slice under `packages/application/src/operations/servers/`:

- `show-server.schema.ts`;
- `show-server.query.ts`;
- `show-server.handler.ts`;
- `show-server.query-service.ts`.

`servers.deactivate` must add a command slice:

- `deactivate-server.schema.ts`;
- `deactivate-server.command.ts`;
- `deactivate-server.handler.ts`;
- `deactivate-server.use-case.ts`.

`servers.rename` must add a command slice:

- `rename-server.schema.ts`;
- `rename-server.command.ts`;
- `rename-server.handler.ts`;
- `rename-server.use-case.ts`.

`servers.delete-check` must add a query slice:

- `check-server-delete-safety.schema.ts`;
- `check-server-delete-safety.query.ts`;
- `check-server-delete-safety.handler.ts`;
- `check-server-delete-safety.query-service.ts`.

Add application types and tokens as needed:

- `ServerDetail`;
- `ServerRollups`;
- `ServerDeleteSafety`;
- `ServerDeleteBlocker`;
- `tokens.showServerQueryService`;
- `tokens.renameServerUseCase`;
- `tokens.deactivateServerUseCase`;
- `tokens.checkServerDeleteSafetyQueryService`.

`servers.delete` must add a command slice:

- `delete-server.schema.ts`;
- `delete-server.command.ts`;
- `delete-server.handler.ts`;
- `delete-server.use-case.ts`.

Add:

- `tokens.deleteServerUseCase`.

The query handler must delegate to the query service and return the typed `Result`.

## Expected Read-Model Scope

The first implementation may compose existing read models:

- `ServerReadModel.findOne` for base server identity, credential summary, and edge proxy status;
- `DeploymentReadModel.list` filtered by selected server id for deployment status rollups;
- `DomainBindingReadModel.list` filtered by selected server id for durable domain rollups.

The query must not run live SSH, Docker, DNS, proxy, or runtime probes.

Deactivate must use the write-side `ServerRepository`/`DeploymentTarget` aggregate and publish
`server-deactivated` through the shared event bus after persistence.

Rename must use the write-side `ServerRepository`/`DeploymentTarget` aggregate, normalize the new
display name through `DeploymentTargetName`, reject deleted tombstones from the ordinary entrypoint
with `not_found`, and publish `server-renamed` through the shared event bus after persistence. The
first implementation should not add a server-name uniqueness query or index because the current
domain model treats the name as a display label and server id as the durable reference.

Delete-check may compose a dedicated `ServerDeletionBlockerReader` with server read-model state.
The first PG implementation should cover blockers that already have durable tables: deployments,
non-terminal deployments, domain bindings, certificates through domain bindings, source links,
server-applied routes, attached credential, provider runtime logs through deployments, audit logs
for the server id, and default-access policy overrides. Terminal sessions and external runtime-task
blockers may remain documented extension points until durable state exists.

Guarded server delete must reuse the same `ServerDeletionBlockerReader`; it may share helper code
with the delete-check query for active-server blocker construction. The first implementation should
soft-delete the `DeploymentTarget` by adding lifecycle `deleted` plus `DeletedAt` instead of hard
deleting the row, because deployment, domain, route, log, and audit history may retain server ids.
Normal server read models must omit deleted rows while the write-side repository may still resolve
the tombstone for idempotent retries.

## Expected Transport Scope

During the Code Round that promotes a lifecycle behavior to active, add the operation to:

- [Core Operations](../CORE_OPERATIONS.md) implemented operations table;
- `packages/application/src/operation-catalog.ts`;
- contracts exports;
- HTTP/oRPC route metadata and handlers;
- CLI command registration/help;
- public docs operation coverage.

Recommended transport shapes:

```text
GET /api/servers/{serverId}
appaloft server show <serverId>
POST /api/servers/{serverId}/deactivate
appaloft server deactivate <serverId>
POST /api/servers/{serverId}/rename
appaloft server rename <serverId> --name <name>
GET /api/servers/{serverId}/delete-check
appaloft server delete-check <serverId>
DELETE /api/servers/{serverId}
appaloft server delete <serverId> --confirm <serverId>
```

Do not expose `PATCH /api/servers/{serverId}` or generic `appaloft server update`.
Do not expose cascade cleanup flags on destructive server delete.

## Expected Web Scope

Web server detail reads `servers.show` for server identity, proxy status, credential summary, and
rollups. The detail page may still use companion list queries for tables that require row-level
deployment data, but it must not derive the selected server detail from `servers.list`.

The first deactivate/delete-safety slice keeps Web destructive action UI deferred because
confirmation affordances are outside this PR boundary. Server detail must still display lifecycle
status from `servers.show` and read-only delete-safety status from `servers.delete-check`.

The guarded delete slice may keep Web destructive action UI deferred if it records the gap and
continues to show read-only delete eligibility on server detail. Do not add a delete button without
typed confirmation UX.

The rename slice should add an owner-scoped server detail display-name form when the existing page
can support it without broad redesign. The control must use a text input, submit through
`servers.rename`, support active and inactive servers, and refresh the server detail/list-visible
name. If the Web action is deferred, the plan and lifecycle spec must record the exact Web action
gap; read-only display of the renamed value is still required.

## Minimal Deliverable

- `servers.show` is active in `CORE_OPERATIONS.md` and `operation-catalog.ts`;
- application query slice returns server detail plus resource/deployment/domain rollups;
- CLI and HTTP/oRPC dispatch through `ShowServerQuery`;
- contracts and typed clients expose the response shape;
- public docs coverage maps the operation to the server deployment-target anchor;
- focused tests cover `SRV-LIFE-SHOW-001`, `SRV-LIFE-SHOW-002`, `SRV-LIFE-SHOW-003`,
  `SRV-LIFE-ENTRY-002`, and `SRV-LIFE-ENTRY-004`.

## Deactivate/Delete Safety Minimal Deliverable

- `servers.deactivate` and `servers.delete-check` are active in `CORE_OPERATIONS.md` and
  `operation-catalog.ts`;
- `DeploymentTarget` has value-object lifecycle state for active/inactive, deactivation timestamp,
  and optional safe reason;
- server persistence and read models retain inactive state;
- `deployments.create` rejects inactive servers during write-side admission;
- `servers.delete-check` returns a typed safety preview without mutating state;
- CLI and HTTP/oRPC dispatch through `DeactivateServerCommand` and `CheckServerDeleteSafetyQuery`;
- Web server detail displays lifecycle status and read-only delete-safety status;
- contracts and typed clients expose the command/query shapes;
- public docs coverage maps both operations to the server deployment-target anchor;
- focused tests cover `SRV-LIFE-DEACT-001`, `SRV-LIFE-DEACT-002`, `SRV-LIFE-DEACT-003`,
  `SRV-LIFE-DEACT-004`, `SRV-LIFE-DELETE-CHECK-001`, `SRV-LIFE-DELETE-CHECK-002`,
  `SRV-LIFE-DELETE-CHECK-003`, `SRV-LIFE-DELETE-CHECK-004`, `SRV-LIFE-ENTRY-005`,
  `SRV-LIFE-ENTRY-006`, `SRV-LIFE-ENTRY-007`, `SRV-LIFE-ENTRY-008`, and
  `SRV-LIFE-ENTRY-009`.

## Rename Minimal Deliverable

- `servers.rename` is active in `CORE_OPERATIONS.md` and `operation-catalog.ts`;
- `DeploymentTarget` has a rename method that accepts `DeploymentTargetName` and preserves all
  non-name state;
- server persistence updates the stored display name through the existing upsert/update path;
- normal server list/show read models return the new name and still omit deleted servers;
- `servers.rename` rejects missing or deleted servers with `not_found`;
- CLI and HTTP/oRPC dispatch through `RenameServerCommand`;
- Web server detail exposes the display-name rename action if the existing surface can carry it, or
  records a named Web action migration gap while remaining read-observable;
- contracts and typed clients expose the command shape;
- public docs coverage maps the operation to the server deployment-target anchor;
- focused tests cover `SRV-LIFE-RENAME-001`, `SRV-LIFE-RENAME-002`,
  `SRV-LIFE-RENAME-003`, `SRV-LIFE-RENAME-004`, `SRV-LIFE-RENAME-005`,
  `SRV-LIFE-ENTRY-013`, `SRV-LIFE-ENTRY-014`, `SRV-LIFE-ENTRY-015`, and
  `SRV-LIFE-ENTRY-016` when the Web action ships in the same slice.

## Guarded Delete Minimal Deliverable

- `servers.delete` is active in `CORE_OPERATIONS.md` and `operation-catalog.ts`;
- `DeploymentTarget` supports lifecycle `deleted` plus `DeletedAt`;
- server persistence stores deleted tombstone state;
- normal server list/show read models omit deleted servers;
- `servers.delete` calls the shared `ServerDeletionBlockerReader` and returns
  `server_delete_blocked` for active servers or retained blockers;
- CLI and HTTP/oRPC dispatch through `DeleteServerCommand`;
- Web server detail continues to display read-only delete-safety status and records the destructive
  button as a migration gap;
- contracts and typed clients expose the command shape;
- public docs coverage maps the operation to the server deployment-target anchor;
- focused tests cover `SRV-LIFE-DELETE-001`, `SRV-LIFE-DELETE-002`, `SRV-LIFE-DELETE-003`,
  `SRV-LIFE-DELETE-004`, `SRV-LIFE-DELETE-005`, `SRV-LIFE-DELETE-006`,
  `SRV-LIFE-DELETE-007`, `SRV-LIFE-ENTRY-010`, `SRV-LIFE-ENTRY-011`, and
  `SRV-LIFE-ENTRY-012`.

## Verification

Run targeted checks before publishing:

- `bun test packages/application/test/show-server.test.ts`
- `bun test packages/application/test/rename-server.test.ts`
- `bun test packages/application/test/deactivate-server.test.ts`
- `bun test packages/application/test/check-server-delete-safety.test.ts`
- `bun test packages/application/test/delete-server.test.ts`
- `bun test packages/application/test/create-deployment.test.ts`
- `bun test packages/orpc/test/server-show.http.test.ts`
- `bun test packages/adapters/cli/test/server-command.test.ts`
- `bun test packages/application/test/operation-catalog-boundary.test.ts`
- `bun test packages/docs-registry/test/operation-coverage.test.ts`
- `bun run --cwd apps/web typecheck`
- `bun test apps/web/test/e2e-webview/home.webview.test.ts --test-name-pattern SRV-LIFE-ENTRY-004`
- `bun run lint`
- `bun run typecheck`

## Current Implementation Notes And Migration Gaps

`servers.deactivate`, `servers.delete-check`, guarded `servers.delete`, and display-name-only
`servers.rename` are the current minimal lifecycle/safety slice. Guarded delete uses soft-delete
lifecycle state. Reactivation, edge-proxy configuration, Web deactivate/delete action controls,
terminal-session blocker durability, external runtime-task blocker durability, and broad credential
usage visibility remain future work.

## Open Questions

- None for `servers.show`, display-name-only rename, one-way deactivate, delete-check preview, or
  guarded soft delete semantics.
