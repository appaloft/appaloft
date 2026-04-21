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
- Docker/OCI workload labels include stable Appaloft diagnostic metadata for managed ownership,
  deployment/project/environment/resource/server/destination identity, environment/resource kind,
  runtime/source/artifact/route summaries, and preview identity when available; these labels remain
  runtime-adapter metadata for diagnostics and cleanup, not Web/API/CLI command inputs;
- framework/runtime detection uses typed source inspection evidence and planner registry output for
  base image, package manager/build tool, install/build/start/package commands, and artifact
  output; it must not add framework-specific fields to `deployments.create`;
- HTTP verification failures persist the last observed HTTP status or fetch error instead of only a
  generic timeout;
- reverse-proxy deployments allow different resources to share the same `internalPort` on the same
  target without stopping each other;
- reverse-proxy replacement for the same resource preserves the last-known-good runtime until the
  new candidate passes required verification, and failed candidates are the only cleanup target;
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
- [Workload Framework Detection And Planning](../workflows/workload-framework-detection-and-planning.md)
- [Workload Framework Detection And Planning Test Matrix](./workload-framework-detection-and-planning-test-matrix.md)
- [Repository Deployment Config File Bootstrap](../workflows/deployment-config-file-bootstrap.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)
- [Spec-Driven Testing](./SPEC_DRIVEN_TESTING.md)
- [Quick Deploy Test Matrix](./quick-deploy-test-matrix.md)
- [Deployment Config File Test Matrix](./deployment-config-file-test-matrix.md)

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

