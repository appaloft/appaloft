# deployments.create Command Spec

## Normative Contract

`deployments.create` is the source-of-truth command for accepting a deployment request.

Command success means **the deployment request has been accepted and a deployment id is available**. It does not mean runtime execution, verification, routing, or release health has completed.

```ts
type CreateDeploymentResult = Result<{ id: string }, DomainError>;
```

The command contract is:

- admission failure returns `err(DomainError)`;
- accepted requests return `ok({ id })`;
- post-acceptance runtime failure persists failed deployment state and publishes `deployment-failed`;
- retry creates a new deployment attempt with a new deployment id.

## Global References

This command inherits the shared platform contracts:

- [ADR-001: deployments.create HTTP API Required Fields](../decisions/ADR-001-deploy-api-required-fields.md)
- [ADR-002: Routing, Domain, And TLS Boundary](../decisions/ADR-002-routing-domain-tls-boundary.md)
- [ADR-010: Quick Deploy Workflow Boundary](../decisions/ADR-010-quick-deploy-workflow-boundary.md)
- [ADR-012: Resource Runtime Profile And Deployment Snapshot Boundary](../decisions/ADR-012-resource-runtime-profile-and-deployment-snapshot-boundary.md)
- [ADR-013: Project Resource Navigation And Deployment Ownership](../decisions/ADR-013-project-resource-navigation-and-deployment-ownership.md)
- [ADR-014: Deployment Admission Uses Resource Profile](../decisions/ADR-014-deployment-admission-uses-resource-profile.md)
- [ADR-015: Resource Network Profile](../decisions/ADR-015-resource-network-profile.md)
- [ADR-017: Default Access Domain And Proxy Routing](../decisions/ADR-017-default-access-domain-and-proxy-routing.md)
- [ADR-021: Docker/OCI Workload Substrate](../decisions/ADR-021-docker-oci-workload-substrate.md)
- [ADR-023: Runtime Orchestration Target Boundary](../decisions/ADR-023-runtime-orchestration-target-boundary.md)
- [ADR-028: Command Coordination Scope And Mutation Admission](../decisions/ADR-028-command-coordination-scope-and-mutation-admission.md)
- [resources.archive Command Spec](./resources.archive.md)
- [Workload Framework Detection And Planning](../workflows/workload-framework-detection-and-planning.md)
- [Repository Deployment Config File Bootstrap](../workflows/deployment-config-file-bootstrap.md)
- [Resource Profile Drift Visibility](../specs/011-resource-profile-drift-visibility/spec.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)

This file defines only the deployment-specific command semantics.

## Purpose

Create a deployment attempt for a source, resource, environment, server, and destination. The command admits the request, prepares durable deployment state, and starts deployment progression.

`deployments.create` is a deployment-attempt command. It is not the durable owner of reusable resource source, runtime, network, health, generated access, routing, domain, or TLS configuration. Deployment-specific snapshots are resolved from resource, environment, server, destination, default access policy, and routing state during admission/planning.

For v1, the resolved runtime plan must be Docker/OCI-backed. Source and runtime profile variants are
different ways to produce or reference image/container artifacts, not different public execution
substrates.

Docker/OCI is the workload artifact substrate. The selected deployment target and destination
choose the runtime orchestration backend behind the command. Single-server Docker/Compose is the
active v1 backend; Docker Swarm and Kubernetes are future backends governed by ADR-023 and must not
add provider-specific fields to this command.

The command's domain language is **deployment attempt admission**. It must not use `Deployment` as the owner name for source binding, runtime profile, health policy, access profile, domain binding, or TLS policy.

It is not:

- a Web wizard step;
- a CLI prompt;
- a Quick Deploy workflow command;
- a deployment success event;
- a runtime adapter API;
- a query/read-model operation.

## Input Model

The command input is defined by the shared command schema and must be reused by HTTP, CLI, Web, automation, and future MCP tools.

