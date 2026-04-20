# Project Resource Console Test Matrix

## Normative Contract

Project/resource console tests must verify that the Web information architecture follows resource ownership:

- Project pages list resources as the primary child objects.
- Resource pages own new deployment and deployment history actions.
- Resource pages must not expose redeploy until a future redeploy command is reintroduced under ADR-016.
- Project-level deployment views are read-model rollups.
- Sidebar/resource status is current resource health when available; latest deployment status is
  contextual history or migration fallback, not write-side Resource aggregate state.

## Global References

This test matrix inherits:

- [ADR-013: Project Resource Navigation And Deployment Ownership](../decisions/ADR-013-project-resource-navigation-and-deployment-ownership.md)
- [ADR-016: Deployment Command Surface Reset](../decisions/ADR-016-deployment-command-surface-reset.md)
- [ADR-015: Resource Network Profile](../decisions/ADR-015-resource-network-profile.md)
- [ADR-018: Resource Runtime Log Observation](../decisions/ADR-018-resource-runtime-log-observation.md)
- [ADR-020: Resource Health Observation](../decisions/ADR-020-resource-health-observation.md)
- [ADR-022: Operator Terminal Session Boundary](../decisions/ADR-022-operator-terminal-session-boundary.md)
- [Project Resource Console Workflow Spec](../workflows/project-resource-console.md)
- [Project Resource Console Implementation Plan](../implementation/project-resource-console-plan.md)
- [resources.create Command Spec](../commands/resources.create.md)
- [deployments.create Command Spec](../commands/deployments.create.md)
- [resources.diagnostic-summary Query Spec](../queries/resources.diagnostic-summary.md)
- [resources.health Query Spec](../queries/resources.health.md)
- [resources.runtime-logs Query Spec](../queries/resources.runtime-logs.md)
- [terminal-sessions.open Command Spec](../commands/terminal-sessions.open.md)
- [Resource Diagnostic Summary Test Matrix](./resource-diagnostic-summary-test-matrix.md)
- [Resource Health Test Matrix](./resource-health-test-matrix.md)
- [Resource Runtime Logs Test Matrix](./resource-runtime-logs-test-matrix.md)
- [Operator Terminal Session Test Matrix](./operator-terminal-session-test-matrix.md)
- [Quick Deploy Workflow Spec](../workflows/quick-deploy.md)
- [Resource Create And First Deploy Workflow Spec](../workflows/resources.create-and-first-deploy.md)
- [Spec-Driven Testing](./SPEC_DRIVEN_TESTING.md)

## Test Layers

| Layer | Focus |
| --- | --- |
| Web project page | Resource list is primary; create-resource is primary; project deployment rollup is secondary. |
| Web resource page | Resource detail defaults to configuration/overview, owns deployment actions, deployment history, current health, and access URL display. |
| Web create-resource page | Source/runtime/network drafts use resource language and do not bypass resource commands. |
| Sidebar/navigation | Project nodes expand to resource nodes with compact resource health projection, using unknown health until the projection exists. |
| Query/read model | Resource summaries expose enough status for lists/navigation without mutating write state. |
| API/oRPC | Entry actions still dispatch command/query contracts rather than UI-local business logic. |

## Given / When / Then Template

