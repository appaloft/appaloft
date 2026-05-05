# ADR-038: Resource Runtime Control Ownership

## Status

Accepted

## Context

Phase 7 calls for resource restart, stop, and start only after runtime ownership and state semantics
are specified. Appaloft already separates:

- Resource profile changes, which affect future deployment admission;
- Deployment attempts, which execute `detect -> plan -> execute -> verify -> rollback`;
- Resource health and runtime logs, which observe current runtime state;
- runtime target backends, which apply Docker/Compose today and future Swarm/Kubernetes later.

Without a decision record, restart/stop/start could become hidden Docker actions, mutate deployment
history, bypass `resource-runtime` coordination, or imply lifecycle ownership that belongs to
deployments and runtime target backends.

## Decision

Resource runtime controls are Resource-scoped operational commands over the currently selected
runtime instance. They are not deployment admission commands and not Resource lifecycle commands.

The accepted candidate operation keys are:

| Operation | Meaning |
| --- | --- |
| `resources.runtime.stop` | Request the runtime target backend to stop the currently running Resource runtime instance. |
| `resources.runtime.start` | Request the runtime target backend to start the last stopped Resource runtime instance when its retained runtime metadata is still usable. |
| `resources.runtime.restart` | Request a stop-then-start control action over the current runtime instance without creating a new deployment attempt. |

These commands are accepted candidates only. They must not be added to `CORE_OPERATIONS.md`,
`operation-catalog.ts`, CLI, HTTP/oRPC, Web, or MCP/tool descriptors until command/query/error/test
specs and public docs are aligned in Code Round.

## Ownership Boundary

Runtime controls belong to application orchestration and runtime target adapter ports:

| Concern | Owner |
| --- | --- |
| Admission and policy | Application use case over Resource, latest deployment/runtime observation, and coordination ports. |
| Runtime instance identity | Deployment/runtime read model derived from latest successful or currently active deployment state. |
| Stop/start/restart execution | Runtime target backend adapter behind a normalized control port. |
| Current health/log visibility | Existing `resources.health` and `resources.runtime-logs` queries. |
| Deployment history | Existing Deployment attempts and event/read models; runtime controls do not rewrite them. |

The Resource aggregate owns durable profile and lifecycle state. It does not directly execute
runtime stop/start/restart and must not depend on Docker, Compose, SSH, Swarm, Kubernetes, process
handles, or provider SDK types.

## State Semantics

Runtime controls create a durable runtime-control attempt or equivalent read-model/process record
before adapter execution. The first Code Round may execute synchronously after that record is
persisted, but user-visible state must survive process failure.

Minimum control states:

- `accepted`
- `running`
- `succeeded`
- `failed`
- `blocked`

Minimum Resource runtime observation states:

- `running`
- `stopped`
- `stopping`
- `starting`
- `restarting`
- `unknown`

`resources.runtime.stop` success means the stop request reached a terminal accepted result from the
runtime backend and the read model records the outcome. It does not delete the Resource, delete
deployment history, delete artifacts, detach storage, unbind dependencies, remove routes, revoke
certificates, or clean backup data.

`resources.runtime.start` starts only from retained runtime metadata for the same Resource,
deployment target, destination, artifact, environment snapshot, storage/dependency snapshot
references, and runtime target descriptor. If that metadata is missing or unsafe, the command is
blocked and the user should create a new deployment or use recovery readiness.

`resources.runtime.restart` is a runtime control, not redeploy. It must not re-run detect/plan,
rebuild an image, refresh source, resolve environment variables again, or select a new rollback
candidate.

## Coordination

Runtime controls use the existing `resource-runtime` operation coordination scope.

They must serialize with `deployments.create`, `deployments.retry`, `deployments.redeploy`,
`deployments.rollback`, source auto-deploy dispatch, and other runtime mutations for the same
Resource/target placement. A runtime control must not interrupt an in-flight deployment attempt
unless a future ADR explicitly defines cancellation or preemption.

## Provider Boundary

Adapters may implement stop/start/restart through Docker, Docker Compose, SSH commands, Swarm, or a
future runtime API, but transport, application, and core contracts expose only provider-neutral
runtime-control status and safe diagnostics.

Provider-native ids, container names, stack names, pod names, command output, manifest fragments,
and SDK response bodies must not become required public input fields. Read models may expose safe
support identifiers only when they are sanitized and clearly adapter-originated.

## Public Surface Semantics

Every public surface must explain:

- stop/start/restart affect current runtime process state, not Resource profile or deployment
  snapshots;
- start may be blocked when retained runtime metadata is missing or stale;
- restart is not redeploy and will not pick up source, config, secret, storage, dependency, or
  runtime profile changes;
- users should redeploy when they want new profile/config/source changes to take effect.

## Consequences

- Runtime controls can proceed as a Spec/Test-First/Code Round without changing deployment
  admission.
- Existing deployment recovery remains the surface for retry, redeploy, and rollback.
- Phase 8 durable job/outbox work may later replace the first synchronous process-state baseline,
  but Phase 7 must still persist visible runtime-control attempt state before adapter execution.
- Docker Swarm and future cluster targets must implement the same normalized runtime-control
  contract if they expose these operations.

## Required Spec Updates

This decision governs:

- [Business Operation Map](../BUSINESS_OPERATION_MAP.md)
- [Resource Runtime Controls](../specs/043-resource-runtime-controls/spec.md)
- [Resource Runtime Controls Test Matrix](../testing/resource-runtime-controls-test-matrix.md)
- [Resource Runtime Controls Implementation Plan](../implementation/resource-runtime-controls-plan.md)
- future `resources.runtime.stop`, `resources.runtime.start`, and `resources.runtime.restart`
  command specs.
