# Project Resource Console Workflow Spec

## Normative Contract

The Web console must present project, resource, and deployment ownership as:

```text
Project
  -> Resource
      -> Deployment history and deployment actions
```

The project surface is a resource collection surface. The resource surface is the owner-scoped deployment and configuration surface.

## Global References

This workflow inherits:

- [ADR-013: Project Resource Navigation And Deployment Ownership](../decisions/ADR-013-project-resource-navigation-and-deployment-ownership.md)
- [ADR-011: Resource Create Minimum Lifecycle](../decisions/ADR-011-resource-create-minimum-lifecycle.md)
- [ADR-012: Resource Runtime Profile And Deployment Snapshot Boundary](../decisions/ADR-012-resource-runtime-profile-and-deployment-snapshot-boundary.md)
- [ADR-015: Resource Network Profile](../decisions/ADR-015-resource-network-profile.md)
- [ADR-018: Resource Runtime Log Observation](../decisions/ADR-018-resource-runtime-log-observation.md)
- [ADR-020: Resource Health Observation](../decisions/ADR-020-resource-health-observation.md)
- [ADR-022: Operator Terminal Session Boundary](../decisions/ADR-022-operator-terminal-session-boundary.md)
- [resources.create Command Spec](../commands/resources.create.md)
- [deployments.create Command Spec](../commands/deployments.create.md)
- [terminal-sessions.open Command Spec](../commands/terminal-sessions.open.md)
- [resources.health Query Spec](../queries/resources.health.md)
- [resources.diagnostic-summary Query Spec](../queries/resources.diagnostic-summary.md)
- [resources.runtime-logs Query Spec](../queries/resources.runtime-logs.md)
- [Resource Diagnostic Summary Workflow Spec](./resource-diagnostic-summary.md)
- [Resource Runtime Log Observation Workflow Spec](./resource-runtime-log-observation.md)
- [Operator Terminal Session Workflow Spec](./operator-terminal-session.md)
- [Quick Deploy Workflow Spec](./quick-deploy.md)
- [Resource Create And First Deploy Workflow Spec](./resources.create-and-first-deploy.md)
- [Project Resource Console Implementation Plan](../implementation/project-resource-console-plan.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)

## Project Detail Contract

Project detail pages must prioritize:

1. Project identity and summary.
2. Resource list for the project.
3. Create resource action.
4. Secondary rollups such as environments, domain bindings, and all deployments for the project.

Project detail pages must not make "new deployment" look like a project-owned command.

If a project detail page offers a "new deployment" affordance, it must be one of:

- a Quick Deploy entry workflow that selects or creates a resource before `deployments.create`; or
- a secondary shortcut that asks the user to choose an existing resource before deployment admission.

Project-level "view deployments" means a read-model rollup of deployments across resources in the project.

## Resource List Contract

Project resource lists must show each resource as the primary child object.

Each resource item should expose:

- resource name;
- resource kind;
- environment context;
- current resource health when available;
- latest deployment status as contextual history only;
- primary navigation to the resource detail page;
- resource-scoped create deployment shortcut only when the selected resource can accept it.

Current resource health and latest deployment status are read-model/projection fields. They must not
become Resource aggregate invariants unless a future ADR promotes them.

## Resource Detail Contract

Resource detail pages must be the primary owner-scoped surface for:

- new deployment;
- future redeploy only after it is reintroduced under ADR-016;
- deployment history;
- deployment progress/status;
- current resource health through `resources.health` when that query/projection exists;
- resource-scoped access URL from ready domain binding or `ResourceAccessSummary`, not only from a
  deployment detail snapshot;
- application runtime logs through `resources.runtime-logs` when an observable runtime instance
  exists;
- resource-scoped terminal access through `terminal-sessions.open` when operator access is enabled
  and a safe deployment workspace can be resolved;
- copyable diagnostic summary through `resources.diagnostic-summary` when support/debug context is
  needed, especially when access, proxy configuration, or runtime logs are empty or unavailable;
- source binding, runtime profile, and network profile setup;
- domain binding and TLS affordances;
- resource-scoped variables or configuration affordances when supported;
- resource lifecycle actions such as archive/update when supported.

Deployment history shown on the resource page must be filtered by `resourceId`.

New deployment from a resource detail page must dispatch `deployments.create` with the resource id and use resource-profile-derived defaults during deployment admission.

## Resource Detail Information Architecture Contract

Resource detail pages are application-first configuration surfaces. The page shell must make the
durable resource understandable before showing historical deployment attempts.

The persistent resource header must be compact and must not become a summary dashboard. It may show:

- resource name;
- resource kind;
- compact current health indicator and refresh affordance;
- one primary resource-scoped lifecycle action such as new deployment when supported.

The persistent resource header must not show these as primary actions:

- open project;
- view deployments;
- open access URL;
- bind domain;
- copy diagnostic summary.

Those actions belong in their owner section: project navigation in breadcrumbs/sidebar, deployment
history in the deployment tab, access URL in the configuration overview, domain binding in the
access/domain section, and diagnostics in the diagnostics/support section.

The first top-level tab must be the resource configuration/overview tab. It must expose the
application's current public access URL, basic profile, network/runtime placement, domain binding,
health policy, and diagnostic affordances through inner section tabs or equivalent nested route
state. The inner navigation must change the right-side content panel; it must not be implemented as
same-page hash anchors that scroll through one long page.
The access URL must be visible on the first/default resource tab when available because it is the
primary application outcome. It must not be hidden only behind a later access tab or a deployment
detail page.

