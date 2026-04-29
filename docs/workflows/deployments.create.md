# deployments.create Workflow Spec

## Normative Contract

All entry points must converge on the same `deployments.create` command semantics.

Entry workflows may differ in input collection, but they must not implement separate deployment business rules. Command success means request accepted; deployment execution proceeds through the async lifecycle contract.

## Global References

This workflow inherits:

- [ADR-001: deployments.create HTTP API Required Fields](../decisions/ADR-001-deploy-api-required-fields.md)
- [ADR-002: Routing, Domain, And TLS Boundary](../decisions/ADR-002-routing-domain-tls-boundary.md)
- [ADR-010: Quick Deploy Workflow Boundary](../decisions/ADR-010-quick-deploy-workflow-boundary.md)
- [ADR-014: Deployment Admission Uses Resource Profile](../decisions/ADR-014-deployment-admission-uses-resource-profile.md)
- [ADR-015: Resource Network Profile](../decisions/ADR-015-resource-network-profile.md)
- [ADR-017: Default Access Domain And Proxy Routing](../decisions/ADR-017-default-access-domain-and-proxy-routing.md)
- [ADR-021: Docker/OCI Workload Substrate](../decisions/ADR-021-docker-oci-workload-substrate.md)
- [ADR-023: Runtime Orchestration Target Boundary](../decisions/ADR-023-runtime-orchestration-target-boundary.md)
- [ADR-028: Command Coordination Scope And Mutation Admission](../decisions/ADR-028-command-coordination-scope-and-mutation-admission.md)
- [Workload Framework Detection And Planning](./workload-framework-detection-and-planning.md)
- [Repository Deployment Config File Bootstrap](./deployment-config-file-bootstrap.md)
- [Resource Profile Drift Visibility](../specs/011-resource-profile-drift-visibility/spec.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)

This file defines the deployment-specific workflow sequence and entry boundaries.

## End-To-End Workflow

```text
user intent
  -> entry-specific input collection
  -> optional repository config file discovery and profile normalization by local entry workflows
  -> explicit project/environment/server/resource selection or creation
  -> explicit deployments.create command input with ids only
  -> command admission
  -> resolve resource network/access snapshots from resource, server, domain, and default access policy state
  -> deployment-requested
  -> runtime target backend is selected from deployment target, destination, provider key, and capabilities
  -> Git-backed source is materialized and the resolved commit object id is persisted when source cloning is used
  -> build-requested, when an image build/package artifact is required
  -> Docker/OCI image is built, pulled, or otherwise resolved
  -> deployment-started
  -> runtime target backend starts replacement workload(s)
  -> runtime target backend or edge proxy provider materializes route config when the snapshot contains generated or durable access routes
  -> deployment-succeeded | deployment-failed
  -> read model / progress view / notifications update from durable state and events
```

Prebuilt image deployments skip `build-requested` unless artifact verification is modeled separately.

Post-acceptance runtime/build/deploy/verify failure persists failed state, publishes `deployment-failed`, and is exposed through read models/progress views.

For Git-backed deployments, the source materialization step resolves `HEAD` after clone/checkout and
persists that commit with the deployment attempt. Web and CLI read surfaces must show the resolved
commit so a redeploy of a moving branch can be distinguished from the previous attempt.

Retry is an explicit retry command or job that creates a new deployment attempt.

Write-side admission must preserve one active deployment attempt per resource as an atomic durable
invariant. Entry workflows may pre-read latest deployment state to give fast feedback, but durable
state creation must still reject a concurrent submit that loses the race to another accepted
non-terminal attempt.

Admission also has a command-level coordination step separate from low-level state-root
coordination. For `deployments.create`, the logical scope is `resource-runtime`, derived from the
resolved resource and target placement context. v1 behavior is bounded waiting before acceptance:

- the command may wait for the logical scope to become available;
- timing out returns a retriable coordination error before acceptance;
- no queued deployment attempt record is created by this workflow before acceptance;
- unrelated resources must not be serialized only because they share a server or state root.

When a previous same-resource attempt is still active, `deployments.create` owns the supersede
branch:

- non-running attempts are canceled before the new attempt is admitted;
- running attempts are marked `cancel-requested`, canceled through the runtime backend, then marked
  `canceled` before the new attempt is admitted;
