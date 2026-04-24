# Deployment Target Lifecycle Implementation Plan

## Source Of Truth

This document plans Code Rounds for deployment target lifecycle operations. It does not replace the
query, command, workflow, error, or test-matrix specs.

## Governed Specs

- [Deployment Target Lifecycle Workflow](../workflows/deployment-target-lifecycle.md)
- [servers.show Query Spec](../queries/servers.show.md)
- [servers.deactivate Command Spec](../commands/servers.deactivate.md)
- [servers.delete-check Query Spec](../queries/servers.delete-check.md)
- [server-deactivated Event Spec](../events/server-deactivated.md)
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
- `tokens.showServerQueryService`.
- `tokens.deactivateServerUseCase`;
- `tokens.checkServerDeleteSafetyQueryService`.

The query handler must delegate to the query service and return the typed `Result`.

## Expected Read-Model Scope

The first implementation may compose existing read models:

- `ServerReadModel.findOne` for base server identity, credential summary, and edge proxy status;
- `DeploymentReadModel.list` filtered by selected server id for deployment status rollups;
- `DomainBindingReadModel.list` filtered by selected server id for durable domain rollups.

The query must not run live SSH, Docker, DNS, proxy, or runtime probes.

Deactivate must use the write-side `ServerRepository`/`DeploymentTarget` aggregate and publish
`server-deactivated` through the shared event bus after persistence.

Delete-check may compose a dedicated `ServerDeletionBlockerReader` with server read-model state.
The first PG implementation should cover blockers that already have durable tables: deployments,
non-terminal deployments, domain bindings, certificates through domain bindings, source links,
server-applied routes, attached credential, provider runtime logs through deployments, audit logs
for the server id, and default-access policy overrides. Terminal sessions and external runtime-task
blockers may remain documented extension points until durable state exists.

## Expected Transport Scope

During the Code Round that promotes this behavior to active, add `servers.show` to:

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
GET /api/servers/{serverId}/delete-check
appaloft server delete-check <serverId>
```

Do not expose `PATCH /api/servers/{serverId}` or generic `appaloft server update`.
Do not expose destructive `DELETE /api/servers/{serverId}` or `appaloft server delete` until the
guarded delete command is specified and implemented.

## Expected Web Scope

Web server detail reads `servers.show` for server identity, proxy status, credential summary, and
rollups. The detail page may still use companion list queries for tables that require row-level
deployment data, but it must not derive the selected server detail from `servers.list`.

The first deactivate/delete-safety slice keeps Web destructive action UI deferred because
confirmation affordances are outside this PR boundary. Server detail must still display lifecycle
status from `servers.show` and read-only delete-safety status from `servers.delete-check`.

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

## Verification

Run targeted checks before publishing:

- `bun test packages/application/test/show-server.test.ts`
- `bun test packages/application/test/deactivate-server.test.ts`
- `bun test packages/application/test/check-server-delete-safety.test.ts`
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

`servers.deactivate` and `servers.delete-check` are the current minimal lifecycle/safety slice.
Actual destructive `servers.delete`, reactivation, server rename, edge-proxy configuration, Web
deactivate/delete action controls, terminal-session blocker durability, external runtime-task
blocker durability, and broad credential usage visibility remain future work.

## Open Questions

- None for `servers.show`, one-way deactivate, or delete-check preview semantics.
