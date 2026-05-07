# Quick Deploy Spec-Driven Test Matrix

## Normative Contract

Quick Deploy tests must verify that guided entry workflows call explicit operations and converge on `deployments.create`.

Tests must not treat Web wizard steps or CLI prompts as domain rules. Domain assertions belong to the commands they dispatch.

Repository config files and headless GitHub Actions binary runs are non-interactive Quick Deploy
entry forms when they normalize source-adjacent profile input before ids-only deployment admission.

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
- [ADR-024: Pure CLI SSH State And Server-Applied Domains](../decisions/ADR-024-pure-cli-ssh-state-and-server-applied-domains.md)
- [ADR-025: Control-Plane Modes And Action Execution](../decisions/ADR-025-control-plane-modes-and-action-execution.md)
- [deployments.create Command Spec](../commands/deployments.create.md)
- [resources.create Command Spec](../commands/resources.create.md)
- [Workload Framework Detection And Planning](../workflows/workload-framework-detection-and-planning.md)
- [Workload Framework Detection And Planning Test Matrix](./workload-framework-detection-and-planning-test-matrix.md)
- [resources.diagnostic-summary Query Spec](../queries/resources.diagnostic-summary.md)
- [Quick Deploy Workflow Spec](../workflows/quick-deploy.md)
- [Repository Deployment Config File Bootstrap](../workflows/deployment-config-file-bootstrap.md)
- [Control-Plane Mode Selection And Adoption](../workflows/control-plane-mode-selection-and-adoption.md)
- [GitHub Action Deploy Wrapper Implementation Plan](../implementation/github-action-deploy-action-plan.md)
- [Resource Diagnostic Summary Test Matrix](./resource-diagnostic-summary-test-matrix.md)
- [Deployment Config File Test Matrix](./deployment-config-file-test-matrix.md)
- [Control-Plane Modes Test Matrix](./control-plane-modes-test-matrix.md)
- [Source Link State Test Matrix](./source-link-state-test-matrix.md)
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
| Config/headless workflow | Repository config parsing, trusted identity resolution outside the file, SSH-server `ssh-pglite` default state for SSH-targeted deploys, explicit local-only PGlite, server-applied config domains, and parity with the shared Quick Deploy operation order. |
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
| QUICK-DEPLOY-WF-009 | e2e-preferred | Domain/TLS follow-up requested | Web, CLI, or headless executor | Domain/proxy/path/TLS draft after resource/server/destination context exists | Domain input stays out of deployment admission; SSH CLI mode applies server-local route state, while control-plane mode uses managed domain binding follow-up | None | Context commands -> `resources.create` if needed -> `deployments.create`; SSH CLI mode realizes server-applied proxy route; control-plane executors dispatch `domain-bindings.create` separately | Deployment input has no domain/TLS fields; server-applied route state or managed domain binding state progresses independently | Domain/certificate/proxy retry rules |
| QUICK-DEPLOY-WF-010 | e2e-preferred | Source/runtime/network draft supplied | Web or CLI | Source locator/source descriptor plus runtime plan strategy hint, optional health check policy, and internal listener port | Deployment request accepted when compatible | None | Context commands -> `resources.create(source, runtimeProfile.healthCheck, networkProfile)` -> `deployments.create(resourceId)` | Resource owns source/runtime/network profile; deployment carries resolved runtime, health check, and network snapshots | Deployment retry creates new attempt |
| QUICK-DEPLOY-WF-010A | e2e-preferred | Runtime name draft supplied | Web or CLI | Draft includes runtime name or UI label "container name" | Workflow maps the value to `ResourceRuntimeProfile.runtimeName` before deployment admission | None | Context commands -> `resources.create(runtimeProfile.runtimeName)` or `resources.configure-runtime(runtimeProfile.runtimeName)` -> `deployments.create(resourceId)` | Deployment input has no Docker-native naming field; runtime profile owns reusable naming intent | Deployment retry creates new attempt |
| QUICK-DEPLOY-WF-010B | e2e-preferred | Duplicate runtime name draft | Web or CLI | Operator chooses a runtime name already used by another resource | Workflow may warn locally, but resource profile command may still succeed because effective runtime names are derived later | None or resource-runtime validation error only for malformed value | Resource profile command -> `deployments.create` | No cross-resource cleanup or retargeting occurs because requested runtime names match | Deployment/runtime error policy |
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
| QUICK-DEPLOY-WF-035 | e2e-preferred | Duplicate submit with same selected context | Web or CLI | Same selected ids submitted twice | Either one accepted deployment per explicit submit or the second submit is rejected by the atomic active-deployment guard | `deployment_not_redeployable` when latest deployment non-terminal or the second submit loses the active-attempt race | No duplicate context creation | Context stable; deployment guard applies | No for same active deployment |
| QUICK-DEPLOY-WF-036 | e2e-preferred | Duplicate create draft for natural match | CLI interactive or Web if lookup exists | Same project/server/environment natural fields | Reuse existing match or command-level conflict | None or stable conflict code | Prefer list/select existing before create | No intentional duplicate context records | Per command |
| QUICK-DEPLOY-WF-037 | e2e-preferred | Shared workflow creates all prerequisites | Shared workflow program | Project/server/environment/resource create inputs plus optional credential and variable | Workflow returns all ids including deployment id | None | `projects.create` -> `servers.register` -> credential steps -> `environments.create` -> `resources.create` -> optional variable -> `deployments.create` | Returned ids are threaded into later inputs | Per command |
| QUICK-DEPLOY-WF-038 | e2e-preferred | Shared workflow uses existing ids | Shared workflow program | Existing project/server/environment/resource ids | Workflow returns selected ids and deployment id | None | `deployments.create` only | No prerequisite mutation | Deployment retry creates new attempt |
| QUICK-DEPLOY-WF-039 | e2e-preferred | Web workflow step progress | Web QuickDeploy | New context and resource draft | Each in-flight prerequisite request shows loading and succeeded requests show complete; the final deployment step shows deployment phase progress and application output before the command reaches a terminal result | Failed command error shown on failed step | One typed oRPC request per yielded prerequisite workflow step; final deployment command may use the deployment progress stream transport for detect/plan/package/deploy/verify visibility | Workflow progress stops at the failed step or stays visible after accepted deployment | Per command |
| QUICK-DEPLOY-WF-040 | e2e-preferred | Static site first deploy | Web or CLI | Static source, `publishDirectory`, optional install/build command, and no explicit port | Deployment request accepted when static artifact planning succeeds; generated static server serves exact files and directory indexes, falls back extensionless app routes to `index.html`, and returns `404` for missing extension-bearing assets | None | `resources.create(kind = static-site, runtimeProfile.strategy = static, runtimeProfile.publishDirectory, networkProfile.internalPort = 80)` -> `deployments.create(resourceId)` | Resource persists static runtime/network profile; deployment packages and serves static artifact through Docker/OCI with Appaloft-owned routing policy | Per deployment |
| QUICK-DEPLOY-WF-041 | e2e-preferred | Static site missing publish directory | Web or CLI | Static source selected but publish directory omitted or unsafe | Workflow fails before or during `resources.create` admission | `validation_error`, phase `resource-runtime-resolution` or entry preflight equivalent | No `deployments.create` | No accepted deployment; any already-created context remains | No for same invalid draft |
| QUICK-DEPLOY-WF-042 | e2e-preferred | Mainstream framework detected | Web or CLI | Source root contains supported framework/package evidence such as framework config, package/project name, package manager/build tool, scripts, lockfiles, runtime version, and build output | Deployment request accepted when the detected planner can produce a Docker/OCI artifact plan and required network profile is available | None | Source inspection -> resource draft defaults -> `resources.create(source, runtimeProfile, networkProfile)` -> `deployments.create(resourceId)` | Resource and deployment preserve provider-neutral profile/snapshot state; planner metadata appears only as safe runtime-plan evidence or diagnostics | Per deployment |
| QUICK-DEPLOY-WF-043 | e2e-preferred | Unsupported framework requires explicit fallback | Web or CLI | Source root detects a framework/runtime family without an active planner | Workflow requires explicit install/build/start commands or stops before deployment admission | `validation_error`, phase `runtime-plan-resolution` or entry preflight equivalent | No `deployments.create` unless explicit fallback commands are provided | No accepted deployment without a containerizable planner; source/context records may remain if already created | No for same invalid draft |
| QUICK-DEPLOY-WF-044 | e2e-preferred | Base image is not deployment input | Web or CLI | User or detector suggests runtime family/version/package manager | Workflow may display planner-derived runtime defaults but final command inputs omit base-image fields | None | `resources.create` stores accepted resource profile fields; `deployments.create` remains ids-only | Base image is resolved by planner during deployment planning and appears only in safe runtime-plan metadata/diagnostics | Per deployment |
| QUICK-DEPLOY-WF-045 | e2e-preferred | Repository config as non-interactive Quick Deploy profile | CLI, local Web agent, or headless binary | Source root has a valid Appaloft config profile with runtime/network/health fields and no trusted project/resource identity | Workflow auto-creates or selects project/resource outside the file, maps profile fields to the same resource-owned commands as interactive Quick Deploy, and accepts deployment | None | Config discovery -> identity resolution outside config -> shared Quick Deploy operation order -> `projects.create` if needed -> `resources.create(source/runtime/network/health)` -> `deployments.create(resourceId)` | Config changes cannot retarget project/resource; deployment input stays ids-only | Per command |
| QUICK-DEPLOY-WF-046 | e2e-preferred | Repository config identity rejected | CLI or local Web agent | Config contains `project`, `projectId`, `resourceId`, target host, server id, destination id, or credential identity | Workflow fails before mutation | `validation_error`, phase `config-identity` | Config validation only | No project/resource/server/deployment mutation | No |
| QUICK-DEPLOY-WF-047 | e2e-preferred | Repository config secret rejected | CLI or local Web agent | Config contains raw SSH private key, deploy key, token, password, certificate key, or raw secret env value | Workflow fails before mutation and diagnostics/logs are sanitized | `validation_error`, phase `config-secret-validation` | Config validation only | No write command; no secret value in details/logs | No |
| QUICK-DEPLOY-WF-048 | e2e-preferred | Repository config required secret reference | CLI or local Web agent | Config declares required secret references without raw values | Workflow proceeds only when referenced secret/credential exists outside the file | None or secret-missing structured error | Secret/credential check -> resource/env commands -> `deployments.create` | Deployment snapshot receives masked/effective environment only after explicit variable/secret resolution | Depends |
| QUICK-DEPLOY-WF-049 | e2e-preferred | Repository config unsupported sizing | CLI or local Web agent | Config contains CPU, memory, replicas, restart policy, overlap, or drain before accepted sizing/rollout specs exist | Workflow fails before mutation | `unsupported_config_field`, phase `config-capability-resolution` | Config validation only | Unsupported fields are not silently ignored | No |
| QUICK-DEPLOY-WF-050 | e2e-preferred | Repository config environment overlay | CLI or local Web agent | Config has base profile plus selected-environment overlay | Overlay applies only to the environment selected outside the file; final command remains ids-only | None | Config merge -> explicit operations -> `deployments.create` | Config overlay cannot move deployment to another environment by itself | Per command |
| QUICK-DEPLOY-WF-051 | e2e-preferred | Repository config domain/TLS declaration | CLI, local Web agent, or headless binary | Config contains `access.domains[]` | Workflow accepts provider-neutral domain intent only when it can persist server-applied SSH route desired state or map to managed control-plane domain commands; otherwise fails before mutation | None when the selected mapping is supported, or `validation_error`, phase `config-domain-resolution` | SSH mode: context commands -> route desired state -> `deployments.create` -> proxy realization. Control-plane mode: context commands -> `deployments.create` -> `domain-bindings.create` follow-up | No domain/TLS fields enter `deployments.create`; committed config cannot select domain binding identity context | Per proxy/domain command |
| QUICK-DEPLOY-WF-052 | e2e-preferred | Headless SSH remote state default | GitHub Actions or CLI non-TTY | Repository config plus trusted SSH target inputs, no Appaloft ids, no `DATABASE_URL` | Workflow uses SSH-server PGlite state, creates or reuses identity there, persists/reuses source link state, and accepts deployment | None | SSH state ensure/state-root-coordinate/migrate -> source link resolution -> Quick Deploy operation order -> persist link if first run -> `deployments.create` | Repeated runs reuse remote project/resource/server/environment state | Per backend coordination and command policy |
| QUICK-DEPLOY-WF-053 | e2e-preferred, opt-in SSH | Repository config server-applied domain | GitHub Actions or CLI non-TTY | Valid `access.domains[]`, reverse-proxy network profile, proxy-ready SSH target | Deployment succeeds or accepts and server-applied route state is realized/observable through access/proxy read models | None or provider route error | SSH state -> context commands -> `deployments.create` -> edge proxy route realization | Remote state records route desired/applied status; no managed `DomainBinding` is created | Per proxy route retry |
| QUICK-DEPLOY-WF-054 | integration | Control-plane maps config domain to managed workflow | Hosted/self-hosted control-plane entry | Same config `access.domains[]`, selected control-plane state | Config domain intent maps to managed domain binding workflow or fails with stable unsupported managed-mapping error; it does not write SSH server-applied state | None or stable unsupported error | Context commands -> `deployments.create` -> `domain-bindings.create` follow-up when supported | Managed `DomainBinding` state progresses separately from deployment | Per domain/certificate retry rules |
| QUICK-DEPLOY-WF-055 | e2e-preferred, opt-in SSH | Repository config canonical redirect | GitHub Actions or CLI non-TTY | Valid `access.domains[]` with a served canonical host and an alias host using `redirectTo` | Deployment succeeds or accepts, canonical host serves the workload, alias host redirects with configured status, and access/proxy diagnostics expose redirect state | None or provider route error | SSH state -> context commands -> route desired state with redirect intent -> `deployments.create` -> edge proxy route realization -> redirect verification | Remote state records desired/applied redirect status; no managed `DomainBinding` or `Certificate` is created | Per proxy route retry |
| QUICK-DEPLOY-WF-056 | integration | Control-plane mode resolved before identity | Web, CLI, local Web agent, or headless binary | Quick Deploy or repository config supplies control-plane mode policy | Workflow resolves execution owner and control-plane/state owner before state backend, source link, identity, env, domain, or deployment mutation; Cloud/self-hosted requires handshake first | `validation_error`, phase `control-plane-resolution`, `control_plane_unsupported`, or `control_plane_handshake_failed` when selected mode is not usable | Mode resolution -> optional handshake -> state/source identity -> Quick Deploy operation order -> `deployments.create` | No project/resource/server/route/deployment mutation occurs before control-plane mode is accepted | Per selected mode policy |
| QUICK-DEPLOY-WF-057 | e2e-preferred | Local-shell Dockerfile smoke | CLI or local Web agent | Local Docker is available; source/profile selects `dockerfile` | Deployment request is accepted and executed through the same resource-owned profile path | None | Context/resource commands -> ids-only `deployments.create(resourceId)` -> local-shell runtime backend | Runtime plan snapshot uses `dockerfile`; logs show local docker-container execution and successful container health | Per deployment |
| QUICK-DEPLOY-WF-058 | e2e-preferred | Local-shell Docker Compose smoke | CLI or local Web agent | Local Docker Compose is available; source/profile selects `docker-compose` | Deployment request is accepted and executed through the same resource-owned profile path | None | Context/resource commands -> ids-only `deployments.create(resourceId)` -> local-shell runtime backend | Runtime plan snapshot uses `compose-deploy`; logs show local docker-compose-stack execution and compose metadata | Per deployment |
| QUICK-DEPLOY-WF-059 | e2e-preferred | Local-shell prebuilt image smoke | CLI or local Web agent | Local Docker is available; image source/profile selects `prebuilt-image` | Deployment request is accepted and executed without source rebuild | None | Context/resource commands -> ids-only `deployments.create(resourceId)` -> local-shell runtime backend | Runtime plan snapshot uses `prebuilt-image`; logs show local docker-container execution and successful container health | Per image/deployment |
| QUICK-DEPLOY-WF-060 | contract, opt-in SSH | Generic-SSH Docker Compose coverage | CLI, GitHub Actions, or automation | Generic-SSH backend is registered; compose source/profile is available; real remote mutation may be disabled | Contract coverage proves plan/backend selection; opt-in smoke may execute against a real SSH target | None or stable backend/runtime `DomainError` | Resource profile -> ids-only `deployments.create(resourceId)` -> generic-SSH runtime backend | Runtime plan snapshot uses `compose-deploy`; backend selection resolves `generic-ssh`; unsupported paths do not bypass structured errors | Per target/backend |

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
| QUICK-DEPLOY-ENTRY-008 | e2e-preferred | Static site draft parity | Collects static publish directory, optional build commands, and defaults internal port 80 before `resources.create` | Collects equivalent static draft fields and maps them to the same command schema | API/automation callers create/select a static resource profile explicitly before deployment |
| QUICK-DEPLOY-ENTRY-009 | e2e-preferred | Framework detection parity | Uses the same source inspection and planner contract as CLI; may suggest resource name, strategy, commands, publish directory, and internal port before dispatch | Uses the same source inspection and planner contract as Web; prompts for missing explicit fallback commands when needed | API/automation callers provide resource source/runtime/network profile explicitly or rely on deployment planning to reject unsupported evidence |
| QUICK-DEPLOY-ENTRY-010 | e2e-preferred | Repository config file parity | Local Web agent may read a selected file and must follow the config workflow contract | CLI supports explicit `--config` and implicit discovery through the same parser/normalizer; GitHub Actions invokes the binary as a non-interactive CLI executor with SSH-server `ssh-pglite` by default for SSH targets | API/automation remains explicit-operation first; no hidden config-file deployment schema |
| QUICK-DEPLOY-ENTRY-011 | contract | Deploy action wrapper parity | Not applicable unless a local Web agent shells out to the CLI | `appaloft/deploy-action` installs a verified released binary, maps trusted inputs to the same CLI flags as direct CLI usage, and invokes the same repository config workflow | API/automation still call explicit operations or use direct CLI; the action wrapper must not introduce a hidden business command |
| QUICK-DEPLOY-ENTRY-012 | contract | Control-plane mode parity | Web shows read-only mode until selection is implemented, then uses an explicit select/radio backed by the same resolver | CLI and deploy-action expose equivalent trusted mode/URL/token inputs and keep pure SSH `none` as default | HTTP/oRPC keeps `deployments.create` ids-only; future backend workflow API requires separate ADR/operation contract |
| QUICK-DEPLOY-ENTRY-013 | contract | Framework/runtime draft field parity | Web maps source base directory, publish directory, Dockerfile path, Compose path, build target, install/build/start commands, runtime name, internal port, network, and health drafts to `resources.create` | CLI flags, config seeds, and interactive prompts where present map the same fields to `resources.create` or `resources.configure-runtime` for existing resources | Repository config declares the same profile fields and maps them before ids-only deployment admission |
| QUICK-DEPLOY-ENTRY-014 | contract | Explicit fallback command parity | Web requires explicit fallback commands or publish/runtime fields when detection cannot produce safe defaults | CLI non-TTY fails before mutation unless config or flags provide fallback commands; CLI TTY may prompt | API/automation remains explicit-resource-profile first; `deployments.create` never accepts fallback command fields |
| QUICK-DEPLOY-ENTRY-015 | integration, opt-in e2e | Framework fixture Docker/OCI smoke parity | Web or local Web agent must produce the same source/runtime/network profile draft for every currently supported JavaScript/TypeScript/Python fixture before ids-only deployment | CLI and repository config/headless flows must map the same profile vocabulary for those fixtures before ids-only deployment | The shared profile produces an image or Compose runtime plan with Docker/OCI execution evidence; representative opt-in real Docker coverage builds/runs/verifies the `WF-PLAN-SMOKE-005` fixture slice; no entrypoint sends framework, package, base image, or buildpack fields to `deployments.create` |

