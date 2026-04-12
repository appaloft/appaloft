import { type Client, type ORPCError } from "@orpc/client";
import {
  type CreateDeploymentCommandInput,
  type CreateEnvironmentCommandInput,
  type CreateProjectCommandInput,
  type DeploymentLogsQueryInput,
  type DiffEnvironmentsQueryInput,
  type ListDeploymentsQueryInput,
  type ListEnvironmentsQueryInput,
  type ListGitHubRepositoriesQueryInput,
  type ListResourcesQueryInput,
  type PromoteEnvironmentCommandInput,
  type RegisterServerCommandInput,
  type RollbackDeploymentCommandInput,
  type SetEnvironmentVariableCommandInput,
  type ShowEnvironmentQueryInput,
  type UnsetEnvironmentVariableCommandInput,
} from "@yundu/application/schemas";
import {
  type CreateDeploymentResponse,
  type CreateEnvironmentResponse,
  type CreateProjectResponse,
  type DeploymentLogsResponse,
  type DiffEnvironmentResponse,
  type EnvironmentSummary,
  type ListDeploymentsResponse,
  type ListEnvironmentsResponse,
  type ListGitHubRepositoriesResponse,
  type ListPluginsResponse,
  type ListProjectsResponse,
  type ListProvidersResponse,
  type ListResourcesResponse,
  type ListServersResponse,
  type PromoteEnvironmentResponse,
  type RegisterServerResponse,
  type RollbackDeploymentResponse,
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
    logs: Client<
      YunduClientContext,
      DeploymentLogsQueryInput,
      DeploymentLogsResponse,
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
