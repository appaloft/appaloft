# resources.reset-health Command Spec

## Normative Contract

`resources.reset-health` clears the resource-owned reusable health policy for future deployments and
current `resources.health` observation.

Command success means the policy fields were durably removed from the Resource runtime profile. It
does not deploy the resource, restart runtime, mutate historical deployment snapshots, prove runtime
reachability, bind domains, issue certificates, apply proxy configuration, or mark the resource
healthy.

```ts
type ResetResourceHealthResult = Result<{ id: string }, DomainError>;
```

The command contract is:

- admission failure returns `err(DomainError)`;
- accepted success returns `ok({ id })`;
- accepted success removes `runtimeProfile.healthCheck` and `runtimeProfile.healthCheckPath` while
  preserving other runtime profile fields;
- accepted success publishes or records `resource-health-policy-reset`;
- current health remains observable through `resources.health`, not the command result.

## Global References

This command inherits:

- [ADR-012: Resource Runtime Profile And Deployment Snapshot Boundary](../decisions/ADR-012-resource-runtime-profile-and-deployment-snapshot-boundary.md)
- [ADR-020: Resource Health Observation](../decisions/ADR-020-resource-health-observation.md)
- [resources.configure-health Command Spec](./resources.configure-health.md)
- [resources.health Query Spec](../queries/resources.health.md)
- [Resource Health Observation Workflow](../workflows/resource-health-observation.md)
- [Resource Health Error Spec](../errors/resources.health.md)
- [Resource Lifecycle Error Spec](../errors/resources.lifecycle.md)
- [Resource Health Test Matrix](../testing/resource-health-test-matrix.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)

## Purpose

Reset a Resource health policy when an operator wants the resource to return to "not configured"
health-policy state without changing source, runtime commands, network, access, variables, current
runtime, deployment attempts, or historical snapshots.

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
type ResetResourceHealthCommandInput = {
  resourceId: string;
};
```

## Admission Flow

The command must:

1. Validate command input.
2. Resolve `resourceId`.
3. Reject missing or invisible resource with `not_found`.
4. Reject archived resources with `resource_archived`.
5. Remove `runtimeProfile.healthCheck` and `runtimeProfile.healthCheckPath`.
6. Preserve all non-health runtime profile fields.
7. Persist the updated `Resource` aggregate through the resource repository.
8. Publish or record `resource-health-policy-reset`.
9. Return `ok({ id })`.

## Entrypoints

| Entrypoint | Mapping | Status |
| --- | --- | --- |
| Web | Resource detail health settings may expose reset as the same health-policy task. | Future |
| CLI | `appaloft resource reset-health <resourceId> [--json]`. | Active |
| oRPC / HTTP | `POST /api/resources/{resourceId}/health-policy/reset` using the command schema. | Active |
| Automation / MCP | Future command/tool over the same operation key. | Future |

## Current Implementation Notes And Migration Gaps

Reset is implemented as a Resource aggregate mutation. It intentionally does not create health
history rows or delete historical deployment snapshot health policy copies.

## Open Questions

- None for the v1 health policy reset slice.
