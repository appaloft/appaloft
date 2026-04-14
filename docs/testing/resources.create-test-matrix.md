# resources.create Spec-Driven Test Matrix

## Normative Contract

Tests for `resources.create` must verify resource profile creation as a first-class command and must not depend on deployment bootstrap behavior.

The test contract is:

- command success creates a resource and returns `ok({ id })`;
- command success emits or records `resource-created`;
- duplicate slug in the same project/environment returns `err(resource_slug_conflict)`;
- deployment is not started by resource creation;
- first deploy uses `deployments.create(resourceId)` after resource creation.

## Global References

This test matrix inherits:

- [ADR-011: Resource Create Minimum Lifecycle](../decisions/ADR-011-resource-create-minimum-lifecycle.md)
- [ADR-012: Resource Runtime Profile And Deployment Snapshot Boundary](../decisions/ADR-012-resource-runtime-profile-and-deployment-snapshot-boundary.md)
- [resources.create Command Spec](../commands/resources.create.md)
- [resource-created Event Spec](../events/resource-created.md)
- [Resource Lifecycle Error Spec](../errors/resources.lifecycle.md)
- [Resource Create And First Deploy Workflow Spec](../workflows/resources.create-and-first-deploy.md)
- [Spec-Driven Testing](./SPEC_DRIVEN_TESTING.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)

## Test Layers

| Layer | Resource-specific focus |
| --- | --- |
| Value object / aggregate | Resource name/slug/kind/service rules and `resource-created` event emission. |
| Command schema | Input parsing, defaults, and validation failures. |
| Use case admission | Project/environment/destination resolution, context mismatch, duplicate slug guard, persistence. |
| Handler | Handler delegates to use case and returns typed `Result`. |
| Read model/query | Created resource appears in `resources.list` and future `resources.show`. |
| Event/projection | `resource-created` is idempotent for consumers. |
| API/oRPC | `POST /api/resources` uses the command schema and maps structured errors. |
| CLI | `yundu resource create` dispatches `resources.create`. |
| Web | Resource create affordance dispatches `resources.create` and refreshes resource lists/details. |
| Quick Deploy | New resource path calls `resources.create` before `deployments.create(resourceId)`. |

## Given / When / Then Template

```md
Given:
- Existing project/environment/destination/resource state:
- Command input:
- Repository behavior:
- Event bus behavior:

When:
- Dispatch `resources.create`.

Then:
- Command result:
- Persisted resource state:
- Error code/details, if admission failure:
- Events:
- Read-model visibility:
- Follow-up deployment behavior, if this is a first-deploy workflow test:
```

## Command Admission Matrix

| Case | Input | Expected result | Expected error | Expected events | Expected state |
| --- | --- | --- | --- | --- | --- |
| Minimal application resource | `projectId`, `environmentId`, `name` | `ok({ id })` | None | `resource-created` | Resource persisted with kind `application` and derived slug |
| Explicit kind and description | Required fields plus `kind`, `description` | `ok({ id })` | None | `resource-created` | Resource persisted with supplied metadata |
| Default destination supplied | Required fields plus `destinationId` | `ok({ id })` | None | `resource-created` | Resource persisted with destination reference |
| Compose stack with multiple services | `kind = compose-stack`, multiple services | `ok({ id })` | None | `resource-created` | Services persisted |
| Non-compose with multiple services | `kind != compose-stack`, multiple services | `err` | `invariant_violation`, phase `resource-admission` | None | No resource created |
| Missing name | Empty or absent `name` | `err` | `validation_error`, phase `command-validation` | None | No resource created |
| Invalid kind | Unsupported resource kind | `err` | `validation_error`, phase `command-validation` | None | No resource created |
| Missing project | Unknown `projectId` | `err` | `not_found`, phase `context-resolution` | None | No resource created |
| Missing environment | Unknown `environmentId` | `err` | `not_found`, phase `context-resolution` | None | No resource created |
| Environment/project mismatch | Environment belongs to another project | `err` | `resource_context_mismatch`, phase `context-resolution` | None | No resource created |
| Missing destination | Unknown `destinationId` | `err` | `not_found`, phase `context-resolution` | None | No resource created |
| Duplicate slug | Existing resource same project/environment/slug | `err` | `resource_slug_conflict`, phase `resource-admission` | None | Existing resource unchanged |
| Persistence failure | Repository fails before durable state | `err` | `infra_error`, phase `resource-persistence` | None | No accepted resource state |
| Event publication failure before safe success | Event recording fails before command success | `err` | `infra_error`, phase `event-publication` | None or recovery-specific | Caller does not receive accepted success |

## Workflow Matrix

| Case | Given | Expected result | Expected state | Expected operation sequence |
| --- | --- | --- | --- | --- |
| Create then deploy | New resource draft and deployment source | Resource `ok({ id })`; deployment `ok({ id })` | Resource persisted; deployment accepted | `resources.create -> deployments.create(resourceId)` |
| Resource created, deployment admission fails | Resource input valid; deployment input invalid | Resource `ok({ id })`; deployment `err` | Resource remains; no deployment accepted | `resources.create -> deployments.create(resourceId)` |
| Resource created, deployment runtime fails | Resource and deployment admission valid; runtime fails later | Resource `ok`; deployment `ok` | Resource remains; deployment terminal failed | `resources.create -> deployments.create(resourceId) -> async failure state` |
| Quick Deploy new resource path | Web/CLI draft uses new resource | Workflow submits explicit resource create before deploy | Resource id is passed to deployment | Context commands -> `resources.create -> deployments.create(resourceId)` |
| Quick Deploy with source/runtime draft | Web/CLI draft includes source locator and runtime strategy | Resource creation remains profile-only; source/runtime draft flows to deployment as one-shot override | Resource state has no durable source/runtime profile fields | `resources.create -> deployments.create(resourceId)` |

## Event Matrix

| Event | Required assertion |
| --- | --- |
| `resource-created` | Emitted after durable resource persistence; includes resource/project/environment/kind/slug; duplicate consumption does not create duplicate read-model entries or deployments. |

## Current Implementation Notes And Migration Gaps

Current aggregate event name is `resource-created`.

`resources.create` now owns first-deploy source/runtime profile persistence. Tests must assert source binding and runtime profile fields when the command input includes them.

Resource creation through deployment bootstrap is a legacy seam and should not be expanded.

`resources.create` has use-case tests. Additional API/oRPC route, CLI command, and Web behavior tests are still pending.

## Open Questions

- None for the minimum lifecycle.
