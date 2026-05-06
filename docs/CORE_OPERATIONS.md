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

The current Appaloft core is organized into eight capability groups:

- Projects
- Deployment Targets
- Environments
- Resources
- Deployments
- Routing / Domain Bindings
- Operator Work
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
| Show project | Query | `projects.show` | `ShowProjectQuery` | `ShowProjectQueryInput` | `appaloft project show <projectId>` | `GET /api/projects/{projectId}` |
| Rename project | Command | `projects.rename` | `RenameProjectCommand` | `RenameProjectCommandInput` | `appaloft project rename <projectId> --name <name>` | `POST /api/projects/{projectId}/rename` |
| Archive project | Command | `projects.archive` | `ArchiveProjectCommand` | `ArchiveProjectCommandInput` | `appaloft project archive <projectId>` | `POST /api/projects/{projectId}/archive` |

Current boundary:
- a project is currently metadata plus deployment ownership
- project lifecycle state is explicit; archived projects remain readable but reject new
  project-scoped mutations and deployment admission
- project detail surfaces should make resources the primary list and resource creation the primary
  write affordance
- project-level "view deployments" is a secondary rollup over resources
- project detail/settings may compose read-only resource, environment, deployment, and access
  rollups, but those rollups are not `projects.show` output and do not make Project the owner of
  child mutation or runtime state
- project rename/archive must not create deployments, mutate historical deployment snapshots, or
  immediately affect runtime state
- project-level "new deployment" must be labeled and implemented as Quick Deploy or another entry
  workflow that selects or creates a resource before dispatching `deployments.create`
- project source binding is not yet a first-class aggregate concept
- GitHub repository import currently feeds deployment source selection, not a persisted project
  source binding
- project/resource navigation is governed by
  [ADR-013: Project Resource Navigation And Deployment Ownership](./decisions/ADR-013-project-resource-navigation-and-deployment-ownership.md)

Core next operations expected here:
- `projects.configure-source` if project source binding becomes a first-class aggregate concept
- `projects.set-description` if description editing becomes a first-class mutation
- project hard delete or restore only after safety rules are specified

Those future operations are not required for the Phase 4 project lifecycle/settings closure. Until
they are specified, the project-level closure is `projects.show`, `projects.rename`, and
`projects.archive`.

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
| Show deployment target | Query | `servers.show` | `ShowServerQuery` | `ShowServerQueryInput` | `appaloft server show <serverId>` | `GET /api/servers/{serverId}` |
| Inspect deployment target capacity | Query | `servers.capacity.inspect` | `InspectServerCapacityQuery` | `InspectServerCapacityQueryInput` | `appaloft server capacity inspect <serverId>` | `GET /api/servers/{serverId}/capacity` |
| Rename deployment target | Command | `servers.rename` | `RenameServerCommand` | `RenameServerCommandInput` | `appaloft server rename <serverId> --name <name>` | `POST /api/servers/{serverId}/rename` |
| Configure deployment target edge proxy | Command | `servers.configure-edge-proxy` | `ConfigureServerEdgeProxyCommand` | `ConfigureServerEdgeProxyCommandInput` | `appaloft server proxy configure <serverId> --kind none\|traefik\|caddy` | `POST /api/servers/{serverId}/edge-proxy/configuration` |
| Deactivate deployment target | Command | `servers.deactivate` | `DeactivateServerCommand` | `DeactivateServerCommandInput` | `appaloft server deactivate <serverId>` | `POST /api/servers/{serverId}/deactivate` |
| Check deployment target delete safety | Query | `servers.delete-check` | `CheckServerDeleteSafetyQuery` | `CheckServerDeleteSafetyQueryInput` | `appaloft server delete-check <serverId>` | `GET /api/servers/{serverId}/delete-check` |
| Delete deployment target | Command | `servers.delete` | `DeleteServerCommand` | `DeleteServerCommandInput` | `appaloft server delete <serverId> --confirm <serverId>` | `DELETE /api/servers/{serverId}` |
| Test deployment target connectivity | Command | `servers.test-connectivity` | `TestServerConnectivityCommand` | `TestServerConnectivityCommandInput` | `appaloft server test <serverId>`; `appaloft server doctor <serverId>` | `POST /api/servers/{serverId}/connectivity-tests` |
| Test draft deployment target connectivity | Command | `servers.test-draft-connectivity` | `TestServerConnectivityCommand` | `TestServerConnectivityCommandInput` | - | `POST /api/servers/connectivity-tests` |
| Repair deployment target edge proxy | Command | `servers.bootstrap-proxy` | `BootstrapServerProxyCommand` | `BootstrapServerProxyCommandInput` | `appaloft server proxy repair <serverId>` | `POST /api/servers/{serverId}/edge-proxy/bootstrap` |
| Create reusable SSH credential | Command | `credentials.create-ssh` | `CreateSshCredentialCommand` | `CreateSshCredentialCommandInput` | `appaloft server credential-create` | `POST /api/credentials/ssh` |
| List reusable SSH credentials | Query | `credentials.list-ssh` | `ListSshCredentialsQuery` | `ListSshCredentialsQueryInput` | `appaloft server credential-list` | `GET /api/credentials/ssh` |
| Show reusable SSH credential usage | Query | `credentials.show` | `ShowSshCredentialQuery` | `ShowSshCredentialQueryInput` | `appaloft server credential-show <credentialId>` | `GET /api/credentials/ssh/{credentialId}` |
| Delete reusable SSH credential when unused | Command | `credentials.delete-ssh` | `DeleteSshCredentialCommand` | `DeleteSshCredentialCommandInput` | `appaloft server credential-delete <credentialId> --confirm <credentialId>` | `DELETE /api/credentials/ssh/{credentialId}` |
| Rotate reusable SSH credential in place | Command | `credentials.rotate-ssh` | `RotateSshCredentialCommand` | `RotateSshCredentialCommandInput` | `appaloft server credential-rotate <credentialId> --private-key-file <path> --confirm <credentialId>` | `POST /api/credentials/ssh/{credentialId}/rotate` |
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
- `servers.show` reads one deployment target/server, masked credential summary, edge proxy status,
  and deployment/resource/domain rollups. It does not test connectivity, repair proxy state, or
  mutate credentials, resources, deployments, domains, routes, terminal sessions, logs, or audit
  state.
- `servers.capacity.inspect` is a read-only runtime target diagnostic. It may connect to a
  local-shell or generic-SSH target and return disk, inode, memory, CPU, Docker image/build-cache,
  Appaloft runtime-root/state/source-workspace usage, safe reclaimable estimates, and warnings. It
  must not run Docker prune, delete volumes, delete `/var/lib/appaloft/runtime/state`, remove
  source workspaces, stop containers, repair proxy state, or mutate Appaloft records. Reclaimable
  values are estimates for later cleanup/prune decisions, not cleanup execution.
- `servers.rename` changes only the deployment target/server display name. It preserves the server
  id, host, provider, credential, proxy, lifecycle state, and historical references. Active and
  inactive servers may be renamed; deleted servers are not visible to the normal rename entrypoint.
  Server names are display labels, not unique identities.
- `servers.configure-edge-proxy` changes only an active deployment target/server's desired edge
  proxy kind. It preserves the server id, host, provider, credential, lifecycle state, destination
  ids, and historical deployment/domain/route/audit references. `none` disables future generated
  default access or custom-domain proxy-backed target selection for that server without deleting
  historical route snapshots or provider-owned artifacts. `traefik` and `caddy` record
  provider-owned proxy intent for later route realization. The command does not synchronously
  bootstrap or repair proxy infrastructure; after changing from `none` to a provider-backed kind,
  users should run `servers.bootstrap-proxy` or rely on a later deployment ensure path.
- `servers.deactivate` moves a server to inactive lifecycle state. Inactive servers remain
  readable and keep history/dependency visibility, but deployment admission, scheduler target
  selection, and new proxy target configuration must not use them for future work.
- `servers.delete-check` previews delete safety for a server without mutating state. It returns
  structured blocker reasons such as active server lifecycle, deployment history, active
  deployments, resource placements, domain bindings, certificates, attached credentials,
  server-applied routes, default-access policy overrides, terminal sessions, runtime tasks, runtime
  logs, and audit retention.
