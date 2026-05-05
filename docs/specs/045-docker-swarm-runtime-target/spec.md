# Docker Swarm Runtime Target

## Status

Spec Round: positioned; Code Round in partial slices.

## Problem

Operators need a supported cluster runtime target before `1.0.0` so the same Appaloft deployment
surface can roll out OCI/Docker workloads beyond a single Docker host. Docker Swarm is the first
cluster target selected by ADR-023, but it must not become a new deployment command or leak Swarm
stack/service fields into `deployments.create`.

## Source Of Truth

- [ADR-021: Docker/OCI Workload Substrate](../../decisions/ADR-021-docker-oci-workload-substrate.md)
- [ADR-023: Runtime Orchestration Target Boundary](../../decisions/ADR-023-runtime-orchestration-target-boundary.md)
- [Async Lifecycle And Acceptance](../../architecture/async-lifecycle-and-acceptance.md)
- [Error Model](../../errors/model.md)
- [Business Operation Map](../../BUSINESS_OPERATION_MAP.md)
- [Deployment Runtime Target Abstraction](../../workflows/deployment-runtime-target-abstraction.md)
- [Runtime Target Abstraction Implementation Plan](../../implementation/runtime-target-abstraction-plan.md)
- [Docker Swarm Runtime Target Test Matrix](../../testing/docker-swarm-runtime-target-test-matrix.md)

## Ubiquitous Language

| Term | Meaning | Context | Compatibility aliases |
| --- | --- | --- | --- |
| Docker Swarm runtime target | A runtime target backend selected by target kind, provider key, and capabilities to apply OCI/Docker workloads to a Swarm manager. | Runtime Topology / Workload Delivery / Release Orchestration | Swarm backend |
| Swarm manager target | A `DeploymentTarget` registered with cluster-capable provider metadata and readiness proving it can accept Swarm stack/service operations. | Runtime Topology | Swarm manager server |
| Stack identity | Adapter-owned Swarm stack/service naming derived from Appaloft resource, deployment, target, and destination context. | Runtime adapter boundary | Compose project name, Swarm stack name |
| Swarm service instance | Adapter-owned runtime identity for a deployed workload service or stack service. | Runtime adapter boundary | Docker service id/name |
| Swarm route attachment | Provider-neutral access route realization mapped to Swarm service/network identity by the runtime and edge proxy adapters. | Runtime target observation | Swarm ingress/overlay routing |

## Target Operation Position

Docker Swarm support is an internal runtime target capability behind existing operations:

| Surface | State | Rule |
| --- | --- | --- |
| `deployments.create` | Active command, unchanged input | Selects a registered Swarm-capable target backend after admission context resolution; no Swarm-specific command fields. |
| `servers.register` | Active command, partial Code Round | Can register `orchestrator-cluster` target metadata with provider key `docker-swarm`; readiness capability checks remain pending. |
| `resources.runtime-logs` | Active query, normalized output | Reads Swarm service logs through target adapters without returning Docker service API objects. |
| `resources.health` | Active query, normalized output | Reads Swarm rollout/service health as Appaloft resource health sections. |
| `servers.capacity.inspect` | Active query, backend-dependent | May report Swarm manager/cluster capacity only when safe signals exist; unsupported signals are explicit, not guessed. |

