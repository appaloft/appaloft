# Deployment Detail And Observation Workflow Spec

## Normative Contract

Deployment detail is a read workflow for inspecting one immutable deployment attempt without
reintroducing deployment-owned write behaviors removed by [ADR-016](../decisions/ADR-016-deployment-command-surface-reset.md).

The workflow is:

```text
deployment history or deep link
  -> deployments.show
  -> deployments.timeline for bounded journal replay
  -> deployments.timeline.stream for live follow/reconnect
  -> log view as a filter over timeline entries
  -> optional create-time progress display for the original deployment command request
  -> optional resource health / diagnostic summary follow-up
```

The workflow must keep these boundaries explicit:

- deployment attempt detail belongs to `deployments.show`;
- deployment attempt observation belongs to `deployments.timeline` and
  `deployments.timeline.stream`;
- deployment attempt logs are a filtered view over timeline entries;
- current resource health belongs to `resources.health`;
- support/debug copy belongs to `resources.diagnostic-summary`;
- runtime application logs belong to `resources.runtime-logs`.

## Global References

This workflow inherits:

- [ADR-013: Project Resource Navigation And Deployment Ownership](../decisions/ADR-013-project-resource-navigation-and-deployment-ownership.md)
- [ADR-016: Deployment Command Surface Reset](../decisions/ADR-016-deployment-command-surface-reset.md)
- [ADR-017: Default Access Domain And Proxy Routing](../decisions/ADR-017-default-access-domain-and-proxy-routing.md)
- [ADR-084: Deployment Timeline Journal Boundary](../decisions/ADR-084-deployment-timeline-journal-boundary.md)
- [deployments.show Query Spec](../queries/deployments.show.md)
- [deployments.timeline Query Spec](../queries/deployments.timeline.md)
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
- attempt-specific timeline/log views;
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
4. The timeline/watch surface resolves `deployments.timeline` for bounded replay and
   `deployments.timeline.stream` for optional live follow.
5. The logs tab or companion action filters the same timeline journal entries to output/log-like
   kinds.
6. The user may navigate to:
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

The create-time progress stream remains tied to `deployments.create` until an accepted deployment
id exists.

`deployments.timeline` and `deployments.timeline.stream` are the active standalone observation
boundaries for replay/follow timeline behavior. Deployment detail and watch-style entrypoints use
the journal after acceptance instead of depending on the original command transport staying open.

`deployments.show` should therefore keep immutable detail and recent summary, while
`deployments.timeline` owns replay/follow semantics and cursor-based reconnect.

## Allowed And Forbidden Affordances

Allowed on deployment detail:

- open timeline/watch tab backed by `deployments.timeline` and `deployments.timeline.stream`;
- open logs tab backed by timeline filters;
- copy deployment id or related context ids;
- deep-link to resource detail;
- open diagnostic summary with `resourceId` and optional `deploymentId`;
- open resource runtime logs when the current runtime instance is still relevant;
- open create-time progress dialog for the same accepted deployment.
- open recovery readiness and active retry/redeploy/rollback actions only when derived from
  `deployments.recovery-readiness` and the corresponding operation catalog entry is active.

Forbidden until later specs reintroduce them:

- cancel deployment;
- deployment-owned health check action.

## Entrypoint Contract

| Entrypoint | Contract |
| --- | --- |
| Web deployment detail page | Uses `deployments.show` for overview/snapshot and `deployments.timeline` plus `deployments.timeline.stream` for timeline/watch/log views. |
| CLI detail command | Prints canonical deployment detail JSON or concise human summary from `deployments.show`; CLI watch/log modes use timeline queries with filters. |
| HTTP/oRPC | Returns `DeploymentDetail` from the shared detail query and exposes timeline read/follow as the standalone observation stream. |
| Quick Deploy completion | May deep-link to deployment detail after acceptance and hand off watch behavior to `deployments.timeline.stream`; it must not depend forever on the original create-time transport. |

## Current Implementation Notes And Migration Gaps

ADR-084 selects the Deployment Timeline Journal as the target state. Current code still needs a
Code Round to replace legacy `deployments.stream-events` and `deployments.logs` calls with
timeline queries.
Public active-attempt cancellation is separately governed by `deployments.cancel`.

Create-time progress remains a request-local affordance for `deployments.create`; it is no longer
the standalone observation boundary after command acceptance.

## Open Questions

- None for the observation boundary. Public deployment cancel is governed separately by
  [deployments.cancel](../commands/deployments.cancel.md).
