# Core Operations

> CORE DOCUMENT
>
> This file is the human-facing and AI-facing source of truth for Yundu business capabilities.
> If a transport, UI flow, or local shortcut conflicts with this document, this document wins.
> The executable mirror of this document is
> [`packages/application/src/operation-catalog.ts`](/Users/nichenqin/projects/yundu/packages/application/src/operation-catalog.ts).
> Use [BUSINESS_OPERATION_MAP.md](/Users/nichenqin/projects/yundu/docs/BUSINESS_OPERATION_MAP.md)
> to understand operation relationships, workflow sequencing, and rebuild gates before adding or
> changing a behavior.

## Why This File Exists

Yundu is not a web-first CRUD application. Its core is a deployment control system with multiple
entry points:

- CLI
- HTTP / oRPC
- Web console
- future MCP / tool interfaces

Those interfaces must not invent business actions independently. Every business capability must map
to an explicit application operation.

## Core Rules

1. Every business capability must be represented by an explicit `Command` or `Query`.
2. Every transport must dispatch through that operation. No transport may call a repository or use
   case directly.
3. CLI arguments, oRPC input, HTTP input, and future MCP tool input must reuse the operation input
   schema. Do not create parallel transport-only business schemas.
4. Every operation must live in its own vertical slice directory files.
   Required shape:
   - `*.command.ts` or `*.query.ts`
   - `*.schema.ts`
   - `*.handler.ts`
   - `*.use-case.ts` or `*.query-service.ts`
5. Any new business capability must update this document and
   [`packages/application/src/operation-catalog.ts`](/Users/nichenqin/projects/yundu/packages/application/src/operation-catalog.ts)
   in the same change.
6. Infrastructure endpoints such as `/api/health`, `/api/readiness`, and `/api/version` are not
   business operations. They belong to the HTTP adapter layer.

## Business Capability Model

The current Yundu core is organized into seven capability groups:

- Projects
- Deployment Targets
- Environments
- Resources
- Deployments
- Routing / Domain Bindings
- System operations

Each group below lists the currently implemented business operations.

## Projects

Business meaning:
- a `Project` is the top-level workspace and resource collection boundary
- environments and resources belong to a project
- deployments are visible through a project as read-model rollups across resources, but deployment
  write actions belong to a selected or newly created resource
- projects are the unit shown in CLI, API, and Web

Implemented operations:

| Capability | Kind | Operation Key | Message | Schema | CLI | oRPC / HTTP |
| --- | --- | --- | --- | --- | --- | --- |
| Create project | Command | `projects.create` | `CreateProjectCommand` | `CreateProjectCommandInput` | `yundu project create` | `POST /api/projects` |
| List projects | Query | `projects.list` | `ListProjectsQuery` | `ListProjectsQueryInput` | `yundu project list` | `GET /api/projects` |

Current boundary:
- a project is currently metadata plus deployment ownership
- project detail surfaces should make resources the primary list and resource creation the primary
  write affordance
- project-level "view deployments" is a secondary rollup over resources
- project-level "new deployment" must be labeled and implemented as Quick Deploy or another entry
  workflow that selects or creates a resource before dispatching `deployments.create`
- project source binding is not yet a first-class aggregate concept
- GitHub repository import currently feeds deployment source selection, not a persisted project
  source binding
- project/resource navigation is governed by
  [ADR-013: Project Resource Navigation And Deployment Ownership](./decisions/ADR-013-project-resource-navigation-and-deployment-ownership.md)

Core next operations expected here:
- update project profile
- bind or change project source
- show project details
- archive project

Those are expected domain operations, but they are not implemented yet and must not be assumed by
transports until added here and to the operation catalog.

## Deployment Targets

Business meaning:
- a `DeploymentTarget` is a deploy target record owned by Yundu
- providers describe how the server is reached or operated

Transport compatibility:
- CLI and HTTP currently still use `server` naming
- the domain term remains `DeploymentTarget`

Implemented operations:

| Capability | Kind | Operation Key | Message | Schema | CLI | oRPC / HTTP |
| --- | --- | --- | --- | --- | --- | --- |
| Register deployment target | Command | `servers.register` | `RegisterServerCommand` | `RegisterServerCommandInput` | `yundu server register` | `POST /api/servers` |
| Configure deployment target credential | Command | `servers.configure-credential` | `ConfigureServerCredentialCommand` | `ConfigureServerCredentialCommandInput` | `yundu server credential <serverId>` | `POST /api/servers/{serverId}/credentials` |
| List deployment targets | Query | `servers.list` | `ListServersQuery` | `ListServersQueryInput` | `yundu server list` | `GET /api/servers` |
| Test deployment target connectivity | Command | `servers.test-connectivity` | `TestServerConnectivityCommand` | `TestServerConnectivityCommandInput` | `yundu server test <serverId>`; `yundu server doctor <serverId>` | `POST /api/servers/{serverId}/connectivity-tests` |
| Test draft deployment target connectivity | Command | `servers.test-draft-connectivity` | `TestServerConnectivityCommand` | `TestServerConnectivityCommandInput` | - | `POST /api/servers/connectivity-tests` |
| Create reusable SSH credential | Command | `credentials.create-ssh` | `CreateSshCredentialCommand` | `CreateSshCredentialCommandInput` | `yundu server credential-create` | `POST /api/credentials/ssh` |
| List reusable SSH credentials | Query | `credentials.list-ssh` | `ListSshCredentialsQuery` | `ListSshCredentialsQueryInput` | `yundu server credential-list` | `GET /api/credentials/ssh` |

- server registration may carry edge proxy intent/provider selection; when omitted, the deployment
  target records the configured default edge proxy intent and an asynchronous lifecycle path
  attempts proxy bootstrap
- proxy bootstrap failure does not roll back deployment target metadata; it is recorded on the
  server proxy status/error fields and deployment execution still performs an idempotent proxy
  ensure when a runtime plan needs proxy-backed access
- generated default access routes require proxy readiness and a usable target public address, but
  the generated-domain provider is selected by infrastructure configuration and dependency
  injection, not by core/application command input

Core next operations expected here:
- show server details
- update server profile
- deactivate server
- rotate reusable SSH credential
- delete reusable SSH credential when unused

## Environments

Business meaning:
- environment configuration is a first-class domain object
- variables and inheritance rules are part of the deployment model, not a UI form concern
- environment snapshots are derived from these rules at deployment time

Implemented operations:

| Capability | Kind | Operation Key | Message | Schema | CLI | oRPC / HTTP |
| --- | --- | --- | --- | --- | --- | --- |
| Create environment | Command | `environments.create` | `CreateEnvironmentCommand` | `CreateEnvironmentCommandInput` | `yundu env create` | `POST /api/environments` |
| List environments | Query | `environments.list` | `ListEnvironmentsQuery` | `ListEnvironmentsQueryInput` | `yundu env list` | `GET /api/environments` |
| Show environment | Query | `environments.show` | `ShowEnvironmentQuery` | `ShowEnvironmentQueryInput` | `yundu env show <environmentId>` | `GET /api/environments/{environmentId}` |
| Set environment variable | Command | `environments.set-variable` | `SetEnvironmentVariableCommand` | `SetEnvironmentVariableCommandInput` | `yundu env set <environmentId> <key> <value>` | `POST /api/environments/{environmentId}/variables` |
| Unset environment variable | Command | `environments.unset-variable` | `UnsetEnvironmentVariableCommand` | `UnsetEnvironmentVariableCommandInput` | `yundu env unset <environmentId> <key>` | `DELETE /api/environments/{environmentId}/variables/{key}` |
| Diff environments | Query | `environments.diff` | `DiffEnvironmentsQuery` | `DiffEnvironmentsQueryInput` | `yundu env diff <environmentId> <otherEnvironmentId>` | `GET /api/environments/{environmentId}/diff/{otherEnvironmentId}` |
| Promote environment | Command | `environments.promote` | `PromoteEnvironmentCommand` | `PromoteEnvironmentCommandInput` | `yundu env promote <environmentId> <targetName>` | `POST /api/environments/{environmentId}/promote` |

Core next operations expected here:
- clone environment
- lock environment
- list environment change history
- inspect effective precedence resolution

## Resources

Business meaning:
- a `Resource` is the deployable unit inside a project environment
- applications, backend services, databases, workers, static sites, external services, and Docker
  Compose stacks are modeled as resources
- a Docker Compose stack is one resource that may contain multiple named services
- deployments belong to one resource
- resource detail is the owner-scoped surface for new deployment, deployment history,
  source/runtime/network configuration, generated access, proxy configuration, resource runtime
  logs, and resource-scoped domain/TLS actions
- destinations and deployment targets / servers remain runtime placement, not the project
  organization layer