## Error Assertion Rules

Tests must distinguish:

- pre-dispatch workflow validation;
- command admission errors from underlying commands;
- accepted deployment followed by async deployment failure.

Assertions at command boundaries must inspect stable error fields instead of translated messages.

## Current Implementation Notes And Migration Gaps

Current Web QuickDeploy uses the shared workflow program for step order and id-threading. Component tests may still assert Web-specific draft validation, executor behavior, and query refresh side effects in `QuickDeploySheet.svelte`.

Current Web QuickDeploy renders per-step workflow progress and uses deployment progress streaming only for the final `deployments.create` step, so detect, plan, package, deploy, verify, and runtime application output remain visible while the command runs. Runtime adapter tests for `QUICK-DEPLOY-WF-039` must prove long-running process output is emitted before the command resolves, not only replayed from the final deployment result. It does not use `deployments.createStream` as a hidden workflow executor for prerequisite steps.

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

`QUICK-DEPLOY-WF-040`, `QUICK-DEPLOY-WF-041`, and `QUICK-DEPLOY-ENTRY-008` are covered at the
shared workflow-contract/schema layer by `packages/contracts/test/quick-deploy-workflow.test.ts`.
Web QuickDeploy and CLI deploy now expose first-class static site draft UI/flags that map to
`resources.create`. Browser-level Web entry coverage exists under
`apps/web/test/e2e-webview/home.webview.test.ts`, and CLI entry helper coverage exists under
`packages/adapters/cli/test/deployment-interaction.test.ts`. Local Docker static smoke coverage
exists under `apps/shell/test/e2e/quick-deploy-static-docker.workflow.e2e.ts`, and the generic-SSH
Docker static path is covered by the opt-in SSH e2e harness.

