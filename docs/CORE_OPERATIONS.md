# Core Operations

> CORE DOCUMENT
>
> This file is the human-facing and AI-facing source of truth for Appaloft business capabilities.
> If a transport, UI flow, or local shortcut conflicts with this document, this document wins.
> The executable mirror of this document is
> [`packages/application/src/operation-catalog.ts`](/Users/nichenqin/projects/appaloft/packages/application/src/operation-catalog.ts).
> Use [BUSINESS_OPERATION_MAP.md](/Users/nichenqin/projects/appaloft/docs/BUSINESS_OPERATION_MAP.md)
> to understand operation relationships, workflow sequencing, and rebuild gates before adding or
> changing a behavior.

## Why This File Exists

Appaloft is not a web-first CRUD application. Its core is a deployment control system with multiple
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
   [`packages/application/src/operation-catalog.ts`](/Users/nichenqin/projects/appaloft/packages/application/src/operation-catalog.ts)
   in the same change.
6. Infrastructure endpoints such as `/api/health`, `/api/readiness`, and `/api/version` are not
   business operations. They belong to the HTTP adapter layer.
7. Aggregate-root mutations must be intention-revealing domain commands governed by
   [ADR-026: Aggregate Mutation Command Boundary](./decisions/ADR-026-aggregate-mutation-command-boundary.md).
   Generic business operations such as `projects.update`, `servers.update`, `resources.update`,
   `{aggregate}.patch`, or `{aggregate}.save` are forbidden. If a future operation cannot be named
   without a generic update verb, it needs a Spec Round before implementation.

## Business Capability Model

The current Appaloft core is organized into seven capability groups:

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
| Create project | Command | `projects.create` | `CreateProjectCommand` | `CreateProjectCommandInput` | `appaloft project create` | `POST /api/projects` |
| List projects | Query | `projects.list` | `ListProjectsQuery` | `ListProjectsQueryInput` | `appaloft project list` | `GET /api/projects` |

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
- `projects.show`
- `projects.rename`
- `projects.configure-source` if project source binding becomes a first-class aggregate concept
- `projects.archive`

Those are expected domain operations, but they are not implemented yet and must not be assumed by
transports until added here and to the operation catalog.

## Deployment Targets

Business meaning:
- a `DeploymentTarget` is a deploy target record owned by Appaloft
- providers describe how the server is reached or operated

Transport compatibility:
- CLI and HTTP currently still use `server` naming
- the domain term remains `DeploymentTarget`

Implemented operations:

| Capability | Kind | Operation Key | Message | Schema | CLI | oRPC / HTTP |
| --- | --- | --- | --- | --- | --- | --- |
| Register deployment target | Command | `servers.register` | `RegisterServerCommand` | `RegisterServerCommandInput` | `appaloft server register` | `POST /api/servers` |
| Configure deployment target credential | Command | `servers.configure-credential` | `ConfigureServerCredentialCommand` | `ConfigureServerCredentialCommandInput` | `appaloft server credential <serverId>` | `POST /api/servers/{serverId}/credentials` |
| List deployment targets | Query | `servers.list` | `ListServersQuery` | `ListServersQueryInput` | `appaloft server list` | `GET /api/servers` |
| Test deployment target connectivity | Command | `servers.test-connectivity` | `TestServerConnectivityCommand` | `TestServerConnectivityCommandInput` | `appaloft server test <serverId>`; `appaloft server doctor <serverId>` | `POST /api/servers/{serverId}/connectivity-tests` |
| Test draft deployment target connectivity | Command | `servers.test-draft-connectivity` | `TestServerConnectivityCommand` | `TestServerConnectivityCommandInput` | - | `POST /api/servers/connectivity-tests` |
| Repair deployment target edge proxy | Command | `servers.bootstrap-proxy` | `BootstrapServerProxyCommand` | `BootstrapServerProxyCommandInput` | `appaloft server proxy repair <serverId>` | `POST /api/servers/{serverId}/edge-proxy/bootstrap` |
| Create reusable SSH credential | Command | `credentials.create-ssh` | `CreateSshCredentialCommand` | `CreateSshCredentialCommandInput` | `appaloft server credential-create` | `POST /api/credentials/ssh` |
| List reusable SSH credentials | Query | `credentials.list-ssh` | `ListSshCredentialsQuery` | `ListSshCredentialsQueryInput` | `appaloft server credential-list` | `GET /api/credentials/ssh` |
| Open deployment target terminal | Command | `terminal-sessions.open` | `OpenTerminalSessionCommand` | `OpenTerminalSessionCommandInput` | `appaloft server terminal <serverId>` | `POST /api/terminal-sessions`; attach: `WS /api/terminal-sessions/{sessionId}/attach` |

