# Resource Health Error Spec

## Normative Contract

`resources.health` uses the shared platform error model and neverthrow conventions.

The query should return `ok(ResourceHealthSummary)` when the resource is visible and a safe
resource-scoped summary can be built, even if runtime, proxy, public access, or health-check
sources are unavailable or failing.

Whole-query failures are reserved for invalid input, missing or invisible resource context,
permission failure, and read-model failures that prevent safe summary construction.

## Global References

This spec inherits:

- [ADR-020: Resource Health Observation](../decisions/ADR-020-resource-health-observation.md)
- [resources.health Query Spec](../queries/resources.health.md)
- [Resource Health Observation Workflow Spec](../workflows/resource-health-observation.md)
- [Resource Health Test Matrix](../testing/resource-health-test-matrix.md)
- [Resource Health Implementation Plan](../implementation/resource-health-plan.md)
- [Error Model](./model.md)
- [neverthrow Conventions](./neverthrow-conventions.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)

## Error Details

```ts
type ResourceHealthErrorDetails = {
  queryName?: "resources.health";
  phase:
    | "query-validation"
    | "resource-resolution"
    | "latest-deployment-resolution"
    | "read-model-load"
    | "runtime-inspection"
    | "health-policy-resolution"
    | "health-check-execution"
    | "proxy-route-observation"
    | "public-access-observation"
    | "aggregation";
  resourceId?: string;
  deploymentId?: string;
  projectId?: string;
  environmentId?: string;
  targetId?: string;
  destinationId?: string;
  source?: string;
  relatedEntityId?: string;
  relatedEntityType?:
    | "resource"
    | "deployment"
    | "project"
    | "environment"
    | "destination"
    | "deployment-target"
    | "domain-binding"
    | "proxy-route";
  relatedState?: string;
  correlationId?: string;
  causationId?: string;
};
```

Error details must not include secret values, private keys, raw environment variables, source
credentials, provider access tokens, full shell commands, private local paths, or unredacted probe
responses.

## Whole-Query Admission Errors

These errors return `err(DomainError)`.

| Error code | Category | Phase | Retriable | Meaning |
| --- | --- | --- | --- | --- |
| `validation_error` | `validation` | `query-validation` | No | Input shape, resource id, mode, or include flags are invalid. |
| `not_found` | `not-found` | `resource-resolution` | No | Resource cannot be found or is not visible. |
| `permission_denied` | `authorization` | `resource-resolution` | No | Caller is not allowed to inspect the resource. |
| `resource_health_unavailable` | `infra` | `read-model-load` | Conditional | Core read models needed to build a safe summary cannot be loaded. |
| `resource_health_aggregation_failed` | `application` | `aggregation` | Conditional | Source data was loaded, but the service cannot produce a safe, internally consistent summary. |

## Source Errors

Per-source failures are embedded in a successful summary:

```ts
type ResourceHealthSourceError = {
  source:
    | "deployment"
    | "runtime"
    | "health-policy"
    | "health-check"
    | "proxy"
    | "public-access"
    | "domain-binding";
  code: string;
  category: string;
  phase: string;
  retriable: boolean;
  relatedEntityId?: string;
  relatedState?: string;
  message?: string;
};
```

Typical source errors:

| Source | Error code | Phase | Meaning |
| --- | --- | --- | --- |
| `deployment` | `resource_latest_deployment_unavailable` | `latest-deployment-resolution` | No latest deployment context could be found. |
| `runtime` | `resource_runtime_unavailable` | `runtime-inspection` | No current runtime instance can be inspected. |
| `runtime` | `resource_runtime_inspection_failed` | `runtime-inspection` | Runtime/provider inspection failed or timed out. |
| `health-policy` | `resource_health_policy_not_configured` | `health-policy-resolution` | No health policy exists for a running resource. |
| `health-policy` | `resource_health_policy_unsupported` | `health-policy-resolution` | Configured policy cannot run on the selected runtime adapter. |
| `health-check` | `resource_health_check_failed` | `health-check-execution` | HTTP status, response text, timeout, or command exit code failed. |
| `health-check` | `resource_health_check_unavailable` | `health-check-execution` | No safe current runtime URL can be resolved for a configured policy. |
| `health-check` | `resource_health_check_timeout` | `health-check-execution` | Bounded HTTP policy probe timed out. |
| `health-check` | `resource_health_check_response_mismatch` | `health-check-execution` | Bounded HTTP policy probe returned an unexpected status or response text. |
| `proxy` | `resource_proxy_route_unavailable` | `proxy-route-observation` | Required proxy route is missing, unapplied, or not ready. |
| `public-access` | `resource_public_access_unavailable` | `public-access-observation` | No current durable or generated public route is available. |
| `public-access` | `resource_public_access_probe_failed` | `public-access-observation` | Current public route timed out or returned an unexpected result. |
| `domain-binding` | `resource_domain_binding_not_ready` | `public-access-observation` | Durable domain binding exists but is not ready for traffic. |

Source errors must reuse stable codes from the owning query/spec when a source already has one.

## Consumer Mapping

Web, desktop, CLI, HTTP API, automation, and future MCP consumers must:

- display `ResourceHealthSummary.overall` as current resource health;
- display latest deployment status only as contextual history;
- show failing source codes and phases when the user opens details or copies diagnostics;
- avoid presenting deployment `succeeded` as proof that public access works;
- avoid exposing retry, restart, or repair actions unless a corresponding public command exists.

## Test Assertions

Tests must assert:

- whole-query errors use `Result` and stable error fields;
- runtime/proxy/public-access failures become summary sections and source errors when safe;
- no configured health policy yields `overall = "unknown"` for a running resource;
- failed required health checks do not get overridden by latest deployment success;
- source errors and check records do not include secrets, private paths, or raw credential-bearing
  commands.

## Current Implementation Notes And Migration Gaps

`resources.health` query and whole-query error mapping are implemented for the first aggregation
slice with bounded HTTP/public probes.

Implemented whole-query errors:

- `not_found` when the resource cannot be resolved;
- `resource_health_unavailable` when resource or deployment read models cannot be safely loaded.

Implemented source errors include:

- `resource_latest_deployment_unavailable`;
- `resource_health_policy_not_configured`;
- `resource_health_check_unavailable`;
- `resource_health_check_timeout`;
- `resource_health_check_response_mismatch`;
- `resource_health_check_failed`;
- `resource_domain_binding_not_ready`;
- `resource_public_access_unavailable`;
- `resource_public_access_probe_failed`;
- `resource_proxy_route_unavailable`;
- `resource_runtime_live_probe_unavailable`.

Current deployment-time verification errors belong to `deployments.create` execution and should not
be reused as the long-lived resource health error surface without passing through this query model.

## Open Questions

- Should public access probe failures include a bounded response status/body preview, or only stable
  codes and timings?