| Test ID | Preferred automation | Case | Input | Expected result | Expected error | Expected events | Expected state |
| --- | --- | --- | --- | --- | --- | --- | --- |
| DEP-CREATE-ADM-001 | integration | Valid explicit context | project/server/destination/environment/resource ids; resource has source/runtime/network profile | `ok({ id })` | None | `deployment-requested`; later async events | Accepted deployment state exists with runtime and network plan snapshots |
| DEP-CREATE-ADM-002 | integration | Valid context with default destination seam | project/server/environment/resource ids; resource has source/runtime/network profile; destination omitted | `ok({ id })` when server default destination can be resolved | None | `deployment-requested`; later async events | Accepted deployment state uses resolved destination |
| DEP-CREATE-ADM-003 | integration | Resource lacks source binding | Context ids resolve, but resource has no source binding | `err` | `validation_error`, phase `resource-source-resolution` | None for accepted request | No accepted deployment |
| DEP-CREATE-ADM-004 | integration | Resource has unnormalized deep Git URL | Context ids resolve, but resource source locator is a GitHub `/tree/<ref>/<path>` URL without normalized repository/ref/base directory metadata | `err` | `validation_error`, phase `resource-source-resolution` | None for accepted request | No accepted deployment; runtime must not call `git clone` with browser tree URL |
| DEP-CREATE-ADM-005 | integration | Resource has normalized Git base directory | Context ids resolve; resource source has repository locator, `gitRef`, and `baseDirectory` | `ok({ id })` when runtime profile is compatible | None | `deployment-requested`; later async events | Deployment snapshot resolves source from repository/ref/base directory |
| DEP-CREATE-ADM-006 | integration | Resource has Docker image tag/digest | Context ids resolve; resource source is a Docker image with tag or digest and runtime strategy is `prebuilt-image` | `ok({ id })` | None | `deployment-requested`; later async events | Deployment snapshot uses prebuilt image identity |
| DEP-CREATE-ADM-007 | integration | Auto or workspace strategy resolves image artifact | Context ids resolve; source is buildable and runtime strategy is `auto` or `workspace-commands` | `ok({ id })` when planner can produce a containerizable artifact plan | None | `deployment-requested -> build-requested` | Deployment snapshot records Docker/OCI artifact intent; no host-process runtime plan is accepted |
| DEP-CREATE-ADM-008 | integration | Docker Compose strategy resolves Compose artifact | Context ids resolve; source/runtime profile identifies Compose file and target service when inbound traffic is needed | `ok({ id })` | None | `deployment-requested`; `build-requested` when any service build is required | Deployment snapshot records resource/deployment-scoped Compose project identity and target service |
| DEP-CREATE-ADM-009 | integration | Runtime command specs are typed | Accepted plan requires Docker build/run/Compose steps | `ok({ id })` when rendered command specs execute successfully | None | `deployment-requested`; later async events | Runtime command construction uses typed specs for Docker operations; shell command strings appear only as adapter-rendered local/SSH output |
| DEP-CREATE-ADM-010 | integration | Single-server runtime target backend resolves | Context ids resolve; selected target kind/provider key has a backend with `runtime.apply`, `runtime.verify`, and `runtime.logs` capabilities | `ok({ id })` | None | `deployment-requested`; later async events | Deployment execution selects the registered target backend without Web/CLI/API provider-specific input |
| DEP-CREATE-ADM-011 | integration | Unsupported runtime target backend | Context ids resolve; selected target kind/provider key has no backend with required runtime capabilities | `err` before acceptance when safely detectable | `runtime_target_unsupported`, phase `runtime-target-resolution` | None for accepted request | No accepted deployment |
| DEP-CREATE-ADM-012 | integration | Cluster target fields in command input | Input includes Kubernetes namespace, manifest, Helm values, Swarm stack, replica, ingress class, or pull-secret fields | `err` at command schema/API boundary | `validation_error`, phase `command-validation` | None | No deployment created; orchestrator configuration must come from target/profile specs |
| DEP-CREATE-ADM-013 | integration | Inbound resource lacks network profile | Context ids resolve, but inbound resource has no internal listener port | `err` | `validation_error`, phase `resource-network-resolution` | None for accepted request | No accepted deployment |
| DEP-CREATE-ADM-014 | integration | Resource network profile resolves reverse-proxy target | Resource has `networkProfile.internalPort` and reverse-proxy exposure | `ok({ id })` | None | `deployment-requested`; later async events | Deployment snapshot includes resolved network target without requiring host port |
| DEP-CREATE-ADM-015 | integration | Two reverse-proxy resources share internal port | Two resources on the same server/destination both have `networkProfile.internalPort = 3000` and reverse-proxy exposure | Both deployments can be accepted when each latest attempt is terminal | None | Separate `deployment-requested` events | Runtime plan snapshots keep separate resource/deployment identity and do not require a unique host port |
| DEP-CREATE-ADM-016 | integration | Generated default access route resolves | Resource reverse-proxy profile, server proxy ready, default access policy enabled | `ok({ id })` | None | `deployment-requested`; later route realization/progress | Deployment snapshot includes provider-neutral generated access route metadata; `ResourceAccessSummary` projects current generated URL |
| DEP-CREATE-ADM-017 | integration | Generated access provider unavailable before acceptance | Generated route is required but provider cannot return a hostname before safe acceptance | `err` | provider/default access error, phase `default-access-domain-generation` | None | No accepted deployment |
| DEP-CREATE-ADM-018 | integration | Proxy not ready for generated route | Resource reverse-proxy profile, policy enabled, server edge proxy failed/not ready | `err` or post-acceptance failure according to detection phase | `proxy_not_ready` or proxy error, phase `proxy-readiness` | No success event for accepted route | No direct host-port fallback |
| DEP-CREATE-ADM-019 | integration | Incompatible resource source/strategy pair | Resource source descriptor cannot be planned by the runtime profile strategy | `err` | `validation_error` or `provider_error`, phase `runtime-plan-resolution` | None for accepted request | No accepted deployment |
| DEP-CREATE-ADM-020 | integration | Legacy source/runtime/network fields | Input includes `sourceLocator`, `source`, `deploymentMethod`, command override fields, `port`, or `networkProfile` | `err` at command schema/API boundary | `validation_error`, phase `command-validation` | None | No deployment created |
| DEP-CREATE-ADM-021 | integration | Unresolved project/environment/server/destination/resource | Context cannot be resolved after bootstrap | `err` | `validation_error` or `not_found`, phase `context-resolution` | None | No deployment created |
| DEP-CREATE-ADM-022 | integration | Context mismatch | Environment/resource/destination does not match project/server context | `err` | `validation_error`, phase `context-resolution` | None | No deployment created |
| DEP-CREATE-ADM-023 | integration | Active latest deployment | Latest deployment for same resource is non-terminal | `err` | `deployment_not_redeployable`, phase `redeploy-guard` | None for new attempt | No new deployment created |
| DEP-CREATE-ADM-024 | integration | Direct host-port collision | Different resource already owns the same effective direct `hostPort` on the same server/destination | `err` when safely detected before acceptance, otherwise accepted attempt later fails | `conflict`, phase `admission-conflict`, or failed deployment with phase `runtime-execution` | No success event for the conflicting attempt | Existing resource runtime is not removed to free the port |
| DEP-CREATE-ADM-025 | integration | Invalid runtime plan | Plan has no executable steps or invalid VO state | `err` | `validation_error` or `invariant_violation` | None for accepted request | No accepted deployment |
| DEP-CREATE-ADM-026 | integration | Static strategy resolves image artifact | Context ids resolve; resource has `kind = static-site`, source binding, `runtimeProfile.strategy = static`, `publishDirectory`, and `networkProfile.internalPort = 80` | `ok({ id })` | None | `deployment-requested -> build-requested` | Deployment snapshot records static artifact intent, source root, publish directory, and HTTP endpoint metadata |
| DEP-CREATE-ADM-027 | integration | Static strategy missing publish directory | Context ids resolve, but selected static resource has no `runtimeProfile.publishDirectory` | `err` | `validation_error`, phase `runtime-plan-resolution` or `runtime-artifact-resolution` | None for accepted request | No accepted deployment |
| DEP-CREATE-ADM-028 | integration | Framework planner from typed inspection | Context ids resolve; source inspection detects a supported framework, package/project name, package manager/build tool, runtime version, and scripts | `ok({ id })` when the selected planner can produce a containerizable plan | None | `deployment-requested -> build-requested` when build/package is required | Deployment snapshot records Docker/OCI artifact intent and safe planner metadata such as `plannerKey`, `runtimeFamily`, `framework`, `packageManager`, `baseImage`, and project name |
| DEP-CREATE-ADM-029 | integration | Unsupported detected framework without fallback | Context ids resolve; source inspection detects a framework/runtime family with no registered planner and no explicit custom install/build/start commands sufficient for a containerizable plan | `err` | `validation_error`, phase `runtime-plan-resolution` | None for accepted request | No accepted deployment; error details include safe `runtimeFamily`, `framework`, `packageManager`, and detected file/script evidence when available |
| DEP-CREATE-ADM-030 | integration | Explicit custom commands fallback | Context ids resolve; detected framework is not first-class but resource runtime profile provides explicit install/build/start commands and network profile needed for a generic containerizable plan | `ok({ id })` | None | `deployment-requested -> build-requested` when build/package is required | Deployment snapshot records custom planner metadata and Docker/OCI image artifact intent, not host-process execution |
| DEP-CREATE-ADM-031 | integration | Base image policy is planner output | Context ids resolve; selected planner chooses a base image from runtime family, package manager/build tool, and runtime version evidence | `ok({ id })` | None | `deployment-requested`; later async events | Runtime plan metadata records the resolved planner/base-image policy; command input has no `baseImage` field |
| DEP-CREATE-ADM-032 | integration | Framework-specific deployment input rejected | Input includes framework, package name, base image, runtime preset, buildpack name, or language-version fields as deployment command fields | `err` at command schema/API boundary | `validation_error`, phase `command-validation` | None | No deployment created; framework planning remains resource/planner-owned |
| DEP-CREATE-ADM-033 | integration | Static framework output detection | Context ids resolve; supported framework static mode detects publish output such as `dist`, `build`, `out`, `.output/public`, or equivalent explicit static output | `ok({ id })` when the output rule is specified and safe | None | `deployment-requested -> build-requested` | Deployment snapshot records static-server image artifact intent and publish directory evidence |
| DEP-CREATE-ADM-034 | integration | Ambiguous multi-framework workspace | Context ids resolve; source root contains multiple plausible framework apps and no selected base directory or explicit resource runtime profile disambiguates them | `err` | `validation_error`, phase `runtime-plan-resolution` | None for accepted request | No accepted deployment; entry workflow must collect explicit app/base directory or runtime profile selection |
| DEP-CREATE-ADM-035 | integration | Repository config fields rejected at deployment command | Input attempts to pass config path, source/runtime/network profile, project/resource/server bootstrap, secret, or sizing fields directly to `deployments.create` | `err` at command schema/API boundary | `validation_error`, phase `command-validation` | None | No deployment created; config file handling belongs to entry workflow before dispatch |

