# Deployment Detail Implementation Plan

## Source Of Truth

This document is an implementation-planning contract for `deployments.show`. It does not replace
ADRs, query specs, workflow specs, error specs, or test matrices.

## Governed ADRs

- [ADR-013: Project Resource Navigation And Deployment Ownership](../decisions/ADR-013-project-resource-navigation-and-deployment-ownership.md)
- [ADR-016: Deployment Command Surface Reset](../decisions/ADR-016-deployment-command-surface-reset.md)
- [ADR-017: Default Access Domain And Proxy Routing](../decisions/ADR-017-default-access-domain-and-proxy-routing.md)
- [ADR-021: Docker/OCI Workload Substrate](../decisions/ADR-021-docker-oci-workload-substrate.md)
- [ADR-023: Runtime Orchestration Target Boundary](../decisions/ADR-023-runtime-orchestration-target-boundary.md)

## Governed Specs

- [deployments.show Query Spec](../queries/deployments.show.md)
- [Deployment Detail And Observation Workflow Spec](../workflows/deployment-detail-and-observation.md)
- [Deployment Detail Error Spec](../errors/deployments.show.md)
- [Deployment Detail Test Matrix](../testing/deployments.show-test-matrix.md)
- [deployments.create Command Spec](../commands/deployments.create.md)
- [Project Resource Console Workflow Spec](../workflows/project-resource-console.md)
- [resources.health Query Spec](../queries/resources.health.md)
- [resources.diagnostic-summary Query Spec](../queries/resources.diagnostic-summary.md)
- [Core Operations](../CORE_OPERATIONS.md)
- [Domain Model](../DOMAIN_MODEL.md)

## Expected Application Scope

Add a vertical query slice under `packages/application/src/operations/deployments/`:

- `show-deployment.schema.ts`;
- `show-deployment.query.ts`;
- `show-deployment.handler.ts`;
- `show-deployment.query-service.ts`.

Add application tokens/ports as needed:

- `tokens.showDeploymentQueryService`;
- a deployment-detail read-model port or a read-model extension that can resolve one deployment by
  id with immutable snapshot detail;
- optional read-only progress/timeline summary resolver if existing deployment list projections are
  insufficient;
- optional related-context resolver for resource/project/environment/server/destination summaries.

The query handler must delegate to the query service and return the typed `Result`.

## Expected Read-Model Scope

The first implementation should compose:

- base deployment attempt identity and lifecycle state;
- immutable runtime/access/source snapshot detail already persisted for the attempt;
- related resource/project/environment/server/destination summaries when safe;
- latest structured failure detail when present;
- a normalized recent timeline/progress summary when persisted state exists.

It must not require live runtime inspection or live public-access probes to answer the query.

If current read models cannot provide one section safely, the first slice should emit section-level
`unavailable` state rather than blocking the base query.

## Expected Transport Scope

During the Code Round that promotes this behavior to active, add `deployments.show` to:

- [Core Operations](../CORE_OPERATIONS.md) implemented operations table;
- `packages/application/src/operation-catalog.ts`;
- contracts exports;
- HTTP/oRPC route metadata and handlers;
- CLI command registration/help;
- Web query helpers.

Recommended transport shapes:

```text
GET /api/deployments/{deploymentId}
appaloft deployments show <deploymentId> [--json]
```

Do not add the operation to the active catalog until query, schema, handler, service, transport
mapping, entry affordance, and tests are aligned.

## Expected Web Scope

The deployment detail page under `apps/web/src/routes/deployments/[deploymentId]/+page.svelte`
should stop deriving its overview from `deployments.list`.

Code Round should:

- read `deployments.show` for overview/timeline/snapshot sections;
- keep `deployments.logs` as the logs tab query;
- keep current resource health/access on resource pages and link there explicitly;
- label attempt snapshot access separately from current resource access.

## Minimal Deliverable

The minimal Code Round deliverable is:

- application query slice and schema;
- in-memory/fake deployment detail read sources for application tests;
- contracts and operation-catalog entry for `deployments.show`;
- HTTP/oRPC route and client wiring;
- CLI detail command;
- Web deployment detail migration from `deployments.list` to `deployments.show`;
- tests for complete detail, missing deployment, section-level unavailable states, immutable
  snapshot semantics, and entrypoint dispatch.

The first slice may defer:

- rich event-stream reconnect semantics;
- full timeline replay beyond recent normalized summary;
- advanced terminal/deploy-action deep links.

## Required Tests

Required coverage follows [Deployment Detail Test Matrix](../testing/deployments.show-test-matrix.md):

- validation and missing deployment;
- complete detail with immutable attempt snapshot;
- related-context, snapshot, timeline, and failure-summary unavailable branches;
- no hidden write actions;
- Web deployment detail uses `deployments.show`;
- API/oRPC and CLI use the shared query schema/output.

## Migration Seams And Legacy Edges

Current Web deployment detail joins `deployments.list`, `projects.list`, `servers.list`,
`environments.list`, and `resources.list` client-side. That path may remain as a temporary fallback
only while the new query is being introduced in the same Code Round.

`deployments.logs` stays separate and should not be folded into `deployments.show`.

Create-time progress streaming stays transport-specific unless a future Spec Round introduces
`deployments.stream-events` as a public query.

## Current Implementation Notes And Migration Gaps

`deployments.show` is not implemented yet.

Existing product seams that can seed the first implementation:

- deployment list read model already exposes base attempt summary used by Web detail today;
- deployment logs query is active and should remain the log-specific companion query;
- resource diagnostic summary already accepts `deploymentId` and can be linked from deployment
  detail once the new query is active.

## Open Questions

- Should the first `deployments.show` implementation extend the existing deployment list read model,
  or introduce a dedicated detail projection from day one to avoid carrying list-specific shaping
  into the detail contract?
