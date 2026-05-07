# resources.runtime.restart Command Spec

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
- [deployments.redeploy Command Spec](./deployments.redeploy.md)
- [ADR-028: Command Coordination Scope And Mutation Admission](../decisions/ADR-028-command-coordination-scope-and-mutation-admission.md)

## Intent

`resources.runtime.restart` requests a stop-then-start control action over the current Resource
runtime instance.

Restart is not redeploy. It does not re-plan, rebuild, refresh source/config/secrets, apply profile
changes, or create a Deployment attempt.

## Input

```ts
type RestartResourceRuntimeInput = {
  resourceId: string;
  deploymentId?: string;
  acknowledgeRetainedRuntimeMetadata?: boolean;
  reason?: string;
  idempotencyKey?: string;
};
```

`acknowledgeRetainedRuntimeMetadata` may be required when Resource profile drift could make users
expect restart to pick up changes that it will not apply.

## Admission

The command must:

1. Validate input.
2. Resolve the Resource.
3. Reject archived or deleted Resources.
4. Resolve current or safely restartable runtime placement.
5. Reject missing or unsafe runtime metadata.
6. Reject when profile drift requires acknowledgement and acknowledgement is missing.
7. Persist a runtime-control attempt with stop/start phases before adapter execution.
8. Coordinate through the `resource-runtime` scope.
9. Dispatch provider-neutral restart behavior to the runtime target control port, or dispatch stop
   then start phases through the same port.
10. Record phase-level succeeded, failed, or blocked state with safe diagnostics.

## Result

```ts
type RestartResourceRuntimeResult = {
  runtimeControlAttemptId: string;
  resourceId: string;
  operation: "restart";
  status: "accepted" | "running" | "succeeded" | "failed" | "blocked";
  runtimeState: "restarting" | "running" | "stopped" | "unknown";
  phases: readonly RuntimeControlPhaseSummary[];
};

type RuntimeControlPhaseSummary = {
  phase: "stop" | "start";
  status: "pending" | "running" | "succeeded" | "failed" | "skipped";
  errorCode?: string;
};
```

Command success means the restart attempt state is durable and the immediate adapter outcome, if
completed synchronously, is recorded. Current state is read through `resources.health`.

## Error Contract

Use [Resource Runtime Controls Error Spec](../errors/resource-runtime-controls.md). Minimum codes:

- `resource_runtime_control_blocked`
- `resource_runtime_metadata_missing`
- `resource_runtime_profile_acknowledgement_required`
- `resource_runtime_control_failed`
- `coordination_timeout`
- `validation_error`

## Entrypoints

| Entrypoint | Mapping | Status |
| --- | --- | --- |
| Web | Resource detail runtime controls with restart-vs-redeploy copy. | Future Code Round |
| CLI | `appaloft resource runtime restart <resourceId>`. | Future Code Round |
| oRPC / HTTP | `POST /api/resources/{resourceId}/runtime/restart`. | Future Code Round |
| Automation / MCP | Future command/tool over the same operation key. | Future |
