# Resource Create And First Deploy Workflow Spec

## Normative Contract

Resource creation and first deployment are two explicit business operations.

`resources.create` creates the durable resource profile. `deployments.create` creates the deployment attempt.

```text
resources.create
  -> resource-created
  -> deployments.create(resourceId)
```

The workflow may be used by Quick Deploy, CLI interactive deploy, API clients, automation, and future MCP tools. Entry points may collect input differently, but they must not collapse resource creation and deployment admission into one hidden command.

## Global References

This workflow inherits:

- [ADR-011: Resource Create Minimum Lifecycle](../decisions/ADR-011-resource-create-minimum-lifecycle.md)
- [ADR-010: Quick Deploy Workflow Boundary](../decisions/ADR-010-quick-deploy-workflow-boundary.md)
- [ADR-012: Resource Runtime Profile And Deployment Snapshot Boundary](../decisions/ADR-012-resource-runtime-profile-and-deployment-snapshot-boundary.md)
- [ADR-013: Project Resource Navigation And Deployment Ownership](../decisions/ADR-013-project-resource-navigation-and-deployment-ownership.md)
- [ADR-014: Deployment Admission Uses Resource Profile](../decisions/ADR-014-deployment-admission-uses-resource-profile.md)
- [ADR-015: Resource Network Profile](../decisions/ADR-015-resource-network-profile.md)
- [ADR-017: Default Access Domain And Proxy Routing](../decisions/ADR-017-default-access-domain-and-proxy-routing.md)
- [resources.create Command Spec](../commands/resources.create.md)
- [resource-created Event Spec](../events/resource-created.md)
- [Resource Lifecycle Error Spec](../errors/resources.lifecycle.md)
- [deployments.create Command Spec](../commands/deployments.create.md)
- [Quick Deploy Workflow Spec](./quick-deploy.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)

## End-To-End Workflow

```text
user or automation intent
  -> collect/select project
  -> collect/select environment
  -> collect optional destination
  -> collect resource profile, source binding, runtime profile, and network profile
  -> resources.create
  -> observe resource id/read model
  -> deployments.create(resourceId)
  -> observe deployment progress/read model
```

`resources.create` success is complete when resource state is persisted. Deployment still requires `deployments.create`.

Source binding, runtime profile, and network profile are resource-owned inputs for first-deploy resource creation. Generated default access is resolved from platform policy, server/proxy readiness, and resource network state during deployment planning/execution. Durable custom domain/TLS defaults remain separate domain binding and certificate concerns.

The workflow must distinguish source selection from runtime planning. A selected source locator or source descriptor identifies what will be deployed. A runtime plan strategy describes how that source should be planned. The compatibility input name `deploymentMethod` may exist only at CLI/UI entry boundaries and must map to resource `RuntimePlanStrategy` before `resources.create`.

The workflow must distinguish the resource internal listener port from host exposure. A collected application "port" is `ResourceNetworkProfile.internalPort`. It is not `deployments.create.port`, and it is not a server host-published port unless an explicit `direct-port` exposure mode is accepted.

When generated default access policy is enabled, the first deployment may produce a provider-neutral generated access URL. The workflow displays it through `ResourceAccessSummary` after route snapshot/read-model state exists; it does not collect generated-domain provider settings during resource creation.

## Entry Differences

| Entrypoint | Contract |
| --- | --- |
| Web resource page | May create a resource from a project/environment context, then show the resource detail page. |
| Web project page | Must treat resource list and create-resource as primary. New deployment from a project page must enter Quick Deploy or another entry workflow that selects or creates a resource before deployment admission. |
| Web resource detail page | Owns resource-scoped new deployment, deployment history, source/runtime configuration, and domain/TLS affordances. Redeploy is absent until reintroduced under ADR-016. |
| Web QuickDeploy | May collect a resource draft and call `resources.create` before `deployments.create`. |
| CLI resource command | Must dispatch `resources.create` for explicit resource creation. |
| CLI interactive deploy | May call `resources.create` before `deployments.create` when the user chooses a new resource. |
| HTTP API | Must use `POST /api/resources` for explicit resource creation and `POST /api/deployments` for deployment. |
| Automation/MCP | Must sequence explicit operations unless a future durable workflow command is accepted by ADR. |

## State And Event Points

| Stage | Owner | Event/state |
| --- | --- | --- |
| Resource accepted | `resources.create` | Resource aggregate persisted; `resource-created` recorded. |
| Resource observable | resource read model | Resource appears in `resources.list` or future `resources.show`. |
| Deployment accepted | `deployments.create` | Deployment state exists; `deployment-requested` recorded. |
| Deployment progresses | deployment process manager/runtime | Deployment async lifecycle events and status. |

## Failure Semantics

`resources.create` failure means no resource should be created.

If `resources.create` succeeds and `deployments.create` later fails admission, the resource remains created. The caller may retry deployment with the returned `resourceId`.

If `deployments.create` succeeds and runtime execution later fails, the resource remains created and the deployment records terminal failed state.

Quick Deploy must surface which step failed rather than presenting the whole flow as one atomic operation.

## Compatibility Path

`deployments.create.resource` is a migration compatibility path for legacy/default deployment bootstrap.

After `resources.create` is implemented, Web QuickDeploy and CLI interactive deploy must prefer:

```text
resources.create
  -> deployments.create(resourceId)
```

Compatibility use of `deployments.create.resource` must remain documented in migration notes until callers are migrated.

## Current Implementation Notes And Migration Gaps

Current deployment bootstrap can create resources during `deployments.create` admission.

Current Web QuickDeploy and CLI interactive deploy create/select a resource explicitly when project and environment context is available, then pass `resourceId` to `deployments.create`.

Deployment bootstrap remains available only where it is explicitly treated as first-class bootstrap behavior, not as a compatibility alias for resource creation.

Deployment source/runtime/network values now belong to `resources.create` input in new first-deploy flows. Any remaining deployment bootstrap paths must be reviewed and either removed or documented as explicit bootstrap behavior.

Current CLI entry code still exposes `--method` as a user-facing compatibility option. It maps to resource `RuntimePlanStrategy` before `resources.create`; it must not reach `deployments.create`.

Current Web/CLI entry code may expose generic port wording, but it must dispatch `networkProfile.internalPort` as governed by [ADR-015](../decisions/ADR-015-resource-network-profile.md).

Generated default access route display and route snapshot persistence are governed by [ADR-017](../decisions/ADR-017-default-access-domain-and-proxy-routing.md) and are not yet implemented as the first-class `ResourceAccessSummary` read-model surface.

Current Web project detail still needs a fuller ADR-013 alignment pass: resource list should become
the primary page body, project-level deployment actions should become secondary rollups or Quick
Deploy entrypoints, and resource detail should own deployment history/actions.

## Open Questions

- Exact operation names for resource source binding, runtime profile, network profile, and access profile configuration remain open under [ADR-012](../decisions/ADR-012-resource-runtime-profile-and-deployment-snapshot-boundary.md) and [ADR-015](../decisions/ADR-015-resource-network-profile.md).
