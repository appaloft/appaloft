# Project Resource Console Test Matrix

## Normative Contract

Project/resource console tests must verify that the Web information architecture follows resource ownership:

- Project pages list resources as the primary child objects.
- Resource pages own new deployment and deployment history actions.
- Resource pages must not expose redeploy until a future redeploy command is reintroduced under ADR-016.
- Project-level deployment views are read-model rollups.
- Sidebar resource status is read-model/projection state, not write-side Resource aggregate state.

## Global References

This test matrix inherits:

- [ADR-013: Project Resource Navigation And Deployment Ownership](../decisions/ADR-013-project-resource-navigation-and-deployment-ownership.md)
- [ADR-016: Deployment Command Surface Reset](../decisions/ADR-016-deployment-command-surface-reset.md)
- [ADR-015: Resource Network Profile](../decisions/ADR-015-resource-network-profile.md)
- [ADR-018: Resource Runtime Log Observation](../decisions/ADR-018-resource-runtime-log-observation.md)
- [Project Resource Console Workflow Spec](../workflows/project-resource-console.md)
- [Project Resource Console Implementation Plan](../implementation/project-resource-console-plan.md)
- [resources.create Command Spec](../commands/resources.create.md)
- [deployments.create Command Spec](../commands/deployments.create.md)
- [resources.runtime-logs Query Spec](../queries/resources.runtime-logs.md)
- [Resource Runtime Logs Test Matrix](./resource-runtime-logs-test-matrix.md)
- [Quick Deploy Workflow Spec](../workflows/quick-deploy.md)
- [Resource Create And First Deploy Workflow Spec](../workflows/resources.create-and-first-deploy.md)
- [Spec-Driven Testing](./SPEC_DRIVEN_TESTING.md)

## Test Layers

| Layer | Focus |
| --- | --- |
| Web project page | Resource list is primary; create-resource is primary; project deployment rollup is secondary. |
| Web resource page | Resource detail owns deployment actions and deployment history. |
| Web create-resource page | Source/runtime/network drafts use resource language and do not bypass resource commands. |
| Sidebar/navigation | Project nodes expand to resource nodes with latest deployment status projection. |
| Query/read model | Resource summaries expose enough status for lists/navigation without mutating write state. |
| API/oRPC | Entry actions still dispatch command/query contracts rather than UI-local business logic. |

## Given / When / Then Template

```md
Given:
- Project:
- Resources:
- Deployments:
- Latest deployment projection:
- Entry surface:

When:
- The user opens the relevant project/resource/sidebar surface or triggers an action.

Then:
- Primary objects displayed:
- Command/query dispatched:
- Navigation target:
- Expected status/projection:
- Expected absence of project-owned deployment mutation:
```

## Project Page Matrix

| Case | Input/read state | Expected primary UI result | Expected command/query behavior | Expected absence |
| --- | --- | --- | --- | --- |
| Project with resources | Project has multiple resources | Resource list is prominent; each resource links to detail | `resources.list` filtered by project/environment context or equivalent query | No direct project-owned deployment mutation |
| Project with no resources | Project has environments but no resources | Empty resource state plus create-resource/deploy action | Create action navigates to project-scoped create-resource first-deploy flow | No hidden `deployments.create(resource)` bootstrap as primary path |
| Project all deployments | Project has deployments across resources | Project deployment view is labeled as rollup/all deployments | Deployment query filters by project and displays resource context | No new deployment command without resource selection |
| Project new deployment shortcut | User clicks project-level shortcut | Opens Quick Deploy or resource selection | Workflow eventually selects/creates resource before `deployments.create` | No direct project-owned deployment command |

## Resource Page Matrix

| Case | Input/read state | Expected primary UI result | Expected command/query behavior | Expected state/projection |
| --- | --- | --- | --- | --- |
| Resource detail | Resource exists | Resource profile, latest status, and deployment history are shown | Resource query/read model plus deployment history filtered by `resourceId` | Latest status derived from deployments |
| New deployment from resource | Resource exists and can deploy | New deployment action is resource-scoped | Dispatch `deployments.create` with `resourceId` | Deployment attempt belongs to resource |
| Runtime logs from resource | Resource has observable runtime instance | Runtime logs are shown as resource-owned application logs | Query `resources.runtime-logs` with `resourceId`; optional follow stream | Runtime logs remain separate from `deployments.logs` |
| Redeploy absent in v1 | Latest deployment terminal | No public redeploy action is exposed | No redeploy command is dispatched | Existing deployments remain readable |
| Active deployment | Latest deployment non-terminal | New deployment is blocked or explains active state | No deployment command until guard can pass | Latest status remains read-model projection |
| Domain binding from resource | Resource has placement context | Domain/TLS action preloads resource context | Dispatch `domain-bindings.create` with resource ownership fields | Domain binding belongs to resource |

## Create Resource Matrix

| Case | Draft input | Expected command sequence | Expected state |
| --- | --- | --- | --- |
| Minimum resource | Project, environment, name | `resources.create` | Resource profile persisted |
| Source/runtime/network draft | Project, environment, name, GitHub/Docker/Dockerfile/Compose/runtime draft, internal listener port | `resources.create` as part of first-deploy workflow | Resource profile persisted with source/runtime/network profile when supplied; deployment uses `resourceId` |
| Generic port field | User enters application port on create-resource page | `resources.create(networkProfile.internalPort)` | Port is stored as resource network profile input, not deployment input |
| Project-scoped deploy action | Project, environment, source/runtime/network draft, server, optional destination | `resources.create -> deployments.create(resourceId)` | Resource persists first; deployment is accepted or rejected by deployment command |
| Continue into first deploy | Resource draft plus deploy intent | `resources.create -> deployments.create(resourceId)` | Resource exists; deployment accepted or rejected by deployment command |

## Sidebar Matrix

| Case | Read model state | Expected navigation result | Expected status behavior |
| --- | --- | --- | --- |
| Project with resources | Project and resources exist | Sidebar shows project group with resource children | Resource child status comes from latest deployment projection |
| No deployment yet | Resource has no deployments | Resource child shows neutral/no-deployment state | No inferred failed/succeeded state |
| Latest deployment running | Latest deployment for resource non-terminal | Resource child shows running/pending state | Status is informational only |
| Latest deployment failed | Latest deployment terminal failed | Resource child shows failed state and links to resource/deployment context | No write-side mutation from navigation |

## Current Implementation Notes And Migration Gaps

Project detail currently has some resource list and create-resource behavior, but the full ADR-013 project/resource/deployment hierarchy is not yet complete.

Resource detail and deployment pages already have some resource-aware behavior, but deployment history and primary actions should be reviewed against this matrix during the next Web Code Round.

Sidebar Project -> Resource hierarchy with latest deployment status is not yet implemented.

Current contracts expose listener port as `networkProfile.internalPort`, governed by [ADR-015](../decisions/ADR-015-resource-network-profile.md).

## Open Questions

- Which read model should own latest deployment status for resource navigation?
- Should dedicated create-resource flow immediately offer a "create and deploy" continuation before dedicated resource source/runtime/network update commands exist?