No new public operation key is accepted in this Spec Round.

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| SWARM-SPEC-001 | Swarm manager readiness | A target is registered as `orchestrator-cluster` with provider key `docker-swarm` | Readiness is checked | Appaloft proves manager connectivity, Docker/Swarm availability, overlay network support, and edge proxy compatibility before accepting deployments to it when safe to detect. |
| SWARM-SPEC-002 | Deployment admission remains ids-only | A user deploys to a Swarm-capable target | `deployments.create` is dispatched | Input remains project/environment/resource/server/destination ids only; namespace, stack, service, replica, update strategy, registry secret, and manifest fields are rejected at schema/config boundary unless future target/profile specs own them. |
| SWARM-SPEC-003 | Destination placement is provider-neutral | A resource deploys to a Swarm target and destination | Runtime target planning runs | The destination maps to adapter-owned stack/network isolation; core/application state records only safe target, destination, resource, deployment, and sanitized runtime identity. |
| SWARM-SPEC-004 | Registry identity is safe | A workload requires an image build or a prebuilt image pull | The Swarm backend plans apply | The image tag/digest and required pull capability are snapshotted safely; registry credentials and pull secrets are referenced by masked secret identity only. |
| SWARM-SPEC-005 | Stack/service rendering is adapter-owned | A runtime plan contains OCI image or Compose artifact intent | The Swarm backend renders target intent | Rendered stack/service/update specs remain adapter-owned diagnostics or execution artifacts and do not become command input or core aggregate state. |
| SWARM-SPEC-006 | Rollout preserves previous runtime | A same-resource successful Swarm service exists | A replacement deployment is accepted | The backend applies a candidate/update strategy that preserves or restores serving traffic until health and route verification pass, and records failure before cleanup when it cannot. |
| SWARM-SPEC-007 | Logs are normalized | A Swarm service emits stdout/stderr | `resources.runtime-logs` is queried | The query returns Appaloft runtime log events with safe service/deployment context, not raw Docker service log frames or secret-bearing command output. |
| SWARM-SPEC-008 | Health is normalized | A Swarm service is starting, healthy, unhealthy, or partially updated | `resources.health` is queried | The query returns provider-neutral health sections, rollout state, and retriable/error phases without exposing Docker API payloads as the contract. |
| SWARM-SPEC-009 | Cleanup is resource-scoped | A deployment fails or is superseded | Swarm cleanup runs | Cleanup targets only stack/service/network/runtime identities owned by the same resource/deployment/destination context and never prunes volumes, unrelated services, or Appaloft state roots. |
| SWARM-SPEC-010 | Route realization maps through Swarm networks | A reverse-proxy resource deploys on Swarm | Access routes are realized | Edge proxy and runtime adapters connect provider-neutral route intent to the selected Swarm service/network without requiring public host-port exposure for the workload. |
| SWARM-SPEC-011 | Unsupported Swarm capability is structured | A target lacks required Swarm capabilities | Deployment admission or runtime progression checks capabilities | Safe pre-acceptance failures use `runtime_target_unsupported` in phase `runtime-target-resolution`; post-acceptance failures persist deployment failure state and keep the original accepted command result. |
| SWARM-SPEC-012 | Public surfaces stay normalized | Web, CLI, HTTP/oRPC, or future MCP surfaces show Swarm-backed state | Users inspect deployment, logs, health, proxy, diagnostics, or capacity | Output uses Appaloft deployment/resource/target language with sanitized Swarm summaries and stable help anchors, not provider-native payloads. |

## Domain Ownership

- Bounded contexts: Runtime Topology, Workload Delivery, Release Orchestration.
- Aggregate/resource owner: `DeploymentTarget` owns target shape/readiness; `Destination` owns
  placement/isolation relationship; `Resource` owns reusable source/runtime/network profile;
  `Deployment` owns the accepted attempt and immutable runtime plan snapshot.
- Adapter owner: `packages/adapters/runtime` owns Swarm render/apply/log/health/cleanup mechanics.
- Upstream/downstream contexts: Configuration supplies environment snapshots and masked secret
  references; edge proxy providers consume access route intent; persistence/read models store safe
  summaries only.

## Public Surfaces

- API/HTTP/oRPC: no new operation key in this Spec Round; existing schemas must reject
  Swarm-specific deployment input.
- CLI: no new command in this Spec Round; future target registration/help must describe Swarm as a
  target backend, not a deployment method.
- Web/UI: no new surface in this Spec Round; future target selection and deployment/resource
  detail views must use normalized target/backend summaries.
- Config: repository config must not carry project/resource/server/destination/credential identity
  or Swarm manifests. Future target/profile configuration must be specified separately before
  exposing replicas/update policy/pull-secret choices.
- Events: existing deployment events remain canonical; Swarm-specific lifecycle detail is runtime
  target diagnostic/read-model data unless a future event spec accepts new event facts.
