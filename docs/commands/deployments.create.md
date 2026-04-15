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
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)

This file defines only the deployment-specific command semantics.

## Purpose

Create a deployment attempt for a source, resource, environment, server, and destination. The command admits the request, prepares durable deployment state, and starts deployment progression.

`deployments.create` is a deployment-attempt command. It is not the durable owner of reusable resource source, runtime, network, health, generated access, routing, domain, or TLS configuration. Deployment-specific snapshots are resolved from resource, environment, server, destination, default access policy, and routing state during admission/planning.

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

## Domain Language Boundary

The command must preserve these terms:

| Term | Owner | Meaning |
| --- | --- | --- |
| Resource profile | `Resource` lifecycle commands | Durable deployable unit identity and ownership. |
| Resource source binding | `Resource` lifecycle commands | Durable reusable source configuration. |
| Resource runtime profile | `Resource` lifecycle commands | Durable reusable build, start, and health defaults. |
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
5. Reject deployment when the latest deployment for the same resource is non-terminal.
6. Resolve the source descriptor from `ResourceSourceBinding`.
7. Resolve runtime plan configuration from `ResourceRuntimeProfile`.
8. Resolve network endpoint configuration from `ResourceNetworkProfile`.
9. Create an immutable environment snapshot.
10. Resolve default generated and durable access route snapshots from resource/domain/server/policy state when the resource requires public reverse-proxy access.
11. Resolve the runtime plan and network/access snapshots.
12. Create durable deployment state.
13. Publish or record `deployment-requested`.
14. Return `ok({ id })`.

Build, rollout, verify, failure recording, and retry progression belong to the async workflow owner, process manager, event handler, worker, or runtime adapter boundary. They must not be hidden inside Web/CLI/API entry logic.

## Deployment-Specific Async Progression

Required deployment event chain:

```text
deployments.create
  -> deployment-requested
  -> build-requested, when build/package work is required
  -> deployment-started
  -> deployment-succeeded | deployment-failed
```

Prebuilt image deployments skip `build-requested` unless artifact verification is modeled as a separate event.

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
| `deployment_not_redeployable` | `redeploy-guard` | No | Latest deployment for the same resource is non-terminal. |
| `conflict` | `admission-conflict` | No | A deployment-specific admission conflict not covered by redeployability. |
| `invariant_violation` | `planning-transition`, `execution-start-transition`, `finalization` | No | Deployment state transition was attempted out of order. |
| `infra_error` | `deployment-creation`, `event-publication` | Conditional | Persistence or infrastructure failure before the request can be safely accepted. |
| `provider_error` | `runtime-plan-resolution` | Conditional | Provider/runtime boundary rejects the plan before acceptance. |
| `default_access_route_unavailable` | `default-access-policy-resolution`, `default-access-domain-generation`, `proxy-readiness` | Conditional | A required generated access route cannot be resolved before acceptance. |
| `proxy_route_realization_failed` | `proxy-route-realization`, `public-route-verification` | Yes | Runtime adapter failed to materialize or verify the resolved route after acceptance; represented as workflow failure. |

Missing or explicitly disabled edge proxy intent makes generated default access unavailable rather than required. The command may continue without a generated route, and it must not publish a direct host-port fallback.

Runtime/build/deploy/verify failures after acceptance are workflow failures and must be represented by deployment state plus `deployment-failed`.

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
- resource listener port is stored as `networkProfile.internalPort`; deployment admission does not read `runtimeProfile.port`.
- generated default access routing is governed by ADR-017, but the current runtime adapter path still contains adapter-facing requested deployment route fields that must be replaced by provider-neutral route resolution.

## Open Questions

- Dedicated update operation names for resource source binding, runtime profile, network profile, and access profile configuration remain future work under [ADR-012](../decisions/ADR-012-resource-runtime-profile-and-deployment-snapshot-boundary.md) and [ADR-015](../decisions/ADR-015-resource-network-profile.md).
