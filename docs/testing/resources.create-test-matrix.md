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
- [ADR-015: Resource Network Profile](../decisions/ADR-015-resource-network-profile.md)
- [ADR-021: Docker/OCI Workload Substrate](../decisions/ADR-021-docker-oci-workload-substrate.md)
- [ADR-023: Runtime Orchestration Target Boundary](../decisions/ADR-023-runtime-orchestration-target-boundary.md)
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
| CLI | `appaloft resource create` dispatches `resources.create`. |
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

| Test ID | Preferred automation | Case | Input | Expected result | Expected error | Expected events | Expected state |
| --- | --- | --- | --- | --- | --- | --- | --- |
| RES-CREATE-ADM-001 | integration | Minimal application resource | `projectId`, `environmentId`, `name` | `ok({ id })` | None | `resource-created` | Resource persisted with kind `application` and derived slug |
| RES-CREATE-ADM-002 | integration | Explicit kind and description | Required fields plus `kind`, `description` | `ok({ id })` | None | `resource-created` | Resource persisted with supplied metadata |
| RES-CREATE-ADM-003 | integration | Default destination supplied | Required fields plus `destinationId` | `ok({ id })` | None | `resource-created` | Resource persisted with destination reference |
| RES-CREATE-ADM-004 | integration | Application with network profile | Required fields plus `networkProfile.internalPort = 3000` | `ok({ id })` | None | `resource-created` | Resource persisted with resource network profile |
| RES-CREATE-ADM-005 | integration | Git repository root source | Required fields plus `source.kind = git-public`, cloneable repository `locator` | `ok({ id })` | None | `resource-created` | Resource source binding records repository locator; no deployment input source fields |
| RES-CREATE-ADM-006 | integration | GitHub tree URL normalized | Entry draft `https://github.com/coollabsio/coolify-examples/tree/v4.x/bun` normalized before command dispatch | `ok({ id })` | None | `resource-created` | Source binding persists repository locator, `gitRef = v4.x`, `baseDirectory = /bun`, and `originalLocator` |
| RES-CREATE-ADM-007 | integration | Ambiguous Git ref/path split | Deep Git URL contains slash-containing ref and provider lookup cannot prove split | `err` | `validation_error`, phase `resource-source-resolution` | None | No resource created |
| RES-CREATE-ADM-008 | integration | Local folder with base directory | `source.kind = local-folder`, local folder locator, `baseDirectory = /apps/api` | `ok({ id })` | None | `resource-created` | Source binding records selected folder and source-root-relative base directory |
| RES-CREATE-ADM-009 | integration | Invalid source base directory | Source metadata has `baseDirectory` with `..`, URL, shell metacharacter, or host absolute path semantics | `err` | `validation_error`, phase `resource-source-resolution` | None | No resource created |
| RES-CREATE-ADM-010 | integration | Docker image tag source | `source.kind = docker-image`, image name plus tag metadata, `runtimeProfile.strategy = prebuilt-image` | `ok({ id })` | None | `resource-created` | Source binding records image name/tag; runtime profile records prebuilt image strategy |
| RES-CREATE-ADM-011 | integration | Docker image digest source | `source.kind = docker-image`, image name plus digest metadata | `ok({ id })` | None | `resource-created` | Source binding records digest identity; tag is absent or ignored |
| RES-CREATE-ADM-012 | integration | Docker image tag and digest conflict | Docker image source includes both tag and digest as competing identity values | `err` | `validation_error`, phase `resource-source-resolution` | None | No resource created |
| RES-CREATE-ADM-013 | integration | Dockerfile path with source tree | Git or local source plus `runtimeProfile.strategy = dockerfile` and Dockerfile path | `ok({ id })` | None | `resource-created` | Source binding owns base directory; runtime profile owns Dockerfile path |
| RES-CREATE-ADM-014 | integration | Compose file path with source tree | Git or local source plus `runtimeProfile.strategy = docker-compose` and Compose file path | `ok({ id })` | None | `resource-created` | Source binding owns base directory; runtime profile owns Compose file path |
| RES-CREATE-ADM-015 | integration | Auto strategy creates image plan | Buildable source plus `runtimeProfile.strategy = auto` | `ok({ id })` | None | `resource-created` | Runtime profile records an image-producing planner strategy, not host-process execution |
| RES-CREATE-ADM-016 | integration | Workspace commands create image plan | Buildable source plus `runtimeProfile.strategy = workspace-commands` | `ok({ id })` | None | `resource-created` | Runtime profile records command defaults that will be packaged into a Docker/OCI image during deployment planning |
| RES-CREATE-ADM-017 | integration | Orchestrator-specific runtime profile fields | Runtime profile input includes Kubernetes namespace, manifest, Helm values, Swarm stack fields, replica count, ingress class, or pull-secret fields | `err` | `validation_error`, phase `command-validation` or `resource-admission` | None | Resource runtime profile remains provider-neutral; orchestrator placement belongs to future target/profile specs |
| RES-CREATE-ADM-018 | integration | HTTP health check policy | Runtime profile includes enabled HTTP health policy with path, expected status, interval, timeout, retries, and start period | `ok({ id })` | None | `resource-created` | Runtime profile persists reusable health check policy and mirrors HTTP path for current runtime adapters |
| RES-CREATE-ADM-019 | integration | Invalid internal listener port | Required fields plus invalid `networkProfile.internalPort` | `err` | `validation_error`, phase `resource-network-resolution` or `command-validation` | None | No resource created |
| RES-CREATE-ADM-020 | integration | Reverse-proxy exposure without host port | Inbound HTTP resource with `internalPort`, default exposure | `ok({ id })` | None | `resource-created` | Resource network profile has `internalPort`; no host-published port required |
| RES-CREATE-ADM-021 | integration | Direct-port host publication | `exposureMode = direct-port`, `hostPort` supplied | `ok({ id })` | None | `resource-created` | Resource network profile records explicit direct-port exposure |
| RES-CREATE-ADM-022 | integration | Host port without direct exposure | `hostPort` supplied with reverse-proxy exposure | `err` | `validation_error`, phase `resource-network-resolution` | None | No resource created |
| RES-CREATE-ADM-023 | integration | Compose stack ambiguous target | `kind = compose-stack`, multiple inbound services, no `targetServiceName` | `err` | `validation_error`, phase `resource-network-resolution` | None | No resource created |
| RES-CREATE-ADM-024 | integration | Compose stack with multiple services | `kind = compose-stack`, multiple services | `ok({ id })` | None | `resource-created` | Services persisted |
| RES-CREATE-ADM-025 | integration | Non-compose with multiple services | `kind != compose-stack`, multiple services | `err` | `invariant_violation`, phase `resource-admission` | None | No resource created |
| RES-CREATE-ADM-026 | integration | Missing name | Empty or absent `name` | `err` | `validation_error`, phase `command-validation` | None | No resource created |
| RES-CREATE-ADM-027 | integration | Invalid kind | Unsupported resource kind | `err` | `validation_error`, phase `command-validation` | None | No resource created |
| RES-CREATE-ADM-028 | integration | Missing project | Unknown `projectId` | `err` | `not_found`, phase `context-resolution` | None | No resource created |
| RES-CREATE-ADM-029 | integration | Missing environment | Unknown `environmentId` | `err` | `not_found`, phase `context-resolution` | None | No resource created |
| RES-CREATE-ADM-030 | integration | Environment/project mismatch | Environment belongs to another project | `err` | `resource_context_mismatch`, phase `context-resolution` | None | No resource created |
| RES-CREATE-ADM-031 | integration | Missing destination | Unknown `destinationId` | `err` | `not_found`, phase `context-resolution` | None | No resource created |
| RES-CREATE-ADM-032 | integration | Duplicate slug | Existing resource same project/environment/slug | `err` | `resource_slug_conflict`, phase `resource-admission` | None | Existing resource unchanged |
| RES-CREATE-ADM-033 | integration | Persistence failure | Repository fails before durable state | `err` | `infra_error`, phase `resource-persistence` | None | No accepted resource state |
| RES-CREATE-ADM-034 | integration | Event publication failure before safe success | Event recording fails before command success | `err` | `infra_error`, phase `event-publication` | None or recovery-specific | Caller does not receive accepted success |

