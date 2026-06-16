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
- MCP / tool interfaces

Those interfaces must not invent business actions independently. Every business capability must map
to an explicit application operation.

## Core Rules

1. Every business capability must be represented by an explicit `Command` or `Query`.
2. Every transport must dispatch through that operation. No transport may call a repository or use
   case directly.
3. CLI arguments, oRPC input, HTTP input, and MCP tool input must reuse the operation input
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

CLI login, logout, profile, and context selection for remote control-plane client mode are
entrypoint/session-management affordances, not standalone business operations in the CLI remote
client bridge. They may choose where later CLI business commands dispatch, but those later commands
must still map to the operation keys and schemas in this file. The CLI remote dispatcher uses this
catalog and generated SDK descriptors for non-streaming remote-capable operations; it must not add
transport-only schemas or login/context operation aliases. Adding a product-level auth
command/query for login or token issuance would require its own ADR/spec and operation-catalog
entry.

## Business Capability Model

The current Appaloft core is organized into nine implemented capability groups:
- Projects
- Deployment Targets
- Environments
- Resources
- Deployments
- Routing / Domain Bindings
- Operator Work
- System operations
- Identity Governance / Self-Hosted Auth

Each group below lists the currently implemented business operations.
Identity governance and self-hosted auth operations listed here are active only when they are also
present in
[`operation-catalog.ts`](/Users/nichenqin/projects/appaloft/packages/application/src/operation-catalog.ts)
with matching command/query messages and transport declarations.

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
| List projects | Product-session member query | `projects.list` | `ListProjectsQuery` | `ListProjectsQueryInput` | `appaloft project list` | `GET /api/projects` |
| Count projects | Product-session member query | `projects.count` | `CountProjectsQuery` | `CountProjectsQueryInput` | `appaloft project count` | `GET /api/projects/count` |
| Show project | Product-session member query | `projects.show` | `ShowProjectQuery` | `ShowProjectQueryInput` | `appaloft project show <projectId>` | `GET /api/projects/{projectId}` |
| Rename project | Command | `projects.rename` | `RenameProjectCommand` | `RenameProjectCommandInput` | `appaloft project rename <projectId> --name <name>` | `POST /api/projects/{projectId}/rename` |
| Reorder projects | Command | `projects.reorder` | `ReorderProjectsCommand` | `ReorderProjectsCommandInput` | `appaloft project reorder --project-ids <ids>` | `POST /api/projects/reorder` |
| Set project description | Command | `projects.set-description` | `SetProjectDescriptionCommand` | `SetProjectDescriptionCommandInput` | `appaloft project set-description <projectId>` | `POST /api/projects/{projectId}/description` |
| Archive project | Command | `projects.archive` | `ArchiveProjectCommand` | `ArchiveProjectCommandInput` | `appaloft project archive <projectId>` | `POST /api/projects/{projectId}/archive` |
| Restore project | Command | `projects.restore` | `RestoreProjectCommand` | `RestoreProjectCommandInput` | `appaloft project restore <projectId>` | `POST /api/projects/{projectId}/restore` |
| Check project delete safety | Query | `projects.delete-check` | `CheckProjectDeleteSafetyQuery` | `CheckProjectDeleteSafetyQueryInput` | `appaloft project delete-check <projectId>` | `GET /api/projects/{projectId}/delete-check` |
| Delete project | Command | `projects.delete` | `DeleteProjectCommand` | `DeleteProjectCommandInput` | `appaloft project delete <projectId> --confirm <projectId>` | `DELETE /api/projects/{projectId}` |

Current boundary:
- a project is currently metadata plus deployment ownership
- project lifecycle state is explicit; archived projects remain readable, reject new
  project-scoped mutations and deployment admission, and can be restored through `projects.restore`
- `projects.delete-check` and guarded `projects.delete` soft-delete only archived projects with no
  retained blockers; empty environments are auto-archived through the environment lifecycle and
  delete does not cascade other child cleanup or erase support/audit history
- project detail surfaces should make resources the primary list and resource creation the primary
  write affordance
- project-level "view deployments" is a secondary rollup over resources
- project detail/settings may compose read-only resource, environment, deployment, and access
  rollups, but those rollups are not `projects.show` output and do not make Project the owner of
  child mutation or runtime state
- project rename/set-description/archive must not create deployments, mutate historical deployment
  snapshots, or immediately affect runtime state
- project delete is guarded by `projects.delete-check`, requires an archived project, auto-archives
  empty environments, and soft deletes the project tombstone when no retained child/support blockers
  remain
- project-level "new deployment" must be labeled and implemented as Quick Deploy or another entry
  workflow that selects or creates a resource before dispatching `deployments.create`
- project source binding is not yet a first-class aggregate concept
- GitHub repository import currently feeds deployment source selection, not a persisted project
  source binding
- project/resource navigation is governed by
  [ADR-013: Project Resource Navigation And Deployment Ownership](./decisions/ADR-013-project-resource-navigation-and-deployment-ownership.md)

Core next operations expected here:
- `projects.configure-source` if project source binding becomes a first-class aggregate concept

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
| List deployment targets | Product-session member query | `servers.list` | `ListServersQuery` | `ListServersQueryInput` | `appaloft server list` | `GET /api/servers` |
| Count deployment targets | Product-session member query | `servers.count` | `CountServersQuery` | `CountServersQueryInput` | `appaloft server count` | `GET /api/servers/count` |
| Show deployment target | Product-session member query | `servers.show` | `ShowServerQuery` | `ShowServerQueryInput` | `appaloft server show <serverId>` | `GET /api/servers/{serverId}` |
| Inspect deployment target capacity | Query | `servers.capacity.inspect` | `InspectServerCapacityQuery` | `InspectServerCapacityQueryInput` | `appaloft server capacity inspect <serverId>` | `GET /api/servers/{serverId}/capacity` |
| Inspect runtime usage attribution | Query | `runtime-usage.inspect` | `InspectRuntimeUsageQuery` | `InspectRuntimeUsageQueryInput` | `appaloft runtime-usage inspect <scope>` | `GET /api/runtime-usage/inspect` |
| Rename deployment target | Command | `servers.rename` | `RenameServerCommand` | `RenameServerCommandInput` | `appaloft server rename <serverId> --name <name>` | `POST /api/servers/{serverId}/rename` |
| Configure deployment target edge proxy | Command | `servers.configure-edge-proxy` | `ConfigureServerEdgeProxyCommand` | `ConfigureServerEdgeProxyCommandInput` | `appaloft server proxy configure <serverId> --kind none\|traefik\|caddy` | `POST /api/servers/{serverId}/edge-proxy/configuration` |
| Deactivate deployment target | Command | `servers.deactivate` | `DeactivateServerCommand` | `DeactivateServerCommandInput` | `appaloft server deactivate <serverId>` | `POST /api/servers/{serverId}/deactivate` |
| Check deployment target delete safety | Query | `servers.delete-check` | `CheckServerDeleteSafetyQuery` | `CheckServerDeleteSafetyQueryInput` | `appaloft server delete-check <serverId>` | `GET /api/servers/{serverId}/delete-check` |
| Delete deployment target | Command | `servers.delete` | `DeleteServerCommand` | `DeleteServerCommandInput` | `appaloft server delete <serverId> --confirm <serverId>` | `DELETE /api/servers/{serverId}` |
| Test deployment target connectivity | Command | `servers.test-connectivity` | `TestServerConnectivityCommand` | `TestServerConnectivityCommandInput` | `appaloft server test <serverId>`; `appaloft server doctor <serverId>` | `POST /api/servers/{serverId}/connectivity-tests` |
| Test draft deployment target connectivity | Command | `servers.test-draft-connectivity` | `TestServerConnectivityCommand` | `TestServerConnectivityCommandInput` | — | `POST /api/servers/connectivity-tests` |
| Repair deployment target edge proxy | Command | `servers.bootstrap-proxy` | `BootstrapServerProxyCommand` | `BootstrapServerProxyCommandInput` | `appaloft server proxy repair <serverId>` | `POST /api/servers/{serverId}/edge-proxy/bootstrap` |
| Prepare deployment target runtime | Command | `servers.prepare-runtime` | `PrepareServerRuntimeCommand` | `PrepareServerRuntimeCommandInput` | `appaloft server runtime prepare <serverId>` | `POST /api/servers/{serverId}/runtime/prepare` |
| Create reusable SSH credential | Command | `credentials.create-ssh` | `CreateSshCredentialCommand` | `CreateSshCredentialCommandInput` | `appaloft server credential-create` | `POST /api/credentials/ssh` |
| List reusable SSH credentials | Query | `credentials.list-ssh` | `ListSshCredentialsQuery` | `ListSshCredentialsQueryInput` | `appaloft server credential-list` | `GET /api/credentials/ssh` |
| Show reusable SSH credential usage | Query | `credentials.show` | `ShowSshCredentialQuery` | `ShowSshCredentialQueryInput` | `appaloft server credential-show <credentialId>` | `GET /api/credentials/ssh/{credentialId}` |
| Delete reusable SSH credential when unused | Command | `credentials.delete-ssh` | `DeleteSshCredentialCommand` | `DeleteSshCredentialCommandInput` | `appaloft server credential-delete <credentialId> --confirm <credentialId>` | `DELETE /api/credentials/ssh/{credentialId}` |
| Rotate reusable SSH credential in place | Command | `credentials.rotate-ssh` | `RotateSshCredentialCommand` | `RotateSshCredentialCommandInput` | `appaloft server credential-rotate <credentialId> --private-key-file <path> --confirm <credentialId>` | `POST /api/credentials/ssh/{credentialId}/rotate` |
| Open deployment target terminal | Command | `terminal-sessions.open` | `OpenTerminalSessionCommand` | `OpenTerminalSessionCommandInput` | `appaloft server terminal <serverId>` | `POST /api/terminal-sessions`; attach: `WS /api/terminal-sessions/{sessionId}/attach` |
| List terminal sessions | Query | `terminal-sessions.list` | `ListTerminalSessionsQuery` | `ListTerminalSessionsQueryInput` | `appaloft terminal-session list` | `GET /api/terminal-sessions` |
| Show terminal session | Query | `terminal-sessions.show` | `ShowTerminalSessionQuery` | `ShowTerminalSessionQueryInput` | `appaloft terminal-session show <sessionId>` | `GET /api/terminal-sessions/{sessionId}` |
| Close terminal session | Command | `terminal-sessions.close` | `CloseTerminalSessionCommand` | `CloseTerminalSessionCommandInput` | `appaloft terminal-session close <sessionId>` | `POST /api/terminal-sessions/{sessionId}/close` |
| Expire terminal sessions | Command | `terminal-sessions.expire` | `ExpireTerminalSessionsCommand` | `ExpireTerminalSessionsCommandInput` | `appaloft terminal-session expire` | `POST /api/terminal-sessions/expire` |
| Prune deployment target capacity | Command | `servers.capacity.prune` | `PruneServerCapacityCommand` | `PruneServerCapacityCommandInput` | `appaloft server capacity prune <serverId> --before <iso> [--target <id-or-target>]` | `POST /api/servers/{serverId}/capacity/prune` |
| Configure scheduled runtime prune policy | Command | `scheduled-runtime-prune-policies.configure` | `ConfigureScheduledRuntimePrunePolicyCommand` | `ConfigureScheduledRuntimePrunePolicyCommandInput` | `appaloft server capacity policy configure --scope <scope> --retention-days <days>` | `POST /api/servers/capacity/policies` |
| List scheduled runtime prune policies | Query | `scheduled-runtime-prune-policies.list` | `ListScheduledRuntimePrunePoliciesQuery` | `ListScheduledRuntimePrunePoliciesQueryInput` | `appaloft server capacity policy list` | `GET /api/servers/capacity/policies` |
| Show scheduled runtime prune policy | Query | `scheduled-runtime-prune-policies.show` | `ShowScheduledRuntimePrunePolicyQuery` | `ShowScheduledRuntimePrunePolicyQueryInput` | `appaloft server capacity policy show <policyId>` | `GET /api/servers/capacity/policies/{policyId}` |
| List runtime monitoring samples | Query | `runtime-monitoring.samples.list` | `ListRuntimeMonitoringSamplesQuery` | `ListRuntimeMonitoringSamplesQueryInput` | `appaloft runtime-monitoring samples <scope> --from <iso> --to <iso>` | `GET /api/runtime-monitoring/samples` |
| Read runtime monitoring rollup | Query | `runtime-monitoring.rollup` | `RuntimeMonitoringRollupQuery` | `RuntimeMonitoringRollupQueryInput` | `appaloft runtime-monitoring rollup <scope> --from <iso> --to <iso> --bucket <bucket>` | `GET /api/runtime-monitoring/rollup` |
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
- `runtime-usage.inspect` is a read-only attribution query. The first active adapter slice supports
  server scope by translating the safe capacity diagnostic into `runtime-usage.inspect/v1` totals,
  artifacts, warnings, and source errors. Project, environment, resource, and deployment scopes
  resolve current deployment/server context through read models and return partial attribution
  rather than guessed totals when ownership evidence is incomplete. Appaloft-managed Docker
  container labels can provide current artifact ownership, container writable bytes, deployment or
  resource rollups, and runtime ids when the labels are present. Source workspace metadata can
  provide deployment-id evidence that is enriched from deployment read models before scope rollups
  are returned; retained runtime identity metadata can add runtime ids when present. The query must
  remain the point-in-time current attribution boundary.
- `runtime-monitoring.samples.list` and `runtime-monitoring.rollup` are active read queries for the
  first retained monitoring slice. They read persisted monitoring samples and deployment marker read
  models only; they must not collect new samples, connect to targets, mutate runtime state, enforce
  thresholds, or copy runtime/deployment log lines into monitoring records.

Runtime monitoring operations:

