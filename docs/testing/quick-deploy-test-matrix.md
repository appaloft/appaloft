# Quick Deploy Spec-Driven Test Matrix

## Normative Contract

Quick Deploy tests must verify that guided entry workflows call explicit operations and converge on `deployments.create`.

Tests must not treat Web wizard steps or CLI prompts as domain rules. Domain assertions belong to the commands they dispatch.

## Global References

This test matrix inherits:

- [ADR-010: Quick Deploy Workflow Boundary](../decisions/ADR-010-quick-deploy-workflow-boundary.md)
- [ADR-011: Resource Create Minimum Lifecycle](../decisions/ADR-011-resource-create-minimum-lifecycle.md)
- [ADR-012: Resource Runtime Profile And Deployment Snapshot Boundary](../decisions/ADR-012-resource-runtime-profile-and-deployment-snapshot-boundary.md)
- [ADR-014: Deployment Admission Uses Resource Profile](../decisions/ADR-014-deployment-admission-uses-resource-profile.md)
- [ADR-015: Resource Network Profile](../decisions/ADR-015-resource-network-profile.md)
- [ADR-017: Default Access Domain And Proxy Routing](../decisions/ADR-017-default-access-domain-and-proxy-routing.md)
- [ADR-021: Docker/OCI Workload Substrate](../decisions/ADR-021-docker-oci-workload-substrate.md)
- [ADR-023: Runtime Orchestration Target Boundary](../decisions/ADR-023-runtime-orchestration-target-boundary.md)
- [deployments.create Command Spec](../commands/deployments.create.md)
- [resources.create Command Spec](../commands/resources.create.md)
- [resources.diagnostic-summary Query Spec](../queries/resources.diagnostic-summary.md)
- [Quick Deploy Workflow Spec](../workflows/quick-deploy.md)
- [Resource Diagnostic Summary Test Matrix](./resource-diagnostic-summary-test-matrix.md)
- [resources.create Test Matrix](./resources.create-test-matrix.md)
- [deployments.create Test Matrix](./deployments.create-test-matrix.md)
- [Spec-Driven Testing](./SPEC_DRIVEN_TESTING.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)

## Test Layers

| Layer | Quick Deploy focus |
| --- | --- |
| Shared workflow program | Side-effect-free step order, id-threading, and final `deployments.create` input composition. |
| Web workflow | Wizard draft state, preflight validation, explicit operation calls, final `deployments.create` payload. |
| CLI workflow | Prompt resolution, non-TTY rejection, explicit operation calls, final `CreateDeploymentCommandInput`. |
| API/automation contract | No hidden Quick Deploy business command; explicit operations or complete `deployments.create` input only. |
| Command integration | Underlying commands keep their own error/result semantics. |
| E2E | First deploy path reaches an accepted deployment and exposes progress/read-model state. |

## Given / When / Then Template

```md
Given:
- Existing projects/servers/environments/resources:
- Entry mode: Web / CLI TTY / CLI non-TTY / API / automation
- Draft input:
- Underlying command/query behavior:

When:
- The Quick Deploy workflow is submitted.

Then:
- Commands/queries dispatched:
- Final `deployments.create` input:
- Workflow result:
- Persisted state:
- Expected errors:
- Expected events/progress:
- Retry or resume behavior:
```

## Workflow Matrix

