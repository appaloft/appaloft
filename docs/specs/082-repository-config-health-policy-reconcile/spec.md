# Repository Config Health Policy Reconcile

Artifact state: Implemented MVP

Governing decision:

- [ADR-073: Repository Config Health Policy Reconcile](../../decisions/ADR-073-repository-config-health-policy-reconcile.md)

## Purpose

Users can declare reviewable Resource HTTP health policy in `appaloft.yaml`. Config deploy must
materialize that policy through existing Resource commands before deployment admission while keeping
deployment admission ids-only.

## Terms

| Term | Meaning |
| --- | --- |
| RepositoryHealthPolicy | User-facing `health` / `runtime.healthCheck` / `runtime.healthCheckPath` declaration in `appaloft.yaml`. |
| HealthPolicyReconcile | Config deploy step that compares Resource health policy readback and dispatches `resources.configure-health` only when needed. |
| Explicit Profile Apply | Entry workflow mode where the operator has acknowledged existing Resource profile drift and allows profile commands before deployment. |

## Scenarios

| Scenario ID | Scenario | Expected behavior |
| --- | --- | --- |
| CONFIG-HEALTH-001 | First-run config creates a Resource | The Resource create input includes the normalized runtime health policy when config declares health fields. |
| CONFIG-HEALTH-002 | Existing Resource differs and default config deploy runs | Workflow fails with `resource_profile_drift`, phase `resource-profile-resolution`, before deployment admission. |
| CONFIG-HEALTH-003 | Existing Resource differs and explicit profile apply is selected | Workflow dispatches `resources.configure-health` before returning ids-only deployment input. |
| CONFIG-HEALTH-004 | Existing Resource already matches declared health policy | Workflow skips `resources.configure-health` and returns ids-only deployment input. |

## Rules

- `health` and `runtime.healthCheck` normalize to HTTP health policy with defaults for method,
  scheme, host, expected status, interval, timeout, retries, and start period.
- `runtime.healthCheckPath` is a compatibility shorthand and normalizes to the same HTTP health
  policy path.
- `enabled: false` stores a disabled health policy and must not require an HTTP target.
- Health policy reconcile runs after Resource identity is known and before deployment admission.
- Reconcile must dispatch only `resources.configure-health`; it must not use
  `resources.configure-runtime` as a hidden health mutation path.
- `deployments.create` must not receive health fields.

## Non-Goals

- Command-style in-runtime health checks.
- Running live health probes during config deploy.
- Restarting runtime, redeploying historical snapshots, or marking the Resource healthy.
- Selecting project, environment, resource, server, destination, credentials, provider accounts, or
  tenant/org identity from repository config.
- Environment/preview overlays.

## Verification

Automated coverage binds the implementation to:

- `CONFIG-FILE-PROFILE-003`
- `CONFIG-FILE-PROFILE-003A`
- `CONFIG-FILE-PROFILE-003B`
- `CONFIG-FILE-PROFILE-009`