CLI non-TTY Quick Deploy must not prompt for omitted optional advanced fields once source and
context flags are supplied. It should use provided flags plus defaults, then dispatch
`resources.create` and `deployments.create`.

Framework detection rows `QUICK-DEPLOY-WF-042` through `QUICK-DEPLOY-WF-044` and
`QUICK-DEPLOY-ENTRY-009` are Quick Deploy entry-contract rows. Detailed package-manager,
framework-signal, classification, catalog, base-image, runtime-capability, and boundary coverage is
owned by `WF-PLAN-*` rows in
[Workload Framework Detection And Planning Test Matrix](./workload-framework-detection-and-planning-test-matrix.md).
Current implementation has detector/planner coverage for initial JavaScript/TypeScript and Python
framework slices. `QUICK-DEPLOY-ENTRY-015` is covered by headless fixture smoke for the current
supported JavaScript/TypeScript/Python fixture catalog and by a representative opt-in real local
Docker fixture slice governed by `WF-PLAN-SMOKE-005` for Vite SPA, React SPA, Next SSR, Hono,
Django, and Flask. FastAPI, Angular SPA, SvelteKit static, full browser/CLI e2e parity, and real
Docker/SSH execution for every catalog fixture are still required before a framework family is
marked first-class.

Repository config file rows `QUICK-DEPLOY-WF-045` through `QUICK-DEPLOY-WF-051` and
remote-state/domain rows `QUICK-DEPLOY-WF-052` through `QUICK-DEPLOY-WF-054` plus
`QUICK-DEPLOY-WF-056` and `QUICK-DEPLOY-ENTRY-010` through `QUICK-DEPLOY-ENTRY-012` are target
contract rows governed by
[Deployment Config File Test Matrix](./deployment-config-file-test-matrix.md). Current
implementation covers the parser safety contract, CLI `init` profile-only output, CLI `--config`
seed mapping, Git-root filesystem discovery, headless local PGlite defaulting, no-id non-TTY
bootstrap, `ci-env:` secret resolution, environment command sequencing, and ids-only deployment
command admission. After ADR-024, local PGlite defaulting is migration coverage for explicit
local-only mode. CLI config deploy now defaults trusted SSH-targeted config deploys to
`ssh-pglite` and shell-built CLI programs run an SSH transport-backed remote-state lifecycle
adapter before identity queries or mutations; shell startup mirrors remote PGlite state into a
target-scoped local data directory before database composition, uses staged download extraction,
and uploads it after shutdown with remote backup/restore/recovery command sequencing.
Current config schema accepts provider-neutral `access.domains[]`, and SSH CLI config deploy
persists server-applied route desired state before ids-only deployment admission when route-state
storage is wired. Deployment planning consumes that desired state and deployment-finished handling
records applied/failed route status for route outcomes. Resource access, health, and diagnostic
summaries expose the latest server-applied route URL/status. The opt-in SSH e2e harness covers
Traefik-backed server-applied route apply/reload/verify for `CONFIG-FILE-DOMAIN-005`.
Provider-local TLS diagnostics for `tlsMode = auto` routes are visible through proxy configuration
and resource diagnostics. Operational provisioning of the external SSH e2e secrets/target,
control-plane domain mapping, first-run project/resource creation e2e, deploy-action wrapper install
UX, environment overlays, stored/external secret lookup/application, and profile drift Code Round
coverage remain follow-up. Profile drift behavior is specified in
[Resource Profile Drift Visibility](../specs/011-resource-profile-drift-visibility/spec.md).

