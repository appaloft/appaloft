# Resource Diagnostic Summary Error Spec

## Normative Contract

`resources.diagnostic-summary` uses the shared platform error model and neverthrow conventions.

The query must prefer partial structured summaries over whole-query failures. Missing runtime logs,
missing proxy configuration, missing generated access routes, or unavailable optional system
context are section statuses and `sourceErrors` unless they prevent a safe resource-scoped response.

## Global References

This spec inherits:

- [resources.diagnostic-summary Query Spec](../queries/resources.diagnostic-summary.md)
- [Resource Diagnostic Summary Workflow Spec](../workflows/resource-diagnostic-summary.md)
- [Resource Access Failure Diagnostics Error Spec](./resource-access-failure-diagnostics.md)
- [Error Model](./model.md)
- [neverthrow Conventions](./neverthrow-conventions.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)

## Error Details

```ts
type ResourceDiagnosticSummaryErrorDetails = {
  queryName?: "resources.diagnostic-summary";
  phase:
    | "query-validation"
    | "resource-resolution"
    | "deployment-resolution"
    | "read-model-load"
    | "access-summary"
    | "edge-access-failure"
    | "proxy-summary"
    | "deployment-log-tail"
    | "runtime-log-tail"
    | "system-context"
    | "redaction"
    | "copy-render";
  resourceId?: string;
  deploymentId?: string;
  projectId?: string;
  environmentId?: string;
  targetId?: string;
  destinationId?: string;
  source?: string;
  relatedEntityId?: string;
  relatedEntityType?: "resource" | "deployment" | "project" | "environment" | "destination" | "deployment-target";
  relatedState?: string;
  correlationId?: string;
  causationId?: string;
};
```

Error details must not include secret values, private keys, raw environment variables, source
credentials, provider access tokens, full SSH commands, local credential paths, or unredacted log
lines.

## Whole-Query Admission Errors

These errors return `err(DomainError)`.

| Error code | Category | Phase | Retriable | Meaning |
| --- | --- | --- | --- | --- |
| `validation_error` | `validation` | `query-validation` | No | Input shape, id format, tail bounds, or include flags are invalid. |
| `not_found` | `not-found` | `resource-resolution` | No | Resource cannot be found or is not visible. |
| `not_found` | `not-found` | `deployment-resolution` | No | Requested deployment cannot be found or is not visible. |
| `resource_diagnostic_context_mismatch` | `application` | `deployment-resolution` | No | Requested deployment does not belong to the resource context. |
| `resource_diagnostic_unavailable` | `infra` | `read-model-load` | Conditional | Core read models needed to build a safe summary cannot be loaded. |
| `resource_diagnostic_redaction_failed` | `infra` | `redaction` | No | The service cannot prove included diagnostic content is safely redacted. |

## Source Errors

Per-source failures are embedded in the successful summary:

```ts
type ResourceDiagnosticSourceError = {
  source:
    | "deployment"
    | "access"
    | "edge-access"
    | "proxy"
    | "deployment-logs"
    | "runtime-logs"
    | "system"
    | "copy";
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
| `access` | `default_access_route_unavailable` | `access-summary` | No generated or durable access URL is currently available. |
| `edge-access` | `resource_access_route_not_found` | `edge-request-routing` | Recent edge request reached Appaloft but no active route matched the host/path. |
| `edge-access` | `resource_access_proxy_unavailable` | `proxy-route-observation` | Recent edge request reached a route that required unavailable proxy infrastructure. |
| `edge-access` | `resource_access_route_unavailable` | `proxy-route-observation` | Recent edge request reached a known route that was not applied, ready, or current. |
| `edge-access` | `resource_access_upstream_unavailable` | `upstream-connection` | Recent edge request matched a route but no current upstream target was available. |
| `edge-access` | `resource_access_upstream_connect_failed` | `upstream-connection` | Recent edge request could not connect to the resource endpoint. |
| `edge-access` | `resource_access_upstream_timeout` | `upstream-connection` | Recent edge request timed out waiting for the resource endpoint. |
| `edge-access` | `resource_access_upstream_reset` | `upstream-response` | Recent edge request's upstream connection reset before a complete response. |
| `edge-access` | `resource_access_upstream_tls_failed` | `upstream-connection` | Recent edge request failed upstream TLS or protocol negotiation. |
| `edge-access` | `resource_access_edge_error` | `diagnostic-page-render` | The edge diagnostic service failed while handling a gateway error. |
| `edge-access` | `resource_access_unknown` | `diagnostic-page-render` | Recent edge request failed, but the edge provider could not classify the failure safely. |
| `proxy` | `proxy_provider_unavailable` | `proxy-summary` | The required edge proxy provider is not registered or not available. |
| `proxy` | `proxy_configuration_render_failed` | `proxy-summary` | Provider failed to render a safe read-only configuration view. |
| `deployment-logs` | `deployment_logs_unavailable` | `deployment-log-tail` | Deployment-attempt logs cannot be loaded or are missing. |
| `runtime-logs` | `resource_runtime_logs_unavailable` | `runtime-log-tail` | No observable runtime instance or placement metadata exists. |
| `runtime-logs` | `resource_runtime_logs_not_configured` | `runtime-log-tail` | Runtime backend has no registered log reader. |
| `system` | `system_context_unavailable` | `system-context` | Safe backend/desktop/local context could not be loaded. |
| `copy` | `resource_diagnostic_copy_render_failed` | `copy-render` | Optional markdown/plain-text rendering failed; canonical JSON remains available when possible. |

Source errors must reuse stable codes from the owning query/spec when a source already has one.

## Consumer Mapping

Web, desktop, CLI, HTTP API, automation, and future MCP consumers must:

- show copyable canonical JSON when the whole query succeeds;
- show source section statuses even when access/log/proxy sources are unavailable;
- display stable `code`, `phase`, and related ids in bug-report/detail views;
- avoid using screenshots as the only way to report failures;
- avoid exposing retry actions unless a corresponding public command exists and the error is
  retriable.

## Test Assertions

Tests must assert:

- whole-query errors use `Result` and stable error fields;
- partial source failures do not fail the whole query;
- section failures include stable `source`, `code`, `phase`, and related ids when known;
- secret values and raw credential-bearing command strings are absent from summary fields, log
  lines, `sourceErrors`, and copy payloads;
- `copy.json` is still produced when optional markdown/plain-text rendering fails.

## Current Implementation Notes And Migration Gaps

Resource diagnostic summary error mapping is implemented for the initial query slice.

Whole-query failures include `not_found`, `resource_diagnostic_context_mismatch`,
`resource_diagnostic_unavailable`, and `resource_diagnostic_redaction_failed`.

Initial source errors include `default_access_route_unavailable`, `deployment_logs_unavailable`,
runtime log errors propagated from `resources.runtime-logs`, proxy errors propagated from
`resources.proxy-configuration.preview`, and `system_context_unavailable`.

The implementation uses the current codebase `DomainError.category` values (`user`, `infra`,
`provider`, `retryable`) while this spec still documents the richer logical category vocabulary
from the global error model.

## Open Questions

- Should source errors include user-facing messages, or should all user-facing rendering happen
  entirely at Web/CLI/i18n boundaries?
