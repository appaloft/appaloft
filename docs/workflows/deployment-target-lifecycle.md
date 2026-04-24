# Deployment Target Lifecycle Workflow Spec

## Normative Contract

Deployment target lifecycle operations manage server identity, operator-facing status, and safe
server lifecycle transitions. They do not own resource profiles, deployments, domain ownership, or
runtime workload containers.

The active operation in this lifecycle slice is:

- `servers.show`

Future lifecycle operations expected by the roadmap are:

- `servers.rename`;
- `servers.configure-edge-proxy`;
- `servers.deactivate`;
- server delete safety after deactivation and blocker checks.

Generic `servers.update` remains forbidden by ADR-026.

## Governing Sources

- [ADR-004: Server Readiness State Storage](../decisions/ADR-004-server-readiness-state-storage.md)
- [ADR-019: Edge Proxy Provider And Observable Configuration](../decisions/ADR-019-edge-proxy-provider-and-observable-configuration.md)
- [ADR-026: Aggregate Mutation Command Boundary](../decisions/ADR-026-aggregate-mutation-command-boundary.md)
- [servers.show Query Spec](../queries/servers.show.md)
- [Server Bootstrap And Proxy Workflow](./server-bootstrap-and-proxy.md)
- [Deployment Target Lifecycle Error Spec](../errors/servers.lifecycle.md)
- [Deployment Target Lifecycle Test Matrix](../testing/deployment-target-lifecycle-test-matrix.md)

## Workflow Rules

`servers.show` reads one server identity and status surface. It may compose existing read models to
show:

- server id, name, host, port, provider key, and created timestamp;
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

Server lifecycle mutations must use intention-revealing command names. A future deactivate/delete
slice must specify blocker rules for at least:

- non-terminal deployments;
- resources whose latest placement or domain route still references the server;
- durable domain bindings and server-applied routes;
- terminal sessions;
- retained logs, audit, and support diagnostics.

## Entrypoint Surface Decisions

| Surface | Decision |
| --- | --- |
| CLI | Expose `server show <serverId>` with a positional id. Future lifecycle writes must use explicit verbs and confirmations. |
| HTTP/oRPC | Expose `GET /api/servers/{serverId}` using `ShowServerQueryInput`; no `PATCH /api/servers/{id}` is allowed. |
| Web | Server detail reads `servers.show` for identity, proxy status, credential summary, and rollups. |
| Repository config | Not applicable. Repository config must not select server identity. |
| Future MCP/tools | Generate a read-only tool from the operation catalog entry. |
| Public docs | Existing `server.deployment-target` anchor explains server detail/read semantics and safe next steps. |

## Current Implementation Notes And Migration Gaps

The first Code Round implemented `servers.show` as a read-only API/CLI operation with rollups.
The Web detail follow-up now reads the same query for server identity, proxy status, credential
summary, and rollups while keeping owner-scoped actions such as connectivity test and terminal open
as separate operations.

Server rename, edge-proxy configuration, deactivation, delete safety, and credential usage
visibility are not implemented by this slice.

## Open Questions

- None for `servers.show`.
