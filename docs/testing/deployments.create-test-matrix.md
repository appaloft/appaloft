# deployments.create Spec-Driven Test Matrix

## Normative Contract

Tests for `deployments.create` must follow the command, event, workflow, error, and async lifecycle specs rather than implementation call structure alone.

Deployment-specific canonical assertions:

- command success means request accepted;
- post-acceptance runtime failure persists failed state and keeps the original command `ok({ id })`;
- all v1 runtime strategies resolve to a Docker/OCI image artifact or Docker Compose project before
  runtime rollout starts;
- runtime target backend selection is provider-neutral and uses the selected deployment target,
  destination, provider key, target kind, and registered capabilities instead of Web/CLI/API input;
- Docker runtime verification failures persist actionable container diagnostics, including container
  state and recent application logs when the container started or exited before verification;
- HTTP verification failures persist the last observed HTTP status or fetch error instead of only a
  generic timeout;
- reverse-proxy deployments allow different resources to share the same `internalPort` on the same
  target without stopping each other;
- direct-port deployments treat the host port as the collision boundary and must fail or reject a
  collision without removing another resource;
- terminal events are `deployment-succeeded` and `deployment-failed`;
- `build-requested` is emitted when build/package work is required;
- retry creates a new deployment attempt.

## Global References

This test matrix inherits:

- [ADR-001: deployments.create HTTP API Required Fields](../decisions/ADR-001-deploy-api-required-fields.md)
- [ADR-002: Routing, Domain, And TLS Boundary](../decisions/ADR-002-routing-domain-tls-boundary.md)
- [ADR-010: Quick Deploy Workflow Boundary](../decisions/ADR-010-quick-deploy-workflow-boundary.md)
- [ADR-012: Resource Runtime Profile And Deployment Snapshot Boundary](../decisions/ADR-012-resource-runtime-profile-and-deployment-snapshot-boundary.md)
- [ADR-014: Deployment Admission Uses Resource Profile](../decisions/ADR-014-deployment-admission-uses-resource-profile.md)
- [ADR-015: Resource Network Profile](../decisions/ADR-015-resource-network-profile.md)
- [ADR-017: Default Access Domain And Proxy Routing](../decisions/ADR-017-default-access-domain-and-proxy-routing.md)
- [ADR-021: Docker/OCI Workload Substrate](../decisions/ADR-021-docker-oci-workload-substrate.md)
- [ADR-023: Runtime Orchestration Target Boundary](../decisions/ADR-023-runtime-orchestration-target-boundary.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)
- [Spec-Driven Testing](./SPEC_DRIVEN_TESTING.md)
- [Quick Deploy Test Matrix](./quick-deploy-test-matrix.md)

This file defines deployment-specific test cases and expected business outcomes.

## Test Layers

| Layer | Deployment-specific focus |
| --- | --- |
| Command schema | Shared input shape and immediate `Result` failures. |
| Command handler | Handler delegates to application use case without transport/persistence logic. |
| Use case admission | Context resolution, redeploy guard, source detection, plan resolution, and request acceptance. |
| Aggregate/state-machine | Deployment state transitions and terminal states. |
| Event/process manager | Formal event emission, payload, ordering, idempotency, retry, and terminal failed state. |
| Runtime target backend | Backend registry selection, capability matching, provider-neutral render/apply/verify results, and normalized failure details. |
| Entry workflow | Web/CLI/API input collection differences converge on the same command. |
| Contract/e2e | Caller result and read-model status progression. |

## Given / When / Then Template

```md
Given:
- Existing aggregate/read-model state:
- Command input:
- Bootstrap/context behavior:
- Source detector behavior:
- Runtime plan resolver behavior:
- Runtime/process behavior:

When:
- Dispatch `deployments.create`.

Then:
- Command result:
- Persisted deployment state:
- Error code/details, if admission failure:
- Events:
- Async process state:
- Retry/idempotency behavior:
```

## Command Admission Matrix

