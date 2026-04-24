# Deployment Target Lifecycle Implementation Plan

## Source Of Truth

This document plans the Code Round for `servers.show`. It does not replace the query, workflow,
error, or test-matrix specs.

## Governed Specs

- [Deployment Target Lifecycle Workflow](../workflows/deployment-target-lifecycle.md)
- [servers.show Query Spec](../queries/servers.show.md)
- [Deployment Target Lifecycle Error Spec](../errors/servers.lifecycle.md)
- [Deployment Target Lifecycle Test Matrix](../testing/deployment-target-lifecycle-test-matrix.md)
- [Server Bootstrap And Proxy Workflow](../workflows/server-bootstrap-and-proxy.md)
- [Core Operations](../CORE_OPERATIONS.md)
- [Domain Model](../DOMAIN_MODEL.md)

## Expected Application Scope

Add a vertical query slice under `packages/application/src/operations/servers/`:

- `show-server.schema.ts`;
- `show-server.query.ts`;
- `show-server.handler.ts`;
- `show-server.query-service.ts`.

Add application types and tokens as needed:

- `ServerDetail`;
- `ServerRollups`;
- `tokens.showServerQueryService`.

The query handler must delegate to the query service and return the typed `Result`.

## Expected Read-Model Scope

The first implementation may compose existing read models:

- `ServerReadModel.findOne` for base server identity, credential summary, and edge proxy status;
- `DeploymentReadModel.list` filtered by selected server id for deployment status rollups;
- `DomainBindingReadModel.list` filtered by selected server id for durable domain rollups.

The query must not run live SSH, Docker, DNS, proxy, or runtime probes.

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
```

Do not expose `PATCH /api/servers/{serverId}` or generic `appaloft server update`.

## Expected Web Scope

Web server detail migration is deferred for this first slice. The existing Web server detail page
may continue composing list/detail-adjacent queries until a focused Web round moves it to
`servers.show`.

## Minimal Deliverable

- `servers.show` is active in `CORE_OPERATIONS.md` and `operation-catalog.ts`;
- application query slice returns server detail plus resource/deployment/domain rollups;
- CLI and HTTP/oRPC dispatch through `ShowServerQuery`;
- contracts and typed clients expose the response shape;
- public docs coverage maps the operation to the server deployment-target anchor;
- focused tests cover `SRV-LIFE-SHOW-001`, `SRV-LIFE-SHOW-002`, `SRV-LIFE-SHOW-003`, and
  `SRV-LIFE-ENTRY-002`.

## Verification

Run targeted checks before publishing:

- `bun test packages/application/test/show-server.test.ts`
- `bun test packages/orpc/test/server-show.http.test.ts`
- `bun test packages/application/test/operation-catalog-boundary.test.ts`
- `bun test packages/docs-registry/test/operation-coverage.test.ts`
- `bun run lint`
- `bun run typecheck`

## Current Implementation Notes And Migration Gaps

Server rename, edge-proxy configuration, deactivate/delete safety, credential usage visibility,
and Web server detail migration remain future work.

## Open Questions

- None for this slice.
