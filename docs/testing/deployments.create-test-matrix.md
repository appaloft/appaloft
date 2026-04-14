# deployments.create Spec-Driven Test Matrix

## Normative Contract

Tests for `deployments.create` must follow the command, event, workflow, error, and async lifecycle specs rather than implementation call structure alone.

Deployment-specific canonical assertions:

- command success means request accepted;
- post-acceptance runtime failure persists failed state and keeps the original command `ok({ id })`;
- terminal events are `deployment-succeeded` and `deployment-failed`;
- `build-requested` is emitted when build/package work is required;
- retry creates a new deployment attempt.

## Global References

This test matrix inherits:

- [ADR-001: deployments.create HTTP API Required Fields](../decisions/ADR-001-deploy-api-required-fields.md)
- [ADR-002: Routing, Domain, And TLS Boundary](../decisions/ADR-002-routing-domain-tls-boundary.md)
- [ADR-010: Quick Deploy Workflow Boundary](../decisions/ADR-010-quick-deploy-workflow-boundary.md)
- [ADR-012: Resource Runtime Profile And Deployment Snapshot Boundary](../decisions/ADR-012-resource-runtime-profile-and-deployment-snapshot-boundary.md)
- [ADR-014: Deployment Admission Uses Resource Profile](../decisions/ADR-014-deployment-admission-uses-resource-profile.md)
- [ADR-015: Resource Network Profile](../decisions/ADR-015-resource-network-profile.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)
- [Spec-Driven Testing](./SPEC_DRIVEN_TESTING.md)
- [Quick Deploy Test Matrix](./quick-deploy-test-matrix.md)

This file defines deployment-specific test cases and expected business outcomes.

## Test Layers

| Layer | Deployment-specific focus |
| --- | --- |
| Command schema | Shared input shape and immediate `Result` failures. |
| Command handler | Handler delegates to application use case without transport/persistence logic. |
| Use case admission | Context resolution, redeploy guard, source detection, plan resolution, and request acceptance. |
| Aggregate/state-machine | Deployment state transitions and terminal states. |
| Event/process manager | Formal event emission, payload, ordering, idempotency, retry, and terminal failed state. |
| Entry workflow | Web/CLI/API input collection differences converge on the same command. |
| Contract/e2e | Caller result and read-model status progression. |

## Given / When / Then Template

```md
Given:
- Existing aggregate/read-model state:
- Command input:
- Bootstrap/context behavior:
- Source detector behavior:
- Runtime plan resolver behavior:
- Runtime/process behavior:

When:
- Dispatch `deployments.create`.

Then:
- Command result:
- Persisted deployment state:
- Error code/details, if admission failure:
- Events:
- Async process state:
- Retry/idempotency behavior:
```

## Command Admission Matrix

| Case | Input | Expected result | Expected error | Expected events | Expected state |
| --- | --- | --- | --- | --- | --- |
| Valid explicit context | project/server/destination/environment/resource ids; resource has source/runtime/network profile | `ok({ id })` | None | `deployment-requested`; later async events | Accepted deployment state exists with runtime and network plan snapshots |
| Valid context with default destination seam | project/server/environment/resource ids; resource has source/runtime/network profile; destination omitted | `ok({ id })` when server default destination can be resolved | None | `deployment-requested`; later async events | Accepted deployment state uses resolved destination |
| Resource lacks source binding | Context ids resolve, but resource has no source binding | `err` | `validation_error`, phase `resource-source-resolution` | None for accepted request | No accepted deployment |
| Inbound resource lacks network profile | Context ids resolve, but inbound resource has no internal listener port | `err` | `validation_error`, phase `resource-network-resolution` | None for accepted request | No accepted deployment |
| Resource network profile resolves reverse-proxy target | Resource has `networkProfile.internalPort` and reverse-proxy exposure | `ok({ id })` | None | `deployment-requested`; later async events | Deployment snapshot includes resolved network target without requiring host port |
| Incompatible resource source/strategy pair | Resource source descriptor cannot be planned by the runtime profile strategy | `err` | `validation_error` or `provider_error`, phase `runtime-plan-resolution` | None for accepted request | No accepted deployment |
| Legacy source/runtime/network fields | Input includes `sourceLocator`, `source`, `deploymentMethod`, command override fields, `port`, or `networkProfile` | `err` at command schema/API boundary | `validation_error`, phase `command-validation` | None | No deployment created |
| Unresolved project/environment/server/destination/resource | Context cannot be resolved after bootstrap | `err` | `validation_error` or `not_found`, phase `context-resolution` | None | No deployment created |
| Context mismatch | Environment/resource/destination does not match project/server context | `err` | `validation_error`, phase `context-resolution` | None | No deployment created |
| Active latest deployment | Latest deployment for same resource is non-terminal | `err` | `deployment_not_redeployable`, phase `redeploy-guard` | None for new attempt | No new deployment created |
| Invalid runtime plan | Plan has no executable steps or invalid VO state | `err` | `validation_error` or `invariant_violation` | None for accepted request | No accepted deployment |