## Async Progression Matrix

| Test ID | Preferred automation | Case | Given | Expected command result | Expected events | Expected state |
| --- | --- | --- | --- | --- | --- | --- |
| DEP-CREATE-ASYNC-001 | integration | Build required | Accepted request with buildable source/runtime plan | `ok({ id })` | `deployment-requested -> build-requested -> deployment-started -> terminal event` | Accepted -> build/process state -> running -> terminal |
| DEP-CREATE-ASYNC-002 | integration | Prebuilt image | Accepted request with prebuilt image plan | `ok({ id })` | `deployment-requested -> deployment-started -> terminal event` | Accepted -> running -> terminal |
| DEP-CREATE-ASYNC-003 | integration | Image build failure | Accepted request requires image build, but builder fails before rollout | `ok({ id })` | `deployment-failed` | Terminal `failed` with `failurePhase = image-build`; no replacement runtime is promoted |
| DEP-CREATE-ASYNC-004 | integration | Image pull failure | Accepted request references prebuilt image, but runtime cannot pull or resolve it | `ok({ id })` | `deployment-failed` | Terminal `failed` with `failurePhase = image-pull` |
| DEP-CREATE-ASYNC-005 | integration | Runtime success | Runtime rollout succeeds | `ok({ id })` | `deployment-succeeded` | Terminal `succeeded` |
| DEP-CREATE-ASYNC-006 | integration | Runtime target apply failure | Registered target backend cannot apply the rendered runtime intent after acceptance | `ok({ id })` | `deployment-failed` | Terminal `failed` with safe target backend details and phase `runtime-target-apply` or `runtime-execution` |
| DEP-CREATE-ASYNC-007 | integration | Runtime target observation failure | Runtime target backend cannot read logs or health after rollout begins | `ok({ id })` for the accepted deployment | `deployment-failed` only when the deployment workflow requires that observation to complete; otherwise read query returns structured unavailable result | Failure details use phase `runtime-target-observation` without exposing raw provider responses |
| DEP-CREATE-ASYNC-008 | integration | Runtime failure, retriable | Runtime rollout fails after acceptance with retriable error | `ok({ id })` | `deployment-failed`; retry scheduling event/job if modeled | Terminal `failed`; retry creates new attempt |
| DEP-CREATE-ASYNC-009 | integration | Docker container exits before health check | Docker run command returns a container id, but the container exits before internal or public verification passes | `ok({ id })` | `deployment-failed` | Terminal `failed`; deployment logs include Docker inspect state and recent container logs before cleanup |
| DEP-CREATE-ASYNC-010 | integration | Reverse-proxy same internal port | Two accepted deployments for different resources both listen on port `3000` inside their containers/processes | `ok({ id })` for each accepted attempt | Each attempt has its own terminal event | Both resources may remain running; runtime cleanup is scoped to resource identity, not `publish=3000` or `internalPort=3000` |
| DEP-CREATE-ASYNC-011 | integration | Same resource replacement | A resource has a terminal deployment and a new deployment for the same resource is accepted | `ok({ id })` | New attempt emits its own terminal event | Reverse-proxy replacement keeps the previous runtime active until candidate verification passes, then cleans up the superseded same-resource runtime according to adapter strategy |
| DEP-CREATE-ASYNC-012 | integration | Failed same-resource replacement preserves rollback candidate | A resource has a previously running deployment and the new rollout fails after starting replacement runtime | `ok({ id })` | `deployment-failed` | Failed attempt records sanitized previous-runtime/rollback-candidate metadata when available; failed candidate is cleaned up; previous successful runtime remains active when the rollout strategy had not superseded it; public rollback command is still absent under ADR-016 |
| DEP-CREATE-ASYNC-013 | integration | Direct-port collision after acceptance | Runtime cannot bind requested direct host port because another resource already owns it | Original command remains `ok({ id })` | `deployment-failed` | Conflicting attempt is failed; existing resource runtime remains untouched |
| DEP-CREATE-ASYNC-014 | integration | Runtime failure, permanent | Runtime rollout fails after acceptance with non-retriable error | `ok({ id })` | `deployment-failed` | Terminal `failed`; no retry |
| DEP-CREATE-ASYNC-015 | integration | Worker crash before state persistence | Worker cannot persist outcome | Original accepted command remains `ok({ id })` | No terminal event until recovery | Process state records retryable processing error |
| DEP-CREATE-ASYNC-016 | integration | Public route verification failure preserves previous runtime | A reverse-proxy resource has a previously successful runtime and the replacement candidate starts, but generated or durable public route verification fails because DNS, proxy route readiness, or HTTP verification is not ready | `ok({ id })` | `deployment-failed` for the new attempt | Previous successful runtime and route remain active; failed candidate is removed or isolated; failure details include the observed public route error |
| DEP-CREATE-ASYNC-017 | integration | Static artifact package failure | Accepted static deployment resolves source, but static package/build step cannot produce the publish directory image artifact | `ok({ id })` | `deployment-failed` | Terminal `failed` with `failurePhase = image-build` or `runtime-artifact-resolution`; no replacement runtime is promoted |
| DEP-CREATE-ASYNC-018 | integration | Git source resolved commit snapshot | Accepted Git-backed deployment clones or checks out source for a new attempt | `ok({ id })` | Later terminal event according to execution result | Deployment execution metadata and read model expose the exact resolved commit SHA; Web and CLI surfaces display it for the attempt |