- `servers.delete` soft-deletes only an inactive server after the same delete-safety blocker reader
  reports no blockers. It does not cascade cleanup, stop workloads, detach credentials, remove
  routes, revoke certificates, delete logs, or remove audit state. Normal server list/show target
  selection omits deleted servers while historical records retain the server id.
- `credentials.delete-ssh` permanently deletes only a stored reusable SSH private-key credential.
  The command reuses the durable active/inactive server usage surface from `credentials.show` and
  accepts deletion only when `usage.totalServers = 0`. Active or inactive visible server references
  reject with `credential_in_use`. A usage-read failure rejects the command and must not be treated
  as zero usage. The command never returns private key material, public key bodies, local key paths,
  or credential-bearing strings.
- `credentials.rotate-ssh` replaces stored reusable SSH private-key material in place while
  preserving the credential id and server references. The command reuses the durable
  active/inactive usage surface from `credentials.show`; nonzero usage requires explicit
  `acknowledgeServerUsage`, and usage-read failure rejects the command. Rotation success does not
  prove connectivity, so affected servers should run `servers.test-connectivity` before deployment.
- generated default access routes require proxy readiness and a usable target public address, but
  the generated-domain provider is selected by infrastructure configuration and dependency
  injection, not by core/application command input

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
| Rename environment | Command | `environments.rename` | `RenameEnvironmentCommand` | `RenameEnvironmentCommandInput` | `appaloft env rename <environmentId> --name <name>` | `POST /api/environments/{environmentId}/rename` |
| Set environment variable | Command | `environments.set-variable` | `SetEnvironmentVariableCommand` | `SetEnvironmentVariableCommandInput` | `appaloft env set <environmentId> <key> <value>` | `POST /api/environments/{environmentId}/variables` |
| Unset environment variable | Command | `environments.unset-variable` | `UnsetEnvironmentVariableCommand` | `UnsetEnvironmentVariableCommandInput` | `appaloft env unset <environmentId> <key>` | `DELETE /api/environments/{environmentId}/variables/{key}` |
| Read environment effective precedence | Query | `environments.effective-precedence` | `EnvironmentEffectivePrecedenceQuery` | `EnvironmentEffectivePrecedenceQueryInput` | `appaloft env effective-precedence <environmentId>` | `GET /api/environments/{environmentId}/effective-precedence` |
| Diff environments | Query | `environments.diff` | `DiffEnvironmentsQuery` | `DiffEnvironmentsQueryInput` | `appaloft env diff <environmentId> <otherEnvironmentId>` | `GET /api/environments/{environmentId}/diff/{otherEnvironmentId}` |
| Clone environment | Command | `environments.clone` | `CloneEnvironmentCommand` | `CloneEnvironmentCommandInput` | `appaloft env clone <environmentId> --name <targetName>` | `POST /api/environments/{environmentId}/clone` |
| Promote environment | Command | `environments.promote` | `PromoteEnvironmentCommand` | `PromoteEnvironmentCommandInput` | `appaloft env promote <environmentId> <targetName>` | `POST /api/environments/{environmentId}/promote` |
| Lock environment | Command | `environments.lock` | `LockEnvironmentCommand` | `LockEnvironmentCommandInput` | `appaloft env lock <environmentId> --reason <reason>` | `POST /api/environments/{environmentId}/lock` |
| Unlock environment | Command | `environments.unlock` | `UnlockEnvironmentCommand` | `UnlockEnvironmentCommandInput` | `appaloft env unlock <environmentId>` | `POST /api/environments/{environmentId}/unlock` |
| Archive environment | Command | `environments.archive` | `ArchiveEnvironmentCommand` | `ArchiveEnvironmentCommandInput` | `appaloft env archive <environmentId>` | `POST /api/environments/{environmentId}/archive` |

Core next operations expected here:
- list environment change history
- restore/delete and lifecycle history

- `environments.rename` changes only the environment display name inside its owning project. It
  preserves environment id, kind, parent environment, variables, resources, deployments, and
  runtime state.
- `environments.clone` creates a new active environment in the same project from an active source
  environment's current environment-owned variables.
- `environments.lock` freezes one environment from new config/deployment work while keeping it
  readable.
- `environments.unlock` returns a locked environment to active. Archived environments remain
  terminal for this slice and require future explicit restore/delete specs if those behaviors are
  accepted.

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
| Configure resource access profile | Command | `resources.configure-access` | `ConfigureResourceAccessCommand` | `ConfigureResourceAccessCommandInput` | `appaloft resource configure-access <resourceId>` | `POST /api/resources/{resourceId}/access-profile` |
| Configure resource auto-deploy policy | Command | `resources.configure-auto-deploy` | `ConfigureResourceAutoDeployCommand` | `ConfigureResourceAutoDeployCommandInput` | `appaloft resource auto-deploy <resourceId>` | `POST /api/resources/{resourceId}/auto-deploy` |
| Set resource variable | Command | `resources.set-variable` | `SetResourceVariableCommand` | `SetResourceVariableCommandInput` | `appaloft resource set-variable <resourceId> <key> <value>` | `POST /api/resources/{resourceId}/variables` |
| Import resource variables | Command | `resources.import-variables` | `ImportResourceVariablesCommand` | `ImportResourceVariablesCommandInput` | `appaloft resource import-variables <resourceId> --content <dotenv>` | `POST /api/resources/{resourceId}/variables/import` |
| Unset resource variable | Command | `resources.unset-variable` | `UnsetResourceVariableCommand` | `UnsetResourceVariableCommandInput` | `appaloft resource unset-variable <resourceId> <key>` | `DELETE /api/resources/{resourceId}/variables/{key}` |
| Archive resource | Command | `resources.archive` | `ArchiveResourceCommand` | `ArchiveResourceCommandInput` | `appaloft resource archive <resourceId>` | `POST /api/resources/{resourceId}/archive` |
| Delete resource | Command | `resources.delete` | `DeleteResourceCommand` | `DeleteResourceCommandInput` | `appaloft resource delete <resourceId> --confirm-slug <slug>` | `DELETE /api/resources/{resourceId}` |
| List resources | Query | `resources.list` | `ListResourcesQuery` | `ListResourcesQueryInput` | `appaloft resource list` | `GET /api/resources` |
| Show resource profile | Query | `resources.show` | `ShowResourceQuery` | `ShowResourceQueryInput` | `appaloft resource show <resourceId>` | `GET /api/resources/{resourceId}` |
| Read resource effective configuration | Query | `resources.effective-config` | `ResourceEffectiveConfigQuery` | `ResourceEffectiveConfigQueryInput` | `appaloft resource effective-config <resourceId>` | `GET /api/resources/{resourceId}/effective-config` |
| Read resource runtime logs | Query | `resources.runtime-logs` | `ResourceRuntimeLogsQuery` | `ResourceRuntimeLogsQueryInput` | `appaloft resource logs <resourceId>` | `GET /api/resources/{resourceId}/runtime-logs`; stream: `GET /api/resources/{resourceId}/runtime-logs/stream` |
| Stop resource runtime | Command | `resources.runtime.stop` | `StopResourceRuntimeCommand` | `StopResourceRuntimeCommandInput` | `appaloft resource runtime stop <resourceId>` | `POST /api/resources/{resourceId}/runtime/stop` |
| Start resource runtime | Command | `resources.runtime.start` | `StartResourceRuntimeCommand` | `StartResourceRuntimeCommandInput` | `appaloft resource runtime start <resourceId>` | `POST /api/resources/{resourceId}/runtime/start` |
| Restart resource runtime | Command | `resources.runtime.restart` | `RestartResourceRuntimeCommand` | `RestartResourceRuntimeCommandInput` | `appaloft resource runtime restart <resourceId>` | `POST /api/resources/{resourceId}/runtime/restart` |
| Preview resource proxy configuration | Query | `resources.proxy-configuration.preview` | `ResourceProxyConfigurationPreviewQuery` | `ResourceProxyConfigurationPreviewQueryInput` | `appaloft resource proxy-config <resourceId>` | `GET /api/resources/{resourceId}/proxy-configuration` |
| Read resource diagnostic summary | Query | `resources.diagnostic-summary` | `ResourceDiagnosticSummaryQuery` | `ResourceDiagnosticSummaryQueryInput` | `appaloft resource diagnose <resourceId>` | `GET /api/resources/{resourceId}/diagnostic-summary` |
| Lookup resource access failure evidence | Query | `resources.access-failure-evidence.lookup` | `ResourceAccessFailureEvidenceLookupQuery` | `ResourceAccessFailureEvidenceLookupQueryInput` | `appaloft resource access-failure <requestId>` | `GET /api/resource-access-failures/{requestId}` |
| Read resource health | Query | `resources.health` | `ResourceHealthQuery` | `ResourceHealthQueryInput` | `appaloft resource health <resourceId>` | `GET /api/resources/{resourceId}/health` |
| Open resource terminal | Command | `terminal-sessions.open` | `OpenTerminalSessionCommand` | `OpenTerminalSessionCommandInput` | `appaloft resource terminal <resourceId>` | `POST /api/terminal-sessions`; attach: `WS /api/terminal-sessions/{sessionId}/attach` |

