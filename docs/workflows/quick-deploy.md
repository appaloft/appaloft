# Quick Deploy Workflow Spec

## Normative Contract

Quick Deploy is an entry workflow for guiding a user from an initial deployment intent to an accepted `deployments.create` request.

Quick Deploy is not a domain command, not an aggregate, and not a separate operation-catalog business operation. It coordinates input collection and explicit commands owned by existing operations.

## Global References

This workflow inherits:

- [ADR-001: deployments.create HTTP API Required Fields](../decisions/ADR-001-deploy-api-required-fields.md)
- [ADR-002: Routing, Domain, And TLS Boundary](../decisions/ADR-002-routing-domain-tls-boundary.md)
- [ADR-010: Quick Deploy Workflow Boundary](../decisions/ADR-010-quick-deploy-workflow-boundary.md)
- [ADR-011: Resource Create Minimum Lifecycle](../decisions/ADR-011-resource-create-minimum-lifecycle.md)
- [ADR-012: Resource Runtime Profile And Deployment Snapshot Boundary](../decisions/ADR-012-resource-runtime-profile-and-deployment-snapshot-boundary.md)
- [ADR-013: Project Resource Navigation And Deployment Ownership](../decisions/ADR-013-project-resource-navigation-and-deployment-ownership.md)
- [ADR-014: Deployment Admission Uses Resource Profile](../decisions/ADR-014-deployment-admission-uses-resource-profile.md)
- [ADR-015: Resource Network Profile](../decisions/ADR-015-resource-network-profile.md)
- [ADR-017: Default Access Domain And Proxy Routing](../decisions/ADR-017-default-access-domain-and-proxy-routing.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)
- [deployments.create Command Spec](../commands/deployments.create.md)
- [resources.create Command Spec](../commands/resources.create.md)
- [deployments.create Workflow Spec](./deployments.create.md)

## Purpose

Quick Deploy exists to reduce first-deployment setup friction while preserving explicit business operation boundaries.

It may collect or create enough context for a first deployment:

- source;
- project;
- deployment target/server;
- credential;
- environment;
- resource;
- first environment variable;
- optional follow-up domain binding entrypoint;
- final deployment request.

When Quick Deploy collects source/runtime/health values, those values are entry-flow draft fields for `resources.create` or a future resource profile update command. They must not be submitted to `deployments.create`.

When Quick Deploy collects domain/TLS intent, it must sequence an explicit `domain-bindings.create` or certificate command after the required resource, server, and destination context exists. It must not submit domain/TLS intent to `deployments.create`.

When generated default access is enabled by platform policy, Quick Deploy may display the generated URL after the resource access summary projection is available. It must not collect concrete generated-domain provider fields from the user and must not send generated domain/proxy/TLS fields to `deployments.create`.

When Quick Deploy is launched from a project page, the workflow must still select or create a
resource before deployment admission. Project context may prefill `projectId`, but it must not make
the project the deployment owner.

When Quick Deploy is launched from a resource page, the workflow should prefill `resourceId`,
project, environment, and resource-owned source/runtime/network draft state where available.

Quick Deploy must use the ADR-012 domain language while collecting draft values:

- source selection produces a source locator and, when needed, a resource source binding draft;
- runtime selection produces a runtime plan strategy hint, not a deployment-owned method;
- build/start/health values are runtime profile drafts;
- listener port, upstream protocol, exposure mode, and compose target service are network profile drafts;
- domain/path/TLS values belong to durable domain binding/certificate commands and must not become deployment-owned state.

## Workflow Boundary

Quick Deploy owns:

- input collection;
- draft state;
- context selection UX;
- preflight validation that is useful before command dispatch;
- sequencing explicit commands and queries;
- progress observation after deployment acceptance.

Quick Deploy does not own:

- deployment admission semantics;
- resource aggregate rules;
- project/environment/server aggregate rules;
- credential storage rules;
- durable domain binding or certificate lifecycle;
- async deployment execution;
- deployment retry semantics;
- cross-command rollback.

## Reusable Workflow Program

Quick Deploy sequencing must be reusable through a side-effect-free workflow program and entry-specific executors.

The reusable program owns only the operation order and id-threading between steps:

```text
workflow input
  -> yield projects.create when project must be created
  -> yield servers.register when server must be created
  -> yield credentials.ssh.create and servers.configureCredential when credential setup is requested
  -> yield environments.create when environment must be created
  -> yield resources.create when resource must be created, including source/runtime/network profile drafts when they are part of first deploy
  -> yield environments.setVariable when first variable is supplied
  -> yield deployments.create
  -> return projectId, serverId, environmentId, resourceId, deploymentId
```

Each yielded step is an explicit operation step. The program must not call HTTP clients, CommandBus, QueryBus, repositories, prompts, or UI APIs directly.

Entry points supply executors:

- Web executors call typed oRPC/HTTP client methods and refresh Web query state.
- CLI executors dispatch command/query messages through the CLI runtime and CommandBus/QueryBus.
- A future backend convenience executor may dispatch explicit commands through the accepted backend application boundary, but it must still preserve partial failure semantics and must not become a hidden domain command.