Implemented operations:

| Capability | Kind | Operation Key | Message | Schema | CLI | oRPC / HTTP |
| --- | --- | --- | --- | --- | --- | --- |
| Create resource | Command | `resources.create` | `CreateResourceCommand` | `CreateResourceCommandInput` | `yundu resource create` | `POST /api/resources` |
| List resources | Query | `resources.list` | `ListResourcesQuery` | `ListResourcesQueryInput` | `yundu resource list` | `GET /api/resources` |
| Read resource runtime logs | Query | `resources.runtime-logs` | `ResourceRuntimeLogsQuery` | `ResourceRuntimeLogsQueryInput` | `yundu resource logs <resourceId>` | `GET /api/resources/{resourceId}/runtime-logs`; stream: `GET /api/resources/{resourceId}/runtime-logs/stream` |
| Preview resource proxy configuration | Query | `resources.proxy-configuration.preview` | `ResourceProxyConfigurationPreviewQuery` | `ResourceProxyConfigurationPreviewQueryInput` | `yundu resource proxy-config <resourceId>` | `GET /api/resources/{resourceId}/proxy-configuration` |

Current boundary:
- resources are persisted and can be listed by project or environment
- deployment creation resolves or bootstraps a resource and destination before creating the
  deployment record
- provider-backed dependency resources remain `ResourceInstance`; they are not the same aggregate
  as project resources
- `resources.create` is the explicit command for creating the minimum durable resource
  profile. It is governed by
  [ADR-011: Resource Create Minimum Lifecycle](./decisions/ADR-011-resource-create-minimum-lifecycle.md).
- once `resources.create` is implemented, Quick Deploy should prefer
  `resources.create -> deployments.create(resourceId)` for new-resource flows
- reusable source/runtime/network/health/access defaults are governed by
  [ADR-012: Resource Runtime Profile And Deployment Snapshot Boundary](./decisions/ADR-012-resource-runtime-profile-and-deployment-snapshot-boundary.md)
  and [ADR-015: Resource Network Profile](./decisions/ADR-015-resource-network-profile.md)
- source configuration is variant-specific resource profile state. Git repository/ref/base
  directory, local-folder base directory, Docker image tag/digest, artifact extraction root, and
  provider repository identity belong to `ResourceSourceBinding`; Dockerfile path, Docker Compose
  path, static publish directory, build target, command defaults, and health-check defaults belong
  to `ResourceRuntimeProfile`; listener ports and exposure belong to `ResourceNetworkProfile`.
- application listener port belongs to resource network profile language as `internalPort`; UI/CLI
  may display it as "port", but deployment admission must consume it from resource state
- reverse-proxy resources can be eligible for generated default access routes when the configured
  default access domain policy is enabled; the resource still owns only the internal endpoint, not
  concrete generated-domain or edge-proxy provider behavior
- project/resource console ownership is governed by
  [ADR-013: Project Resource Navigation And Deployment Ownership](./decisions/ADR-013-project-resource-navigation-and-deployment-ownership.md)
- sidebar navigation may show Project -> Resource hierarchy with latest deployment status derived
  from read models/projections
- application runtime logs are resource-owned observation governed by
  [ADR-018: Resource Runtime Log Observation](./decisions/ADR-018-resource-runtime-log-observation.md);
  `resources.runtime-logs` is the active bounded and stream-capable query surface for runtime
  stdout/stderr observation through an injected runtime log reader
- edge proxy provider behavior is resource-observable through
  `resources.proxy-configuration.preview`, governed by
  [ADR-019: Edge Proxy Provider And Observable Configuration](./decisions/ADR-019-edge-proxy-provider-and-observable-configuration.md);
  Web/API/CLI must display provider-rendered sections from the query instead of reconstructing
  proxy labels, files, or route manifests locally

Core next operations expected here:
- show resource details
- update resource profile/source
- configure resource network profile
- declare compose-stack services from compose metadata
- archive resource

## Deployments

Business meaning:
- deployment is the execution record of a runtime plan against a project, environment, resource,
  destination, and target/server
- the write side owns runtime plan creation, execution state, snapshot capture, and rollback intent

Implemented operations:

| Capability | Kind | Operation Key | Message | Schema | CLI | oRPC / HTTP |
| --- | --- | --- | --- | --- | --- | --- |
| Create deployment | Command | `deployments.create` | `CreateDeploymentCommand` | `CreateDeploymentCommandInput` | `yundu deploy [path-or-source]` or ids-only flags | `POST /api/deployments` |
| List deployments | Query | `deployments.list` | `ListDeploymentsQuery` | `ListDeploymentsQueryInput` | `yundu deployments list` | `GET /api/deployments` |
| Read deployment logs | Query | `deployments.logs` | `DeploymentLogsQuery` | `DeploymentLogsQueryInput` | `yundu logs <deploymentId>` | `GET /api/deployments/{deploymentId}/logs` |

Current boundary:
- `deployments.create` is the only public deployment write command for the v1 operation surface.
  This reset is governed by
  [ADR-016: Deployment Command Surface Reset](./decisions/ADR-016-deployment-command-surface-reset.md).
- `deployments.create` accepts deployment context references only: `projectId`, `environmentId`,
  `resourceId`, `serverId`, and optional `destinationId`
- deployment source and runtime strategy are resolved from the resource's persisted
  `ResourceSourceBinding`, `ResourceRuntimeProfile`, and `ResourceNetworkProfile`
- `deployments.create` must not accept `sourceLocator`, `source`, `deploymentMethod`,
  install/build/start commands, port/internalPort, health-check path, `resource` bootstrap input,
  proxy, domains, path prefix, or TLS mode
- `destinationId` may still be omitted when the compatibility seam can resolve or create the
  server default destination before context validation; strict API and automation callers should
  prefer explicit destination selection
- runtime access routes and direct host-port exposure are runtime plan snapshot behavior; durable
  domain, routing, and TLS lifecycle state belongs to `domain-bindings.create` and certificate
  commands
- generated default access routes are resolved from resource network profile, server/proxy
  readiness, durable domain binding state, and provider-neutral default access policy; they are not
  `deployments.create` input fields
- reverse-proxy deployments must use `ResourceNetworkProfile.internalPort` as the upstream target
  and must not require public exposure of the application port on the SSH server
- deployment config files are workflow/bootstrap inputs for creating or configuring related
  resource/project/environment/server state before deployment admission; they are not
  `deployments.create` input fields
- detect and plan happen inside the deployment write flow
- cancel, manual deployment health check, redeploy, reattach, and rollback are not public
  operations in the v1 surface. They must be reintroduced only after new source-of-truth specs,
  test matrices, implementation plans, and Web/API/CLI contracts are accepted.
- Quick Deploy is an entry workflow over explicit operations, not a separate domain command or
  operation-catalog entry. Web QuickDeploy and CLI interactive `yundu deploy` must create/select
  context through existing commands and queries, then dispatch `deployments.create`. See
  [ADR-010: Quick Deploy Workflow Boundary](./decisions/ADR-010-quick-deploy-workflow-boundary.md).
- source, runtime, network, health, route, domain, and TLS fields on `deployments.create` are superseded by
  [ADR-014: Deployment Admission Uses Resource Profile](./decisions/ADR-014-deployment-admission-uses-resource-profile.md).
  [ADR-015: Resource Network Profile](./decisions/ADR-015-resource-network-profile.md) governs
  resource-owned network endpoint semantics. Deployment state keeps the resolved runtime and
  network plan snapshot, while durable reusable source/runtime/network configuration belongs to the
  resource profile and durable domain/TLS lifecycle belongs to routing/domain/certificate commands.
  [ADR-017: Default Access Domain And Proxy Routing](./decisions/ADR-017-default-access-domain-and-proxy-routing.md)
  governs generated access domains and per-deployment proxy route realization.

Core next operations expected here:
- explicit plan deployment without execution
- show deployment details
- stream deployment events

## Routing / Domain Bindings

Business meaning:
- runtime plan access routes are deployment snapshots, not durable domain ownership state
- a `DomainBinding` is durable routing/domain ownership state for a project, environment,
  resource, destination, and deployment target
- DNS verification, certificate issuance, renewal, and domain readiness progress outside
  `deployments.create`

Implemented operations:

| Capability | Kind | Operation Key | Message | Schema | CLI | oRPC / HTTP |
| --- | --- | --- | --- | --- | --- | --- |
| Create domain binding | Command | `domain-bindings.create` | `CreateDomainBindingCommand` | `CreateDomainBindingCommandInput` | `yundu domain-binding create <domainName>` | `POST /api/domain-bindings` |
| List domain bindings | Query | `domain-bindings.list` | `ListDomainBindingsQuery` | `ListDomainBindingsQueryInput` | `yundu domain-binding list` | `GET /api/domain-bindings` |