| Test ID | Preferred automation | Case | Entry | Input | Expected result | Expected error | Expected operation sequence | Expected state progression | Retriable |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| QUICK-DEPLOY-WF-001 | e2e-preferred | Existing context quick deploy | Web or CLI | Source plus existing project/server/environment/resource | Deployment request accepted | None | List/select context -> `deployments.create` | No new context entities; deployment accepted | Deployment retry creates new attempt |
| QUICK-DEPLOY-WF-002 | e2e-preferred | Web existing project/server defaults | Web QuickDeploy | Project and server lists both contain records | Project step defaults to existing project selection; server step defaults to existing server selection | None | No project/server create command unless user switches modes | Existing context ids thread into `deployments.create` | Per deployment |
| QUICK-DEPLOY-WF-003 | e2e-preferred | Web no project default bootstrap | Web QuickDeploy | Empty project list | Project step uses new-project path and can proceed with default first-project name | None | `projects.create` before downstream context commands | Created project id threads into environment/resource/deployment steps | Per command |
| QUICK-DEPLOY-WF-004 | e2e-preferred | New project/server/environment first deploy | Web or CLI | Source plus new project/server/environment fields | Deployment request accepted | None | `projects.create` -> `servers.register` -> optional credential/configuration -> `environments.create` -> `deployments.create` | Context records persist before deployment; deployment accepted | Retry failed step from persisted state |
| QUICK-DEPLOY-WF-005 | e2e-preferred | New resource before first deploy | Web or CLI | Source plus new resource draft, runtime profile draft, and network profile draft | Deployment request accepted | None | `resources.create` -> `deployments.create(resourceId)` | Resource exists before deployment admission with source/runtime/network profile | Retry follows resource/deployment rules |
| QUICK-DEPLOY-WF-006 | e2e-preferred | Auto-generated resource name | Web or CLI | Source/repository name without user-supplied resource name | Generated resource name includes normalized source base plus short random suffix | None | `resources.create(name = "<base>-<suffix>")` -> `deployments.create(resourceId)` | Resource slug is unlikely to collide with previous Quick Deploy defaults; command still enforces uniqueness | Per command |
| QUICK-DEPLOY-WF-007 | e2e-preferred | User-supplied duplicate resource name | Web or CLI | User explicitly enters a name whose slug already exists in the project/environment | Workflow fails at `resources.create` | `resource_slug_conflict`, phase `resource-admission` | `resources.create` returns `err`; no deployment command | Existing resource remains; no accepted deployment | No for same invalid name |
| QUICK-DEPLOY-WF-008 | e2e-preferred | First variable supplied | Web or CLI | Environment variable key/value | Deployment request accepted | None | `environments.set-variable` before `deployments.create` | Variable is included in deployment snapshot after acceptance | Retry from persisted environment state |
| QUICK-DEPLOY-WF-009 | e2e-preferred | Domain/TLS follow-up requested | Web or CLI | Domain/proxy/path/TLS draft after resource context exists | Domain binding remains a separate follow-up operation | None | Context commands -> `resources.create` if needed -> `deployments.create`; explicit domain-binding surfaces dispatch `domain-bindings.create` separately | Deployment input has no domain/TLS fields; domain binding state progresses independently when the follow-up command is dispatched | Domain/certificate retry rules |
| QUICK-DEPLOY-WF-010 | e2e-preferred | Source/runtime/network draft supplied | Web or CLI | Source locator/source descriptor plus runtime plan strategy hint, optional health check policy, and internal listener port | Deployment request accepted when compatible | None | Context commands -> `resources.create(source, runtimeProfile.healthCheck, networkProfile)` -> `deployments.create(resourceId)` | Resource owns source/runtime/network profile; deployment carries resolved runtime, health check, and network snapshots | Deployment retry creates new attempt |
| QUICK-DEPLOY-WF-011 | e2e-preferred | Docker/OCI substrate draft | Web or CLI | Dockerfile, Compose, Docker image, static, auto/buildpack-style, or workspace-command choice | Deployment request accepted when the choice can produce or reference a Docker/OCI image or Compose project | None | Source/runtime normalization -> `resources.create(runtimeProfile.strategy)` -> `deployments.create(resourceId)` | Runtime profile records strategy; deployment planning resolves image or Compose artifact intent, not host-process execution | Per deployment |
| QUICK-DEPLOY-WF-012 | e2e-preferred | Runtime target stays target-owned | Web or CLI | User selects or creates deployment target/server and destination | Deployment request accepted when the selected target has a registered runtime backend | None | Context commands -> `resources.create` if needed -> `deployments.create` | Quick Deploy does not send Kubernetes, Swarm, Helm, namespace, manifest, ingress-class, replica, or pull-secret fields as deployment input | Per target/backend error |
| QUICK-DEPLOY-WF-013 | e2e-preferred | New HTTP health check policy | Web QuickDeploy or create-resource | Enable HTTP health check with path, expected status, interval, timeout, retries, and start period | Deployment request accepted when compatible | None | `resources.create(runtimeProfile.healthCheck)` -> `deployments.create(resourceId)` | Resource runtime profile owns reusable health policy; runtime plan mirrors policy for deployment verification | Per deployment |
| QUICK-DEPLOY-WF-014 | e2e-preferred | GitHub tree URL source | Web or CLI | `https://github.com/coollabsio/coolify-examples/tree/v4.x/bun` | Deployment request accepted when repository/ref/path are valid | None | Source variant normalization -> context commands -> `resources.create(source.locator = repository, source.metadata.gitRef = v4.x, source.metadata.baseDirectory = /bun)` -> `deployments.create(resourceId)` | Resource owns repository source plus base directory; runtime clones repository and uses the base directory during detection/planning | Per deployment |
| QUICK-DEPLOY-WF-015 | e2e-preferred | Slash-containing Git ref | Web or CLI with provider lookup | Deep Git URL whose branch or tag contains slashes | Deployment request accepted only when provider lookup proves the longest valid ref prefix | None or `validation_error`, phase `resource-source-resolution` | Provider branch/tag lookup before `resources.create` | No guessed ref/path split is persisted | No for ambiguous draft |
| QUICK-DEPLOY-WF-016 | e2e-preferred | Local folder base directory | Web or CLI | Local folder plus source-root subdirectory | Deployment request accepted when path is valid | None | `resources.create(source.kind = local-folder, baseDirectory)` -> `deployments.create(resourceId)` | Resource owns local source root and base directory separately from runtime strategy | Per deployment |
| QUICK-DEPLOY-WF-017 | e2e-preferred | Docker image tag source | Web or CLI | Image reference with tag | Deployment request accepted when image source is valid | None | Parse image -> `resources.create(source.kind = docker-image, imageName, imageTag, runtimeProfile.strategy = prebuilt-image)` -> `deployments.create(resourceId)` | Resource source binding owns image tag; deployment snapshot uses prebuilt image plan | Per deployment |
| QUICK-DEPLOY-WF-018 | e2e-preferred | Docker image digest source | Web or CLI | Image reference with digest | Deployment request accepted when digest is valid | None | Parse image -> `resources.create(source.kind = docker-image, imageName, imageDigest, runtimeProfile.strategy = prebuilt-image)` -> `deployments.create(resourceId)` | Resource source binding owns immutable digest identity | Per deployment |
| QUICK-DEPLOY-WF-019 | e2e-preferred | Dockerfile or Compose file path draft | Web or CLI | Git or local source plus build-file path | Deployment request accepted when path is valid for selected strategy | None | `resources.create(source.baseDirectory, runtimeProfile.dockerfilePath or runtimeProfile.dockerComposeFilePath)` -> `deployments.create(resourceId)` | Resource source binding owns source root; runtime profile owns strategy-specific file path | Per deployment |
| QUICK-DEPLOY-WF-020 | e2e-preferred | Missing resource port for inbound app | Web or CLI | HTTP application draft with no `networkProfile.internalPort` and no deterministic inference | Workflow fails before or during deployment admission | `validation_error`, phase `resource-network-resolution` or entry preflight equivalent | Context commands may already be persisted; no accepted deployment | Resource remains if already created; deployment not accepted | No for same invalid draft |
| QUICK-DEPLOY-WF-021 | e2e-preferred | Generic UI/CLI port label | Web or CLI | User enters port value | Workflow maps value to `networkProfile.internalPort` | None | `resources.create(networkProfile.internalPort)` -> `deployments.create(resourceId)` | No deployment command input named `port` | Per deployment |
| QUICK-DEPLOY-WF-022 | e2e-preferred | Generated default access route available | Web or CLI | New inbound resource, selected proxy-ready server, default access policy enabled | Workflow shows generated access URL after `ResourceAccessSummary` is available | None | Context commands -> `resources.create` -> `deployments.create` -> route observation | Deployment has provider-neutral generated route metadata; resource access projection shows current URL; no domain binding is created | Per route/deployment |
| QUICK-DEPLOY-WF-023 | e2e-preferred | Generated access skipped without proxy intent | Web or CLI | Policy enabled but selected server has no edge proxy intent or proxy disabled | Workflow continues without generated access URL | None | Context commands -> `resources.create` -> `deployments.create` | Deployment has no generated route metadata and does not publish a host-port fallback | Per deployment |
| QUICK-DEPLOY-WF-024 | e2e-preferred | Generated access route unavailable | Web or CLI | Policy enabled but provider/proxy cannot resolve route | Workflow surfaces structured route/proxy error from deployment/read-model state | Provider/proxy error with phase from ADR-017 workflow | Context commands may persist; deployment may reject or fail according to detection phase | No direct host-port fallback | Depends |
| QUICK-DEPLOY-WF-025 | e2e-preferred | Copy diagnostic after accepted deployment | Web or CLI | Workflow has `resourceId` and `deploymentId` | Copyable diagnostic summary is available | None unless the query itself fails | Context commands -> `deployments.create` -> `resources.diagnostic-summary` | Summary includes stable ids plus access/proxy/log section statuses | No |
| QUICK-DEPLOY-WF-026 | e2e-preferred | Copy diagnostic when access/logs unavailable | Web desktop or CLI | Deployment accepted/succeeded but access or runtime logs are missing | Diagnostic summary still returns `ok` with source errors | Source errors for access/log/proxy sections | `resources.diagnostic-summary` after deployment result/read-model refresh | User can report bug without screenshot-only context | No |
| QUICK-DEPLOY-WF-027 | e2e-preferred | Incompatible source/runtime draft | Web or CLI | Source descriptor cannot be planned by selected runtime plan strategy | Workflow fails at final deployment admission | `validation_error` or `provider_error`, phase `runtime-plan-resolution` | Context commands may already be persisted; no accepted deployment | Context remains; no deployment accepted | Per deployment error |
| QUICK-DEPLOY-WF-028 | e2e-preferred | Missing source in CLI TTY | CLI interactive | No source arg | Prompt completes then deployment accepted | None if prompt supplies source | Prompt source -> context operations -> `deployments.create` | Same as accepted deployment path | Depends on failed step |
| QUICK-DEPLOY-WF-029 | e2e-preferred | Missing source outside CLI TTY | CLI non-interactive | No source arg | Workflow rejected before dispatch | `validation_error`, phase `input-collection` or transport equivalent | None | No mutation | No |
| QUICK-DEPLOY-WF-030 | e2e-preferred | Web draft missing required source | Web | No source locator | Workflow rejected before dispatch | Entry preflight validation | None | No mutation | No |
| QUICK-DEPLOY-WF-031 | e2e-preferred | Server registration fails | Web or CLI | New server fields with failing register command | Workflow fails before deployment | Underlying server command error | Earlier successful context commands only; no `deployments.create` | Successful earlier entities remain; no deployment accepted | Per server error |
| QUICK-DEPLOY-WF-032 | e2e-preferred | Credential configuration fails | Web or CLI | Server created but credential attach fails | Workflow fails before deployment | Underlying credential/server command error | Prior commands through server registration; no `deployments.create` | Server remains; deployment not accepted | Per credential/server error |
| QUICK-DEPLOY-WF-033 | e2e-preferred | Deployment admission fails | Web or CLI | Context created but invalid deployment input | Workflow fails at final command | Underlying `deployments.create` error | Context commands -> `deployments.create` returns `err` | Context remains; no deployment accepted | Per deployment error |
| QUICK-DEPLOY-WF-034 | e2e-preferred | Post-acceptance deployment failure | Web or CLI | Accepted deployment, runtime fails | Workflow submission returns accepted deployment id | None from original command | Context commands -> `deployments.create`; later async failure event/state | Deployment terminal `failed`; retry creates new attempt | Depends on async error |
| QUICK-DEPLOY-WF-035 | e2e-preferred | Duplicate submit with same selected context | Web or CLI | Same selected ids submitted twice | Either one accepted deployment per explicit submit or guarded by active deployment rule | `deployment_not_redeployable` when latest deployment non-terminal | No duplicate context creation | Context stable; deployment guard applies | No for same active deployment |
| QUICK-DEPLOY-WF-036 | e2e-preferred | Duplicate create draft for natural match | CLI interactive or Web if lookup exists | Same project/server/environment natural fields | Reuse existing match or command-level conflict | None or stable conflict code | Prefer list/select existing before create | No intentional duplicate context records | Per command |
| QUICK-DEPLOY-WF-037 | e2e-preferred | Shared workflow creates all prerequisites | Shared workflow program | Project/server/environment/resource create inputs plus optional credential and variable | Workflow returns all ids including deployment id | None | `projects.create` -> `servers.register` -> credential steps -> `environments.create` -> `resources.create` -> optional variable -> `deployments.create` | Returned ids are threaded into later inputs | Per command |
| QUICK-DEPLOY-WF-038 | e2e-preferred | Shared workflow uses existing ids | Shared workflow program | Existing project/server/environment/resource ids | Workflow returns selected ids and deployment id | None | `deployments.create` only | No prerequisite mutation | Deployment retry creates new attempt |
| QUICK-DEPLOY-WF-039 | e2e-preferred | Web workflow step progress | Web QuickDeploy | New context and resource draft | Each in-flight prerequisite request shows loading and succeeded requests show complete; the final deployment step shows deployment phase progress | Failed command error shown on failed step | One typed oRPC request per yielded prerequisite workflow step; final deployment command may use the deployment progress stream transport for detect/plan/package/deploy/verify visibility | Workflow progress stops at the failed step or stays visible after accepted deployment | Per command |