Phase 7 storage operations:

| Capability | Kind | Operation Key | Message | Schema | CLI | oRPC / HTTP |
| --- | --- | --- | --- | --- | --- | --- |
| Create storage volume | Command | `storage-volumes.create` | `CreateStorageVolumeCommand` | `CreateStorageVolumeCommandInput` | `appaloft storage volume create` | `POST /api/storage-volumes` |
| List storage volumes | Query | `storage-volumes.list` | `ListStorageVolumesQuery` | `ListStorageVolumesQueryInput` | `appaloft storage volume list` | `GET /api/storage-volumes` |
| Show storage volume | Query | `storage-volumes.show` | `ShowStorageVolumeQuery` | `ShowStorageVolumeQueryInput` | `appaloft storage volume show <storageVolumeId>` | `GET /api/storage-volumes/{storageVolumeId}` |
| Rename storage volume | Command | `storage-volumes.rename` | `RenameStorageVolumeCommand` | `RenameStorageVolumeCommandInput` | `appaloft storage volume rename <storageVolumeId> --name <name>` | `POST /api/storage-volumes/{storageVolumeId}/rename` |
| Delete storage volume | Command | `storage-volumes.delete` | `DeleteStorageVolumeCommand` | `DeleteStorageVolumeCommandInput` | `appaloft storage volume delete <storageVolumeId>` | `DELETE /api/storage-volumes/{storageVolumeId}` |
| Attach storage to resource | Command | `resources.attach-storage` | `AttachResourceStorageCommand` | `AttachResourceStorageCommandInput` | `appaloft resource storage attach <resourceId> <storageVolumeId> --destination-path <path>` | `POST /api/resources/{resourceId}/storage-attachments` |
| Detach storage from resource | Command | `resources.detach-storage` | `DetachResourceStorageCommand` | `DetachResourceStorageCommandInput` | `appaloft resource storage detach <resourceId> <attachmentId>` | `DELETE /api/resources/{resourceId}/storage-attachments/{attachmentId}` |

Phase 7 scheduled task operations:

| Capability | Kind | Operation Key | Message | Schema | CLI | oRPC / HTTP |
| --- | --- | --- | --- | --- | --- | --- |
| Create scheduled task | Command | `scheduled-tasks.create` | `CreateScheduledTaskCommand` | `CreateScheduledTaskCommandInput` | `appaloft scheduled-task create <resourceId>` | `POST /api/scheduled-tasks` |
| List scheduled tasks | Query | `scheduled-tasks.list` | `ListScheduledTasksQuery` | `ListScheduledTasksQueryInput` | `appaloft scheduled-task list` | `GET /api/scheduled-tasks` |
| Show scheduled task | Query | `scheduled-tasks.show` | `ShowScheduledTaskQuery` | `ShowScheduledTaskQueryInput` | `appaloft scheduled-task show <taskId>` | `GET /api/scheduled-tasks/{taskId}` |
| Configure scheduled task | Command | `scheduled-tasks.configure` | `ConfigureScheduledTaskCommand` | `ConfigureScheduledTaskCommandInput` | `appaloft scheduled-task configure <taskId>` | `POST /api/scheduled-tasks/{taskId}` |
| Delete scheduled task | Command | `scheduled-tasks.delete` | `DeleteScheduledTaskCommand` | `DeleteScheduledTaskCommandInput` | `appaloft scheduled-task delete <taskId>` | `DELETE /api/scheduled-tasks/{taskId}` |
| Run scheduled task now | Command | `scheduled-tasks.run-now` | `RunScheduledTaskNowCommand` | `RunScheduledTaskNowCommandInput` | `appaloft scheduled-task run <taskId>` | `POST /api/scheduled-tasks/{taskId}/runs` |
| List scheduled task runs | Query | `scheduled-task-runs.list` | `ListScheduledTaskRunsQuery` | `ListScheduledTaskRunsQueryInput` | `appaloft scheduled-task runs list` | `GET /api/scheduled-task-runs` |
| Show scheduled task run | Query | `scheduled-task-runs.show` | `ShowScheduledTaskRunQuery` | `ShowScheduledTaskRunQueryInput` | `appaloft scheduled-task runs show <runId>` | `GET /api/scheduled-task-runs/{runId}` |
| Read scheduled task run logs | Query | `scheduled-task-runs.logs` | `ScheduledTaskRunLogsQuery` | `ScheduledTaskRunLogsQueryInput` | `appaloft scheduled-task runs logs <runId>` | `GET /api/scheduled-task-runs/{runId}/logs` |

Phase 7 dependency resource operations:

| Capability | Kind | Operation Key | Message | Schema | CLI | oRPC / HTTP |
| --- | --- | --- | --- | --- | --- | --- |
| Provision Postgres dependency resource | Command | `dependency-resources.provision-postgres` | `ProvisionPostgresDependencyResourceCommand` | `ProvisionPostgresDependencyResourceCommandInput` | `appaloft dependency postgres provision` | `POST /api/dependency-resources/postgres/provision` |
| Import Postgres dependency resource | Command | `dependency-resources.import-postgres` | `ImportPostgresDependencyResourceCommand` | `ImportPostgresDependencyResourceCommandInput` | `appaloft dependency postgres import` | `POST /api/dependency-resources/postgres/import` |
| Provision Redis dependency resource | Command | `dependency-resources.provision-redis` | `ProvisionRedisDependencyResourceCommand` | `ProvisionRedisDependencyResourceCommandInput` | `appaloft dependency redis provision` | `POST /api/dependency-resources/redis/provision` |
| Import Redis dependency resource | Command | `dependency-resources.import-redis` | `ImportRedisDependencyResourceCommand` | `ImportRedisDependencyResourceCommandInput` | `appaloft dependency redis import` | `POST /api/dependency-resources/redis/import` |
| List dependency resources | Query | `dependency-resources.list` | `ListDependencyResourcesQuery` | `ListDependencyResourcesQueryInput` | `appaloft dependency list` | `GET /api/dependency-resources` |
| Show dependency resource | Query | `dependency-resources.show` | `ShowDependencyResourceQuery` | `ShowDependencyResourceQueryInput` | `appaloft dependency show <dependencyResourceId>` | `GET /api/dependency-resources/{dependencyResourceId}` |
| Rename dependency resource | Command | `dependency-resources.rename` | `RenameDependencyResourceCommand` | `RenameDependencyResourceCommandInput` | `appaloft dependency rename <dependencyResourceId> --name <name>` | `POST /api/dependency-resources/{dependencyResourceId}/rename` |
| Delete dependency resource | Command | `dependency-resources.delete` | `DeleteDependencyResourceCommand` | `DeleteDependencyResourceCommandInput` | `appaloft dependency delete <dependencyResourceId>` | `DELETE /api/dependency-resources/{dependencyResourceId}` |
| Create dependency resource backup | Command | `dependency-resources.create-backup` | `CreateDependencyResourceBackupCommand` | `CreateDependencyResourceBackupCommandInput` | `appaloft dependency backup create <dependencyResourceId>` | `POST /api/dependency-resources/{dependencyResourceId}/backups` |
| List dependency resource backups | Query | `dependency-resources.list-backups` | `ListDependencyResourceBackupsQuery` | `ListDependencyResourceBackupsQueryInput` | `appaloft dependency backup list <dependencyResourceId>` | `GET /api/dependency-resources/{dependencyResourceId}/backups` |
| Show dependency resource backup | Query | `dependency-resources.show-backup` | `ShowDependencyResourceBackupQuery` | `ShowDependencyResourceBackupQueryInput` | `appaloft dependency backup show <backupId>` | `GET /api/dependency-resources/backups/{backupId}` |
| Restore dependency resource backup | Command | `dependency-resources.restore-backup` | `RestoreDependencyResourceBackupCommand` | `RestoreDependencyResourceBackupCommandInput` | `appaloft dependency backup restore <backupId>` | `POST /api/dependency-resources/backups/{backupId}/restore` |
| Bind dependency to resource | Command | `resources.bind-dependency` | `BindResourceDependencyCommand` | `BindResourceDependencyCommandInput` | `appaloft resource dependency bind <resourceId>` | `POST /api/resources/{resourceId}/dependency-bindings` |
| Unbind dependency from resource | Command | `resources.unbind-dependency` | `UnbindResourceDependencyCommand` | `UnbindResourceDependencyCommandInput` | `appaloft resource dependency unbind <resourceId> <bindingId>` | `DELETE /api/resources/{resourceId}/dependency-bindings/{bindingId}` |
| Rotate resource dependency binding secret | Command | `resources.rotate-dependency-binding-secret` | `RotateResourceDependencyBindingSecretCommand` | `RotateResourceDependencyBindingSecretCommandInput` | `appaloft resource dependency rotate-secret <resourceId> <bindingId>` | `POST /api/resources/{resourceId}/dependency-bindings/{bindingId}/secret-rotations` |
| List resource dependency bindings | Query | `resources.list-dependency-bindings` | `ListResourceDependencyBindingsQuery` | `ListResourceDependencyBindingsQueryInput` | `appaloft resource dependency list <resourceId>` | `GET /api/resources/{resourceId}/dependency-bindings` |
| Show resource dependency binding | Query | `resources.show-dependency-binding` | `ShowResourceDependencyBindingQuery` | `ShowResourceDependencyBindingQueryInput` | `appaloft resource dependency show <resourceId> <bindingId>` | `GET /api/resources/{resourceId}/dependency-bindings/{bindingId}` |

