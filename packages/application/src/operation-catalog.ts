import { type ZodTypeAny } from "zod";
import { issueOrRenewCertificateCommandInputSchema } from "./operations/certificates/issue-or-renew-certificate.command";
import { listCertificatesQueryInputSchema } from "./operations/certificates/list-certificates.query";
import { configureDefaultAccessDomainPolicyCommandInputSchema } from "./operations/default-access-domain-policies/configure-default-access-domain-policy.command";
import { cleanupPreviewCommandInputSchema } from "./operations/deployments/cleanup-preview.command";
import { createDeploymentCommandInputSchema } from "./operations/deployments/create-deployment.command";
import { deploymentLogsQueryInputSchema } from "./operations/deployments/deployment-logs.query";
import { listDeploymentsQueryInputSchema } from "./operations/deployments/list-deployments.query";
import { confirmDomainBindingOwnershipCommandInputSchema } from "./operations/domain-bindings/confirm-domain-binding-ownership.command";
import { createDomainBindingCommandInputSchema } from "./operations/domain-bindings/create-domain-binding.command";
import { listDomainBindingsQueryInputSchema } from "./operations/domain-bindings/list-domain-bindings.query";
import { createEnvironmentCommandInputSchema } from "./operations/environments/create-environment.command";
import { diffEnvironmentsQueryInputSchema } from "./operations/environments/diff-environments.query";
import { listEnvironmentsQueryInputSchema } from "./operations/environments/list-environments.query";
import { promoteEnvironmentCommandInputSchema } from "./operations/environments/promote-environment.command";
import { setEnvironmentVariableCommandInputSchema } from "./operations/environments/set-environment-variable.command";
import { showEnvironmentQueryInputSchema } from "./operations/environments/show-environment.query";
import { unsetEnvironmentVariableCommandInputSchema } from "./operations/environments/unset-environment-variable.command";
import { createProjectCommandInputSchema } from "./operations/projects/create-project.command";
import { listProjectsQueryInputSchema } from "./operations/projects/list-projects.query";
import { archiveResourceCommandInputSchema } from "./operations/resources/archive-resource.command";
import { configureResourceHealthCommandInputSchema } from "./operations/resources/configure-resource-health.command";
import { configureResourceNetworkCommandInputSchema } from "./operations/resources/configure-resource-network.command";
import { configureResourceRuntimeCommandInputSchema } from "./operations/resources/configure-resource-runtime.command";
import { configureResourceSourceCommandInputSchema } from "./operations/resources/configure-resource-source.command";
import { createResourceCommandInputSchema } from "./operations/resources/create-resource.command";
import { deleteResourceCommandInputSchema } from "./operations/resources/delete-resource.command";
import { listResourcesQueryInputSchema } from "./operations/resources/list-resources.query";
import { resourceDiagnosticSummaryQueryInputSchema } from "./operations/resources/resource-diagnostic-summary.query";
import { resourceHealthQueryInputSchema } from "./operations/resources/resource-health.query";
import { resourceProxyConfigurationPreviewQueryInputSchema } from "./operations/resources/resource-proxy-configuration-preview.query";
import { resourceRuntimeLogsQueryInputSchema } from "./operations/resources/resource-runtime-logs.query";
import { showResourceQueryInputSchema } from "./operations/resources/show-resource.query";
import { bootstrapServerProxyCommandInputSchema } from "./operations/servers/bootstrap-server-proxy.command";
import { configureServerCredentialCommandInputSchema } from "./operations/servers/configure-server-credential.command";
import { createSshCredentialCommandInputSchema } from "./operations/servers/create-ssh-credential.command";
import { listServersQueryInputSchema } from "./operations/servers/list-servers.query";
import { listSshCredentialsQueryInputSchema } from "./operations/servers/list-ssh-credentials.query";
import { registerServerCommandInputSchema } from "./operations/servers/register-server.command";
import { testServerConnectivityCommandInputSchema } from "./operations/servers/test-server-connectivity.command";
import { relinkSourceLinkCommandInputSchema } from "./operations/source-links/relink-source-link.command";
import { listGitHubRepositoriesQueryInputSchema } from "./operations/system/list-github-repositories.query";
import { openTerminalSessionCommandInputSchema } from "./operations/terminal-sessions/open-terminal-session.command";
import { tokens } from "./tokens";

