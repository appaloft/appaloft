# ADR-023: Runtime Orchestration Target Boundary

Status: Accepted

Date: 2026-04-16

## Decision

Yundu separates the **workload substrate** from the **runtime orchestration target**.

The workload substrate remains governed by
[ADR-021: Docker/OCI Workload Substrate](./ADR-021-docker-oci-workload-substrate.md): v1
deployments produce, pull, or reference OCI/Docker image artifacts, or materialize a Compose
project whose runnable services are backed by OCI/Docker images.

The runtime orchestration target decides where and how those artifacts are rolled out, observed,
verified, routed, cleaned up, and later used for rollback candidates. Runtime target selection is
not a public deployment command. It is an internal capability used by `deployments.create` after
the command has selected an existing `DeploymentTarget` and `Destination`.

The accepted target model is:

| Target model | Public operation state | Meaning |
| --- | --- | --- |
| Single-server Docker/Compose | Active v1 implementation target | A local or SSH-reached server runs Docker containers or Docker Compose projects. |
| Docker Swarm cluster | Future target backend | A Docker-compatible cluster backend consumes the same OCI artifact and resource network/access contracts, then renders Swarm stack/service intent. |
| Kubernetes cluster | Future target backend | A Kubernetes backend consumes the same OCI artifact and resource network/access contracts, then renders and applies Kubernetes-owned workload, service, routing, health, log, and cleanup intent. |

`deployments.create` must not grow transport fields such as `kubernetesNamespace`, `helmChart`,
`dockerSwarmService`, `replicas`, or provider-specific manifest fragments. Cluster placement,
namespace-like isolation, service naming, rollout strategy, registry pull secrets, ingress class,
and manifest/stack rendering are runtime-target backend concerns or future target/profile
configuration concerns, not deployment admission input.

## Context

Yundu's v1 loop needs one coherent deployment path, but the product direction should not make
single-node Docker the permanent architecture. Similar self-hosted deployment products often start
with Docker or Docker Compose and then add cluster scheduling later. Kubernetes support is useful
only if the domain model can keep the same business operation surface while swapping the execution
backend.

Existing code already hints at this separation:

- `DeploymentTarget` carries `targetKind` and `providerKey`.
- `RuntimePlanSnapshot` carries a provider-neutral artifact snapshot and target descriptor.
- `RuntimePlanResolver` and `ExecutionBackend` are application ports.
- `packages/adapters/runtime` owns local and generic-SSH Docker/Compose execution.

The missing contract is the boundary between a containerizable workload plan and a concrete runtime
orchestrator such as single-server Docker, Docker Swarm, or Kubernetes.

## Options Considered

### Option A: Add Kubernetes As A New Public Deployment Method

This would let callers submit Kubernetes-specific deployment input directly to
`deployments.create`.

This option is rejected because it would put provider/orchestrator details into the public command
surface and conflict with ADR-014's ids-only deployment admission rule.

### Option B: Replace Docker/OCI With A Fully Generic Runtime In v1

This would make Docker, Kubernetes, PM2, systemd, and raw host processes peers in the first
runtime model.

This option is rejected because it reopens the workload substrate decision settled by ADR-021 and
would under-specify artifacts, logs, health, cleanup, and rollback candidates.

### Option C: Keep OCI Artifacts And Add Runtime Target Backends

This keeps `deployments.create`, `ResourceRuntimeProfile`, `ResourceNetworkProfile`, and
`RuntimePlanSnapshot` stable while allowing multiple runtime target backends to consume the same
artifact and access-route contracts.

This option is accepted.

## Chosen Rule

The code-level abstraction must have three layers:

1. **Workload planning** turns a resource source/runtime/network profile into a provider-neutral
   runtime artifact and workload intent. This layer owns `RuntimePlanStrategy`,
   `RuntimeArtifactSnapshot`, runtime command specs, health policy, and resource workload endpoint
   semantics.
2. **Runtime target planning** turns workload intent plus deployment target/destination/access
   context into target-specific execution intent. This layer may render Docker commands, Compose
   operations, Swarm stack intent, or Kubernetes manifests, but those rendered artifacts remain
   adapter-owned.
3. **Runtime target execution and observation** applies, verifies, logs, diagnoses, and cleans up
   the target-specific intent through an injected backend. Application code depends on ports and
   normalized result/read-model shapes, not Docker SDK, SSH command strings, Kubernetes client
   types, Helm APIs, or provider SDK response types.

`DeploymentTarget.targetKind` should describe the target shape, not the vendor. The canonical
target-kind vocabulary for future Code Rounds is:

| Target kind | Meaning |
| --- | --- |
| `single-server` | One local or remote server executes the deployment. |
| `orchestrator-cluster` | A cluster control plane schedules the deployment across one or more nodes. |