| Capability | Kind | Operation Key | Current state |
| --- | --- | --- | --- |
| List runtime monitoring samples | Query | `runtime-monitoring.samples.list` | Application, PG/PGlite read model and sample write/prune stores, internal collector service with process visibility through the runtime-usage query boundary, disabled-by-default active-server/resource/deployment/project/environment collector runner, scheduled history retention dispatch, CLI, HTTP/oRPC, server/resource Web Monitor readback, SDK operation metadata, generated MCP/tool descriptor, MCP/tool handler dispatch through the shared query boundary, MCP-facing tool server registration, WebView Observe surface verification, operation docs metadata, and public diagnostics docs implemented. |
| Read runtime monitoring rollups | Query | `runtime-monitoring.rollup` | Application rollup service, PG deployment marker read model, PG/PGlite sample write/prune stores, internal collector service with process visibility through the runtime-usage query boundary, disabled-by-default active-server/resource/deployment/project/environment collector runner, scheduled history retention dispatch, CLI, HTTP/oRPC, server/resource Web Monitor rollup summary/marker readback, Project detail project/selected-environment rollup-only readback, SDK operation metadata, generated MCP/tool descriptor, MCP/tool handler dispatch through the shared query boundary, MCP-facing tool server registration, WebView Observe surface verification, operation docs metadata, and public diagnostics docs implemented. |
| Configure runtime monitoring thresholds | Command | `runtime-monitoring.thresholds.configure` | Application command/use case, PG/PGlite exact-scope policy persistence, CLI, HTTP/oRPC, server/resource Web Monitor exact-scope CPU/memory/disk threshold configuration, SDK metadata, and generated MCP/tool descriptor/handler dispatch implemented. Writes stay exact-scope; Web creates an exact-scope override when saving inherited readback. Thresholds are non-enforcing observation policy only. |
| Show runtime monitoring thresholds | Query | `runtime-monitoring.thresholds.show` | Application query service, PG/PGlite policy readback/evaluation, sample-evidence-based parent policy inheritance, CLI, HTTP/oRPC, server/resource Web Monitor readback, SDK metadata, and generated MCP/tool descriptor/handler dispatch implemented. Readback only, no runtime enforcement. |

- Repository config `monitoring.thresholds` is governed by
  [ADR-072](./decisions/ADR-072-repository-config-runtime-monitoring-thresholds.md) and
  [spec 081](./specs/081-repository-config-runtime-monitoring-thresholds/spec.md). It is a
  workflow/profile extension over `runtime-monitoring.thresholds.configure` and
  `runtime-monitoring.thresholds.show`, not a new operation key; it must reconcile exact
  Resource-scope non-enforcing threshold policy before ids-only deployment admission.
- Runtime monitoring is governed by
  [ADR-063: Runtime Monitoring Observation Boundary](./decisions/ADR-063-runtime-monitoring-observation-boundary.md)
  [Runtime Monitoring Observation Boundary](./specs/069-runtime-monitoring-observation-boundary/spec.md),
  and
  [Runtime Monitoring Observation Test Matrix](./testing/runtime-monitoring-observation-test-matrix.md).
  It may add bounded samples, rollups, charts, deployment markers, log/event/diagnostic links, and
  non-enforcing threshold state. It must not become Prometheus-compatible storage, arbitrary metric
  ingestion, APM/tracing, dashboard building, alert routing, billing analytics, quota, runtime
  sizing, cleanup, or enforcement.
- `servers.capacity.prune` is a runtime target maintenance mutation. It dry-runs by default,
  requires a cutoff, and may delete only safe target-owned stopped containers or materialized
  workspace candidates whose ownership, age, active-runtime, and rollback-safety evidence passes.
  Docker build-cache, unused-image, and remote-state marker pruning require explicit category
  opt-in; Docker categories use filtered Docker prune commands, while remote-state marker cleanup is
  limited to old journals, backup archives, recovery markers, and recovered-lock archives under
  fixed state-root subdirectories. It must preserve active runtimes, rollback candidates, Docker
  volumes, Appaloft state roots, live remote `ssh-pglite` state, audit/events, deployment
  snapshots, logs, routes, resource state, server state, dependencies, and storage volumes. Server
  Web capacity controls call the same query/command boundary and keep destructive prune behind an
  explicit operator action after a dry-run preview.
- `scheduled-runtime-prune-policies.configure/list/show` are the application command/query surface
  for scheduled runtime prune policy records. They persist and read only safe retention policy
  fields used by the scheduler; CLI and HTTP/oRPC adapters dispatch through command and query buses
  and reuse the shared command/query schemas.
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
| List environments | Product-session member query | `environments.list` | `ListEnvironmentsQuery` | `ListEnvironmentsQueryInput` | `appaloft env list` | `GET /api/environments` |
| Count environments | Product-session member query | `environments.count` | `CountEnvironmentsQuery` | `CountEnvironmentsQueryInput` | `appaloft env count` | `GET /api/environments/count` |
| Show environment | Product-session member query | `environments.show` | `ShowEnvironmentQuery` | `ShowEnvironmentQueryInput` | `appaloft env show <environmentId>` | `GET /api/environments/{environmentId}` |
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
| Reset resource health policy | Command | `resources.reset-health` | `ResetResourceHealthCommand` | `ResetResourceHealthCommandInput` | `appaloft resource reset-health <resourceId>` | `POST /api/resources/{resourceId}/health-policy/reset` |
| Configure resource runtime profile | Command | `resources.configure-runtime` | `ConfigureResourceRuntimeCommand` | `ConfigureResourceRuntimeCommandInput` | `appaloft resource configure-runtime <resourceId>` | `POST /api/resources/{resourceId}/runtime-profile` |
| Configure resource network profile | Command | `resources.configure-network` | `ConfigureResourceNetworkCommand` | `ConfigureResourceNetworkCommandInput` | `appaloft resource configure-network <resourceId>` | `POST /api/resources/{resourceId}/network-profile` |
| Configure resource access profile | Command | `resources.configure-access` | `ConfigureResourceAccessCommand` | `ConfigureResourceAccessCommandInput` | `appaloft resource configure-access <resourceId>` | `POST /api/resources/{resourceId}/access-profile` |
| Configure resource auto-deploy policy | Command | `resources.configure-auto-deploy` | `ConfigureResourceAutoDeployCommand` | `ConfigureResourceAutoDeployCommandInput` | `appaloft resource auto-deploy <resourceId>` | `POST /api/resources/{resourceId}/auto-deploy` |
| Set resource variable | Command | `resources.set-variable` | `SetResourceVariableCommand` | `SetResourceVariableCommandInput` | `appaloft resource set-variable <resourceId> <key> <value>` | `POST /api/resources/{resourceId}/variables` |
| Create resource secret reference | Command | `resources.secrets.create` | `CreateResourceSecretReferenceCommand` | `CreateResourceSecretReferenceCommandInput` | `appaloft resource secrets create <resourceId> <key> <value>` | `POST /api/resources/{resourceId}/secrets` |
| Rotate resource secret reference | Command | `resources.secrets.rotate` | `RotateResourceSecretReferenceCommand` | `RotateResourceSecretReferenceCommandInput` | `appaloft resource secrets rotate <resourceId> <key> <value>` | `POST /api/resources/{resourceId}/secrets/{key}` |
| Delete resource secret reference | Command | `resources.secrets.delete` | `DeleteResourceSecretReferenceCommand` | `DeleteResourceSecretReferenceCommandInput` | `appaloft resource secrets delete <resourceId> <key>` | `DELETE /api/resources/{resourceId}/secrets/{key}` |
| Import resource variables | Command | `resources.import-variables` | `ImportResourceVariablesCommand` | `ImportResourceVariablesCommandInput` | `appaloft resource import-variables <resourceId> --content <dotenv>` | `POST /api/resources/{resourceId}/variables/import` |
| Unset resource variable | Command | `resources.unset-variable` | `UnsetResourceVariableCommand` | `UnsetResourceVariableCommandInput` | `appaloft resource unset-variable <resourceId> <key>` | `DELETE /api/resources/{resourceId}/variables/{key}` |
| Archive resource | Command | `resources.archive` | `ArchiveResourceCommand` | `ArchiveResourceCommandInput` | `appaloft resource archive <resourceId>` | `POST /api/resources/{resourceId}/archive` |
| Restore resource | Command | `resources.restore` | `RestoreResourceCommand` | `RestoreResourceCommandInput` | `appaloft resource restore <resourceId>` | `POST /api/resources/{resourceId}/restore` |
| Check resource delete safety | Query | `resources.delete-check` | `CheckResourceDeleteSafetyQuery` | `CheckResourceDeleteSafetyQueryInput` | `appaloft resource delete-check <resourceId>` | `GET /api/resources/{resourceId}/delete-check` |
| Delete resource | Command | `resources.delete` | `DeleteResourceCommand` | `DeleteResourceCommandInput` | `appaloft resource delete <resourceId> --confirm-slug <slug>` | `DELETE /api/resources/{resourceId}` |
| List resources | Product-session member query | `resources.list` | `ListResourcesQuery` | `ListResourcesQueryInput` | `appaloft resource list` | `GET /api/resources` |
| Count resources | Product-session member query | `resources.count` | `CountResourcesQuery` | `CountResourcesQueryInput` | `appaloft resource count` | `GET /api/resources/count` |
| Show resource profile | Product-session member query | `resources.show` | `ShowResourceQuery` | `ShowResourceQueryInput` | `appaloft resource show <resourceId>` | `GET /api/resources/{resourceId}` |
| Read resource effective configuration | Query | `resources.effective-config` | `ResourceEffectiveConfigQuery` | `ResourceEffectiveConfigQueryInput` | `appaloft resource effective-config <resourceId>` | `GET /api/resources/{resourceId}/effective-config` |
| List resource secret references | Query | `resources.secrets.list` | `ListResourceSecretReferencesQuery` | `ListResourceSecretReferencesQueryInput` | `appaloft resource secrets list <resourceId>` | `GET /api/resources/{resourceId}/secrets` |
| Show resource secret reference | Query | `resources.secrets.show` | `ShowResourceSecretReferenceQuery` | `ShowResourceSecretReferenceQueryInput` | `appaloft resource secrets show <resourceId> <key>` | `GET /api/resources/{resourceId}/secrets/{key}` |
| Read resource runtime logs | Query | `resources.runtime-logs` | `ResourceRuntimeLogsQuery` | `ResourceRuntimeLogsQueryInput` | `appaloft resource logs <resourceId>` | `GET /api/resources/{resourceId}/runtime-logs`; stream: `GET /api/resources/{resourceId}/runtime-logs/stream` |
| Stop resource runtime | Command | `resources.runtime.stop` | `StopResourceRuntimeCommand` | `StopResourceRuntimeCommandInput` | `appaloft resource runtime stop <resourceId>` | `POST /api/resources/{resourceId}/runtime/stop` |
| Start resource runtime | Command | `resources.runtime.start` | `StartResourceRuntimeCommand` | `StartResourceRuntimeCommandInput` | `appaloft resource runtime start <resourceId>` | `POST /api/resources/{resourceId}/runtime/start` |
| Restart resource runtime | Command | `resources.runtime.restart` | `RestartResourceRuntimeCommand` | `RestartResourceRuntimeCommandInput` | `appaloft resource runtime restart <resourceId>` | `POST /api/resources/{resourceId}/runtime/restart` |
| Preview resource proxy configuration | Query | `resources.proxy-configuration.preview` | `ResourceProxyConfigurationPreviewQuery` | `ResourceProxyConfigurationPreviewQueryInput` | `appaloft resource proxy-config <resourceId>` | `GET /api/resources/{resourceId}/proxy-configuration` |
| Read resource diagnostic summary | Query | `resources.diagnostic-summary` | `ResourceDiagnosticSummaryQuery` | `ResourceDiagnosticSummaryQueryInput` | `appaloft resource diagnose <resourceId>` | `GET /api/resources/{resourceId}/diagnostic-summary` |
| Lookup resource access failure evidence | Query | `resources.access-failure-evidence.lookup` | `ResourceAccessFailureEvidenceLookupQuery` | `ResourceAccessFailureEvidenceLookupQueryInput` | `appaloft resource access-failure <requestId>` | `GET /api/resource-access-failures/{requestId}` |
| Read resource health | Query | `resources.health` | `ResourceHealthQuery` | `ResourceHealthQueryInput` | `appaloft resource health <resourceId>` | `GET /api/resources/{resourceId}/health` |
| Read resource health history | Query | `resources.health-history` | `ResourceHealthHistoryQuery` | `ResourceHealthHistoryQueryInput` | `appaloft resource health-history <resourceId> --from <iso> --to <iso>` | `GET /api/resources/{resourceId}/health-history` |
| Open resource terminal | Command | `terminal-sessions.open` | `OpenTerminalSessionCommand` | `OpenTerminalSessionCommandInput` | `appaloft resource terminal <resourceId>` | `POST /api/terminal-sessions`; attach: `WS /api/terminal-sessions/{sessionId}/attach` |

Repository config `autoDeploy` is a workflow/profile extension over
`resources.configure-auto-deploy`. Config deploy may configure or disable Resource git-push
auto-deploy policy before deployment admission, but it does not introduce a new operation key and
does not add source-event trigger fields to `deployments.create`.

Repository config `health` and `runtime.healthCheck` are workflow/profile extensions over
`resources.configure-health`, governed by
[ADR-073](./decisions/ADR-073-repository-config-health-policy-reconcile.md) and
[spec 082](./specs/082-repository-config-health-policy-reconcile/spec.md). Config deploy may
normalize and configure Resource HTTP health policy before ids-only deployment admission when an
existing-resource profile apply is explicitly selected; default config deploy still fails first on
unacknowledged health drift.

