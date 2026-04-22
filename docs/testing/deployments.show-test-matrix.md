# Deployment Detail Test Matrix

## Normative Contract

Tests for `deployments.show` must verify that one accepted deployment attempt can be inspected as a
first-class detail query without turning deployment detail into a write surface or collapsing it
into `deployments.list`.

The query must return immutable attempt context plus safe derived observation state.

## Global References

This test matrix inherits:

- [deployments.show Query Spec](../queries/deployments.show.md)
- [Deployment Detail And Observation Workflow Spec](../workflows/deployment-detail-and-observation.md)
- [Deployment Detail Error Spec](../errors/deployments.show.md)
- [Deployment Detail Implementation Plan](../implementation/deployments.show-plan.md)
- [deployments.create Command Spec](../commands/deployments.create.md)
- [deployments.create Test Matrix](./deployments.create-test-matrix.md)
- [Project Resource Console Workflow Spec](../workflows/project-resource-console.md)
- [Resource Diagnostic Summary Test Matrix](./resource-diagnostic-summary-test-matrix.md)
- [Resource Health Test Matrix](./resource-health-test-matrix.md)
- [Spec-Driven Testing](./SPEC_DRIVEN_TESTING.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)

## Test Layers

| Layer | Focus |
| --- | --- |
| Query schema | Deployment id and include flags validate through the shared schema. |
| Query handler/service | Delegates to query service and composes deployment detail without mutation. |
| Read-model composition | Base deployment identity/status, immutable snapshot, related context, timeline, and failure summary. |
| Partial failure | Missing related/timeline/snapshot data becomes section error inside `ok(...)` when safe. |
| Ownership boundary | Deployment detail does not masquerade as current resource health/current resource access. |
| API/oRPC | Exposes the same query schema and result shape. |
| CLI | Emits canonical JSON and concise human summary from the same query. |
| Web/desktop | Deployment detail page reads `deployments.show` instead of composing detail solely from `deployments.list`. |

## Given / When / Then Template

```md
Given:
- Deployment:
- Resource/project/environment/server context:
- Snapshot/timeline/failure projection state:
- Entrypoint:

When:
- The caller requests deployment detail.

Then:
- Query input:
- Source calls:
- Detail sections:
- Section errors:
- Expected absence of mutations:
- Entrypoint behavior:
```

## Query And Service Matrix

| Test ID | Preferred automation | Case | Input/read state | Expected result | Expected section errors | Required assertion |
| --- | --- | --- | --- | --- | --- | --- |
| DEP-SHOW-QRY-001 | integration | Complete detail | Deployment exists with related resource/server context, snapshot, and timeline | `ok` with all sections available | None | Detail contains immutable attempt ids, status, and snapshot route/runtime data. |
| DEP-SHOW-QRY-002 | integration | Deployment missing | Unknown deployment id | `err(not_found)` | None | No related-source readers are called. |
| DEP-SHOW-QRY-003 | integration | Invalid input | Empty/invalid deployment id or include flags | `err(validation_error)` | None | Handler returns typed `Result`; no side effects. |
| DEP-SHOW-QRY-004 | integration | Related context unavailable | Base deployment row loads, related resource or server summary missing | `ok` | `deployment_related_context_unavailable` | Base deployment identity/status still renders. |
| DEP-SHOW-QRY-005 | integration | Snapshot unavailable | Deployment exists, but immutable snapshot detail cannot be safely reconstructed | `ok` | `deployment_snapshot_unavailable` | Status and ids remain available; query does not invent mutable profile state. |
| DEP-SHOW-QRY-006 | integration | Timeline unavailable | Deployment exists, timeline/progress projection missing or stale | `ok` | `deployment_timeline_unavailable` | Query returns detail without requiring live stream. |
| DEP-SHOW-QRY-007 | integration | Failure summary unavailable | Deployment failed, but failure summary projection missing | `ok` | `deployment_failure_summary_unavailable` | Terminal status remains `failed`; failure details are not fabricated. |
| DEP-SHOW-QRY-008 | integration | Resource drift after deployment | Resource current profile now differs from the attempt snapshot | `ok` | None | Snapshot still reflects the immutable attempt; current resource config is not substituted. |
| DEP-SHOW-QRY-009 | integration | Access snapshot is historical | Deployment snapshot route differs from current resource access precedence | `ok` | None | Detail labels attempt route as historical/snapshot context and does not claim it is current resource access. |
| DEP-SHOW-QRY-010 | integration | Aggregation failure | Base deployment sources load but service cannot produce a safe response | `err(deployment_detail_aggregation_failed)` | None | No partial unsafe detail is returned. |

## Ownership And Boundary Matrix

| Test ID | Preferred automation | Case | Required assertion |
| --- | --- | --- | --- |
| DEP-SHOW-OWN-001 | integration | Health remains resource-owned | `deployments.show` does not expose current resource health as the main deployment status contract and does not replace `resources.health`. |
| DEP-SHOW-OWN-002 | integration | Logs remain separate query | `deployments.show` does not include unbounded full logs and keeps `deployments.logs` as the detailed attempt-log boundary. |
| DEP-SHOW-OWN-003 | integration | No hidden write actions | Response next-actions never expose retry, cancel, redeploy, rollback, or cleanup as active operations unless those commands are public again. |
| DEP-SHOW-OWN-004 | integration | Progress stream stays transport-scoped | Detail query may summarize timeline but does not require or become a live create-time progress transport. |

## Entrypoint Matrix

| Test ID | Preferred automation | Entrypoint | Case | Expected behavior |
| --- | --- | --- | --- | --- |
| DEP-SHOW-ENTRY-001 | e2e-preferred | Web deployment detail | User opens `/deployments/{id}` | Page resolves `deployments.show` for overview/timeline/snapshot and keeps logs on `deployments.logs`. |
| DEP-SHOW-ENTRY-002 | e2e-preferred | Web resource history | User clicks a deployment row from resource history | Navigation reaches deployment detail backed by `deployments.show`; resource page remains owner of new deployment/current health. |
| DEP-SHOW-ENTRY-003 | e2e-preferred | CLI | `appaloft deployments show <deploymentId> --json` | Prints canonical `DeploymentDetail` JSON from the query result. |
| DEP-SHOW-ENTRY-004 | e2e-preferred | API/oRPC | HTTP query | Reuses the shared query schema and returns `deployments.show/v1`. |
| DEP-SHOW-ENTRY-005 | e2e-preferred | Quick Deploy completion | Completion links to deployment detail after accepted deploy | Follows the shared deployment-detail query instead of a private completion-only payload. |

## Current Implementation Notes And Migration Gaps

Executable coverage now exists for the active `deployments.show` slice:

- application query-service coverage for complete detail, `not_found`, and partial related-context
  availability;
- API/oRPC coverage for `GET /api/deployments/{deploymentId}`;
- Web/Bun.WebView coverage for direct deployment-detail entry, resource-history navigation into
  deployment detail, partial section-error rendering, and Quick Deploy success-path navigation to
  the shared deployment detail route.

`deployments.logs` remains the separate detailed attempt-log boundary and is intentionally verified
through the deployment detail Web flow rather than folded into the `deployments.show` response.

## Open Questions

- Should the first Web/browser assertion cover only overview rendering, or should it also assert
  timeline/snapshot tab separation once the query is implemented?