The command input is the deployment admission reference set. Source, runtime, health, route, domain, and TLS configuration are resolved from resource/domain/server state and copied only into the resulting deployment snapshots.

| Field | Requirement | Meaning |
| --- | --- | --- |
| `projectId` | Required | Existing project context. |
| `serverId` | Required | Existing server/runtime target context. |
| `environmentId` | Required | Existing environment context. |
| `resourceId` | Required | Existing resource to deploy. The resource owns source/runtime/network profile. |
| `destinationId` | Optional | Existing destination context. If omitted, a compatibility seam may resolve or create the server default destination before context validation. |

Schema validation handles shape-level constraints. Application admission handles context resolution, consistency, and deployment-specific invariants.

Repository deployment config files are not part of this input model. CLI, Web/local-agent,
automation, and future MCP entry workflows may read a config file before dispatch, but they must
normalize the file into explicit project/environment/server/resource selections and resource-owned
profile commands before creating this command. HTTP/oRPC deployment admission remains strict and
non-interactive.

## Admission Coordination

`deployments.create` uses **operation coordination** in addition to any entry-workflow or backend
state-root coordination.

The command's logical coordination scope is `resource-runtime`. The scope key is derived from the
resolved deployment context for the selected deployable runtime owner and target placement context.

Rules:

- unrelated resources must not be serialized only because they share the same SSH server or state
  root;
- coordination happens before durable admission takes ownership of a new attempt;
- v1 coordination is bounded waiting before acceptance, not durable queued acceptance;
- timing out while waiting for the coordination scope rejects the command with a retriable
  coordination error instead of creating a queued deployment attempt.
- in SSH `ssh-pglite` mode, command completion may still perform brief state-root maintenance to
  upload the local mirror back to the remote host; that finalization path may merge non-overlapping
  row changes after `remote_state_revision_conflict`, but it must not weaken logical admission
  scope semantics.

## Domain Language Boundary

The command must preserve these terms:

| Term | Owner | Meaning |
| --- | --- | --- |
| Resource profile | `Resource` lifecycle commands | Durable deployable unit identity and ownership. |
| Resource source binding | `Resource` lifecycle commands | Durable reusable source configuration. |
| Resource runtime profile | `Resource` lifecycle commands | Durable reusable build, start, health, and runtime naming defaults. |
| Resource network profile | `Resource` lifecycle commands | Durable reusable internal listener port, upstream protocol, exposure mode, and target service. |
| Generated access route | Default access domain provider and route resolver | Provider-neutral convenience route resolved from policy, server public address, proxy readiness, and resource network profile. |
| Resource access profile / domain binding | Future resource access operation or `domain-bindings.create` | Durable reusable access-route/domain/TLS intent. |
| Runtime plan snapshot | `Deployment` | Immutable resolved runtime and network plan persisted on the deployment attempt. |

New code must prefer `RuntimePlanStrategy` language over `deploymentMethod` and must not introduce deployment-owned source/runtime/network configuration.

## Admission Flow

The command must perform or delegate these admission steps before returning acceptance:

1. Validate the command input schema.
2. Resolve or create the server default destination when `destinationId` is omitted and the compatibility seam is in scope.
3. Resolve project, environment, resource, server, and destination.
4. Reject inconsistent context, including cross-project/environment/resource/destination mismatches.
5. Reject archived resources with `resource_archived`.
6. Reject inactive servers with `server_inactive`.
7. Resolve operation coordination for the command's `resource-runtime` scope.
7. Wait bounded time for the coordination scope or reject with a retriable coordination timeout.
8. If the latest same-resource deployment is active, resolve the supersede branch:
   - `created`, `planning`, and `planned` attempts are canceled immediately and record
     `supersededByDeploymentId`;
   - `running` attempts enter `cancel-requested`, must be canceled through the runtime backend, and
     then are marked `canceled` with `supersededByDeploymentId`;
   - if supersede cannot complete safely, reject the later request with a deployment-specific
     conflict branch.
