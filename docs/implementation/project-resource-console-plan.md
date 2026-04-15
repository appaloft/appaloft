# Project Resource Console Implementation Plan

## Source Of Truth

This document is an implementation-planning contract for aligning the Web console with Project -> Resource -> Deployment ownership. It does not replace ADRs, command specs, workflow specs, or testing specs.

## Governed ADRs

- [ADR-013: Project Resource Navigation And Deployment Ownership](../decisions/ADR-013-project-resource-navigation-and-deployment-ownership.md)
- [ADR-011: Resource Create Minimum Lifecycle](../decisions/ADR-011-resource-create-minimum-lifecycle.md)
- [ADR-012: Resource Runtime Profile And Deployment Snapshot Boundary](../decisions/ADR-012-resource-runtime-profile-and-deployment-snapshot-boundary.md)
- [ADR-015: Resource Network Profile](../decisions/ADR-015-resource-network-profile.md)
- [ADR-010: Quick Deploy Workflow Boundary](../decisions/ADR-010-quick-deploy-workflow-boundary.md)
- [ADR-018: Resource Runtime Log Observation](../decisions/ADR-018-resource-runtime-log-observation.md)

## Governed Specs

- [Project Resource Console Workflow Spec](../workflows/project-resource-console.md)
- [Project Resource Console Test Matrix](../testing/project-resource-console-test-matrix.md)
- [resources.create Command Spec](../commands/resources.create.md)
- [deployments.create Command Spec](../commands/deployments.create.md)
- [resources.runtime-logs Query Spec](../queries/resources.runtime-logs.md)
- [Resource Runtime Log Observation Workflow Spec](../workflows/resource-runtime-log-observation.md)
- [Quick Deploy Workflow Spec](../workflows/quick-deploy.md)
- [Resource Create And First Deploy Workflow Spec](../workflows/resources.create-and-first-deploy.md)
- [Core Operations](../CORE_OPERATIONS.md)
- [Domain Model](../DOMAIN_MODEL.md)

## Expected Scope

Expected Web implementation scope:

- project detail page:
  - make resource list the primary body;
  - keep project-level deployment list as a secondary rollup;
  - make project-level new deployment enter Quick Deploy or resource selection;
  - keep create-resource as a primary project-scoped affordance.
- resource detail page:
  - make new deployment/redeploy primary resource-scoped actions;
  - show deployment history filtered by resource;
  - expose resource-scoped domain/TLS actions where available;
  - expose resource runtime logs through `resources.runtime-logs` once the query is active;
  - prepare a future place for source/runtime/network profile configuration.
- create-resource flow:
  - provide a dedicated route or panel for resource creation;
  - use resource language for source/runtime/network drafts;
  - persist resource-owned source/runtime/network profile through `resources.create` when the flow is part of first deploy;
  - optionally continue into Quick Deploy when the user chooses create-and-deploy.
- sidebar:
  - display Project -> Resource hierarchy;
  - show latest deployment status per resource from a read model/projection;
  - navigate to resource detail, not directly to deployment mutation.

Expected application/API/read-model scope:

- reuse `resources.list` where sufficient;
- add a resource summary/query shape only if latest deployment status cannot be derived efficiently in the Web query layer;
- do not mutate write-side Resource state for latest deployment status;
- keep deployment history read queries filtered by `resourceId`.

## Touched Modules And Packages

Likely touched modules in Code Round:

- `apps/web/src/routes/projects/[projectId]/+page.svelte`;
- `apps/web/src/routes/resources/**`;
- `apps/web/src/lib/components/console/**`;
- `apps/web/src/lib/console/queries.ts`;
- `apps/web/src/lib/console/utils.ts`;
- `packages/i18n/src/keys.ts`;
- `packages/i18n/src/locales/en-US.ts`;
- `packages/i18n/src/locales/zh-CN.ts`;
- `packages/orpc` and `packages/contracts` only if a new resource summary query is required;
- `packages/application/src/operation-catalog.ts` only if a new query/operation is introduced.
- `packages/application/src/operations/resources/**` and runtime log reader adapters when
  `resources.runtime-logs` enters Code Round.

## Minimal Deliverable

The minimal Code Round deliverable is:

- project detail page treats resources as the primary list;
- project-level new deployment opens Quick Deploy/resource selection instead of looking project-owned;
- resource detail page exposes deployment history and resource-scoped new deployment action;
- sidebar or navigation uses Project -> Resource hierarchy when the current layout supports it;
- latest deployment status is read-model derived or clearly deferred in migration notes;
- tests or Web checks cover project/resource navigation and resource-owned deployment actions.

## Required Tests

Required coverage follows [Project Resource Console Test Matrix](../testing/project-resource-console-test-matrix.md):

- project page resource-first layout;
- project page deployment rollup remains read-only;
- resource detail new deployment dispatches with `resourceId`;
- resource detail deployment history filters by `resourceId`;
- project-level new deployment enters Quick Deploy or resource selection;
- create-resource and Quick Deploy map generic port fields to `networkProfile.internalPort`;
- sidebar resource status is projection/read-model state.

## Migration Seams And Legacy Edges

Existing project-level deployment UI can remain as a rollup view while resource-first navigation is introduced.

If latest deployment status is not available through a stable read model in the first Code Round, the UI may show a neutral resource state and record the projection gap here.

If a dedicated create-resource route is too large for the first Web Code Round, the existing project-page create-resource affordance may remain, but it must use resource language and should navigate to resource detail after creation when feasible.

Current contracts expose the listener port as `networkProfile.internalPort`, governed by [ADR-015](../decisions/ADR-015-resource-network-profile.md).

Resource runtime logs are governed by [ADR-018](../decisions/ADR-018-resource-runtime-log-observation.md)
and remain future until `resources.runtime-logs` is active in Core Operations and the operation
catalog.

## Current Implementation Notes And Migration Gaps

Project detail has some resource listing and create-resource behavior.

Resource detail and deployment pages have some resource-aware behavior but need review against ADR-013 before being considered aligned.

Sidebar Project -> Resource hierarchy with latest deployment status is not yet implemented.

## Open Questions

- Which read/query shape should own latest deployment status for resource navigation?
- Should create-resource first ship as a project-page affordance plus resource detail redirect, or as a dedicated route in the same Code Round?