type OperationKind = "command" | "query";
type OperationDomain =
  | "projects"
  | "servers"
  | "credentials"
  | "environments"
  | "resources"
  | "deployments"
  | "default-access-domain-policies"
  | "domain-bindings"
  | "certificates"
  | "source-links"
  | "system"
  | "terminal-sessions";

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
    orpcStream?: {
      method: "GET" | "POST";
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
      cli: "appaloft project create",
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
      cli: "appaloft project list",
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
      cli: "appaloft server register",
      orpc: { method: "POST", path: "/api/servers" },
    },
  },
  {
    key: "servers.configure-credential",
    kind: "command",
    domain: "servers",
    messageName: "ConfigureServerCredentialCommand",
    handlerName: "ConfigureServerCredentialCommandHandler",
    serviceName: "ConfigureServerCredentialUseCase",
    inputSchema: configureServerCredentialCommandInputSchema,
    serviceToken: tokens.configureServerCredentialUseCase,
    transports: {
      cli: "appaloft server credential <serverId>",
      orpc: { method: "POST", path: "/api/servers/{serverId}/credentials" },
    },
  },
  {
    key: "credentials.create-ssh",
    kind: "command",
    domain: "credentials",
    messageName: "CreateSshCredentialCommand",
    handlerName: "CreateSshCredentialCommandHandler",
    serviceName: "CreateSshCredentialUseCase",
    inputSchema: createSshCredentialCommandInputSchema,
    serviceToken: tokens.createSshCredentialUseCase,
    transports: {
      cli: "appaloft server credential-create",
      orpc: { method: "POST", path: "/api/credentials/ssh" },
    },
  },
  {
    key: "credentials.list-ssh",
    kind: "query",
    domain: "credentials",
    messageName: "ListSshCredentialsQuery",
    handlerName: "ListSshCredentialsQueryHandler",
    serviceName: "ListSshCredentialsQueryService",
    inputSchema: listSshCredentialsQueryInputSchema,
    serviceToken: tokens.listSshCredentialsQueryService,
    transports: {
      cli: "appaloft server credential-list",
      orpc: { method: "GET", path: "/api/credentials/ssh" },
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
      cli: "appaloft server list",
      orpc: { method: "GET", path: "/api/servers" },
    },
  },
  {
    key: "servers.test-connectivity",
    kind: "command",
    domain: "servers",
    messageName: "TestServerConnectivityCommand",
    handlerName: "TestServerConnectivityCommandHandler",
    serviceName: "TestServerConnectivityUseCase",
    inputSchema: testServerConnectivityCommandInputSchema,
    serviceToken: tokens.testServerConnectivityUseCase,
    transports: {
      cli: "appaloft server test <serverId>; appaloft server doctor <serverId>",
      orpc: { method: "POST", path: "/api/servers/{serverId}/connectivity-tests" },
    },
  },
  {
    key: "servers.test-draft-connectivity",
    kind: "command",
    domain: "servers",
    messageName: "TestServerConnectivityCommand",
    handlerName: "TestServerConnectivityCommandHandler",
    serviceName: "TestServerConnectivityUseCase",
    inputSchema: testServerConnectivityCommandInputSchema,
    serviceToken: tokens.testServerConnectivityUseCase,
    transports: {
      orpc: { method: "POST", path: "/api/servers/connectivity-tests" },
    },
  },
  {
    key: "servers.bootstrap-proxy",
    kind: "command",
    domain: "servers",
    messageName: "BootstrapServerProxyCommand",
    handlerName: "BootstrapServerProxyCommandHandler",
    serviceName: "BootstrapServerProxyUseCase",
    inputSchema: bootstrapServerProxyCommandInputSchema,
    serviceToken: tokens.bootstrapServerProxyUseCase,
    transports: {
      cli: "appaloft server proxy repair <serverId>",
      orpc: { method: "POST", path: "/api/servers/{serverId}/edge-proxy/bootstrap" },
    },
  },
  {
    key: "resources.list",
    kind: "query",
    domain: "resources",
    messageName: "ListResourcesQuery",
    handlerName: "ListResourcesQueryHandler",
    serviceName: "ListResourcesQueryService",
    inputSchema: listResourcesQueryInputSchema,
    serviceToken: tokens.listResourcesQueryService,
    transports: {
      cli: "appaloft resource list",
      orpc: { method: "GET", path: "/api/resources" },
    },
  },
  {
    key: "resources.show",
    kind: "query",
    domain: "resources",
    messageName: "ShowResourceQuery",
    handlerName: "ShowResourceQueryHandler",
    serviceName: "ShowResourceQueryService",
    inputSchema: showResourceQueryInputSchema,
    serviceToken: tokens.showResourceQueryService,
    transports: {
      cli: "appaloft resource show <resourceId>",
      orpc: { method: "GET", path: "/api/resources/{resourceId}" },
    },
  },
  {
    key: "resources.create",
    kind: "command",
    domain: "resources",
    messageName: "CreateResourceCommand",
    handlerName: "CreateResourceCommandHandler",
    serviceName: "CreateResourceUseCase",
    inputSchema: createResourceCommandInputSchema,
    serviceToken: tokens.createResourceUseCase,
    transports: {
      cli: "appaloft resource create",
      orpc: { method: "POST", path: "/api/resources" },
    },
  },
  {
    key: "resources.archive",
    kind: "command",
    domain: "resources",
    messageName: "ArchiveResourceCommand",
    handlerName: "ArchiveResourceCommandHandler",
    serviceName: "ArchiveResourceUseCase",
    inputSchema: archiveResourceCommandInputSchema,
    serviceToken: tokens.archiveResourceUseCase,
    transports: {
      cli: "appaloft resource archive <resourceId>",
      orpc: { method: "POST", path: "/api/resources/{resourceId}/archive" },
    },
  },
  {
    key: "resources.delete",
    kind: "command",
    domain: "resources",
    messageName: "DeleteResourceCommand",
    handlerName: "DeleteResourceCommandHandler",
    serviceName: "DeleteResourceUseCase",
    inputSchema: deleteResourceCommandInputSchema,
    serviceToken: tokens.deleteResourceUseCase,
    transports: {
      cli: "appaloft resource delete <resourceId> --confirm-slug <slug>",
      orpc: { method: "DELETE", path: "/api/resources/{resourceId}" },
    },
  },
  {
    key: "resources.configure-health",
    kind: "command",
    domain: "resources",
    messageName: "ConfigureResourceHealthCommand",
    handlerName: "ConfigureResourceHealthCommandHandler",
    serviceName: "ConfigureResourceHealthUseCase",
    inputSchema: configureResourceHealthCommandInputSchema,
    serviceToken: tokens.configureResourceHealthUseCase,
    transports: {
      cli: "appaloft resource configure-health <resourceId>",
      orpc: { method: "POST", path: "/api/resources/{resourceId}/health-policy" },
    },
  },
  {
    key: "resources.configure-source",
    kind: "command",
    domain: "resources",
    messageName: "ConfigureResourceSourceCommand",
    handlerName: "ConfigureResourceSourceCommandHandler",
    serviceName: "ConfigureResourceSourceUseCase",
    inputSchema: configureResourceSourceCommandInputSchema,
    serviceToken: tokens.configureResourceSourceUseCase,
    transports: {
      cli: "appaloft resource configure-source <resourceId>",
      orpc: { method: "POST", path: "/api/resources/{resourceId}/source" },
    },
  },
  {
    key: "resources.configure-runtime",
    kind: "command",
    domain: "resources",
    messageName: "ConfigureResourceRuntimeCommand",
    handlerName: "ConfigureResourceRuntimeCommandHandler",
    serviceName: "ConfigureResourceRuntimeUseCase",
    inputSchema: configureResourceRuntimeCommandInputSchema,
    serviceToken: tokens.configureResourceRuntimeUseCase,
    transports: {
      cli: "appaloft resource configure-runtime <resourceId>",
      orpc: { method: "POST", path: "/api/resources/{resourceId}/runtime-profile" },
    },
  },
  {
    key: "resources.configure-network",
    kind: "command",
    domain: "resources",
    messageName: "ConfigureResourceNetworkCommand",
    handlerName: "ConfigureResourceNetworkCommandHandler",
    serviceName: "ConfigureResourceNetworkUseCase",
    inputSchema: configureResourceNetworkCommandInputSchema,
    serviceToken: tokens.configureResourceNetworkUseCase,
    transports: {
      cli: "appaloft resource configure-network <resourceId>",
      orpc: { method: "POST", path: "/api/resources/{resourceId}/network-profile" },
    },
  },
  {
    key: "resources.runtime-logs",
    kind: "query",
    domain: "resources",
    messageName: "ResourceRuntimeLogsQuery",
    handlerName: "ResourceRuntimeLogsQueryHandler",
    serviceName: "ResourceRuntimeLogsQueryService",
    inputSchema: resourceRuntimeLogsQueryInputSchema,
    serviceToken: tokens.resourceRuntimeLogsQueryService,
    transports: {
      cli: "appaloft resource logs <resourceId>",
      orpc: { method: "GET", path: "/api/resources/{resourceId}/runtime-logs" },
      orpcStream: { method: "GET", path: "/api/resources/{resourceId}/runtime-logs/stream" },
    },
  },
  {
    key: "terminal-sessions.open",
    kind: "command",
    domain: "terminal-sessions",
    messageName: "OpenTerminalSessionCommand",
    handlerName: "OpenTerminalSessionCommandHandler",
    serviceName: "OpenTerminalSessionUseCase",
    inputSchema: openTerminalSessionCommandInputSchema,
    serviceToken: tokens.openTerminalSessionUseCase,
    transports: {
      cli: "appaloft server terminal <serverId>; appaloft resource terminal <resourceId>",
      orpc: { method: "POST", path: "/api/terminal-sessions" },
    },
  },
  {
    key: "resources.diagnostic-summary",
    kind: "query",
    domain: "resources",
    messageName: "ResourceDiagnosticSummaryQuery",
    handlerName: "ResourceDiagnosticSummaryQueryHandler",
    serviceName: "ResourceDiagnosticSummaryQueryService",
    inputSchema: resourceDiagnosticSummaryQueryInputSchema,
    serviceToken: tokens.resourceDiagnosticSummaryQueryService,
    transports: {
      cli: "appaloft resource diagnose <resourceId>",
      orpc: { method: "GET", path: "/api/resources/{resourceId}/diagnostic-summary" },
    },
  },
  {
    key: "resources.health",
    kind: "query",
    domain: "resources",
    messageName: "ResourceHealthQuery",
    handlerName: "ResourceHealthQueryHandler",
    serviceName: "ResourceHealthQueryService",
    inputSchema: resourceHealthQueryInputSchema,
    serviceToken: tokens.resourceHealthQueryService,
    transports: {
      cli: "appaloft resource health <resourceId>",
      orpc: { method: "GET", path: "/api/resources/{resourceId}/health" },
    },
  },
  {
    key: "resources.proxy-configuration.preview",
    kind: "query",
    domain: "resources",
    messageName: "ResourceProxyConfigurationPreviewQuery",
    handlerName: "ResourceProxyConfigurationPreviewQueryHandler",
    serviceName: "ResourceProxyConfigurationPreviewQueryService",
    inputSchema: resourceProxyConfigurationPreviewQueryInputSchema,
    serviceToken: tokens.resourceProxyConfigurationPreviewQueryService,
    transports: {
      cli: "appaloft resource proxy-config <resourceId>",
      orpc: { method: "GET", path: "/api/resources/{resourceId}/proxy-configuration" },
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
      cli: "appaloft env create",
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
      cli: "appaloft env list",
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
      cli: "appaloft env show <environmentId>",
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
      cli: "appaloft env set <environmentId> <key> <value>",
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
      cli: "appaloft env unset <environmentId> <key>",
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
      cli: "appaloft env diff <environmentId> <otherEnvironmentId>",
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
      cli: "appaloft env promote <environmentId> <targetName>",
      orpc: { method: "POST", path: "/api/environments/{environmentId}/promote" },
    },
  },
  {
    key: "deployments.cleanup-preview",
    kind: "command",
    domain: "deployments",
    messageName: "CleanupPreviewCommand",
    handlerName: "CleanupPreviewCommandHandler",
    serviceName: "CleanupPreviewUseCase",
    inputSchema: cleanupPreviewCommandInputSchema,
    serviceToken: tokens.cleanupPreviewUseCase,
    transports: {
      cli: "appaloft preview cleanup [path-or-source] --preview pull-request --preview-id pr-123",
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
      cli: "appaloft deploy [path-or-source] [--config appaloft.yml] [--env KEY=VALUE] [--secret KEY=ci-env:NAME] [--preview pull-request]",
      orpc: { method: "POST", path: "/api/deployments" },
      orpcStream: { method: "POST", path: "/api/deployments/stream" },
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
      cli: "appaloft deployments list",
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
      cli: "appaloft logs <deploymentId>",
      orpc: { method: "GET", path: "/api/deployments/{deploymentId}/logs" },
    },
  },
  {
    key: "source-links.relink",
    kind: "command",
    domain: "source-links",
    messageName: "RelinkSourceLinkCommand",
    handlerName: "RelinkSourceLinkCommandHandler",
    serviceName: "RelinkSourceLinkUseCase",
    inputSchema: relinkSourceLinkCommandInputSchema,
    serviceToken: tokens.relinkSourceLinkUseCase,
    transports: {
      cli: "appaloft source-links relink",
    },
  },
  {
    key: "default-access-domain-policies.configure",
    kind: "command",
    domain: "default-access-domain-policies",
    messageName: "ConfigureDefaultAccessDomainPolicyCommand",
    handlerName: "ConfigureDefaultAccessDomainPolicyCommandHandler",
    serviceName: "ConfigureDefaultAccessDomainPolicyUseCase",
    inputSchema: configureDefaultAccessDomainPolicyCommandInputSchema,
    serviceToken: tokens.configureDefaultAccessDomainPolicyUseCase,
    transports: {
      cli: "appaloft default-access configure",
      orpc: { method: "POST", path: "/api/default-access-domain-policies" },
    },
  },
  {
    key: "domain-bindings.create",
    kind: "command",
    domain: "domain-bindings",
    messageName: "CreateDomainBindingCommand",
    handlerName: "CreateDomainBindingCommandHandler",
    serviceName: "CreateDomainBindingUseCase",
    inputSchema: createDomainBindingCommandInputSchema,
    serviceToken: tokens.createDomainBindingUseCase,
    transports: {
      cli: "appaloft domain-binding create",
      orpc: { method: "POST", path: "/api/domain-bindings" },
    },
  },
  {
    key: "domain-bindings.confirm-ownership",
    kind: "command",
    domain: "domain-bindings",
    messageName: "ConfirmDomainBindingOwnershipCommand",
    handlerName: "ConfirmDomainBindingOwnershipCommandHandler",
    serviceName: "ConfirmDomainBindingOwnershipUseCase",
    inputSchema: confirmDomainBindingOwnershipCommandInputSchema,
    serviceToken: tokens.confirmDomainBindingOwnershipUseCase,
    transports: {
      cli: "appaloft domain-binding confirm-ownership <domainBindingId> [--verification-mode dns|manual]",
      orpc: {
        method: "POST",
        path: "/api/domain-bindings/{domainBindingId}/ownership-confirmations",
      },
    },
  },
  {
    key: "domain-bindings.list",
    kind: "query",
    domain: "domain-bindings",
    messageName: "ListDomainBindingsQuery",
    handlerName: "ListDomainBindingsQueryHandler",
    serviceName: "ListDomainBindingsQueryService",
    inputSchema: listDomainBindingsQueryInputSchema,
    serviceToken: tokens.listDomainBindingsQueryService,
    transports: {
      cli: "appaloft domain-binding list",
      orpc: { method: "GET", path: "/api/domain-bindings" },
    },
  },
  {
    key: "certificates.issue-or-renew",
    kind: "command",
    domain: "certificates",
    messageName: "IssueOrRenewCertificateCommand",
    handlerName: "IssueOrRenewCertificateCommandHandler",
    serviceName: "IssueOrRenewCertificateUseCase",
    inputSchema: issueOrRenewCertificateCommandInputSchema,
    serviceToken: tokens.issueOrRenewCertificateUseCase,
    transports: {
      cli: "appaloft certificate issue-or-renew <domainBindingId>",
      orpc: { method: "POST", path: "/api/certificates/issue-or-renew" },
    },
  },
  {
    key: "certificates.list",
    kind: "query",
    domain: "certificates",
    messageName: "ListCertificatesQuery",
    handlerName: "ListCertificatesQueryHandler",
    serviceName: "ListCertificatesQueryService",
    inputSchema: listCertificatesQueryInputSchema,
    serviceToken: tokens.listCertificatesQueryService,
    transports: {
      cli: "appaloft certificate list",
      orpc: { method: "GET", path: "/api/certificates" },
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
      cli: "appaloft providers list",
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
      cli: "appaloft plugins list",
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
      cli: "appaloft doctor",
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
      cli: "appaloft db status",
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
      cli: "appaloft db migrate",
    },
  },
] as const satisfies readonly OperationCatalogEntry[];

