# resources.runtime.stop Command Spec

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
- [resources.runtime-logs Query Spec](../queries/resources.runtime-logs.md)
- [ADR-028: Command Coordination Scope And Mutation Admission](../decisions/ADR-028-command-coordination-scope-and-mutation-admission.md)

## Intent

`resources.runtime.stop` requests a stop of the current runtime instance for one Resource placement.

It does not delete the Resource, delete deployments, prune artifacts, detach storage, unbind
dependencies, remove routes, revoke certificates, or clean backup/log/audit data.

## Input

```ts
type StopResourceRuntimeInput = {
  resourceId: string;
  deploymentId?: string;
  reason?: string;
  idempotencyKey?: string;
};
```

`deploymentId` narrows the retained runtime placement when the caller is acting from a specific
deployment detail. The Resource remains the runtime-control owner.

## Admission

The command must:

1. Validate input.
2. Resolve the Resource.
3. Reject archived or deleted Resources.
4. Resolve the current running runtime placement.
5. Reject missing, stopped, stale, or unsafe runtime metadata.
6. Persist a runtime-control attempt before adapter execution.
7. Coordinate through the `resource-runtime` scope.
8. Dispatch a provider-neutral stop request to the runtime target control port.
9. Record terminal succeeded, failed, or blocked state with safe diagnostics.

## Result

```ts
type StopResourceRuntimeResult = {
  runtimeControlAttemptId: string;
  resourceId: string;
  operation: "stop";
  status: "accepted" | "running" | "succeeded" | "failed" | "blocked";
  runtimeState: "stopping" | "stopped" | "running" | "unknown";
};
```

Command success means the stop attempt state is durable and the immediate adapter outcome, if
completed synchronously, is recorded. Current state is read through `resources.health`.

## Error Contract

Use [Resource Runtime Controls Error Spec](../errors/resource-runtime-controls.md). Minimum codes:

- `resource_runtime_control_blocked`
- `resource_runtime_metadata_missing`
- `resource_runtime_already_in_state`
- `resource_runtime_control_failed`
- `coordination_timeout`
- `validation_error`

## Entrypoints

| Entrypoint | Mapping | Status |
| --- | --- | --- |
| Web | Resource detail runtime controls. | Future Code Round |
| CLI | `appaloft resource runtime stop <resourceId>`. | Future Code Round |
| oRPC / HTTP | `POST /api/resources/{resourceId}/runtime/stop`. | Future Code Round |
| Automation / MCP | Future command/tool over the same operation key. | Future |
