# environments.effective-precedence Query Spec

## Metadata

- Operation key: `environments.effective-precedence`
- Query class: `EnvironmentEffectivePrecedenceQuery`
- Input schema: `EnvironmentEffectivePrecedenceQueryInput`
- Handler: `EnvironmentEffectivePrecedenceQueryHandler`
- Query service: `EnvironmentEffectivePrecedenceQueryService`
- Domain / bounded context: Workspace / Configuration read model
- Current status: active query
- Source classification: normative contract

## Normative Contract

`environments.effective-precedence` is the source-of-truth query for reading one environment's
masked variable entries and the environment-level effective value for each `key + exposure`
identity after config-scope precedence is resolved.

It returns both:

- entries stored directly on the environment; and
- the effective environment contribution to future deployment snapshot materialization before
  resource overrides are applied.

The query is read-only. It must not mutate environment, resource, deployment, runtime, or snapshot
state.

```ts
type EnvironmentEffectivePrecedenceResult = Result<EnvironmentEffectivePrecedenceView, DomainError>;
```

## Global References

This query inherits:

- [ADR-012: Resource Runtime Profile And Deployment Snapshot Boundary](../decisions/ADR-012-resource-runtime-profile-and-deployment-snapshot-boundary.md)
- [ADR-030: Public Documentation Round And Platform](../decisions/ADR-030-public-documentation-round-and-platform.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)
- [Variable Precedence Public Docs](../../apps/docs/src/content/docs/environments/variables/precedence.md)

## Input Model

```ts
type EnvironmentEffectivePrecedenceQueryInput = {
  environmentId: string;
};
```

## Output Model

```ts
type EnvironmentEffectivePrecedenceView = {
  schemaVersion: "environments.effective-precedence/v1";
  environmentId: string;
  projectId: string;
  ownedEntries: EnvironmentConfigEntryView[];
  effectiveEntries: EnvironmentConfigEntryView[];
  precedence: readonly ["defaults", "system", "organization", "project", "environment", "resource", "deployment"];
  generatedAt: string;
};
```

`EnvironmentConfigEntryView` must include `key`, masked `value`, `kind`, `exposure`, `scope`,
`isSecret`, and `updatedAt` when known.

Required behavior:

- `ownedEntries` includes every variable entry currently stored on the environment, in safe masked
  form.
- `effectiveEntries` includes exactly one entry per `key + exposure` identity after precedence
  resolution.
- when multiple stored entries share the same `key + exposure`, the effective entry uses the
  highest-precedence scope.
- secret entries must return a masked value rather than plaintext in both owned and effective
  entries.
- missing or invisible environment ids return `not_found`.

## Error Contract

Whole-query failures are limited to invalid input, missing environment, permission failures, or
inability to build a safe response.

| Error code | Phase | Retriable | Meaning |
| --- | --- | --- | --- |
| `validation_error` | `query-validation` | No | Input shape or environment id is invalid. |
| `not_found` | `environment-read` | No | The environment does not exist or is not visible. |
| `infra_error` | `environment-read` | Conditional | Repository/read-model infrastructure failed. |

## Entrypoints

| Entrypoint | Mapping | Status |
| --- | --- | --- |
| Web | No new environment detail page in this slice; existing resource effective config remains the Web resource override view. | Not applicable |
| CLI | `appaloft env effective-precedence <environmentId>`. | Active |
| oRPC / HTTP | `GET /api/environments/{environmentId}/effective-precedence` using the query schema. | Active |
| Automation / MCP | Future query/tool over the same operation key. | Future |

## Current Implementation Notes And Migration Gaps

The query is introduced as a Phase 4 read surface. It uses existing environment aggregate snapshot
materialization and existing secret masking rules. There are no planned migration gaps for this
behavior.

## Open Questions

- None for this query boundary.