Concrete runtime providers are selected by provider key and registered backend capabilities, such
as `local-shell`, `generic-ssh`, `docker-swarm`, or `kubernetes`. The current provisional enum
values `future-multi-server` and `future-k8s` must not be exposed as public stable vocabulary. A
future Code Round should replace them directly with the canonical target model before those target
kinds are used by Web/API/CLI/MCP contracts.

Runtime target backends must be selected through a registry or equivalent dependency-injected
router keyed by target kind, provider key, and capabilities. Hardcoded provider switches may remain
as an implementation gap for the current local/generic-SSH backend, but they are not the target
architecture.

## Kubernetes Target Scope

Kubernetes support means a runtime target backend can do all of the following behind the existing
business operation contracts:

- consume `RuntimeArtifactSnapshot` image identity and deployment environment snapshots;
- render Kubernetes-owned workload, service, config/secret reference, route, health, log, and
  cleanup intent from provider-neutral deployment/resource state;
- apply the rendered intent through a Kubernetes-capable adapter;
- verify rollout and public route state through normalized deployment and resource health signals;
- read runtime logs through `resources.runtime-logs` without exposing Kubernetes pod/container API
  objects as the query contract;
- record sanitized target execution identity in deployment snapshots, logs, diagnostics, or read
  models when needed for support and cleanup.

Kubernetes object kinds, manifests, Helm values, kubeconfig clients, namespaces, ingress classes,
service accounts, and cluster API responses belong to the Kubernetes adapter/provider boundary.
They must not become required fields on `deployments.create`, `resources.create`, core aggregate
state, or Web/CLI/API input schemas.

If Kubernetes needs durable user-configurable placement or rollout policy, that work requires a
separate Spec Round for target/profile configuration before Web/API/CLI expose it.

## Consequences

The public business surface remains stable:

- `deployments.create` is still the deployment write command.
- Deployment target and destination selection remain id references.
- Resource source/runtime/network profiles remain provider-neutral.
- Runtime logs, health, proxy configuration, and diagnostics remain normalized resource/deployment
  read/query surfaces.

Implementation work should move toward:

- separating workload artifact planning from target orchestration planning;
- replacing backend `if providerKey` routing with a target backend registry;
- using provider-neutral runtime target descriptors in application ports;
- keeping target-specific render/apply/log/health/cleanup code inside adapter or provider packages;
- adding contract tests for backend selection and provider-neutral read results before adding a
  Kubernetes backend.

## Governed Specs

- [Business Operation Map](../BUSINESS_OPERATION_MAP.md)
- [Core Operations](../CORE_OPERATIONS.md)
- [Domain Model](../DOMAIN_MODEL.md)
- [deployments.create Command Spec](../commands/deployments.create.md)
- [deployments.create Workflow Spec](../workflows/deployments.create.md)
- [deployments.create Error Spec](../errors/deployments.create.md)
- [deployments.create Test Matrix](../testing/deployments.create-test-matrix.md)
- [Deployment Runtime Target Abstraction Workflow](../workflows/deployment-runtime-target-abstraction.md)
- [Runtime Target Abstraction Implementation Plan](../implementation/runtime-target-abstraction-plan.md)
- [ADR-014: Deployment Admission Uses Resource Profile](./ADR-014-deployment-admission-uses-resource-profile.md)
- [ADR-017: Default Access Domain And Proxy Routing](./ADR-017-default-access-domain-and-proxy-routing.md)
- [ADR-018: Resource Runtime Log Observation](./ADR-018-resource-runtime-log-observation.md)
- [ADR-019: Edge Proxy Provider And Observable Configuration](./ADR-019-edge-proxy-provider-and-observable-configuration.md)
- [ADR-020: Resource Health Observation](./ADR-020-resource-health-observation.md)
- [ADR-021: Docker/OCI Workload Substrate](./ADR-021-docker-oci-workload-substrate.md)

## Current Implementation Notes And Migration Gaps

Current runtime execution is single-server oriented. `DefaultRuntimePlanResolver` produces a
`single-server` target descriptor, and `RoutingExecutionBackend` routes by hardcoded provider keys
for `local-shell` and `generic-ssh` before falling back to the in-memory backend.

Current core target kinds include provisional future values. They should be replaced in a Code
Round before cluster targets become public or persisted by new features.

Current `ExecutionBackend` includes `cancel` and `rollback` methods even though ADR-016 keeps those
public operations out of the v1 surface. Those backend capabilities may remain internal, but target
backend contracts must not imply public cancel or rollback until their own specs are accepted.

Kubernetes and Docker Swarm backends are not active implementation targets yet. This ADR only fixes
the direction and boundary so future specs can add them without changing deployment admission.

## Open Questions

- Which cluster target should be implemented first after the single-server v1 loop is stable:
  Docker Swarm or Kubernetes?
- Should cluster target registration stay under transport-compatible `servers.register`, or should
  a future public alias such as `deployment-targets.register` be added after the operation catalog
  vocabulary is widened?
- Which registry/pull-secret model should cluster backends use before public registry management
  exists?