- server registration may carry edge proxy intent/provider selection; when omitted, the deployment
  target records the configured default edge proxy intent and an asynchronous lifecycle path
  attempts proxy bootstrap
- proxy bootstrap failure does not roll back deployment target metadata; it is recorded on the
  server proxy status/error fields and deployment execution still performs an idempotent proxy
  ensure when a runtime plan needs proxy-backed access
- `servers.test-connectivity` / `appaloft server doctor <serverId>` includes provider-rendered
  edge proxy diagnostics for provider-backed targets when the runtime adapter can execute them; the
  diagnostics are read-only and do not mark the server ready or repaired
- `servers.bootstrap-proxy` is the explicit repair/retry operation for provider-owned proxy
  infrastructure; it creates a new proxy bootstrap attempt and may recreate provider-owned proxy
  containers, but it must not touch user workload containers
- generated default access routes require proxy readiness and a usable target public address, but
  the generated-domain provider is selected by infrastructure configuration and dependency
  injection, not by core/application command input

Core next operations expected here:
- `servers.show`
- `servers.rename`
- `servers.configure-edge-proxy`
- `servers.deactivate`
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
| Create environment | Command | `environments.create` | `CreateEnvironmentCommand` | `CreateEnvironmentCommandInput` | `appaloft env create` | `POST /api/environments` |
| List environments | Query | `environments.list` | `ListEnvironmentsQuery` | `ListEnvironmentsQueryInput` | `appaloft env list` | `GET /api/environments` |
| Show environment | Query | `environments.show` | `ShowEnvironmentQuery` | `ShowEnvironmentQueryInput` | `appaloft env show <environmentId>` | `GET /api/environments/{environmentId}` |
| Set environment variable | Command | `environments.set-variable` | `SetEnvironmentVariableCommand` | `SetEnvironmentVariableCommandInput` | `appaloft env set <environmentId> <key> <value>` | `POST /api/environments/{environmentId}/variables` |
| Unset environment variable | Command | `environments.unset-variable` | `UnsetEnvironmentVariableCommand` | `UnsetEnvironmentVariableCommandInput` | `appaloft env unset <environmentId> <key>` | `DELETE /api/environments/{environmentId}/variables/{key}` |
| Diff environments | Query | `environments.diff` | `DiffEnvironmentsQuery` | `DiffEnvironmentsQueryInput` | `appaloft env diff <environmentId> <otherEnvironmentId>` | `GET /api/environments/{environmentId}/diff/{otherEnvironmentId}` |
| Promote environment | Command | `environments.promote` | `PromoteEnvironmentCommand` | `PromoteEnvironmentCommandInput` | `appaloft env promote <environmentId> <targetName>` | `POST /api/environments/{environmentId}/promote` |

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
  source/runtime/network configuration, current resource health, generated access, proxy
  configuration, resource runtime logs, and resource-scoped domain/TLS actions
- destinations and deployment targets / servers remain runtime placement, not the project
  organization layer

Implemented operations:

| Capability | Kind | Operation Key | Message | Schema | CLI | oRPC / HTTP |
| --- | --- | --- | --- | --- | --- | --- |
| Create resource | Command | `resources.create` | `CreateResourceCommand` | `CreateResourceCommandInput` | `appaloft resource create` | `POST /api/resources` |
| Configure resource source profile | Command | `resources.configure-source` | `ConfigureResourceSourceCommand` | `ConfigureResourceSourceCommandInput` | `appaloft resource configure-source <resourceId>` | `POST /api/resources/{resourceId}/source` |
| Configure resource health policy | Command | `resources.configure-health` | `ConfigureResourceHealthCommand` | `ConfigureResourceHealthCommandInput` | `appaloft resource configure-health <resourceId>` | `POST /api/resources/{resourceId}/health-policy` |
| Configure resource runtime profile | Command | `resources.configure-runtime` | `ConfigureResourceRuntimeCommand` | `ConfigureResourceRuntimeCommandInput` | `appaloft resource configure-runtime <resourceId>` | `POST /api/resources/{resourceId}/runtime-profile` |
| Configure resource network profile | Command | `resources.configure-network` | `ConfigureResourceNetworkCommand` | `ConfigureResourceNetworkCommandInput` | `appaloft resource configure-network <resourceId>` | `POST /api/resources/{resourceId}/network-profile` |
| Archive resource | Command | `resources.archive` | `ArchiveResourceCommand` | `ArchiveResourceCommandInput` | `appaloft resource archive <resourceId>` | `POST /api/resources/{resourceId}/archive` |
| Delete resource | Command | `resources.delete` | `DeleteResourceCommand` | `DeleteResourceCommandInput` | `appaloft resource delete <resourceId> --confirm-slug <slug>` | `DELETE /api/resources/{resourceId}` |
| List resources | Query | `resources.list` | `ListResourcesQuery` | `ListResourcesQueryInput` | `appaloft resource list` | `GET /api/resources` |
| Show resource profile | Query | `resources.show` | `ShowResourceQuery` | `ShowResourceQueryInput` | `appaloft resource show <resourceId>` | `GET /api/resources/{resourceId}` |
| Read resource runtime logs | Query | `resources.runtime-logs` | `ResourceRuntimeLogsQuery` | `ResourceRuntimeLogsQueryInput` | `appaloft resource logs <resourceId>` | `GET /api/resources/{resourceId}/runtime-logs`; stream: `GET /api/resources/{resourceId}/runtime-logs/stream` |
| Preview resource proxy configuration | Query | `resources.proxy-configuration.preview` | `ResourceProxyConfigurationPreviewQuery` | `ResourceProxyConfigurationPreviewQueryInput` | `appaloft resource proxy-config <resourceId>` | `GET /api/resources/{resourceId}/proxy-configuration` |
| Read resource diagnostic summary | Query | `resources.diagnostic-summary` | `ResourceDiagnosticSummaryQuery` | `ResourceDiagnosticSummaryQueryInput` | `appaloft resource diagnose <resourceId>` | `GET /api/resources/{resourceId}/diagnostic-summary` |
| Read resource health | Query | `resources.health` | `ResourceHealthQuery` | `ResourceHealthQueryInput` | `appaloft resource health <resourceId>` | `GET /api/resources/{resourceId}/health` |
| Open resource terminal | Command | `terminal-sessions.open` | `OpenTerminalSessionCommand` | `OpenTerminalSessionCommandInput` | `appaloft resource terminal <resourceId>` | `POST /api/terminal-sessions`; attach: `WS /api/terminal-sessions/{sessionId}/attach` |

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
- workload framework detection is an internal planning capability over the resource profile. It
  records typed source inspection evidence such as runtime family, framework, package manager or
  build tool, package/project name, lockfiles, scripts, runtime version, Dockerfile/Compose paths,
  and static/build outputs, then selects a framework/runtime planner that resolves base image and
  install/build/start/package steps. This capability is governed by
  [Workload Framework Detection And Planning](./workflows/workload-framework-detection-and-planning.md);
  it must not add framework, base-image, or package-name fields to `deployments.create`.
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
- resource diagnostic summary is resource-owned observation through
  `resources.diagnostic-summary`; it composes stable ids, deployment/access/proxy/log statuses,
  source errors, safe system context, and canonical copy JSON for support/debug workflows without
  mutating deployment, runtime, or proxy state