- the superseded attempt records `supersededByDeploymentId`;
- runtime execution must stop at phase boundaries when durable supersede/cancel state says the
  attempt no longer owns execution;
- a supersede cancellation failure rejects the later request instead of silently allowing both
  attempts to continue.

## Web Workflow

Web may:

- collect source/project/server/environment/resource input through UI;
- run UX preflight validation;
- run Quick Deploy as an input collection workflow governed by [ADR-010](../decisions/ADR-010-quick-deploy-workflow-boundary.md);
- create/select related records before deployment through their own explicit commands;
- show progress and read-model state after command acceptance.

Web must not:

- treat UI wizard steps as domain rules;
- hardcode business semantics that differ from CLI/API;
- interpret local validation errors as the final command contract;
- hide runtime failure outside durable deployment/read-model state.

## CLI Workflow

CLI may:

- accept non-interactive flags/options;
- discover or read an explicit repository config file as a local entry-workflow profile source;
- prompt interactively when TTY is available as the CLI form of the Quick Deploy workflow;
- create/select related records through their own explicit commands before deployment;
- print progress and final read-model state.

CLI must not:

- dispatch an incomplete `deployments.create` command outside a documented input-collection workflow;
- use committed repository config file fields to select project/resource/server/destination or raw
  credential identity;
- implement deployment semantics that differ from API/Web;
- treat prompt choices as aggregate invariants.

## API Workflow

API is strict and non-interactive.

API must:

- accept the shared command input schema;
- return structured errors for admission failures;
- return acceptance for accepted requests;
- expose follow-up deployment state through query/read-model endpoints or stream/progress APIs.

API must not prompt or define transport-only deployment input shapes.

API must not read a repository config file and use it as a hidden deployment command shape. It may
serve the config schema for tooling, and future API workflow commands may be added only after they
are positioned in the business operation map and governed by their own specs.

## Stream / Progress Workflow

Progress streams are technical/UI progress, not domain events.

They may mirror phases such as detect, plan, package, deploy, verify, or rollback, but durable state and formal events remain the source of truth.

## Docker/OCI Runtime Substrate

The v1 workflow uses Docker/OCI images and containers behind provider-neutral command and read
contracts.

Entry workflows may offer Dockerfile, Docker Compose, prebuilt image, static, auto/buildpack-style,
or workspace-command choices. Those choices must normalize to resource source/runtime/network
profile fields, and deployment planning must convert them into one of these runtime artifact paths:

- build an OCI/Docker image for this deployment attempt;
- pull or use a prebuilt OCI/Docker image;
- materialize a Docker Compose project with resource/deployment-scoped identity.
- package a static publish directory into an OCI/Docker static-server image for this deployment
  attempt.

Within those artifact paths, runtime work is planned as typed command specs before execution.
Examples include Docker image build, Docker container run, Docker Compose up/down, Docker inspect,
Docker logs, process invocation, and shell-script leaves for user-authored workspace commands.
Adapter code renders those specs to local shell, SSH shell, or another executor-specific form only
at the execution boundary. Workflow logic must not branch on ad-hoc rendered command strings.

When `ResourceRuntimeProfile.runtimeName` is present, deployment planning/runtime adapters may use
it as the requested runtime name while still deriving a unique effective Docker container or
Compose project name from deployment/resource/preview context. The requested value must not be
treated as an exact global reservation because safe replacement may require two same-resource
runtime instances to overlap briefly.

For `auto` and `workspace-commands` plans, framework detection must follow
[Workload Framework Detection And Planning](./workload-framework-detection-and-planning.md).
The workflow may inspect normalized source evidence such as package manifests, package/project
name, package manager or build tool, framework config, lockfiles, runtime version files, detected
scripts, Dockerfile/Compose paths, and static/build output conventions. The selected planner owns
base image choice and install/build/start/package defaults. Entry workflows and command schemas
must not collect planner internals as deployment fields.

No v1 entry workflow may treat `workspace-commands`, static hosting, PM2, systemd, or raw host
processes as a long-lived deployment substrate. Such runtimes require a future ADR before they can
be public deployment strategies.

The runtime adapter may perform an internal safe-replacement or rollback-to-previous-container
sequence when a rollout fails, but public rollback remains absent under ADR-016 until rebuilt
through its own command, workflow, error, test, and implementation specs.

## Runtime Orchestration Target Boundary

