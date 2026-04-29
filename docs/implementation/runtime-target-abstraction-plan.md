# Runtime Target Abstraction Implementation Plan

## Source Of Truth

This document plans the code-level abstraction for runtime target backends. It does not replace
ADRs, command specs, workflow specs, error specs, or test matrices.

The governing decision is
[ADR-023: Runtime Orchestration Target Boundary](../decisions/ADR-023-runtime-orchestration-target-boundary.md).
The Docker/OCI workload artifact rule remains governed by
[ADR-021: Docker/OCI Workload Substrate](../decisions/ADR-021-docker-oci-workload-substrate.md).

## Governed Specs

- [Business Operation Map](../BUSINESS_OPERATION_MAP.md)
- [Core Operations](../CORE_OPERATIONS.md)
- [Domain Model](../DOMAIN_MODEL.md)
- [deployments.create Command Spec](../commands/deployments.create.md)
- [deployments.create Workflow Spec](../workflows/deployments.create.md)
- [deployments.create Error Spec](../errors/deployments.create.md)
- [deployments.create Test Matrix](../testing/deployments.create-test-matrix.md)
- [Deployment Runtime Target Abstraction Workflow](../workflows/deployment-runtime-target-abstraction.md)

## Implementation Goal

Make runtime execution target-pluggable without changing deployment admission.

The target shape is:

```text
ResourceSourceBinding + ResourceRuntimeProfile + ResourceNetworkProfile
  -> workload artifact plan
  -> RuntimePlanSnapshot
  -> runtime target backend selection
  -> target-specific render/apply/verify/log/health/cleanup
  -> normalized deployment/resource read models
```

Single-server Docker/Compose remains the first active backend. Docker Swarm is the first required
cluster backend on the path to `1.0.0`, and Kubernetes remains a later backend implementation.
Both must plug into the same target abstraction after their own Spec Rounds.

## Expected Code Shape

### Core

Core should keep provider-neutral value objects and snapshots:

- `RuntimeArtifactSnapshot`: image or Compose artifact identity.
- `RuntimeExecutionPlan`: provider-neutral workload execution intent.
- `DeploymentTargetDescriptor`: target kind, provider key, target ids, and safe placement metadata.
- `RuntimePlanSnapshot`: immutable artifact, execution, target, network, access, and verification
  intent for one deployment attempt.

Core must not import Docker SDK, Kubernetes client, Helm, SSH, process, filesystem, or provider SDK
types.

Future Code Rounds should replace provisional target-kind values with the canonical ADR-023 model:

- `single-server`
- `orchestrator-cluster`

Concrete orchestrators such as `docker-swarm` and `kubernetes` should be provider keys or backend
descriptors/capabilities, not target-kind values unless a later ADR changes that boundary.

### Application

Application ports should move toward these responsibilities:

- `RuntimePlanResolver`: resolves provider-neutral workload artifact and target descriptor for an
  accepted deployment attempt.
- `RuntimeTargetBackendRegistry`: selects a backend by target kind, provider key, and required
  capabilities.
- `RuntimeTargetBackend`: renders, applies, verifies, observes, and cleans up target-specific
  runtime intent.
- `ResourceRuntimeLogReader`: reads normalized runtime log events through the selected target
  backend or a backend-specific reader.
- `ResourceHealthSignalReader` or equivalent query service dependency: reads normalized runtime
  health signals through the selected target backend.

Handlers and use cases must not call Docker, SSH, Kubernetes, Helm, or shell APIs directly. They
must depend on injected ports and tokens registered in the shell composition root.

Suggested interface shape for a Code Round:

```ts
type RuntimeTargetCapability =
  | "runtime.plan-target"
  | "runtime.apply"
  | "runtime.verify"
  | "runtime.logs"
  | "runtime.health"
  | "runtime.cleanup"
  | "runtime.capacity"
  | "proxy.route";

interface RuntimeTargetBackend {
  descriptor: {
    providerKey: string;
    targetKinds: string[];
    capabilities: RuntimeTargetCapability[];
  };
  render(input: RuntimeTargetRenderInput): Promise<Result<RuntimeTargetRenderedPlan>>;
  apply(input: RuntimeTargetApplyInput): Promise<Result<RuntimeTargetApplyResult>>;
  verify(input: RuntimeTargetVerifyInput): Promise<Result<RuntimeTargetVerifyResult>>;
  cleanup(input: RuntimeTargetCleanupInput): Promise<Result<RuntimeTargetCleanupResult>>;
  capacity?(input: RuntimeTargetCapacityInput): Promise<Result<RuntimeTargetCapacityResult>>;
}
```

The exact names may change in Code Round, but the dependency direction must not.

### Runtime Adapter

`packages/adapters/runtime` should become the home for target backends that are runtime-adapter
concerns:

- single-server Docker local backend;
- single-server Docker generic-SSH backend;
- in-memory fake backend for tests and local demos;
- future Docker Swarm backend after a Swarm Spec Round;
- future Kubernetes backend only if the implementation is adapter-local and does not leak
  Kubernetes client types into core/application.

The current `RoutingExecutionBackend` hardcoded provider-key switch is a migration point. It should
be replaced with a registry that is registered in `apps/shell`.

### Shell Composition

`apps/shell` owns dependency wiring:

- register runtime target backend implementations;
- register the backend registry under explicit application tokens;
- register default provider descriptors/capability descriptors;
- select local, SSH, fake, Swarm, or Kubernetes backends by configuration without changing command
  schemas.

Shell factories may choose implementations, but use cases must receive dependencies through
constructor injection and tokens.