Repository config `preview.pullRequest.profile` is a selected PR-preview overlay governed by
[ADR-074](./decisions/ADR-074-repository-config-preview-profile-overlays.md) and
[spec 083](./specs/083-repository-config-preview-profile-overlays/spec.md). It is a workflow
extension over existing profile/env/access/monitoring/health operations, not a new operation key.
The overlay is ignored for ordinary deploys, applies only after trusted preview context selects the
preview scope, and never adds profile fields to `deployments.create`.

Repository config `profiles.<key>` is a trusted-entrypoint-selected named overlay governed by
[ADR-075](./decisions/ADR-075-repository-config-named-profile-overlays.md) and
[spec 084](./specs/084-repository-config-named-profile-overlays/spec.md). It is a workflow
extension over existing profile/env/access/monitoring/health operations, not a new operation key.
Unselected profiles are ignored; selected profiles merge before preview overlays and before
ids-only deployment admission.

Phase 7 storage operations:

| Capability | Kind | Operation Key | Message | Schema | CLI | oRPC / HTTP |
| --- | --- | --- | --- | --- | --- | --- |
| Create storage volume | Command | `storage-volumes.create` | `CreateStorageVolumeCommand` | `CreateStorageVolumeCommandInput` | `appaloft storage volume create` | `POST /api/storage-volumes` |
| List storage volumes | Query | `storage-volumes.list` | `ListStorageVolumesQuery` | `ListStorageVolumesQueryInput` | `appaloft storage volume list` | `GET /api/storage-volumes` |
| Show storage volume | Query | `storage-volumes.show` | `ShowStorageVolumeQuery` | `ShowStorageVolumeQueryInput` | `appaloft storage volume show <storageVolumeId>` | `GET /api/storage-volumes/{storageVolumeId}` |
| Rename storage volume | Command | `storage-volumes.rename` | `RenameStorageVolumeCommand` | `RenameStorageVolumeCommandInput` | `appaloft storage volume rename <storageVolumeId> --name <name>` | `POST /api/storage-volumes/{storageVolumeId}/rename` |
| Delete storage volume | Command | `storage-volumes.delete` | `DeleteStorageVolumeCommand` | `DeleteStorageVolumeCommandInput` | `appaloft storage volume delete <storageVolumeId>` | `DELETE /api/storage-volumes/{storageVolumeId}` |
| Cleanup storage volume runtime | Command | `storage-volumes.cleanup-runtime` | `CleanupStorageVolumeRuntimeCommand` | `CleanupStorageVolumeRuntimeCommandInput` | `appaloft storage volume cleanup-runtime <storageVolumeId> --server <serverId> --before <iso>` | `POST /api/storage-volumes/{storageVolumeId}/runtime-cleanup` |
| Attach storage to resource | Command | `resources.attach-storage` | `AttachResourceStorageCommand` | `AttachResourceStorageCommandInput` | `appaloft resource storage attach <resourceId> <storageVolumeId> --destination-path <path>` | `POST /api/resources/{resourceId}/storage-attachments` |
| Detach storage from resource | Command | `resources.detach-storage` | `DetachResourceStorageCommand` | `DetachResourceStorageCommandInput` | `appaloft resource storage detach <resourceId> <attachmentId>` | `DELETE /api/resources/{resourceId}/storage-attachments/{attachmentId}` |

Storage volume backup operations:

| Capability | Kind | Operation Key | Message | Schema | CLI | oRPC / HTTP |
| --- | --- | --- | --- | --- | --- | --- |
| Plan storage volume backup | Query | `storage-volumes.backup-plan` | `CreateStorageVolumeBackupPlanQuery` | `CreateStorageVolumeBackupPlanQueryInput` | `appaloft storage volume backup plan` | `POST /api/storage-volumes/{storageVolumeId}/backups/plan` |
| Create storage volume backup | Command | `storage-volumes.create-backup` | `CreateStorageVolumeBackupCommand` | `CreateStorageVolumeBackupCommandInput` | `appaloft storage volume backup create` | `POST /api/storage-volumes/{storageVolumeId}/backups` |
| List storage volume backups | Query | `storage-volumes.list-backups` | `ListStorageVolumeBackupsQuery` | `ListStorageVolumeBackupsQueryInput` | `appaloft storage volume backup list --storage-volume <storageVolumeId>` | `GET /api/storage-volumes/{storageVolumeId}/backups` |
| Show storage volume backup | Query | `storage-volumes.show-backup` | `ShowStorageVolumeBackupQuery` | `ShowStorageVolumeBackupQueryInput` | `appaloft storage volume backup show <backupId>` | `GET /api/storage-volume-backups/{backupId}` |
| Plan storage volume restore | Query | `storage-volumes.restore-plan` | `CreateStorageVolumeRestorePlanQuery` | `CreateStorageVolumeRestorePlanQueryInput` | `appaloft storage volume backup restore-plan <backupId>` | `POST /api/storage-volume-backups/{backupId}/restore-plan` |
| Restore storage volume backup | Command | `storage-volumes.restore-backup` | `RestoreStorageVolumeBackupCommand` | `RestoreStorageVolumeBackupCommandInput` | `appaloft storage volume backup restore <backupId>` | `POST /api/storage-volume-backups/{backupId}/restore` |
| Prune storage volume backups | Command | `storage-volumes.prune-backups` | `PruneStorageVolumeBackupCommand` | `PruneStorageVolumeBackupCommandInput` | `appaloft storage volume backup prune <backupId>` | `DELETE /api/storage-volume-backups/{backupId}` |

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

Repository config `scheduledTasks.*` is a workflow/profile extension over the existing scheduled
task operations. Config deploy may list, create, or configure Resource-owned scheduled tasks before
ids-only deployment admission, and preview cleanup may delete only source-link provenance-owned
ephemeral tasks. No new operation-catalog key is introduced.

Phase 7 dependency resource operations:

| Capability | Kind | Operation Key | Message | Schema | CLI | oRPC / HTTP |
| --- | --- | --- | --- | --- | --- | --- |
| Provision dependency resource | Command | `dependency-resources.provision` | `ProvisionDependencyResourceCommand` | `ProvisionDependencyResourceCommandInput` | `appaloft dependency provision --kind <kind>` | `POST /api/dependency-resources/provision` |
| Import dependency resource | Command | `dependency-resources.import` | `ImportDependencyResourceCommand` | `ImportDependencyResourceCommandInput` | `appaloft dependency import --kind <kind>` | `POST /api/dependency-resources/import` |
| Create dependency resource provisioning plan | Command | `dependency-resources.provisioning.plan` | `CreateDependencyResourceProvisioningPlanCommand` | `CreateDependencyResourceProvisioningPlanInput` | `appaloft dependency plan --mode <create\|reuse>` | `POST /api/dependency-resources/provisioning/plan` |
| Accept dependency resource provisioning plan | Command | `dependency-resources.provisioning.accept` | `AcceptDependencyResourceProvisioningPlanCommand` | `AcceptDependencyResourceProvisioningPlanInput` | `appaloft dependency accept <planId> --acknowledge-mutation` | `POST /api/dependency-resources/provisioning/{planId}/accept` |
| Show dependency resource provisioning plan | Query | `dependency-resources.provisioning.status` | `ShowDependencyResourceProvisioningPlanQuery` | `ShowDependencyResourceProvisioningPlanInput` | `appaloft dependency status <planId>` | `GET /api/dependency-resources/provisioning/{planId}` |
| List dependency resources | Query | `dependency-resources.list` | `ListDependencyResourcesQuery` | `ListDependencyResourcesQueryInput` | `appaloft dependency list` | `GET /api/dependency-resources` |
| Count dependency resources | Query | `dependency-resources.count` | `CountDependencyResourcesQuery` | `CountDependencyResourcesQueryInput` | `appaloft dependency count` | `GET /api/dependency-resources/count` |
| Show dependency resource | Query | `dependency-resources.show` | `ShowDependencyResourceQuery` | `ShowDependencyResourceQueryInput` | `appaloft dependency show <dependencyResourceId>` | `GET /api/dependency-resources/{dependencyResourceId}` |
| Rename dependency resource | Command | `dependency-resources.rename` | `RenameDependencyResourceCommand` | `RenameDependencyResourceCommandInput` | `appaloft dependency rename <dependencyResourceId> --name <name>` | `POST /api/dependency-resources/{dependencyResourceId}/rename` |
| Delete dependency resource | Command | `dependency-resources.delete` | `DeleteDependencyResourceCommand` | `DeleteDependencyResourceCommandInput` | `appaloft dependency delete <dependencyResourceId>` | `DELETE /api/dependency-resources/{dependencyResourceId}` |
| Create dependency resource backup | Command | `dependency-resources.create-backup` | `CreateDependencyResourceBackupCommand` | `CreateDependencyResourceBackupCommandInput` | `appaloft dependency backup create <dependencyResourceId>` | `POST /api/dependency-resources/{dependencyResourceId}/backups` |
| List dependency resource backups | Query | `dependency-resources.list-backups` | `ListDependencyResourceBackupsQuery` | `ListDependencyResourceBackupsQueryInput` | `appaloft dependency backup list <dependencyResourceId>` | `GET /api/dependency-resources/{dependencyResourceId}/backups` |
| Show dependency resource backup | Query | `dependency-resources.show-backup` | `ShowDependencyResourceBackupQuery` | `ShowDependencyResourceBackupQueryInput` | `appaloft dependency backup show <backupId>` | `GET /api/dependency-resources/backups/{backupId}` |
| Restore dependency resource backup | Command | `dependency-resources.restore-backup` | `RestoreDependencyResourceBackupCommand` | `RestoreDependencyResourceBackupCommandInput` | `appaloft dependency backup restore <backupId>` | `POST /api/dependency-resources/backups/{backupId}/restore` |
| Configure dependency resource backup policy | Command | `dependency-resources.backup-policies.configure` | `ConfigureDependencyResourceBackupPolicyCommand` | `ConfigureDependencyResourceBackupPolicyCommandInput` | `appaloft dependency backup policy configure <dependencyResourceId>` | `POST /api/dependency-resources/backup-policies` |
| List dependency resource backup policies | Query | `dependency-resources.backup-policies.list` | `ListDependencyResourceBackupPoliciesQuery` | `ListDependencyResourceBackupPoliciesQueryInput` | `appaloft dependency backup policy list` | `GET /api/dependency-resources/backup-policies` |
| Show dependency resource backup policy | Query | `dependency-resources.backup-policies.show` | `ShowDependencyResourceBackupPolicyQuery` | `ShowDependencyResourceBackupPolicyQueryInput` | `appaloft dependency backup policy show <policyId>` | `GET /api/dependency-resources/backup-policies/{policyId}` |
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
  now carry provider-native realization state through an injected shell provider capability, imported
  external Postgres delete removes only Appaloft's record, and list/show output masks connection
  secrets. When provision receives `serverId`, the shell provider creates a Docker-backed Postgres
  container and named volume on that `local-shell` or `generic-ssh` single-server target, stores the
  raw connection value through `DependencyResourceSecretStore`, and records only safe provider
  handle/endpoint metadata. Provider realization/delete attempts are mirrored into safe
  operator-work process attempts for visibility and repair.
- Provider-native dependency realization is implemented through the generic
  `dependency-resources.provision`, `resources.bind-dependency`, and `dependency-resources.delete`
  boundaries. The same command path accepts `postgres`, `redis`, `mysql`, `clickhouse`,
  `object-storage`, and `opensearch`; Postgres and Redis no longer have separate command, CLI, or
  HTTP compatibility routes. It is governed by the dependency resource lifecycle specs and must
  keep provider SDK types and raw secrets out of core, contracts, CLI, Web, events, and read models.
- Neutral dependency resource read and contract surfaces recognize the canonical dependency kinds
  `postgres`, `redis`, `mysql`, `clickhouse`, `object-storage`, and `opensearch`. This vocabulary
  now drives the active create/import mutation surface as well as provider packages and higher-level
  planning surfaces. The shell provider has Docker-backed adapters for the same set of kinds.
- Resource dependency bindings are provider-neutral `ResourceBinding` records in this slice. Bind
  requires matching project/environment ownership, stores only safe target metadata and secret
  reference pointers, and reports safe deployment snapshot-reference readiness. Unbind removes only
  the binding association; it does not delete the dependency resource, external/provider database,
  runtime state, backup data, or historical snapshots.
- Dependency binding runtime injection is governed by
  [ADR-040](./decisions/ADR-040-dependency-binding-runtime-injection-boundary.md) and
  [Dependency Binding Runtime Injection](./specs/047-dependency-binding-runtime-injection/spec.md).
  The accepted target keeps `deployments.create` ids-only, materializes active ready dependency
  bindings into immutable safe runtime injection snapshots, gates deployment admission on
  injectable bindings, and lets runtime target adapters deliver safe dependency secret handles
  without exposing raw connection values. Store-backed secret value resolution is governed by
  [ADR-041](./decisions/ADR-041-dependency-runtime-secret-value-resolution.md) and
  [Dependency Runtime Secret Value Resolution](./specs/048-dependency-runtime-secret-value-resolution/spec.md);
  its Code Round is implemented for imported Postgres, imported Redis, managed Postgres
  Appaloft-owned refs, managed Redis refs, single-server runtimes, Docker Swarm, and retained
  rotated binding refs. Managed Postgres and Redis closed loops have end-to-end
  application/read-model verification.
- Repository config `dependencies` is governed by
  [ADR-066](./decisions/ADR-066-repository-config-dependency-graph.md) and
  [Repository Config Dependency Graph](./specs/075-repository-config-dependency-graph/spec.md).
  It is a workflow/profile extension over the existing dependency operation catalog, not a new
  operation key. Config supports the canonical managed dependency kinds `postgres`, `redis`,
  `mysql`, `clickhouse`, `object-storage`, and `opensearch`. Config deploy may list/provision
  managed dependency resources, list/bind Resource dependency bindings, and persist preview
  source-link provenance before `deployments.create`.
  Preview cleanup may unbind/delete only provenance-marked ephemeral dependencies through
  `resources.unbind-dependency` and `dependency-resources.delete`; manual/shared dependencies and
  dependencies without matching provenance are preserved by design.