9. The write side must still enforce the single active same-resource invariant atomically when
   durable deployment state is created so a concurrent submit cannot bypass the guard through a
   read/write race.
10. Resolve the source descriptor from `ResourceSourceBinding`.
11. Resolve runtime plan configuration from `ResourceRuntimeProfile`, including reusable runtime
    naming intent when present.
12. Resolve network endpoint configuration from `ResourceNetworkProfile`.
13. Create an immutable environment snapshot.
14. Resolve default generated and durable access route snapshots from resource/domain/server/policy state when the resource requires public reverse-proxy access.
15. Resolve the runtime plan, Docker/OCI artifact requirements, and network/access snapshots.
16. Resolve that the selected deployment target/destination has a runtime target backend with the
    required capabilities.
17. Create durable deployment state.
    When a previous same-resource runtime-owning deployment exists, the new deployment state must
    record the explicit superseded deployment id that cleanup and replacement logic may touch.
18. Publish or record `deployment-requested`.
19. Return `ok({ id })`.

Build, rollout, verify, failure recording, and retry progression belong to the async workflow owner, process manager, event handler, worker, or runtime adapter boundary. They must not be hidden inside Web/CLI/API entry logic.

For Git-backed sources, runtime source materialization must record the exact resolved Git object id
after clone/checkout. The resolved source commit is deployment-attempt metadata, must be persisted
with the deployment snapshot/read model, and must be visible to Web and CLI consumers. When a branch
or tag is redeployed without a pinned commit, each new deployment attempt may resolve a newer
commit; the stored resolved commit is the audit point for that attempt.

## Deployment-Specific Async Progression

Required deployment event chain:

```text
deployments.create
  -> deployment-requested
  -> build-requested, when build/package work is required
  -> deployment-started
  -> deployment-succeeded | deployment-failed
```

Prebuilt image deployments skip `build-requested` unless artifact verification is modeled as a separate event. They still preserve image identity in the deployment snapshot when available.

Terminal post-acceptance runtime failure records `Deployment.status = failed`, publishes `deployment-failed`, and preserves the original command result as `ok({ id })`.

## Events

Canonical event specs for this command:

- `deployment-requested`: request accepted and durable deployment state exists.
- `build-requested`: build/package work requested for the source/runtime plan.
- `deployment-started`: runtime rollout/execution started.
- `deployment-succeeded`: terminal success.
- `deployment-failed`: terminal failure.

Event publication follows the shared event publication semantics in [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md).

## Deployment-Specific Error Codes

All errors use the shared shape and category rules in [Error Model](../errors/model.md). The command-specific phases and codes are:

| Error code | Phase | Retriable | Deployment-specific meaning |
| --- | --- | --- | --- |
| `validation_error` | `command-validation`, `config-bootstrap`, `context-resolution`, `source-detection`, `runtime-plan-resolution` | No | Input, bootstrap, context, source, or plan cannot produce an accepted deployment request. |
| `validation_error` | `resource-source-resolution` | No | Resource source binding or source variant metadata cannot produce a cloneable/materializable source descriptor. |
| `validation_error` | `resource-network-resolution` | No | Resource network profile cannot produce a resolved deployment network snapshot. |
| `not_found` | `context-resolution` | No | Referenced project, environment, server, destination, or resource is missing or inaccessible. |
| `resource_archived` | `resource-lifecycle-guard` | No | Referenced resource is archived and cannot accept new deployment attempts. |
| `server_inactive` | `server-lifecycle-guard` | No | Referenced server is inactive and cannot accept new deployment attempts. |
| `coordination_timeout` | `operation-coordination` | Yes | The command could not acquire its logical resource-runtime coordination scope within the bounded wait window before admission. |
| `deployment_not_redeployable` | `redeploy-guard` | No | Latest deployment for the same resource is non-terminal. |
| `conflict` | `admission-conflict` | No | A deployment-specific admission conflict not covered by redeployability. |
| `invariant_violation` | `planning-transition`, `execution-start-transition`, `finalization` | No | Deployment state transition was attempted out of order. |
| `infra_error` | `deployment-creation`, `event-publication` | Conditional | Persistence or infrastructure failure before the request can be safely accepted. |
| `provider_error` | `runtime-plan-resolution` | Conditional | Provider/runtime boundary rejects the plan before acceptance. |
| `runtime_target_unsupported` | `runtime-target-resolution` | No | The selected target kind/provider key has no registered backend with the required runtime capabilities. |
| `default_access_route_unavailable` | `default-access-policy-resolution`, `default-access-domain-generation`, `proxy-readiness` | Conditional | A required generated access route cannot be resolved before acceptance. |
| `proxy_route_realization_failed` | `proxy-route-realization`, `public-route-verification` | Yes | Runtime adapter failed to materialize or verify the resolved route after acceptance; represented as workflow failure. |
| `unsupported_config_field` | `config-capability-resolution` | No | A repository config file requested a known future capability, such as CPU/memory/replicas/restart policy, that is not backed by accepted resource/runtime-target specs and runtime enforcement. This is an entry-workflow rejection before `deployments.create`. |

Missing or explicitly disabled edge proxy intent makes generated default access unavailable rather than required. The command may continue without a generated route, and it must not publish a direct host-port fallback.

Runtime/build/deploy/verify failures after acceptance are workflow failures and must be represented by deployment state plus `deployment-failed`.

## Docker/OCI Runtime Substrate

The v1 deployment runtime substrate is governed by
[ADR-021: Docker/OCI Workload Substrate](../decisions/ADR-021-docker-oci-workload-substrate.md).

The command contract remains provider-neutral, but the accepted runtime plan snapshot must identify
the Docker/OCI artifact class needed by runtime execution:

| Runtime plan kind | Snapshot requirement |
| --- | --- |
| Buildable source | Build context, strategy, Dockerfile/buildpack/static/workspace command plan, and expected image tag or digest. |
| Prebuilt image | Image name plus tag or digest; digest is preferred for immutable snapshots. |
| Compose stack | Compose project identity, service image/build declarations, target service for inbound traffic, and resource/deployment-scoped project naming derived from resource runtime profile plus deployment context. |
| Static site | Source root, `publishDirectory`, optional install/build command leaves, static-server artifact intent, and HTTP runtime endpoint metadata. |

Framework and package detection is part of runtime plan resolution, not deployment admission input.
When the selected resource uses `RuntimePlanStrategy = auto` or `workspace-commands`, deployment
planning may inspect the materialized source root and select a framework/runtime planner using typed
`SourceInspectionSnapshot` evidence. The snapshot may include runtime family, framework, package
manager or build tool, package/project name, runtime version, lockfiles, detected scripts,
Dockerfile/Compose paths, and static/build outputs. The planner resolves base image, install/build,
start, package, and artifact rules behind the command boundary.

The target support catalog is governed by
[Workload Framework Detection And Planning](../workflows/workload-framework-detection-and-planning.md).
Mainstream framework support must be added by extending detectors, source-inspection value objects,
planner registry entries, Docker/OCI artifact rules, and tests. It must not be implemented by
adding framework-specific fields such as `framework`, `packageName`, `baseImage`, `nodeVersion`,
`pythonVersion`, `buildpack`, or `runtimePreset` to `deployments.create`.

If a detected framework/runtime has no supported planner and the resource runtime profile does not
provide explicit commands sufficient for a custom containerizable plan, deployment admission fails
with `validation_error` in phase `runtime-plan-resolution`. The error details should include safe
evidence such as `runtimeFamily`, `framework`, `packageManager`, `projectName`, `plannerKey`, and
detected file/script identifiers when available.

