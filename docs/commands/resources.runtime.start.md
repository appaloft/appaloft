# resources.runtime.start Command Spec

## Status

Accepted candidate. Do not expose this command until runtime-control attempt persistence, readback,
error contracts, public docs/help, `CORE_OPERATIONS.md`, `operation-catalog.ts`, CLI, HTTP/oRPC,
Web, and tests are aligned in Code Round.

## Governing Sources

- [ADR-038: Resource Runtime Control Ownership](../decisions/ADR-038-resource-runtime-control-ownership.md)
- [Resource Runtime Controls](../specs/043-resource-runtime-controls/spec.md)
- [Resource Runtime Controls Error Spec](../errors/resource-runtime-controls.md)
- [Resource Runtime Controls Test Matrix](../testing/resource-runtime-controls-test-matrix.md)
- [resources.health Query Spec](../queries/resources.health.md)
- [deployments.recovery-readiness Query Spec](../queries/deployments.recovery-readiness.md)
- [ADR-028: Command Coordination Scope And Mutation Admission](../decisions/ADR-028-command-coordination-scope-and-mutation-admission.md)

## Intent

`resources.runtime.start` requests a start of the last stopped Resource runtime instance from
retained safe runtime metadata.

It does not create a Deployment attempt, re-run detect/plan, rebuild or pull artifacts, refresh
source/config/secrets, apply Resource profile changes, or select new rollback candidates.

## Input

```ts
type StartResourceRuntimeInput = {
  resourceId: string;
  deploymentId?: string;
  acknowledgeRetainedRuntimeMetadata?: boolean;
  reason?: string;
  idempotencyKey?: string;
};
```

`acknowledgeRetainedRuntimeMetadata` may be required by interactive surfaces when the latest
Resource profile differs from the retained runtime metadata that will be started.

## Admission

The command must:

1. Validate input.
2. Resolve the Resource.
3. Reject archived or deleted Resources.
4. Resolve retained runtime placement from the same Resource and selected deployment context.
5. Reject missing, stale, unsafe, or already-running runtime metadata.
6. Reject when profile drift requires acknowledgement and acknowledgement is missing.
7. Persist a runtime-control attempt before adapter execution.
8. Coordinate through the `resource-runtime` scope.
9. Dispatch a provider-neutral start request to the runtime target control port.
10. Record terminal succeeded, failed, or blocked state with safe diagnostics.

## Result

```ts
type StartResourceRuntimeResult = {
  runtimeControlAttemptId: string;
  resourceId: string;
  operation: "start";
  status: "accepted" | "running" | "succeeded" | "failed" | "blocked";
  runtimeState: "starting" | "running" | "stopped" | "unknown";
};
```

Command success means the start attempt state is durable and the immediate adapter outcome, if
completed synchronously, is recorded. Current state is read through `resources.health`.

## Error Contract

Use [Resource Runtime Controls Error Spec](../errors/resource-runtime-controls.md). Minimum codes:

- `resource_runtime_control_blocked`
- `resource_runtime_metadata_missing`
- `resource_runtime_profile_acknowledgement_required`
- `resource_runtime_already_in_state`
- `resource_runtime_control_failed`
- `coordination_timeout`
- `validation_error`

## Entrypoints

| Entrypoint | Mapping | Status |
| --- | --- | --- |
| Web | Resource detail runtime controls. | Future Code Round |
| CLI | `appaloft resource runtime start <resourceId>`. | Future Code Round |
| oRPC / HTTP | `POST /api/resources/{resourceId}/runtime/start`. | Future Code Round |
| Automation / MCP | Future command/tool over the same operation key. | Future |