- resource health is resource-owned observation governed by
  [ADR-020: Resource Health Observation](./decisions/ADR-020-resource-health-observation.md).
  `resources.health` is the active current health source for resource detail, project resource
  lists, sidebar navigation, CLI, and HTTP API. Latest deployment status remains contextual
  history, not proof that the resource is reachable.
- resource source profile changes are resource-owned through `resources.configure-source`; the
  command replaces the durable source binding for future deployment admission without pulling
  source, retargeting source links, creating deployments, restarting runtime, or mutating
  deployment snapshots.
- resource runtime profile changes are resource-owned through `resources.configure-runtime`; the
  command replaces durable runtime planning fields for future deployment admission without
  mutating source, network, health policy, deployment snapshots, or current runtime state.
- resource network profile changes are resource-owned through `resources.configure-network`; the
  command replaces the durable workload endpoint profile for future deployment admission and route
  planning without binding domains, applying proxy routes, restarting runtime, or mutating
  deployment snapshots.
- resource archive is resource-owned through `resources.archive`; the command moves lifecycle
  state to `archived`, publishes `resource-archived` on the first transition, and blocks future
  profile mutations and deployments without stopping runtime or deleting retained history,
  domains, logs, diagnostics, or source links.
- resource delete is resource-owned through `resources.delete`; the command moves an archived,
  unreferenced resource to deleted/tombstone lifecycle state after typed slug confirmation and
  deletion blocker checks, publishes `resource-deleted` on the first transition, and omits deleted
  resources from normal resource read models without cascading cleanup.
- durable domain bindings belong to the resource. Deployment snapshots may record the route used
  by one attempt, but they are not the domain ownership boundary. Generated default access should
  be exposed through resource-scoped access summaries and should prefer stable resource-scoped
  hostnames unless a provider explicitly requires deployment-scoped hostnames.

Core next operations expected here:
- declare compose-stack services from compose metadata
- `resources.delete`

## Source Links

Business meaning:
- source link state maps a stable, secret-free source fingerprint to the Appaloft
  project/environment/resource context used by repeated CLI and GitHub Actions deploys
- pure CLI/SSH mode persists this state outside the repository config in the selected state
  backend, normally the SSH server's Appaloft PGlite state
- relink is the explicit operator escape hatch for retargeting a source fingerprint; regular
  deploys may create or reuse a link, but must not move it implicitly

Implemented operations:

| Capability | Kind | Operation Key | Message | Schema | CLI | oRPC / HTTP |
| --- | --- | --- | --- | --- | --- | --- |
| Relink source fingerprint | Command | `source-links.relink` | `RelinkSourceLinkCommand` | `RelinkSourceLinkCommandInput` | `appaloft source-links relink <sourceFingerprint>` | Not exposed |

Current boundary:
- `source-links.relink` updates source link mapping only. It does not mutate resource profiles,
  environment variables, credentials, deployment history, domain bindings, or server-applied route
  state.
- CLI SSH mode uses the same remote PGlite state lock/download/upload path as config deploy when
  the relink command is invoked with trusted SSH target options such as `--server-host`.
- PostgreSQL/PGlite source-link storage is implemented for hosted/self-hosted and embedded state
  backends through the dedicated `packages/persistence/pg` adapter. That same durable state feeds
  `resources.delete` source-link blocker checks. API/oRPC and Web relink surfaces remain future
  work until the review UX exists.

## Deployments

Business meaning:
- deployment is the execution record of a runtime plan against a project, environment, resource,
  destination, and target/server
- the write side owns runtime plan creation, execution state, snapshot capture, and rollback intent

Implemented operations:

| Capability | Kind | Operation Key | Message | Schema | CLI | oRPC / HTTP |
| --- | --- | --- | --- | --- | --- | --- |
| Create deployment | Command | `deployments.create` | `CreateDeploymentCommand` | `CreateDeploymentCommandInput` | `appaloft deploy [path-or-source]` or ids-only flags | `POST /api/deployments` |
| List deployments | Query | `deployments.list` | `ListDeploymentsQuery` | `ListDeploymentsQueryInput` | `appaloft deployments list` | `GET /api/deployments` |
| Read deployment logs | Query | `deployments.logs` | `DeploymentLogsQuery` | `DeploymentLogsQueryInput` | `appaloft logs <deploymentId>` | `GET /api/deployments/{deploymentId}/logs` |

