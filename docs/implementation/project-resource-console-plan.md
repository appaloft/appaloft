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
- [ADR-020: Resource Health Observation](../decisions/ADR-020-resource-health-observation.md)
- [ADR-022: Operator Terminal Session Boundary](../decisions/ADR-022-operator-terminal-session-boundary.md)

## Governed Specs

- [Project Resource Console Workflow Spec](../workflows/project-resource-console.md)
- [Project Resource Console Test Matrix](../testing/project-resource-console-test-matrix.md)
- [resources.create Command Spec](../commands/resources.create.md)
- [deployments.create Command Spec](../commands/deployments.create.md)
- [resources.health Query Spec](../queries/resources.health.md)
- [resources.diagnostic-summary Query Spec](../queries/resources.diagnostic-summary.md)
- [resources.runtime-logs Query Spec](../queries/resources.runtime-logs.md)
- [Resource Diagnostic Summary Workflow Spec](../workflows/resource-diagnostic-summary.md)
- [Resource Health Observation Workflow Spec](../workflows/resource-health-observation.md)
- [Resource Runtime Log Observation Workflow Spec](../workflows/resource-runtime-log-observation.md)
- [Operator Terminal Session Workflow Spec](../workflows/operator-terminal-session.md)
- [terminal-sessions.open Command Spec](../commands/terminal-sessions.open.md)
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
  - make the first top-level tab the resource configuration/overview surface;
  - make configuration subsections use nested tab/route state that replaces the right-side content
    panel, not hash-anchor jumps through one long page;
  - omit inner sidebars from top-level tabs that have only one content panel, including deployment
    history and runtime logs;
  - keep the persistent header compact with resource name/kind, compact health, and the primary
    resource-scoped lifecycle action only;
  - keep navigation or section actions such as open project, view deployments, open access URL,
    bind domain, and diagnostic copy out of the header action cluster;
  - make new deployment the primary resource-scoped lifecycle action;
  - show deployment history filtered by resource;
  - expose resource-scoped domain/TLS creation inline in the configuration/access section, not as
    the normal modal path;
  - show resource-scoped access URL from domain binding or `ResourceAccessSummary`, not only from
    deployment detail snapshots, and make it visible on the first/default resource tab;
  - prepare current resource health display through `resources.health` or a compact health projection;
  - expose resource runtime logs through `resources.runtime-logs` once the query is active;
  - reserve resource terminal access for a later operational tab/action backed by
    `terminal-sessions.open`;
  - expose a copyable diagnostic summary through `resources.diagnostic-summary` once the query is
    active;
  - prepare a future place for source/runtime/network profile configuration.
- create-resource flow:
  - provide a dedicated route or panel for resource creation;
  - use resource language for source/runtime/network drafts;
  - persist resource-owned source/runtime/network profile through `resources.create` when the flow is part of first deploy;
  - submit through a deploy action that sequences `resources.create -> deployments.create(resourceId)`
    with the selected existing project, environment, server, and optional destination.
- sidebar:
  - display Project -> Resource hierarchy;
  - show compact resource health per resource when available, with latest deployment status only
    as migration fallback/context;
  - navigate to resource detail, not directly to deployment mutation.

Expected application/API/read-model scope:

- reuse `resources.list` where sufficient;
- add a resource summary/query shape if compact resource health and latest deployment context
  cannot be derived efficiently in the Web query layer;
- add a resource health summary/query shape before treating sidebar/list status as current health;
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
- terminal session modules listed in
  [Operator Terminal Session Implementation Plan](./operator-terminal-session-plan.md) when
  `terminal-sessions.open` enters Code Round.

## Minimal Deliverable

The minimal Code Round deliverable is:

- project detail page treats resources as the primary list;
- project-level new deployment is absent or opens Quick Deploy/resource selection instead of looking
  project-owned;
- project-scoped create-resource flow can create the resource and immediately create the first
  deployment with the returned `resourceId`;
- resource detail page exposes deployment history and resource-scoped new deployment action;
- resource detail defaults to configuration/overview, not deployment history;
- resource detail header exposes compact health plus the primary resource action only;
- sidebar or navigation uses Project -> Resource hierarchy when the current layout supports it;
- resource-level access URL appears on resource detail when resource access summary or domain
  binding state is available and is visible on the first/default tab;