Runtime target selection is an internal step after deployment context resolution. It is governed by
[Deployment Runtime Target Abstraction](./deployment-runtime-target-abstraction.md).

The workflow must select a runtime target backend from the deployment target, destination, provider
key, target kind, and required capabilities. Entry workflows must not collect orchestrator-specific
fields for `deployments.create`.

Allowed target backend progression:

- v1 active: single-server Docker/Compose through local shell or generic SSH.
- future: Docker Swarm backend after Swarm target/readiness/registry/log/health/cleanup specs.
- future: Kubernetes backend after cluster target/readiness/placement/secret/route/log/health/cleanup specs.

Target-specific render/apply artifacts such as Docker shell commands, Swarm stack definitions,
Kubernetes manifests, Helm values, kubeconfig clients, or provider API responses belong to adapter
packages. Read surfaces may expose sanitized summaries, but command and workflow contracts remain
provider-neutral.

## Missing Input Behavior

| Missing data | Workflow contract |
| --- | --- |
| Repository deployment config file | Local entry workflows may read it before command dispatch. The file may supply profile defaults but must not supply project/resource/server/destination/credential identity, raw secrets, or unsupported target sizing fields. |
| Resource source binding | Entry workflow must create or select a resource with source binding before deployment admission, or command validation rejects in phase `resource-source-resolution`. |
| Resource source variant metadata | Entry workflow must normalize deep Git URLs, Git refs, source base directories, local-folder subdirectories, Docker image tag/digest identity, and artifact extraction roots into `ResourceSourceBinding` before deployment admission. Deployment admission must not guess source variants from raw UI URLs. |
| Resource runtime profile | Entry workflow may create a resource with runtime profile; if omitted, deployment planning uses the resource/default runtime strategy contract. |
| Resource runtime naming intent | Entry workflow may create or configure `runtimeProfile.runtimeName`; deployment planning derives an effective runtime instance/container/project name from it when present. |
| Strategy-specific build file paths | Entry workflow must persist Dockerfile path, Docker Compose file path, static publish directory, and command defaults as resource runtime profile fields. Deployment admission combines these fields with the source binding base directory during runtime plan resolution. |
| Static publish directory | Static-site entry workflows must persist `runtimeProfile.publishDirectory` before deployment admission. If a historical or selected static resource lacks it, deployment admission rejects in phase `runtime-plan-resolution` or `runtime-artifact-resolution`. |
| Resource network profile | Entry workflow must create or select an inbound resource with `networkProfile.internalPort`, or deployment admission rejects in phase `resource-network-resolution`. |
| project/environment/server/destination/resource context | Entry workflow may collect/create required context; destination may use the compatibility default seam; command admission rejects if still unresolved or inconsistent. |
| Generated default access | Entry workflow does not collect provider-specific generated-domain settings. Deployment route resolution uses configured policy and the provider-neutral default access domain port. |
| Domain/TLS intent | Entry workflow must use `domain-bindings.create` and certificate commands. It must not pass domain/TLS fields to `deployments.create`. |
| Quick Deploy context | Collected by the Quick Deploy workflow through explicit operations; it is not a separate deployment command. |

## Runtime Port Behavior

For reverse-proxy resources, `networkProfile.internalPort` is the upstream workload listener inside
the runtime boundary. It is legal for two resources on the same deployment target to listen on the
same `internalPort` because the runtime/proxy fabric must distinguish them by resource/deployment
identity and routing metadata.

Runtime adapters must not implement reverse-proxy rollout by globally removing workloads that
publish the same application port. A new deployment attempt may replace an older runtime instance
only for the same resource after the redeploy guard allows a new terminal attempt.

Replacement must be explicit about which prior attempt is being superseded. Deployment admission
should record the previous same-resource runtime-owning deployment attempt that remains eligible
for cleanup after the new candidate succeeds. Cleanup must target that superseded attempt identity,
not every runtime instance that shares the same resource label.

For reverse-proxy resources, replacement is candidate-first. The runtime adapter must keep the
previous successful runtime instance for the same resource serving until the replacement candidate
has passed the required apply, internal health, proxy route realization, and public route
verification gates. A failure in any of those gates, including DNS or route readiness failures
during public verification, must clean up only the failed candidate and preserve the previous
successful runtime/route when one exists.