Current boundary:
- `deployments.create` is the only public deployment write command for the v1 operation surface.
  This reset is governed by
  [ADR-016: Deployment Command Surface Reset](./decisions/ADR-016-deployment-command-surface-reset.md).
- `deployments.create` accepts deployment context references only: `projectId`, `environmentId`,
  `resourceId`, `serverId`, and optional `destinationId`
- deployment source and runtime strategy are resolved from the resource's persisted
  `ResourceSourceBinding`, `ResourceRuntimeProfile`, and `ResourceNetworkProfile`
- v1 deployment runtime execution is Docker/OCI-backed. Every accepted runtime plan must build,
  pull, or otherwise reference an OCI/Docker image artifact, or materialize a Docker Compose project
  whose runnable services are backed by OCI/Docker images. This substrate rule is governed by
  [ADR-021: Docker/OCI Workload Substrate](./decisions/ADR-021-docker-oci-workload-substrate.md).
- Docker/OCI is the workload artifact substrate, not a permanent single-node-only orchestration
  boundary. Runtime target backend selection is internal to `deployments.create` and is governed by
  [ADR-023: Runtime Orchestration Target Boundary](./decisions/ADR-023-runtime-orchestration-target-boundary.md).
  The active v1 target backend is single-server Docker/Compose; Docker Swarm and Kubernetes remain
  future backend targets that must not add provider-specific fields to deployment admission.
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
- multiple reverse-proxy resources on the same server may use the same `internalPort`; runtime
  replacement and cleanup must be scoped to the resource/workload identity, not to a shared port
- direct-port exposure uses an explicit host port as the placement collision boundary and must not
  stop another resource to free that port
- repository deployment config files are workflow/bootstrap inputs for applying source-adjacent
  resource profile choices before deployment admission; they are not `deployments.create` input
  fields
- repository config bootstrap is the non-interactive/headless expression of Quick Deploy draft
  normalization. Web QuickDeploy, CLI interactive deploy, GitHub Actions binary invocation, future
  local agents, and MCP tools must converge on the same explicit project/server/environment/resource
  operation sequence before ids-only deployment admission.
- committed repository config files must not select Appaloft project, resource, server,
  destination, credential, organization, or secret identity. First-run project/resource creation
  must use explicit entrypoint choices, trusted link/source state, or source-derived defaults
  outside the committed file. See
  [Repository Deployment Config File Bootstrap](./workflows/deployment-config-file-bootstrap.md).
- repository config files may declare source/runtime/network/health profile fields, non-secret
  environment values, required secret references, and provider-neutral `access.domains[]` intent
  only through the owners named in the config workflow. Raw SSH keys, deploy keys, tokens, secret
  env values, certificate material, provider account ids, and concrete target/server credentials
  are rejected before write commands run.
- config `access.domains[]` intent is not a deployment command field. In pure CLI/SSH mode, it
  becomes server-applied proxy route desired/applied state persisted in the selected SSH target's
  Appaloft state backend. In hosted or self-hosted control-plane mode, the same intent may map to
  explicit managed `domain-bindings.create` and certificate workflow steps after trusted
  resource/server/destination context exists. A domain entry may also describe a canonical redirect
  alias with `redirectTo` and optional `redirectStatus`; redirect source hosts are target-local
  proxy route state in SSH mode and managed route/domain follow-up intent in control-plane mode.
  PostgreSQL/PGlite durable server-applied route persistence is an internal state-backend slice for
  this route state. It does not add a new deployment input, route mutation command, or Web/API/CLI
  surface.
