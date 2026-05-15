# runtime-monitoring.thresholds.configure Command Spec

## Metadata

- Operation key: `runtime-monitoring.thresholds.configure`
- Command class: `ConfigureRuntimeMonitoringThresholdsCommand`
- Input schema: `ConfigureRuntimeMonitoringThresholdsCommandInput`
- Handler: `ConfigureRuntimeMonitoringThresholdsCommandHandler`
- Use case: `ConfigureRuntimeMonitoringThresholdsUseCase`
- Domain / bounded context: DeploymentTarget runtime observation / runtime monitoring threshold
  policy
- Current status: application, PG/PGlite, CLI, HTTP/oRPC, server/resource Web Monitor exact-scope
  CPU/memory/disk threshold configuration, SDK metadata, generated MCP/tool descriptor/handler
  dispatch, and sample-evidence-based read inheritance implemented

## Normative Contract

`runtime-monitoring.thresholds.configure` creates or replaces one non-enforcing threshold policy
for a runtime monitoring scope. Command success means Appaloft has persisted safe policy metadata
only. It must not inspect runtime targets, collect samples, run prune, stop, restart, redeploy,
reject deployments, resize, scale, throttle, bill, send alerts, or mutate runtime state.

Threshold policies exist only to produce warning/critical readback and operator next actions in
`runtime-monitoring.thresholds.show`.

## Input Model

```ts
type ConfigureRuntimeMonitoringThresholdsCommandInput = {
  policyId?: string;
  scope: RuntimeMonitoringScope;
  rules: RuntimeMonitoringThresholdRuleInput[];
  enabled?: boolean;
  idempotencyKey?: string;
};

type RuntimeMonitoringThresholdRuleInput = {
  ruleId?: string;
  signal: "cpu" | "memory" | "disk" | "inode" | "docker" | "network";
  metric:
    | "containerCpuPercent"
    | "loadAverage1m"
    | "containerUsedBytes"
    | "usedBytes"
    | "attributedBytes"
    | "used"
    | "imageBytes"
    | "buildCacheBytes"
    | "containerWritableBytes"
    | "rxBytes"
    | "txBytes";
  warning?: number;
  critical?: number;
  comparator?: "greater-than-or-equal";
};
```

| Field | Requirement | Meaning |
| --- | --- | --- |
| `policyId` | Optional | Existing policy id to replace; omitted ids are generated. |
| `scope` | Required | Server, project, environment, resource, or deployment monitoring scope. |
| `rules` | Required | One or more non-enforcing warning/critical threshold rules. |
| `rules[].warning` / `rules[].critical` | At least one required per rule | Numeric crossing boundary. `critical` must be greater than or equal to `warning` when both exist. |
| `rules[].comparator` | Optional | First slice supports only `greater-than-or-equal`. |
| `enabled` | Optional | Defaults to true. Disabled policies are retained but not evaluated as crossed. |
| `idempotencyKey` | Optional | Safe command idempotency key. |

## Rules

1. The command stores policy metadata only. It never evaluates samples during admission.
2. Threshold configuration is additive observation policy, not runtime governance.
3. Writes remain exact-scope: configuring a scope creates or replaces the policy for that exact
   server, project, environment, resource, or deployment scope.
4. Rule metrics must match the selected signal family. For example, `containerCpuPercent` belongs
   to `cpu`, and `buildCacheBytes` belongs to `docker`.
5. Threshold values are numeric observation boundaries, not quotas, reservations, billing limits,
   sizing hints, or cleanup triggers.
6. Policy readback and latest state come from `runtime-monitoring.thresholds.show`.

## Safety

The command input and persisted policy must not contain shell commands, host paths, provider ids,
container ids, raw metric payloads, log lines, token values, credentials, private keys, registry
secrets, billing dimensions, cleanup categories, or deployment mutation fields.

## Entrypoints

| Surface | Contract |
| --- | --- |
| CLI | `appaloft runtime-monitoring thresholds configure <scope> --rule <json>` dispatches this command through `CommandBus`. |
| HTTP/oRPC | `POST /api/runtime-monitoring/thresholds` reuses this input schema. |
| Web | Server/resource Monitor can configure exact-scope CPU `containerCpuPercent`, memory `usedBytes`, and disk `usedBytes` warning/critical policies after showing non-enforcement copy. If the current readback is inherited from a parent scope, saving creates an exact-scope override instead of mutating the parent policy. |
| SDK / MCP | SDK metadata and generated MCP/tool descriptors come from the operation catalog and this shared command schema. |

## Tests

The governing matrix is
[Runtime Monitoring Observation Test Matrix](../testing/runtime-monitoring-observation-test-matrix.md).

Code Round coverage for `RT-MON-006` proves:

- configuring a policy persists only safe policy fields;
- validation rejects unknown metrics, mismatched signal/metric pairs, empty rule lists, and
  `critical < warning`;
- CLI and HTTP/oRPC entrypoints dispatch through the shared command schema;
- success does not call runtime adapters, prune commands, deployment commands, scheduled workers,
  alert delivery, billing, sizing, or runtime mutation ports;
- exact-scope replacement does not create duplicate active policies for the same scope.
- inherited readback is not saved back with the parent `policyId` when Web creates an exact-scope
  override.