If an adapter needs a host-side port for health checks, it may allocate a private loopback or
runtime-local ephemeral port and discover that mapping after start. That port is not a public access
route and must not be shown as the resource's generated URL.

For direct-port resources, the effective host port is a placement constraint. A direct-port
collision with another resource on the same target/destination is a conflict or runtime failure, not
authorization to stop the other resource.

Direct-port replacement for the same resource is the exception to candidate-first replacement
because the previous runtime may occupy the only usable host port. If an adapter releases the
previous same-resource runtime before binding the replacement, that behavior must be treated as a
direct-port rollout strategy and must never expand into cross-resource cleanup.

## State And Event Points

| Stage | Deployment event/state |
| --- | --- |
| Request accepted | `deployment-requested`; accepted deployment state exists. |
| Build/package required | `build-requested`; build/process state begins. |
| Runtime rollout started | `deployment-started`; deployment running state begins. |
| Proxy route realized | Runtime adapter configures generated or durable access route for this attempt; progress/read models expose route state. |
| Terminal success | `deployment-succeeded`; deployment status is succeeded. |
| Terminal failure | `deployment-failed`; deployment status is failed. |

The accepted deployment state should include:

- the immutable environment snapshot and runtime plan snapshot for this attempt;
- the current attempt status;
- when applicable, the explicit `supersedesDeploymentId` for the previous same-resource
  runtime-owning deployment that may be cleaned up after terminal success.

## Current Implementation Notes And Migration Gaps

Current implementation already routes API and CLI through the shared command.

Migration gaps:

- current use case awaits runtime backend execution before returning;
- logical resource-runtime scoped admission coordination from ADR-028 is implemented for the
  shell/runtime path, while non-shell entry and cross-provider parity still need explicit coverage;
- current SSH entry paths now keep coarse backend locking to brief state-root maintenance and may
  retry final mirror upload after `remote_state_revision_conflict` by merging non-overlapping
  PG/PGlite row changes onto a fresher remote snapshot; overlapping row edits still fail with a
  structured infrastructure merge conflict;
- current aggregate events are `deployment.planning_started`, `deployment.planned`, `deployment.started`, and `deployment.finished`;
- `deployment-requested`, `build-requested`, `deployment-succeeded`, and `deployment-failed` are canonical workflow events;
- Web QuickDeploy currently has local hardcoded validation and related-entity orchestration;
- stream API currently emits `DeploymentProgressEvent`, which is a technical progress event, not a formal domain/application event.
- deployment admission reads `networkProfile.internalPort` as the canonical resource-owned listener port and does not read `runtimeProfile.port`.
- runtime execution paths must preserve the distinction between `internalPort`, optional private
  health-check mappings, and public direct `hostPort`.
- current deployment/runtime paths use typed source `baseDirectory` for Git/local source workdirs and
  reject legacy raw GitHub tree URLs before clone; static publish directory is typed for static
  runtime profiles, while typed runtime-profile Dockerfile/Compose path fields are still pending.
- runtime Docker build/run/Compose execution uses typed command specs with adapter renderers for
  local and generic SSH runtime adapters. Legacy workspace command text remains a shell-script leaf
  until runtime profile command fields are remodeled as typed command steps.
- runtime target execution selection remains single-server, but local-shell and generic-SSH are now
  selected through a target kind/provider/capability registry; admission-time unsupported-target
  checks are still pending before Swarm or Kubernetes are added.
- repository config file support now has a profile-only parser/schema, YAML discovery, CLI
  `--config`, profile-only `appaloft init`, targeted rejection coverage for identity, secret, and
  unsupported fields, and ids-only `deployments.create` admission. Existing-resource profile drift
  visibility is governed by
  [Resource Profile Drift Visibility](../specs/011-resource-profile-drift-visibility/spec.md) and
  must remain an entry-workflow preflight/read diagnostic instead of a deployment workflow input.
  Environment/secret command sequencing remains a workflow gap.
- generated default access route resolution now has a provider boundary and `ResourceAccessSummary`
  projection. Remaining deployment workflow gaps are durable-domain/server-applied precedence in the
  resolver, provider-route projection/retention, and replacing adapter-facing requested route seams
  with fully provider-neutral route resolution.

## Open Questions

- Should `deployments.create` stream stay a technical progress API only, or later become a durable workflow event stream?
