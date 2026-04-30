# Deployment Plan Preview Implementation Plan

## Source Of Truth

This document plans the Code Round for active query `deployments.plan`. It does not replace ADRs,
query specs, workflow specs, error specs, or test matrices.

## Governed Sources

- [Deployment Plan Preview Spec](../specs/013-deployment-plan-preview/spec.md)
- [deployments.plan Query Spec](../queries/deployments.plan.md)
- [Deployment Plan Preview Error Spec](../errors/deployments.plan.md)
- [Deployment Plan Preview Test Matrix](../testing/deployment-plan-preview-test-matrix.md)
- [Workload Framework Detection And Planning](../workflows/workload-framework-detection-and-planning.md)
- [Deployment Runtime Substrate Plan](./deployment-runtime-substrate-plan.md)
- ADR-012, ADR-014, ADR-016, ADR-021, ADR-023

## Expected Implementation Shape

- Add an application query slice under `packages/application/src/operations/deployments`.
- Share runtime plan resolution/source inspection with `deployments.create`, but stop before
  attempt creation and execution.
- Return provider-neutral DTOs for source evidence, planner, artifact, command specs, network,
  health, access, warnings, unsupported reasons, and next actions.
- Register the query through `packages/application/src/operation-catalog.ts` and shell DI tokens.
- Add HTTP/oRPC route and typed client/helper.
- Add CLI `appaloft deployments plan`.
- Add a Web read-only preview affordance with i18n and docs help links.
- Add public docs/help registry entry for `deployment-plan-preview`.

## Non-Implementation Requirements

- No persistence migration is expected for the first slice.
- No deployment events should be emitted.
- No runtime adapter execution should occur.
- No retry/redeploy/rollback/cancel behavior should be added.
- No source/runtime/network fields should be added to `deployments.create`.

## Required Tests

Minimum targeted tests:

- `DPP-QUERY-001` through `DPP-QUERY-008`
- `DPP-SIDE-EFFECT-001` through `DPP-SIDE-EFFECT-004`
- `DPP-HTTP-001`
- `DPP-CLI-001` and `DPP-CLI-002`
- `DPP-WEB-001` where Web surface is included

## Current Implementation Notes And Migration Gaps

The active slice reuses the same source detection, deployment snapshot, runtime-plan input builder,
runtime plan resolver, runtime target backend registry, durable domain bindings, and server-applied
route desired-state readers used by deployment creation. It intentionally stops before deployment
attempt creation, deployment lifecycle event publication, runtime apply/verify work, and proxy
realization.

Remaining migration gaps:

- Some planning assembly helpers still duplicate `deployments.create` helper logic; extract a shared
  previewable planning service before broadening framework support further.
- Automated coverage currently proves operation catalog, entrypoint/docs/help wiring, type
  contracts, and Web read-only affordance wiring. Deeper fixture-level query-service tests for
  `DPP-QUERY-001` through `DPP-QUERY-008` and side-effect repository assertions remain required
  before treating the matrix as fully closed.
- Pre-plan validation failures such as missing source binding, missing internal port, static output
  gaps, and planner rejection currently surface through the shared domain error contract. A later
  refinement should convert those known planning failures into blocked preview DTOs with populated
  `unsupportedReasons` while preserving stable error codes for transport failures.
- Access plan summaries are limited to already available durable domain binding or server-applied
  route desired state. Draft access preview before a resource is persisted remains deferred.