Current boundary:
- resources are persisted and can be listed by project or environment
- deployment creation resolves or bootstraps a resource and destination before creating the
  deployment record
- provider-backed dependency resources remain `ResourceInstance`; they are not the same aggregate
  as project resources
- Postgres dependency resources are `ResourceInstance` records. Appaloft-managed Postgres records
  now carry provider-native realization state through a hermetic provider capability, imported
  external Postgres delete removes only Appaloft's record, and list/show output masks connection
  secrets.
- Provider-native Postgres realization is implemented through the existing
  `dependency-resources.provision-postgres`, `resources.bind-dependency`, and
  `dependency-resources.delete` boundaries. It is governed by
  [Postgres Provider-Native Realization](./specs/038-postgres-provider-native-realization/spec.md)
  and must keep provider SDK types and raw secrets out of core, contracts, CLI, Web, events, and
  read models.
- Resource dependency bindings are provider-neutral `ResourceBinding` records in this slice. Bind
  requires matching project/environment ownership, stores only safe target metadata and secret
  reference pointers, and reports safe deployment snapshot-reference readiness while runtime env
  injection remains deferred. Unbind removes only the binding association; it does not delete the
  dependency resource, external/provider database, runtime state, backup data, or historical
  snapshots.
- Dependency binding runtime injection is governed by
  [ADR-040](./decisions/ADR-040-dependency-binding-runtime-injection-boundary.md) and
  [Dependency Binding Runtime Injection](./specs/047-dependency-binding-runtime-injection/spec.md).
  The accepted target keeps `deployments.create` ids-only, materializes active ready dependency
  bindings into immutable safe runtime injection snapshots, and lets runtime target adapters deliver
  secrets without exposing raw connection values. Code Round remains open; current implementation
  still reports runtime injection as deferred.
- `resources.rotate-dependency-binding-secret` rotates only the binding-scoped safe secret
  reference/version for future deployment snapshot references. It requires explicit acknowledgement
  that historical snapshots remain unchanged, and it does not rotate provider-native database
  credentials, inject runtime environment variables, schedule redeploy, or rewrite historical
  deployment snapshots.
- Redis dependency resources are provider-neutral `ResourceInstance` records in this slice. Managed
  Redis records do not create provider-native Redis infrastructure, imported external Redis delete
  removes only Appaloft's record, list/show output masks Redis connection secrets, and ready
  imported Redis records can be bound as safe deployment snapshot references. Managed Redis binding
  remains blocked until provider-native Redis realization is specified.
- Dependency resource backup/restore is governed by
  [ADR-036](./decisions/ADR-036-dependency-resource-backup-restore-lifecycle.md) and
  [Dependency Resource Backup And Restore](./specs/039-dependency-resource-backup-restore/spec.md).
  The active operations create safe restore points and restore them in place through provider
  capabilities without exposing raw dumps, restarting workloads, redeploying Resources, or rewriting
  deployment snapshots.
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
  path, static publish directory, build target, command defaults, runtime naming intent, and
  health-check defaults belong to `ResourceRuntimeProfile`; listener ports and exposure belong to
  `ResourceNetworkProfile`.
- resource runtime naming intent is reusable resource-owned profile state. Docker/Compose adapters
  must derive unique effective runtime instance names from that profile plus deployment/resource or
  preview context instead of adding Docker-native naming fields to `deployments.create`.
- workload framework detection is an internal planning capability over the resource profile. It
  records typed source inspection evidence such as runtime family, framework, package manager or
  build tool, package/project name, lockfiles, scripts, runtime version, Dockerfile/Compose paths,
  and static/build outputs, then selects a framework/runtime planner that resolves base image and
  install/build/start/package steps. This capability is governed by
  [Workload Framework Detection And Planning](./workflows/workload-framework-detection-and-planning.md);
  it must not add framework, base-image, or package-name fields to `deployments.create`.
- static-server routing is adapter-owned runtime behavior governed by
  [ADR-031](./decisions/ADR-031-static-server-routing-policy.md): exact files and directory indexes
  are served first, missing extension-bearing assets return `404`, and extensionless app routes
  fall back to the packaged root `index.html`.
- application listener port belongs to resource network profile language as `internalPort`; UI/CLI
  may display it as "port", but deployment admission must consume it from resource state
- reverse-proxy resources can be eligible for generated default access routes when the configured
  default access domain policy is enabled; the resource still owns only the internal endpoint, not
  concrete generated-domain or edge-proxy provider behavior
- `resources.configure-access` stores resource-owned generated access preference and generated
  route path prefix for future planned/deployment route resolution; it does not change system or
  server default access policy, bind custom domains, issue certificates, or apply proxy routes to
  existing runtime state
- project/resource console ownership is governed by
  [ADR-013: Project Resource Navigation And Deployment Ownership](./decisions/ADR-013-project-resource-navigation-and-deployment-ownership.md)
- sidebar navigation may show Project -> Resource hierarchy with latest deployment status derived
  from read models/projections
- application runtime logs are resource-owned observation governed by
  [ADR-018: Resource Runtime Log Observation](./decisions/ADR-018-resource-runtime-log-observation.md);
  `resources.runtime-logs` is the active bounded and stream-capable query surface for runtime
  stdout/stderr observation through an injected runtime log reader
- resource runtime controls are resource-owned runtime operations governed by
  [ADR-038: Resource Runtime Control Ownership](./decisions/ADR-038-resource-runtime-control-ownership.md).
  `resources.runtime.stop`, `resources.runtime.start`, and `resources.runtime.restart` coordinate
  through `resource-runtime`, persist runtime-control attempts, and dispatch normalized target
  requests without creating new Deployment attempts.
- edge proxy provider behavior is resource-observable through
  `resources.proxy-configuration.preview`, governed by
  [ADR-019: Edge Proxy Provider And Observable Configuration](./decisions/ADR-019-edge-proxy-provider-and-observable-configuration.md);
  Web/API/CLI must display provider-rendered sections from the query instead of reconstructing
  proxy labels, files, or route manifests locally
- resource diagnostic summary is resource-owned observation through
  `resources.diagnostic-summary`; it composes stable ids, deployment/access/proxy/log statuses,
  source errors, safe system context, and canonical copy JSON for support/debug workflows without
  mutating deployment, runtime, or proxy state
- route intent/status and access diagnostics are a shared internal read contract across generated
  access, durable domain routes, server-applied routes, deployment snapshot routes, proxy preview,
  resource health, runtime log availability, and diagnostic copy. The contract is implemented
  through existing observation operations and does not add route mutation, deployment admission,
  domain binding lifecycle, or certificate lifecycle commands.