| Case | Input | Expected result | Expected error | Expected events | Expected state |
| --- | --- | --- | --- | --- | --- |
| Valid explicit context | project/server/destination/environment/resource ids; resource has source/runtime/network profile | `ok({ id })` | None | `deployment-requested`; later async events | Accepted deployment state exists with runtime and network plan snapshots |
| Valid context with default destination seam | project/server/environment/resource ids; resource has source/runtime/network profile; destination omitted | `ok({ id })` when server default destination can be resolved | None | `deployment-requested`; later async events | Accepted deployment state uses resolved destination |
| Resource lacks source binding | Context ids resolve, but resource has no source binding | `err` | `validation_error`, phase `resource-source-resolution` | None for accepted request | No accepted deployment |
| Resource has unnormalized deep Git URL | Context ids resolve, but resource source locator is a GitHub `/tree/<ref>/<path>` URL without normalized repository/ref/base directory metadata | `err` | `validation_error`, phase `resource-source-resolution` | None for accepted request | No accepted deployment; runtime must not call `git clone` with browser tree URL |
| Resource has normalized Git base directory | Context ids resolve; resource source has repository locator, `gitRef`, and `baseDirectory` | `ok({ id })` when runtime profile is compatible | None | `deployment-requested`; later async events | Deployment snapshot resolves source from repository/ref/base directory |
| Resource has Docker image tag/digest | Context ids resolve; resource source is a Docker image with tag or digest and runtime strategy is `prebuilt-image` | `ok({ id })` | None | `deployment-requested`; later async events | Deployment snapshot uses prebuilt image identity |
| Auto or workspace strategy resolves image artifact | Context ids resolve; source is buildable and runtime strategy is `auto` or `workspace-commands` | `ok({ id })` when planner can produce a containerizable artifact plan | None | `deployment-requested -> build-requested` | Deployment snapshot records Docker/OCI artifact intent; no host-process runtime plan is accepted |
| Docker Compose strategy resolves Compose artifact | Context ids resolve; source/runtime profile identifies Compose file and target service when inbound traffic is needed | `ok({ id })` | None | `deployment-requested`; `build-requested` when any service build is required | Deployment snapshot records resource/deployment-scoped Compose project identity and target service |
| Runtime command specs are typed | Accepted plan requires Docker build/run/Compose steps | `ok({ id })` when rendered command specs execute successfully | None | `deployment-requested`; later async events | Runtime command construction uses typed specs for Docker operations; shell command strings appear only as adapter-rendered local/SSH output |
| Single-server runtime target backend resolves | Context ids resolve; selected target kind/provider key has a backend with `runtime.apply`, `runtime.verify`, and `runtime.logs` capabilities | `ok({ id })` | None | `deployment-requested`; later async events | Deployment execution selects the registered target backend without Web/CLI/API provider-specific input |
| Unsupported runtime target backend | Context ids resolve; selected target kind/provider key has no backend with required runtime capabilities | `err` before acceptance when safely detectable | `runtime_target_unsupported`, phase `runtime-target-resolution` | None for accepted request | No accepted deployment |
| Cluster target fields in command input | Input includes Kubernetes namespace, manifest, Helm values, Swarm stack, replica, ingress class, or pull-secret fields | `err` at command schema/API boundary | `validation_error`, phase `command-validation` | None | No deployment created; orchestrator configuration must come from target/profile specs |
| Inbound resource lacks network profile | Context ids resolve, but inbound resource has no internal listener port | `err` | `validation_error`, phase `resource-network-resolution` | None for accepted request | No accepted deployment |
| Resource network profile resolves reverse-proxy target | Resource has `networkProfile.internalPort` and reverse-proxy exposure | `ok({ id })` | None | `deployment-requested`; later async events | Deployment snapshot includes resolved network target without requiring host port |
| Two reverse-proxy resources share internal port | Two resources on the same server/destination both have `networkProfile.internalPort = 3000` and reverse-proxy exposure | Both deployments can be accepted when each latest attempt is terminal | None | Separate `deployment-requested` events | Runtime plan snapshots keep separate resource/deployment identity and do not require a unique host port |
| Generated default access route resolves | Resource reverse-proxy profile, server proxy ready, default access policy enabled | `ok({ id })` | None | `deployment-requested`; later route realization/progress | Deployment snapshot includes provider-neutral generated access route metadata; `ResourceAccessSummary` projects current generated URL |
| Generated access provider unavailable before acceptance | Generated route is required but provider cannot return a hostname before safe acceptance | `err` | provider/default access error, phase `default-access-domain-generation` | None | No accepted deployment |
| Proxy not ready for generated route | Resource reverse-proxy profile, policy enabled, server edge proxy failed/not ready | `err` or post-acceptance failure according to detection phase | `proxy_not_ready` or proxy error, phase `proxy-readiness` | No success event for accepted route | No direct host-port fallback |
| Incompatible resource source/strategy pair | Resource source descriptor cannot be planned by the runtime profile strategy | `err` | `validation_error` or `provider_error`, phase `runtime-plan-resolution` | None for accepted request | No accepted deployment |
| Legacy source/runtime/network fields | Input includes `sourceLocator`, `source`, `deploymentMethod`, command override fields, `port`, or `networkProfile` | `err` at command schema/API boundary | `validation_error`, phase `command-validation` | None | No deployment created |
| Unresolved project/environment/server/destination/resource | Context cannot be resolved after bootstrap | `err` | `validation_error` or `not_found`, phase `context-resolution` | None | No deployment created |
| Context mismatch | Environment/resource/destination does not match project/server context | `err` | `validation_error`, phase `context-resolution` | None | No deployment created |
| Active latest deployment | Latest deployment for same resource is non-terminal | `err` | `deployment_not_redeployable`, phase `redeploy-guard` | None for new attempt | No new deployment created |
| Direct host-port collision | Different resource already owns the same effective direct `hostPort` on the same server/destination | `err` when safely detected before acceptance, otherwise accepted attempt later fails | `conflict`, phase `admission-conflict`, or failed deployment with phase `runtime-execution` | No success event for the conflicting attempt | Existing resource runtime is not removed to free the port |
| Invalid runtime plan | Plan has no executable steps or invalid VO state | `err` | `validation_error` or `invariant_violation` | None for accepted request | No accepted deployment |

