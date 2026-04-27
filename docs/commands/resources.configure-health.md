# resources.configure-health Command Spec

## Normative Contract

`resources.configure-health` is the source-of-truth command for changing the reusable health policy
owned by a resource.

Command success means the policy was durably stored on the resource. It does not deploy the
resource, restart runtime, mutate historical deployment snapshots, prove runtime reachability, bind
domains, issue certificates, apply proxy configuration, or mark the resource healthy.

```ts
type ConfigureResourceHealthResult = Result<{ id: string }, DomainError>;
```

The command contract is:

- admission failure returns `err(DomainError)`;
- accepted success returns `ok({ id })`;
- accepted success persists the `Resource` aggregate with updated `runtimeProfile.healthCheck`;
- accepted success publishes or records `resource-health-policy-configured`;
- current health remains observable through `resources.health`, not the command result.

## Global References

This command inherits:

- [ADR-012: Resource Runtime Profile And Deployment Snapshot Boundary](../decisions/ADR-012-resource-runtime-profile-and-deployment-snapshot-boundary.md)
- [ADR-020: Resource Health Observation](../decisions/ADR-020-resource-health-observation.md)
- [resources.archive Command Spec](./resources.archive.md)
- [resources.health Query Spec](../queries/resources.health.md)
- [Resource Health Observation Workflow](../workflows/resource-health-observation.md)
- [Resource Health Error Spec](../errors/resources.health.md)
- [Resource Lifecycle Error Spec](../errors/resources.lifecycle.md)
- [Resource Health Test Matrix](../testing/resource-health-test-matrix.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)

## Purpose

Configure health policy for an existing deployable resource so future deployment snapshots and
current resource health observation can evaluate the same resource-owned policy.

It is not:

- a deployment command;
- a retry, restart, rollback, or redeploy command;
- a runtime target configuration command;
- a proxy route or domain binding command;
- a public access probe command;
- a query/read-model operation;
- a Web-only setting.

## Input Model

```ts
type ConfigureResourceHealthCommandInput = {
  resourceId: string;
  healthCheck: {
    enabled?: boolean;
    type?: "http";
    intervalSeconds?: number;
    timeoutSeconds?: number;
    retries?: number;
    startPeriodSeconds?: number;
    http?: {
      method?: "GET" | "HEAD" | "POST" | "OPTIONS";
      scheme?: "http" | "https";
      host?: string;
      port?: number;
      path?: string;
      expectedStatusCode?: number;
      expectedResponseText?: string;
    };
  };
};
```

| Field | Requirement | Meaning |
| --- | --- | --- |
| `resourceId` | Required | Resource whose reusable health policy is being configured. |
| `healthCheck.enabled` | Optional | Defaults to `true`. `false` disables resource health policy without deleting the resource. |
| `healthCheck.type` | Optional | Defaults to `http`. Only HTTP health policy is accepted in v1. |
| `healthCheck.intervalSeconds` | Optional | Scheduling hint for observers and deployment-time verification. Defaults to `5`. |
| `healthCheck.timeoutSeconds` | Optional | Per-probe timeout. Defaults to `5`. |
| `healthCheck.retries` | Optional | Retry count for deployment-time verification or scheduled observers. Defaults to `10`. |
| `healthCheck.startPeriodSeconds` | Optional | Grace period before evaluating runtime health. Defaults to `5`. |
| `healthCheck.http` | Required when enabled HTTP policy is configured | HTTP probe defaults and expected result. |

HTTP policy defaults match `resources.create.runtimeProfile.healthCheck`.

## Admission Flow

The command must:

1. Validate command input.
2. Resolve `resourceId`.
3. Reject missing or invisible resource with `not_found`.
4. Reject archived resources with `resource_archived`.
5. Normalize HTTP policy fields through value objects.
6. Preserve existing resource runtime profile fields that are not health-policy fields.
7. Persist the updated `Resource` aggregate through the resource repository.
8. Publish or record `resource-health-policy-configured`.
9. Return `ok({ id })`.

## Resource-Specific Rules

`resources.configure-health` mutates `ResourceRuntimeProfile.healthCheck` and mirrors the HTTP
path to `ResourceRuntimeProfile.healthCheckPath` for runtime-plan compatibility.

When the resource does not yet have a runtime profile, the command creates a minimum runtime profile
using `RuntimePlanStrategy = "auto"` plus the submitted health policy. It must not infer source,
network, route, domain, or runtime-target state.

When `enabled = false`, the policy is stored as disabled and `resources.health` reports health
policy `not-configured`; this is distinct from a missing resource.

Archived resources reject this command. Operators may still use `resources.health` to inspect
retained health context when the read model/runtime observation can safely provide it.

The command must not store raw probe response bodies, credentials, request headers, environment
variables, local file paths, provider tokens, or deployment logs.

## Entrypoints

| Entrypoint | Mapping | Status |
| --- | --- | --- |
| Web | Resource detail health settings form dispatches the command and refetches `resources.health`. | Active |
| CLI | `appaloft resource configure-health <resourceId> [--path /] [--expected-status 200] [--json]`. | Active |
| oRPC / HTTP | `POST /api/resources/{resourceId}/health-policy` using the command schema. | Active |
| Automation / MCP | Future command/tool over the same operation key. | Future |

## Current Implementation Notes And Migration Gaps

Initial implementation covers HTTP health policies only. Command-style in-runtime health checks
remain blocked until a stronger command sandbox model is accepted.

Configuring the policy does not automatically rerun a deployment. `resources.health({ mode:
"live" })` can evaluate the policy against the current runtime when a safe URL can be resolved.

Archived-resource blocking is active through the resource lifecycle guard.

## Open Questions

- None for the v1 HTTP health policy configuration slice.
