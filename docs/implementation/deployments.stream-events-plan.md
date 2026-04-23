# Deployment Event Stream Implementation Plan

## Source Of Truth

This document is an implementation-planning contract for `deployments.stream-events`. It does not
replace ADRs, query specs, workflow specs, error specs, or test matrices.

## Governed ADRs

- [ADR-016: Deployment Command Surface Reset](../decisions/ADR-016-deployment-command-surface-reset.md)
- [ADR-029: Deployment Event Stream And Recovery Boundary](../decisions/ADR-029-deployment-event-stream-and-recovery-boundary.md)
- [ADR-013: Project Resource Navigation And Deployment Ownership](../decisions/ADR-013-project-resource-navigation-and-deployment-ownership.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)

## Governed Specs

- [deployments.stream-events Query Spec](../queries/deployments.stream-events.md)
- [Deployment Event Stream Error Spec](../errors/deployments.stream-events.md)
- [Deployment Event Stream Test Matrix](../testing/deployments.stream-events-test-matrix.md)
- [Deployment Detail And Observation Workflow Spec](../workflows/deployment-detail-and-observation.md)
- [deployments.show Query Spec](../queries/deployments.show.md)
- [Core Operations](../CORE_OPERATIONS.md)
- [Domain Model](../DOMAIN_MODEL.md)

## Expected Application Scope

Add a vertical query slice under `packages/application/src/operations/deployments/`:

- `stream-deployment-events.schema.ts`;
- `stream-deployment-events.query.ts`;
- `stream-deployment-events.handler.ts`;
- `stream-deployment-events.query-service.ts`.

Add an injected application port and token for ordered event observation, for example:

- `DeploymentEventObserver` in `packages/application/src/ports.ts`;
- `tokens.deploymentEventObserver` in `packages/application/src/tokens.ts`;
- `tokens.streamDeploymentEventsQueryService` when the service is container-managed.

The query service must:

- validate query input through the shared schema;
- resolve the deployment and visibility boundary;
- build a replay/follow request from `deploymentId`, `cursor`, and history/follow flags;
- normalize domain events and progress projections into the public envelope contract;
- return bounded replay or a stream-capable async iterable without mutating deployment state.

## Expected Read-Model Scope

The first implementation should consume or add a deployment observation source that can provide:

- ordered canonical deployment lifecycle events;
- persisted or safely derived progress/timeline projection envelopes;
- a cursor or sequence that supports replay continuation;
- terminal state visibility so follow mode can close intentionally.

If the current event/progress sources cannot guarantee continuity for one branch, the implementation
must emit a gap/error result rather than silently dropping envelopes.

## Expected Transport Scope

oRPC/HTTP should expose:

- a bounded replay endpoint or procedure for `follow = false`;
- a stream-capable endpoint or procedure for `follow = true`.

CLI should expose:

```text
appaloft deployments events <deploymentId> [--follow] [--cursor <cursor>] [--json]
```

Transports must not invent deployment mutation flags or runtime-log-specific inputs.

## Expected Web Scope

Deployment detail should keep:

- overview/snapshot/summary on `deployments.show`;
- full attempt logs on `deployments.logs`;
- timeline/watch behavior on `deployments.stream-events`.

The Web surface should:

- load a bounded replay when the timeline tab/panel opens;
- follow new envelopes when the user requests live observation;
- resume from cursor after refresh/reconnect when feasible;
- treat normal user stop/navigation as stream cancellation, not as deployment failure.

## Operation Catalog Scope

During Code Round, add `deployments.stream-events` to:

- [Core Operations](../CORE_OPERATIONS.md) implemented operations table;
- `packages/application/src/operation-catalog.ts`;
- contracts exports and stream metadata;
- HTTP/oRPC route metadata and handlers;
- CLI registration/help;
- Web query helpers.

Do not add the operation to the active catalog until query, schema, handler, service, observation
port, transport mapping, and tests are aligned.

## Minimal Deliverable

The minimal Code Round deliverable is:

- application query slice and schema;
- injected deployment event observation port with a fake/in-memory implementation;
- bounded replay and follow-mode transport path;
- Web timeline/watch affordance or a clearly documented Web deferral;
- tests for deployment resolution, ordered replay, cursor continuation, gap/error handling, follow,
  and cancellation.

The first slice may defer:

- projection-rebuild-stable cursor durability beyond the selected first token design;
- cross-process fanout optimization;
- richer recovery commands such as retry/redeploy/rollback.

## Required Tests

Required coverage follows [Deployment Event Stream Test Matrix](../testing/deployments.stream-events-test-matrix.md):

- query validation and cursor handling;
- missing deployment and source-unavailable branches;
- ordered replay and bounded history;
- follow mode, heartbeat, and terminal close behavior;
- gap/error handling without silent event loss;
- CLI/API/Web entry behavior when included in the Code Round;
- explicit separation from `deployments.show` and `deployments.logs`.

## Migration Seams And Legacy Edges

Current deployment observation is split across:

- `deployments.show` for immutable summary;
- `deployments.logs` for rawer attempt logs;
- create-time progress transport tied to `deployments.create`.

The first implementation may adapt the existing progress/timeline projection as one input to the
new query, but it must not keep the long-term public observation contract dependent on the original
command transport remaining open.

## Current Implementation Notes And Migration Gaps

Standalone `deployments.stream-events` is not implemented yet.

Existing product seams that can seed the first slice:

- `deployments.show` already exposes recent timeline/summary data;
- create-time progress transport already emits deployment-phase updates while the initial request is
  alive;
- canonical deployment lifecycle event specs already exist for
  `deployment-requested`, `build-requested`, `deployment-started`,
  `deployment-succeeded`, and `deployment-failed`.

What is still missing is the formal query, cursor/follow contract, and public transport mapping.

## Open Questions

- Should the first cursor token be derived from projection sequence, outbox/event id, or a separate
  deployment-observation checkpoint table?