- Repository config `dependencies.<key>.backup` is governed by
  [ADR-070](./decisions/ADR-070-repository-config-dependency-backup-policy.md) and
  [Repository Config Dependency Backup Policy](./specs/079-repository-config-dependency-backup-policy/spec.md).
  It is a workflow/profile extension over existing dependency backup policy operations, not a new
  operation key. Config deploy may create, update, or disable a repository-config-owned scheduled
  backup policy for a managed dependency resource, but it does not run backups, restore backups,
  mutate manual backup policies without provenance, or add backup fields to `deployments.create`.
- Repository config `storage` is governed by
  [ADR-067](./decisions/ADR-067-repository-config-storage-graph.md) and
  [Repository Config Storage Graph](./specs/076-repository-config-storage-graph/spec.md). It is a
  workflow/profile extension over the existing storage operation catalog, not a new operation key.
  Config deploy may list/create managed named volumes, read/attach Resource storage mounts, and
  persist preview source-link provenance before `deployments.create`. Preview cleanup may
  detach/delete only provenance-marked ephemeral storage through `resources.detach-storage` and
  `storage-volumes.delete`; manual/shared storage and storage without matching provenance are
  preserved by design.
- `resources.rotate-dependency-binding-secret` rotates only the binding-scoped safe secret
  reference/version for future deployment snapshot references. It requires explicit acknowledgement
  that historical snapshots remain unchanged, and it does not rotate provider-native database
  credentials, inject runtime environment variables, schedule redeploy, or rewrite historical
  deployment snapshots.
- Redis dependency resources are `ResourceInstance` records. Appaloft-managed Redis now carries
  provider-native realization state through an injected shell provider capability, imported external Redis
  delete removes only Appaloft's record, list/show output masks Redis connection secrets, and ready
  imported or realized managed Redis records can be bound as safe dependency references. Runtime
  materialization coverage for managed Redis is active through single-server and Docker Swarm
  dependency secret delivery paths with closed-loop application/read-model verification.
- Dependency resource backup/restore is governed by
  [ADR-036](./decisions/ADR-036-dependency-resource-backup-restore-lifecycle.md) and
  [Dependency Resource Backup And Restore](./specs/039-dependency-resource-backup-restore/spec.md).
  The active operations create safe restore points and restore them in place through provider
  capabilities without exposing raw dumps, restarting workloads, redeploying Resources, or rewriting
  deployment snapshots. Docker-backed managed Postgres/Redis use the safe provider resource handle
  to resolve the owning single-server target for backup/restore. Shell execution runs native
  Postgres dump/restore commands and native Redis logical backup/restore commands when an imported
  dependency resource has a resolvable Appaloft-owned connection ref, while unresolved and
  provider-owned references use safe metadata-only provider artifacts. Provider-specific Redis
  snapshot substrates remain governed follow-up work for providers that need snapshot-native restore
  semantics beyond the shell logical path. Backup and restore provider attempts are also projected
  into `operator-work.*` through durable process-attempt rows with safe dependency/provider
  metadata. Provider execution still runs inline through the command use cases, but uses
  process-attempt pending/claim/completion handoff when a process journal is available; automatic
  background retry execution remains a governed worker slice.
- Dependency resource scheduled backup policy is governed by
  [Dependency Resource Scheduled Backup Policy](./specs/070-dependency-resource-scheduled-backup-policy/spec.md).
  Policies are opt-in records per dependency resource with retention metadata, interval hours,
  enabled state, last/next run timestamps, and optional provider key. The disabled-by-default shell
  runner scans due policies and dispatches the existing `dependency-resources.create-backup`
  command; it does not create a parallel backup provider path, expose raw dumps, prune retained
  backups, export backup artifacts, or mutate workload runtime state.
- The Web console exposes these lifecycle controls at `/dependency-resources`: create
  Docker-backed Appaloft-managed Postgres/Redis on an active single-server target, list safe
  realization/connection metadata, create backups, configure scheduled backup policy, restore ready
  backup artifacts with explicit overwrite/runtime acknowledgements, and delete unblocked dependency
  resources.
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
- Repository config `source.type = image` is governed by
  [ADR-076](./decisions/ADR-076-repository-config-prebuilt-image-source.md) and
  [spec 085](./specs/085-repository-config-prebuilt-image-source/spec.md). It is a
  workflow/profile extension over Resource source/runtime profile operations, maps to
  `ResourceSourceBinding(kind = docker-image)` plus `ResourceRuntimeProfile(strategy =
  prebuilt-image)`, and must not add image fields, registry credentials, or pull secrets to
  `deployments.create`.
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
- Repository config `access.generated` is governed by
  [ADR-071](./decisions/ADR-071-repository-config-generated-access-profile.md) and
  [spec 080](./specs/080-repository-config-generated-access-profile/spec.md). It is a
  workflow/profile extension over `resources.configure-access`, not a new operation key; it must
  reconcile generated access preference and path prefix before ids-only deployment admission.
- project/resource console ownership is governed by
  [ADR-013: Project Resource Navigation And Deployment Ownership](./decisions/ADR-013-project-resource-navigation-and-deployment-ownership.md)
- sidebar navigation may show Project -> Resource hierarchy with latest deployment status derived
  from read models/projections
- application runtime logs are resource-owned observation governed by
  [ADR-018: Resource Runtime Log Observation](./decisions/ADR-018-resource-runtime-log-observation.md);
  `resources.runtime-logs` is the active bounded and stream-capable query surface for runtime
  stdout/stderr observation through an injected runtime log reader
- resource runtime log archival is governed by
  [ADR-053: Resource Runtime Log Archive Retention Boundary](./decisions/ADR-053-resource-runtime-log-archive-retention-boundary.md).
  Runtime-log archive operations create, list, show, and dry-run/prune explicit Appaloft-owned
  archive snapshots derived from `resources.runtime-logs`; they do not persist every live runtime
  line by default or mutate external backend log stores
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
- Web resource detail source/runtime/network/access/health/configuration/storage editors are owner-scoped
  projections of the named resource commands and queries. They must make the durable future-only
  profile boundary visible to operators and must not introduce Web-only configuration state, imply
  an immediate runtime restart, create a deployment, mutate historical deployment snapshots, bind
  domains, issue certificates, apply proxy routes, or provision/delete provider-native volumes.
- Resource Profile Drift Visibility is part of the `resources.show` diagnostic surface and
  repository config deploy preflight. It compares current Resource profile, normalized entry
  workflow profile, and latest deployment snapshot profile; reports sectioned drift for source,
  runtime, network, access, health, and configuration; and points to explicit remediation commands.
  It is not a separate operation and must not add profile fields or drift overrides to
  `deployments.create`.
- resource-scoped variables and secrets are resource-owned through `resources.set-variable`,
  `resources.import-variables`, `resources.unset-variable`, and explicit
  `resources.secrets.create/rotate/delete/list/show`; these commands replace or read only the
  resource override layer used during future deployment snapshot materialization after environment
  precedence is resolved. The explicit secret-reference lifecycle returns only safe id/key/exposure
  metadata or masked `value = "****"` read models and is the public CRUD surface for Resource-owned
  secret references.
- repository config `services.<key>` is the public-neutral service graph profile input for one
  Resource. The first implemented slices parse service role, source/runtime/network/health,
  service-local replicas, env, and secret references; first-run config bootstrap maps service
  names/kinds into `resources.create`; existing Resource service drift blocks deployment until a
  dedicated service reconciliation command exists; repository-config deployment planning may
  materialize workspace-command services as one generated Compose stack; and `deployments.create`
  remains ids-only for public transports. This is governed by
  [Repository Config Service Graph](./specs/096-repository-config-service-graph/spec.md).
- repository config `applications.<key>` is the public-neutral application graph input for one
  repository config workflow. Each application entry expands into a Resource-specific Quick Deploy
  draft and one ordinary ids-only `deployments.create` admission; the graph does not add
  cross-Resource fields to `deployments.create`, does not select durable identity from committed
  config, and does not imply atomic release-group rollback or provider-specific orchestration. This
  is governed by
  [Repository Config Application Graph](./specs/097-repository-config-application-graph/spec.md).
- storage volume lifecycle is implemented for Phase 7 through
  `storage-volumes.create/list/show/rename/delete` and `resources.attach-storage/detach-storage`.
  Storage attachments are Resource profile state and new deployments snapshot them into
  provider-neutral runtime plan mount metadata. Local and generic-SSH Docker container deployment
  execution consumes that immutable metadata as Docker `--mount` flags and pre-creates Docker
  named volumes with Appaloft ownership labels at deployment time; Docker Compose deployment
  execution consumes it through the generated Appaloft Compose override file with matching top-level
  volume labels. Docker Swarm image-service deployment execution consumes it through
  `docker service create --mount` flags. Storage commands must not create deployments, mutate
  historical snapshots, apply live runtime mounts, explicitly provision provider-native volumes, or
  perform backup/restore.
  Web Resource detail exposes attachment readback plus attach/detach controls for those same
  Resource profile commands, storage-volume create/rename/delete management, and dry-run-first
  runtime cleanup through the shared storage command contracts.
- storage runtime realization and cleanup are governed by
  [ADR-064: Storage Volume Runtime Realization And Cleanup](./decisions/ADR-064-storage-volume-runtime-realization-and-cleanup.md)
  and [Storage Volume Runtime Realization And Cleanup](./specs/070-storage-volume-runtime-realization-and-cleanup/spec.md).
  Deployment execution is the default realization point for Docker/Compose/Swarm image-service and
  Swarm Compose stack mounts; `storage-volumes.create` does not pre-provision provider-native
  storage.
  `storage-volumes.cleanup-runtime` is dry-run-first, storage-volume plus server scoped, and
  separate from both `storage-volumes.delete` and `servers.capacity.prune`. The first runtime
  cleanup implementation covers local-shell and generic-SSH Docker named volumes through CLI,
  HTTP/oRPC, and Resource detail Web controls, and requires matching Appaloft ownership labels
  before a named volume can match or be removed; bind-mount source paths, provider-native storage
  handles, and storage backup/restore execution remain separate governed slices outside the
  provider-neutral create and runtime cleanup
  provider-neutral create boundary. GitHub Actions/local explicit Swarm and storage-cleanup gates
  prove generated overrides, named-volume creation, route reachability, dry-run-first cleanup, and
  scoped destructive cleanup without making target-mutating proofs part of default local checks.
  Swarm Compose stack deployment now uses generated Appaloft overrides and superseded stack/service
  cleanup during deployment execution. Retained deployment snapshot, rollback-candidate,
  backup-retention, and in-flight backup/restore safety evidence already block destructive cleanup
  for the selected
  StorageVolume on the selected server; default unsupported provider composition reports no
  in-flight storage backup/restore work unless a concrete backup provider registers evidence.
- mounted storage is not a Dependency Resource. Resource overview and downstream application-bundle
  readback must expose storage attachments with storage language and must not send SQLite-on-volume
  users to `dependency-resources.*` backup/restore. This boundary is governed by
  [ADR-083](./decisions/ADR-083-storage-volume-dependency-resource-and-backup-boundary.md),
  [Storage Volume Resource Visibility](./specs/096-storage-volume-resource-visibility/spec.md),
  and
  [Application Bundle Storage Binding Boundary](./specs/097-application-bundle-storage-binding-boundary/spec.md).
  Storage backup/restore is governed by
  [Storage Volume Backup And Restore](./specs/098-storage-volume-backup-restore/spec.md). The
  active operation family exposes planning, creation, list/show, restore planning, restore to a new
  volume, and prune through `storage-volumes.*`; unsupported source adapters or target providers
  return blockers/errors instead of copying live volume data unsafely.

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
- resource delete safety is resource-owned through `resources.delete-check`; it returns the same
  retained blockers used by `resources.delete` without mutating lifecycle state. Deployment history
  is retained by deployment/audit ownership and is not by itself a resource delete blocker.
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
| List source fingerprint links | Query | `source-links.list` | `ListSourceLinksQuery` | `ListSourceLinksQueryInput` | `appaloft source-links list` | `GET /api/source-links` |
| Show source fingerprint link | Query | `source-links.show` | `ShowSourceLinkQuery` | `ShowSourceLinkQueryInput` | `appaloft source-links show <sourceFingerprint>` | `GET /api/source-links/{sourceFingerprint}` |
| Relink source fingerprint | Command | `source-links.relink` | `RelinkSourceLinkCommand` | `RelinkSourceLinkCommandInput` | `appaloft source-links relink <sourceFingerprint>` | `POST /api/source-links/relink` |
| Delete source fingerprint link | Command | `source-links.delete` | `DeleteSourceLinkCommand` | `DeleteSourceLinkCommandInput` | `appaloft source-links delete <sourceFingerprint>` | `DELETE /api/source-links/{sourceFingerprint}` |

Current boundary:
- `source-links.list` and `source-links.show` read safe source link records only. They do not
  inspect repository provider secrets, mutate link state, recover remote state, or create
  deployments.
- `source-links.relink` updates source link mapping only. It does not mutate resource profiles,
  environment variables, credentials, deployment history, domain bindings, or server-applied route
  state.
- `source-links.delete` removes the link mapping only. It does not delete projects, environments,
  resources, deployments, domain bindings, server-applied routes, or runtime state.
- CLI SSH mode may still use brief state-root coordination for remote PGlite maintenance when the
  relink command is invoked with trusted SSH target options such as `--server-host`, but the
  command's user-visible admission semantics are governed by source-fingerprint scoped mutation
  coordination rather than by a whole-server lock. This boundary is governed by
  [ADR-028: Command Coordination Scope And Mutation Admission](./decisions/ADR-028-command-coordination-scope-and-mutation-admission.md).