### Persistence And Read Models

Persistence may store sanitized target execution identity when it is required for observation,
diagnostics, cleanup, or future rollback. Examples:

- target kind and provider key;
- image name/tag/digest or Compose artifact identity;
- sanitized runtime instance identifiers;
- rendered plan fingerprint or manifest/stack preview identifier;
- previous runtime identity for rollback candidates.

Persistence must not require raw Kubernetes manifests, kubeconfig content, Docker daemon responses,
SSH output, provider SDK response bodies, or secret values as aggregate state.

Read models may project provider-rendered summaries, but public query contracts must stay
normalized.

## Backend-Specific Follow-Up Specs

### Docker Swarm Backend

Before Code Round:

- define target registration/readiness for a Swarm manager;
- define destination placement and stack identity;
- define registry push/pull and secret handling;
- define service update, health, logs, diagnostics, cleanup, and rollback-candidate identity;
- update deployment and resource health/log/proxy specs.

This backend is required before `1.0.0`; the abstraction is not roadmap-complete until these Swarm
contracts and the corresponding implementation/tests exist.

### Kubernetes Backend

Before Code Round:

- define cluster target registration, credential, readiness, and provider capability model;
- define destination placement and namespace-like isolation;
- define image pull secret and environment/secret projection rules;
- define workload, service, route, rollout, readiness, health, logs, diagnostics, cleanup, and
  rollback-candidate semantics;
- decide whether rendered manifest preview is part of `resources.proxy-configuration.preview`, a
  deployment diagnostic field, or a future read query.

Kubernetes support must not be implemented by adding Kubernetes-specific fields to
`deployments.create` or by importing Kubernetes client types into core/application.

## Required Tests

Runtime target abstraction Code Rounds should add tests for:

- single-server backend selection for `local-shell` and `generic-ssh`;
- unsupported target/provider combination returns `provider_error` or `validation_error` in phase
  `runtime-target-resolution` before acceptance when safe to detect;
- accepted deployment failure from target apply/verify keeps command result accepted and records
  `deployment-failed`;
- reverse-proxy replacement starts a candidate without deleting the previous same-resource runtime
  and cleans up only the failed candidate when health, route, or public verification fails;
- runtime logs and health queries return normalized shapes regardless of target backend;
- target backend registry does not require Web/CLI/API transport-specific input;
- Docker/Compose cleanup remains resource-scoped after the registry is introduced;
- target capacity diagnostics classify disk, inode, memory, CPU, Docker image, and build-cache
  exhaustion as `runtime_target_resource_exhausted` when safe signals are available;
- prune dry-runs preserve active runtime, rollback candidates, Docker volumes, and remote Appaloft
  state while reporting reclaimable source workspaces, stopped containers, unused images, and build
  cache;
- future fake Swarm/Kubernetes test backends can prove pluggability without real clusters.

Backend-specific Code Rounds must add contract tests for their own render/apply/verify/log/cleanup
semantics.

## Minimal Deliverable

The smallest coherent Code Round for this plan is:

1. Add application port types for runtime target backend descriptor, registry, selection, and
   normalized render/apply/verify results.
2. Wrap current local, generic-SSH, and in-memory execution backends as registered target backends.
3. Replace hardcoded provider-key routing with registry lookup in runtime execution.
4. Add tests proving current single-server behavior still works through the registry.
5. Update migration notes in deployment specs after implementation.

This minimal deliverable does not implement Docker Swarm or Kubernetes. It creates the boundary
that makes those backends addable later without changing deployment admission, but it is not
sufficient for `1.0.0` because Docker Swarm support is still required afterward.

## Current Implementation Notes And Migration Gaps

Current code has the initial target backend shape, but it is still running through the
`ExecutionBackend` compatibility port:

- `RuntimePlanResolver` exists and currently emits `single-server` target descriptors.
- `ExecutionBackend` exists and owns `execute`, `cancel`, and `rollback`, even though cancel and
  rollback are not public deployment operations under ADR-016.
- `RuntimeTargetBackendRegistry` exists as an application port.
- `packages/adapters/runtime` wraps `LocalExecutionBackend` and `SshExecutionBackend` as
  descriptor-bearing `single-server` target backends for `local-shell` and `generic-ssh`.
- `RoutingExecutionBackend` selects the active execution backend through target kind/provider key
  and required capability lookup, with the in-memory backend retained as a compatibility fallback.
- `ResourceRuntimeLogReader`, resource health, diagnostic summary, and proxy configuration previews
  are being normalized as read/query surfaces, but target backend capabilities are not yet their
  shared selection mechanism.
- Runtime target capacity diagnostics and prune contracts are not first-class yet. Current
  single-server Docker/SSH behavior can leave unused images, BuildKit/build cache, and materialized
  source workspaces behind after preview cleanup or failed rollout. The first capacity slice exposes
  `servers.capacity.inspect` as a read-only query for local-shell and generic-SSH targets; prune,
  cleanup automation, and volume/state deletion remain out of scope for that slice.

The current state is acceptable for the single-server v1 loop. It is not yet ready to add
Kubernetes because deployment admission still needs to use the registry for pre-acceptance support
checks, and target-specific render/apply result contracts are still missing.

## Open Questions

- Should `ExecutionBackend` be replaced by a narrower target execution port after the compatibility
  registry is stable?
- Should a target backend expose separate log/health interfaces or one capability-rich descriptor
  with optional methods?
- What is the first target descriptor persistence shape that supports both current Docker and a
  future Kubernetes backend without storing provider-owned manifests as aggregate state?