export type OperationKey = (typeof operationCatalog)[number]["key"];

export type GenericAggregateMutationOperationViolation = {
  key: string;
  field:
    | "key"
    | "messageName"
    | "handlerName"
    | "serviceName"
    | "transports.cli"
    | "transports.orpc.path"
    | "transports.orpcStream.path";
  value: string;
};

type OperationCatalogGuardEntry = Pick<
  OperationCatalogEntry,
  "domain" | "handlerName" | "key" | "kind" | "messageName" | "serviceName" | "transports"
>;

const forbiddenGenericMutationTokens = new Set(["update", "patch", "save", "edit"]);
const forbiddenGenericMutationNamePattern = /^(Update|Patch|Save|Edit)[A-Z]/;

function includesForbiddenGenericMutationToken(value: string): boolean {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .some((token) => forbiddenGenericMutationTokens.has(token));
}

export function findGenericAggregateMutationOperations(
  entries: readonly OperationCatalogGuardEntry[] = operationCatalog,
): GenericAggregateMutationOperationViolation[] {
  const violations: GenericAggregateMutationOperationViolation[] = [];

  for (const entry of entries) {
    if (entry.kind !== "command" || entry.domain === "system") {
      continue;
    }

    if (includesForbiddenGenericMutationToken(entry.key)) {
      violations.push({ key: entry.key, field: "key", value: entry.key });
    }

    for (const [field, value] of [
      ["messageName", entry.messageName],
      ["handlerName", entry.handlerName],
      ["serviceName", entry.serviceName],
    ] as const) {
      if (forbiddenGenericMutationNamePattern.test(value)) {
        violations.push({ key: entry.key, field, value });
      }
    }

    if (entry.transports.cli && includesForbiddenGenericMutationToken(entry.transports.cli)) {
      violations.push({ key: entry.key, field: "transports.cli", value: entry.transports.cli });
    }

    if (
      entry.transports.orpc &&
      includesForbiddenGenericMutationToken(entry.transports.orpc.path)
    ) {
      violations.push({
        key: entry.key,
        field: "transports.orpc.path",
        value: entry.transports.orpc.path,
      });
    }

    if (
      entry.transports.orpcStream &&
      includesForbiddenGenericMutationToken(entry.transports.orpcStream.path)
    ) {
      violations.push({
        key: entry.key,
        field: "transports.orpcStream.path",
        value: entry.transports.orpcStream.path,
      });
    }
  }

  return violations;
}