- PostgreSQL/PGlite source-link storage is implemented for hosted/self-hosted and embedded state
  backends through the dedicated `packages/persistence/pg` adapter. That same durable state feeds
  `resources.delete` source-link blocker checks. HTTP/oRPC relink is exposed for hosted/self-hosted
  control planes, and Web Resource detail exposes a Resource-scoped relink form.

## Static Artifacts

Business meaning:
- static artifact publishing is a source/artifact extension point for already-built static output
- it does not create hosted default-domain routing, bypass Resource/Deployment admission, or expose
  provider-specific artifact storage semantics

Implemented operations:

| Capability | Kind | Operation Key | Message | Schema | CLI | oRPC / HTTP |
| --- | --- | --- | --- | --- | --- | --- |
| Publish static artifact from source path | Command | `static-artifacts.publish` | `PublishStaticArtifactCommand` | `PublishStaticArtifactCommandInput` | none yet | `POST /api/static-artifacts/publish` |
| Publish static artifact payload | Command | `static-artifacts.publish-payload` | `PublishStaticArtifactPayloadCommand` | `PublishStaticArtifactPayloadCommandInput` | `appaloft static-artifacts publish <dist-directory>` | `POST /api/static-artifacts/publish-payload` |
| Publish static artifact archive | Command | `static-artifacts.publish-archive` | `PublishStaticArtifactArchiveCommand` | `PublishStaticArtifactArchiveCommandInput` | `appaloft static-artifacts publish <dist.zip>` | `POST /api/static-artifacts/publish-archive` |
| List static artifact publications | Query | `static-artifacts.publications.list` | `ListStaticArtifactPublicationsQuery` | `ListStaticArtifactPublicationsQueryInput` | none yet | `GET /api/static-artifacts/publications` |

Current boundary:
- the CLI packages local dist directories or `.zip` archives into payload/archive commands before
  dispatch; the business operation still receives an explicit static artifact manifest and safe
  artifact body reference
- `static-artifacts.publish` is for trusted server-local source paths over HTTP/API composition
- publication read models return safe summaries only; they must not expose artifact contents, raw
  local filesystem internals, provider credentials, or hosted provider payloads
- route activation remains provider-neutral and scoped by the accepted static artifact route
  attributes; hosted alias/default-domain routing is a separate follow-up capability

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
| Replay source event | Command | `source-events.replay` | `ReplaySourceEventCommand` | `ReplaySourceEventCommandInput` | `appaloft source-event replay <sourceEventId> --resource <resourceId>` | `POST /api/source-events/{sourceEventId}/replay` |
| Prune source events | Command | `source-events.prune` | `PruneSourceEventsCommand` | `PruneSourceEventsCommandInput` | `appaloft source-event prune --before <iso>` | `POST /api/source-events/prune` |

Current boundary:
- `source-events.ingest` is active for the Resource-scoped generic signed HTTP route and the
  system-scoped GitHub push webhook route. Generic signed ingestion resolves the Resource policy's
  `resource-secret:<KEY>` reference and verifies `X-Appaloft-Signature`; GitHub ingestion verifies
  `X-Hub-Signature-256` with `APPALOFT_GITHUB_WEBHOOK_SECRET`, treats `ping` as a no-op, and
  dispatches push events without `scopeResourceId` so policy matching can fan out. Neither route
  persists raw payloads, signatures, or secret values. Accepted and dispatched/failed source-event
  auto-deploy outcomes are also projected into `operator-work.*` through durable process-attempt
  rows with safe source/ref metadata; dispatch still runs inline through the source-event command
  path rather than process-attempt atomic claim/completion.
- `source-events.list` and `source-events.show` are read-only diagnostics over persisted source
  event records. They require project or Resource scope and must not replay events, retry failed
  dispatch, mutate auto-deploy policy, or create deployments.
- `source-events.replay` replays one retained safe source event delivery through current
  Resource-owned auto-deploy policy matching and the existing `deployments.create` admission path.
  It never reuses raw webhook payloads, signatures, provider tokens, or webhook secret values, and
  it requires project or Resource scope for public callers.
- `source-events.prune` dry-runs by default and then, when explicitly requested, deletes only safe
  retained source event diagnostic rows matching a cutoff and optional project, Resource, status, or
  source-kind filters. It does not replay events, delete Resources or deployments, or touch webhook
  secret material.
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
| Cleanup preview deployment | Command | `deployments.cleanup-preview` | `CleanupPreviewCommand` | `CleanupPreviewCommandInput` | `appaloft preview cleanup [path-or-source] --preview pull-request --preview-id pr-123` | `POST /api/deployments/cleanup-preview` |
| Preview deployment plan | Query | `deployments.plan` | `DeploymentPlanQuery` | `DeploymentPlanQueryInput` | `appaloft deployments plan --project <projectId> --environment <environmentId> --resource <resourceId> --server <serverId> [--destination <destinationId>]` | `GET /api/deployments/plan` |
| List deployments | Product-session member query | `deployments.list` | `ListDeploymentsQuery` | `ListDeploymentsQueryInput` | `appaloft deployments list` | `GET /api/deployments` |
| Count deployments | Product-session member query | `deployments.count` | `CountDeploymentsQuery` | `CountDeploymentsQueryInput` | `appaloft deployments count` | `GET /api/deployments/count` |
| Show deployment detail | Product-session member query | `deployments.show` | `ShowDeploymentQuery` | `ShowDeploymentQueryInput` | `appaloft deployments show <deploymentId>` | `GET /api/deployments/{deploymentId}` |
| Read deployment recovery readiness | Query | `deployments.recovery-readiness` | `DeploymentRecoveryReadinessQuery` | `DeploymentRecoveryReadinessQueryInput` | `appaloft deployments recovery-readiness <deploymentId>` | `GET /api/deployments/{deploymentId}/recovery-readiness` |
| Retry deployment attempt | Command | `deployments.retry` | `RetryDeploymentCommand` | `RetryDeploymentCommandInput` | `appaloft deployments retry <deploymentId>` | `POST /api/deployments/{deploymentId}/retry` |
| Redeploy current resource profile | Command | `deployments.redeploy` | `RedeployDeploymentCommand` | `RedeployDeploymentCommandInput` | `appaloft deployments redeploy <resourceId>` | `POST /api/resources/{resourceId}/redeploy` |
| Roll back deployment | Command | `deployments.rollback` | `RollbackDeploymentCommand` | `RollbackDeploymentCommandInput` | `appaloft deployments rollback <deploymentId> --candidate <rollbackCandidateDeploymentId>` | `POST /api/deployments/{deploymentId}/rollback` |
| Cancel active deployment attempt | Command | `deployments.cancel` | `CancelDeploymentCommand` | `CancelDeploymentCommandInput` | `appaloft deployments cancel <deploymentId> --confirm <deploymentId>` | `POST /api/deployments/{deploymentId}/cancel` |
| Archive deployment attempt | Command | `deployments.archive` | `ArchiveDeploymentCommand` | `ArchiveDeploymentCommandInput` | `appaloft deployments archive <deploymentId> --confirm <deploymentId>` | `POST /api/deployments/{deploymentId}/archive` |
| Prune archived deployment attempts | Command | `deployments.prune` | `PruneDeploymentsCommand` | `PruneDeploymentsCommandInput` | `appaloft deployments prune --before <iso>` | `POST /api/deployments/prune` |
| Read deployment timeline | Query | `deployments.timeline` | `DeploymentTimelineQuery` | `DeploymentTimelineQueryInput` | `appaloft deployments timeline <deploymentId>` | `GET /api/deployments/{deploymentId}/timeline` |
| Stream deployment timeline | Query | `deployments.timeline.stream` | `StreamDeploymentTimelineQuery` | `StreamDeploymentTimelineQueryInput` | `appaloft deployments timeline <deploymentId> --follow` | `GET /api/deployments/{deploymentId}/timeline/stream` |

Current boundary:
- `deployments.create` is the only general deployment-attempt admission command for the v1
  operation surface, and `deployments.cleanup-preview` is the only accepted narrow preview cleanup
  command. This reset is governed by
  [ADR-016: Deployment Command Surface Reset](./decisions/ADR-016-deployment-command-surface-reset.md).
- `deployments.create` accepts deployment context references only: `projectId`, `environmentId`,
  `resourceId`, `serverId`, and optional `destinationId`
- when a same-resource active deployment already exists, `deployments.create` may supersede that
  prior attempt through internal cancellation plus durable execution fencing; this is distinct from
  the public `deployments.cancel` command and is governed by
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
  time, timeline summary, and safe related context while keeping full observation history on
  `deployments.timeline` and current health on `resources.health`.
- `deployments.timeline` and `deployments.timeline.stream` are the read-only replay/follow
  observation surfaces for one accepted deployment attempt. They are backed by the Deployment
  Timeline Journal selected in
  [ADR-084: Deployment Timeline Journal Boundary](./decisions/ADR-084-deployment-timeline-journal-boundary.md).
  Log views filter timeline entries instead of reading a separate legacy deployment-log surface, and
  reconnect stays read-only instead of reintroducing `deployments.reattach` as a write command.
- `deployments.archive` is a narrow attempt-history lifecycle mutation. It requires exact
  deployment id confirmation, accepts only terminal attempts, records `archivedAt`, hides archived
  attempts from default `deployments.list`, and does not delete logs, events, runtime artifacts,
  provider job logs, audit rows, route state, rollback candidates, or operator-work evidence.
- `deployments.prune` is a dry-run-first attempt-history retention mutation. It deletes only
  archived terminal deployment rows older than the cutoff after retained lineage, rollback,
  supersede, provider-log, runtime-log, and runtime-control references are checked. Guarded rows are
  reported and preserved.
- `deployments.recovery-readiness` is the active read-only recovery decision surface. It returns
  retry, redeploy, rollback, rollback-candidate, blocked-reason, and recommended-action facts for
  Web, CLI, HTTP/oRPC, and MCP/tool surfaces. Retry, redeploy, rollback, the pre-RC rebuilt
  `deployments.cancel` active-attempt command, and terminal history maintenance commands
  `deployments.archive`/`deployments.prune` are active write commands. Cancel and archive require
  exact deployment id confirmation; cancel coordinates on the same resource-runtime scope.
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
- Single-server Docker runtime containers use the Docker `unless-stopped` restart policy so transient
  host OOM or daemon restarts do not leave an accepted deployment permanently down. This is runtime
  target resilience, not a user-configurable resource restart policy field.
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
  `controlPlane.mode: none|auto|cloud|self-hosted`, optional self-host/private endpoint URL
  metadata, and for self-hosted server config deploy an explicit
  `controlPlane.deploymentContext` with project/environment/resource/server and optional
  destination ids. It must not contain Cloud tokens, database URLs, credential ids, organization
  ids, tenant ids, provider account ids, or raw credential material. Authentication still comes
  from trusted entrypoint input, deploy token/OIDC/login scope, GitHub repository identity, source
  link state, or explicit relink/adoption operations.
- Cloud and self-hosted control-plane modes require a compatibility handshake before any
  project/resource/domain/deployment mutation. Until that handshake exists, mode selection may be
  documented as roadmap and must fail before mutation when selected.
- The public GitHub Actions install UX is a thin `appaloft/deploy-action` wrapper around the
  selected Appaloft CLI binary. By default it downloads and verifies release assets; trusted
  in-repository workflows may opt into a source-built CLI from the checked-out Appaloft source tree.
  The wrapper maps trusted action inputs to CLI flags, writes SSH private key input to a temporary
  key file, and invokes the same repository config deploy workflow. It is not a new operation, not
  a hidden Quick Deploy API, and not a hosted control plane.
- The deploy action also exposes `command: install-console` for the operator-owned self-hosted
  console bootstrap path. That command uses trusted SSH inputs to download the selected release
  `install.sh` on the target host, runs the self-hosted Docker installer with a configured public
  console origin/domain, database backend, and proxy mode, verifies `/api/health`, and outputs
  `console-url`. The installer defaults to PostgreSQL, direct host access on port `3721`, and a
  resident Traefik edge proxy. When `console-domain` or `controlPlane.install.domain` is supplied,
  the installer passes `--domain` and creates the Appaloft instance console route through that edge.
  This route is installer-owned infrastructure for the Appaloft instance, not a Resource route,
  deployment snapshot route, or DomainBinding operation. Non-secret install settings may come from
  `controlPlane.url` and `controlPlane.install.*` in the selected repository config, while SSH
  host/key, tokens, and raw database credentials remain trusted workflow inputs or secrets. It can
  run the installer through Docker Compose or Docker Swarm when `console-orchestrator` or
  `controlPlane.install.orchestrator` is configured. Swarm installation requires an existing manager
  unless `console-swarm-init` or `controlPlane.install.swarmInit` is explicitly selected. Operators
  may choose embedded single-instance storage with explicit `console-database: pglite` and may opt
  out of the resident proxy with `console-proxy: none` or `controlPlane.install.proxy: none`.
  Operators may also opt into installer-owned tracing with `--trace jaeger`; that adds a Jaeger
  sidecar collector/UI and wires only the Appaloft instance process to standard OTLP environment
  variables. It is separate from `command: deploy`, so existing SSH CLI deployments with
  `control-plane-mode: none` continue to mutate SSH-server `ssh-pglite` directly until the operator
  selects a self-hosted control-plane API mode.
- In `control-plane-mode: self-hosted`, the deploy action uses server API trigger mode: the
  deployment path does not invoke the CLI, open SSH, select a state backend, or mutate SSH-server
  PGlite. It calls the selected self-hosted server's `/api/version` endpoint, then uses protected Action
  mutation endpoints with a deploy-token bearer credential. The source-link trigger path calls
  `POST /api/action/deployments/from-source-link` for `command: deploy`; trusted
  project/environment/resource/server ids supplied by the workflow may bootstrap a missing source
  link for deploy, but later runs should omit those ids so the server resolves context from
  existing source-link state. `POST /api/deployments/cleanup-preview` handles
  `command: preview-cleanup` and always resolves context from preview source-link state.