The Web executor must use one request per yielded workflow step. It must show workflow step progress from those explicit requests: the running step is loading, succeeded steps are marked complete, and a failed step stops the workflow with the underlying command error. User-facing copy must describe the operation being performed, not the fact that the implementation uses separate requests.

The final deployment step is still the `deployments.create` command. Web may use the deployment progress stream transport for that final step so the user can see detect, plan, package, deploy, verify, rollback, Yundu log, and application output while the command runs. `deployments.createStream` must not be used to execute project, server, environment, resource, credential, or variable workflow steps, and it must not become a hidden Quick Deploy workflow command.

The Web QuickDeploy wizard must collect project context immediately after source selection. When no project exists, the project step may stay on the new-project path and use the default first-project name if the user does not override it. When projects exist, the project step must default to selecting an existing project and still allow the user to switch to creating a new project.

The server step follows the same existing-first rule: when servers exist, default to selecting an existing server; when none exist, default to registering a new server.

Input collection remains entry-owned. The shared workflow program receives normalized references:

- existing ids for selected project/server/environment/resource; or
- create inputs for entities that the workflow should create.

The program may compose returned ids into later command inputs, such as using a created `projectId` for `environments.create`, a created `environmentId` for `resources.create`, and the returned `resourceId` for `deployments.create`.

When the workflow collects a port for an application resource, that field is resource network input. The normalized step input must be `networkProfile.internalPort`, not deployment input and not a host-published server port.

Web and CLI Quick Deploy implementations must expose this `internalPort` field when creating an inbound application resource. It is part of the core workflow contract, not an optional entrypoint enhancement.

## End-To-End Workflow

```text
user intent
  -> source selection
  -> project selection or projects.create
  -> server selection or servers.register
  -> optional credential creation/configuration
  -> optional server connectivity preflight
  -> environment selection or environments.create
  -> resource selection or resource bootstrap/create path
  -> optional environment variable command
  -> optional domain binding command after resource/destination context exists
  -> deployments.create
  -> deployment progress/read-model observation
```

`deployments.create` remains the final deployment command. Command success means request accepted.

## Operation Sequence

| Step | Owner | Command/query | Required behavior |
| --- | --- | --- | --- |
| Source selection | Web/CLI workflow | Source/provider queries as needed | Produce a `ResourceSourceBinding` draft and optional provider metadata. |
| Network draft | Web/CLI workflow | Local draft validation; optional source/runtime detection | Produce a `ResourceNetworkProfile` draft with `internalPort` for inbound resources. |
| Project context | Web/CLI workflow | `projects.list`; optional `projects.create` | Select or create the project before deployment admission. |
| Server context | Web/CLI workflow | `servers.list`; optional `servers.register` | Select or register the deployment target/server before deployment admission. |
| Credential context | Web/CLI workflow | `credentials.list-ssh`; optional `credentials.create-ssh`; optional `servers.configure-credential` | Store or attach credential material through credential/server commands, not inside deployment. |
| Connectivity preflight | Web/CLI workflow | `servers.test-connectivity` or `servers.test-draft-connectivity` | May test reachability before final deploy; failure is preflight feedback unless the final command requires the tested state. |
| Environment context | Web/CLI workflow | `environments.list`; optional `environments.create` | Select or create the environment before deployment admission. |
| Resource context | Web/CLI workflow | `resources.list`; `resources.create` | Prefer existing `resourceId`; use explicit `resources.create` with source/runtime/network profile when creating a new first-deploy resource. |
| First variable | Web/CLI workflow | `environments.set-variable` | Persist environment-scoped variable before deployment snapshot if the user supplies it. |
| Domain/TLS context | Web/CLI workflow | `domain-bindings.create`; certificate commands when in scope | Bind domains through explicit routing/domain/TLS commands, not through deployment admission. |
| Deployment admission | Application command | `deployments.create` | Dispatch ids-only deployment admission and accept or reject the deployment request according to the command spec. |
| Generated access observation | Web/CLI workflow | `ResourceAccessSummary` after route snapshot resolution | Display generated access URL and proxy route status when policy/provider resolved one. |
| Progress observation | Web/CLI workflow | deployment progress stream during the final deployment command; deployment read/progress queries after acceptance | Observe durable state or technical progress without treating progress events as Quick Deploy workflow steps. |

## Entry Differences

| Entrypoint | Contract |
| --- | --- |
| Web QuickDeploy | May use a multi-step wizard and local draft state; all writes dispatch explicit commands or the final `deployments.create` command. |
| CLI `yundu deploy` with source/options | May create/select a resource with source/runtime/network profile, then dispatch ids-only `deployments.create`. |
| CLI `yundu deploy` without source in TTY | May prompt for missing source/context, call prerequisite commands, and dispatch `deployments.create`. |
| CLI `yundu deploy` without source outside TTY | May dispatch ids-only `deployments.create` when project/server/environment/resource ids are supplied; otherwise must reject before dispatch because non-interactive input collection cannot complete. |
| HTTP API | Does not expose hidden prompts; clients call explicit operations or submit a complete `deployments.create` input. |
| Automation/MCP | Must call explicit operations in sequence or use a future durable workflow command if one is accepted by ADR. |

