# Deployment Detail Error Spec

## Normative Contract

`deployments.show` uses the shared platform error model and neverthrow conventions.

The query should return `ok(DeploymentDetail)` when the deployment attempt is visible and a safe
detail response can be built, even if related resource/server/timeline/failure sections are
unavailable.

Whole-query failures are reserved for invalid input, missing or invisible deployment context,
permission failure, and read-model failures that prevent safe base detail construction.

## Global References

This spec inherits:

- [deployments.show Query Spec](../queries/deployments.show.md)
- [Deployment Detail And Observation Workflow Spec](../workflows/deployment-detail-and-observation.md)
- [Deployment Detail Test Matrix](../testing/deployments.show-test-matrix.md)
- [Deployment Detail Implementation Plan](../implementation/deployments.show-plan.md)
- [ADR-013: Project Resource Navigation And Deployment Ownership](../decisions/ADR-013-project-resource-navigation-and-deployment-ownership.md)
- [ADR-016: Deployment Command Surface Reset](../decisions/ADR-016-deployment-command-surface-reset.md)
- [Error Model](./model.md)
- [neverthrow Conventions](./neverthrow-conventions.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)

## Error Details

```ts
type DeploymentDetailErrorDetails = {
  queryName?: "deployments.show";
  phase:
    | "query-validation"
    | "deployment-resolution"
    | "permission-resolution"
    | "read-model-load"
    | "related-context-resolution"
    | "timeline-resolution"
    | "failure-summary-resolution"
    | "snapshot-resolution"
    | "aggregation";
  deploymentId?: string;
  resourceId?: string;
  projectId?: string;
  environmentId?: string;
  targetId?: string;
  destinationId?: string;
  relatedEntityId?: string;
  relatedEntityType?:
    | "deployment"
    | "resource"
    | "project"
    | "environment"
    | "deployment-target"
    | "destination";
  relatedState?: string;
  correlationId?: string;
  causationId?: string;
};
```

Error details must not include secret values, raw environment snapshots, provider tokens, private
host paths, container ids, SSH command lines, or unredacted runtime output.

## Whole-Query Errors

These errors return `err(DomainError)`.

| Error code | Category | Phase | Retriable | Meaning |
| --- | --- | --- | --- | --- |
| `validation_error` | `validation` | `query-validation` | No | Input shape or include flags are invalid. |
| `not_found` | `not-found` | `deployment-resolution` | No | Deployment cannot be found or is not visible. |
| `permission_denied` | `permission` | `permission-resolution` | No | Caller is not allowed to inspect the deployment. |
| `deployment_detail_unavailable` | `infra` | `read-model-load` | Conditional | Core deployment detail read sources could not be loaded safely. |
| `deployment_detail_aggregation_failed` | `application` | `aggregation` | Conditional | Base sources loaded, but the service cannot produce a safe internally consistent detail response. |

## Section Errors

Per-section failures are embedded in a successful detail response:

```ts
type DeploymentDetailSectionError = {
  section:
    | "related-context"
    | "timeline"
    | "snapshot"
    | "latest-failure";
  code: string;
  category: string;
  phase: string;
  retriable: boolean;
  relatedEntityId?: string;
  relatedState?: string;
};
```

Typical section errors:

| Section | Error code | Phase | Meaning |
| --- | --- | --- | --- |
| `related-context` | `deployment_related_context_unavailable` | `related-context-resolution` | Related resource/project/environment/server context could not be loaded safely. |
| `timeline` | `deployment_timeline_unavailable` | `timeline-resolution` | Progress/timeline projection is missing, stale, or temporarily unavailable. |
| `snapshot` | `deployment_snapshot_unavailable` | `snapshot-resolution` | Immutable snapshot detail cannot be reconstructed safely from persisted state. |
| `latest-failure` | `deployment_failure_summary_unavailable` | `failure-summary-resolution` | Terminal or current failure/progress detail cannot be normalized. |

Section errors must not silently downgrade the whole query when the base deployment attempt detail
can still be returned safely.

## Consumer Mapping

Web, CLI, HTTP API, automation, and future MCP consumers must:

- treat whole-query errors as fatal read failures;
- render section errors as unavailable/stale detail inside a successful response;
- avoid treating deployment success as proof of current resource health or current public access;
- avoid showing retry/cancel/rollback actions unless those commands are reintroduced into the
  public surface.

## Test Assertions

Tests must assert:

- whole-query errors use `Result` and stable error fields;
- section failures remain embedded inside `ok(DeploymentDetail)` when safe;
- missing related context does not erase the base deployment identity/status;
- deployment detail does not expose secrets or raw provider-native diagnostics.

## Current Implementation Notes And Migration Gaps

Current deployment detail pages depend on `deployments.list`, related resource/project/server
queries, and `deployments.logs`. They therefore do not yet expose a dedicated deployment-detail
error surface.

When `deployments.show` is implemented, the first slice may initially populate section errors for
timeline or related-context gaps while keeping the base deployment detail available.

## Open Questions

- Should missing related resource context after a deployment row loads always remain a section error,
  or are there cases where the product should escalate it to whole-query failure because the
  deployment detail would be too incomplete to use safely?
