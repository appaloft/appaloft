import { type AsyncIteratorClass, type Client, type ORPCError } from "@orpc/client";
import {
  type CancelDeploymentCommandInput,
  type CheckDeploymentHealthCommandInput,
  type ConfigureServerCredentialCommandInput,
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
  type PromoteEnvironmentCommandInput,
  type ReattachDeploymentCommandInput,
  type RedeployResourceCommandInput,
  type RegisterServerCommandInput,
  type RollbackDeploymentCommandInput,
  type SetEnvironmentVariableCommandInput,
  type ShowEnvironmentQueryInput,
  type TestServerConnectivityCommandInput,
  type UnsetEnvironmentVariableCommandInput,
} from "@yundu/application/schemas";
import {
  type CancelDeploymentResponse,
  type CheckDeploymentHealthResponse,
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
  type ReattachDeploymentResponse,
  type RedeployResourceResponse,
  type RegisterServerResponse,
  type RollbackDeploymentResponse,
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
    cancel: Client<
      YunduClientContext,
      CancelDeploymentCommandInput,
      CancelDeploymentResponse,
      YunduClientError
    >;
    checkHealth: Client<
      YunduClientContext,
      CheckDeploymentHealthCommandInput,
      CheckDeploymentHealthResponse,
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
    reattach: Client<
      YunduClientContext,
      ReattachDeploymentCommandInput,
      ReattachDeploymentResponse,
      YunduClientError
    >;
    redeployResource: Client<
      YunduClientContext,
      RedeployResourceCommandInput,
      RedeployResourceResponse,
      YunduClientError
    >;
    rollback: Client<
      YunduClientContext,
      RollbackDeploymentCommandInput,
      RollbackDeploymentResponse,
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