- Public docs/help: the public server docs now expose the `docker-swarm-runtime-target` anchor for
  deployment target/runtime backend guidance. CLI `server register`, HTTP `POST /servers`, and Web
  server registration provider help point at that anchor for Swarm target readiness and
  unsupported-field recovery guidance.
- Future MCP/tools: generated descriptors remain operation-catalog based and must not add a
  Swarm-specific deployment tool.

## Non-Goals

- Kubernetes implementation or manifest preview.
- Public `deployments.create` fields for stacks, services, replicas, ingress, pull secrets, or
  provider-native update strategy.
- General cluster management, node scheduling, node drain, or Docker volume prune commands.
- Provider-native secret storage implementation beyond masked secret references required for image
  pulls.
- State or data rollback for volumes and stateful services.

## Current Implementation Notes And Migration Gaps

- Swarm target registration can persist provider-neutral `orchestrator-cluster` target kind
  metadata with provider key `docker-swarm`; `servers.test-connectivity` now runs non-mutating
  Swarm manager readiness checks for SSH reachability, Docker availability, active manager state,
  overlay network support, and Swarm edge-proxy compatibility.
- `deployments.create` and repository config parsing reject Swarm-specific deployment fields before
  deployment creation; target/profile configuration fields for Swarm remain deferred until a
  governing Spec Round accepts them.
- The runtime target adapter package exposes a `docker-swarm` backend descriptor shape and registry
  selection coverage; the default runtime registry still does not activate Swarm execution.
- The runtime adapter package now renders adapter-owned Docker Swarm runtime intent for OCI image
  and Compose artifact workloads. Render output derives stack/service identity from Appaloft
  resource, deployment, target, and destination context, maps runtime environment snapshots,
  health policies, and access routes, and masks runtime secret values before they reach diagnostics
  or tests.
- OCI image runtime intent now also renders an adapter-owned apply plan that creates a
  deployment-specific candidate service, keeps workload traffic on Swarm networks without public
  host-port publication, orders verification before route promotion and superseded-service cleanup,
  and keeps secret environment values as safe Docker secret references. The plan is not wired to an
  execution backend yet.
- The runtime adapter package also renders a label-scoped Swarm cleanup plan for services owned by
  the same Appaloft resource, deployment, target, destination, and runtime-target identity. The plan
  is wired only through the explicit fake-runner Swarm backend, not through default real execution.
- An explicit `DockerSwarmExecutionBackend` now exists for fake-runner acceptance coverage. It can
  execute the adapter-owned image apply plan and label-scoped cleanup plan through an injected
  command runner, records sanitized Swarm runtime metadata on successful deployment completion, and
  is not registered in the default runtime backend registry.
- Fake-runner failed verification now records deployment failure metadata and runs the
  deployment-scoped cleanup plan for the failed candidate service without broad prune or volume
  commands.
- `resources.runtime-logs` can read Swarm-backed OCI image deployment logs through `docker service
  logs` using the sanitized `swarm.serviceName` runtime metadata. Output remains the existing
  Appaloft `ResourceRuntimeLogLine` shape with resource/deployment/runtime context and configured
  redactions applied.
- Application deployment admission rejects an `orchestrator-cluster` / `docker-swarm` target before
  acceptance when the runtime backend registry cannot satisfy required capabilities.
- Real Swarm command execution, failed-rollout rollback behavior, logs, health, and read-model
  persistence are not implemented.
- No operation catalog changes are active for Swarm because this is an internal capability behind
  existing operations.
- Public docs/help has a stable `server.docker-swarm-target` topic and
  `/docs/servers/register-connect/#docker-swarm-runtime-target` anchor. CLI/API descriptions and
  the Web server registration provider help link now point to the anchor.
- Resource profile fields for replicas, update policy, or registry secret selection remain
  deferred until a target/profile configuration Spec Round accepts them.

## Open Questions

- Should Swarm-specific rollout policy be entirely adapter defaulted for `1.0.0`, or should a
  provider-neutral resource/target profile expose limited replicas and update order first?
- Which registry push path should buildable sources use when deploying from pure CLI/SSH mode to a
  remote Swarm manager?
- Should Swarm manager capacity diagnostics read only the manager node, aggregate cluster nodes, or
  report both with explicit partial flags?
