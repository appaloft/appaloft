import {
  type ArchiveProjectCommandInput,
  type ArchiveResourceCommandInput,
  type BootstrapServerProxyCommandInput,
  type ConfigureDefaultAccessDomainPolicyCommandInput,
  type ConfigureResourceHealthCommandInput,
  type ConfigureResourceNetworkCommandInput,
  type ConfigureResourceRuntimeCommandInput,
  type ConfigureResourceSourceCommandInput,
  type ConfigureServerCredentialCommandInput,
  type ConfirmDomainBindingOwnershipCommandInput,
  type CreateDeploymentCommandInput,
  type CreateDomainBindingCommandInput,
  type CreateEnvironmentCommandInput,
  type CreateProjectCommandInput,
  type CreateResourceCommandInput,
  type CreateSshCredentialCommandInput,
  type DeleteResourceCommandInput,
  type DeploymentLogsQueryInput,
  type DiffEnvironmentsQueryInput,
  type ImportCertificateCommandInput,
  type IssueOrRenewCertificateCommandInput,
  type ListCertificatesQueryInput,
  type ListDeploymentsQueryInput,
  type ListDomainBindingsQueryInput,
  type ListEnvironmentsQueryInput,
  type ListGitHubRepositoriesQueryInput,
  type ListResourcesQueryInput,
  type ListSshCredentialsQueryInput,
  type OpenTerminalSessionCommandInput,
  type PromoteEnvironmentCommandInput,
  type RegisterServerCommandInput,
  type RenameProjectCommandInput,
  type ResourceDiagnosticSummaryQueryInput,
  type ResourceEffectiveConfigQueryInput,
  type ResourceHealthQueryInput,
  type ResourceProxyConfigurationPreviewQueryInput,
  type ResourceRuntimeLogsQueryInput,
  type SetEnvironmentVariableCommandInput,
  type SetResourceVariableCommandInput,
  type ShowDeploymentQueryInput,
  type ShowEnvironmentQueryInput,
  type ShowProjectQueryInput,
  type ShowResourceQueryInput,
  type StreamDeploymentEventsQueryInput,
  type TestServerConnectivityCommandInput,
  type UnsetEnvironmentVariableCommandInput,
  type UnsetResourceVariableCommandInput,
} from "@appaloft/application/schemas";
import {
  type ArchiveProjectResponse,
  type ArchiveResourceResponse,
  type BootstrapServerProxyResponse,
  type ConfigureDefaultAccessDomainPolicyResponse,
  type ConfigureResourceHealthResponse,
  type ConfigureResourceNetworkResponse,
  type ConfigureResourceRuntimeResponse,
  type ConfigureResourceSourceResponse,
  type ConfirmDomainBindingOwnershipResponse,
  type CreateDeploymentResponse,
  type CreateDomainBindingResponse,
  type CreateEnvironmentResponse,
  type CreateProjectResponse,
  type CreateResourceResponse,
  type CreateSshCredentialResponse,
  type DeleteResourceResponse,
  type DeploymentEventStreamEnvelope,
  type DeploymentEventStreamResponse,
  type DeploymentEventStreamStreamResponse,
  type DeploymentLogsResponse,
  type DeploymentProgressEvent,
  type DiffEnvironmentResponse,
  type EnvironmentSummary,
  type ImportCertificateResponse,
  type IssueOrRenewCertificateResponse,
  type ListCertificatesResponse,
  type ListDeploymentsResponse,
  type ListDomainBindingsResponse,
  type ListEnvironmentsResponse,
  type ListGitHubRepositoriesResponse,
  type ListPluginsResponse,
  type ListProjectsResponse,
  type ListProvidersResponse,
  type ListResourcesResponse,
  type ListServersResponse,
  type ListSshCredentialsResponse,
  type PromoteEnvironmentResponse,
  type ProxyConfigurationView,
  type RegisterServerResponse,
  type RenameProjectResponse,
  type ResourceDetail,
  type ResourceDiagnosticSummary,
  type ResourceEffectiveConfigResponse,
  type ResourceHealthSummary,
  type ResourceRuntimeLogEvent,
  type ResourceRuntimeLogsResponse,
  type ResourceRuntimeLogsStreamResponse,
  type SetResourceVariableResponse,
  type ShowDeploymentResponse,
  type ShowProjectResponse,
  type TerminalSessionDescriptor,
  type TestServerConnectivityResponse,
  type UnsetResourceVariableResponse,
} from "@appaloft/contracts";
import { type AsyncIteratorClass, type Client, type ORPCError } from "@orpc/client";

type AppaloftClientContext = Record<never, never>;
type AppaloftClientError = ORPCError<string, unknown>;