- The active self-hosted Action server config deploy slice is
  [Action Server Config Deploy](./workflows/action-server-config-deploy.md), coordinated by
  [spec 050](./specs/050-action-server-config-deploy/spec.md). It moves config bootstrap and source
  materialization into the self-hosted server by sending a bounded source package reference and
  selected config path to a dedicated server config workflow API. The server must still keep
  `deployments.create` ids-only, accept only the narrow `controlPlane.deploymentContext` identity
  exception, reject broad committed identity/secret fields before mutation, apply
  resource/environment/profile changes through explicit commands, accept transient Action preview
  env and route values for pull request previews without reusing production config domains, and
  fail during handshake/capability checks when source package or server-side config bootstrap
  support is absent.
- GitHub Action PR preview deploy is also an entry workflow over the same commands, not a new
  operation. A repository must add a workflow with `on.pull_request` before GitHub will attempt a
  preview deploy. The action may use trusted GitHub event context, such as PR number and head SHA,
  to create a preview-scoped source fingerprint and environment/resource selection outside
  committed config, derive preview runtime naming intent, then dispatch ids-only
  `deployments.create`.
- This repository does not carry a PR-triggered Web console preview deployment workflow by default.
  Downstream repositories that want preview deploys must install their own workflow and own the
  target SSH/runtime capacity. Full operator-owned self-hosted control-plane installation remains
  owned by `.github/workflows/deploy-console.yml` and `command: install-console`.
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
  `pull_request.closed` workflow that dispatches `deployments.cleanup-preview`, either through
  `appaloft preview cleanup ...` in pure SSH CLI mode or through
  `POST /api/deployments/cleanup-preview` in self-hosted server API mode. The command is idempotent
  when preview state is already absent.
  Product-grade preview environments with GitHub App webhooks, comments/checks, policy, cleanup
  retries, audit, and managed domain lifecycle require Appaloft Cloud or a self-hosted
  control plane. That control-plane product line must still reuse repository config and explicit
  operations rather than adding preview fields to `deployments.create`. The governing Spec Round is
  [Product-Grade Preview Deployments](./specs/046-product-grade-preview-deployments/spec.md).
  `preview-policies.configure` and `preview-policies.show` now expose CLI and HTTP/oRPC routes
  backed by durable Postgres/PGlite policy storage and safe default or configured read-model
  summaries, including same-repository, fork, secret-backed, active preview quota, and preview TTL
  settings.
  `preview-environments.list`, `preview-environments.show`, and `preview-environments.delete` now
  expose CLI and HTTP/oRPC routes over safe Resource-derived preview environment read models and
  cleanup-service input. MCP/tool contracts are generated from the operation catalog for
  these preview operations. Web exposes `/preview-policies` controls for policy
  readback/configuration, Resource detail exposes previews as temporary derived runtime
  environments under the parent Resource, and `/preview-environments` remains a secondary
  all-project rollup rather than a peer Resource collection. The GitHub source-event HTTP route now
  accepts verified `pull_request` deliveries for the first product-grade preview slice. It uses
  trusted Appaloft project/environment/resource/server/destination/source-fingerprint context
  headers when supplied, or resolves repository full name/provider repository id plus base ref
  through the source-event policy reader when headers are absent. Cleanup retry scheduler leases are
  active for the current preview lifecycle baseline, while managed domain lifecycle remains future
  public enablement work.
  Compatibility preview Resources that live in preview-kind Environments are omitted from default
  `resources.list` results and may be deleted through explicit operator confirmation without
  treating retained preview deployment/audit rows as product Resource blockers.
- Repository config `preview.pullRequest.policy` is governed by ADR-077/spec 086 as a
  workflow/profile extension over existing `preview-policies.configure` and
  `preview-policies.show`. Ordinary trusted config deploy reconciles a Resource-scoped preview
  policy before ids-only deployment admission; PR preview deploys skip policy mutation so a PR
  branch cannot change the policy that admits previews. No new operation-catalog key is introduced.

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
- manual deployment health check and write-side reattach are not public operations in the v1
  surface. They must be reintroduced only after new source-of-truth specs, test matrices,
  implementation plans, and Web/API/CLI contracts are accepted. `deployments.cancel` has been
  reintroduced only as a narrow active-attempt command with explicit confirmation and
  `resource-runtime` coordination.
- Deployment recovery readiness is active under
  [ADR-034: Deployment Recovery Readiness](./decisions/ADR-034-deployment-recovery-readiness.md).
  The `deployments.recovery-readiness` query is the shared read-only source for retry, redeploy,
  rollback candidate, and rollback readiness across Web, CLI, HTTP/oRPC, and MCP/tool
  surfaces.
- `deployments.retry` creates a new deployment attempt from a failed/interrupted/canceled/
  superseded attempt's immutable snapshot intent. It does not replay old events and does not mutate
  the old attempt. Its command implementation is scoped by
  [Deployment Retry And Redeploy](./specs/040-deployment-retry-redeploy/spec.md). Retry execution
  is projected into `operator-work.*` through safe process-attempt rows with Deployment, Resource,
  server, runtime plan, target backend, and source deployment lineage metadata.
- `deployments.redeploy` creates a new deployment attempt from the current Resource profile,
  effective configuration, target, and destination at admission time. It is the "deploy current
  desired state again" operation, not a retry of an old snapshot. Its command implementation is scoped by
  [Deployment Retry And Redeploy](./specs/040-deployment-retry-redeploy/spec.md). Redeploy
  delegates through `deployments.create` and uses the create-deployment process-attempt projection
  path with operation key `deployments.redeploy`.
- `deployments.rollback` creates a new rollback deployment attempt from a retained successful
  candidate's immutable snapshot and Docker/OCI artifact identity. It does not re-plan from the
  current Resource profile and does not roll back databases, volumes, or external dependencies. Its
  command implementation is scoped by
  [Deployment Rollback](./specs/041-deployment-rollback/spec.md). Rollback execution is projected
  into `operator-work.*` through safe process-attempt rows with Deployment, Resource, server,
  runtime plan, target backend, source deployment lineage, and rollback candidate lineage metadata.
  Execution still runs inline through the rollback use case rather than process-attempt atomic
  claim/completion.
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

## Identity Governance And Self-Hosted Auth

Business meaning:
- identity governance owns organizations, membership, and machine credentials for self-hosted and
  future hosted control-plane operation
- account settings own signed-in user profile metadata, safe session readback, and explicit
  account deletion through Appaloft-owned ports implemented by the auth adapter
- deploy tokens are machine credentials for automation, not Better Auth user sessions
- Action mutation endpoints must be authenticated and authorized before they can reach source-link,
  config bootstrap, preview cleanup, route, resource, or deployment commands

Implemented operations:

| Operation | Status | Operation key | Message | Input model | CLI | HTTP/oRPC |
| --- | --- | --- | --- | --- | --- | --- |
| Create deploy token | Admin/operator-protected lifecycle command | `deploy-tokens.create` | `CreateDeployTokenCommand` | `CreateDeployTokenCommandInput` | `appaloft deploy-token create` | `POST /api/deploy-tokens` |
| List deploy tokens | Admin/operator-protected lifecycle query | `deploy-tokens.list` | `ListDeployTokensQuery` | `ListDeployTokensQueryInput` | `appaloft deploy-token list` | `GET /api/deploy-tokens` |
| Show deploy token | Admin/operator-protected lifecycle query | `deploy-tokens.show` | `ShowDeployTokenQuery` | `ShowDeployTokenQueryInput` | `appaloft deploy-token show <tokenId>` | `GET /api/deploy-tokens/{tokenId}` |
| Rotate deploy token | Admin/operator-protected lifecycle command | `deploy-tokens.rotate` | `RotateDeployTokenCommand` | `RotateDeployTokenCommandInput` | `appaloft deploy-token rotate <tokenId> --confirm <tokenId>` | `POST /api/deploy-tokens/{tokenId}/rotate` |
| Revoke deploy token | Admin/operator-protected lifecycle command | `deploy-tokens.revoke` | `RevokeDeployTokenCommand` | `RevokeDeployTokenCommandInput` | `appaloft deploy-token revoke <tokenId> --confirm <tokenId>` | `POST /api/deploy-tokens/{tokenId}/revoke` |
| Read account profile | Product-session protected query | `account.profile.show` | `ShowAccountProfileQuery` | `ShowAccountProfileQueryInput` | - | `GET /api/account/profile` |
| Change account profile | Product-session protected command | `account.profile.change` | `ChangeAccountProfileCommand` | `ChangeAccountProfileCommandInput` | - | `POST /api/account/profile` |
| List account sessions | Product-session protected query returning safe Web/CLI/unknown client metadata when known | `account.sessions.list` | `ListAccountSessionsQuery` | `ListAccountSessionsQueryInput` | - | `GET /api/account/sessions` |
| Revoke account session | Product-session protected command | `account.sessions.revoke` | `RevokeAccountSessionCommand` | `RevokeAccountSessionCommandInput` | - | `POST /api/account/sessions/{sessionId}/revoke` |
| Delete account | Product-session protected command | `account.delete` | `DeleteAccountCommand` | `DeleteAccountCommandInput` | - | `DELETE /api/account` |

The foundational `Organization` aggregate exists in `packages/core`, Better Auth-compatible tables
exist in persistence, Web can read auth-session status, and deploy-token create/list/show/rotate/
revoke now have application message handlers plus CLI and admin-protected HTTP/oRPC
operation-catalog transports. Web `/organization` now exposes deploy-token list/create/rotate/
revoke through the same contracts. MCP token-management descriptors are generated from the active
operation catalog when the MCP server is configured; hosted gateway policy remains outside this
document.

Docker self-host installer bootstrap is a narrow optional install-time entrypoint over the existing
`deploy-tokens.create` application command, not a public deploy-token management surface.
`install.sh --bootstrap-deploy-token` configures a container-local
`APPALOFT_BOOTSTRAP_DEPLOY_TOKEN_OUTPUT_FILE`; Shell startup uses `ListDeployTokensQuery` and
`CreateDeployTokenCommand` to write one-time raw token handoff output only when no active
`org_self_hosted` deploy token exists, and the installer reads and removes that file before
printing the token to trusted install output. Plain SSH install does not need or create a machine
deploy token; admins can create one later from the console or CLI.

Active Phase 8 identity operations:
- first-admin bootstrap and admin authorization policy
- organization/team membership management

First-admin operations are governed by
[ADR-044: Self-Hosted First Admin Bootstrap](./decisions/ADR-044-self-hosted-first-admin-bootstrap.md)
and [Self-Hosted First Admin Bootstrap](./specs/053-self-hosted-first-admin-bootstrap/spec.md):

| Operation | Status | Operation key | Message | Input model | CLI | HTTP/oRPC |
| --- | --- | --- | --- | --- | --- | --- |
| Read first-admin bootstrap status | Public bootstrap query | `auth.bootstrap-status` | `GetAuthBootstrapStatusQuery` | `GetAuthBootstrapStatusQueryInput` | `appaloft auth bootstrap-status`; installer also reads safe handoff output | `GET /api/bootstrap/auth/status` |
| Bootstrap first admin | Public one-time bootstrap command | `auth.bootstrap-first-admin` | `BootstrapFirstAdminCommand` | `BootstrapFirstAdminCommandInput` | `appaloft auth bootstrap-first-admin`; installer can also drive setup through trusted config/handoff | `POST /api/bootstrap/auth/first-admin`; application status check keeps it one-time/idempotent |

These operations must use Appaloft-owned application ports so `@appaloft/auth-better` can implement
local email/password user creation and initial organization ownership without leaking Better Auth
types into core or application.

Organization/team operations are governed by
[ADR-045: Self-Hosted Organization Team Operations](./decisions/ADR-045-self-hosted-organization-team-operations.md)
and
[Self-Hosted Organization Team Operations](./specs/054-self-hosted-organization-team-operations/spec.md).
Account and organization settings operations are governed by
[ADR-081: Account And Organization Settings Boundary](./decisions/ADR-081-account-and-organization-settings-boundary.md)
and
[Account And Organization Settings](./specs/091-account-and-organization-settings/spec.md):

