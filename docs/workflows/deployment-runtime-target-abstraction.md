# Deployment Runtime Target Abstraction Workflow

## Normative Contract

Runtime target abstraction is an internal deployment workflow capability. It is not a public command
or query.

`deployments.create` remains the business operation that accepts deployment attempts. After
admission, the deployment workflow must resolve the accepted `RuntimePlanSnapshot` and selected
`DeploymentTarget`/`Destination` into a runtime target backend that can render, apply, observe,
verify, diagnose, and clean up the deployment.

The workflow must preserve the separation required by
[ADR-021](../decisions/ADR-021-docker-oci-workload-substrate.md) and
[ADR-023](../decisions/ADR-023-runtime-orchestration-target-boundary.md):

- workload planning produces or references OCI/Docker artifacts;
- runtime target planning adapts that artifact and resource network/access intent to a concrete
  target backend;
- runtime target execution and observation happen through injected application ports and adapter
  packages;
- Web, CLI, HTTP/oRPC, and future MCP tools never submit provider-specific runtime target fields
  to `deployments.create`.

## Global References

This workflow inherits:

- [ADR-014: Deployment Admission Uses Resource Profile](../decisions/ADR-014-deployment-admission-uses-resource-profile.md)
- [ADR-015: Resource Network Profile](../decisions/ADR-015-resource-network-profile.md)
- [ADR-017: Default Access Domain And Proxy Routing](../decisions/ADR-017-default-access-domain-and-proxy-routing.md)
- [ADR-018: Resource Runtime Log Observation](../decisions/ADR-018-resource-runtime-log-observation.md)
- [ADR-019: Edge Proxy Provider And Observable Configuration](../decisions/ADR-019-edge-proxy-provider-and-observable-configuration.md)
- [ADR-020: Resource Health Observation](../decisions/ADR-020-resource-health-observation.md)
- [ADR-021: Docker/OCI Workload Substrate](../decisions/ADR-021-docker-oci-workload-substrate.md)
- [ADR-023: Runtime Orchestration Target Boundary](../decisions/ADR-023-runtime-orchestration-target-boundary.md)
- [deployments.create Command Spec](../commands/deployments.create.md)
- [deployments.create Workflow Spec](./deployments.create.md)
- [deployments.create Error Spec](../errors/deployments.create.md)
- [deployments.create Test Matrix](../testing/deployments.create-test-matrix.md)
- [Runtime Target Abstraction Implementation Plan](../implementation/runtime-target-abstraction-plan.md)

## Workflow Position

```text
deployments.create admission
  -> resolve resource source/runtime/network/access snapshots
  -> plan workload artifact and runtime command specs
  -> select runtime target backend from DeploymentTarget, Destination, provider key, and capabilities
  -> render target-specific execution intent
  -> apply target-specific execution intent
  -> verify runtime health and public access when required
  -> expose logs, health, proxy configuration, and diagnostics through normalized read/query surfaces
  -> cleanup or preserve previous runtime identity according to rollout strategy
  -> deployment-succeeded | deployment-failed
```

## Layer Responsibilities

| Layer | Owns | Must not own |
| --- | --- | --- |
| Workload planning | Source inspection, `RuntimePlanStrategy`, OCI image or Compose artifact intent, typed runtime command specs, resource workload endpoint semantics. | Target provider SDKs, Kubernetes manifests, SSH command execution, Docker daemon calls, Web/CLI/API input. |
| Runtime target planning | Mapping workload artifact, target, destination, environment snapshot, and access routes to target-specific execution intent. | Command admission, aggregate invariants, provider client handles, user-facing input schemas. |
| Runtime target execution | Applying rendered intent, verifying rollout, reading runtime state, collecting sanitized diagnostics, preserving rollback candidates, cleanup. | Business command dispatch, transport-specific errors, reusable resource configuration ownership. |
| Runtime target observation | Normalized runtime logs, resource health, proxy configuration previews, diagnostic summaries. | Returning raw Docker, Swarm, or Kubernetes API objects as business query contracts. |

## Target Backend Selection

Target backend selection must use the selected deployment target, destination, provider key, target
kind, and registered capabilities.

The target architecture is a registry or equivalent dependency-injected router:

```text
RuntimeTargetBackendRegistry
  -> find backend by target kind + provider key + capability set
  -> backend.render(...)
  -> backend.apply(...)
  -> backend.verify(...)
  -> backend.logs(...)
  -> backend.health(...)
  -> backend.cleanup(...)
```

The active v1 implementation routes `local-shell`, `generic-ssh`, and `docker-swarm` through the
runtime target backend registry. New target backends must not expand hardcoded provider switches
inside application use cases or transports.

## Target Backend Capabilities

Backend capabilities are provider/runtime facts, not command fields.

Minimum capability language:

| Capability | Meaning |
| --- | --- |
| `runtime.plan-target` | Can turn a provider-neutral runtime plan into target-specific execution intent. |
| `runtime.apply` | Can apply or start the rendered runtime workload. |
| `runtime.verify` | Can verify internal runtime health and optional public route readiness. |
| `runtime.logs` | Can read bounded or streaming runtime stdout/stderr for `resources.runtime-logs`. |
| `runtime.health` | Can provide runtime state signals for `resources.health`. |
| `runtime.cleanup` | Can clean up previous runtime instances for the same resource without cross-resource deletion. |
| `runtime.capacity` | Can report safe target capacity signals such as disk, inode, memory, CPU, Docker image usage, and build-cache usage. |
| `proxy.route` | Can realize provider-neutral access route intent or delegate to an edge proxy provider. |

Backend-specific capability details may live in adapter/provider descriptors. They must not become
required fields on `deployments.create`.

## Single-Server Docker/Compose Target

The active v1 target backend is single-server Docker/Compose.

It may be reached through local shell or generic SSH. It consumes OCI image or Compose artifact
intent and renders typed runtime command specs to local or SSH shell execution at the adapter
boundary.

It must:

- scope container/project names, labels, networks, cleanup, and diagnostics to resource id,
  deployment id, target id, and destination id;
- avoid public host-port requirements for reverse-proxy resources;
- keep previous same-resource reverse-proxy runtime instances serving until a replacement candidate
  passes required apply, health, route, and public verification gates;
- clean up failed replacement candidates separately from cleanup of superseded successful runtime
  instances;
- treat direct host-port collisions as conflicts or post-acceptance runtime failures without
  stopping another resource;
- classify target disk, inode, memory, CPU, Docker image, or build-cache exhaustion as runtime
  target infrastructure capacity failures when safe signals are available;
- read logs and health through normalized application ports;
- store only sanitized Docker/Compose identity in snapshots, logs, diagnostics, or read models.

## Runtime Target Capacity And Retention

Runtime target capacity is part of the target backend contract. A target backend that builds or
runs Docker/OCI artifacts must be able to diagnose target resource pressure before or during
materialization and rollout when the selected executor can provide safe signals.

External baseline research points to four product rules Appaloft should follow:

- Docker does not automatically remove unused images, stopped containers, unused networks, volumes,
  or build cache; cleanup must be explicit and scoped.
- Self-hosted deployment products commonly pair server/disk monitoring with cleanup guidance or
  automatic cleanup when a configured threshold is exceeded.
- Hosted deployment products expose CPU, memory, disk, network, and deployment-marker metrics so
  operators can correlate resource spikes with releases.
- Metrics export to OpenTelemetry-compatible systems is a useful advanced path, but Appaloft still
  needs a first-party summary for the single-server minimum loop.

The Appaloft target rule is:

- capacity failures detected before safe deployment acceptance may reject admission only when no
  durable attempt can be safely created;
- capacity failures after acceptance must keep the original `deployments.create` response accepted,
  persist failed or retryable state, and publish `deployment-failed`;
- disk, inode, memory, CPU, Docker image, and build-cache exhaustion should use
  `runtime_target_resource_exhausted`;
- capacity details must be sanitized and bounded; raw shell output, secret paths, environment
  values, and credential-bearing command lines must not be stored.

Runtime artifact retention is target-owned and rollout-aware:

| Artifact or state | Retention rule |
| --- | --- |
| Active runtime containers, Compose projects, networks, and routes | Preserve until the owning resource is explicitly replaced, cleaned, archived, or deleted through a governed operation. |
| Explicit rollback candidates | Preserve according to rollback-candidate retention until rollback/redeploy/prune specs say otherwise. |
| Failed replacement candidates | Remove after failure capture when doing so cannot affect the previous successful runtime. |
| Preview runtime artifacts | Prefer short retention; `deployments.cleanup-preview` should remove preview-owned inert artifacts and workspaces when ownership can be proven. |
| Docker build cache | Prunable by age, size, or threshold; cache pruning must not be treated as deployment history deletion. |
| Unused Docker images | Prunable when no container references them and they are outside explicit rollback retention. |
| Docker volumes and stateful persistent data | Never pruned by default. Volume pruning requires a separate explicit operation with dry-run and ownership evidence. |
| Remote `ssh-pglite` / Appaloft state roots | Never runtime-pruned; state retention is governed by control-plane storage and backup specs. |
| Materialized source workspaces | Prunable when no active runtime, diagnostic capture, or rollback candidate depends on them. |

Operator-facing surfaces should expose this without making deployment admission target-specific:

- `servers.capacity.inspect` is the first public read-only target capacity query. For the active
  single-server Docker/Compose backend it returns disk, inode, memory, CPU, Docker image usage,
  build-cache usage, Appaloft runtime-root/state/source-workspace usage, safe reclaimable
  estimates, and warnings. It is diagnostic-only and must not prune, delete, stop, repair, or
  mutate target or Appaloft state.
- `resources.diagnostic-summary` should include capacity context when a deployment or cleanup
  failure links to target capacity;
- `resources.health` may degrade or report unknown when capacity blocks runtime observation;
- future deployment-target/server queries should expose disk, inode, Docker image/cache, source
  workspace, and reclaimable summaries;
- future prune/repair commands must support dry-run, preserve active runtime and rollback
  candidates, exclude Docker volumes by default, and emit audit/diagnostic facts.

## Docker Swarm Target

Docker Swarm is an active runtime target backend, not a separate deployment command.

It is the first cluster runtime target on the path to `1.0.0`.

The governing Swarm contract and implementation status are tracked in
[Docker Swarm Runtime Target](../specs/045-docker-swarm-runtime-target/spec.md) and its
[test matrix](../testing/docker-swarm-runtime-target-test-matrix.md).

A Swarm backend must consume the same workload artifact, environment snapshot, resource network
profile, health policy, and access-route snapshot, then render Swarm stack/service intent inside
the adapter boundary.

Swarm-specific rules:

- target registration and readiness use provider-neutral `DeploymentTarget`/`Destination`
  language, with `orchestrator-cluster` as target kind and `docker-swarm` as provider key;
- `deployments.create` remains ids-only and must reject stack, service, replica, update-policy,
  registry-secret, ingress, manifest, or similar Swarm fields at the command/config boundary;
- destination placement maps to adapter-owned stack/network isolation; sanitized target,
  destination, resource, deployment, and runtime identity may be stored only when needed for
  observation, diagnostics, cleanup, and rollback-candidate support;
- registry credentials, pull secrets, environment secret values, rendered command output, and raw
  Docker provider payloads must be masked before logs, diagnostics, errors, or read models expose
  them;
- rollout must preserve or restore the previous same-resource service until required apply, health,
  route, and public verification gates pass;
- `resources.runtime-logs`, `resources.health`, proxy/diagnostic summaries, and capacity
  diagnostics must return normalized Appaloft shapes rather than Docker service API objects;
- cleanup is scoped by resource, deployment, target, destination, and adapter-owned labels, and it
  must not prune volumes, unrelated services, or Appaloft state roots.

## Kubernetes Target

Kubernetes is a future runtime target backend, not a separate deployment command.

A Kubernetes backend must consume the same workload artifact, environment snapshot, resource
network profile, and access-route snapshot, then render Kubernetes-owned workload/service/routing
intent inside the adapter boundary.

Before implementation, a Spec Round must define:

- cluster target registration, credential, and readiness rules;
- destination placement and namespace-like isolation semantics;
- registry pull secret and environment/secret projection semantics;
- workload rollout strategy, readiness/health checks, logs, diagnostics, cleanup, and rollback
  candidate identity;
- route realization through Ingress, Gateway API, service mesh, or an edge proxy provider;
- how manifest previews, if exposed, are normalized read/query output and not command input.

## Read And Observation Surfaces