## Entry Consistency Matrix

| Test ID | Preferred automation | Behavior | Web QuickDeploy | CLI interactive deploy | API / automation |
| --- | --- | --- | --- | --- | --- |
| QUICK-DEPLOY-ENTRY-001 | e2e-preferred | Missing source | Local draft validation before resource creation | Prompt in TTY when resource must be created; id-only deploy may skip source | API caller must create/select resource profile before deployment |
| QUICK-DEPLOY-ENTRY-002 | e2e-preferred | New project | `projects.create` | `projects.create` | Caller calls `projects.create` explicitly |
| QUICK-DEPLOY-ENTRY-003 | e2e-preferred | New server | `servers.register`; credential command if needed | `servers.register` | Caller calls server/credential commands explicitly |
| QUICK-DEPLOY-ENTRY-004 | e2e-preferred | New environment | `environments.create` | `environments.create` | Caller calls `environments.create` explicitly |
| QUICK-DEPLOY-ENTRY-005 | e2e-preferred | New resource | `resources.create` with source/runtime/network profile when needed | `resources.create` with source/runtime/network profile when needed | Explicit `resources.create` before deployment |
| QUICK-DEPLOY-ENTRY-006 | e2e-preferred | Final deploy | `deployments.create` | `deployments.create` | `deployments.create` |
| QUICK-DEPLOY-ENTRY-007 | e2e-preferred | Domain/TLS | Resource/domain binding surface or follow-up command | Separate `domain-bindings.create` command | Durable domain/TLS requires separate commands |