Static site deployment is a first-class deployment behavior over the existing command boundary. The
resource owns `kind = "static-site"`, source binding metadata, `RuntimePlanStrategy = "static"`,
`runtimeProfile.publishDirectory`, optional install/build commands, and
`ResourceNetworkProfile.internalPort`. Deployment planning packages the resolved publish directory
into a Docker/OCI image that serves static files over HTTP, typically through an adapter-selected
static server image. The concrete static server image, generated web-server config, and Docker
labels are adapter artifacts, not deployment command input.

If a static resource lacks `runtimeProfile.publishDirectory`, or the value cannot be safely
resolved under the source base directory after optional build commands, deployment admission fails
with `validation_error` in phase `runtime-plan-resolution` or `runtime-artifact-resolution`
according to where the invalid profile is detected.

`ResourceRuntimeProfile.runtimeName` is a provider-neutral requested runtime name, not a Docker-only
command field. Deployment planning/runtime adapters may use it to derive effective Docker
container names or Compose project names, but they must preserve uniqueness for candidate-first
replacement and must not treat the requested name as permission to stop or replace another
resource.

The runtime adapter may store sanitized Docker image ids, container ids, Compose project names,
requested runtime names, effective runtime names, and container/health diagnostics in deployment
logs, diagnostics, or read models. Those fields are not public command input and must not be
required by Web/CLI/API callers.

Runtime execution steps derived from the accepted plan must be represented as typed runtime command
specifications before they reach an executor. Docker build, Docker container run, Docker Compose,
Docker inspect/log, and cleanup steps should carry structured fields for image reference, container
identity, Compose file, environment variables, labels, ports, working directory, and redaction
rules. Local shell strings, SSH shell strings, and future Docker API requests are render targets
for those command specs, not the command contract itself.

User-authored command text can still appear as a shell-script leaf when the resource runtime profile
requires custom install/build/start commands. That shell-script leaf must remain scoped to the
runtime command spec and must not become an untyped metadata bag that decides the deployment
workflow.

Runtime replacement and cleanup must be resource-scoped. A new deployment may replace only older
runtime instances belonging to the same resource after the adapter strategy allows it. It must not
stop another resource because the other resource shares an internal port, image name, Compose
service name, or proxy label shape.

Replacement targeting must also be attempt-scoped. When deployment admission identifies a previous
same-resource runtime-owning deployment as the replacement target, the new deployment snapshot or
durable state must preserve that superseded deployment identity. Runtime cleanup must remove only
that explicitly superseded attempt's runtime identity, not an arbitrary "other container for the
same resource" scan.

For reverse-proxy or otherwise route-mediated deployments, the adapter strategy must preserve the
last-known-good runtime for the same resource until the replacement attempt passes the required
apply, health, route realization, and public route verification gates. If the replacement fails
after starting a candidate runtime, cleanup targets the failed candidate and preserves the previous
serving runtime and rollback-candidate identity when available.

For direct-port deployments, the effective host port is exclusive, so an adapter may need to release
the previous same-resource runtime before binding the replacement. That exception must stay scoped
to the same resource and must be reflected as direct-port rollout strategy behavior, not as general
cleanup permission.

Rollback remains a future public operation under ADR-016. `deployments.create` may preserve previous
runtime identity as rollback-candidate metadata, but it must not expose a hidden rollback command or
claim data-volume rollback.

## Runtime Orchestration Target Boundary

The command input selects an existing deployment target and optional destination. It does not select
or configure the concrete runtime orchestrator directly.

Runtime target selection is resolved from target kind, provider key, destination, and registered
backend capabilities after admission context is resolved:

| Target shape | Command behavior |
| --- | --- |
| Single-server Docker/Compose | Active v1 backend. The runtime adapter may execute locally or over SSH through injected ports. |
| Docker Swarm cluster | Future backend. Requires its own target/profile specs before public use. |
| Kubernetes cluster | Future backend. Requires its own target/profile specs before public use. |

