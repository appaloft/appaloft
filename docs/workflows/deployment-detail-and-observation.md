# Deployment Detail And Observation Workflow Spec

## Normative Contract

Deployment detail is a read workflow for inspecting one immutable deployment attempt without
reintroducing deployment-owned write behaviors removed by [ADR-016](../decisions/ADR-016-deployment-command-surface-reset.md).

The workflow is:

```text
deployment history or deep link
  -> deployments.show
  -> deployments.logs for full attempt logs
  -> optional create-time progress reconnect
  -> optional resource health / diagnostic summary follow-up
```

The workflow must keep these boundaries explicit:

- deployment attempt detail belongs to `deployments.show`;
- deployment attempt logs belong to `deployments.logs`;
- current resource health belongs to `resources.health`;
- support/debug copy belongs to `resources.diagnostic-summary`;
- runtime application logs belong to `resources.runtime-logs`.

## Global References

This workflow inherits:

- [ADR-013: Project Resource Navigation And Deployment Ownership](../decisions/ADR-013-project-resource-navigation-and-deployment-ownership.md)
- [ADR-016: Deployment Command Surface Reset](../decisions/ADR-016-deployment-command-surface-reset.md)
- [ADR-017: Default Access Domain And Proxy Routing](../decisions/ADR-017-default-access-domain-and-proxy-routing.md)
- [deployments.show Query Spec](../queries/deployments.show.md)
- [deployments.create Command Spec](../commands/deployments.create.md)
- [resources.health Query Spec](../queries/resources.health.md)
- [resources.diagnostic-summary Query Spec](../queries/resources.diagnostic-summary.md)
- [resources.runtime-logs Query Spec](../queries/resources.runtime-logs.md)
- [Project Resource Console Workflow Spec](./project-resource-console.md)
- [Quick Deploy Workflow Spec](./quick-deploy.md)
- [Deployment Detail Test Matrix](../testing/deployments.show-test-matrix.md)
- [Deployment Detail Error Spec](../errors/deployments.show.md)
- [Deployment Detail Implementation Plan](../implementation/deployments.show-plan.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)

## Workflow Position

Deployment detail is a secondary owner surface under the resource-first model:

```text
Project
  -> Resource
      -> Deployment history
          -> Deployment detail
```

Resource pages remain the owner of:

- new deployment;
- current health;
- current access URL;
- runtime logs;
- current profile configuration.

Deployment detail owns:

- immutable attempt context;
- attempt lifecycle/timeline summary;
- attempt-specific route snapshot/history;
- attempt-specific logs;
- navigation to related resource/project/environment/server context.

## Main Flow

1. User opens deployment history from a resource page, project rollup, Quick Deploy completion, or
   a direct deployment link.
2. The entrypoint resolves `deployments.show`.
3. The surface renders:
   - deployment identity and status;
   - immutable attempt snapshot;
   - related resource/project/environment/server context;
   - latest failure/progress summary when present.
4. The logs tab or companion action resolves `deployments.logs`.
5. The user may navigate to:
   - resource detail for current health and access;
   - diagnostic summary for support/debug context;
   - resource runtime logs when current runtime observation is needed.

## Read Ownership Rules

Deployment detail must show the route snapshot used by that attempt.

It must not claim that the attempt snapshot is the current route if:

- the resource now serves a newer generated route;
- a ready durable custom domain now takes precedence;
- server-applied config domains now differ from the attempt snapshot;
- the resource is currently unhealthy although the deployment succeeded.

The deployment page may show both:

- `attempt access snapshot`; and
- a link to current resource access/health.

The page must label these separately.

## Progress And Timeline Rules

The create-time progress stream remains tied to `deployments.create`.

Deployment detail may reconnect to a transport-specific progress source only as a read/observe
continuation for an already accepted deployment attempt. That reconnect path must not become a
hidden business query unless a future `deployments.stream-events` operation is specified and added
to the public catalog.

The first formal deployment detail query should therefore prefer persisted or safely derived
timeline/progress summary over mandatory live streaming.

## Allowed And Forbidden Affordances

Allowed on deployment detail:

- open logs tab;
- copy deployment id or related context ids;
- deep-link to resource detail;
- open diagnostic summary with `resourceId` and optional `deploymentId`;
- open resource runtime logs when the current runtime instance is still relevant;
- open create-time progress dialog for the same accepted deployment.

Forbidden until later specs reintroduce them:

- retry deployment;
- redeploy resource;
- cancel deployment;
- rollback deployment;
- deployment-owned health check action.

## Entrypoint Contract

| Entrypoint | Contract |
| --- | --- |
| Web deployment detail page | Uses `deployments.show` for overview/timeline/snapshot, `deployments.logs` for logs, and companion resource queries for current state. |
| CLI detail command | Prints canonical deployment detail JSON or concise human summary from `deployments.show`; may request `deployments.logs` separately. |
| HTTP/oRPC | Returns `DeploymentDetail` from the shared query schema and keeps logs as a separate endpoint. |
| Quick Deploy completion | May deep-link to deployment detail after acceptance; must not bypass the shared query contract. |

## Current Implementation Notes And Migration Gaps

Current Web deployment detail reads `deployments.list` as a rollup source and joins project,
environment, resource, and server lists client-side. That is a temporary migration seam.

Current logs and progress affordances already exist, but they are not anchored by a first-class
deployment-detail query.

`deployments.show` is the accepted candidate that closes this gap before any future
`deployments.stream-events`, retry, or rollback behavior is considered.

## Open Questions

- Should the first `deployments.show` slice include an explicit `currentResourceState` summary
  field, or should deployment detail always force a separate resource query when users need current
  health/access instead of historical attempt context?