| Operation | Status | Operation key | Message | Input model | CLI | HTTP/oRPC |
| --- | --- | --- | --- | --- | --- | --- |
| Read current organization context | Product-session protected query | `organizations.current-context` | `GetCurrentOrganizationContextQuery` | `GetCurrentOrganizationContextQueryInput` | `appaloft organization context` | `GET /api/organizations/current-context` |
| Read organization profile | Product-session protected query | `organizations.profile.show` | `ShowOrganizationProfileQuery` | `ShowOrganizationProfileQueryInput` | - | `GET /api/organizations/{organizationId}/profile` |
| Change organization profile | Admin/operator-protected command | `organizations.profile.change` | `ChangeOrganizationProfileCommand` | `ChangeOrganizationProfileCommandInput` | - | `POST /api/organizations/{organizationId}/profile` |
| Delete organization | Owner-protected command | `organizations.delete` | `DeleteOrganizationCommand` | `DeleteOrganizationCommandInput` | - | `DELETE /api/organizations/{organizationId}` |
| Switch current organization | Product-session protected command | `organizations.switch-current` | `SwitchCurrentOrganizationCommand` | `SwitchCurrentOrganizationCommandInput` | `appaloft organization switch <organizationId>` | `POST /api/organizations/current-context/switch` |
| List organization members | Admin/operator-protected query | `organizations.list-members` | `ListOrganizationMembersQuery` | `ListOrganizationMembersQueryInput` | `appaloft organization members list` | `GET /api/organizations/{organizationId}/members` |
| List organization invitations | Admin/operator-protected query | `organizations.list-invitations` | `ListOrganizationInvitationsQuery` | `ListOrganizationInvitationsQueryInput` | `appaloft organization invitations list` | `GET /api/organizations/{organizationId}/invitations` |
| Invite organization member | Admin/operator-protected command | `organizations.invite-member` | `InviteOrganizationMemberCommand` | `InviteOrganizationMemberCommandInput` | `appaloft organization member invite` | `POST /api/organizations/{organizationId}/invitations` |
| Change organization member role | Admin/operator-protected command | `organizations.change-member-role` | `ChangeOrganizationMemberRoleCommand` | `ChangeOrganizationMemberRoleCommandInput` | `appaloft organization member role <memberId>` | `POST /api/organizations/{organizationId}/members/{memberId}/role` |
| Remove organization member | Admin/operator-protected command | `organizations.remove-member` | `RemoveOrganizationMemberCommand` | `RemoveOrganizationMemberCommandInput` | `appaloft organization member remove <memberId>` | `DELETE /api/organizations/{organizationId}/members/{memberId}` |
| Restore organization member | Admin/operator-protected command | `organizations.reactivate-member` | `ReactivateOrganizationMemberCommand` | `ReactivateOrganizationMemberCommandInput` | `appaloft organization member restore <memberId>` | `POST /api/organizations/{organizationId}/members/{memberId}/reactivate` |
| Transfer organization owner | Owner-protected command | `organizations.transfer-owner` | `TransferOrganizationOwnerCommand` | `TransferOrganizationOwnerCommandInput` | `appaloft organization owner transfer <fromMemberId> <toMemberId>` | `POST /api/organizations/{organizationId}/owner-transfer` |

These operations now have application message/handler/service boundaries, `@appaloft/auth-better`
adapter implementations behind Appaloft-owned ports, operation-catalog transports,
authorization-gated HTTP/oRPC routes, Web account/organization settings surfaces, and CLI commands
where listed. Public docs/help coverage is active under
`self-hosting.organization-team-management`; Web `/organization` exposes current context, safe
current organization switching, member and invitation reads, invite, non-owner role update,
ownership transfer, non-owner removal, and deploy-token controls through the same oRPC contracts.
Web `/account/*` exposes profile, security, session, and danger-zone settings through account
operations and existing auth-runtime security endpoints. MCP descriptors are generated from the
same operation catalog entries.

Current boundary:
- self-hosted Action deploy-token authentication is an admission gate over existing Action
  workflows, not a new deployment operation
- `POST /api/action/deployments/from-source-link`,
  `POST /api/action/deployments/from-config-package`, and self-hosted Action
  `POST /api/deployments/cleanup-preview` must require bearer deploy-token authorization before
  mutation
- deploy-token scope is also a safe target-resolution fact for Action source-link/server-config
  deploys; complete unique project/environment/resource/server scope can remove the need for
  ordinary workflow-supplied ids, while conflicts still return 403 before mutation
- deploy tokens must never be accepted from repository config, query strings, source packages, or
  `deployments.create` input
- raw token values are one-time output only; list/show/readiness/log surfaces expose safe metadata
  and scope summaries only
- deploy-token lifecycle operations are public through CLI, HTTP/oRPC, Web `/organization`, and
  generated MCP descriptors
- account profile updates are intentionally narrow: display name and avatar URL only; email and
  password remain account-security behavior through configured auth-runtime endpoints
- account/session queries return safe read models only and never expose cookies, session tokens,
  provider account tokens, invite secrets, or Better Auth table shapes
- account deletion and organization deletion are danger-zone commands that require exact id
  confirmation and must not cascade Appaloft project, resource, deployment, deploy-token, runtime,
  audit, or retained history state

## Operator Work

Business meaning:
- operator work is the read-only visibility surface for long-running or background Appaloft work
- it aggregates durable process attempts first, then compatibility read models for workflows that
  have not yet opted into durable process delivery
- it helps operators decide which diagnostic or manual review path to use
- durable process delivery is governed by ADR-054 as the outbox/inbox-equivalent baseline for
  accepted long-running work; scheduled-task runs, scheduled runtime prune, scheduled history
  retention, and runtime monitoring collection are selected durable worker bindings. Dependency
  resource backup/restore consumes process-attempt claim/completion when journal ports are
  available. Scheduled-task runs, scheduled runtime prune, scheduled history retention, and runtime
  monitoring collection are selected durable worker bindings. Other workflow-specific workers must
  opt in through local specs before retry execution can run provider or runtime work.

Implemented operations:

| Capability | Kind | Operation Key | Message | Schema | CLI | oRPC / HTTP |
| --- | --- | --- | --- | --- | --- | --- |
| List operator work ledger | Query | `operator-work.list` | `ListOperatorWorkQuery` | `ListOperatorWorkQueryInput` | `appaloft work list` | `GET /api/operator-work` |
| Show operator work item | Query | `operator-work.show` | `ShowOperatorWorkQuery` | `ShowOperatorWorkQueryInput` | `appaloft work show <workId>` | `GET /api/operator-work/{workId}` |
| Stream operator work parent status | Query | `operator-work.stream-events` | `StreamOperatorWorkEventsQuery` | `StreamOperatorWorkEventsQueryInput` | `appaloft work events <workId>` | `GET /api/operator-work/{workId}/events` and `GET /api/operator-work/{workId}/events/stream` |
| Mark operator work recovered | Command | `operator-work.mark-recovered` | `MarkOperatorWorkRecoveredCommand` | `MarkOperatorWorkRecoveredCommandInput` | `appaloft work mark-recovered <workId>` | `POST /api/operator-work/{workId}/mark-recovered` |
| Dead-letter operator work | Command | `operator-work.dead-letter` | `DeadLetterOperatorWorkCommand` | `DeadLetterOperatorWorkCommandInput` | `appaloft work dead-letter <workId>` | `POST /api/operator-work/{workId}/dead-letter` |
| Cancel operator work | Command | `operator-work.cancel` | `CancelOperatorWorkCommand` | `CancelOperatorWorkCommandInput` | `appaloft work cancel <workId>` | `POST /api/operator-work/{workId}/cancel` |
| Retry operator work | Command | `operator-work.retry` | `RetryOperatorWorkCommand` | `RetryOperatorWorkCommandInput` | `appaloft work retry <workId>` | `POST /api/operator-work/{workId}/retry` |
| Prune operator work journal | Command | `operator-work.prune` | `PruneOperatorWorkCommand` | `PruneOperatorWorkCommandInput` | `appaloft work prune --before <iso>` | `POST /api/operator-work/prune` |
| List audit events | Query | `audit-events.list` | `ListAuditEventsQuery` | `ListAuditEventsQueryInput` | `appaloft audit-event list --aggregate <aggregateId>` | `GET /api/audit-events` |
| Show audit event | Query | `audit-events.show` | `ShowAuditEventQuery` | `ShowAuditEventQueryInput` | `appaloft audit-event show <auditEventId> --aggregate <aggregateId>` | `GET /api/audit-events/{auditEventId}` |
| Export audit events | Query | `audit-events.export` | `ExportAuditEventsQuery` | `ExportAuditEventsQueryInput` | `appaloft audit-event export --aggregate <aggregateId>` | `GET /api/audit-events/export` |
| Export global audit events | Query | `audit-events.export-global` | `ExportGlobalAuditEventsQuery` | `ExportGlobalAuditEventsQueryInput` | `appaloft audit-event export-global --from <iso> --to <iso>` | `GET /api/audit-events/export-global` |
| Configure audit event legal hold | Command | `audit-events.legal-holds.configure` | `ConfigureAuditEventLegalHoldCommand` | `ConfigureAuditEventLegalHoldCommandInput` | `appaloft audit-event legal-hold configure` | `POST /api/audit-events/legal-holds` |
| List audit event legal holds | Query | `audit-events.legal-holds.list` | `ListAuditEventLegalHoldsQuery` | `ListAuditEventLegalHoldsQueryInput` | `appaloft audit-event legal-hold list` | `GET /api/audit-events/legal-holds` |
| Show audit event legal hold | Query | `audit-events.legal-holds.show` | `ShowAuditEventLegalHoldQuery` | `ShowAuditEventLegalHoldQueryInput` | `appaloft audit-event legal-hold show <holdId>` | `GET /api/audit-events/legal-holds/{holdId}` |
| Release audit event legal hold | Command | `audit-events.legal-holds.release` | `ReleaseAuditEventLegalHoldCommand` | `ReleaseAuditEventLegalHoldCommandInput` | `appaloft audit-event legal-hold release <holdId>` | `POST /api/audit-events/legal-holds/{holdId}/release` |
| Create audit event immutable archive | Command | `audit-events.archives.create` | `CreateAuditEventArchiveCommand` | `CreateAuditEventArchiveCommandInput` | `appaloft audit-event archive create` | `POST /api/audit-events/archives` |
| List audit event immutable archives | Query | `audit-events.archives.list` | `ListAuditEventArchivesQuery` | `ListAuditEventArchivesQueryInput` | `appaloft audit-event archive list` | `GET /api/audit-events/archives` |
| Show audit event immutable archive | Query | `audit-events.archives.show` | `ShowAuditEventArchiveQuery` | `ShowAuditEventArchiveQueryInput` | `appaloft audit-event archive show <archiveId>` | `GET /api/audit-events/archives/{archiveId}` |
| Prune audit event immutable archives | Command | `audit-events.archives.prune` | `PruneAuditEventArchivesCommand` | `PruneAuditEventArchivesCommandInput` | `appaloft audit-event archive prune --before <iso>` | `POST /api/audit-events/archives/prune` |
| Prune audit events | Command | `audit-events.prune` | `PruneAuditEventsCommand` | `PruneAuditEventsCommandInput` | `appaloft audit-event prune --before <iso>` | `POST /api/audit-events/prune` |
| Configure retention defaults | Command | `retention-defaults.configure` | `ConfigureRetentionDefaultsCommand` | `ConfigureRetentionDefaultsCommandInput` | `appaloft retention-default configure --category <category> --retention-days <days>` | `POST /api/retention-defaults` |
| List retention defaults | Query | `retention-defaults.list` | `ListRetentionDefaultsQuery` | `ListRetentionDefaultsQueryInput` | `appaloft retention-default list` | `GET /api/retention-defaults` |
| Show retention default | Query | `retention-defaults.show` | `ShowRetentionDefaultQuery` | `ShowRetentionDefaultQueryInput` | `appaloft retention-default show <category>` | `GET /api/retention-defaults/{category}` |
| Prune domain event stream | Command | `domain-events.prune` | `PruneDomainEventsCommand` | `PruneDomainEventsCommandInput` | `appaloft domain-event prune --before <iso>` | `POST /api/domain-events/prune` |
| Prune provider job logs | Command | `provider-job-logs.prune` | `PruneProviderJobLogsCommand` | `PruneProviderJobLogsCommandInput` | `appaloft provider-job-log prune --before <iso>` | `POST /api/provider-job-logs/prune` |

Current boundary:
- `operator-work.list` and `operator-work.show` are read-only; they do not retry, cancel,
  dead-letter, prune, or clean up work
- `operator-work.mark-recovered` is a narrow durable process attempt ledger mutation. It marks only
  failed, retry-scheduled, or dead-lettered process attempt rows as manually recovered and clears
  retry eligibility. It does not retry, cancel, dead-letter, prune, recover remote state, or mutate
  deployment/resource/server/runtime state
- `operator-work.dead-letter` is a narrow durable process attempt ledger mutation. It marks only
  failed or retry-scheduled process attempt rows as dead-lettered, clears retry eligibility, and
  keeps manual review visible. It does not retry, cancel, mark recovered, prune, recover remote
  state, or mutate deployment/resource/server/runtime state
- `operator-work.cancel` is a narrow durable process attempt ledger mutation. It marks only pending
  or retry-scheduled process attempt rows as canceled and clears retry eligibility. It does not stop
  already-running runtime/provider work, retry, dead-letter, mark recovered, prune, recover remote
  state, or mutate deployment/resource/server/runtime state
- `operator-work.retry` is a narrow durable process attempt ledger mutation. It creates a new
  pending process attempt row only from a failed or retry-scheduled row with `retriable = true`,
  preserves safe lineage, and leaves operation-specific runtime/provider execution to governed
  workers. Scheduled-task retries can be drained by the scheduled-task durable worker; workflows
  without a governed worker remain pending annotations. It does not replay events, run provider
  work directly, prune, recover remote state, or mutate deployment/resource/server/runtime state
- `operator-work.prune` is a narrow durable process attempt ledger retention mutation. It dry-runs
  by default and deletes only old terminal durable process attempt rows when `dryRun = false`. It
  does not prune runtime artifacts, workspaces, build cache, remote-state backups, deployment
  snapshots, audit events, event streams, logs, provider resources, resource state, deployment
  state, or compatibility ledger rows aggregated from other read models
- the current slice reads the internal durable process attempt journal first, then aggregates
  deployment attempts, latest proxy bootstrap state, latest certificate attempts, safe remote SSH
  state lock/migration/backup/recovery-marker summaries, safe source-link summaries, and
  route-realization summaries from existing read models for compatibility
- worker, scheduler, runtime-maintenance, and job status are visible when they are recorded in the
  durable process attempt journal
