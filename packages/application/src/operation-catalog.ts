import { type ZodTypeAny } from "zod";
import { deleteCertificateCommandInputSchema } from "./operations/certificates/delete-certificate.command";
import { importCertificateCommandInputSchema } from "./operations/certificates/import-certificate.command";
import { issueOrRenewCertificateCommandInputSchema } from "./operations/certificates/issue-or-renew-certificate.command";
import { listCertificatesQueryInputSchema } from "./operations/certificates/list-certificates.query";
import { retryCertificateCommandInputSchema } from "./operations/certificates/retry-certificate.command";
import { revokeCertificateCommandInputSchema } from "./operations/certificates/revoke-certificate.command";
import { showCertificateQueryInputSchema } from "./operations/certificates/show-certificate.query";
import { configureDefaultAccessDomainPolicyCommandInputSchema } from "./operations/default-access-domain-policies/configure-default-access-domain-policy.command";
import { listDefaultAccessDomainPoliciesQueryInputSchema } from "./operations/default-access-domain-policies/list-default-access-domain-policies.query";
import { showDefaultAccessDomainPolicyQueryInputSchema } from "./operations/default-access-domain-policies/show-default-access-domain-policy.query";
import { cleanupPreviewCommandInputSchema } from "./operations/deployments/cleanup-preview.command";
import { createDeploymentCommandInputSchema } from "./operations/deployments/create-deployment.command";
import { deploymentLogsQueryInputSchema } from "./operations/deployments/deployment-logs.query";
import { deploymentPlanQueryInputSchema } from "./operations/deployments/deployment-plan.query";
import { deploymentRecoveryReadinessQueryInputSchema } from "./operations/deployments/deployment-recovery-readiness.query";
import { listDeploymentsQueryInputSchema } from "./operations/deployments/list-deployments.query";
import { showDeploymentQueryInputSchema } from "./operations/deployments/show-deployment.query";
import { streamDeploymentEventsQueryInputSchema } from "./operations/deployments/stream-deployment-events.query";
import { checkDomainBindingDeleteSafetyQueryInputSchema } from "./operations/domain-bindings/check-domain-binding-delete-safety.query";
import { configureDomainBindingRouteCommandInputSchema } from "./operations/domain-bindings/configure-domain-binding-route.command";
import { confirmDomainBindingOwnershipCommandInputSchema } from "./operations/domain-bindings/confirm-domain-binding-ownership.command";
import { createDomainBindingCommandInputSchema } from "./operations/domain-bindings/create-domain-binding.command";
import { deleteDomainBindingCommandInputSchema } from "./operations/domain-bindings/delete-domain-binding.command";
import { listDomainBindingsQueryInputSchema } from "./operations/domain-bindings/list-domain-bindings.query";
import { retryDomainBindingVerificationCommandInputSchema } from "./operations/domain-bindings/retry-domain-binding-verification.command";
import { showDomainBindingQueryInputSchema } from "./operations/domain-bindings/show-domain-binding.query";
import { archiveEnvironmentCommandInputSchema } from "./operations/environments/archive-environment.command";
import { cloneEnvironmentCommandInputSchema } from "./operations/environments/clone-environment.command";
import { createEnvironmentCommandInputSchema } from "./operations/environments/create-environment.command";
import { diffEnvironmentsQueryInputSchema } from "./operations/environments/diff-environments.query";
import { environmentEffectivePrecedenceQueryInputSchema } from "./operations/environments/environment-effective-precedence.query";
import { listEnvironmentsQueryInputSchema } from "./operations/environments/list-environments.query";
import { lockEnvironmentCommandInputSchema } from "./operations/environments/lock-environment.command";
import { promoteEnvironmentCommandInputSchema } from "./operations/environments/promote-environment.command";
import { renameEnvironmentCommandInputSchema } from "./operations/environments/rename-environment.command";
import { setEnvironmentVariableCommandInputSchema } from "./operations/environments/set-environment-variable.command";
import { showEnvironmentQueryInputSchema } from "./operations/environments/show-environment.query";
import { unlockEnvironmentCommandInputSchema } from "./operations/environments/unlock-environment.command";
import { unsetEnvironmentVariableCommandInputSchema } from "./operations/environments/unset-environment-variable.command";
import { listOperatorWorkQueryInputSchema } from "./operations/operator-work/list-operator-work.query";
import { showOperatorWorkQueryInputSchema } from "./operations/operator-work/show-operator-work.query";
import { archiveProjectCommandInputSchema } from "./operations/projects/archive-project.command";
import { createProjectCommandInputSchema } from "./operations/projects/create-project.command";
import { listProjectsQueryInputSchema } from "./operations/projects/list-projects.query";
import { renameProjectCommandInputSchema } from "./operations/projects/rename-project.command";
import { showProjectQueryInputSchema } from "./operations/projects/show-project.query";
import { archiveResourceCommandInputSchema } from "./operations/resources/archive-resource.command";
import { attachResourceStorageCommandInputSchema } from "./operations/resources/attach-resource-storage.command";
import { configureResourceAccessCommandInputSchema } from "./operations/resources/configure-resource-access.command";
import { configureResourceHealthCommandInputSchema } from "./operations/resources/configure-resource-health.command";
import { configureResourceNetworkCommandInputSchema } from "./operations/resources/configure-resource-network.command";
import { configureResourceRuntimeCommandInputSchema } from "./operations/resources/configure-resource-runtime.command";
import { configureResourceSourceCommandInputSchema } from "./operations/resources/configure-resource-source.command";
import { createResourceCommandInputSchema } from "./operations/resources/create-resource.command";
import { deleteResourceCommandInputSchema } from "./operations/resources/delete-resource.command";
import { detachResourceStorageCommandInputSchema } from "./operations/resources/detach-resource-storage.command";
import { importResourceVariablesCommandInputSchema } from "./operations/resources/import-resource-variables.command";
import { listResourcesQueryInputSchema } from "./operations/resources/list-resources.query";
import { resourceAccessFailureEvidenceLookupQueryInputSchema } from "./operations/resources/resource-access-failure-evidence-lookup.query";
import { resourceDiagnosticSummaryQueryInputSchema } from "./operations/resources/resource-diagnostic-summary.query";
import { resourceEffectiveConfigQueryInputSchema } from "./operations/resources/resource-effective-config.query";
import { resourceHealthQueryInputSchema } from "./operations/resources/resource-health.query";
import { resourceProxyConfigurationPreviewQueryInputSchema } from "./operations/resources/resource-proxy-configuration-preview.query";
import { resourceRuntimeLogsQueryInputSchema } from "./operations/resources/resource-runtime-logs.query";
import { setResourceVariableCommandInputSchema } from "./operations/resources/set-resource-variable.command";
import { showResourceQueryInputSchema } from "./operations/resources/show-resource.query";
import { unsetResourceVariableCommandInputSchema } from "./operations/resources/unset-resource-variable.command";
import { bootstrapServerProxyCommandInputSchema } from "./operations/servers/bootstrap-server-proxy.command";
import { checkServerDeleteSafetyQueryInputSchema } from "./operations/servers/check-server-delete-safety.query";
import { configureServerCredentialCommandInputSchema } from "./operations/servers/configure-server-credential.command";
import { configureServerEdgeProxyCommandInputSchema } from "./operations/servers/configure-server-edge-proxy.command";
import { createSshCredentialCommandInputSchema } from "./operations/servers/create-ssh-credential.command";
import { deactivateServerCommandInputSchema } from "./operations/servers/deactivate-server.command";
import { deleteServerCommandInputSchema } from "./operations/servers/delete-server.command";
import { deleteSshCredentialCommandInputSchema } from "./operations/servers/delete-ssh-credential.command";
import { inspectServerCapacityQueryInputSchema } from "./operations/servers/inspect-server-capacity.query";
import { listServersQueryInputSchema } from "./operations/servers/list-servers.query";
import { listSshCredentialsQueryInputSchema } from "./operations/servers/list-ssh-credentials.query";
import { registerServerCommandInputSchema } from "./operations/servers/register-server.command";
import { renameServerCommandInputSchema } from "./operations/servers/rename-server.command";
import { rotateSshCredentialCommandInputSchema } from "./operations/servers/rotate-ssh-credential.command";
import { showServerQueryInputSchema } from "./operations/servers/show-server.query";
import { showSshCredentialQueryInputSchema } from "./operations/servers/show-ssh-credential.query";
import { testServerConnectivityCommandInputSchema } from "./operations/servers/test-server-connectivity.command";
import { relinkSourceLinkCommandInputSchema } from "./operations/source-links/relink-source-link.command";
import { createStorageVolumeCommandInputSchema } from "./operations/storage-volumes/create-storage-volume.command";
import { deleteStorageVolumeCommandInputSchema } from "./operations/storage-volumes/delete-storage-volume.command";
import { listStorageVolumesQueryInputSchema } from "./operations/storage-volumes/list-storage-volumes.query";
import { renameStorageVolumeCommandInputSchema } from "./operations/storage-volumes/rename-storage-volume.command";
import { showStorageVolumeQueryInputSchema } from "./operations/storage-volumes/show-storage-volume.query";
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
  | "storage-volumes"
  | "deployments"
  | "operator-work"
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
    key: "projects.show",
    kind: "query",
    domain: "projects",
    messageName: "ShowProjectQuery",
    handlerName: "ShowProjectQueryHandler",
    serviceName: "ShowProjectQueryService",
    inputSchema: showProjectQueryInputSchema,
    serviceToken: tokens.showProjectQueryService,
    transports: {
      cli: "appaloft project show <projectId>",
      orpc: { method: "GET", path: "/api/projects/{projectId}" },
    },
  },
  {
    key: "projects.rename",
    kind: "command",
    domain: "projects",
    messageName: "RenameProjectCommand",
    handlerName: "RenameProjectCommandHandler",
    serviceName: "RenameProjectUseCase",
    inputSchema: renameProjectCommandInputSchema,
    serviceToken: tokens.renameProjectUseCase,
    transports: {
      cli: "appaloft project rename <projectId> --name <name>",
      orpc: { method: "POST", path: "/api/projects/{projectId}/rename" },
    },
  },
  {
    key: "projects.archive",
    kind: "command",
    domain: "projects",
    messageName: "ArchiveProjectCommand",
    handlerName: "ArchiveProjectCommandHandler",
    serviceName: "ArchiveProjectUseCase",
    inputSchema: archiveProjectCommandInputSchema,
    serviceToken: tokens.archiveProjectUseCase,
    transports: {
      cli: "appaloft project archive <projectId>",
      orpc: { method: "POST", path: "/api/projects/{projectId}/archive" },
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
    key: "credentials.show",
    kind: "query",
    domain: "credentials",
    messageName: "ShowSshCredentialQuery",
    handlerName: "ShowSshCredentialQueryHandler",
    serviceName: "ShowSshCredentialQueryService",
    inputSchema: showSshCredentialQueryInputSchema,
    serviceToken: tokens.showSshCredentialQueryService,
    transports: {
      cli: "appaloft server credential-show <credentialId>",
      orpc: { method: "GET", path: "/api/credentials/ssh/{credentialId}" },
    },
  },
  {
    key: "credentials.delete-ssh",
    kind: "command",
    domain: "credentials",
    messageName: "DeleteSshCredentialCommand",
    handlerName: "DeleteSshCredentialCommandHandler",
    serviceName: "DeleteSshCredentialUseCase",
    inputSchema: deleteSshCredentialCommandInputSchema,
    serviceToken: tokens.deleteSshCredentialUseCase,
    transports: {
      cli: "appaloft server credential-delete <credentialId> --confirm <credentialId>",
      orpc: { method: "DELETE", path: "/api/credentials/ssh/{credentialId}" },
    },
  },
  {
    key: "credentials.rotate-ssh",
    kind: "command",
    domain: "credentials",
    messageName: "RotateSshCredentialCommand",
    handlerName: "RotateSshCredentialCommandHandler",
    serviceName: "RotateSshCredentialUseCase",
    inputSchema: rotateSshCredentialCommandInputSchema,
    serviceToken: tokens.rotateSshCredentialUseCase,
    transports: {
      cli: "appaloft server credential-rotate <credentialId> --private-key-file <path> --confirm <credentialId>",
      orpc: { method: "POST", path: "/api/credentials/ssh/{credentialId}/rotate" },
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
    key: "servers.show",
    kind: "query",
    domain: "servers",
    messageName: "ShowServerQuery",
    handlerName: "ShowServerQueryHandler",
    serviceName: "ShowServerQueryService",
    inputSchema: showServerQueryInputSchema,
    serviceToken: tokens.showServerQueryService,
    transports: {
      cli: "appaloft server show <serverId>",
      orpc: { method: "GET", path: "/api/servers/{serverId}" },
    },
  },
  {
    key: "servers.capacity.inspect",
    kind: "query",
    domain: "servers",
    messageName: "InspectServerCapacityQuery",
    handlerName: "InspectServerCapacityQueryHandler",
    serviceName: "InspectServerCapacityQueryService",
    inputSchema: inspectServerCapacityQueryInputSchema,
    serviceToken: tokens.inspectServerCapacityQueryService,
    transports: {
      cli: "appaloft server capacity inspect <serverId>",
      orpc: { method: "GET", path: "/api/servers/{serverId}/capacity" },
    },
  },
  {
    key: "servers.rename",
    kind: "command",
    domain: "servers",
    messageName: "RenameServerCommand",
    handlerName: "RenameServerCommandHandler",
    serviceName: "RenameServerUseCase",
    inputSchema: renameServerCommandInputSchema,
    serviceToken: tokens.renameServerUseCase,
    transports: {
      cli: "appaloft server rename <serverId> --name <name>",
      orpc: { method: "POST", path: "/api/servers/{serverId}/rename" },
    },
  },
  {
    key: "servers.configure-edge-proxy",
    kind: "command",
    domain: "servers",
    messageName: "ConfigureServerEdgeProxyCommand",
    handlerName: "ConfigureServerEdgeProxyCommandHandler",
    serviceName: "ConfigureServerEdgeProxyUseCase",
    inputSchema: configureServerEdgeProxyCommandInputSchema,
    serviceToken: tokens.configureServerEdgeProxyUseCase,
    transports: {
      cli: "appaloft server proxy configure <serverId> --kind none|traefik|caddy",
      orpc: { method: "POST", path: "/api/servers/{serverId}/edge-proxy/configuration" },
    },
  },
  {
    key: "servers.deactivate",
    kind: "command",
    domain: "servers",
    messageName: "DeactivateServerCommand",
    handlerName: "DeactivateServerCommandHandler",
    serviceName: "DeactivateServerUseCase",
    inputSchema: deactivateServerCommandInputSchema,
    serviceToken: tokens.deactivateServerUseCase,
    transports: {
      cli: "appaloft server deactivate <serverId>",
      orpc: { method: "POST", path: "/api/servers/{serverId}/deactivate" },
    },
  },
  {
    key: "servers.delete-check",
    kind: "query",
    domain: "servers",
    messageName: "CheckServerDeleteSafetyQuery",
    handlerName: "CheckServerDeleteSafetyQueryHandler",
    serviceName: "CheckServerDeleteSafetyQueryService",
    inputSchema: checkServerDeleteSafetyQueryInputSchema,
    serviceToken: tokens.checkServerDeleteSafetyQueryService,
    transports: {
      cli: "appaloft server delete-check <serverId>",
      orpc: { method: "GET", path: "/api/servers/{serverId}/delete-check" },
    },
  },
  {
    key: "servers.delete",
    kind: "command",
    domain: "servers",
    messageName: "DeleteServerCommand",
    handlerName: "DeleteServerCommandHandler",
    serviceName: "DeleteServerUseCase",
    inputSchema: deleteServerCommandInputSchema,
    serviceToken: tokens.deleteServerUseCase,
    transports: {
      cli: "appaloft server delete <serverId> --confirm <serverId>",
      orpc: { method: "DELETE", path: "/api/servers/{serverId}" },
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
    key: "resources.configure-access",
    kind: "command",
    domain: "resources",
    messageName: "ConfigureResourceAccessCommand",
    handlerName: "ConfigureResourceAccessCommandHandler",
    serviceName: "ConfigureResourceAccessUseCase",
    inputSchema: configureResourceAccessCommandInputSchema,
    serviceToken: tokens.configureResourceAccessUseCase,
    transports: {
      cli: "appaloft resource configure-access <resourceId>",
      orpc: { method: "POST", path: "/api/resources/{resourceId}/access-profile" },
    },
  },
  {
    key: "resources.attach-storage",
    kind: "command",
    domain: "resources",
    messageName: "AttachResourceStorageCommand",
    handlerName: "AttachResourceStorageCommandHandler",
    serviceName: "AttachResourceStorageUseCase",
    inputSchema: attachResourceStorageCommandInputSchema,
    serviceToken: tokens.attachResourceStorageUseCase,
    transports: {
      cli: "appaloft resource storage attach <resourceId>",
      orpc: { method: "POST", path: "/api/resources/{resourceId}/storage-attachments" },
    },
  },
  {
    key: "resources.detach-storage",
    kind: "command",
    domain: "resources",
    messageName: "DetachResourceStorageCommand",
    handlerName: "DetachResourceStorageCommandHandler",
    serviceName: "DetachResourceStorageUseCase",
    inputSchema: detachResourceStorageCommandInputSchema,
    serviceToken: tokens.detachResourceStorageUseCase,
    transports: {
      cli: "appaloft resource storage detach <resourceId> <attachmentId>",
      orpc: {
        method: "DELETE",
        path: "/api/resources/{resourceId}/storage-attachments/{attachmentId}",
      },
    },
  },
  {
    key: "resources.set-variable",
    kind: "command",
    domain: "resources",
    messageName: "SetResourceVariableCommand",
    handlerName: "SetResourceVariableCommandHandler",
    serviceName: "SetResourceVariableUseCase",
    inputSchema: setResourceVariableCommandInputSchema,
    serviceToken: tokens.setResourceVariableUseCase,
    transports: {
      cli: "appaloft resource set-variable <resourceId> <key> <value>",
      orpc: { method: "POST", path: "/api/resources/{resourceId}/variables" },
    },
  },
  {
    key: "resources.import-variables",
    kind: "command",
    domain: "resources",
    messageName: "ImportResourceVariablesCommand",
    handlerName: "ImportResourceVariablesCommandHandler",
    serviceName: "ImportResourceVariablesUseCase",
    inputSchema: importResourceVariablesCommandInputSchema,
    serviceToken: tokens.importResourceVariablesUseCase,
    transports: {
      cli: "appaloft resource import-variables <resourceId> --content <dotenv>",
      orpc: { method: "POST", path: "/api/resources/{resourceId}/variables/import" },
    },
  },
  {
    key: "resources.unset-variable",
    kind: "command",
    domain: "resources",
    messageName: "UnsetResourceVariableCommand",
    handlerName: "UnsetResourceVariableCommandHandler",
    serviceName: "UnsetResourceVariableUseCase",
    inputSchema: unsetResourceVariableCommandInputSchema,
    serviceToken: tokens.unsetResourceVariableUseCase,
    transports: {
      cli: "appaloft resource unset-variable <resourceId> <key>",
      orpc: { method: "DELETE", path: "/api/resources/{resourceId}/variables/{key}" },
    },
  },
  {
    key: "resources.effective-config",
    kind: "query",
    domain: "resources",
    messageName: "ResourceEffectiveConfigQuery",
    handlerName: "ResourceEffectiveConfigQueryHandler",
    serviceName: "ResourceEffectiveConfigQueryService",
    inputSchema: resourceEffectiveConfigQueryInputSchema,
    serviceToken: tokens.resourceEffectiveConfigQueryService,
    transports: {
      cli: "appaloft resource effective-config <resourceId>",
      orpc: { method: "GET", path: "/api/resources/{resourceId}/effective-config" },
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
    key: "resources.access-failure-evidence.lookup",
    kind: "query",
    domain: "resources",
    messageName: "ResourceAccessFailureEvidenceLookupQuery",
    handlerName: "ResourceAccessFailureEvidenceLookupQueryHandler",
    serviceName: "ResourceAccessFailureEvidenceLookupQueryService",
    inputSchema: resourceAccessFailureEvidenceLookupQueryInputSchema,
    serviceToken: tokens.resourceAccessFailureEvidenceLookupQueryService,
    transports: {
      cli: "appaloft resource access-failure <requestId>",
      orpc: { method: "GET", path: "/api/resource-access-failures/{requestId}" },
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
    key: "storage-volumes.create",
    kind: "command",
    domain: "storage-volumes",
    messageName: "CreateStorageVolumeCommand",
    handlerName: "CreateStorageVolumeCommandHandler",
    serviceName: "CreateStorageVolumeUseCase",
    inputSchema: createStorageVolumeCommandInputSchema,
    serviceToken: tokens.createStorageVolumeUseCase,
    transports: {
      cli: "appaloft storage volume create",
      orpc: { method: "POST", path: "/api/storage-volumes" },
    },
  },
  {
    key: "storage-volumes.list",
    kind: "query",
    domain: "storage-volumes",
    messageName: "ListStorageVolumesQuery",
    handlerName: "ListStorageVolumesQueryHandler",
    serviceName: "ListStorageVolumesQueryService",
    inputSchema: listStorageVolumesQueryInputSchema,
    serviceToken: tokens.listStorageVolumesQueryService,
    transports: {
      cli: "appaloft storage volume list",
      orpc: { method: "GET", path: "/api/storage-volumes" },
    },
  },
  {
    key: "storage-volumes.show",
    kind: "query",
    domain: "storage-volumes",
    messageName: "ShowStorageVolumeQuery",
    handlerName: "ShowStorageVolumeQueryHandler",
    serviceName: "ShowStorageVolumeQueryService",
    inputSchema: showStorageVolumeQueryInputSchema,
    serviceToken: tokens.showStorageVolumeQueryService,
    transports: {
      cli: "appaloft storage volume show <storageVolumeId>",
      orpc: { method: "GET", path: "/api/storage-volumes/{storageVolumeId}" },
    },
  },
  {
    key: "storage-volumes.rename",
    kind: "command",
    domain: "storage-volumes",
    messageName: "RenameStorageVolumeCommand",
    handlerName: "RenameStorageVolumeCommandHandler",
    serviceName: "RenameStorageVolumeUseCase",
    inputSchema: renameStorageVolumeCommandInputSchema,
    serviceToken: tokens.renameStorageVolumeUseCase,
    transports: {
      cli: "appaloft storage volume rename <storageVolumeId>",
      orpc: { method: "POST", path: "/api/storage-volumes/{storageVolumeId}/rename" },
    },
  },
  {
    key: "storage-volumes.delete",
    kind: "command",
    domain: "storage-volumes",
    messageName: "DeleteStorageVolumeCommand",
    handlerName: "DeleteStorageVolumeCommandHandler",
    serviceName: "DeleteStorageVolumeUseCase",
    inputSchema: deleteStorageVolumeCommandInputSchema,
    serviceToken: tokens.deleteStorageVolumeUseCase,
    transports: {
      cli: "appaloft storage volume delete <storageVolumeId>",
      orpc: { method: "DELETE", path: "/api/storage-volumes/{storageVolumeId}" },
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
    key: "environments.rename",
    kind: "command",
    domain: "environments",
    messageName: "RenameEnvironmentCommand",
    handlerName: "RenameEnvironmentCommandHandler",
    serviceName: "RenameEnvironmentUseCase",
    inputSchema: renameEnvironmentCommandInputSchema,
    serviceToken: tokens.renameEnvironmentUseCase,
    transports: {
      cli: "appaloft env rename <environmentId> --name <name>",
      orpc: { method: "POST", path: "/api/environments/{environmentId}/rename" },
    },
  },
  {
    key: "environments.lock",
    kind: "command",
    domain: "environments",
    messageName: "LockEnvironmentCommand",
    handlerName: "LockEnvironmentCommandHandler",
    serviceName: "LockEnvironmentUseCase",
    inputSchema: lockEnvironmentCommandInputSchema,
    serviceToken: tokens.lockEnvironmentUseCase,
    transports: {
      cli: "appaloft env lock <environmentId>",
      orpc: { method: "POST", path: "/api/environments/{environmentId}/lock" },
    },
  },
  {
    key: "environments.unlock",
    kind: "command",
    domain: "environments",
    messageName: "UnlockEnvironmentCommand",
    handlerName: "UnlockEnvironmentCommandHandler",
    serviceName: "UnlockEnvironmentUseCase",
    inputSchema: unlockEnvironmentCommandInputSchema,
    serviceToken: tokens.unlockEnvironmentUseCase,
    transports: {
      cli: "appaloft env unlock <environmentId>",
      orpc: { method: "POST", path: "/api/environments/{environmentId}/unlock" },
    },
  },
  {
    key: "environments.archive",
    kind: "command",
    domain: "environments",
    messageName: "ArchiveEnvironmentCommand",
    handlerName: "ArchiveEnvironmentCommandHandler",
    serviceName: "ArchiveEnvironmentUseCase",
    inputSchema: archiveEnvironmentCommandInputSchema,
    serviceToken: tokens.archiveEnvironmentUseCase,
    transports: {
      cli: "appaloft env archive <environmentId>",
      orpc: { method: "POST", path: "/api/environments/{environmentId}/archive" },
    },
  },
  {
    key: "environments.clone",
    kind: "command",
    domain: "environments",
    messageName: "CloneEnvironmentCommand",
    handlerName: "CloneEnvironmentCommandHandler",
    serviceName: "CloneEnvironmentUseCase",
    inputSchema: cloneEnvironmentCommandInputSchema,
    serviceToken: tokens.cloneEnvironmentUseCase,
    transports: {
      cli: "appaloft env clone <environmentId> --name <targetName>",
      orpc: { method: "POST", path: "/api/environments/{environmentId}/clone" },
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
    key: "environments.effective-precedence",
    kind: "query",
    domain: "environments",
    messageName: "EnvironmentEffectivePrecedenceQuery",
    handlerName: "EnvironmentEffectivePrecedenceQueryHandler",
    serviceName: "EnvironmentEffectivePrecedenceQueryService",
    inputSchema: environmentEffectivePrecedenceQueryInputSchema,
    serviceToken: tokens.environmentEffectivePrecedenceQueryService,
    transports: {
      cli: "appaloft env effective-precedence <environmentId>",
      orpc: { method: "GET", path: "/api/environments/{environmentId}/effective-precedence" },
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
    key: "deployments.show",
    kind: "query",
    domain: "deployments",
    messageName: "ShowDeploymentQuery",
    handlerName: "ShowDeploymentQueryHandler",
    serviceName: "ShowDeploymentQueryService",
    inputSchema: showDeploymentQueryInputSchema,
    serviceToken: tokens.showDeploymentQueryService,
    transports: {
      cli: "appaloft deployments show <deploymentId>",
      orpc: { method: "GET", path: "/api/deployments/{deploymentId}" },
    },
  },
  {
    key: "deployments.plan",
    kind: "query",
    domain: "deployments",
    messageName: "DeploymentPlanQuery",
    handlerName: "DeploymentPlanQueryHandler",
    serviceName: "DeploymentPlanQueryService",
    inputSchema: deploymentPlanQueryInputSchema,
    serviceToken: tokens.deploymentPlanQueryService,
    transports: {
      cli: "appaloft deployments plan --project <projectId> --environment <environmentId> --resource <resourceId> --server <serverId> [--destination <destinationId>]",
      orpc: { method: "GET", path: "/api/deployments/plan" },
    },
  },
  {
    key: "deployments.recovery-readiness",
    kind: "query",
    domain: "deployments",
    messageName: "DeploymentRecoveryReadinessQuery",
    handlerName: "DeploymentRecoveryReadinessQueryHandler",
    serviceName: "DeploymentRecoveryReadinessQueryService",
    inputSchema: deploymentRecoveryReadinessQueryInputSchema,
    serviceToken: tokens.deploymentRecoveryReadinessQueryService,
    transports: {
      cli: "appaloft deployments recovery-readiness <deploymentId>",
      orpc: { method: "GET", path: "/api/deployments/{deploymentId}/recovery-readiness" },
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
    key: "deployments.stream-events",
    kind: "query",
    domain: "deployments",
    messageName: "StreamDeploymentEventsQuery",
    handlerName: "StreamDeploymentEventsQueryHandler",
    serviceName: "StreamDeploymentEventsQueryService",
    inputSchema: streamDeploymentEventsQueryInputSchema,
    serviceToken: tokens.streamDeploymentEventsQueryService,
    transports: {
      cli: "appaloft deployments events <deploymentId>",
      orpc: { method: "GET", path: "/api/deployments/{deploymentId}/events" },
      orpcStream: { method: "GET", path: "/api/deployments/{deploymentId}/events/stream" },
    },
  },
  {
    key: "operator-work.list",
    kind: "query",
    domain: "operator-work",
    messageName: "ListOperatorWorkQuery",
    handlerName: "ListOperatorWorkQueryHandler",
    serviceName: "OperatorWorkQueryService",
    inputSchema: listOperatorWorkQueryInputSchema,
    serviceToken: tokens.operatorWorkQueryService,
    transports: {
      cli: "appaloft work list",
      orpc: { method: "GET", path: "/api/operator-work" },
    },
  },
  {
    key: "operator-work.show",
    kind: "query",
    domain: "operator-work",
    messageName: "ShowOperatorWorkQuery",
    handlerName: "ShowOperatorWorkQueryHandler",
    serviceName: "OperatorWorkQueryService",
    inputSchema: showOperatorWorkQueryInputSchema,
    serviceToken: tokens.operatorWorkQueryService,
    transports: {
      cli: "appaloft work show <workId>",
      orpc: { method: "GET", path: "/api/operator-work/{workId}" },
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
    key: "default-access-domain-policies.list",
    kind: "query",
    domain: "default-access-domain-policies",
    messageName: "ListDefaultAccessDomainPoliciesQuery",
    handlerName: "ListDefaultAccessDomainPoliciesQueryHandler",
    serviceName: "ListDefaultAccessDomainPoliciesQueryService",
    inputSchema: listDefaultAccessDomainPoliciesQueryInputSchema,
    serviceToken: tokens.listDefaultAccessDomainPoliciesQueryService,
    transports: {
      cli: "appaloft default-access list",
      orpc: { method: "GET", path: "/api/default-access-domain-policies" },
    },
  },
  {
    key: "default-access-domain-policies.show",
    kind: "query",
    domain: "default-access-domain-policies",
    messageName: "ShowDefaultAccessDomainPolicyQuery",
    handlerName: "ShowDefaultAccessDomainPolicyQueryHandler",
    serviceName: "ShowDefaultAccessDomainPolicyQueryService",
    inputSchema: showDefaultAccessDomainPolicyQueryInputSchema,
    serviceToken: tokens.showDefaultAccessDomainPolicyQueryService,
    transports: {
      cli: "appaloft default-access show --scope system|deployment-target [--server <serverId>]",
      orpc: { method: "GET", path: "/api/default-access-domain-policies/show" },
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
    key: "domain-bindings.show",
    kind: "query",
    domain: "domain-bindings",
    messageName: "ShowDomainBindingQuery",
    handlerName: "ShowDomainBindingQueryHandler",
    serviceName: "ShowDomainBindingQueryService",
    inputSchema: showDomainBindingQueryInputSchema,
    serviceToken: tokens.showDomainBindingQueryService,
    transports: {
      cli: "appaloft domain-binding show <domainBindingId>",
      orpc: { method: "GET", path: "/api/domain-bindings/{domainBindingId}" },
    },
  },
  {
    key: "domain-bindings.configure-route",
    kind: "command",
    domain: "domain-bindings",
    messageName: "ConfigureDomainBindingRouteCommand",
    handlerName: "ConfigureDomainBindingRouteCommandHandler",
    serviceName: "ConfigureDomainBindingRouteUseCase",
    inputSchema: configureDomainBindingRouteCommandInputSchema,
    serviceToken: tokens.configureDomainBindingRouteUseCase,
    transports: {
      cli: "appaloft domain-binding configure-route <domainBindingId>",
      orpc: { method: "POST", path: "/api/domain-bindings/{domainBindingId}/route" },
    },
  },
  {
    key: "domain-bindings.delete-check",
    kind: "query",
    domain: "domain-bindings",
    messageName: "CheckDomainBindingDeleteSafetyQuery",
    handlerName: "CheckDomainBindingDeleteSafetyQueryHandler",
    serviceName: "CheckDomainBindingDeleteSafetyQueryService",
    inputSchema: checkDomainBindingDeleteSafetyQueryInputSchema,
    serviceToken: tokens.checkDomainBindingDeleteSafetyQueryService,
    transports: {
      cli: "appaloft domain-binding delete-check <domainBindingId>",
      orpc: { method: "GET", path: "/api/domain-bindings/{domainBindingId}/delete-check" },
    },
  },
  {
    key: "domain-bindings.delete",
    kind: "command",
    domain: "domain-bindings",
    messageName: "DeleteDomainBindingCommand",
    handlerName: "DeleteDomainBindingCommandHandler",
    serviceName: "DeleteDomainBindingUseCase",
    inputSchema: deleteDomainBindingCommandInputSchema,
    serviceToken: tokens.deleteDomainBindingUseCase,
    transports: {
      cli: "appaloft domain-binding delete <domainBindingId> --confirm <domainBindingId>",
      orpc: { method: "DELETE", path: "/api/domain-bindings/{domainBindingId}" },
    },
  },
  {
    key: "domain-bindings.retry-verification",
    kind: "command",
    domain: "domain-bindings",
    messageName: "RetryDomainBindingVerificationCommand",
    handlerName: "RetryDomainBindingVerificationCommandHandler",
    serviceName: "RetryDomainBindingVerificationUseCase",
    inputSchema: retryDomainBindingVerificationCommandInputSchema,
    serviceToken: tokens.retryDomainBindingVerificationUseCase,
    transports: {
      cli: "appaloft domain-binding retry-verification <domainBindingId>",
      orpc: { method: "POST", path: "/api/domain-bindings/{domainBindingId}/verification-retries" },
    },
  },
  {
    key: "certificates.import",
    kind: "command",
    domain: "certificates",
    messageName: "ImportCertificateCommand",
    handlerName: "ImportCertificateCommandHandler",
    serviceName: "ImportCertificateUseCase",
    inputSchema: importCertificateCommandInputSchema,
    serviceToken: tokens.importCertificateUseCase,
    transports: {
      cli: "appaloft certificate import <domainBindingId>",
      orpc: { method: "POST", path: "/api/certificates/import" },
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
    key: "certificates.show",
    kind: "query",
    domain: "certificates",
    messageName: "ShowCertificateQuery",
    handlerName: "ShowCertificateQueryHandler",
    serviceName: "ShowCertificateQueryService",
    inputSchema: showCertificateQueryInputSchema,
    serviceToken: tokens.showCertificateQueryService,
    transports: {
      cli: "appaloft certificate show <certificateId>",
      orpc: { method: "GET", path: "/api/certificates/{certificateId}" },
    },
  },
  {
    key: "certificates.retry",
    kind: "command",
    domain: "certificates",
    messageName: "RetryCertificateCommand",
    handlerName: "RetryCertificateCommandHandler",
    serviceName: "RetryCertificateUseCase",
    inputSchema: retryCertificateCommandInputSchema,
    serviceToken: tokens.retryCertificateUseCase,
    transports: {
      cli: "appaloft certificate retry <certificateId>",
      orpc: { method: "POST", path: "/api/certificates/{certificateId}/retries" },
    },
  },
  {
    key: "certificates.revoke",
    kind: "command",
    domain: "certificates",
    messageName: "RevokeCertificateCommand",
    handlerName: "RevokeCertificateCommandHandler",
    serviceName: "RevokeCertificateUseCase",
    inputSchema: revokeCertificateCommandInputSchema,
    serviceToken: tokens.revokeCertificateUseCase,
    transports: {
      cli: "appaloft certificate revoke <certificateId>",
      orpc: { method: "POST", path: "/api/certificates/{certificateId}/revoke" },
    },
  },
  {
    key: "certificates.delete",
    kind: "command",
    domain: "certificates",
    messageName: "DeleteCertificateCommand",
    handlerName: "DeleteCertificateCommandHandler",
    serviceName: "DeleteCertificateUseCase",
    inputSchema: deleteCertificateCommandInputSchema,
    serviceToken: tokens.deleteCertificateUseCase,
    transports: {
      cli: "appaloft certificate delete <certificateId> --confirm <certificateId>",
      orpc: { method: "DELETE", path: "/api/certificates/{certificateId}" },
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
