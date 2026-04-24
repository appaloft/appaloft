# Deployment Target Lifecycle Test Matrix

## Scope

This matrix covers:

- `servers.show`;
- `servers.deactivate`;
- `servers.delete-check`;
- guarded `servers.delete`;
- operation catalog and public docs coverage for the server detail query;
- explicit non-coverage for generic `servers.update`.

It complements [Server Bootstrap Test Matrix](./server-bootstrap-test-matrix.md), which owns
registration, connectivity, proxy bootstrap, and proxy repair behavior.

## Global References

- [Deployment Target Lifecycle Workflow](../workflows/deployment-target-lifecycle.md)
- [servers.show Query Spec](../queries/servers.show.md)
- [servers.delete Command Spec](../commands/servers.delete.md)
- [servers.delete-check Query Spec](../queries/servers.delete-check.md)
- [server-deleted Event Spec](../events/server-deleted.md)
- [Deployment Target Lifecycle Error Spec](../errors/servers.lifecycle.md)
- [ADR-004](../decisions/ADR-004-server-readiness-state-storage.md)
- [ADR-019](../decisions/ADR-019-edge-proxy-provider-and-observable-configuration.md)
- [ADR-026](../decisions/ADR-026-aggregate-mutation-command-boundary.md)
- [Spec-Driven Testing](./SPEC_DRIVEN_TESTING.md)

## Coverage Rows

| ID | Operation | Level | Scenario | Expected |
| --- | --- | --- | --- | --- |
| SRV-LIFE-SHOW-001 | `servers.show` | integration | Existing server with credential and proxy summary. | Returns `ok` with `schemaVersion = "servers.show/v1"`, server identity, masked credential summary, and edge proxy status. |
| SRV-LIFE-SHOW-002 | `servers.show` | integration | Missing server id. | Returns `not_found`, `phase = server-read`, and no rollup reads are required. |
| SRV-LIFE-SHOW-003 | `servers.show` | integration | Existing server with deployments and domain bindings. | Returns deployment/resource/domain rollups derived from read models, including status counts and latest navigation ids. |
| SRV-LIFE-SHOW-004 | `servers.show` | integration | Caller disables rollups. | Returns base server detail without rollups and does not require deployment/domain read-model queries. |
| SRV-LIFE-DEACT-001 | `servers.deactivate` | integration | Active server is deactivated. | Returns `ok({ id })`, persists lifecycle status `inactive`, stores `deactivatedAt`, publishes `server-deactivated`, and leaves credentials/proxy/deployment/domain state intact. |
| SRV-LIFE-DEACT-002 | `servers.deactivate` | integration | Already inactive server is deactivated again. | Returns idempotent `ok({ id })`, preserves original `deactivatedAt` and reason, and does not publish a duplicate event. |
| SRV-LIFE-DEACT-003 | `servers.deactivate` | integration | Missing server id. | Returns `not_found`, `phase = server-admission`, and does not publish `server-deactivated`. |
| SRV-LIFE-DEACT-004 | `deployments.create` | integration | Caller requests a new deployment on an inactive server. | Admission returns `server_inactive` with `phase = server-lifecycle-guard`; no deployment attempt is accepted. |
| SRV-LIFE-DELETE-CHECK-001 | `servers.delete-check` | integration | Active server is checked. | Returns `ok` with `schemaVersion = "servers.delete-check/v1"`, `eligible = false`, and an `active-server` blocker. |
| SRV-LIFE-DELETE-CHECK-002 | `servers.delete-check` | integration | Inactive server has retained deployments/domains/routes/credential/log/audit blockers. | Returns `ok` with `eligible = false` and safe typed blocker kinds/counts. |
| SRV-LIFE-DELETE-CHECK-003 | `servers.delete-check` | integration | Inactive server has no blockers. | Returns `ok` with `eligible = true` and an empty blocker list. |
| SRV-LIFE-DELETE-CHECK-004 | `servers.delete-check` | integration | Missing server id. | Returns `not_found`, `phase = server-read`. |
| SRV-LIFE-DELETE-001 | `servers.delete` | integration | Inactive server has no delete-check blockers and typed confirmation matches. | Returns `ok({ id })`, persists lifecycle status `deleted`, stores `deletedAt`, publishes `server-deleted`, and does not cascade cleanup. |
| SRV-LIFE-DELETE-002 | `servers.delete` | integration | Active server is deleted. | Returns `server_delete_blocked`, `phase = server-lifecycle-guard`, `deletionBlockers = ["active-server"]`, and no event is published. |
| SRV-LIFE-DELETE-003 | `servers.delete` | integration | Inactive server has deployment/resource/domain/certificate/proxy/credential/log/audit/source-link/default-access blockers. | Returns `server_delete_blocked` with safe typed blocker kinds/counts from the shared blocker reader and does not mutate server state. |
| SRV-LIFE-DELETE-004 | `servers.delete` | integration | Confirmation server id does not match the selected server. | Returns `validation_error`, `phase = server-lifecycle-guard`, and no event is published. |
| SRV-LIFE-DELETE-005 | `servers.delete` | integration | Missing server id. | Returns `not_found`, `phase = server-admission`, and does not read blockers. |
| SRV-LIFE-DELETE-006 | `servers.delete` | integration | Already deleted tombstone is deleted again. | Returns idempotent `ok({ id })`, preserves original `deletedAt`, and does not publish a duplicate event. |
| SRV-LIFE-DELETE-007 | `servers.list` / `servers.show` | integration | Server has lifecycle status `deleted`. | Normal list omits the server and show returns `not_found`, while write-side repository can still resolve the tombstone for idempotency. |
| SRV-LIFE-ENTRY-001 | CLI | e2e-preferred | Server show command. | `appaloft server show <serverId>` dispatches `ShowServerQuery`; no repository bypass. |
| SRV-LIFE-ENTRY-002 | HTTP/oRPC | e2e-preferred | Server show route. | `GET /api/servers/{serverId}` reuses `ShowServerQueryInput`, dispatches through `QueryBus`, and returns `ServerDetail`. |
| SRV-LIFE-ENTRY-003 | Operation catalog | contract | Public exposure in Code Round. | `CORE_OPERATIONS.md`, `operation-catalog.ts`, and public docs operation coverage include `servers.show`. |
| SRV-LIFE-ENTRY-004 | Web | e2e-preferred | Server detail page. | Web server detail reads `servers.show` for identity/status/rollups while keeping repair/terminal actions separate. |
| SRV-LIFE-ENTRY-005 | CLI | e2e-preferred | Server deactivate command. | `appaloft server deactivate <serverId>` dispatches `DeactivateServerCommand`; no repository bypass. |
| SRV-LIFE-ENTRY-006 | HTTP/oRPC | e2e-preferred | Server deactivate route. | `POST /api/servers/{serverId}/deactivate` reuses `DeactivateServerCommandInput`, dispatches through `CommandBus`, and returns `{ id }`. |
| SRV-LIFE-ENTRY-007 | CLI | e2e-preferred | Server delete-check command. | `appaloft server delete-check <serverId>` dispatches `CheckServerDeleteSafetyQuery`; no repository bypass. |
| SRV-LIFE-ENTRY-008 | HTTP/oRPC | e2e-preferred | Server delete-check route. | `GET /api/servers/{serverId}/delete-check` reuses `CheckServerDeleteSafetyQueryInput`, dispatches through `QueryBus`, and returns `ServerDeleteSafety`. |
| SRV-LIFE-ENTRY-009 | Operation catalog | contract | Public exposure in Code Round. | `CORE_OPERATIONS.md`, `operation-catalog.ts`, and public docs operation coverage include `servers.deactivate` and `servers.delete-check`. |
| SRV-LIFE-ENTRY-010 | CLI | e2e-preferred | Server delete command. | `appaloft server delete <serverId> --confirm <serverId>` dispatches `DeleteServerCommand`; no repository bypass. |
| SRV-LIFE-ENTRY-011 | HTTP/oRPC | e2e-preferred | Server delete route. | `DELETE /api/servers/{serverId}` reuses `DeleteServerCommandInput`, dispatches through `CommandBus`, and returns `{ id }`. |
| SRV-LIFE-ENTRY-012 | Operation catalog | contract | Public exposure in Code Round. | `CORE_OPERATIONS.md`, `operation-catalog.ts`, and public docs operation coverage include `servers.delete`. |