## Async Progression Matrix

| Case | Given | Expected command result | Expected events | Expected state |
| --- | --- | --- | --- | --- |
| Build required | Accepted request with buildable source/runtime plan | `ok({ id })` | `deployment-requested -> build-requested -> deployment-started -> terminal event` | Accepted -> build/process state -> running -> terminal |
| Prebuilt image | Accepted request with prebuilt image plan | `ok({ id })` | `deployment-requested -> deployment-started -> terminal event` | Accepted -> running -> terminal |
| Image build failure | Accepted request requires image build, but builder fails before rollout | `ok({ id })` | `deployment-failed` | Terminal `failed` with `failurePhase = image-build`; no replacement runtime is promoted |
| Image pull failure | Accepted request references prebuilt image, but runtime cannot pull or resolve it | `ok({ id })` | `deployment-failed` | Terminal `failed` with `failurePhase = image-pull` |
| Runtime success | Runtime rollout succeeds | `ok({ id })` | `deployment-succeeded` | Terminal `succeeded` |
| Runtime target apply failure | Registered target backend cannot apply the rendered runtime intent after acceptance | `ok({ id })` | `deployment-failed` | Terminal `failed` with safe target backend details and phase `runtime-target-apply` or `runtime-execution` |
| Runtime target observation failure | Runtime target backend cannot read logs or health after rollout begins | `ok({ id })` for the accepted deployment | `deployment-failed` only when the deployment workflow requires that observation to complete; otherwise read query returns structured unavailable result | Failure details use phase `runtime-target-observation` without exposing raw provider responses |
| Runtime failure, retriable | Runtime rollout fails after acceptance with retriable error | `ok({ id })` | `deployment-failed`; retry scheduling event/job if modeled | Terminal `failed`; retry creates new attempt |
| Docker container exits before health check | Docker run command returns a container id, but the container exits before internal or public verification passes | `ok({ id })` | `deployment-failed` | Terminal `failed`; deployment logs include Docker inspect state and recent container logs before cleanup |
| Reverse-proxy same internal port | Two accepted deployments for different resources both listen on port `3000` inside their containers/processes | `ok({ id })` for each accepted attempt | Each attempt has its own terminal event | Both resources may remain running; runtime cleanup is scoped to resource identity, not `publish=3000` or `internalPort=3000` |
| Same resource replacement | A resource has a terminal deployment and a new deployment for the same resource is accepted | `ok({ id })` | New attempt emits its own terminal event | Runtime may replace the previous instance for the same resource after the new attempt starts successfully according to adapter strategy |
| Failed same-resource replacement preserves rollback candidate | A resource has a previously running deployment and the new rollout fails after starting replacement runtime | `ok({ id })` | `deployment-failed` | Failed attempt records sanitized previous-runtime/rollback-candidate metadata when available; public rollback command is still absent under ADR-016 |
| Direct-port collision after acceptance | Runtime cannot bind requested direct host port because another resource already owns it | Original command remains `ok({ id })` | `deployment-failed` | Conflicting attempt is failed; existing resource runtime remains untouched |
| Runtime failure, permanent | Runtime rollout fails after acceptance with non-retriable error | `ok({ id })` | `deployment-failed` | Terminal `failed`; no retry |
| Worker crash before state persistence | Worker cannot persist outcome | Original accepted command remains `ok({ id })` | No terminal event until recovery | Process state records retryable processing error |