Current boundary:
- `domain-bindings.create` creates durable binding state, persists the first manual verification
  attempt, publishes `domain-binding-requested`, and returns accepted `ok({ id })`
- `domain-binding-requested` is a request event and does not mean the domain is bound, certificate
  issuance succeeded, or traffic is ready
- `deployments.create` must not carry domain, proxy, path prefix, or TLS fields
- duplicate active bindings are rejected for the same project/environment/resource/domain/path
  owner scope
- durable domain bindings require a target edge proxy provider that supports durable domain routes;
  no-proxy targets are rejected by durable domain binding admission
- generated default access routes are not durable domain bindings and are governed by
  [ADR-017](./decisions/ADR-017-default-access-domain-and-proxy-routing.md)
- generated default access policy editing must become the public command
  `default-access-domain-policies.configure` before Web/CLI/API expose it
- `domain-bindings.list` exposes the read model used by CLI, API, and Web to observe accepted
  binding records and their verification status
- Web exposes domain binding from both the resource detail page and the standalone domain bindings
  page; the resource detail page is the owner-scoped affordance, while the standalone page is
  cross-resource management over the same command/query contracts

Core next operations expected here:
- configure default access domain policy
- preview/show resource proxy configuration
- verify or mark domain binding ownership
- issue or renew certificate
- import certificate
- retry failed domain verification or certificate issuance attempt
- list/show domain binding readiness state

## System Operations

Business meaning:
- these are application-level control plane operations required to operate Yundu itself
- they are not domain aggregates, but they are still first-class application operations

Implemented operations:

| Capability | Kind | Operation Key | Message | Schema | CLI | oRPC / HTTP |
| --- | --- | --- | --- | --- | --- | --- |
| List providers | Query | `system.providers.list` | `ListProvidersQuery` | none | `yundu providers list` | `GET /api/providers` |
| List plugins | Query | `system.plugins.list` | `ListPluginsQuery` | none | `yundu plugins list` | `GET /api/plugins` |
| List GitHub repositories | Query | `system.github-repositories.list` | `ListGitHubRepositoriesQuery` | `ListGitHubRepositoriesQueryInput` | none yet | `GET /api/integrations/github/repositories` |
| Doctor diagnostics | Query | `system.doctor` | `DoctorQuery` | none | `yundu doctor` | none |
| Database status | Query | `system.db-status` | `DbStatusQuery` | none | `yundu db status` | none |
| Database migrate | Command | `system.db-migrate` | `DbMigrateCommand` | none | `yundu db migrate` | none |

Current boundary:
- embedded self-hosted PGlite applies migrations automatically during shell startup
- explicit `db migrate` remains the schema-control operation for external PostgreSQL and operational
  workflows that want a manual migration step

## How Interfaces Must Use This

CLI:
- CLI commands are transport shells only
- they parse flags and positional args, then construct the matching command or query input and
  dispatch through the bus

oRPC / HTTP:
- business endpoints map to the operations above
- endpoint input must be the operation schema input
- endpoint handlers must dispatch through `CommandBus` or `QueryBus`

Web:
- the web console must call the typed oRPC client or HTTP contract built from these operations
- it must not hide business rules in components

Future MCP / AI tools:
- tools such as `create_project`, `create_environment`, `plan_deployment`, and
  `deploy_release` must map back to these operations or to future operations added here

## Authoring Checklist For New Business Capabilities

Before adding a new CLI command, API endpoint, or UI workflow:

1. Decide whether it is a `Command` or `Query`.
2. Locate the behavior in
   [BUSINESS_OPERATION_MAP.md](/Users/nichenqin/projects/yundu/docs/BUSINESS_OPERATION_MAP.md) and
   update the map first if the behavior is absent or rebuild-required.
3. Add the operation to this file when it becomes a public command/query.
4. Add the executable mirror entry to
   [`packages/application/src/operation-catalog.ts`](/Users/nichenqin/projects/yundu/packages/application/src/operation-catalog.ts).
5. Create the vertical slice files:
   - `*.schema.ts`
   - `*.command.ts` or `*.query.ts`
   - `*.handler.ts`
   - `*.use-case.ts` or `*.query-service.ts`
6. Map CLI and oRPC / HTTP to that operation.
7. Add tests at the transport and application levels.

If a capability is not listed here, it is not part of the agreed Yundu business surface yet.