## Required Non-Coverage Assertions

Tests must assert server lifecycle work does not:

- expose generic `servers.update`, `UpdateServerCommand`, or `PATCH /api/servers/{id}`;
- run connectivity tests from `servers.show`;
- bootstrap or repair proxy infrastructure from `servers.show`;
- mutate credentials, resources, deployments, domain bindings, server-applied routes, terminal
  sessions, logs, or audit state from `servers.show` or `servers.delete-check`;
- let `servers.delete` bypass the shared `ServerDeletionBlockerReader`;
- let `servers.delete` cascade-delete credentials, resources, deployments, domain bindings,
  certificates, server-applied routes, terminal sessions, logs, or audit state.

## Current Implementation Notes And Migration Gaps

The active implementation covers:

- `SRV-LIFE-SHOW-001`, `SRV-LIFE-SHOW-002`, and `SRV-LIFE-SHOW-003` in
  `packages/application/test/show-server.test.ts`;
- `SRV-LIFE-ENTRY-001` in `packages/adapters/cli/test/server-command.test.ts`;
- `SRV-LIFE-ENTRY-002` in `packages/orpc/test/server-show.http.test.ts`;
- operation catalog/docs coverage through existing catalog and docs-registry tests.

`SRV-LIFE-SHOW-004` is covered as a companion branch in `packages/application/test/show-server.test.ts`.
`SRV-LIFE-ENTRY-004` is covered in `apps/web/test/e2e-webview/home.webview.test.ts`.

`SRV-LIFE-DEACT-*`, `SRV-LIFE-DELETE-CHECK-*`, and `SRV-LIFE-ENTRY-005` through
`SRV-LIFE-ENTRY-009` are the required coverage rows for the deactivate/delete-safety Code Round.

`SRV-LIFE-DELETE-*` and `SRV-LIFE-ENTRY-010` through `SRV-LIFE-ENTRY-012` are the required coverage
rows for the guarded delete Code Round.

## Open Questions

- None for `servers.show`, one-way deactivate, or delete-check preview semantics.