## Async Progression Matrix

| Case | Given | Expected command result | Expected events | Expected state |
| --- | --- | --- | --- | --- |
| Build required | Accepted request with buildable source/runtime plan | `ok({ id })` | `deployment-requested -> build-requested -> deployment-started -> terminal event` | Accepted -> build/process state -> running -> terminal |
| Prebuilt image | Accepted request with prebuilt image plan | `ok({ id })` | `deployment-requested -> deployment-started -> terminal event` | Accepted -> running -> terminal |
| Runtime success | Runtime rollout succeeds | `ok({ id })` | `deployment-succeeded` | Terminal `succeeded` |
| Runtime failure, retriable | Runtime rollout fails after acceptance with retriable error | `ok({ id })` | `deployment-failed`; retry scheduling event/job if modeled | Terminal `failed`; retry creates new attempt |
| Runtime failure, permanent | Runtime rollout fails after acceptance with non-retriable error | `ok({ id })` | `deployment-failed` | Terminal `failed`; no retry |
| Worker crash before state persistence | Worker cannot persist outcome | Original accepted command remains `ok({ id })` | No terminal event until recovery | Process state records retryable processing error |

## Event Matrix

| Event | Required assertion |
| --- | --- |
| `deployment-requested` | Emitted once after request acceptance; duplicate consumption does not start duplicate work. |
| `build-requested` | Emitted only when build/package work is required; duplicate consumption does not duplicate accepted artifacts. |
| `deployment-started` | Emitted after build/package is complete or skipped; duplicate consumption does not duplicate rollout. |
| `deployment-succeeded` | Emitted only after terminal success is persisted; mutually exclusive with `deployment-failed`. |
| `deployment-failed` | Emitted only after terminal failure is persisted; retry creates a new deployment attempt. |

## Entry Workflow Matrix

| Entry | Expected test focus |
| --- | --- |
| API create | Strict command schema, structured admission errors, acceptance result. |
| API stream | Technical progress stream does not replace durable events/state. |
| CLI non-interactive | Flags/options build the same command input as API. |
| CLI interactive | Prompts collect input before dispatch; related creation uses separate commands; governed by Quick Deploy workflow. |
| Web QuickDeploy | UI preflight does not change command semantics; final dispatch uses shared command input; governed by Quick Deploy workflow. |

## Deployment Error Assertion Example

```ts
const result = await useCase.execute(context, input);

expect(result.isErr()).toBe(true);

if (result.isErr()) {
  expect(result.error.code).toBe("deployment_not_redeployable");
  expect(result.error.retryable).toBe(false);
  expect(result.error.details?.phase).toBe("redeploy-guard");
  expect(result.error.details?.resourceId).toBe(resourceId);
}
```

## Deployment Async Failure Assertion Example

```md
Given an accepted deployment request.
And runtime rollout fails with a retriable provider error.
When the async deployment worker records the result.
Then the original command remains ok({ id }).
And deployment state is failed.
And deployment-failed is emitted with retriable = true.
And retry scheduling creates a new deployment attempt id.
```

## Current Implementation Notes And Migration Gaps

Current code still executes the backend inside `CreateDeploymentUseCase`, so some existing tests may need transitional expectations until async admission is implemented.

Current event names are still `deployment.started` and `deployment.finished`. Tests can temporarily assert those current events while mapping them to canonical specs:

- `deployment.started` -> `deployment-started`;
- `deployment.finished/status=succeeded` -> `deployment-succeeded`;
- `deployment.finished/status=failed` -> `deployment-failed`.

`deployment-requested` and `build-requested` are canonical events and may not exist in current test fixtures yet.

## Open Questions

- None. Web and CLI Quick Deploy workflow behavior is covered by [Quick Deploy Test Matrix](./quick-deploy-test-matrix.md).