- the 2026-04-30 Phase 6 verification found the existing observation operations sufficient for the
  shared route/access contract; a dedicated route read or repair operation remains future work only
  if a later Spec Round proves the current surfaces are insufficient.
- edge-rendered resource access failure diagnostics are internal transport/read behavior, not a new
  public business operation. Gateway-generated 404, 502, 503, and 504 failures may be classified with
  stable Appaloft codes and rendered as safe HTML or problem responses, while owner-facing detail
  continues through `resources.health`, `resources.diagnostic-summary`, and
  `resources.proxy-configuration.preview`. The 2026-05-01 baseline keeps request-id lookup on
  existing read surfaces by allowing `ResourceAccessSummary` to carry an optional latest safe
  `resource-access-failure/v1` envelope with affected host/path, related ids, and a stable next
  action.
- `resources.access-failure-evidence.lookup` is the additive Phase 6 request-id lookup query for
  short-retention access failure evidence. It returns only safe `resource-access-failure/v1`
  envelope fields plus matched source, related ids, next action, `capturedAt`, and `expiresAt`.
  Optional `resourceId`, `hostname`, and `path` filters narrow lookup and return stable safe
  not-found copy on mismatch. It does not repair routes, mutate resources, read raw provider logs,
  or expose secrets.
- automatic route context lookup is an internal read-model service under existing access failure
  diagnostics. It resolves hostname/path to safe resource/deployment/domain/server/route context
  for evidence capture and diagnostic composition, reusing existing resource access, domain binding,
  and deployment read models. It does not add a public operation, operation-catalog row, CLI/API/Web
  surface, or route repair command.
- applied route context metadata is an additive safe output field on existing proxy preview and
  diagnostic/evidence flows. `resources.proxy-configuration.preview` may expose
  `applied-route-context/v1` metadata so API/oRPC, CLI, Web, and future tool consumers can explain
  route ownership without parsing provider-rendered labels/config. Evidence capture may prefer the
  same metadata before falling back to hostname/path lookup. This does not add a new operation key,
  command, route repair flow, or deployment admission field.
- applied route context lookup is an internal read-only capability under the same existing access
  failure diagnostics surfaces. It resolves safe `applied-route-context/v1` metadata by diagnostic
  id, route id, resource id, deployment id, host, or path where current read state allows, and
  evidence capture uses it before hostname/path fallback. It does not add an operation catalog row,
  transport route, CLI command, Web form, route repair flow, or provider-native raw metadata parser.
- companion/static access failure rendering is an internal read/adapter capability under existing
  resource access failure diagnostics. Static and one-shot CLI/SSH runtimes may package a
  provider-neutral renderer asset for `resource-access-failure/v1` envelopes when no reachable
  backend renderer service exists. This does not add a public operation, operation catalog row,
  CLI/API/Web lookup form, route repair flow, or deployment admission field.
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
- Web resource detail source/runtime/network/access/health/configuration editors are owner-scoped
  projections of the named resource commands and queries. They must make the durable future-only
  profile boundary visible to operators and must not introduce Web-only configuration state, imply
  an immediate runtime restart, create a deployment, mutate historical deployment snapshots, bind
  domains, issue certificates, or apply proxy routes.
- Resource Profile Drift Visibility is part of the `resources.show` diagnostic surface and
  repository config deploy preflight. It compares current Resource profile, normalized entry
  workflow profile, and latest deployment snapshot profile; reports sectioned drift for source,
  runtime, network, access, health, and configuration; and points to explicit remediation commands.
  It is not a separate operation and must not add profile fields or drift overrides to
  `deployments.create`.
- resource-scoped variables and secrets are resource-owned through `resources.set-variable`,
  `resources.import-variables`, and `resources.unset-variable`; these commands replace only the
  resource override layer used during future deployment snapshot materialization after environment
  precedence is resolved.
- storage volume lifecycle is implemented for Phase 7 through
  `storage-volumes.create/list/show/rename/delete` and `resources.attach-storage/detach-storage`.
  Storage attachments are Resource profile state for future deployment snapshot materialization;
  storage commands must not create deployments, mutate historical snapshots, apply live runtime
  mounts, provision provider-native volumes, or perform backup/restore.
- `.env` import is an operation-local parser for pasted content. It rejects malformed or unsafe
  variable keys, classifies secret-like keys as runtime secrets by default, rejects build-time
  secret exposure, uses last pasted duplicate wins, and reports duplicate/existing override
  metadata without returning raw secret values.
- `resources.effective-config` is the active read surface for masked resource-owned variables and
  the merged effective deployment snapshot view. It must not return plaintext secret values, and it
  includes safe override summaries so operators can see which scope won without inspecting raw
  secret material.
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
- implement Phase 7 storage volume lifecycle and resource attachment baseline from
  [Storage Volume Lifecycle And Resource Attachment](./specs/032-storage-volume-lifecycle-and-resource-attachment/spec.md)

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
- CLI SSH mode may still use brief state-root coordination for remote PGlite maintenance when the
  relink command is invoked with trusted SSH target options such as `--server-host`, but the
  command's user-visible admission semantics are governed by source-fingerprint scoped mutation
  coordination rather than by a whole-server lock. This boundary is governed by
  [ADR-028: Command Coordination Scope And Mutation Admission](./decisions/ADR-028-command-coordination-scope-and-mutation-admission.md).
- PostgreSQL/PGlite source-link storage is implemented for hosted/self-hosted and embedded state
  backends through the dedicated `packages/persistence/pg` adapter. That same durable state feeds
  `resources.delete` source-link blocker checks. API/oRPC and Web relink surfaces remain future
  work until the review UX exists.

## Source Events

Business meaning:
- source event records are safe, provider-neutral diagnostics for trusted source deliveries
- source events may dispatch ordinary deployment attempts only through Resource-owned
  auto-deploy policy and existing `deployments.create` admission
- read surfaces expose dedupe, ignored/blocked, policy, and created deployment ids without raw
  webhook payloads, signatures, provider tokens, or secret values

Implemented operations:

| Capability | Kind | Operation Key | Message | Schema | CLI | oRPC / HTTP |
| --- | --- | --- | --- | --- | --- | --- |
| Ingest source event | Command | `source-events.ingest` | `IngestSourceEventCommand` | `IngestSourceEventCommandInput` | Not exposed | `POST /api/resources/{resourceId}/source-events/generic-signed`<br>`POST /api/integrations/github/source-events` |
| List source events | Query | `source-events.list` | `ListSourceEventsQuery` | `ListSourceEventsQueryInput` | `appaloft source-event list --resource <resourceId>` | `GET /api/source-events` |
| Show source event | Query | `source-events.show` | `ShowSourceEventQuery` | `ShowSourceEventQueryInput` | `appaloft source-event show <sourceEventId> --resource <resourceId>` | `GET /api/source-events/{sourceEventId}` |

Current boundary:
- `source-events.ingest` is active for the Resource-scoped generic signed HTTP route and the
  system-scoped GitHub push webhook route. Generic signed ingestion resolves the Resource policy's
  `resource-secret:<KEY>` reference and verifies `X-Appaloft-Signature`; GitHub ingestion verifies
  `X-Hub-Signature-256` with `APPALOFT_GITHUB_WEBHOOK_SECRET`, treats `ping` as a no-op, and
  dispatches push events without `scopeResourceId` so policy matching can fan out. Neither route
  persists raw payloads, signatures, or secret values.
- `source-events.list` and `source-events.show` are read-only diagnostics over persisted source
  event records. They require project or Resource scope and must not replay events, retry failed
  dispatch, mutate auto-deploy policy, or create deployments.
- Additional provider-specific Git webhook ingestion remains deferred until provider payload
  parsing and signature extraction are specified and tested.
- Web Resource detail source-event diagnostics consume `source-events.list`; CLI and HTTP/oRPC
  read surfaces are active for operator diagnostics and API consumers.

## Deployments

Business meaning:
- deployment is the execution record of a runtime plan against a project, environment, resource,
  destination, and target/server
- the write side owns runtime plan creation, execution state, snapshot capture, and rollback intent

Implemented operations:

| Capability | Kind | Operation Key | Message | Schema | CLI | oRPC / HTTP |
| --- | --- | --- | --- | --- | --- | --- |
| Create deployment | Command | `deployments.create` | `CreateDeploymentCommand` | `CreateDeploymentCommandInput` | `appaloft deploy [path-or-source]` or ids-only flags | `POST /api/deployments` |
| Cleanup preview deployment | Command | `deployments.cleanup-preview` | `CleanupPreviewCommand` | `CleanupPreviewCommandInput` | `appaloft preview cleanup [path-or-source] --preview pull-request --preview-id pr-123` | - |
| Preview deployment plan | Query | `deployments.plan` | `DeploymentPlanQuery` | `DeploymentPlanQueryInput` | `appaloft deployments plan --project <projectId> --environment <environmentId> --resource <resourceId> --server <serverId> [--destination <destinationId>]` | `GET /api/deployments/plan` |
| List deployments | Query | `deployments.list` | `ListDeploymentsQuery` | `ListDeploymentsQueryInput` | `appaloft deployments list` | `GET /api/deployments` |
| Show deployment detail | Query | `deployments.show` | `ShowDeploymentQuery` | `ShowDeploymentQueryInput` | `appaloft deployments show <deploymentId>` | `GET /api/deployments/{deploymentId}` |
| Read deployment recovery readiness | Query | `deployments.recovery-readiness` | `DeploymentRecoveryReadinessQuery` | `DeploymentRecoveryReadinessQueryInput` | `appaloft deployments recovery-readiness <deploymentId>` | `GET /api/deployments/{deploymentId}/recovery-readiness` |
| Retry deployment attempt | Command | `deployments.retry` | `RetryDeploymentCommand` | `RetryDeploymentCommandInput` | `appaloft deployments retry <deploymentId>` | `POST /api/deployments/{deploymentId}/retry` |
| Redeploy current resource profile | Command | `deployments.redeploy` | `RedeployDeploymentCommand` | `RedeployDeploymentCommandInput` | `appaloft deployments redeploy <resourceId>` | `POST /api/resources/{resourceId}/redeploy` |
| Roll back deployment | Command | `deployments.rollback` | `RollbackDeploymentCommand` | `RollbackDeploymentCommandInput` | `appaloft deployments rollback <deploymentId> --candidate <rollbackCandidateDeploymentId>` | `POST /api/deployments/{deploymentId}/rollback` |
| Read deployment logs | Query | `deployments.logs` | `DeploymentLogsQuery` | `DeploymentLogsQueryInput` | `appaloft logs <deploymentId>` | `GET /api/deployments/{deploymentId}/logs` |
| Stream deployment events | Query | `deployments.stream-events` | `StreamDeploymentEventsQuery` | `StreamDeploymentEventsQueryInput` | `appaloft deployments events <deploymentId>` | `GET /api/deployments/{deploymentId}/events` and `GET /api/deployments/{deploymentId}/events/stream` |

Current boundary:
- `deployments.create` is the only general deployment-attempt admission command for the v1
  operation surface, and `deployments.cleanup-preview` is the only accepted narrow preview cleanup
  command. This reset is governed by
  [ADR-016: Deployment Command Surface Reset](./decisions/ADR-016-deployment-command-surface-reset.md).
- `deployments.create` accepts deployment context references only: `projectId`, `environmentId`,
  `resourceId`, `serverId`, and optional `destinationId`
- when a same-resource active deployment already exists, `deployments.create` may supersede that
  prior attempt through internal cancellation plus durable execution fencing; this does not
  reintroduce a public `deployments.cancel` command and is governed by
  [ADR-027: Deployment Supersede And Execution Fencing](./decisions/ADR-027-deployment-supersede-and-execution-fencing.md)
- `deployments.cleanup-preview` accepts only a trusted preview-scoped source fingerprint and must
  not expand into generic cancel, redeploy, rollback, or resource delete behavior. It removes
  current and stale preview runtime state for the same preview fingerprint, preview route desired
  state, and preview source-link identity only.
- `deployments.plan` is the active read-only deployment plan preview query. It uses the same
  deployment context references as `deployments.create`, resolves current Resource source/runtime/
  network/health/access profile into safe source inspection evidence, selected planner/support
  tier, Docker/OCI artifact intent, sanitized command specs, network, health, access summary,
  dependency binding snapshot-reference readiness, warnings, and unsupported reasons, and stops
  before deployment attempt creation or runtime execution.
- `deployments.plan` exposes the same runtime plan resolution contract that `deployments.create`
  uses before execution. Unsupported frameworks, unsupported runtime families, ambiguous framework
  or build-tool evidence, missing build/start/internal-port/source-root/artifact output,
  unsupported runtime target, and unsupported container-native profile cases return a blocked
  preview with stable phase, reason code, safe evidence, fix path, override path, and affected
  resource profile field when applicable.
- the Phase 5 supported catalog is closed by a zero-to-SSH acceptance harness over the existing
  operation set. The harness proves supported fixture descriptors can move from shared resource
  profile draft through `deployments.plan/v1`, ids-only `deployments.create`, runtime target
  backend selection, Docker/OCI artifact intent, and normalized readiness/health/log/access
  observation without adding a new operation or deployment command fields.
- buildpack-style detection may appear in `deployments.plan` only as adapter-owned accelerator
  evidence, support tier, builder policy, limitations, and fix paths. Explicit framework planners,
  explicit custom commands, and explicit container-native profiles take precedence, and buildpack
  fields must not be added to `deployments.create`.
- `deployments.plan` must not persist plan records, publish deployment lifecycle events, execute
  build/run/verify/proxy work, mutate runtime/server state, or accept source/runtime/network fields
  that belong to resource profile commands.
- `deployments.show` is the active immutable-attempt deployment detail surface. It returns
  deployment context, historical snapshot, safe dependency binding references copied at admission
  time, timeline, and safe related context while keeping deployment logs on `deployments.logs` and
  current health on `resources.health`.
- `deployments.stream-events` is the read-only replay/follow observation surface for one accepted
  deployment attempt. It does not replace immutable detail on `deployments.show`, full attempt
  logs on `deployments.logs`, or reintroduce `deployments.reattach` as a write command.
- `deployments.recovery-readiness` is the active read-only recovery decision surface. It returns
  retry, redeploy, rollback, rollback-candidate, blocked-reason, and recommended-action facts for
  Web, CLI, HTTP/oRPC, and future MCP/tool surfaces. Retry, redeploy, and rollback are active write
  commands that must use its freshness marker when callers have one.
- mutation coordination is scope-based, not whole-server based:
  `deployments.create` coordinates by logical resource-runtime scope and
  `deployments.cleanup-preview` coordinates by logical preview-lifecycle scope. Low-level SSH
  state-root maintenance may still require brief backend coordination, but that does not define the
  public command model. This boundary is governed by
  [ADR-028: Command Coordination Scope And Mutation Admission](./decisions/ADR-028-command-coordination-scope-and-mutation-admission.md).
- deployment source and runtime strategy are resolved from the resource's persisted
  `ResourceSourceBinding`, `ResourceRuntimeProfile`, and `ResourceNetworkProfile`
- v1 deployment runtime execution is Docker/OCI-backed. Every accepted runtime plan must build,
  pull, or otherwise reference an OCI/Docker image artifact, or materialize a Docker Compose project
  whose runnable services are backed by OCI/Docker images. This substrate rule is governed by
  [ADR-021: Docker/OCI Workload Substrate](./decisions/ADR-021-docker-oci-workload-substrate.md).
- Docker/OCI is the workload artifact substrate, not a permanent single-node-only orchestration
  boundary. Runtime target backend selection is internal to `deployments.create` and is governed by
  [ADR-023: Runtime Orchestration Target Boundary](./decisions/ADR-023-runtime-orchestration-target-boundary.md).
  The active v1 runtime target backends are single-server Docker/Compose and Docker Swarm. Swarm
  execution is selected by the registered `orchestrator-cluster`/`docker-swarm` target backend and
  still must not add provider-specific fields to deployment admission. Kubernetes remains a future
  backend behind the same command boundary.
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
- GitHub Action PR preview deploy is also an entry workflow over the same commands, not a new
  operation. A repository must add a workflow with `on.pull_request` before GitHub will attempt a
  preview deploy. The action may use trusted GitHub event context, such as PR number and head SHA,
  to create a preview-scoped source fingerprint and environment/resource selection outside
  committed config, derive preview runtime naming intent, then dispatch ids-only
  `deployments.create`.
