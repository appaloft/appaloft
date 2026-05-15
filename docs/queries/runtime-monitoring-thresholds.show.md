# runtime-monitoring.thresholds.show Query Spec

## Metadata

- Operation key: `runtime-monitoring.thresholds.show`
- Query class: `ShowRuntimeMonitoringThresholdsQuery`
- Input schema: `ShowRuntimeMonitoringThresholdsQueryInput`
- Handler: `ShowRuntimeMonitoringThresholdsQueryHandler`
- Query service: `ShowRuntimeMonitoringThresholdsQueryService`
- Domain / bounded context: DeploymentTarget runtime observation / runtime monitoring threshold
  read model
- Current status: application, PG/PGlite, CLI, HTTP/oRPC, server/resource Web Monitor readback,
  sample-evidence-based policy inheritance, SDK metadata, and generated MCP/tool
  descriptor/handler dispatch implemented

## Normative Contract

`runtime-monitoring.thresholds.show` reads one safe non-enforcing threshold policy and the latest
warning/critical evaluation state for a runtime monitoring scope. It reads retained monitoring
samples or rollups only. It must not collect fresh samples, connect to runtime targets, run Docker,
run prune, stop, restart, redeploy, reject deployments, resize, scale, throttle, bill, send alerts,
or mutate runtime state.

Missing policies return `policy: null` and `state: "unknown"` with safe next actions. Missing or
stale retained samples return `policy` plus `state: "unknown"` or `state: "stale"` rather than
pretending usage is zero.

## Input Model

```ts
type ShowRuntimeMonitoringThresholdsQueryInput = {
  scope: RuntimeMonitoringScope;
  policyId?: string;
  window?: {
    from: string;
    to: string;
  };
};
```

| Field | Requirement | Meaning |
| --- | --- | --- |
| `scope` | Required | Server, project, environment, resource, or deployment monitoring scope. |
| `policyId` | Optional | Read a specific threshold policy. Omitted reads the exact-scope policy for the supplied scope, then the nearest parent policy derivable from retained sample scope evidence. |
| `window.from` / `window.to` | Optional | Optional bounded evaluation window. Defaults to the latest retained sample window chosen by the query service. |

Policy inheritance is read-only and sample-evidence based. Exact-scope policies always win. If no
exact policy exists, the query may use the latest retained sample's scope evidence to try
`deployment -> resource -> environment -> project -> server` or the applicable suffix for the
requested scope. If no retained sample carries parent evidence, no parent is inferred and the query
returns `policy: null`.

## Output Model

```ts
type ShowRuntimeMonitoringThresholdsResult = Result<
  RuntimeMonitoringThresholdsReadback,
  DomainError
>;

type RuntimeMonitoringThresholdsReadback = {
  schemaVersion: "runtime-monitoring-thresholds.show/v1";
  scope: RuntimeMonitoringScope;
  generatedAt: string;
  policy: RuntimeMonitoringThresholdPolicySummary | null;
  evaluation: RuntimeMonitoringThresholdEvaluation;
};

type RuntimeMonitoringThresholdEvaluation = {
  state: "ok" | "warning" | "critical" | "stale" | "unknown";
  evaluatedAt?: string;
  sourceSampleId?: string;
  crossed: RuntimeMonitoringThresholdCrossing[];
  nextActions: Array<
    | "inspect-runtime-usage"
    | "open-runtime-monitoring"
    | "inspect-capacity"
    | "review-runtime-logs"
    | "review-deployment-events"
    | "configure-thresholds"
  >;
};
```

Crossings include rule id, signal, metric, observed value, configured warning/critical boundary,
and severity. They must not include raw provider payloads or log text.

## Evaluation Rules

1. Evaluation uses retained monitoring samples or rollups; it never performs live inspection.
2. Disabled policies read back as disabled and do not produce warning/critical crossings.
3. Exact-scope policy readback takes precedence over inherited parent policies. Disabled
   exact-scope policies intentionally suppress inherited fallback.
4. Inherited policies are evaluated against the requested scope's latest retained sample. The
   returned `policy.scope` identifies the inherited policy owner, while the response `scope`
   remains the requested scope.
5. `critical` takes precedence over `warning` when both boundaries are crossed.
6. Missing metrics produce `unknown` or `stale` state with source errors; missing metrics do not
   become zero.
7. Evaluation readback may recommend diagnostic next actions, but those actions are links or user
   choices, not automatic mutations.
8. Thresholds are not alerts. Alert routing, notification delivery, on-call dedupe, escalation, and
   incident workflows remain out of scope.

## Safety

The query returns threshold metadata and sanitized evaluation state only. It must not expose raw
shell output, runtime logs, deployment logs, host paths, provider SDK payloads, tokens, credentials,
private keys, registry secrets, billing dimensions, or command output.

## Entrypoints

| Surface | Contract |
| --- | --- |
| CLI | `appaloft runtime-monitoring thresholds show <scope>` dispatches this query through `QueryBus`. |
| HTTP/oRPC | `GET /api/runtime-monitoring/thresholds` reuses this query schema. |
| Web | Server/resource Monitor shows warning/critical badges from this readback while making non-enforcement explicit. |
| SDK / MCP | SDK metadata and generated MCP/tool descriptors come from the operation catalog and this shared query schema. |

## Tests

The governing matrix is
[Runtime Monitoring Observation Test Matrix](../testing/runtime-monitoring-observation-test-matrix.md).

Code Round coverage for `RT-MON-006` proves:

- policy readback is safe and nullable;
- CLI and HTTP/oRPC entrypoints dispatch through the shared query schema;
- evaluation reports `ok`, `warning`, `critical`, `stale`, and `unknown` without runtime mutation;
- missing retained samples are not treated as zero;
- parent-scope policies can be inherited only from retained sample evidence, and exact-scope
  policies override inherited policies;
- disabled policies do not produce crossings;
- query execution never calls runtime adapters, prune commands, deployment commands, alert delivery,
  billing, sizing, or mutation ports.
