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

The active v1 implementation may still route `local-shell` and `generic-ssh` through the current
runtime adapter as a migration gap. New target backends must not expand hardcoded provider switches
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
- read logs and health through normalized application ports;
- store only sanitized Docker/Compose identity in snapshots, logs, diagnostics, or read models.

## Docker Swarm Target

Docker Swarm is a future runtime target backend, not a separate deployment command.

It is the first cluster runtime target that must be completed on the path to `1.0.0`.

A Swarm backend must consume the same workload artifact, environment snapshot, resource network
profile, and access-route snapshot, then render Swarm stack/service intent inside the adapter
boundary.

Before implementation, a Spec Round must define:

- target registration and readiness rules for a Swarm manager target;
- destination placement and isolation semantics;
- registry push/pull requirements and secret masking;
- service update strategy, rollback candidate identity, logs, health, and cleanup semantics;
- how edge proxy route realization maps to Swarm services and networks.

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

Cleanup is rollout-strategy aware. Reverse-proxy and ephemeral-port strategies must distinguish
candidate cleanup from superseded-runtime cleanup; superseded cleanup happens only after terminal
success. Direct-port strategies may release the previous same-resource runtime earlier only when the
exclusive host port makes candidate-first verification impossible.

## Current Implementation Notes And Migration Gaps

Current implementation is single-server oriented:

- `DefaultRuntimePlanResolver` creates a `single-server` target descriptor.
- `RuntimeTargetBackendRegistry` is an application port, and `packages/adapters/runtime` registers
  local-shell and generic-SSH as `single-server` runtime target backends with runtime capability
  descriptors.
- `RoutingExecutionBackend` selects the execution backend through the registry, with the in-memory
  backend retained as a compatibility fallback for unknown providers.
- Local and SSH Docker/Compose code already lives in `packages/adapters/runtime`.
- Runtime logs, health, terminal sessions, and proxy configuration are being normalized through
  application ports and read/query services, but only execution/cancel/rollback selection is backed
  by the runtime target backend registry so far.

The current runtime command spec work is aligned with this workflow because it keeps rendered shell
strings at the adapter boundary. The next abstraction step is target-specific render/apply result
types and admission-time backend support checks.

## Open Questions

- What is the first normalized manifest/stack preview query, if operators need to inspect rendered
  Kubernetes or Swarm output before apply?
