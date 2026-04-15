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
- [deployments.create Command Spec](../commands/deployments.create.md)
- [resources.create Command Spec](../commands/resources.create.md)
- [Quick Deploy Workflow Spec](../workflows/quick-deploy.md)
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

| Case | Entry | Input | Expected result | Expected error | Expected operation sequence | Expected state progression | Retriable |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Existing context quick deploy | Web or CLI | Source plus existing project/server/environment/resource | Deployment request accepted | None | List/select context -> `deployments.create` | No new context entities; deployment accepted | Deployment retry creates new attempt |
| Web existing project/server defaults | Web QuickDeploy | Project and server lists both contain records | Project step defaults to existing project selection; server step defaults to existing server selection | None | No project/server create command unless user switches modes | Existing context ids thread into `deployments.create` | Per deployment |
| Web no project default bootstrap | Web QuickDeploy | Empty project list | Project step uses new-project path and can proceed with default first-project name | None | `projects.create` before downstream context commands | Created project id threads into environment/resource/deployment steps | Per command |
| New project/server/environment first deploy | Web or CLI | Source plus new project/server/environment fields | Deployment request accepted | None | `projects.create` -> `servers.register` -> optional credential/configuration -> `environments.create` -> `deployments.create` | Context records persist before deployment; deployment accepted | Retry failed step from persisted state |
| New resource before first deploy | Web or CLI | Source plus new resource draft, runtime profile draft, and network profile draft | Deployment request accepted | None | `resources.create` -> `deployments.create(resourceId)` | Resource exists before deployment admission with source/runtime/network profile | Retry follows resource/deployment rules |
| Auto-generated resource name | Web or CLI | Source/repository name without user-supplied resource name | Generated resource name includes normalized source base plus short random suffix | None | `resources.create(name = "<base>-<suffix>")` -> `deployments.create(resourceId)` | Resource slug is unlikely to collide with previous Quick Deploy defaults; command still enforces uniqueness | Per command |
| User-supplied duplicate resource name | Web or CLI | User explicitly enters a name whose slug already exists in the project/environment | Workflow fails at `resources.create` | `resource_slug_conflict`, phase `resource-admission` | `resources.create` returns `err`; no deployment command | Existing resource remains; no accepted deployment | No for same invalid name |
| First variable supplied | Web or CLI | Environment variable key/value | Deployment request accepted | None | `environments.set-variable` before `deployments.create` | Variable is included in deployment snapshot after acceptance | Retry from persisted environment state |
| Domain/TLS requested | Web or CLI | Domain/proxy/path/TLS draft | Domain binding command accepted after context exists | None | Context commands -> `resources.create` if needed -> `domain-bindings.create` | Domain binding state progresses independently from deployment attempt | Domain/certificate retry rules |
| Source/runtime/network draft supplied | Web or CLI | Source locator/source descriptor plus runtime plan strategy hint and internal listener port | Deployment request accepted when compatible | None | Context commands -> `resources.create(source, runtimeProfile, networkProfile)` -> `deployments.create(resourceId)` | Resource owns source/runtime/network profile; deployment carries resolved runtime and network snapshots | Deployment retry creates new attempt |
| Missing resource port for inbound app | Web or CLI | HTTP application draft with no `networkProfile.internalPort` and no deterministic inference | Workflow fails before or during deployment admission | `validation_error`, phase `resource-network-resolution` or entry preflight equivalent | Context commands may already be persisted; no accepted deployment | Resource remains if already created; deployment not accepted | No for same invalid draft |
| Generic UI/CLI port label | Web or CLI | User enters port value | Workflow maps value to `networkProfile.internalPort` | None | `resources.create(networkProfile.internalPort)` -> `deployments.create(resourceId)` | No deployment command input named `port` | Per deployment |
| Incompatible source/runtime draft | Web or CLI | Source descriptor cannot be planned by selected runtime plan strategy | Workflow fails at final deployment admission | `validation_error` or `provider_error`, phase `runtime-plan-resolution` | Context commands may already be persisted; no accepted deployment | Context remains; no deployment accepted | Per deployment error |
| Missing source in CLI TTY | CLI interactive | No source arg | Prompt completes then deployment accepted | None if prompt supplies source | Prompt source -> context operations -> `deployments.create` | Same as accepted deployment path | Depends on failed step |
| Missing source outside CLI TTY | CLI non-interactive | No source arg | Workflow rejected before dispatch | `validation_error`, phase `input-collection` or transport equivalent | None | No mutation | No |
| Web draft missing required source | Web | No source locator | Workflow rejected before dispatch | Entry preflight validation | None | No mutation | No |
| Server registration fails | Web or CLI | New server fields with failing register command | Workflow fails before deployment | Underlying server command error | Earlier successful context commands only; no `deployments.create` | Successful earlier entities remain; no deployment accepted | Per server error |
| Credential configuration fails | Web or CLI | Server created but credential attach fails | Workflow fails before deployment | Underlying credential/server command error | Prior commands through server registration; no `deployments.create` | Server remains; deployment not accepted | Per credential/server error |
| Deployment admission fails | Web or CLI | Context created but invalid deployment input | Workflow fails at final command | Underlying `deployments.create` error | Context commands -> `deployments.create` returns `err` | Context remains; no deployment accepted | Per deployment error |
| Post-acceptance deployment failure | Web or CLI | Accepted deployment, runtime fails | Workflow submission returns accepted deployment id | None from original command | Context commands -> `deployments.create`; later async failure event/state | Deployment terminal `failed`; retry creates new attempt | Depends on async error |
| Duplicate submit with same selected context | Web or CLI | Same selected ids submitted twice | Either one accepted deployment per explicit submit or guarded by active deployment rule | `deployment_not_redeployable` when latest deployment non-terminal | No duplicate context creation | Context stable; deployment guard applies | No for same active deployment |
| Duplicate create draft for natural match | CLI interactive or Web if lookup exists | Same project/server/environment natural fields | Reuse existing match or command-level conflict | None or stable conflict code | Prefer list/select existing before create | No intentional duplicate context records | Per command |
| Shared workflow creates all prerequisites | Shared workflow program | Project/server/environment/resource create inputs plus optional credential and variable | Workflow returns all ids including deployment id | None | `projects.create` -> `servers.register` -> credential steps -> `environments.create` -> `resources.create` -> optional variable -> `deployments.create` | Returned ids are threaded into later inputs | Per command |
| Shared workflow uses existing ids | Shared workflow program | Existing project/server/environment/resource ids | Workflow returns selected ids and deployment id | None | `deployments.create` only | No prerequisite mutation | Deployment retry creates new attempt |
| Web workflow step progress | Web QuickDeploy | New context and resource draft | Each in-flight prerequisite request shows loading and succeeded requests show complete; the final deployment step shows deployment phase progress | Failed command error shown on failed step | One typed oRPC request per yielded prerequisite workflow step; final deployment command may use the deployment progress stream transport for detect/plan/package/deploy/verify visibility | Workflow progress stops at the failed step or stays visible after accepted deployment | Per command |

