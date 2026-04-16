import { type AsyncIteratorClass, type Client, type ORPCError } from "@orpc/client";
import {
  type BootstrapServerProxyCommandInput,
  type ConfigureServerCredentialCommandInput,
  type ConfirmDomainBindingOwnershipCommandInput,
  type CreateDeploymentCommandInput,
  type CreateDomainBindingCommandInput,
  type CreateEnvironmentCommandInput,
  type CreateProjectCommandInput,
  type CreateResourceCommandInput,
  type CreateSshCredentialCommandInput,
  type DeploymentLogsQueryInput,
  type DiffEnvironmentsQueryInput,
  type ListDeploymentsQueryInput,
  type ListDomainBindingsQueryInput,
  type ListEnvironmentsQueryInput,
  type ListGitHubRepositoriesQueryInput,
  type ListResourcesQueryInput,
  type ListSshCredentialsQueryInput,
  type OpenTerminalSessionCommandInput,
  type PromoteEnvironmentCommandInput,
  type RegisterServerCommandInput,
  type ResourceDiagnosticSummaryQueryInput,
  type ResourceHealthQueryInput,
  type ResourceProxyConfigurationPreviewQueryInput,
  type ResourceRuntimeLogsQueryInput,
  type SetEnvironmentVariableCommandInput,
  type ShowEnvironmentQueryInput,
  type TestServerConnectivityCommandInput,
  type UnsetEnvironmentVariableCommandInput,
} from "@yundu/application/schemas";
import {
  type BootstrapServerProxyResponse,
  type ConfirmDomainBindingOwnershipResponse,
  type CreateDeploymentResponse,
  type CreateDomainBindingResponse,
  type CreateEnvironmentResponse,
  type CreateProjectResponse,
  type CreateResourceResponse,
  type CreateSshCredentialResponse,
  type DeploymentLogsResponse,
  type DeploymentProgressEvent,
  type DiffEnvironmentResponse,
  type EnvironmentSummary,
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
  type ResourceDiagnosticSummary,
  type ResourceHealthSummary,
  type ResourceRuntimeLogEvent,
  type ResourceRuntimeLogsResponse,
  type ResourceRuntimeLogsStreamResponse,
  type TerminalSessionDescriptor,
  type TestServerConnectivityResponse,
} from "@yundu/contracts";

type YunduClientContext = Record<never, never>;
type YunduClientError = ORPCError<string, unknown>;