## Event Matrix

| Test ID | Preferred automation | Event | Required assertion |
| --- | --- | --- | --- |
| DEP-CREATE-EVT-001 | integration | `deployment-requested` | Emitted once after request acceptance; duplicate consumption does not start duplicate work. |
| DEP-CREATE-EVT-002 | integration | `build-requested` | Emitted only when build/package work is required; duplicate consumption does not duplicate accepted artifacts. |
| DEP-CREATE-EVT-003 | integration | `deployment-started` | Emitted after build/package is complete or skipped; duplicate consumption does not duplicate rollout. |
| DEP-CREATE-EVT-004 | integration | `deployment-succeeded` | Emitted only after terminal success is persisted; mutually exclusive with `deployment-failed`. |
| DEP-CREATE-EVT-005 | integration | `deployment-failed` | Emitted only after terminal failure is persisted; retry creates a new deployment attempt. |

## Entry Workflow Matrix

| Test ID | Preferred automation | Entry | Expected test focus |
| --- | --- | --- | --- |
| DEP-CREATE-ENTRY-001 | e2e-preferred | API create | Strict command schema, structured admission errors, acceptance result. |
| DEP-CREATE-ENTRY-002 | e2e-preferred | API stream | Technical progress stream does not replace durable events/state. |
| DEP-CREATE-ENTRY-003 | e2e-preferred | CLI non-interactive | Flags/options build the same command input as API. |
| DEP-CREATE-ENTRY-004 | e2e-preferred | CLI interactive | Prompts collect input before dispatch; related creation uses separate commands; governed by Quick Deploy workflow. |
| DEP-CREATE-ENTRY-005 | e2e-preferred | Web QuickDeploy | UI preflight does not change command semantics; final dispatch uses shared command input; governed by Quick Deploy workflow. |
| DEP-CREATE-ENTRY-006 | e2e-preferred | CLI repository config deploy | CLI reads config before command dispatch, rejects identity/secret/unsupported fields, runs explicit resource/environment commands when needed, and final `CreateDeploymentCommandInput` contains ids only. |
| DEP-CREATE-ENTRY-007 | contract | HTTP repository config non-support | HTTP `POST /api/deployments` does not read a repository config file or accept config-file profile fields; clients must call explicit operations. |

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

