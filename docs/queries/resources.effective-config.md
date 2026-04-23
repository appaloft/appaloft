# resources.effective-config Query Spec

## Metadata

- Operation key: `resources.effective-config`
- Query class: `ResourceEffectiveConfigQuery`
- Input schema: `ResourceEffectiveConfigQueryInput`
- Handler: `ResourceEffectiveConfigQueryHandler`
- Query service: `ResourceEffectiveConfigQueryService`
- Domain / bounded context: Workload Delivery / Resource configuration read model
- Current status: active query
- Source classification: normative contract

## Normative Contract

`resources.effective-config` is the source-of-truth query for reading one resource's masked
configuration state.

It returns both:

- resource-owned entries stored directly on the resource; and
- the effective future deployment snapshot view after environment and resource precedence are
  resolved.

The query is read-only. It must not mutate resource, environment, deployment, or runtime state.

```ts
type ResourceEffectiveConfigResult = Result<ResourceEffectiveConfigView, DomainError>;
```

## Global References

This query inherits:

- [ADR-012: Resource Runtime Profile And Deployment Snapshot Boundary](../decisions/ADR-012-resource-runtime-profile-and-deployment-snapshot-boundary.md)
- [resources.set-variable Command Spec](../commands/resources.set-variable.md)
- [resources.unset-variable Command Spec](../commands/resources.unset-variable.md)
- [Resource Profile Lifecycle Workflow](../workflows/resource-profile-lifecycle.md)
- [Resource Lifecycle Error Spec](../errors/resources.lifecycle.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)

## Input Model

```ts
type ResourceEffectiveConfigQueryInput = {
  resourceId: string;
};
```

## Output Model

```ts
type ResourceEffectiveConfigView = {
  schemaVersion: "resources.effective-config/v1";
  resourceId: string;
  environmentId: string;
  ownedEntries: ResourceConfigEntryView[];
  effectiveEntries: ResourceConfigEntryView[];
  precedence: readonly ["defaults", "system", "organization", "project", "environment", "resource", "deployment"];
  generatedAt: string;
};
```

`ResourceConfigEntryView` must include `key`, masked `value`, `kind`, `exposure`, `scope`,
`isSecret`, and `updatedAt` when known.

Required behavior:

- `ownedEntries` includes only `scope = "resource"` entries.
- `effectiveEntries` includes inherited environment entries plus resource overrides.
- when both environment and resource define the same `key + exposure` identity, the effective entry
  must resolve to `scope = "resource"`.
- secret entries must return a masked value rather than plaintext.

## Entrypoints

| Entrypoint | Mapping | Status |
| --- | --- | --- |
| Web | Resource detail configuration section uses this query for owned and effective views. | Required in Code Round |
| CLI | `appaloft resource effective-config <resourceId>`. | Required in Code Round |
| oRPC / HTTP | `GET /api/resources/{resourceId}/effective-config` using the query schema. | Required in Code Round |
| Automation / MCP | Future query/tool over the same operation key. | Future |

## Current Implementation Notes And Migration Gaps

This query is introduced together with resource-scoped variable mutation commands. It must use
masked read models and must not leak secret values even though the write side stores them.