Runtime target-specific state must be normalized before it reaches existing read surfaces:

- `deployments.list` and deployment logs may include sanitized target summary fields.
- `resources.runtime-logs` returns normalized line events, not Docker log frames or Kubernetes pod
  objects.
- `resources.health` returns normalized health sections, not runtime provider API objects.
- `resources.proxy-configuration.preview` may display provider-rendered sections, but command
  input remains provider-neutral.
- `resources.diagnostic-summary` may include safe target identifiers and rendered command/manifest
  summaries for support, with secrets redacted.

## Supported Catalog Acceptance Harness

The zero-to-SSH supported catalog harness proves that every Phase 5 supported planner or
container-native artifact path reaches the runtime target boundary through the same provider-neutral
contract. Harness coverage must select target backends by `targetKind`, `providerKey`, and required
capabilities before acceptance, then assert render/apply/verify/log observation expectations
without making Docker, SSH, or provider-specific fields part of `deployments.create`.

Default harness coverage may use fake/local/generic-SSH descriptors and typed command rendering.
Real local Docker and generic-SSH execution remain opt-in smoke layers governed by the test matrix.

## Failure Semantics

Target backend selection failure before safe deployment acceptance is an admission error in phase
`runtime-target-resolution`.

Target rendering/apply/verify/log/cleanup failures after acceptance are deployment workflow
failures. They must:

1. keep the original command response as `ok({ id })`;
2. persist failed or retryable deployment/process state;
3. publish `deployment-failed` after failure state is durable;
4. expose safe target details through read models, logs, or diagnostics;
5. clean up failed candidate runtime instances without deleting a previous successful runtime that
   the rollout strategy has not superseded;
6. require a new deployment attempt or future retry command for retry.

Capacity failures are runtime target infrastructure failures. Disk-full, inode-full, Docker image
store exhaustion, build-cache exhaustion, and target CPU/memory limits must be represented with
`runtime_target_resource_exhausted` when the backend can safely classify them. This code is
retriable after cleanup, prune, or target resize; it is not a domain validation error and it must
not remove the previous successful runtime as an attempted recovery side effect.

Cleanup is rollout-strategy aware. Reverse-proxy and ephemeral-port strategies must distinguish
candidate cleanup from superseded-runtime cleanup; superseded cleanup happens only after terminal
success. Direct-port strategies may release the previous same-resource runtime earlier only when the
exclusive host port makes candidate-first verification impossible.

## Current Implementation Notes And Migration Gaps

Current implementation covers single-server Docker/Compose and Docker Swarm:

- `DefaultRuntimePlanResolver` creates a `single-server` target descriptor.
- `RuntimeTargetBackendRegistry` is an application port, and `packages/adapters/runtime` registers
  local-shell and generic-SSH as `single-server` runtime target backends with runtime capability
  descriptors.
- `packages/adapters/runtime` exposes a `docker-swarm` backend descriptor shape and registry
  selection coverage, and shell composition activates Swarm execution in the default runtime
  registry unless explicitly opted out.
- `RoutingExecutionBackend` selects the execution backend through the registry, with the in-memory
  backend retained as a compatibility fallback for unknown providers.
- Local and SSH Docker/Compose code already lives in `packages/adapters/runtime`.
- Runtime execution uses the registry for single-server and Swarm targets; runtime logs and health
  can read Swarm-backed deployments through the resolved Swarm manager over SSH when target
  metadata is available, while terminal sessions and proxy configuration remain normalized
  read/query surfaces with backend-specific behavior kept behind adapter boundaries.
- Generic SSH execution currently materializes deployment-scoped source workspaces and builds
  deployment-scoped Docker images on the target. Preview cleanup stops selected runtime instances
  and route/link state, but it does not yet prune unused Docker images, BuildKit/build cache, or
  orphaned materialized source workspaces. Long-lived single-server targets can therefore exhaust
  disk or inodes even after preview routes are cleaned.

The current runtime command spec work is aligned with this workflow because it keeps rendered shell
strings at the adapter boundary. The next abstraction step is target-specific render/apply result
types and admission-time backend support checks.

## Open Questions

- What is the first normalized manifest/stack preview query, if operators need to inspect rendered
  Kubernetes or Swarm output before apply?