- When preview-specific profile input does not override runtime naming, the default preview runtime
  name seed is `preview-{pr_number}` so effective runtime/container names remain human-recognizable
  while adapters still preserve uniqueness during safe replacement.
- Action/CLI profile flags are a first-class profile source alongside repository config files.
  Runtime commands, network profile, health path, non-secret env values, `ci-env:` secret
  references, and preview route policy passed as trusted inputs feed the same Quick Deploy/config
  bootstrap path and take precedence over selected config values. They must not become
  `deployments.create` fields, and workflows should not generate temporary config files for values
  already modeled as trusted flags.
- Action-only preview access uses the existing generated/default access and server-applied route
  rules. If the configured default access provider is usable, for example an `sslip` provider with a
  public IPv4 server address, the user does not need to create DNS records for the generated URL. If
  the user wants a stable hostname such as `pr-123.preview.example.com`, they must configure
  wildcard DNS to the selected server and provide the preview host template as trusted action or
  installation policy. Appaloft does not mutate public DNS in `controlPlane.mode: none`.
- Action-only PR close cleanup is supported only when a repository adds a user-authored
  `pull_request.closed` workflow that dispatches `deployments.cleanup-preview`, typically through
  `appaloft preview cleanup ...`. The command is idempotent when preview state is already absent.
  Product-grade preview environments with GitHub App webhooks, comments/checks, policy, cleanup
  retries, audit, and managed domain lifecycle still require Appaloft Cloud or a self-hosted
  control plane. That future product line must still reuse repository config and explicit
  operations rather than adding preview fields to `deployments.create`. The governing Spec Round is
  [Product-Grade Preview Deployments](./specs/046-product-grade-preview-deployments/spec.md).
  `preview-policies.configure` and `preview-policies.show` now expose CLI and HTTP/oRPC routes
  backed by durable Postgres/PGlite policy storage and safe default or configured read-model
  summaries, including same-repository, fork, secret-backed, active preview quota, and preview TTL
  settings.
  `preview-environments.list`, `preview-environments.show`, and `preview-environments.delete` now
  expose CLI and HTTP/oRPC routes over safe preview environment read models and cleanup-service
  input. Future MCP tool contracts are generated from the operation catalog for these preview
  operations. Web now exposes `/preview-policies` controls for policy readback/configuration and a
  `/preview-environments` console surface backed by preview environment list/show/delete
  operations. The GitHub source-event HTTP route now accepts verified `pull_request` deliveries for
  the first product-grade preview slice when trusted Appaloft project/environment/resource/server/
  destination/source-fingerprint context headers are supplied; repository or installation mapping
  remains future control-plane work. Managed domain lifecycle and scheduler leases remain future
  control-plane work.

Product-grade preview policy operations:

| Name | Kind | Operation key | Command/query | Input | CLI | HTTP/oRPC |
| --- | --- | --- | --- | --- | --- | --- |
| Configure preview policy | Command | `preview-policies.configure` | `ConfigurePreviewPolicyCommand` | `ConfigurePreviewPolicyCommandInput` | `appaloft preview policy configure` | `POST /api/preview-policies` |
| Show preview policy | Query | `preview-policies.show` | `ShowPreviewPolicyQuery` | `ShowPreviewPolicyQueryInput` | `appaloft preview policy show` | `POST /api/preview-policies/show` |
| List preview environments | Query | `preview-environments.list` | `ListPreviewEnvironmentsQuery` | `ListPreviewEnvironmentsQueryInput` | `appaloft preview environment list` | `GET /api/preview-environments` |
| Show preview environment | Query | `preview-environments.show` | `ShowPreviewEnvironmentQuery` | `ShowPreviewEnvironmentQueryInput` | `appaloft preview environment show` | `GET /api/preview-environments/{previewEnvironmentId}` |
| Delete preview environment | Command | `preview-environments.delete` | `DeletePreviewEnvironmentCommand` | `DeletePreviewEnvironmentCommandInput` | `appaloft preview environment delete` | `DELETE /api/resources/{resourceId}/preview-environments/{previewEnvironmentId}` |

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
- detect and plan happen inside the deployment write flow and are also visible through read-only
  query `deployments.plan` before execution
- build/package work produces or resolves the Docker/OCI image artifact used by one deployment
  attempt. Prebuilt image deployments may skip build work but still snapshot image identity.
- framework/runtime detection feeds deployment planning through typed `SourceInspectionSnapshot`
  evidence and a planner registry. Mainstream web framework support is a workload-planner concern:
  planners choose base image, package manager/build tool commands, static output or packaged
  artifacts, and start commands while keeping Web/API/CLI command schemas provider-neutral.
- cancel, manual deployment health check, and reattach are not public
  operations in the v1 surface. They must be reintroduced only after new source-of-truth specs,
  test matrices, implementation plans, and Web/API/CLI contracts are accepted.
- Deployment recovery readiness is active under
  [ADR-034: Deployment Recovery Readiness](./decisions/ADR-034-deployment-recovery-readiness.md).
  The `deployments.recovery-readiness` query is the shared read-only source for retry, redeploy,
  rollback candidate, and rollback readiness across Web, CLI, HTTP/oRPC, and future MCP/tool
  surfaces.
- `deployments.retry` creates a new deployment attempt from a failed/interrupted/canceled/
  superseded attempt's immutable snapshot intent. It does not replay old events and does not mutate
  the old attempt. Its command implementation is scoped by
  [Deployment Retry And Redeploy](./specs/040-deployment-retry-redeploy/spec.md).
- `deployments.redeploy` creates a new deployment attempt from the current Resource profile,
  effective configuration, target, and destination at admission time. It is the "deploy current
  desired state again" operation, not a retry of an old snapshot. Its command implementation is scoped by
  [Deployment Retry And Redeploy](./specs/040-deployment-retry-redeploy/spec.md).
- `deployments.rollback` creates a new rollback deployment attempt from a retained successful
  candidate's immutable snapshot and Docker/OCI artifact identity. It does not re-plan from the
  current Resource profile and does not roll back databases, volumes, or external dependencies. Its
  command implementation is scoped by
  [Deployment Rollback](./specs/041-deployment-rollback/spec.md).
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
- `deployments.retry`
- `deployments.redeploy`
- `deployments.rollback`

## Operator Work

Business meaning:
- operator work is the read-only visibility surface for long-running or background Appaloft work
- it aggregates existing read models before a full durable outbox/inbox/job table exists
- it helps operators decide which diagnostic or manual review path to use

Implemented operations:

| Capability | Kind | Operation Key | Message | Schema | CLI | oRPC / HTTP |
| --- | --- | --- | --- | --- | --- | --- |
| List operator work ledger | Query | `operator-work.list` | `ListOperatorWorkQuery` | `ListOperatorWorkQueryInput` | `appaloft work list` | `GET /api/operator-work` |
| Show operator work item | Query | `operator-work.show` | `ShowOperatorWorkQuery` | `ShowOperatorWorkQueryInput` | `appaloft work show <workId>` | `GET /api/operator-work/{workId}` |

Current boundary:
- `operator-work.list` and `operator-work.show` are read-only; they do not retry, cancel, mark
  recovered, dead-letter, prune, or clean up work
- the current slice reads the internal durable process attempt journal first, then aggregates
  deployment attempts, latest proxy bootstrap state, and latest certificate attempts from existing
  read models for compatibility
- remote-state locks, source links, route realization attempts, runtime maintenance jobs, and
  worker status remain future extensions when their persisted read models exist
- next actions are guidance such as diagnostic/manual review/no-action, not hidden mutation
  affordances