- GitHub Actions and other headless binary entrypoints that deploy to an SSH server default to
  SSH-server PGlite state and do not need `DATABASE_URL`. `DATABASE_URL` is required only when the
  caller explicitly selects PostgreSQL or a remote Appaloft control plane. Runner-local PGlite is
  explicit local-only/smoke-test state, not the default for SSH-targeted deploys. CI secrets must be
  mapped by the CI workflow into runner environment variables and referenced from config as
  resolver references such as `ci-env:NAME`, never committed as values.
- Control-plane mode selection is an entry workflow concern governed by
  [ADR-025: Control-Plane Modes And Action Execution](./decisions/ADR-025-control-plane-modes-and-action-execution.md).
  Execution owner and state/control-plane owner are separate dimensions. A GitHub Action may
  execute a deployment while Appaloft Cloud or a self-hosted Appaloft server owns source links,
  locks, identity, audit, and managed domain workflow state.
- Repository config may declare non-secret control-plane connection policy such as
  `controlPlane.mode: none|auto|cloud|self-hosted` and optional self-host/private endpoint URL
  metadata after the config schema implements it. It must not contain Cloud tokens, database URLs,
  project ids, resource ids, server ids, destination ids, credential ids, organization ids, tenant
  ids, or raw credential material. Control-plane identity comes from trusted entrypoint input,
  authenticated token/OIDC/login scope, GitHub repository identity, source link state, or explicit
  relink/adoption operations outside committed config.
- Cloud and self-hosted control-plane modes require a compatibility handshake before any
  project/resource/domain/deployment mutation. Until that handshake exists, mode selection may be
  documented as roadmap and must fail before mutation when selected.
- The public GitHub Actions install UX is a thin `appaloft/deploy-action` wrapper around the
  released Appaloft CLI binary. It downloads and verifies release assets, maps trusted action inputs
  to CLI flags, writes SSH private key input to a temporary key file, and invokes the same
  repository config deploy workflow. It is not a new operation, not a hidden Quick Deploy API, and
  not a hosted control plane.
- `APPALOFT_PROJECT_ID`, `APPALOFT_RESOURCE_ID`, `APPALOFT_SERVER_ID`, and similar ids are optional
  trusted selection overrides for CLI/Action mode. They are required only when the operator wants to
  select existing control-plane identity explicitly; pure SSH CLI mode may reuse or create identity
  from source fingerprints stored in SSH-server Appaloft state.
- source fingerprint link state is required for production pure CLI repeatability. Regular deploy
  may create the first link or reuse an existing link, but it must not retarget an existing link.
  Retargeting requires the active CLI command `source-links.relink`.
- CPU, memory, replicas, restart policy, rollout overlap/drain, and similar runtime-target sizing
  fields must not be silently accepted from repository config files until their resource/runtime
  target ADRs, command specs, runtime enforcement, and tests exist.
- detect and plan happen inside the deployment write flow
- build/package work produces or resolves the Docker/OCI image artifact used by one deployment
  attempt. Prebuilt image deployments may skip build work but still snapshot image identity.
- framework/runtime detection feeds deployment planning through typed `SourceInspectionSnapshot`
  evidence and a planner registry. Mainstream web framework support is a workload-planner concern:
  planners choose base image, package manager/build tool commands, static output or packaged
  artifacts, and start commands while keeping Web/API/CLI command schemas provider-neutral.
- cancel, manual deployment health check, redeploy, reattach, and rollback are not public
  operations in the v1 surface. They must be reintroduced only after new source-of-truth specs,
  test matrices, implementation plans, and Web/API/CLI contracts are accepted.
- Quick Deploy is an entry workflow over explicit operations, not a separate domain command or
  operation-catalog entry. Web QuickDeploy and CLI interactive `appaloft deploy` must create/select
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
- DNS observation/verification, certificate issuance, renewal, and domain readiness progress outside
  `deployments.create`

Implemented operations:

| Capability | Kind | Operation Key | Message | Schema | CLI | oRPC / HTTP |
| --- | --- | --- | --- | --- | --- | --- |
| Create domain binding | Command | `domain-bindings.create` | `CreateDomainBindingCommand` | `CreateDomainBindingCommandInput` | `appaloft domain-binding create <domainName> [--redirect-to <domain>] [--redirect-status 301\|302\|307\|308]` | `POST /api/domain-bindings` |
| Confirm domain binding ownership | Command | `domain-bindings.confirm-ownership` | `ConfirmDomainBindingOwnershipCommand` | `ConfirmDomainBindingOwnershipCommandInput` | `appaloft domain-binding confirm-ownership <domainBindingId> [--verification-mode dns\|manual]` | `POST /api/domain-bindings/{domainBindingId}/ownership-confirmations` |
| List domain bindings | Query | `domain-bindings.list` | `ListDomainBindingsQuery` | `ListDomainBindingsQueryInput` | `appaloft domain-binding list` | `GET /api/domain-bindings` |
| Issue or renew certificate | Command | `certificates.issue-or-renew` | `IssueOrRenewCertificateCommand` | `IssueOrRenewCertificateCommandInput` | `appaloft certificate issue-or-renew <domainBindingId>` | `POST /api/certificates/issue-or-renew` |
| List certificates | Query | `certificates.list` | `ListCertificatesQuery` | `ListCertificatesQueryInput` | `appaloft certificate list` | `GET /api/certificates` |

Current boundary:
- `domain-bindings.create` creates durable binding state, persists the first manual verification
  attempt, records initial DNS observation metadata, publishes `domain-binding-requested`, and
  returns accepted `ok({ id })`
- `domain-bindings.confirm-ownership` confirms the current verification attempt, defaults to
  Appaloft-observed DNS evidence before moving the binding to `bound`, supports explicit manual
  override, publishes `domain-bound`, and returns `ok({ id, verificationAttemptId })`
- `domain-binding-requested` is a request event and does not mean the domain is bound, certificate
  issuance succeeded, or traffic is ready
- public DNS propagation is external to Appaloft; `domain-bindings.list` must expose DNS
  observation status so pending/mismatch DNS is a visible wait/recheck state rather than a hidden
  deployment failure
- `domain-bound` means ownership/route prerequisites are satisfied; it does not mean certificate
  issuance or domain readiness is complete
- TLS-disabled bindings may progress from `domain-bound` to `domain-ready` when route readiness
  gates are satisfied; ready bindings are exposed through both `domain-bindings.list` and resource
  `accessSummary.latestDurableDomainRoute`
- `certificates.issue-or-renew` accepts provider-driven certificate issue/renew requests for
  `tlsMode = auto` or certificate-policy-auto bindings, persists a certificate attempt, publishes
  `certificate-requested`, and returns `ok({ certificateId, attemptId })`
- default certificate provider selection resolves to `acme` with `http-01` through an injected
  provider selection policy registered by the composition root; core certificate state treats
  provider key and challenge type as opaque values and does not embed ACME-specific rules
- `certificate-requested` means an attempt exists; it does not mean provider issuance succeeded,
  certificate material is stored, or HTTPS traffic is ready
- `certificate-requested` is also a first-class event behavior entrypoint: the certificate worker
  consumes it through injected provider and secret-store ports, then records `certificate-issued` or
  `certificate-issuance-failed` as durable follow-up state
- `certificate-issued` is a first-class event behavior entrypoint for certificate-backed readiness:
  when the referenced domain binding is still bound, the handler marks it ready and publishes
  `domain-ready`
- the default shell composition intentionally registers an unavailable certificate provider until a
  real provider adapter is configured; this records retryable `certificate_provider_unavailable`
  state after accepted issue requests rather than pretending HTTPS is active
- `certificates.list` exposes certificate and latest attempt state for CLI, API, and future Web
  readiness views
- `deployments.create` must not carry domain, proxy, path prefix, or TLS fields
- duplicate active bindings are rejected for the same project/environment/resource/domain/path
  owner scope
- durable canonical redirect bindings are accepted through `domain-bindings.create` when
  `redirectTo` points at an existing served binding for the same project/environment/resource/path;
  redirect-only bindings still own their source hostname and require DNS/TLS lifecycle coverage for
  that hostname
- durable domain bindings require a target edge proxy provider that supports durable domain routes;
  no-proxy targets are rejected by durable domain binding admission
