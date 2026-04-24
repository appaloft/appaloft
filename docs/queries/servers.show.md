# servers.show Query Spec

## Metadata

- Operation key: `servers.show`
- Query class: `ShowServerQuery`
- Input schema: `ShowServerQueryInput`
- Handler: `ShowServerQueryHandler`
- Query service: `ShowServerQueryService`
- Domain / bounded context: Runtime topology / DeploymentTarget detail read model
- Current status: active query
- Source classification: normative contract

## Normative Contract

`servers.show` is the source-of-truth query for one deployment target/server detail surface.

It is read-only. It must not:

- test connectivity;
- bootstrap or repair proxy infrastructure;
- configure credentials;
- rename, deactivate, delete, or otherwise mutate server lifecycle state;
- inspect live Docker, SSH, DNS, domain, certificate, or workload runtime state.

```ts
type ShowServerResult = Result<ServerDetail, DomainError>;
```

The query contract is:

- validation failure returns `err(DomainError)`;
- missing or invisible server returns `err(DomainError)`;
- success returns `ok(ServerDetail)`;
- rollups are derived from existing read models and may be omitted only when the caller explicitly
  opts out.

## Global References

This query inherits:

- [ADR-004: Server Readiness State Storage](../decisions/ADR-004-server-readiness-state-storage.md)
- [ADR-019: Edge Proxy Provider And Observable Configuration](../decisions/ADR-019-edge-proxy-provider-and-observable-configuration.md)
- [ADR-026: Aggregate Mutation Command Boundary](../decisions/ADR-026-aggregate-mutation-command-boundary.md)
- [Deployment Target Lifecycle Workflow](../workflows/deployment-target-lifecycle.md)
- [Deployment Target Lifecycle Error Spec](../errors/servers.lifecycle.md)
- [Deployment Target Lifecycle Test Matrix](../testing/deployment-target-lifecycle-test-matrix.md)
- [Deployment Target Lifecycle Implementation Plan](../implementation/deployment-target-lifecycle-plan.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)

## Input Model

```ts
type ShowServerQueryInput = {
  serverId: string;
  includeRollups?: boolean;
};
```

| Field | Requirement | Meaning |
| --- | --- | --- |
| `serverId` | Required | Deployment target/server to read. |
| `includeRollups` | Optional, defaults to `true` | Include deployment, resource, and domain rollups derived from read models. |

The input must not accept provider-native ids, credential secrets, deployment admission fields,
proxy repair options, resource configuration fields, domain names, or live-probe flags.

## Output Model

```ts
type ServerDetail = {
  schemaVersion: "servers.show/v1";
  server: ServerSummary;
  rollups?: {
    resources: {
      total: number;
      deployedResourceIds: string[];
    };
    deployments: {
      total: number;
      statusCounts: Array<{ status: DeploymentStatus; count: number }>;
      latestDeploymentId?: string;
      latestDeploymentStatus?: DeploymentStatus;
    };
    domains: {
      total: number;
      statusCounts: Array<{ status: DomainBindingStatus; count: number }>;
      latestDomainBindingId?: string;
      latestDomainBindingStatus?: DomainBindingStatus;
    };
  };
  generatedAt: string;
};
```

`server` includes existing server identity, host/port, provider key, credential summary with masked
secret booleans, edge proxy kind/status, and last safe proxy error metadata.

Rollups are observational:

- resource totals count distinct resources with deployments or domain bindings on the selected
  server;
- deployment totals and status counts are derived from deployment read models for the selected
  server;
- domain totals and status counts are derived from domain binding read models for the selected
  server;
- latest deployment/domain fields are navigation aids, not mutation guards.

Write-side admission rules must not use these rollups as the only source of truth.

## Error Contract

All whole-query failures use [Deployment Target Lifecycle Error Spec](../errors/servers.lifecycle.md).

| Error code | Phase | Retriable | Meaning |
| --- | --- | --- | --- |
| `validation_error` | `query-validation` | No | `serverId` or optional input is invalid. |
| `not_found` | `server-read` | No | Server does not exist or is not visible. |
| `infra_error` | `server-read` | Conditional | Base server read model cannot be safely read. |
| `infra_error` | `server-rollup-read` | Conditional | Rollups cannot be safely derived. |

If rollup derivation fails, implementations may either fail the whole query with
`phase = server-rollup-read` or return a future section-level unavailable marker after that marker
is specified. The first active slice fails the whole query so CLI/API users do not mistake missing
rollups for zero usage.

## Entrypoints

| Entrypoint | Mapping | Status |
| --- | --- | --- |
| Web | Server detail page reads this query for identity, proxy status, credential summary, and rollups. | Active |
| CLI | `appaloft server show <serverId>`. | Active |
| oRPC / HTTP | `GET /api/servers/{serverId}` using the query schema. | Active |
| Repository config | Not applicable. Repository config must not select server identity. | Not applicable |
| Automation / MCP | Future query/tool over the same operation key. | Future |
| Public docs | Existing `server.deployment-target` anchor covers read/detail semantics. | Active |

## Current Implementation Notes And Migration Gaps

The active implementation exposes `servers.show` through application, operation catalog,
HTTP/oRPC, CLI, Web server detail, contracts, and public docs coverage.

Server rename, edge-proxy configuration, deactivate, and delete safety remain future lifecycle
commands. They must not be exposed as generic `servers.update`.

Credential usage visibility beyond the selected server's credential summary remains future
credential lifecycle work.

## Open Questions

- None for the first server detail query slice.