`QUICK-DEPLOY-WF-055` now has lower-level parser, remote-state, deployment planning, provider
rendering, and proxy-configuration query coverage for `redirectTo` / `redirectStatus`. A full
GitHub Actions or CLI non-TTY SSH e2e that asserts real alias HTTP redirect behavior remains target
coverage.

`QUICK-DEPLOY-WF-056` and `QUICK-DEPLOY-ENTRY-012` are roadmap rows under
[Control-Plane Modes Test Matrix](./control-plane-modes-test-matrix.md). Current implementation
parses config `controlPlane` fields and supports an initial self-hosted deploy-action API
handshake. Cloud handshakes, full adoption, and SSH-server PGlite adoption into a control plane
remain roadmap work.

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

`apps/shell/test/e2e/quick-deploy-workspace-docker.workflow.e2e.ts` is the required local Docker
workflow e2e harness for proving that a regular workspace without a Dockerfile can be deployed
through `workspace-commands` by generating `Dockerfile.appaloft`, building an image, starting a
container, and passing HTTP health verification. Docker availability is a prerequisite for this e2e
environment because Docker/OCI is the v1 deployment substrate.

`apps/shell/test/e2e/quick-deploy-ssh.workflow.e2e.ts` is the workflow-named executable e2e harness
for the real SSH/Docker path. It remains opt-in through environment variables because it mutates a
real external SSH target. After ADR-024, the successful SSH path must use SSH-server `ssh-pglite`
state by default, while explicit local PGlite remains a separate smoke mode. Its successful path
must exercise the Traefik-backed generated public route and, when `access.domains[]` is configured,
the server-applied custom route so proxy image compatibility and Docker label discovery are covered
by a real deployment.

`apps/shell/test/e2e/github-action-ssh-state.workflow.e2e.ts` is the opt-in harness for
`QUICK-DEPLOY-WF-052` and the GitHub Actions style process boundary. It runs two separate CLI
processes with different runner-local PGlite directories and verifies that the second deploy reuses
remote SSH state/source link identity instead of creating a duplicate resource.
`.github/workflows/ssh-remote-state-e2e.yml` exposes that harness as a manual workflow and wires it
into nightly smoke plus release gating when `APPALOFT_E2E_SSH_HOST` and
`APPALOFT_E2E_SSH_PRIVATE_KEY` secrets are configured.

## Open Questions

- None for the shared workflow helper baseline. Future backend convenience endpoint policy remains governed by [Quick Deploy Workflow Spec](../workflows/quick-deploy.md).