Generated default access route tests are governed by
[Default Access Domain And Proxy Routing Test Matrix](./default-access-domain-and-proxy-routing-test-matrix.md).
Current focused coverage exists for provider-neutral hostname generation, route snapshot projection,
and `ResourceAccessSummary` display inputs; broader API/Web/CLI and real Docker/SSH same-port route
assertions remain follow-up.

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

Static site deployment rows `DEP-CREATE-ADM-026`, `DEP-CREATE-ADM-027`, and
`DEP-CREATE-ASYNC-017` are covered by `packages/application/test/create-deployment.test.ts` and
the static artifact planning assertion in `packages/adapters/runtime/test/runtime-plan-resolver.test.ts`.
Current code accepts the static runtime plan strategy, resolves static artifact intent, and covers
adapter-owned static-server Dockerfile generation in
`packages/adapters/runtime/test/runtime-plan-resolver.test.ts`. Executable static smoke coverage
now includes the local Docker generated-nginx path and an opt-in generic-SSH Docker path.

Framework planner rows `DEP-CREATE-ADM-028` through `DEP-CREATE-ADM-034` define the deployment
admission side of the mainstream web framework expansion. Detailed package-manager precedence,
framework signal ranking, static/serverful/SSR classification, framework catalog coverage,
base-image policy, runtime command specs, target capability checks, and entry parity are governed
by `WF-PLAN-*` rows in
[Workload Framework Detection And Planning Test Matrix](./workload-framework-detection-and-planning-test-matrix.md).
Current executable coverage covers Next.js, Vite static, Astro static, Nuxt generate static,
explicit SvelteKit static, Remix, FastAPI, Django, Flask, generic Node framework metadata, generic
Python, generic Java, and custom command fallback in runtime planner tests. Additional
remaining-family detectors, planner implementations, Web/CLI draft fields, and Docker/SSH smoke
paths are required before the broader catalog can be marked implemented.

Repository config file deployment rows `DEP-CREATE-ADM-035`, `DEP-CREATE-ENTRY-006`, and
`DEP-CREATE-ENTRY-007` are target contract rows. Current implementation keeps HTTP ids-only, but
CLI config deploy is now aligned at the parser/entry-seed boundary: `--config` is exposed, the
schema is profile-only, and executable coverage proves config fields cannot enter
`deployments.create`. Broader CLI e2e and HTTP schema-contract coverage remains follow-up.

## Open Questions

- None. Web and CLI Quick Deploy workflow behavior is covered by [Quick Deploy Test Matrix](./quick-deploy-test-matrix.md).
