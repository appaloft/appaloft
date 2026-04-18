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
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)

This file defines the deployment-specific workflow sequence and entry boundaries.

## End-To-End Workflow

```text
user intent
  -> entry-specific input collection
  -> explicit project/environment/server/resource selection or creation
  -> explicit deployments.create command input with ids only
  -> command admission
  -> resolve resource network/access snapshots from resource, server, domain, and default access policy state
  -> deployment-requested
  -> runtime target backend is selected from deployment target, destination, provider key, and capabilities
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

Retry is an explicit retry command or job that creates a new deployment attempt.

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
- prompt interactively when TTY is available as the CLI form of the Quick Deploy workflow;
- create/select related records through their own explicit commands before deployment;
- print progress and final read-model state.

CLI must not:

- dispatch an incomplete `deployments.create` command outside a documented input-collection workflow;
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
| Resource source binding | Entry workflow must create or select a resource with source binding before deployment admission, or command validation rejects in phase `resource-source-resolution`. |
| Resource source variant metadata | Entry workflow must normalize deep Git URLs, Git refs, source base directories, local-folder subdirectories, Docker image tag/digest identity, and artifact extraction roots into `ResourceSourceBinding` before deployment admission. Deployment admission must not guess source variants from raw UI URLs. |
| Resource runtime profile | Entry workflow may create a resource with runtime profile; if omitted, deployment planning uses the resource/default runtime strategy contract. |
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

## Current Implementation Notes And Migration Gaps

Current implementation already routes API and CLI through the shared command.

Migration gaps:

- current use case awaits runtime backend execution before returning;
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
- generated default access route resolution and provider injection are not yet implemented as a distinct workflow; current runtime adapters still consume runtime-plan access routes directly.

## Open Questions

- Should `deployments.create` stream stay a technical progress API only, or later become a durable workflow event stream?