The command must not accept Kubernetes namespaces, Helm values, manifest fragments, Swarm stack
fields, provider pull-secret names, ingress classes, replica counts, or rollout strategy fields.
Those are backend configuration or future target/profile configuration concerns.

If no runtime target backend can be selected before the deployment can be safely accepted, the
command returns `err(DomainError)` with code `runtime_target_unsupported` or `provider_error` in
phase `runtime-target-resolution`.

If target rendering, apply, verify, or cleanup fails after acceptance, the original command result
remains `ok({ id })`; the workflow records failed deployment/process state and publishes
`deployment-failed`.

## Runtime Port Isolation

`ResourceNetworkProfile.internalPort` is the workload listener port inside the runtime boundary. It
is not a globally unique server host port.

For `reverse-proxy` exposure:

- multiple resources on the same server/destination may use the same `internalPort`;
- route realization must target the resource's resolved `internalPort` through the selected runtime
  network or equivalent routing fabric;
- runtime adapters may publish a private loopback or runtime-local ephemeral host port for internal
  health checks, but that mapping is not public access state;
- cleanup and replacement must be scoped to the same resource/workload identity, not to every
  workload that exposes the same `internalPort`.

For `direct-port` exposure:

- `hostPort` is the server placement collision boundary;
- if the requested effective host port is already owned by another resource on the same
  server/destination, the attempt must reject admission when safely detectable or persist a
  post-acceptance runtime failure;
- the runtime must not stop another resource to free the host port.

## Handler Boundary

The command handler owns command dispatch and use-case delegation only. It must not own:

- Web or CLI prompts;
- HTTP status mapping;
- persistence implementation;
- provider SDK calls;
- runtime backend details;
- UI copy;
- read-model mutation;
- async retry policy.

## Entry Workflow Boundary

Web, CLI, API, automation, and MCP tools may collect input differently, but they must converge on the same command input and semantics.

Allowed entry differences:

- CLI can prompt interactively before dispatch.
- Web can provide UX preflight validation and Quick Deploy input collection before dispatch.
- API remains strict and non-interactive.
- Stream/progress APIs can expose technical progress.

Repository deployment config files are allowed only as entry-workflow profile inputs. The config
workflow must:

- discover and validate the file before dispatching write commands;
- reject committed project/resource/server/destination/credential identity fields;
- reject raw SSH keys, deploy keys, tokens, passwords, certificate keys, and raw secret env values;
- apply accepted source/runtime/network/health fields through `resources.create`, future explicit
  resource configuration operations, environment variable commands, or follow-up domain/certificate
  commands;
- reject CPU, memory, replicas, restart policy, rollout overlap/drain, or similar target sizing
  fields until their ADR/spec/test/runtime-enforcement path exists;
- dispatch this command with ids only.

Not allowed:

- Web/CLI/API changing deployment business rules;
- Quick Deploy becoming a hidden deployment command;
- UI steps becoming domain invariants;
- source detection, runtime plan resolution, or deployment state progression living in transport code.

Project-level deployment lists are read-model rollups. Project-level "new deployment" entrypoints
must behave as Quick Deploy or another entry workflow that selects or creates a resource before
dispatching `deployments.create`. Resource-level new deployment entrypoints are the preferred
owner-scoped surfaces.

## Current Implementation Notes And Migration Gaps

Current code already has the command, handler, schema, and use case. The handler delegates to the use case, which is aligned with the command boundary.

Migration gaps:

- the use case currently awaits runtime backend execution before returning;
- current aggregate events are `deployment.planning_started`, `deployment.planned`, `deployment.started`, and `deployment.finished`;
- `deployment-requested`, `build-requested`, `deployment-succeeded`, and `deployment-failed` are canonical specs and may need concrete implementation or projection from current events;
- `deployment.finished` currently carries terminal status and should be split or projected into `deployment-succeeded` / `deployment-failed`;
- no durable outbox/inbox/process-manager behavior was confirmed for this command;
- logical resource-runtime scoped coordination from ADR-028 is implemented for the shell/runtime
  path, while non-shell entry and cross-provider parity still need explicit coverage;