- work item detail must not expose raw logs, private keys, raw environment values, certificate
  material, credential-bearing command lines, or provider-native output

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
| Configure default access domain policy | Command | `default-access-domain-policies.configure` | `ConfigureDefaultAccessDomainPolicyCommand` | `ConfigureDefaultAccessDomainPolicyCommandInput` | `appaloft default-access configure --scope system\|deployment-target [--server <serverId>] --mode disabled\|provider\|custom-template [--provider <key>] [--template-ref <ref>]` | `POST /api/default-access-domain-policies` |
| List default access domain policies | Query | `default-access-domain-policies.list` | `ListDefaultAccessDomainPoliciesQuery` | `ListDefaultAccessDomainPoliciesQueryInput` | `appaloft default-access list` | `GET /api/default-access-domain-policies` |
| Show default access domain policy | Query | `default-access-domain-policies.show` | `ShowDefaultAccessDomainPolicyQuery` | `ShowDefaultAccessDomainPolicyQueryInput` | `appaloft default-access show --scope system\|deployment-target [--server <serverId>]` | `GET /api/default-access-domain-policies/show` |
| Create domain binding | Command | `domain-bindings.create` | `CreateDomainBindingCommand` | `CreateDomainBindingCommandInput` | `appaloft domain-binding create <domainName> [--redirect-to <domain>] [--redirect-status 301\|302\|307\|308]` | `POST /api/domain-bindings` |
| Show domain binding | Query | `domain-bindings.show` | `ShowDomainBindingQuery` | `ShowDomainBindingQueryInput` | `appaloft domain-binding show <domainBindingId>` | `GET /api/domain-bindings/{domainBindingId}` |
| Configure domain binding route behavior | Command | `domain-bindings.configure-route` | `ConfigureDomainBindingRouteCommand` | `ConfigureDomainBindingRouteCommandInput` | `appaloft domain-binding configure-route <domainBindingId> [--redirect-to <domain>] [--redirect-status 301\|302\|307\|308]` | `POST /api/domain-bindings/{domainBindingId}/route` |
| Confirm domain binding ownership | Command | `domain-bindings.confirm-ownership` | `ConfirmDomainBindingOwnershipCommand` | `ConfirmDomainBindingOwnershipCommandInput` | `appaloft domain-binding confirm-ownership <domainBindingId> [--verification-mode dns\|manual]` | `POST /api/domain-bindings/{domainBindingId}/ownership-confirmations` |
| List domain bindings | Query | `domain-bindings.list` | `ListDomainBindingsQuery` | `ListDomainBindingsQueryInput` | `appaloft domain-binding list` | `GET /api/domain-bindings` |
| Check domain binding delete safety | Query | `domain-bindings.delete-check` | `CheckDomainBindingDeleteSafetyQuery` | `CheckDomainBindingDeleteSafetyQueryInput` | `appaloft domain-binding delete-check <domainBindingId>` | `GET /api/domain-bindings/{domainBindingId}/delete-check` |
| Delete domain binding | Command | `domain-bindings.delete` | `DeleteDomainBindingCommand` | `DeleteDomainBindingCommandInput` | `appaloft domain-binding delete <domainBindingId> --confirm <domainBindingId>` | `DELETE /api/domain-bindings/{domainBindingId}` |
| Retry domain binding ownership verification | Command | `domain-bindings.retry-verification` | `RetryDomainBindingVerificationCommand` | `RetryDomainBindingVerificationCommandInput` | `appaloft domain-binding retry-verification <domainBindingId>` | `POST /api/domain-bindings/{domainBindingId}/verification-retries` |
| Issue or renew certificate | Command | `certificates.issue-or-renew` | `IssueOrRenewCertificateCommand` | `IssueOrRenewCertificateCommandInput` | `appaloft certificate issue-or-renew <domainBindingId>` | `POST /api/certificates/issue-or-renew` |
| List certificates | Query | `certificates.list` | `ListCertificatesQuery` | `ListCertificatesQueryInput` | `appaloft certificate list` | `GET /api/certificates` |
| Show certificate | Query | `certificates.show` | `ShowCertificateQuery` | `ShowCertificateQueryInput` | `appaloft certificate show <certificateId>` | `GET /api/certificates/{certificateId}` |
| Retry certificate | Command | `certificates.retry` | `RetryCertificateCommand` | `RetryCertificateCommandInput` | `appaloft certificate retry <certificateId>` | `POST /api/certificates/{certificateId}/retries` |
| Revoke certificate | Command | `certificates.revoke` | `RevokeCertificateCommand` | `RevokeCertificateCommandInput` | `appaloft certificate revoke <certificateId>` | `POST /api/certificates/{certificateId}/revoke` |
| Delete certificate | Command | `certificates.delete` | `DeleteCertificateCommand` | `DeleteCertificateCommandInput` | `appaloft certificate delete <certificateId> --confirm <certificateId>` | `DELETE /api/certificates/{certificateId}` |

Current boundary:
- `domain-bindings.create` creates durable binding state, persists the first manual verification
  attempt, records initial DNS observation metadata, publishes `domain-binding-requested`, and
  returns accepted `ok({ id })`
- `domain-bindings.confirm-ownership` confirms the current verification attempt, defaults to
  Appaloft-observed DNS evidence before moving the binding to `bound`, supports explicit manual
  override, publishes `domain-bound`, and returns `ok({ id, verificationAttemptId })`
- `domain-binding-requested` is a request event and does not mean the domain is bound, certificate
  issuance succeeded, or traffic is ready
- `default-access-domain-policies.list` and `default-access-domain-policies.show` expose durable
  policy readback only. A missing durable record returns `policy = null` for the scoped show query
  and does not imply generated access is disabled; static installation configuration remains a
  fallback inside route resolution until the operator persists a policy.
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
- `certificates.import` is an active manual-certificate operation for manual-policy bindings:
  it publishes `certificate-imported` instead of `certificate-issued`, is exposed through the
  operation catalog plus CLI/API entrypoints and the resource-scoped Web entrypoint, and now uses
  durable PG/PGlite-backed secret persistence rather than placeholder refs
- the default shell composition intentionally registers an unavailable certificate provider until a
  real provider adapter is configured; this records retryable `certificate_provider_unavailable`
  state after accepted issue requests rather than pretending HTTPS is active
- `certificates.list` exposes certificate and latest attempt state for CLI, API, and future Web
  readiness views
- `certificates.show` exposes one certificate's safe metadata, source, active lifecycle status, and
  attempt history without exposing PEM, private keys, passphrases, secret refs, provider
  credentials, or raw provider responses
- `certificates.retry` creates a new provider-issued certificate attempt from the latest retryable
  managed failure by reusing the `certificates.issue-or-renew` path and publishing
  `certificate-requested`; it does not retry domain binding ownership verification and does not
  replay old events
- imported certificates are not retried by `certificates.retry`; operators replace imported
  material by running `certificates.import` again with new secret-bearing input
- `certificates.revoke` stops Appaloft from using a certificate for managed TLS. Provider-issued
  certificates coordinate through the provider boundary when supported; imported certificates record
  Appaloft-local TLS disablement and must not claim external CA revocation
- `certificates.delete` removes a non-active certificate from visible active lifecycle while
  retaining necessary audit history. It does not revoke certificates, delete domain bindings,
  generated access, deployment snapshots, or server-applied route audit
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
- generated default access policy editing is exposed through
  `default-access-domain-policies.configure` for system default and deployment-target override
- the command persists provider-neutral policy state only. It does not rewrite existing deployment
  route snapshots or mutate durable domain bindings/certificates
- Web exposes a system-scope form on the servers page and a deployment-target override form on the
  server detail page over the same command; current durable policy readback remains follow-up
- `domain-bindings.list` exposes the read model used by CLI, API, and Web to observe accepted
  binding records and their verification status
- `domain-bindings.show` reads one binding with generated access fallback, selected route/access
  diagnostic context, proxy readiness, delete safety, and read-only certificate readiness context
- `domain-bindings.configure-route` is the explicit route-behavior update operation for switching
  between serving traffic and redirecting to an existing served canonical binding in the same
  owner/path scope; generic `domain-bindings.update` remains forbidden
- `domain-bindings.delete-check` and `domain-bindings.delete` preserve generated access,
  deployment snapshot history, server-applied route audit, and certificate history. Delete is
  blocked while active certificate state is attached and does not revoke/delete certificates.
- `domain-bindings.retry-verification` creates a new ownership verification attempt and resets DNS
  observation to a waitable pending state when expected targets are known. It does not retry
  certificate issuance, route repair, deployment retry, redeploy, or rollback.
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
- preview/show resource proxy configuration
- live CA revocation coverage beyond the provider-neutral `certificates.revoke` port implementation
- route repair/reconcile lifecycle when provider route attempts need an explicit public operation

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
- `@appaloft/ai-mcp` generates one serializable tool descriptor per operation catalog key
- generated tool names are operation-key based, for example `projects_create`,
  `environments_create`, `deployments_plan`, and `deployments_create`
- future MCP server handlers must dispatch through the same command/query messages and input schemas,
  not through a separate tool-only operation list

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