## Error Assertion Rules

Tests must distinguish:

- pre-dispatch workflow validation;
- command admission errors from underlying commands;
- accepted deployment followed by async deployment failure.

Assertions at command boundaries must inspect stable error fields instead of translated messages.

## Current Implementation Notes And Migration Gaps

Current Web QuickDeploy uses the shared workflow program for step order and id-threading. Component tests may still assert Web-specific draft validation, executor behavior, and query refresh side effects in `QuickDeploySheet.svelte`.

Current Web QuickDeploy renders per-step workflow progress and uses deployment progress streaming only for the final `deployments.create` step, so detect, plan, package, deploy, and verify progress remain visible while the command runs. It does not use `deployments.createStream` as a hidden workflow executor for prerequisite steps.

Current Web QuickDeploy keeps the review and workflow progress surface visible after deployment acceptance and exposes navigation to the created deployment as an explicit action.

Current CLI interactive deploy orchestration lives in `deployment-interaction.ts`, so initial CLI tests may assert the resolved `CreateDeploymentCommandInput`. CLI has not yet been fully migrated to the shared workflow program.

Current Web QuickDeploy and CLI interactive deploy call `resources.create` before `deployments.create(resourceId)` when creating a new first-deploy resource.

Current Web QuickDeploy and create-resource flows call `resources.create` with source/runtime profile, `runtimeProfile.healthCheck`, and `networkProfile.internalPort` before ids-only `deployments.create` when they create a new resource. Current CLI Quick Deploy exposes the path-only health-check subset.

