# Core Operations

> CORE DOCUMENT
>
> This file is the human-facing and AI-facing source of truth for Yundu business capabilities.
> If a transport, UI flow, or local shortcut conflicts with this document, this document wins.
> The executable mirror of this document is
> [`packages/application/src/operation-catalog.ts`](/Users/nichenqin/projects/yundu/packages/application/src/operation-catalog.ts).

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

The current Yundu core is organized into six capability groups:

- Projects
- Deployment Targets
- Environments
- Resources
- Deployments
- System operations

Each group below lists the currently implemented business operations.

## Projects

Business meaning:
- a `Project` is the top-level deployment management unit
- environments and deployments belong to a project
- projects are the unit shown in CLI, API, and Web

Implemented operations:

| Capability | Kind | Operation Key | Message | Schema | CLI | oRPC / HTTP |
| --- | --- | --- | --- | --- | --- | --- |
| Create project | Command | `projects.create` | `CreateProjectCommand` | `CreateProjectCommandInput` | `yundu project create` | `POST /api/projects` |
| List projects | Query | `projects.list` | `ListProjectsQuery` | `ListProjectsQueryInput` | `yundu project list` | `GET /api/projects` |

Current boundary:
- a project is currently metadata plus deployment ownership
- project source binding is not yet a first-class aggregate concept
- GitHub repository import currently feeds deployment source selection, not a persisted project
  source binding

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
| List deployment targets | Query | `servers.list` | `ListServersQuery` | `ListServersQueryInput` | `yundu server list` | `GET /api/servers` |

Core next operations expected here:
- show server details
- update server profile
- deactivate server
- run connectivity check

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
- destinations and deployment targets / servers remain runtime placement, not the project
  organization layer

Implemented operations:

| Capability | Kind | Operation Key | Message | Schema | CLI | oRPC / HTTP |
| --- | --- | --- | --- | --- | --- | --- |
| List resources | Query | `resources.list` | `ListResourcesQuery` | `ListResourcesQueryInput` | `yundu resource list` | `GET /api/resources` |

Current boundary:
- resources are persisted and can be listed by project or environment
- deployment creation resolves or bootstraps a resource and destination before creating the
  deployment record
- provider-backed dependency resources remain `ResourceInstance`; they are not the same aggregate
  as project resources

Core next operations expected here:
- create resource
- show resource details
- update resource profile/source
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
| Create deployment | Command | `deployments.create` | `CreateDeploymentCommand` | `CreateDeploymentCommandInput` | `yundu deploy [path-or-source] [--config yundu.json]` | `POST /api/deployments` |
| List deployments | Query | `deployments.list` | `ListDeploymentsQuery` | `ListDeploymentsQueryInput` | `yundu deployments list` | `GET /api/deployments` |
| Read deployment logs | Query | `deployments.logs` | `DeploymentLogsQuery` | `DeploymentLogsQueryInput` | `yundu logs <deploymentId>` | `GET /api/deployments/{deploymentId}/logs` |
| Roll back deployment | Command | `deployments.rollback` | `RollbackDeploymentCommand` | `RollbackDeploymentCommandInput` | `yundu rollback <deploymentId>` | `POST /api/deployments/{deploymentId}/rollback` |

Current boundary:
- deployment source is currently supplied as `sourceLocator` when the deployment command is
  created
- `projectId`, `resourceId`, `destinationId`, `serverId`, and `environmentId` may be omitted when the active
  deployment-context defaults policy can resolve or bootstrap them
  - current self-hosted embedded profile reuses or creates a local default project, local-shell
    deployment target, local destination, local environment, and local resource
  - contexts that do not allow implicit ownership, such as future cloud/hosted flows, must still
    require explicit identifiers
- deployment method is now also supplied explicitly at command input time
  - current values: `auto`, `dockerfile`, `docker-compose`, `prebuilt-image`, `workspace-commands`
- command-driven deployments may also carry `installCommand`, `buildCommand`, `startCommand`,
  `port`, and `healthCheckPath`
- command-driven deployments may carry `configFilePath`; local adapters may also discover
  `yundu.json`, `yundu.config.json`, or `.yundu.json` beside the local source
- deployment config is a bootstrap hint, not a replacement aggregate:
  - `packages/deployment-config` owns the Zod schema and generated JSON Schema for these files
  - HTTP exposes the generated schema at `/api/schemas/yundu-config.json`
  - filesystem adapters read JSON and infer local project metadata from Node, Python, and Java
    project files
  - application services apply config bootstrap and default-context bootstrap as ordered strategies
    in the same deployment-context bootstrap layer
  - the config strategy validates provider keys through the provider registry
  - configured projects, environments, deployment targets, destinations, and resources are reused
    or created through the normal repositories before the runtime plan is built
  - if the command explicitly supplies `projectId`, `environmentId`, `destinationId`, or
    `serverId`, those explicit identifiers still win for the deployment selection
- detect and plan happen inside the deployment write flow

Core next operations expected here:
- explicit plan deployment without execution
- show deployment details
- stream deployment events
- cancel deployment

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
- tools such as `create_project`, `create_environment`, `plan_deployment`, `deploy_release`,
  `rollback_release` must map back to these operations or to future operations added here

## Authoring Checklist For New Business Capabilities

Before adding a new CLI command, API endpoint, or UI workflow:

1. Decide whether it is a `Command` or `Query`.
2. Add the operation to this file.
3. Add the executable mirror entry to
   [`packages/application/src/operation-catalog.ts`](/Users/nichenqin/projects/yundu/packages/application/src/operation-catalog.ts).
4. Create the vertical slice files:
   - `*.schema.ts`
   - `*.command.ts` or `*.query.ts`
   - `*.handler.ts`
   - `*.use-case.ts` or `*.query-service.ts`
5. Map CLI and oRPC / HTTP to that operation.
6. Add tests at the transport and application levels.

If a capability is not listed here, it is not part of the agreed Yundu business surface yet.
