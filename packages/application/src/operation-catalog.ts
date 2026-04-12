import { type ZodTypeAny } from "zod";
import { createDeploymentCommandInputSchema } from "./operations/deployments/create-deployment.command";
import { deploymentLogsQueryInputSchema } from "./operations/deployments/deployment-logs.query";
import { listDeploymentsQueryInputSchema } from "./operations/deployments/list-deployments.query";
import { rollbackDeploymentCommandInputSchema } from "./operations/deployments/rollback-deployment.command";
import { createEnvironmentCommandInputSchema } from "./operations/environments/create-environment.command";
import { diffEnvironmentsQueryInputSchema } from "./operations/environments/diff-environments.query";
import { listEnvironmentsQueryInputSchema } from "./operations/environments/list-environments.query";
import { promoteEnvironmentCommandInputSchema } from "./operations/environments/promote-environment.command";
import { setEnvironmentVariableCommandInputSchema } from "./operations/environments/set-environment-variable.command";
import { showEnvironmentQueryInputSchema } from "./operations/environments/show-environment.query";
import { unsetEnvironmentVariableCommandInputSchema } from "./operations/environments/unset-environment-variable.command";
import { createProjectCommandInputSchema } from "./operations/projects/create-project.command";
import { listProjectsQueryInputSchema } from "./operations/projects/list-projects.query";
import { listServersQueryInputSchema } from "./operations/servers/list-servers.query";
import { registerServerCommandInputSchema } from "./operations/servers/register-server.command";
import { listGitHubRepositoriesQueryInputSchema } from "./operations/system/list-github-repositories.query";
import { tokens } from "./tokens";

type OperationKind = "command" | "query";
type OperationDomain = "projects" | "servers" | "environments" | "deployments" | "system";

export interface OperationCatalogEntry {
  key: string;
  kind: OperationKind;
  domain: OperationDomain;
  messageName: string;
  handlerName: string;
  serviceName: string;
  inputSchema?: ZodTypeAny;
  serviceToken: symbol;
  transports: {
    cli?: string;
    orpc?: {
      method: "GET" | "POST" | "DELETE";
      path: string;
    };
  };
}