Deployment history, runtime logs, and terminal sessions must be later top-level tabs or operational
sections. They are attempt/runtime/operator observations and must not displace the durable resource
configuration surface as the default application page. Top-level tabs with only one content panel,
such as deployment history or runtime logs, must not render a redundant inner sidebar.

Routine resource-scoped domain binding and TLS creation must be inline in the configuration tab's
access/domain section. A modal may be used only for destructive confirmation, advanced flows, or
rare interruptions, not for the default bind-domain path.

Current health must be compact in the page header. Detailed health policy configuration belongs in
the configuration tab. The UI must not expose internal probe/check names, source error codes, or
transport diagnostics as prominent main content; those details belong in diagnostics/support output
or explicitly expanded debug areas.

## Resource Creation Contract

A dedicated create-resource page or panel may collect:

- project and environment context;
- resource name and kind;
- optional destination placement hint;
- source provider/type draft such as GitHub, Docker image, Dockerfile, Docker Compose, local folder, or workspace commands;
- source variant fields such as Git ref, source base directory, local-folder base directory,
  Docker image tag or digest, artifact extraction root, and provider repository identity;
- runtime draft such as Dockerfile path, Docker Compose file path, static publish directory,
  install/build/start commands, Docker build target, and health check;
- network draft such as internal listener port, upstream protocol, exposure mode, and compose target service.

Resource-owned source/runtime/network profile input may be persisted by `resources.create` when the create flow is part of a first-deploy workflow. Dedicated profile update commands remain future behavior slices.

If the project-scoped create-resource flow collects source/runtime/network drafts before dedicated
update operations exist, it must treat them as resource-owned create input and continue as a
first-deploy workflow:

```text
resources.create
  -> deployments.create(resourceId)
```

This Web entry uses a deploy action after collecting an existing project, environment, server, and
optional destination. It is not labeled as project-level "new deployment" and it does not call
`deployments.create` until `resources.create` returns a resource id.

The create-resource flow must not pass source, runtime, network, route, domain, or TLS fields directly to `deployments.create`.

## Sidebar Navigation Contract

The sidebar should model:

```text
Projects
  -> Project A
      -> Resource 1 [resource health]
      -> Resource 2 [resource health]
  -> Project B
      -> Resource 3 [resource health]
```

The sidebar may use a compact resource summary read model. It must not dispatch deployment commands directly without routing through the resource or Quick Deploy workflow boundary.

Resource health and latest deployment indicators are informational and must be derived from read
models or projections. Sidebar and list current status should use resource health or unknown health,
not latest deployment status.

## Entry Boundary

Allowed entry differences:

| Entry | Contract |
| --- | --- |
| Project page create resource | Navigates to a dedicated project-scoped first-deploy flow with project context prefilled. |
| Project page new deployment | Must not be a direct project-owned write action. If reintroduced, it opens Quick Deploy or requires resource selection before deployment admission. |
| Resource page new deployment | Dispatches `deployments.create` with the selected `resourceId` after collecting allowed attempt inputs. |
| Resource page deployment history | Queries deployments filtered by resource. |
| Resource page health | Queries `resources.health` or reads a compact health projection when available; latest deployment status remains context. |
| Resource page diagnostic summary | Queries `resources.diagnostic-summary` with `resourceId` and optional `deploymentId`; copies structured support/debug context. |
| Resource page terminal | Dispatches `terminal-sessions.open` with resource scope and attaches to the returned terminal transport; starts in the resolved deployment workspace. |
| Sidebar resource item | Navigates to resource detail and displays read-model status. |
| Global deployments page | Read-model rollup/filter view, not owner of deployment write actions. |

## Current Implementation Notes And Migration Gaps

Current project detail page treats resources as the primary list, keeps deployment history as a
rollup, and does not expose a direct project-level new-deployment mutation.

Current dedicated create-resource page collects resource source/runtime/network draft fields plus
server/destination deployment target fields, then sequences `resources.create ->
deployments.create(resourceId)`.

Current contracts store the listener port as `networkProfile.internalPort`, governed by [ADR-015](../decisions/ADR-015-resource-network-profile.md).

Current sidebar exposes a Project -> Resource hierarchy with compact health status derived from
`resources.health`.

Current deployment and resource read models may need a resource summary projection or query shape
to support compact resource health and latest deployment context efficiently.

Resource detail now exposes a first-class copy diagnostic summary affordance backed by
`resources.diagnostic-summary`.

Resource detail now exposes the resource-level access URL from domain binding or access summary
state. The same access URL should not be treated as deployment-owned configuration.

`resources.health` exists. Resource detail and sidebar use unknown only when health is loading or
unobserved, not as a deployment-status fallback.

Resource/server terminal sessions are specified as accepted candidate behavior through
`terminal-sessions.open`, but no Web resource tab/action, server action, command, or terminal
transport exists yet.

Deployment detail and Quick Deploy completion do not yet expose the action directly, so those
surfaces still rely on navigation back to resource detail for the consolidated support payload.

## Open Questions

- Should compact resource health be added to `resources.list`, a future `resources.summary` query,
  or a separate navigation read model?