- resource-scoped domain binding is available as an inline configuration form;
- compact resource health is read-model derived or clearly deferred in migration notes;
- latest deployment status is read-model derived and clearly contextual only;
- tests or Web checks cover project/resource navigation and resource-owned deployment actions.

## Required Tests

Required coverage follows [Project Resource Console Test Matrix](../testing/project-resource-console-test-matrix.md):

- project page resource-first layout;
- project page deployment rollup remains read-only;
- resource detail new deployment dispatches with `resourceId`;
- resource detail deployment history filters by `resourceId`;
- resource detail defaults to configuration/overview and puts deployments/logs behind later tabs;
- resource detail configuration subsection navigation changes the rendered content panel and URL
  state without hash-anchor jumps;
- resource detail deployment/log tabs do not show a redundant inner sidebar when they contain only
  one panel;
- resource detail header omits open-project, view-deployments, open-access, bind-domain, and
  diagnostic-copy primary buttons;
- resource detail domain binding form is inline inside the resource configuration surface;
- resource detail copy diagnostic summary calls `resources.diagnostic-summary` and copies stable
  ids/source errors;
- project-level new deployment enters Quick Deploy or resource selection;
- project-scoped create-resource deploy action sequences `resources.create ->
  deployments.create(resourceId)`;
- create-resource and Quick Deploy map generic port fields to `networkProfile.internalPort`;
- create-resource and Quick Deploy map health-check fields to `runtimeProfile.healthCheck`;
- sidebar resource status is projection/read-model state.
- resource detail access URL uses resource access summary/domain binding state.
- sidebar/resource status prefers resource health projection when available.

## Migration Seams And Legacy Edges

Existing project-level deployment UI can remain as a rollup view while resource-first navigation is introduced.

Compact resource health is available through `resources.health`; project resource lists and sidebar
navigation should use `ResourceHealthSummary.overall` instead of latest deployment status.

If a dedicated create-resource route is too large for the first Web Code Round, the existing project-page create-resource affordance may remain, but it must use resource language and should navigate to resource detail after creation when feasible.

Current contracts expose the listener port as `networkProfile.internalPort`, governed by [ADR-015](../decisions/ADR-015-resource-network-profile.md).

Create-resource and Quick Deploy expose first-deploy HTTP health check policy fields and persist
them on `ResourceRuntimeProfile.healthCheck`. Dedicated update/configuration commands for existing
resources remain future resource lifecycle work.

Resource runtime logs are governed by [ADR-018](../decisions/ADR-018-resource-runtime-log-observation.md)
and remain future until `resources.runtime-logs` is active in Core Operations and the operation
catalog.

Resource diagnostic summary is governed by
[Resource Diagnostic Summary](../workflows/resource-diagnostic-summary.md). Resource detail now
exposes the copy affordance backed by the active `resources.diagnostic-summary` query.

Resource health is governed by [Resource Health Observation](../workflows/resource-health-observation.md).
`resources.health` is active. Latest deployment status is only contextual deployment history and
must not be described as current health.

Resource/server terminal sessions are governed by
[ADR-022](../decisions/ADR-022-operator-terminal-session-boundary.md) and remain future until
`terminal-sessions.open`, the terminal transport, CLI command, and Web affordances are implemented.

## Current Implementation Notes And Migration Gaps

Project detail has some resource listing and create-resource behavior.

Resource detail and deployment pages have some resource-aware behavior but need review against ADR-013 before being considered fully aligned.

Sidebar Project -> Resource hierarchy uses compact `resources.health` queries. The current
projection is cached/read-model derived; live probes remain future resource-health work.

Resource detail exposes the diagnostic summary copy affordance. Deployment detail and Quick Deploy
completion do not yet expose the action directly.

Resource detail exposes the resource-level access URL from domain binding or access summary state.
The access URL should be visible on the first/default resource tab and must not be duplicated as a
header primary action.

Resource/server terminal UI is not implemented yet.

## Open Questions

- Which read/query shape should own compact resource health and latest deployment context for
  resource navigation?
- Should create-resource first ship as a project-page affordance plus resource detail redirect, or as a dedicated route in the same Code Round?