```md
Given:
- Project:
- Resources:
- Deployments:
- Latest deployment projection:
- Resource health projection:
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

| Test ID | Preferred automation | Case | Input/read state | Expected primary UI result | Expected command/query behavior | Expected absence |
| --- | --- | --- | --- | --- | --- | --- |
| PROJECT-CONSOLE-PROJECT-001 | e2e-preferred | Project with resources | Project has multiple resources | Resource list is prominent; each resource links to detail | `resources.list` filtered by project/environment context or equivalent query | No direct project-owned deployment mutation |
| PROJECT-CONSOLE-PROJECT-002 | e2e-preferred | Project with no resources | Project has environments but no resources | Empty resource state plus create-resource/deploy action | Create action navigates to project-scoped create-resource first-deploy flow | No hidden `deployments.create(resource)` bootstrap as primary path |
| PROJECT-CONSOLE-PROJECT-003 | e2e-preferred | Project all deployments | Project has deployments across resources | Project deployment view is labeled as rollup/all deployments | Deployment query filters by project and displays resource context | No new deployment command without resource selection |
| PROJECT-CONSOLE-PROJECT-004 | e2e-preferred | Project new deployment shortcut | User clicks project-level shortcut | Opens Quick Deploy or resource selection | Workflow eventually selects/creates resource before `deployments.create` | No direct project-owned deployment command |

## Resource Page Matrix

| Test ID | Preferred automation | Case | Input/read state | Expected primary UI result | Expected command/query behavior | Expected state/projection |
| --- | --- | --- | --- | --- | --- | --- |
| PROJECT-CONSOLE-RESOURCE-001 | e2e-preferred | Resource detail | Resource exists | Resource profile, current health or fallback status, and deployment history are shown | Resource query/read model plus deployment history filtered by `resourceId` | Current status derives from health projection when available |
| PROJECT-CONSOLE-RESOURCE-002 | e2e-preferred | Resource detail default tab | Resource exists | Configuration/overview is the first selected tab; deployment history and logs are later tabs | Resource read model drives basic configuration and access URL | Deployment history is not the default application page |
| PROJECT-CONSOLE-RESOURCE-003 | e2e-preferred | Configuration section tabs | Resource detail configuration tab is open | Left configuration navigation selects one subsection and replaces the right-side content panel | Section state is encoded in nested route/query state, not a hash anchor | The page does not scroll through one long configuration document |
| PROJECT-CONSOLE-RESOURCE-004 | e2e-preferred | Single-panel top tabs | Deployment or runtime logs tab is open | The tab renders its single panel directly without an inner sidebar | No extra navigation state is needed | Redundant one-item sidebars are not shown |
| PROJECT-CONSOLE-RESOURCE-005 | e2e-preferred | Compact header actions | Resource exists with access URL, project, deployments, and domain placement | Header shows compact health and primary new-deployment action only | No command/query dispatched for removed navigation actions | Header does not expose open project, view deployments, open access URL, bind-domain, or diagnostic-copy as primary buttons |
| PROJECT-CONSOLE-RESOURCE-006 | e2e-preferred | Resource health preferred | Resource has health projection and latest deployment status | Current health is shown as resource status; latest deployment is contextual | Query/read compact resource health or `resources.health` when implemented | Health status derives from resource observation, not deployment attempt |
| PROJECT-CONSOLE-RESOURCE-007 | e2e-preferred | Deployment success but inaccessible | Latest deployment succeeded, public access or runtime health fails | Resource status shows degraded/unhealthy/unknown rather than succeeded | Health projection/query reports failing source | Deployment success remains historical context |
| PROJECT-CONSOLE-RESOURCE-008 | e2e-preferred | Access URL from resource | Resource has ready domain binding or resource access summary | Access URL appears in the first/default resource tab | Resource read model/access summary is used | URL is not hidden only on deployment detail or a later access tab |
| PROJECT-CONSOLE-RESOURCE-009 | e2e-preferred | New deployment from resource | Resource exists and can deploy | New deployment action is resource-scoped | Dispatch `deployments.create` with `resourceId` | Deployment attempt belongs to resource |
| PROJECT-CONSOLE-RESOURCE-010 | e2e-preferred | Runtime logs from resource | Resource has observable runtime instance | Runtime logs are shown as resource-owned application logs | Query `resources.runtime-logs` with `resourceId`; optional follow stream | Runtime logs remain separate from `deployments.logs` |
| PROJECT-CONSOLE-RESOURCE-011 | e2e-preferred | Terminal from resource | Resource has observable deployment workspace and terminal access is enabled | Terminal is offered from an operational tab/action, not the default overview | Dispatch `terminal-sessions.open` with resource scope and attach returned transport | Terminal starts in resolved deployment workspace, not a resource-name directory |
| PROJECT-CONSOLE-RESOURCE-012 | e2e-preferred | Diagnostic summary from resource | Access, proxy, or runtime logs are missing/unavailable | Copyable diagnostic summary is offered from the resource surface | Query `resources.diagnostic-summary` with `resourceId` and optional `deploymentId` | Summary includes stable ids and source-specific errors |
| PROJECT-CONSOLE-RESOURCE-013 | e2e-preferred | Redeploy absent in v1 | Latest deployment terminal | No public redeploy action is exposed | No redeploy command is dispatched | Existing deployments remain readable |
| PROJECT-CONSOLE-RESOURCE-014 | e2e-preferred | Active deployment | Latest deployment non-terminal | New deployment is blocked or explains active state | No deployment command until guard can pass | Latest status remains read-model projection |
| PROJECT-CONSOLE-RESOURCE-015 | e2e-preferred | Domain binding from resource | Resource has placement context | Configuration tab exposes an inline domain/TLS form with resource context | Dispatch `domain-bindings.create` with resource ownership fields | Domain binding belongs to resource and does not require a modal for the normal path |
| PROJECT-CONSOLE-RESOURCE-016 | e2e-preferred | Resource health detail density | Resource health includes runtime, health policy, proxy, access, checks, and source errors | Header shows one compact health control; expanded UI shows human-level runtime/policy details only | Raw checks/errors remain diagnostic data | Internal check names and error codes are not prominent main content |

## Create Resource Matrix

| Test ID | Preferred automation | Case | Draft input | Expected command sequence | Expected state |
| --- | --- | --- | --- | --- | --- |
| PROJECT-CONSOLE-CREATE-001 | e2e-preferred | Minimum resource | Project, environment, name | `resources.create` | Resource profile persisted |
| PROJECT-CONSOLE-CREATE-002 | e2e-preferred | Source/runtime/network draft | Project, environment, name, GitHub/Docker/Dockerfile/Compose/runtime draft, internal listener port | `resources.create` as part of first-deploy workflow; deployment intent continues through `deployments.create(resourceId)` | Resource profile persisted with source/runtime/network profile when supplied; deployment uses `resourceId` |
| PROJECT-CONSOLE-CREATE-003 | e2e-preferred | Source variant draft | Deep Git URL, Git branch/base directory, local folder base directory, Docker image tag/digest, Dockerfile path, or Compose path | Variant normalizer -> `resources.create`; deployment intent continues through `deployments.create(resourceId)` | Source identity lands in `ResourceSourceBinding`; strategy-specific file/command settings land in `ResourceRuntimeProfile` |
| PROJECT-CONSOLE-CREATE-004 | e2e-preferred | Generic port field | User enters application port on create-resource page | `resources.create(networkProfile.internalPort)` | Port is stored as resource network profile input, not deployment input |
| PROJECT-CONSOLE-CREATE-005 | e2e-preferred | Project-scoped deploy action | Project, environment, source/runtime/network draft, server, optional destination | `resources.create -> deployments.create(resourceId)` | Resource persists first; deployment is accepted or rejected by deployment command |
| PROJECT-CONSOLE-CREATE-006 | e2e-preferred | Continue into first deploy | Resource draft plus deploy intent | `resources.create -> deployments.create(resourceId)` | Resource exists; deployment accepted or rejected by deployment command |

## Sidebar Matrix

| Test ID | Preferred automation | Case | Read model state | Expected navigation result | Expected status behavior |
| --- | --- | --- | --- | --- | --- |
| PROJECT-CONSOLE-SIDEBAR-001 | e2e-preferred | Project with resources | Project and resources exist | Sidebar shows project group with resource children | Resource child status uses compact resource health |
| PROJECT-CONSOLE-SIDEBAR-002 | e2e-preferred | No deployment yet | Resource has no deployments | Resource child shows neutral/no-deployment state | No inferred failed/succeeded state |
| PROJECT-CONSOLE-SIDEBAR-003 | e2e-preferred | Health projection available | Resource has compact health status | Resource child shows health status | Latest deployment status is secondary/contextual |
| PROJECT-CONSOLE-SIDEBAR-004 | e2e-preferred | Health projection query pending | Resource exists while `resources.health` is loading | Resource child shows unknown health | Latest deployment status is not used as current health |
| PROJECT-CONSOLE-SIDEBAR-005 | e2e-preferred | Latest deployment running | Latest deployment for resource non-terminal | Resource child uses `resources.health` and may show `starting` | Deployment status remains contextual only |
| PROJECT-CONSOLE-SIDEBAR-006 | e2e-preferred | Latest deployment failed | Latest deployment terminal failed | Resource child uses `resources.health` and links to resource/deployment context | No write-side mutation from navigation |

## Current Implementation Notes And Migration Gaps

Project detail currently has some resource list and create-resource behavior, but the full ADR-013 project/resource/deployment hierarchy is not yet complete.

Resource detail and deployment pages already have some resource-aware behavior, but deployment history and primary actions should be reviewed against this matrix during the next Web Code Round.

Sidebar Project -> Resource hierarchy uses compact `resources.health` queries. Unknown is now a
loading/unobserved health state, not a deployment-status fallback.

Current contracts expose listener port as `networkProfile.internalPort`, governed by [ADR-015](../decisions/ADR-015-resource-network-profile.md).

Resource detail exposes a resource-level access URL and diagnostic summary affordance, but dedicated
browser tests for these affordances do not exist yet.

`resources.health` exists. Current status UI uses unknown only for loading/unobserved health,
instead of latest deployment status.

Resource/server terminal sessions are specified but not implemented; terminal UI coverage belongs to
the operator terminal session matrix before the project/resource console can claim terminal
alignment.

## Open Questions

- Which read model should own compact resource health and latest deployment context for resource
  navigation?
- Should dedicated create-resource flow immediately offer a "create and deploy" continuation before
  dedicated resource source/runtime/network configuration commands are active?