// Source of truth for business operations.
// CLI, oRPC, HTTP, and future MCP tools must dispatch these messages instead of bypassing application handlers.
export const operationCatalog = [
  {
    key: "projects.create",
    kind: "command",
    domain: "projects",
    messageName: "CreateProjectCommand",
    handlerName: "CreateProjectCommandHandler",
    serviceName: "CreateProjectUseCase",
    inputSchema: createProjectCommandInputSchema,
    serviceToken: tokens.createProjectUseCase,
    transports: {
      cli: "yundu project create",
      orpc: { method: "POST", path: "/api/projects" },
    },
  },
  {
    key: "projects.list",
    kind: "query",
    domain: "projects",
    messageName: "ListProjectsQuery",
    handlerName: "ListProjectsQueryHandler",
    serviceName: "ListProjectsQueryService",
    inputSchema: listProjectsQueryInputSchema,
    serviceToken: tokens.listProjectsQueryService,
    transports: {
      cli: "yundu project list",
      orpc: { method: "GET", path: "/api/projects" },
    },
  },
  {
    key: "servers.register",
    kind: "command",
    domain: "servers",
    messageName: "RegisterServerCommand",
    handlerName: "RegisterServerCommandHandler",
    serviceName: "RegisterServerUseCase",
    inputSchema: registerServerCommandInputSchema,
    serviceToken: tokens.registerServerUseCase,
    transports: {
      cli: "yundu server register",
      orpc: { method: "POST", path: "/api/servers" },
    },
  },
  {
    key: "servers.list",
    kind: "query",
    domain: "servers",
    messageName: "ListServersQuery",
    handlerName: "ListServersQueryHandler",
    serviceName: "ListServersQueryService",
    inputSchema: listServersQueryInputSchema,
    serviceToken: tokens.listServersQueryService,
    transports: {
      cli: "yundu server list",
      orpc: { method: "GET", path: "/api/servers" },
    },
  },
  {
    key: "environments.create",
    kind: "command",
    domain: "environments",
    messageName: "CreateEnvironmentCommand",
    handlerName: "CreateEnvironmentCommandHandler",
    serviceName: "CreateEnvironmentUseCase",
    inputSchema: createEnvironmentCommandInputSchema,
    serviceToken: tokens.createEnvironmentUseCase,
    transports: {
      cli: "yundu env create",
      orpc: { method: "POST", path: "/api/environments" },
    },
  },
  {
    key: "environments.list",
    kind: "query",
    domain: "environments",
    messageName: "ListEnvironmentsQuery",
    handlerName: "ListEnvironmentsQueryHandler",
    serviceName: "ListEnvironmentsQueryService",
    inputSchema: listEnvironmentsQueryInputSchema,
    serviceToken: tokens.listEnvironmentsQueryService,
    transports: {
      cli: "yundu env list",
      orpc: { method: "GET", path: "/api/environments" },
    },
  },
  {
    key: "environments.show",
    kind: "query",
    domain: "environments",
    messageName: "ShowEnvironmentQuery",
    handlerName: "ShowEnvironmentQueryHandler",
    serviceName: "ShowEnvironmentQueryService",
    inputSchema: showEnvironmentQueryInputSchema,
    serviceToken: tokens.showEnvironmentQueryService,
    transports: {
      cli: "yundu env show <environmentId>",
      orpc: { method: "GET", path: "/api/environments/{environmentId}" },
    },
  },
  {
    key: "environments.set-variable",
    kind: "command",
    domain: "environments",
    messageName: "SetEnvironmentVariableCommand",
    handlerName: "SetEnvironmentVariableCommandHandler",
    serviceName: "SetEnvironmentVariableUseCase",
    inputSchema: setEnvironmentVariableCommandInputSchema,
    serviceToken: tokens.setEnvironmentVariableUseCase,
    transports: {
      cli: "yundu env set <environmentId> <key> <value>",
      orpc: { method: "POST", path: "/api/environments/{environmentId}/variables" },
    },
  },
  {
    key: "environments.unset-variable",
    kind: "command",
    domain: "environments",
    messageName: "UnsetEnvironmentVariableCommand",
    handlerName: "UnsetEnvironmentVariableCommandHandler",
    serviceName: "UnsetEnvironmentVariableUseCase",
    inputSchema: unsetEnvironmentVariableCommandInputSchema,
    serviceToken: tokens.unsetEnvironmentVariableUseCase,
    transports: {
      cli: "yundu env unset <environmentId> <key>",
      orpc: { method: "DELETE", path: "/api/environments/{environmentId}/variables/{key}" },
    },
  },
  {
    key: "environments.diff",
    kind: "query",
    domain: "environments",
    messageName: "DiffEnvironmentsQuery",
    handlerName: "DiffEnvironmentsQueryHandler",
    serviceName: "DiffEnvironmentsQueryService",
    inputSchema: diffEnvironmentsQueryInputSchema,
    serviceToken: tokens.diffEnvironmentsQueryService,
    transports: {
      cli: "yundu env diff <environmentId> <otherEnvironmentId>",
      orpc: {
        method: "GET",
        path: "/api/environments/{environmentId}/diff/{otherEnvironmentId}",
      },
    },
  },
  {
    key: "environments.promote",
    kind: "command",
    domain: "environments",
    messageName: "PromoteEnvironmentCommand",
    handlerName: "PromoteEnvironmentCommandHandler",
    serviceName: "PromoteEnvironmentUseCase",
    inputSchema: promoteEnvironmentCommandInputSchema,
    serviceToken: tokens.promoteEnvironmentUseCase,
    transports: {
      cli: "yundu env promote <environmentId> <targetName>",
      orpc: { method: "POST", path: "/api/environments/{environmentId}/promote" },
    },
  },
  {
    key: "deployments.create",
    kind: "command",
    domain: "deployments",
    messageName: "CreateDeploymentCommand",
    handlerName: "CreateDeploymentCommandHandler",
    serviceName: "CreateDeploymentUseCase",
    inputSchema: createDeploymentCommandInputSchema,
    serviceToken: tokens.createDeploymentUseCase,
    transports: {
      cli: "yundu deploy <path-or-source> [--config yundu.json]",
      orpc: { method: "POST", path: "/api/deployments" },
    },
  },
  {
    key: "deployments.list",
    kind: "query",
    domain: "deployments",
    messageName: "ListDeploymentsQuery",
    handlerName: "ListDeploymentsQueryHandler",
    serviceName: "ListDeploymentsQueryService",
    inputSchema: listDeploymentsQueryInputSchema,
    serviceToken: tokens.listDeploymentsQueryService,
    transports: {
      cli: "yundu deployments list",
      orpc: { method: "GET", path: "/api/deployments" },
    },
  },
  {
    key: "deployments.logs",
    kind: "query",
    domain: "deployments",
    messageName: "DeploymentLogsQuery",
    handlerName: "DeploymentLogsQueryHandler",
    serviceName: "DeploymentLogsQueryService",
    inputSchema: deploymentLogsQueryInputSchema,
    serviceToken: tokens.logsQueryService,
    transports: {
      cli: "yundu logs <deploymentId>",
      orpc: { method: "GET", path: "/api/deployments/{deploymentId}/logs" },
    },
  },
  {
    key: "deployments.rollback",
    kind: "command",
    domain: "deployments",
    messageName: "RollbackDeploymentCommand",
    handlerName: "RollbackDeploymentCommandHandler",
    serviceName: "RollbackDeploymentUseCase",
    inputSchema: rollbackDeploymentCommandInputSchema,
    serviceToken: tokens.rollbackDeploymentUseCase,
    transports: {
      cli: "yundu rollback <deploymentId>",
      orpc: { method: "POST", path: "/api/deployments/{deploymentId}/rollback" },
    },
  },
  {
    key: "system.providers.list",
    kind: "query",
    domain: "system",
    messageName: "ListProvidersQuery",
    handlerName: "ListProvidersQueryHandler",
    serviceName: "ListProvidersQueryService",
    serviceToken: tokens.providersQueryService,
    transports: {
      cli: "yundu providers list",
      orpc: { method: "GET", path: "/api/providers" },
    },
  },
  {
    key: "system.plugins.list",
    kind: "query",
    domain: "system",
    messageName: "ListPluginsQuery",
    handlerName: "ListPluginsQueryHandler",
    serviceName: "ListPluginsQueryService",
    serviceToken: tokens.pluginsQueryService,
    transports: {
      cli: "yundu plugins list",
      orpc: { method: "GET", path: "/api/plugins" },
    },
  },
  {
    key: "system.github-repositories.list",
    kind: "query",
    domain: "system",
    messageName: "ListGitHubRepositoriesQuery",
    handlerName: "ListGitHubRepositoriesQueryHandler",
    serviceName: "ListGitHubRepositoriesQueryService",
    inputSchema: listGitHubRepositoriesQueryInputSchema,
    serviceToken: tokens.listGitHubRepositoriesQueryService,
    transports: {
      orpc: { method: "GET", path: "/api/integrations/github/repositories" },
    },
  },
  {
    key: "system.doctor",
    kind: "query",
    domain: "system",
    messageName: "DoctorQuery",
    handlerName: "DoctorQueryHandler",
    serviceName: "DoctorQueryService",
    serviceToken: tokens.doctorQueryService,
    transports: {
      cli: "yundu doctor",
    },
  },
  {
    key: "system.db-status",
    kind: "query",
    domain: "system",
    messageName: "DbStatusQuery",
    handlerName: "DbStatusQueryHandler",
    serviceName: "DbStatusQueryService",
    serviceToken: tokens.dbStatusQueryService,
    transports: {
      cli: "yundu db status",
    },
  },
  {
    key: "system.db-migrate",
    kind: "command",
    domain: "system",
    messageName: "DbMigrateCommand",
    handlerName: "DbMigrateCommandHandler",
    serviceName: "DbMigrateUseCase",
    serviceToken: tokens.dbMigrateUseCase,
    transports: {
      cli: "yundu db migrate",
    },
  },
] as const satisfies readonly OperationCatalogEntry[];

export type OperationKey = (typeof operationCatalog)[number]["key"];
