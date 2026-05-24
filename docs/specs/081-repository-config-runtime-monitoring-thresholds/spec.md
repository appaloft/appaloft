# Repository Config Runtime Monitoring Thresholds

## Status

- Round: Post-Implementation Sync
- Artifact state: MVP implemented for Resource-scoped runtime monitoring threshold declarations in
  repository config and CLI/Action config deploy orchestration
- Roadmap target: `0.12.x` repository config hardening
- Compatibility impact: `pre-1.0-policy`, additive repository config fields
- Decision state: governed by
  [ADR-072](../../decisions/ADR-072-repository-config-runtime-monitoring-thresholds.md)

## Business Outcome

Users can keep non-enforcing runtime monitoring warning/critical thresholds next to the application
deployment config. Config deploy reconciles an exact Resource-scope threshold policy before
deployment admission while preserving deployment admission as ids-only and keeping runtime sizing,
quota, autoscaling, cleanup, alert routing, and billing outside this feature.

## Ubiquitous Language

| Term | Meaning | Context |
| --- | --- | --- |
| RepositoryMonitoringThresholds | User-facing `monitoring.thresholds` declaration for Resource runtime monitoring warning/critical policy. | Repository config |
| RuntimeMonitoringThresholdPolicy | Existing non-enforcing runtime monitoring policy persisted for an exact scope. | Runtime monitoring |
| ExactResourceThresholdPolicy | Threshold policy whose scope is the selected Resource, not an inherited parent scope. | Runtime monitoring |

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| CONFIG-MONITORING-THRESHOLDS-001 | Parse monitoring thresholds | `monitoring.thresholds` declares `enabled` and one or more rules | The config parser runs | The config is accepted, defaults `enabled` and comparator, validates signal/metric pairs, and JSON schema exposes the field. |
| CONFIG-MONITORING-THRESHOLDS-002 | Reject unsafe monitoring material | Config includes policy id, scope id, provider account, container id, sample id, token, credential, raw metric payload, log text, host path, or mismatched signal/metric under `monitoring.thresholds` | The config parser runs | Parsing fails before mutation with strict schema, identity, unsupported, or raw-secret validation. |
| CONFIG-MONITORING-THRESHOLDS-003 | Configure missing policy | Selected Resource has no exact matching threshold policy | Config deploy handles monitoring threshold reconciliation | The workflow reads threshold state and dispatches `runtime-monitoring.thresholds.configure` for Resource scope before `deployments.create`. |
| CONFIG-MONITORING-THRESHOLDS-004 | Idempotent no-op | Selected Resource already has an exact matching threshold policy | Config deploy runs again | No configure command is dispatched for monitoring thresholds. |
| CONFIG-MONITORING-THRESHOLDS-005 | Inherited policy override | Threshold readback returns a policy inherited from a parent scope | Config deploy reconciles Resource YAML | The workflow creates or replaces only the exact Resource-scope policy and does not pass the inherited parent policy id. |

## Config Contract

MVP repository config fields:

```yaml
monitoring:
  thresholds:
    enabled: true
    rules:
      - signal: cpu
        metric: containerCpuPercent
        warning: 70
        critical: 90
```

Rules:

- `enabled` defaults to `true` when `thresholds` is present.
- `rules` must contain at least one rule.
- Each rule must declare a signal and a metric from the existing runtime monitoring threshold
  vocabulary.
- `warning` and `critical` are optional individually, but at least one must be present.
- When both `warning` and `critical` are present, `critical` must be greater than or equal to
  `warning`.
- First slice supports only `comparator: greater-than-or-equal`, which defaults when omitted.
- Repository config must not declare policy ids, scope ids, provider accounts, provider-native
  monitoring ids, container ids, sample ids, host paths, credentials, private keys, tokens, raw
  metric payloads, log lines, or raw secret values.

## Workflow Contract

Config monitoring threshold reconcile runs after Resource identity is resolved and before
deployment admission:

```text
resource selected/created
  -> runtime-monitoring.thresholds.show(scope = resource)
  -> runtime-monitoring.thresholds.configure(scope = resource) when needed
  -> deployments.create(ids only)
```

The workflow must use command/query buses only. It must not call repositories or application
services from the CLI/HTTP adapter.

## Non-Goals

- No runtime sizing, quota, reservations, billing limits, autoscaling, or admission policy.
- No alert routing or external notification delivery.
- No sample collection, runtime usage probe, cleanup, restart, retry, redeploy, or rollback.
- No mutation of inherited parent threshold policies.
- No deployment command fields for monitoring thresholds.

## Current Implementation Notes And Migration Gaps

This slice is a repository config workflow/profile extension over existing
`runtime-monitoring.thresholds.configure` and `runtime-monitoring.thresholds.show`. No new
operation-catalog key is introduced.
Automated coverage is bound through `CONFIG-FILE-MONITORING-THRESHOLDS-001` through
`CONFIG-FILE-MONITORING-THRESHOLDS-005` in the deployment config test matrix.