- ADR-054 durable process delivery is implemented for selected durable worker bindings:
  scheduled-task runs record process attempts, claim/complete due attempts, and can generate and
  drain due retry attempts; scheduled runtime prune records policy-tick attempts and dispatches
  `servers.capacity.prune` through the command bus; scheduled history retention records
  retention-default category attempts and runs existing manual history prune commands through the
  command bus or governed direct retention stores such as runtime monitoring sample pruning;
  runtime monitoring collection records runtime-maintenance attempts, claims/completes due
  attempts, and writes retained samples through the runtime-usage query boundary without mutating
  runtime targets.
  Preview cleanup, certificate issuance, certificate import, proxy bootstrap,
  resource runtime control, source-event auto-deploy, dependency resource backup/restore,
  provider-native dependency resource realization/delete, deployment create execution,
  domain-binding verification retry, domain-binding create verification, deployment retry
  execution, and deployment rollback execution also project selected outcomes into the process
  attempt journal for operator visibility. Dependency resource backup/restore consumes
  process-attempt atomic claim/completion when journal ports are available, while the other listed
  inline provider/runtime workflows still require governed local specs and explicit worker
  enablement before automatic retry execution can run provider or runtime work.
- `audit-events.list` and `audit-events.show` are read-only aggregate-scoped history views over
  retained audit rows; they do not provide global audit export, delete retention, replay events,
  retry work, or mutate runtime/state roots
- `audit-events.export` is a read-only bounded aggregate-scoped export over retained audit rows. It
  returns redacted detail rows with export metadata for operator support or prune/delete review. It
  is not a legal hold, immutable archive, organization retention policy, global export, replay
  source, or mutation.
- `audit-events.export-global` is a read-only bounded, time-windowed export over retained audit
  rows across aggregates. It returns the same redacted detail shape as aggregate export and is not a
  legal hold, immutable archive, organization retention policy, replay source, scheduled retention
  policy, or mutation.
- audit legal hold operations record active retention guard records for one aggregate or a bounded
  global time window, expose safe list/show readback, and support explicit release while preserving
  hold history. Active holds block `audit-events.prune` from deleting matching rows and surface
  held counts without creating immutable archive storage or organization defaults.
- audit immutable archive operations create bounded retained redacted snapshots, expose safe
  list/show readback with digest metadata, and dry-run/prune archive records without deleting
  source audit rows. Archives with source-row reference retention guard referenced source audit rows
  from `audit-events.prune` until the archive is pruned.
- `audit-events.prune` is a narrow audit row retention mutation. It dry-runs by default, requires
  a cutoff, optionally narrows by aggregate id or event type, skips rows matched by active audit
  legal holds or retained archive source-row references, and deletes only unheld/unarchived
  `audit_logs` rows whose `createdAt < before` when destructive mode is explicit. It does not
  prune domain event streams, outbox/inbox records,
  process attempts, runtime logs, provider job logs, deployment snapshots, remote-state backups,
  runtime artifacts, source workspaces, build cache, routes, resource/server/deployment state,
  dependencies, or storage volumes
- `retention-defaults.configure/list/show` are active application command/query operations for
  non-executing
  organization-level retention default policy. They define default windows and scheduling flags for
  governed history categories, but they do not execute prune work, change manual prune command
  cutoff requirements, override legal holds or archive guards, or make any retention command
  destructive by default. CLI and HTTP/oRPC entrypoints dispatch through the shared command/query
  schemas.
- scheduled history retention is an implemented internal worker boundary governed by ADR-061. It
  consumes `retention-defaults.*`, computes cutoffs, records durable process attempts, and runs
  governed category retention through existing manual prune commands or direct retention stores. It
  has no first-slice public command and must preserve every category-specific guard.
- `domain-events.prune` is a narrow retained domain event stream retention mutation. It is governed
  by ADR-059 and targets the `domain_event_stream_records` retained observation store plus prune
  watermark state. It dry-runs by default and must stay separate from audit rows,
  outbox/inbox/process attempts, logs, snapshots, runtime artifacts, and business state.
- `provider-job-logs.prune` is a narrow provider job log retention mutation. It dry-runs by
  default, requires a cutoff, optionally narrows by deployment id, provider key, resource id, or
  server id, and deletes only `provider_job_logs` rows whose `created_at < before` when destructive
  mode is explicit. It does not prune deployment rows, embedded deployment logs, runtime logs,
  audit rows, domain event streams, outbox/inbox records, process attempts, snapshots, runtime
  artifacts, source workspaces, build cache, provider resources, or business state

Runtime log archive retention operations:

| Capability | Kind | Operation Key | CLI | oRPC / HTTP |
| --- | --- | --- | --- | --- |
| Archive resource runtime logs | Command | `resources.runtime-logs.archive` | `appaloft resource log-archives archive <resourceId>` | `POST /api/resources/{resourceId}/runtime-log-archives` |
| List resource runtime log archives | Query | `resources.runtime-log-archives.list` | `appaloft resource log-archives list` | `GET /api/resources/runtime-log-archives` |
| Show resource runtime log archive | Query | `resources.runtime-log-archives.show` | `appaloft resource log-archives show <archiveId>` | `GET /api/resources/runtime-log-archives/{archiveId}` |
| Prune resource runtime log archives | Command | `resources.runtime-log-archives.prune` | `appaloft resource log-archives prune --before <iso>` | `POST /api/resources/runtime-log-archives/prune` |
| Prune resource runtime control attempts | Command | `resources.runtime-control-attempts.prune` | `appaloft resource runtime-control-attempts prune --before <iso>` | `POST /api/resources/runtime-control-attempts/prune` |
- resource runtime log archive retention captures only bounded redacted archive snapshots from
  `resources.runtime-logs` into Appaloft-owned retained records, then list/show/prunes those
  records. It does not persist every live runtime line by default and does not mutate external
  Docker/Compose/Swarm/SSH/PM2/systemd/file-tail/provider log stores, deployment logs, provider job
  logs, audit rows, domain event streams, outbox/inbox records, process attempts, snapshots,
  runtime artifacts, source workspaces, build cache, or business state
- remote-state stale-lock recovery, migration execution, backup/marker diagnostics, and state-root
  marker pruning are active through the SSH remote-state lifecycle, remote-state diagnostics read
  model, and `servers.capacity.prune` remote-state-marker category. Full raw remote PGlite backup
  restore is not exposed as an operator shortcut; remote sync restore/recovery remains bounded to
  the SSH state lifecycle and guarded upload path rather than `operator-work.*`.

Terminal session lifecycle boundary:
- `terminal-sessions.list` and `terminal-sessions.show` expose only active ephemeral session
  descriptors and safe scope metadata
- `terminal-sessions.close` and `terminal-sessions.expire` release gateway-owned PTY, SSH,
  subprocess, and transport resources; they do not mutate resource, deployment, or target
  aggregates
- `terminal-sessions.expire` uses an explicit `olderThan` cutoff when supplied; otherwise the
  runtime gateway applies the configured activity-aware active-session TTL, defaulting to 3600
  seconds; terminal input, resize frames, and backend output refresh activity
- active attach transports may replay a bounded in-memory output tail after reconnect, defaulting
  to 65536 bytes and configurable through `APPALOFT_TERMINAL_SESSION_OUTPUT_RETENTION_BYTES`; this
  is transport-only and never appears in list/show, lifecycle command responses, audit rows, or
  durable read models
- Web Instance management lists active terminal sessions and dispatches close/old-session-expire
  through the same lifecycle operations without attaching to terminal transports or reading output
- terminal lifecycle operations must not persist or return terminal input/output, raw shell command
  strings, SSH private keys, access tokens, environment secret values, provider SDK objects, or raw
  provider payloads
- opened and closed terminal sessions are retained as durable audit rows with safe metadata only
  when audit persistence is configured; they remain inspectable through the audit-event read surface
  without retaining terminal input/output
- next actions are guidance such as diagnostic/manual review/no-action, not hidden mutation
  affordances
- work item detail must not expose raw logs, private keys, raw environment values, certificate
  material, credential-bearing command lines, or provider-native output

## Routing / Domain Bindings

Business meaning:
- runtime plan access routes are deployment snapshots, not durable domain ownership state
- a `DomainBinding` is durable routing/domain ownership state for a project, environment, and
  resource, with optional server/destination target hints when the route is server-backed
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
  returns accepted `ok({ id })`. Initial ownership verification attempts are also projected into
  `operator-work.*` through safe process-attempt rows with DomainBinding, Resource, optional server
  target, and DNS expectation metadata
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
  durable PG/PGlite-backed secret persistence rather than placeholder refs. Successful manual
  imports are also projected into `operator-work.*` through safe process-attempt rows without PEM,
  private-key, or passphrase material
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
  `certificate-requested`; the retry-created attempt uses the `certificates.issue-or-renew`
  process-attempt projection path for operator-work visibility rather than a separate
  `certificates.retry` worker binding. It does not retry domain binding ownership verification and
  does not replay old events
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
  observation to a waitable pending state when expected targets are known. Accepted verification
  retry attempts are also projected into `operator-work.*` through safe process-attempt rows with
  DomainBinding, Resource, server, and DNS expectation metadata. It does not retry certificate
  issuance, route repair, deployment retry, redeploy, or rollback.
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
| List integrations | Query | `system.integrations.list` | `ListIntegrationsQuery` | none | none yet | `GET /api/integrations` |
| List GitHub repositories | Query | `system.github-repositories.list` | `ListGitHubRepositoriesQuery` | `ListGitHubRepositoriesQueryInput` | none yet | `GET /api/integrations/github/repositories` |
| Show GitHub App connection | Query | `system.github-app-connection.show` | `GitHubAppConnectionQuery` | `GitHubAppConnectionQueryInput` | none yet | `GET /api/integrations/github/app-connection` |
| Doctor diagnostics | Query | `system.doctor` | `DoctorQuery` | none | `appaloft doctor` | `GET /api/system/doctor` |
| Check instance upgrade | Query | `system.instance-upgrade.check` | `CheckInstanceUpgradeQuery` | `CheckInstanceUpgradeQueryInput` | `appaloft upgrade check` | `GET /api/instance-upgrade/check` |
| Apply instance upgrade | Command | `system.instance-upgrade.apply` | `ApplyInstanceUpgradeCommand` | `ApplyInstanceUpgradeCommandInput` | `appaloft upgrade apply --confirm` | `POST /api/instance-upgrade/apply` |
| Database status | Query | `system.db-status` | `DbStatusQuery` | none | `appaloft db status` | none |
| Database migrate | Command | `system.db-migrate` | `DbMigrateCommand` | none | `appaloft db migrate` | none |

Current boundary:
- provider and plugin list operations are read-only diagnostics; they expose stable capability
  flags, optional capability details, and safe configuration diagnostics for operators and future
  tools
- integration list is a read-only catalog for neutral external provider connection modes; it must not
  require a particular hosted provider app or expose raw provider app credentials
- instance upgrade check is read-only and may return an SSH command even when the Web console cannot
  execute the upgrade directly
- instance upgrade apply requires explicit confirmation and a host-side process with
  `APPALOFT_INSTANCE_UPGRADE_APPLY_ENABLED=1`; standard containerized self-hosting keeps direct Web
  mutation disabled by default
- provider and plugin list operations must not expose provider SDK types, raw SDK payloads, plugin
  implementation internals, access tokens, private keys, secret references, certificate material, or
  unredacted command output
- `system.doctor` is a read-only local diagnostic query. It returns readiness, provider/plugin
  summaries, and configured maintenance worker status from shell configuration through CLI,
  HTTP/oRPC, and the Web Instance page. Worker status includes safe activation configuration keys so
  operators can see which explicit worker enablement settings make a disabled-by-default worker
  active. The worker status output is observability only; it does not start workers, stop workers,
  tick schedulers, run prune commands, collect runtime samples, execute scheduled tasks, cleanup
  expired previews, or make disabled-by-default workers active.
- Certificate retry is the only default-on maintenance scheduler because it drains already accepted
  managed certificate attempts in retry-scheduled state. Runtime execution, runtime prune, history
  retention, monitoring collection, and preview cleanup workers remain disabled by default and must
  be enabled through explicit `APPALOFT_*_ENABLED` configuration.
- planned providers and incompatible plugins may remain visible, but disabled capability details and
  configuration diagnostics must make the inactive state explicit
- embedded self-hosted PGlite applies migrations automatically during shell startup
- Docker self-hosted installs enable startup migrations before the HTTP server is marked healthy
- explicit `db migrate` remains the schema-control operation for external PostgreSQL and operational
  workflows that want a manual migration step

## How Interfaces Must Use This

CLI:
- CLI commands are transport shells only
- they parse flags and positional args, then construct the matching command or query input and
  dispatch through the bus
- when a local CLI profile selects a remote Appaloft Cloud or self-hosted control plane, the CLI may
  dispatch generated non-streaming operations through the typed remote API client instead of a local
  bus, but the operation key and input schema must remain the same as the HTTP/oRPC operation
- `appaloft login`, `appaloft auth token login`, `appaloft logout`, `appaloft auth status`, and
  `appaloft context *` manage local uncommitted client state; they must not write secrets to
  `appaloft.yml`, create operation-catalog aliases, or add control-plane fields to
  `deployments.create`
- top-level quick deploy/source-package, webhook-signature-only ingestion, terminal attach, and
  streaming/watch behavior remain separate governed entrypoint capabilities until their transport
  contracts are specified

oRPC / HTTP:
- business endpoints map to the operations above
- endpoint input must be the operation schema input
- endpoint handlers must dispatch through `CommandBus` or `QueryBus`

Web:
- the web console must call the typed oRPC client or HTTP contract built from these operations
- it must not hide business rules in components

MCP / AI tools:
- the v1 Appaloft skill is a public documentation/skill artifact over the CLI/API/Web operation
  catalog, not a separate business transport and not an operation-catalog entry. The agent deploy
  skill is its deploy subprotocol.
- `@appaloft/ai-mcp` generates one serializable tool descriptor per operation catalog key
- generated tool names are operation-key based, for example `projects_create`,
  `environments_create`, `deployments_plan`, and `deployments_create`
- MCP server handlers must dispatch through the same command/query messages and input schemas,
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
