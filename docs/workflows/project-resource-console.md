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
- [resources.create Command Spec](../commands/resources.create.md)
- [deployments.create Command Spec](../commands/deployments.create.md)
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
- latest deployment status when available;
- primary navigation to the resource detail page;
- resource-scoped create deployment or redeploy shortcut only when the selected resource can accept it.

Latest deployment status is a read-model/projection field. It must not become a Resource aggregate invariant unless a future ADR promotes it.

## Resource Detail Contract

Resource detail pages must be the primary owner-scoped surface for:

- new deployment;
- redeploy;
- deployment history;
- deployment progress/status;
- source binding and runtime profile setup;
- domain binding and TLS affordances;
- resource-scoped variables or configuration affordances when supported;
- resource lifecycle actions such as archive/update when supported.

Deployment history shown on the resource page must be filtered by `resourceId`.

New deployment from a resource detail page must dispatch `deployments.create` with the resource id, plus allowed attempt overrides or future resource-profile-derived defaults.

## Resource Creation Contract

A dedicated create-resource page or panel may collect:

- project and environment context;
- resource name and kind;
- optional destination placement hint;
- source provider/type draft such as GitHub, Docker image, Dockerfile, Docker Compose, local folder, or workspace commands;
- runtime draft such as install/build/start commands, port, and health check.

Only the minimum resource profile is persisted by `resources.create` until explicit resource source/runtime operations exist.

If the create-resource flow collects source/runtime drafts before those operations exist, it must treat them as workflow draft state and either:

- continue into Quick Deploy and pass them as one-shot deployment attempt overrides; or
- store them only after future resource source/runtime commands are accepted and implemented.

## Sidebar Navigation Contract

The sidebar should model:

```text
Projects
  -> Project A
      -> Resource 1 [latest deployment status]
      -> Resource 2 [latest deployment status]
  -> Project B
      -> Resource 3 [latest deployment status]
```

The sidebar may use a compact resource summary read model. It must not dispatch deployment commands directly without routing through the resource or Quick Deploy workflow boundary.

Resource latest status indicators are informational and must be derived from read models or projections.

## Entry Boundary

Allowed entry differences:

| Entry | Contract |
| --- | --- |
| Project page create resource | Dispatches `resources.create` or navigates to dedicated create-resource flow with project context prefilled. |
| Project page new deployment | Opens Quick Deploy or requires resource selection before deployment admission. |
| Resource page new deployment | Dispatches `deployments.create` with the selected `resourceId` after collecting allowed attempt inputs. |
| Resource page deployment history | Queries deployments filtered by resource. |
| Sidebar resource item | Navigates to resource detail and displays read-model status. |
| Global deployments page | Read-model rollup/filter view, not owner of deployment write actions. |

## Current Implementation Notes And Migration Gaps

Current project detail page has resource listing and a create-resource affordance, but deployment rollups/actions still need an ADR-013 alignment pass.

Current dedicated create-resource page does not yet exist.

Current sidebar does not yet expose Project -> Resource hierarchy with latest deployment status.

Current deployment and resource read models may need a resource summary projection or query shape to support latest deployment status efficiently.

## Open Questions

- Should resource latest deployment status be added to `resources.list`, a future `resources.summary` query, or a separate navigation read model?
- Should the create-resource flow first persist only the minimum resource profile and then continue into Quick Deploy, or should it wait for resource source/runtime commands before collecting source/runtime drafts?