Generated default access URL display and route status assertions are governed by [Default Access Domain And Proxy Routing Test Matrix](./default-access-domain-and-proxy-routing-test-matrix.md) and should use `ResourceAccessSummary` as the first formal read-model assertion target.

Diagnostic summary assertions are governed by
[Resource Diagnostic Summary Test Matrix](./resource-diagnostic-summary-test-matrix.md). Quick
Deploy completion should call `resources.diagnostic-summary` once resource/deployment ids are known
and copy stable ids/source errors when access, proxy, deployment logs, or runtime logs are
unavailable.

Current contracts store the listener port as `networkProfile.internalPort`. `runtimeProfile.port` must be rejected by schemas that no longer include it.

Current CLI still exposes `--method` as a user-facing compatibility option. Tests should assert that it maps to resource `RuntimePlanStrategy`, not deployment command input.

CLI non-TTY Quick Deploy must not prompt for omitted optional advanced fields once source and
context flags are supplied. It should use provided flags plus defaults, then dispatch
`resources.create` and `deployments.create`.

Current Web and CLI do not yet expose all source variant fields as typed drafts. Initial tests may
cover the parser/normalizer as a unit before full UI coverage, but the workflow contract requires
Web and CLI parity before deep Git URL support is considered complete.

`packages/contracts/test/quick-deploy-workflow.test.ts` provides numbered executable coverage for
all `QUICK-DEPLOY-WF-*` and `QUICK-DEPLOY-ENTRY-*` matrix ids at the shared workflow boundary. Those
tests assert explicit operation sequencing, id threading, failure stop points, and that
`deployments.create` stays ids-only. The opt-in shell e2e harnesses keep the same matrix ids on real
Docker/SSH deployment paths where a composed runtime is required.

Dedicated browser assertions for Web-only preflight, default-selection UI, per-step progress
rendering, generated access display, and diagnostic-copy interaction remain follow-up coverage. The
current shared workflow tests are the executable baseline for those ids until Web e2e coverage is
added.

`apps/shell/test/e2e/workspace-docker.test.ts` is the required local Docker e2e harness for proving
that a regular workspace without a Dockerfile can be deployed through `workspace-commands` by
generating `Dockerfile.yundu`, building an image, starting a container, and passing HTTP health
verification. Docker availability is a prerequisite for this e2e environment because Docker/OCI is
the v1 deployment substrate.

`apps/shell/test/e2e/quick-deploy-ssh.test.ts` is the workflow-named executable e2e harness for the
real SSH/Docker path. It remains opt-in through environment variables because it mutates a real
external SSH target, while still using embedded PGlite for Yundu state. Its successful path must
exercise the Traefik-backed generated public route so proxy image compatibility and Docker label
discovery are covered by a real deployment.

## Open Questions

- None for the shared workflow helper baseline. Future backend convenience endpoint policy remains governed by [Quick Deploy Workflow Spec](../workflows/quick-deploy.md).