- SSH `ssh-pglite` entry paths now keep coarse backend locking to brief state-root maintenance,
  release it before command execution, and on final upload retry non-overlapping PG/PGlite row
  changes after `remote_state_revision_conflict`; overlapping row edits still fail with a
  structured infrastructure merge conflict;
- current use-case return type is `Promise<Result<{ id: string }, DomainError>>`, not public `ResultAsync`;
- Web QuickDeploy still performs some hardcoded local validation before dispatch.
  Quick Deploy is governed by [ADR-010](../decisions/ADR-010-quick-deploy-workflow-boundary.md).
- ADR-016 removes cancel, manual deployment health check, redeploy, reattach, and rollback from the
  public deployment write command surface until they are rebuilt through source-of-truth specs and
  implementation plans.
- `source`, `sourceLocator`, `deploymentMethod`, command override, network, route, domain, and TLS fields have
  been removed from the deployment command contract by ADR-014. Legacy code paths and historical
  tests that relied on deployment bootstrap must migrate to `resources.create` with
  source/runtime/network profile before deployment admission.
- source descriptor and runtime plan strategy compatibility is now a resource profile planning rule;
  implementation coverage should be verified across Web, CLI, and API before removing this note.
- resource source variant normalization is typed for the initial Git and Docker image fields;
  deployment admission rejects legacy raw GitHub tree URLs before runtime adapters can clone them.
  Provider-backed disambiguation for slash-containing Git refs and typed runtime-profile file paths
  remain future work.
- repository config file support now has a profile-only parser/schema, YAML discovery, CLI
  `--config`, profile-only `appaloft init`, and targeted tests proving identity/secret/unsupported
  field rejection plus ids-only `deployments.create`. Existing-resource profile drift handling and
  environment/secret command sequencing remain workflow gaps, not deployment command fields. Drift
  visibility is governed by
  [Resource Profile Drift Visibility](../specs/011-resource-profile-drift-visibility/spec.md) and
  must fail in the entry workflow before this command when unapplied normalized profile changes would
  otherwise be ignored. Durable source link creation/reuse and explicit relink are handled outside
  `deployments.create`.
- resource listener port is stored as `networkProfile.internalPort`; deployment admission does not read `runtimeProfile.port`.
- archived-resource admission blocking is specified through `resources.archive`, but remains a
  future implementation gap until explicit resource lifecycle state lands.
- runtime adapter behavior treats reverse-proxy `internalPort` as a workload-local listener rather
  than a globally unique host port; same-port reverse-proxy resources require resource-scoped
  cleanup/replacement.
- Docker build/run/Compose command composition now uses typed runtime command specs with local/SSH
  renderers in the runtime adapter. Legacy workspace install/build/start command text remains a
  shell-script leaf until runtime profile command fields are fully remodeled.
- runtime target execution selection and deployment admission now use a
  `RuntimeTargetBackendRegistry` for local-shell and generic-SSH single-server backends; admission
  rejects unresolved backends with pre-acceptance `runtime_target_unsupported` checks before Swarm
  or Kubernetes backends are added.
- generated default access routing is governed by ADR-017, but the current runtime adapter path still contains adapter-facing requested deployment route fields that must be replaced by provider-neutral route resolution.

## Open Questions

- Resource source/runtime/network operation names are resolved as accepted candidates:
  `resources.configure-source`, `resources.configure-runtime`, and `resources.configure-network`.
  Access profile configuration remains a separate future behavior governed by ADR-017 and the
  routing/domain/TLS specs. Generic aggregate update commands are forbidden by
  [ADR-026](../decisions/ADR-026-aggregate-mutation-command-boundary.md).