export type AppaloftOrpcClientContract = {
  projects: {
    list: Client<AppaloftClientContext, undefined, ListProjectsResponse, AppaloftClientError>;
    create: Client<
      AppaloftClientContext,
      CreateProjectCommandInput,
      CreateProjectResponse,
      AppaloftClientError
    >;
    show: Client<
      AppaloftClientContext,
      ShowProjectQueryInput,
      ShowProjectResponse,
      AppaloftClientError
    >;
    rename: Client<
      AppaloftClientContext,
      RenameProjectCommandInput,
      RenameProjectResponse,
      AppaloftClientError
    >;
    archive: Client<
      AppaloftClientContext,
      ArchiveProjectCommandInput,
      ArchiveProjectResponse,
      AppaloftClientError
    >;
  };
  servers: {
    list: Client<AppaloftClientContext, undefined, ListServersResponse, AppaloftClientError>;
    create: Client<
      AppaloftClientContext,
      RegisterServerCommandInput,
      RegisterServerResponse,
      AppaloftClientError
    >;
    configureCredential: Client<
      AppaloftClientContext,
      ConfigureServerCredentialCommandInput,
      null,
      AppaloftClientError
    >;
    testConnectivity: Client<
      AppaloftClientContext,
      TestServerConnectivityCommandInput,
      TestServerConnectivityResponse,
      AppaloftClientError
    >;
    testDraftConnectivity: Client<
      AppaloftClientContext,
      TestServerConnectivityCommandInput,
      TestServerConnectivityResponse,
      AppaloftClientError
    >;
    bootstrapProxy: Client<
      AppaloftClientContext,
      BootstrapServerProxyCommandInput,
      BootstrapServerProxyResponse,
      AppaloftClientError
    >;
  };
  defaultAccessDomainPolicies: {
    configure: Client<
      AppaloftClientContext,
      ConfigureDefaultAccessDomainPolicyCommandInput,
      ConfigureDefaultAccessDomainPolicyResponse,
      AppaloftClientError
    >;
  };
  credentials: {
    ssh: {
      list: Client<
        AppaloftClientContext,
        ListSshCredentialsQueryInput,
        ListSshCredentialsResponse,
        AppaloftClientError
      >;
      create: Client<
        AppaloftClientContext,
        CreateSshCredentialCommandInput,
        CreateSshCredentialResponse,
        AppaloftClientError
      >;
    };
  };
  environments: {
    list: Client<
      AppaloftClientContext,
      ListEnvironmentsQueryInput,
      ListEnvironmentsResponse,
      AppaloftClientError
    >;
    create: Client<
      AppaloftClientContext,
      CreateEnvironmentCommandInput,
      CreateEnvironmentResponse,
      AppaloftClientError
    >;
    show: Client<
      AppaloftClientContext,
      ShowEnvironmentQueryInput,
      EnvironmentSummary,
      AppaloftClientError
    >;
    setVariable: Client<
      AppaloftClientContext,
      SetEnvironmentVariableCommandInput,
      null,
      AppaloftClientError
    >;
    unsetVariable: Client<
      AppaloftClientContext,
      UnsetEnvironmentVariableCommandInput,
      null,
      AppaloftClientError
    >;
    promote: Client<
      AppaloftClientContext,
      PromoteEnvironmentCommandInput,
      PromoteEnvironmentResponse,
      AppaloftClientError
    >;
    diff: Client<
      AppaloftClientContext,
      DiffEnvironmentsQueryInput,
      DiffEnvironmentResponse,
      AppaloftClientError
    >;
  };
  resources: {
    list: Client<
      AppaloftClientContext,
      ListResourcesQueryInput,
      ListResourcesResponse,
      AppaloftClientError
    >;
    show: Client<
      AppaloftClientContext,
      ShowResourceQueryInput,
      ResourceDetail,
      AppaloftClientError
    >;
    create: Client<
      AppaloftClientContext,
      CreateResourceCommandInput,
      CreateResourceResponse,
      AppaloftClientError
    >;
    archive: Client<
      AppaloftClientContext,
      ArchiveResourceCommandInput,
      ArchiveResourceResponse,
      AppaloftClientError
    >;
    delete: Client<
      AppaloftClientContext,
      DeleteResourceCommandInput,
      DeleteResourceResponse,
      AppaloftClientError
    >;
    configureHealth: Client<
      AppaloftClientContext,
      ConfigureResourceHealthCommandInput,
      ConfigureResourceHealthResponse,
      AppaloftClientError
    >;
    configureNetwork: Client<
      AppaloftClientContext,
      ConfigureResourceNetworkCommandInput,
      ConfigureResourceNetworkResponse,
      AppaloftClientError
    >;
    configureRuntime: Client<
      AppaloftClientContext,
      ConfigureResourceRuntimeCommandInput,
      ConfigureResourceRuntimeResponse,
      AppaloftClientError
    >;
    configureSource: Client<
      AppaloftClientContext,
      ConfigureResourceSourceCommandInput,
      ConfigureResourceSourceResponse,
      AppaloftClientError
    >;
    setVariable: Client<
      AppaloftClientContext,
      SetResourceVariableCommandInput,
      SetResourceVariableResponse,
      AppaloftClientError
    >;
    unsetVariable: Client<
      AppaloftClientContext,
      UnsetResourceVariableCommandInput,
      UnsetResourceVariableResponse,
      AppaloftClientError
    >;
    effectiveConfig: Client<
      AppaloftClientContext,
      ResourceEffectiveConfigQueryInput,
      ResourceEffectiveConfigResponse,
      AppaloftClientError
    >;
    diagnosticSummary: Client<
      AppaloftClientContext,
      ResourceDiagnosticSummaryQueryInput,
      ResourceDiagnosticSummary,
      AppaloftClientError
    >;
    health: Client<
      AppaloftClientContext,
      ResourceHealthQueryInput,
      ResourceHealthSummary,
      AppaloftClientError
    >;
    proxyConfiguration: Client<
      AppaloftClientContext,
      ResourceProxyConfigurationPreviewQueryInput,
      ProxyConfigurationView,
      AppaloftClientError
    >;
    logs: Client<
      AppaloftClientContext,
      ResourceRuntimeLogsQueryInput,
      ResourceRuntimeLogsResponse,
      AppaloftClientError
    >;
    logsStream: Client<
      AppaloftClientContext,
      ResourceRuntimeLogsQueryInput,
      AsyncIteratorClass<ResourceRuntimeLogEvent, ResourceRuntimeLogsStreamResponse, void>,
      AppaloftClientError
    >;
  };
  terminalSessions: {
    open: Client<
      AppaloftClientContext,
      OpenTerminalSessionCommandInput,
      TerminalSessionDescriptor,
      AppaloftClientError
    >;
  };
  domainBindings: {
    list: Client<
      AppaloftClientContext,
      ListDomainBindingsQueryInput,
      ListDomainBindingsResponse,
      AppaloftClientError
    >;
    create: Client<
      AppaloftClientContext,
      CreateDomainBindingCommandInput,
      CreateDomainBindingResponse,
      AppaloftClientError
    >;
    confirmOwnership: Client<
      AppaloftClientContext,
      ConfirmDomainBindingOwnershipCommandInput,
      ConfirmDomainBindingOwnershipResponse,
      AppaloftClientError
    >;
  };
  certificates: {
    list: Client<
      AppaloftClientContext,
      ListCertificatesQueryInput,
      ListCertificatesResponse,
      AppaloftClientError
    >;
    import: Client<
      AppaloftClientContext,
      ImportCertificateCommandInput,
      ImportCertificateResponse,
      AppaloftClientError
    >;
    issueOrRenew: Client<
      AppaloftClientContext,
      IssueOrRenewCertificateCommandInput,
      IssueOrRenewCertificateResponse,
      AppaloftClientError
    >;
  };
  deployments: {
    list: Client<
      AppaloftClientContext,
      ListDeploymentsQueryInput,
      ListDeploymentsResponse,
      AppaloftClientError
    >;
    show: Client<
      AppaloftClientContext,
      ShowDeploymentQueryInput,
      ShowDeploymentResponse,
      AppaloftClientError
    >;
    create: Client<
      AppaloftClientContext,
      CreateDeploymentCommandInput,
      CreateDeploymentResponse,
      AppaloftClientError
    >;
    createStream: Client<
      AppaloftClientContext,
      CreateDeploymentCommandInput,
      AsyncIteratorClass<DeploymentProgressEvent, CreateDeploymentResponse, void>,
      AppaloftClientError
    >;
    logs: Client<
      AppaloftClientContext,
      DeploymentLogsQueryInput,
      DeploymentLogsResponse,
      AppaloftClientError
    >;
    events: Client<
      AppaloftClientContext,
      StreamDeploymentEventsQueryInput,
      DeploymentEventStreamResponse,
      AppaloftClientError
    >;
    eventsStream: Client<
      AppaloftClientContext,
      StreamDeploymentEventsQueryInput,
      AsyncIteratorClass<DeploymentEventStreamEnvelope, DeploymentEventStreamStreamResponse, void>,
      AppaloftClientError
    >;
  };
  providers: {
    list: Client<AppaloftClientContext, undefined, ListProvidersResponse, AppaloftClientError>;
  };
  plugins: {
    list: Client<AppaloftClientContext, undefined, ListPluginsResponse, AppaloftClientError>;
  };
  integrations: {
    github: {
      repositories: {
        list: Client<
          AppaloftClientContext,
          ListGitHubRepositoriesQueryInput,
          ListGitHubRepositoriesResponse,
          AppaloftClientError
        >;
      };
    };
  };
};