## Entry Consistency Matrix

| Behavior | Web QuickDeploy | CLI interactive deploy | API / automation |
| --- | --- | --- | --- |
| Missing source | Local draft validation before resource creation | Prompt in TTY when resource must be created; id-only deploy may skip source | API caller must create/select resource profile before deployment |
| New project | `projects.create` | `projects.create` | Caller calls `projects.create` explicitly |
| New server | `servers.register`; credential command if needed | `servers.register` | Caller calls server/credential commands explicitly |
| New environment | `environments.create` | `environments.create` | Caller calls `environments.create` explicitly |
| New resource | `resources.create` with source/runtime/network profile when needed | `resources.create` with source/runtime/network profile when needed | Explicit `resources.create` before deployment |
| Final deploy | `deployments.create` | `deployments.create` | `deployments.create` |
| Domain/TLS | Resource/domain binding surface or follow-up command | Separate `domain-bindings.create` command | Durable domain/TLS requires separate commands |

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

Current Web and CLI Quick Deploy flows call `resources.create` with source/runtime profile and `networkProfile.internalPort` before ids-only `deployments.create` when they create a new resource.

Current contracts store the listener port as `networkProfile.internalPort`. `runtimeProfile.port` must be rejected by schemas that no longer include it.

Current CLI still exposes `--method` as a user-facing compatibility option. Tests should assert that it maps to resource `RuntimePlanStrategy`, not deployment command input.

## Open Questions

- None for the shared workflow helper baseline. Future backend convenience endpoint policy remains governed by [Quick Deploy Workflow Spec](../workflows/quick-deploy.md).