## Partial Failure Semantics

Quick Deploy is not an atomic cross-aggregate transaction.

If an earlier command succeeds and a later command fails, the successful earlier state remains persisted. The workflow must surface the failed step and allow the user or automation to retry from the persisted state.

Examples:

- a project created before server registration fails remains available;
- a server registered before credential configuration fails remains available;
- an environment variable set before deployment admission fails remains available;
- a deployment accepted before runtime execution fails remains available with terminal failed deployment state.

Rollback or cleanup requires explicit future operations. It must not be implied by Quick Deploy failure.

## Idempotency And Deduplication

Quick Deploy must prefer selecting existing records before creating new records when a stable identifier or natural match is available.

Repeated workflow submissions must not intentionally create duplicate project, server, environment, credential, resource, or deployment records unless the user explicitly asks for a new entity or retry attempt.

The final deployment retry rule follows [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md): deployment retry creates a new deployment attempt.

## Generated Names

When Quick Deploy auto-generates a new resource name from a source locator, repository, image, compose file, or local path, the generated name must use:

```text
<normalized-source-name>-<short-random-suffix>
```

The normalized source name must be slug-like and stable for display. The suffix must be generated by the entry workflow before dispatching `resources.create`.

This rule applies only to names generated by the entry workflow. If the user explicitly types a resource name, Quick Deploy must send that name unchanged and let `resources.create` enforce project/environment slug uniqueness.

The `resources.create` command must not silently add suffixes, rename resources, or retry with a different name after `resource_slug_conflict`. Naming conflict handling at the command boundary remains a structured `resource_slug_conflict` error.

## Domain Model Placement

Quick Deploy belongs to the entry workflow/application orchestration layer.

The domain model remains:

```text
Project
  -> Environment
  -> Resource
  -> Deployment

DeploymentTarget/Server
  -> Destination
  -> Deployment runtime placement
```

Quick Deploy does not introduce a `QuickDeploy` aggregate. A future durable onboarding process may introduce a workflow/process state object only after a new ADR accepts that boundary.

## Error Handling

Workflow preflight errors may be Web/CLI-local when no command has been dispatched.

Command errors from underlying operations must use the global error model and preserve stable `code`, `category`, `phase`, `retriable`, `relatedEntityId`, and `correlationId` semantics.

Quick Deploy must not convert command errors into message-only failures. UI/CLI may add user-facing copy, but tests should assert stable domain error codes when a command boundary is involved.

## Current Implementation Notes And Migration Gaps

Web QuickDeploy now uses a shared Quick Deploy workflow program for operation sequencing and id-threading. The Web component still owns draft input collection, local validation, and query refresh side effects through its executor.

Web QuickDeploy executes prerequisite workflow steps through individual typed oRPC requests and renders per-step workflow progress in the review surface. It uses deployment progress streaming only for the final `deployments.create` step so deployment phases and logs stay visible while the command runs.

Web QuickDeploy keeps the workflow result visible after deployment acceptance and uses an explicit "view deployment" action for navigation instead of auto-redirecting immediately after the create request returns.

CLI interactive deploy treats prompts as input collection and dispatches explicit commands after resolving context. It has not yet been fully migrated to the shared workflow program.

The current Web workflow creates/configures several records from the component. This can remain as a migration step, but the behavior is governed by this workflow contract and [ADR-010](../decisions/ADR-010-quick-deploy-workflow-boundary.md).

Current Web QuickDeploy and CLI interactive deploy use `resources.create` before `deployments.create(resourceId)` for new first-deploy resources.

Current Web and CLI Quick Deploy auto-generate new-resource names with a short random suffix when the user has not supplied a resource name.

The shared workflow module is available for Web and future CLI/backend reuse. CLI migration remains a follow-up implementation task.

Quick Deploy domain/TLS input has been removed from the deployment flow. Resource-scoped domain binding remains available through the domain binding surfaces and should become the owner-scoped follow-up action after deployment.

Generated default access URL display is not yet aligned with ADR-017 as a provider-neutral route snapshot/read-model surface.

Current Web and CLI entry fields may still use user-facing "method" wording. Entry workflows must map that wording to `ResourceRuntimeProfile.strategy` before dispatching `resources.create`; `deployments.create` must not receive `deploymentMethod`.

Current Web and CLI entry fields may still expose a generic "port" label. Entry workflows must map that value to `ResourceNetworkProfile.internalPort`; `deployments.create` must not receive `port`.

## Open Questions

- Should a future non-durable backend convenience endpoint be allowed for Quick Deploy, or should automation always sequence explicit operations until a durable workflow command exists?
- Exact operation names for resource source binding, runtime profile, network profile, and access profile configuration remain open under [ADR-012](../decisions/ADR-012-resource-runtime-profile-and-deployment-snapshot-boundary.md) and [ADR-015](../decisions/ADR-015-resource-network-profile.md).
