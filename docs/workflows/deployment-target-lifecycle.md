# Deployment Target Lifecycle Workflow Spec

## Normative Contract

Deployment target lifecycle operations manage server identity, operator-facing status, and safe
server lifecycle transitions. They do not own resource profiles, deployments, domain ownership, or
runtime workload containers.

The active operations in this lifecycle slice are:

- `servers.show`;
- `servers.rename`;
- `servers.deactivate`;
- `servers.delete-check`;
- guarded `servers.delete`.

Future lifecycle operations expected by the roadmap are:

- `servers.configure-edge-proxy`.

Generic `servers.update` remains forbidden by ADR-026.

## Governing Sources

- [ADR-004: Server Readiness State Storage](../decisions/ADR-004-server-readiness-state-storage.md)
- [ADR-019: Edge Proxy Provider And Observable Configuration](../decisions/ADR-019-edge-proxy-provider-and-observable-configuration.md)
- [ADR-026: Aggregate Mutation Command Boundary](../decisions/ADR-026-aggregate-mutation-command-boundary.md)
- [servers.show Query Spec](../queries/servers.show.md)
- [servers.rename Command Spec](../commands/servers.rename.md)
- [Server Bootstrap And Proxy Workflow](./server-bootstrap-and-proxy.md)
- [Deployment Target Lifecycle Error Spec](../errors/servers.lifecycle.md)
- [Deployment Target Lifecycle Test Matrix](../testing/deployment-target-lifecycle-test-matrix.md)

## Workflow Rules

`servers.show` reads one server identity and status surface. It may compose existing read models to
show:

- server id, name, host, port, provider key, and created timestamp;
- lifecycle status and deactivation metadata;
- masked credential summary;
- edge proxy kind/status and last safe proxy error fields;
- deployment/resource/domain rollups for operator orientation.

It must not:

- run connectivity checks;
- repair or bootstrap proxy infrastructure;
- inspect live workload containers;
- create, deploy, stop, or mutate resources;
- mark server readiness;
- rename, deactivate, delete, or configure server state.

`servers.rename` changes only the server display name. It must preserve the server id, host, port,
provider key, credential relationship, edge proxy state, lifecycle status, destination ids,
deployment history, domain history, route state, logs, audit records, and all historical
references. Active and inactive servers may be renamed. Deleted server tombstones are immutable
through the ordinary rename entrypoint; normal command admission returns `not_found` for deleted
servers.

`servers.deactivate` changes only the deployment target lifecycle state from active to inactive.
It must not stop workloads, cancel deployments, remove routes, revoke certificates, detach
credentials, close terminal sessions, or delete retained support state. Once inactive, the server
remains visible through read surfaces but must not be admitted as a target for new deployments,
scheduling, or proxy configuration target selection.

`servers.delete-check` is a read-only safety preview. It must return `eligible = false` when the
server is active or when any retained dependency still references the server. It must not mutate
server, resource, deployment, route, credential, terminal, log, runtime, or audit state.

`servers.delete` is the destructive lifecycle command gated by the same safety semantics as
`servers.delete-check`. It must call the shared `ServerDeletionBlockerReader` and must reject active
servers or any delete-check blocker with `server_delete_blocked`. When the inactive server has no
blockers, the preferred v1 implementation soft-deletes the server with lifecycle `deleted` and
`deletedAt` so normal list/show and target-selection paths omit it while deployment, domain, route,
log, and audit history can continue to reference the server id.

Server lifecycle mutations must use intention-revealing command names. Delete safety must specify
blocker rules for at least:

- non-terminal deployments;
- resources whose latest placement or domain route still references the server;
- durable domain bindings and server-applied routes;
- certificates tied through server-owned domain bindings;
- attached credential summaries and future credential usage visibility;
- terminal sessions;
- retained logs, audit, runtime tasks, and support diagnostics.

Actual server deletion must not perform implicit cleanup. If blockers exist, users must resolve
them through explicit future cleanup or lifecycle commands before deletion can pass.

## Entrypoint Surface Decisions

| Surface | Decision |
| --- | --- |
| CLI | Expose `server show <serverId>`, `server rename <serverId> --name <name>`, `server deactivate <serverId>`, `server delete-check <serverId>`, and `server delete <serverId> --confirm <serverId>` with positional ids and explicit confirmation where destructive. |
| HTTP/oRPC | Expose `GET /api/servers/{serverId}`, `POST /api/servers/{serverId}/rename`, `POST /api/servers/{serverId}/deactivate`, `GET /api/servers/{serverId}/delete-check`, and `DELETE /api/servers/{serverId}` using operation schemas; no `PATCH /api/servers/{id}` is allowed. |
| Web | Server detail reads `servers.show` for identity, proxy status, credential summary, rollups, and lifecycle status; it exposes a display-name rename text input/action for active and inactive servers when the detail page can carry the control; it reads `servers.delete-check` for read-only delete-safety status. Destructive delete action UI is deferred until typed confirmation exists. |
| Repository config | Not applicable. Repository config must not select server identity. |
| Future MCP/tools | Generate command/query tools from the operation catalog entries. |
| Public docs | Existing `server.deployment-target` anchor explains server display-name, detail, deactivation, and delete-safety semantics. |

## Current Implementation Notes And Migration Gaps

The first Code Round implemented `servers.show` as a read-only API/CLI operation with rollups. The
Web detail follow-up now reads the same query for server identity, proxy status, credential summary,
and rollups while keeping owner-scoped actions such as connectivity test and terminal open as
separate operations.

The deactivate/delete-safety Code Round implements API/oRPC and CLI closure for
`servers.deactivate` and `servers.delete-check`. Web server detail shows read-only lifecycle and
delete-safety status.

The guarded delete Code Round implements API/oRPC and CLI closure for `servers.delete` with
soft-delete lifecycle state. The rename Code Round promotes display-name changes to an active
operation. Reactivation, edge-proxy configuration, broad credential usage visibility, Web
deactivate action UI, and Web destructive delete controls remain future work. Web destructive action
UI is limited to read-only lifecycle/safety display until confirmation affordances exist.

## Open Questions

- None for `servers.show`, one-way deactivate, or delete-check preview semantics.
