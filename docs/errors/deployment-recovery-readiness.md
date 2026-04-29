# Deployment Recovery Readiness Error Spec

## Status

Spec Round error contract for accepted candidate recovery operations. These errors are public
contract candidates and become active only when their owning query/command slices are implemented.

## Governing Sources

- [Error Model](./model.md)
- [ADR-034: Deployment Recovery Readiness](../decisions/ADR-034-deployment-recovery-readiness.md)
- [deployments.recovery-readiness Query Spec](../queries/deployments.recovery-readiness.md)
- [deployments.retry Command Spec](../commands/deployments.retry.md)
- [deployments.redeploy Command Spec](../commands/deployments.redeploy.md)
- [deployments.rollback Command Spec](../commands/deployments.rollback.md)
- [Deployment Recovery Readiness Test Matrix](../testing/deployment-recovery-readiness-test-matrix.md)

## Stable Error Codes

| Code | Category | Phase | Retriable | Owner | Required safe details |
| --- | --- | --- | --- | --- | --- |
| `deployment_not_retryable` | `application` or `conflict` | `recovery-admission` | No | `deployments.retry` | deployment id, resource id, current status, blocked reason code, readiness generated time when supplied |
| `deployment_not_redeployable` | `application` or `conflict` | `recovery-admission` | No | `deployments.redeploy` | deployment id when present, resource id, current status/profile state, blocked reason code |
| `deployment_not_rollback_ready` | `application` or `conflict` | `recovery-admission` | No | `deployments.rollback` | deployment id, resource id, rollback candidate id when supplied, blocked reason code, missing artifact/snapshot/environment detail when safe |
| `deployment_rollback_candidate_not_found` | `not-found` | `recovery-admission` | No | `deployments.rollback` | deployment id, resource id, rollback candidate id, retention horizon when known |
| `deployment_recovery_state_stale` | `conflict` | `recovery-admission` | No | recovery commands | deployment id, resource id, readiness generated time, current deployment status/version when known |
| `coordination_timeout` | `timeout` | `operation-coordination` | Yes | recovery commands | coordination scope kind/key, mode, waited seconds, retry hint when available |

## Readiness Reason Codes

Readiness reason codes are not all top-level `PlatformError.code` values. They are machine-readable
explanations inside `DeploymentRecoveryReadiness` and recovery admission details.

Initial reason-code vocabulary:

- `attempt-not-terminal`
- `attempt-status-not-recoverable`
- `snapshot-missing`
- `environment-snapshot-missing`
- `runtime-target-missing`
- `runtime-artifact-missing`
- `rollback-candidate-not-successful`
- `rollback-candidate-expired`
- `rollback-candidate-target-mismatch`
- `resource-profile-invalid`
- `resource-runtime-busy`
- `stateful-data-rollback-unsupported`
- `recovery-command-not-active`

## Consumer Mapping

- Web maps top-level error code plus reason code to i18n keys and displays the readiness reason, not
  raw provider output.
- CLI structured output includes `code`, `category`, `phase`, and reason codes. Human output suggests
  read-only inspection when no recovery command is ready.
- HTTP/oRPC maps `not-found` to 404, `conflict` to 409, `application` to 400 or 409 depending on
  branch, and `timeout` to 504 or async retry guidance.
- Future MCP/tool output should preserve `recoverable`, `retryable`, `redeployable`, `rollbackReady`,
  candidate ids, and reason codes without relying on localized prose.

## Secret Handling

Error details and readiness reasons must not include raw environment values, secrets, registry
credentials, private source URLs with credentials, or unbounded runtime output.
