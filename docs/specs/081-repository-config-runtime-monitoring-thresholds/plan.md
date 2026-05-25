# Repository Config Runtime Monitoring Thresholds Plan

## Scope

| Item | Decision |
| --- | --- |
| Owner context | Runtime monitoring / repository config entry workflow |
| Existing commands | `runtime-monitoring.thresholds.configure`, `deployments.create` |
| Existing queries | `runtime-monitoring.thresholds.show` |
| New operation key | None |
| Public surface | `appaloft.yaml` / generated JSON schema / config deploy docs |
| Adapter boundary | CLI/Action config workflow dispatches command/query bus only |

## Implementation Plan

1. Extend deployment config schema with optional `monitoring.thresholds`.
2. Map parsed declarations into `DeploymentPromptSeed.monitoringThresholds`.
3. Reconcile after Resource resolution by reading exact/inherited threshold readback and dispatching
   `runtime-monitoring.thresholds.configure` only when the exact Resource policy differs.
4. Keep final `deployments.create` ids-only.
5. Update parser/schema tests, CLI workflow tests, docs, public docs, and AI-facing deploy docs.

## Test Binding

| Matrix ID | Automation |
| --- | --- |
| CONFIG-FILE-MONITORING-THRESHOLDS-001 | `packages/deployment-config/test/appaloft-config.test.ts` |
| CONFIG-FILE-MONITORING-THRESHOLDS-002 | `packages/deployment-config/test/appaloft-config.test.ts` |
| CONFIG-FILE-MONITORING-THRESHOLDS-003 | `packages/adapters/cli/test/deployment-config.test.ts` |
| CONFIG-FILE-MONITORING-THRESHOLDS-004 | `packages/adapters/cli/test/deployment-config.test.ts` |
| CONFIG-FILE-MONITORING-THRESHOLDS-005 | `packages/adapters/cli/test/deployment-config.test.ts` |

## Sync Checklist

- ADR index
- Deployment config test matrix
- Runtime monitoring observation test matrix
- Repository config workflow docs
- Public config-file docs
- Public diagnostics docs cross-link where needed
- AI-facing Appaloft deploy skill docs
- Generated JSON schema