## Event Matrix

| Event | Required assertion |
| --- | --- |
| `deployment-requested` | Emitted once after request acceptance; duplicate consumption does not start duplicate work. |
| `build-requested` | Emitted only when build/package work is required; duplicate consumption does not duplicate accepted artifacts. |
| `deployment-started` | Emitted after build/package is complete or skipped; duplicate consumption does not duplicate rollout. |
| `deployment-succeeded` | Emitted only after terminal success is persisted; mutually exclusive with `deployment-failed`. |
| `deployment-failed` | Emitted only after terminal failure is persisted; retry creates a new deployment attempt. |

## Entry Workflow Matrix

| Entry | Expected test focus |
| --- | --- |
| API create | Strict command schema, structured admission errors, acceptance result. |
| API stream | Technical progress stream does not replace durable events/state. |
| CLI non-interactive | Flags/options build the same command input as API. |
| CLI interactive | Prompts collect input before dispatch; related creation uses separate commands; governed by Quick Deploy workflow. |
| Web QuickDeploy | UI preflight does not change command semantics; final dispatch uses shared command input; governed by Quick Deploy workflow. |

## Deployment Error Assertion Example

```ts
const result = await useCase.execute(context, input);

expect(result.isErr()).toBe(true);

if (result.isErr()) {
  expect(result.error.code).toBe("deployment_not_redeployable");
  expect(result.error.retryable).toBe(false);
  expect(result.error.details?.phase).toBe("redeploy-guard");
  expect(result.error.details?.resourceId).toBe(resourceId);
}
```

## Deployment Async Failure Assertion Example

```md
Given an accepted deployment request.
And runtime rollout fails with a retriable provider error.
When the async deployment worker records the result.
Then the original command remains ok({ id }).
And deployment state is failed.
And deployment-failed is emitted with retriable = true.
And retry scheduling creates a new deployment attempt id.
```

## Current Implementation Notes And Migration Gaps

Current code still executes the backend inside `CreateDeploymentUseCase`, so some existing tests may need transitional expectations until async admission is implemented.

Current event names are still `deployment.started` and `deployment.finished`. Tests can temporarily assert those current events while mapping them to canonical specs:

- `deployment.started` -> `deployment-started`;
- `deployment.finished/status=succeeded` -> `deployment-succeeded`;
- `deployment.finished/status=failed` -> `deployment-failed`.

`deployment-requested` and `build-requested` are canonical events and may not exist in current test fixtures yet.

Generated default access route tests are governed by [Default Access Domain And Proxy Routing Test Matrix](./default-access-domain-and-proxy-routing-test-matrix.md) and are not implemented yet.

Runtime adapter helper tests cover the command construction needed for resource-scoped Docker
cleanup, loopback ephemeral health-check port publication, and direct-port publication. A real
Docker or SSH end-to-end assertion for two reverse-proxy resources sharing the same `internalPort`
is still needed.

Docker build/run/Compose helpers now have typed runtime command spec and renderer tests. Existing
tests may still cover compatibility string paths for workspace install/build/start commands until
those runtime profile command fields are remodeled as command spec leaves.

Runtime target backend registry unit tests now cover local/generic-SSH single-server capability
selection and `runtime_target_unsupported` details. Deployment admission tests still need coverage
for pre-acceptance unsupported-target rejection once the use case consults the registry before
accepting the command.

## Open Questions

- None. Web and CLI Quick Deploy workflow behavior is covered by [Quick Deploy Test Matrix](./quick-deploy-test-matrix.md).
