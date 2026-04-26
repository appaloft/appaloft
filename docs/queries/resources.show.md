# resources.show Query Spec

## Metadata

- Operation key: `resources.show`
- Query class: `ShowResourceQuery`
- Input schema: `ShowResourceQueryInput`
- Handler: `ShowResourceQueryHandler`
- Query service: `ShowResourceQueryService`
- Domain / bounded context: Workload Delivery / Resource read model
- Current status: active query
- Source classification: normative contract

## Normative Contract

`resources.show` is the source-of-truth query for one resource detail/profile surface.

It is read-only. It must not create deployments, mutate source/runtime/network/access/health profile,
archive or delete a resource, open terminal sessions, bind domains, issue certificates, apply proxy
routes, or perform runtime probes.

```ts
type ShowResourceResult = Result<ResourceDetail, DomainError>;
```

The query contract is:

- validation failure returns `err(DomainError)`;
- missing or invisible resource returns `err(DomainError)`;
- success returns `ok(ResourceDetail)`;
- optional related sections may contain unavailable or stale markers inside `ok`;
- current runtime health remains `resources.health`, not `resources.show`.

## Global References

This query inherits:

- [ADR-011: Resource Create Minimum Lifecycle](../decisions/ADR-011-resource-create-minimum-lifecycle.md)
- [ADR-012: Resource Runtime Profile And Deployment Snapshot Boundary](../decisions/ADR-012-resource-runtime-profile-and-deployment-snapshot-boundary.md)
- [ADR-013: Project Resource Navigation And Deployment Ownership](../decisions/ADR-013-project-resource-navigation-and-deployment-ownership.md)
- [ADR-015: Resource Network Profile](../decisions/ADR-015-resource-network-profile.md)
- [ADR-017: Default Access Domain And Proxy Routing](../decisions/ADR-017-default-access-domain-and-proxy-routing.md)
- [resources.create Command Spec](../commands/resources.create.md)
- [resources.configure-access Command Spec](../commands/resources.configure-access.md)
- [resources.configure-health Command Spec](../commands/resources.configure-health.md)
- [Resource Profile Lifecycle Workflow](../workflows/resource-profile-lifecycle.md)
- [Resource Lifecycle Error Spec](../errors/resources.lifecycle.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)

## Input Model

```ts
type ShowResourceQueryInput = {
  resourceId: string;
  includeLatestDeployment?: boolean;
  includeAccessSummary?: boolean;
  includeProfileDiagnostics?: boolean;
};
```

| Field | Requirement | Meaning |
| --- | --- | --- |
| `resourceId` | Required | Resource whose detail profile is requested. |
| `includeLatestDeployment` | Optional | Includes latest deployment context when the read model can provide it. Defaults to `true` for detail pages. |
| `includeAccessSummary` | Optional | Includes generated/default access and durable domain route summary when available. Defaults to `true` for detail pages. |
| `includeProfileDiagnostics` | Optional | Includes safe source/runtime/network profile warnings. Defaults to `false` for compact consumers. |

The query input must not accept source locators, deployment command fields, mutable profile fields,
raw provider ids, shell commands, host paths, tokens, credentials, or live-probe flags.

## Output Model

```ts
type ResourceDetail = {
  schemaVersion: "resources.show/v1";
  resource: ResourceDetailIdentity;
  source?: ResourceDetailSourceProfile;
  runtimeProfile?: ResourceDetailRuntimeProfile;
  networkProfile?: ResourceDetailNetworkProfile;
  accessProfile?: ResourceDetailAccessProfile;
  healthPolicy?: ResourceDetailHealthPolicy;
  accessSummary?: ResourceDetailAccessSummary;
  latestDeployment?: ResourceDetailDeploymentContext;
  lifecycle: ResourceDetailLifecycle;
  diagnostics: ResourceDetailProfileDiagnostic[];
  generatedAt: string;
};
```

Required behavior:

- `resource` includes ids, project/environment context, name, slug, kind, optional description,
  services, default destination, created timestamp, and updated timestamp when available.
- `source` is the persisted `ResourceSourceBinding` in display-safe form. Secrets and credentials
  must be masked or omitted.
- `runtimeProfile` shows planning defaults such as `RuntimePlanStrategy`, optional `runtimeName`,
  Dockerfile path, Docker Compose path, static publish directory, build target, and command
  defaults. Health policy may be summarized, but `resources.configure-health` remains the mutation
  command.
- `networkProfile` shows `internalPort`, `upstreamProtocol`, `exposureMode`, optional
  `targetServiceName`, and explicit `hostPort` only when a direct-port profile is accepted.
- `accessProfile` shows resource-owned generated access preferences, including
  `generatedAccessMode` and normalized generated route `pathPrefix`.
- `accessSummary` reports resource-owned access state from read models. It must not infer domain
  ownership from deployment snapshots.
- `latestDeployment` is contextual history only. It must not override resource lifecycle or health.
- `lifecycle.status` is one of `active`, `archived`, or `deleted` where deleted may only appear in
  retained audit/read models. Active read paths should normally return `not_found` after deletion.
- `diagnostics` contain safe profile warnings such as missing source, missing internal port, static
  strategy without publish directory, or profile drift. They are not command admission failures.

## Status And Ownership Rules

`resources.show` is the full resource detail query. Compact sidebar or navigation status remains a
separate future choice: it may be added to `resources.list`, a future `resources.summary`, or a
navigation read model.

When a resource is archived, the query still returns the detail profile and lifecycle status so
operators can inspect history, diagnostics, runtime logs, health, and support context where those
read models retain data.

When a resource is deleted, the normal query returns `not_found`. Audit-only deleted-resource reads
need a separate future query if the product requires them.

## Error Contract

Whole-query failures are limited to invalid input, missing resource, permission failures, or
inability to build a safe response.

All errors use [Resource Lifecycle Error Spec](../errors/resources.lifecycle.md). `details.phase`
must use `resource-read` for read-model resolution failures after input validation.

## Entrypoints

| Entrypoint | Mapping | Status |
| --- | --- | --- |
| Web | Resource detail default/overview page uses this query as the durable profile source. | Active |
| CLI | `appaloft resource show <resourceId> [--json]`. | Active |
| oRPC / HTTP | `GET /api/resources/{resourceId}` using the query schema. | Active |
| Automation / MCP | Future query/tool over the same operation key. | Future |

## Current Implementation Notes And Migration Gaps

`resources.show` is active in application, operation catalog, CLI, HTTP/oRPC, and the Web resource
detail page. The query service assembles durable profile fields from the `Resource` aggregate and
uses read-side deployment/access summaries only as contextual observation data.

Archived lifecycle state is active and returned as `lifecycle.status = "archived"` for retained
resources. Deleted lifecycle state remains future Resource Profile Lifecycle work; after
`resources.delete` lands, normal `resources.show` must return `not_found` for deleted resources
unless a future audit-only query is introduced.

## Open Questions

- None for the full resource detail query. Compact navigation status remains a separate future
  read-model decision.