- generated default access routes are not durable domain bindings and are governed by
  [ADR-017](./decisions/ADR-017-default-access-domain-and-proxy-routing.md)
- server-applied config domains in pure CLI/SSH mode are not durable managed `DomainBinding`
  records. They are target-local proxy route desired/applied state governed by
  [ADR-024](./decisions/ADR-024-pure-cli-ssh-state-and-server-applied-domains.md), and may later be
  imported or mapped into managed domain binding lifecycle when a hosted/self-hosted control plane
  is selected. Canonical redirect aliases such as `www -> apex` are part of that route state; they
  require DNS and TLS coverage for the redirecting host but do not create a separate deployment
  command or managed certificate record in pure CLI mode.
- server-applied route desired/applied state belongs to the selected Appaloft state backend. A
  PostgreSQL/PGlite backend must persist it through a dedicated persistence adapter and keep it
  separate from `Resource`, `DomainBinding`, `Certificate`, and deployment command schemas.
- generated default access policy editing must become the public command
  `default-access-domain-policies.configure` before Web/CLI/API expose it
- `domain-bindings.list` exposes the read model used by CLI, API, and Web to observe accepted
  binding records and their verification status
- Web exposes domain binding from both the resource detail page and the standalone domain bindings
  page; the resource detail page is the owner-scoped affordance, while the standalone page is
  cross-resource management over the same command/query contracts
- Web create forms expose route behavior as a select: serve traffic or redirect to canonical. CLI
  exposes the same managed intent through `--redirect-to` and `--redirect-status`. Repository config
  exposes the pure CLI/server-applied equivalent through `access.domains[].redirectTo` and
  `access.domains[].redirectStatus`.
- generated sslip/default access hostnames are not durable domain bindings and must be displayed as
  generated access state, not as rows in the custom domain binding list

Core next operations expected here:
- configure default access domain policy
- preview/show resource proxy configuration
- import certificate
- retry failed domain verification or certificate issuance attempt
- list/show certificate-backed domain binding readiness state

## System Operations

Business meaning:
- these are application-level control plane operations required to operate Appaloft itself
- they are not domain aggregates, but they are still first-class application operations

Implemented operations:

| Capability | Kind | Operation Key | Message | Schema | CLI | oRPC / HTTP |
| --- | --- | --- | --- | --- | --- | --- |
| List providers | Query | `system.providers.list` | `ListProvidersQuery` | none | `appaloft providers list` | `GET /api/providers` |
| List plugins | Query | `system.plugins.list` | `ListPluginsQuery` | none | `appaloft plugins list` | `GET /api/plugins` |
| List GitHub repositories | Query | `system.github-repositories.list` | `ListGitHubRepositoriesQuery` | `ListGitHubRepositoriesQueryInput` | none yet | `GET /api/integrations/github/repositories` |
| Doctor diagnostics | Query | `system.doctor` | `DoctorQuery` | none | `appaloft doctor` | none |
| Database status | Query | `system.db-status` | `DbStatusQuery` | none | `appaloft db status` | none |
| Database migrate | Command | `system.db-migrate` | `DbMigrateCommand` | none | `appaloft db migrate` | none |

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
   [BUSINESS_OPERATION_MAP.md](/Users/nichenqin/projects/appaloft/docs/BUSINESS_OPERATION_MAP.md) and
   update the map first if the behavior is absent or rebuild-required.
3. Add the operation to this file when it becomes a public command/query.
4. Add the executable mirror entry to
   [`packages/application/src/operation-catalog.ts`](/Users/nichenqin/projects/appaloft/packages/application/src/operation-catalog.ts).
5. Create the vertical slice files:
   - `*.schema.ts`
   - `*.command.ts` or `*.query.ts`
   - `*.handler.ts`
   - `*.use-case.ts` or `*.query-service.ts`
6. Map CLI and oRPC / HTTP to that operation.
7. Add tests at the transport and application levels.

If a capability is not listed here, it is not part of the agreed Appaloft business surface yet.