## Workflow Matrix

| Test ID | Preferred automation | Case | Given | Expected result | Expected state | Expected operation sequence |
| --- | --- | --- | --- | --- | --- | --- |
| RES-CREATE-WF-001 | e2e-preferred | Create then deploy | New resource draft and deployment source | Resource `ok({ id })`; deployment `ok({ id })` | Resource persisted; deployment accepted | `resources.create -> deployments.create(resourceId)` |
| RES-CREATE-WF-002 | e2e-preferred | Resource created, deployment admission fails | Resource input valid; deployment input invalid | Resource `ok({ id })`; deployment `err` | Resource remains; no deployment accepted | `resources.create -> deployments.create(resourceId)` |
| RES-CREATE-WF-003 | e2e-preferred | Resource created, deployment runtime fails | Resource and deployment admission valid; runtime fails later | Resource `ok`; deployment `ok` | Resource remains; deployment terminal failed | `resources.create -> deployments.create(resourceId) -> async failure state` |
| RES-CREATE-WF-004 | e2e-preferred | Quick Deploy new resource path | Web/CLI draft uses new resource | Workflow submits explicit resource create before deploy | Resource id is passed to deployment | Context commands -> `resources.create -> deployments.create(resourceId)` |
| RES-CREATE-WF-005 | e2e-preferred | Quick Deploy with source/runtime/network draft | Web/CLI draft includes source locator, runtime strategy, and internal listener port | Resource creation persists source/runtime/network profile; deployment uses resource id | Resource state owns durable source/runtime/network profile; deployment stores resolved snapshots | `resources.create -> deployments.create(resourceId)` |
| RES-CREATE-WF-006 | e2e-preferred | Quick Deploy with source variant draft | Web/CLI draft includes deep Git URL, local base directory, Docker image tag/digest, Dockerfile path, or Compose path | Resource creation persists normalized variant fields; deployment uses resource id | Resource state owns source variant identity and runtime strategy-specific file/command fields | Entry normalization -> `resources.create -> deployments.create(resourceId)` |

## Event Matrix

| Test ID | Preferred automation | Event | Required assertion |
| --- | --- | --- | --- |
| RES-CREATE-EVT-001 | integration | `resource-created` | Emitted after durable resource persistence; includes resource/project/environment/kind/slug; duplicate consumption does not create duplicate read-model entries or deployments. |

## Current Implementation Notes And Migration Gaps

Current aggregate event name is `resource-created`.

`resources.create` now owns first-deploy source/runtime/network profile persistence. Tests must assert source binding, runtime profile, health check policy, and network profile fields when the command input includes them.

Source variant tests are normative even while implementation still stores some values in generic
metadata. Assertions should treat `gitRef`, `baseDirectory`, Docker image tag/digest, Dockerfile
path, Compose file path, and `originalLocator` as typed contract fields once the source variant
schema is implemented.

Resource creation through deployment bootstrap is a legacy seam and should not be expanded.

`resources.create` has use-case tests. Additional API/oRPC route, CLI command, and Web behavior tests are still pending.

## Open Questions

- None for the minimum lifecycle.
