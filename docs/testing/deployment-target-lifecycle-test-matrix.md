# Deployment Target Lifecycle Test Matrix

## Scope

This matrix covers:

- `servers.show`;
- operation catalog and public docs coverage for the server detail query;
- explicit non-coverage for generic `servers.update`;
- future placeholders for server deactivate/delete safety.

It complements [Server Bootstrap Test Matrix](./server-bootstrap-test-matrix.md), which owns
registration, connectivity, proxy bootstrap, and proxy repair behavior.

## Global References

- [Deployment Target Lifecycle Workflow](../workflows/deployment-target-lifecycle.md)
- [servers.show Query Spec](../queries/servers.show.md)
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
| SRV-LIFE-ENTRY-001 | CLI | e2e-preferred | Server show command. | `appaloft server show <serverId>` dispatches `ShowServerQuery`; no repository bypass. |
| SRV-LIFE-ENTRY-002 | HTTP/oRPC | e2e-preferred | Server show route. | `GET /api/servers/{serverId}` reuses `ShowServerQueryInput`, dispatches through `QueryBus`, and returns `ServerDetail`. |
| SRV-LIFE-ENTRY-003 | Operation catalog | contract | Public exposure in Code Round. | `CORE_OPERATIONS.md`, `operation-catalog.ts`, and public docs operation coverage include `servers.show`. |
| SRV-LIFE-ENTRY-004 | Web | e2e-preferred | Server detail page. | Web server detail reads `servers.show` for identity/status/rollups while keeping repair/terminal actions separate. |

## Required Non-Coverage Assertions

Tests must assert server lifecycle work does not:

- expose generic `servers.update`, `UpdateServerCommand`, or `PATCH /api/servers/{id}`;
- run connectivity tests from `servers.show`;
- bootstrap or repair proxy infrastructure from `servers.show`;
- mutate credentials, resources, deployments, domain bindings, server-applied routes, terminal
  sessions, logs, or audit state from `servers.show`.

## Current Implementation Notes And Migration Gaps

The active implementation covers:

- `SRV-LIFE-SHOW-001`, `SRV-LIFE-SHOW-002`, and `SRV-LIFE-SHOW-003` in
  `packages/application/test/show-server.test.ts`;
- `SRV-LIFE-ENTRY-001` in `packages/adapters/cli/test/server-command.test.ts`;
- `SRV-LIFE-ENTRY-002` in `packages/orpc/test/server-show.http.test.ts`;
- operation catalog/docs coverage through existing catalog and docs-registry tests.

`SRV-LIFE-SHOW-004` is covered as a companion branch in `packages/application/test/show-server.test.ts`.
`SRV-LIFE-ENTRY-004` is covered in `apps/web/test/e2e-webview/home.webview.test.ts`.

Deactivate/delete safety rows must be added before those commands are implemented.

## Open Questions

- None for `servers.show`.