export type YunduOrpcClientContract = {
  projects: {
    list: Client<YunduClientContext, undefined, ListProjectsResponse, YunduClientError>;
    create: Client<
      YunduClientContext,
      CreateProjectCommandInput,
      CreateProjectResponse,
      YunduClientError
    >;
  };
  servers: {
    list: Client<YunduClientContext, undefined, ListServersResponse, YunduClientError>;
    create: Client<
      YunduClientContext,
      RegisterServerCommandInput,
      RegisterServerResponse,
      YunduClientError
    >;
    configureCredential: Client<
      YunduClientContext,
      ConfigureServerCredentialCommandInput,
      null,
      YunduClientError
    >;
    testConnectivity: Client<
      YunduClientContext,
      TestServerConnectivityCommandInput,
      TestServerConnectivityResponse,
      YunduClientError
    >;
    testDraftConnectivity: Client<
      YunduClientContext,
      TestServerConnectivityCommandInput,
      TestServerConnectivityResponse,
      YunduClientError
    >;
    bootstrapProxy: Client<
      YunduClientContext,
      BootstrapServerProxyCommandInput,
      BootstrapServerProxyResponse,
      YunduClientError
    >;
  };
  credentials: {
    ssh: {
      list: Client<
        YunduClientContext,
        ListSshCredentialsQueryInput,
        ListSshCredentialsResponse,
        YunduClientError
      >;
      create: Client<
        YunduClientContext,
        CreateSshCredentialCommandInput,
        CreateSshCredentialResponse,
        YunduClientError
      >;
    };
  };
  environments: {
    list: Client<
      YunduClientContext,
      ListEnvironmentsQueryInput,
      ListEnvironmentsResponse,
      YunduClientError
    >;
    create: Client<
      YunduClientContext,
      CreateEnvironmentCommandInput,
      CreateEnvironmentResponse,
      YunduClientError
    >;
    show: Client<
      YunduClientContext,
      ShowEnvironmentQueryInput,
      EnvironmentSummary,
      YunduClientError
    >;
    setVariable: Client<
      YunduClientContext,
      SetEnvironmentVariableCommandInput,
      null,
      YunduClientError
    >;
    unsetVariable: Client<
      YunduClientContext,
      UnsetEnvironmentVariableCommandInput,
      null,
      YunduClientError
    >;
    promote: Client<
      YunduClientContext,
      PromoteEnvironmentCommandInput,
      PromoteEnvironmentResponse,
      YunduClientError
    >;
    diff: Client<
      YunduClientContext,
      DiffEnvironmentsQueryInput,
      DiffEnvironmentResponse,
      YunduClientError
    >;
  };
  resources: {
    list: Client<
      YunduClientContext,
      ListResourcesQueryInput,
      ListResourcesResponse,
      YunduClientError
    >;
    create: Client<
      YunduClientContext,
      CreateResourceCommandInput,
      CreateResourceResponse,
      YunduClientError
    >;
    diagnosticSummary: Client<
      YunduClientContext,
      ResourceDiagnosticSummaryQueryInput,
      ResourceDiagnosticSummary,
      YunduClientError
    >;
    health: Client<
      YunduClientContext,
      ResourceHealthQueryInput,
      ResourceHealthSummary,
      YunduClientError
    >;
    proxyConfiguration: Client<
      YunduClientContext,
      ResourceProxyConfigurationPreviewQueryInput,
      ProxyConfigurationView,
      YunduClientError
    >;
    logs: Client<
      YunduClientContext,
      ResourceRuntimeLogsQueryInput,
      ResourceRuntimeLogsResponse,
      YunduClientError
    >;
    logsStream: Client<
      YunduClientContext,
      ResourceRuntimeLogsQueryInput,
      AsyncIteratorClass<ResourceRuntimeLogEvent, ResourceRuntimeLogsStreamResponse, void>,
      YunduClientError
    >;
  };
  terminalSessions: {
    open: Client<
      YunduClientContext,
      OpenTerminalSessionCommandInput,
      TerminalSessionDescriptor,
      YunduClientError
    >;
  };
  domainBindings: {
    list: Client<
      YunduClientContext,
      ListDomainBindingsQueryInput,
      ListDomainBindingsResponse,
      YunduClientError
    >;
    create: Client<
      YunduClientContext,
      CreateDomainBindingCommandInput,
      CreateDomainBindingResponse,
      YunduClientError
    >;
    confirmOwnership: Client<
      YunduClientContext,
      ConfirmDomainBindingOwnershipCommandInput,
      ConfirmDomainBindingOwnershipResponse,
      YunduClientError
    >;
  };
  deployments: {
    list: Client<
      YunduClientContext,
      ListDeploymentsQueryInput,
      ListDeploymentsResponse,
      YunduClientError
    >;
    create: Client<
      YunduClientContext,
      CreateDeploymentCommandInput,
      CreateDeploymentResponse,
      YunduClientError
    >;
    createStream: Client<
      YunduClientContext,
      CreateDeploymentCommandInput,
      AsyncIteratorClass<DeploymentProgressEvent, CreateDeploymentResponse, void>,
      YunduClientError
    >;
    logs: Client<
      YunduClientContext,
      DeploymentLogsQueryInput,
      DeploymentLogsResponse,
      YunduClientError
    >;
  };
  providers: {
    list: Client<YunduClientContext, undefined, ListProvidersResponse, YunduClientError>;
  };
  plugins: {
    list: Client<YunduClientContext, undefined, ListPluginsResponse, YunduClientError>;
  };
  integrations: {
    github: {
      repositories: {
        list: Client<
          YunduClientContext,
          ListGitHubRepositoriesQueryInput,
          ListGitHubRepositoriesResponse,
          YunduClientError
        >;
      };
    };
  };
};
