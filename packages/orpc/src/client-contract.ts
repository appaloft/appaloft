import {
  type ArchiveEnvironmentCommandInput,
  type ArchiveProjectCommandInput,
  type ArchiveResourceCommandInput,
  type BootstrapServerProxyCommandInput,
  type CheckServerDeleteSafetyQueryInput,
  type CloneEnvironmentCommandInput,
  type ConfigureDefaultAccessDomainPolicyCommandInput,
  type ConfigureResourceAccessCommandInput,
  type ConfigureResourceHealthCommandInput,
  type ConfigureResourceNetworkCommandInput,
  type ConfigureResourceRuntimeCommandInput,
  type ConfigureResourceSourceCommandInput,
  type ConfigureServerCredentialCommandInput,
  type ConfigureServerEdgeProxyCommandInput,
  type ConfirmDomainBindingOwnershipCommandInput,
  type CreateDeploymentCommandInput,
  type CreateDomainBindingCommandInput,
  type CreateEnvironmentCommandInput,
  type CreateProjectCommandInput,
  type CreateResourceCommandInput,
  type CreateSshCredentialCommandInput,
  type DeactivateServerCommandInput,
  type DeleteResourceCommandInput,
  type DeleteServerCommandInput,
  type DeleteSshCredentialCommandInput,
  type DeploymentLogsQueryInput,
  type DeploymentRecoveryReadinessQueryInput,
  type DiffEnvironmentsQueryInput,
  type EnvironmentEffectivePrecedenceQueryInput,
  type ImportCertificateCommandInput,
  type IssueOrRenewCertificateCommandInput,
  type ListCertificatesQueryInput,
  type ListDefaultAccessDomainPoliciesQueryInput,
  type ListDeploymentsQueryInput,
  type ListDomainBindingsQueryInput,
  type ListEnvironmentsQueryInput,
  type ListGitHubRepositoriesQueryInput,
  type ListOperatorWorkQueryInput,
  type ListResourcesQueryInput,
  type ListSshCredentialsQueryInput,
  type LockEnvironmentCommandInput,
  type OpenTerminalSessionCommandInput,
  type PromoteEnvironmentCommandInput,
  type RegisterServerCommandInput,
  type RenameEnvironmentCommandInput,
  type RenameProjectCommandInput,
  type RenameServerCommandInput,
  type ResourceDiagnosticSummaryQueryInput,
  type ResourceEffectiveConfigQueryInput,
  type ResourceHealthQueryInput,
  type ResourceProxyConfigurationPreviewQueryInput,
  type ResourceRuntimeLogsQueryInput,
  type RotateSshCredentialCommandInput,
  type SetEnvironmentVariableCommandInput,
  type SetResourceVariableCommandInput,
  type ShowDefaultAccessDomainPolicyQueryInput,
  type ShowDeploymentQueryInput,
  type ShowEnvironmentQueryInput,
  type ShowOperatorWorkQueryInput,
  type ShowProjectQueryInput,
  type ShowResourceQueryInput,
  type ShowServerQueryInput,
  type ShowSshCredentialQueryInput,
  type StreamDeploymentEventsQueryInput,
  type TestDraftServerConnectivityCommandInput,
  type TestRegisteredServerConnectivityCommandInput,
  type UnlockEnvironmentCommandInput,
  type UnsetEnvironmentVariableCommandInput,
  type UnsetResourceVariableCommandInput,
} from "@appaloft/application/schemas";
import {
  type ArchiveEnvironmentResponse,
  type ArchiveProjectResponse,
  type ArchiveResourceResponse,
  type BootstrapServerProxyResponse,
  type CheckServerDeleteSafetyResponse,
  type CloneEnvironmentResponse,
  type ConfigureDefaultAccessDomainPolicyResponse,
  type ConfigureResourceAccessResponse,
  type ConfigureResourceHealthResponse,
  type ConfigureResourceNetworkResponse,
  type ConfigureResourceRuntimeResponse,
  type ConfigureResourceSourceResponse,
  type ConfigureServerEdgeProxyResponse,
  type ConfirmDomainBindingOwnershipResponse,
  type CreateDeploymentResponse,
  type CreateDomainBindingResponse,
  type CreateEnvironmentResponse,
  type CreateProjectResponse,
  type CreateResourceResponse,
  type CreateSshCredentialResponse,
  type DeactivateServerResponse,
  type DeleteResourceResponse,
  type DeleteServerResponse,
  type DeleteSshCredentialResponse,
  type DeploymentEventStreamEnvelope,
  type DeploymentEventStreamResponse,
  type DeploymentEventStreamStreamResponse,
  type DeploymentLogsResponse,
  type DeploymentProgressEvent,
  type DeploymentRecoveryReadinessResponse,
  type DiffEnvironmentResponse,
  type EnvironmentEffectivePrecedenceResponse,
  type EnvironmentSummary,
  type ImportCertificateResponse,
  type IssueOrRenewCertificateResponse,
  type ListCertificatesResponse,
  type ListDefaultAccessDomainPoliciesResponse,
  type ListDeploymentsResponse,
  type ListDomainBindingsResponse,
  type ListEnvironmentsResponse,
  type ListGitHubRepositoriesResponse,
  type ListOperatorWorkResponse,
  type ListPluginsResponse,
  type ListProjectsResponse,
  type ListProvidersResponse,
  type ListResourcesResponse,
  type ListServersResponse,
  type ListSshCredentialsResponse,
  type LockEnvironmentResponse,
  type PromoteEnvironmentResponse,
  type ProxyConfigurationView,
  type RegisterServerResponse,
  type RenameEnvironmentResponse,
  type RenameProjectResponse,
  type RenameServerResponse,
  type ResourceDetail,
  type ResourceDiagnosticSummary,
  type ResourceEffectiveConfigResponse,
  type ResourceHealthSummary,
  type ResourceRuntimeLogEvent,
  type ResourceRuntimeLogsResponse,
  type ResourceRuntimeLogsStreamResponse,
  type RotateSshCredentialResponse,
  type SetResourceVariableResponse,
  type ShowDefaultAccessDomainPolicyResponse,
  type ShowDeploymentResponse,
  type ShowOperatorWorkResponse,
  type ShowProjectResponse,
  type ShowServerResponse,
  type ShowSshCredentialResponse,
  type TerminalSessionDescriptor,
  type TestServerConnectivityResponse,
  type UnlockEnvironmentResponse,
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
    show: Client<
      AppaloftClientContext,
      ShowServerQueryInput,
      ShowServerResponse,
      AppaloftClientError
    >;
    rename: Client<
      AppaloftClientContext,
      RenameServerCommandInput,
      RenameServerResponse,
      AppaloftClientError
    >;
    configureEdgeProxy: Client<
      AppaloftClientContext,
      ConfigureServerEdgeProxyCommandInput,
      ConfigureServerEdgeProxyResponse,
      AppaloftClientError
    >;
    deactivate: Client<
      AppaloftClientContext,
      DeactivateServerCommandInput,
      DeactivateServerResponse,
      AppaloftClientError
    >;
    delete: Client<
      AppaloftClientContext,
      DeleteServerCommandInput,
      DeleteServerResponse,
      AppaloftClientError
    >;
    deleteCheck: Client<
      AppaloftClientContext,
      CheckServerDeleteSafetyQueryInput,
      CheckServerDeleteSafetyResponse,
      AppaloftClientError
    >;
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
      TestRegisteredServerConnectivityCommandInput,
      TestServerConnectivityResponse,
      AppaloftClientError
    >;
    testDraftConnectivity: Client<
      AppaloftClientContext,
      TestDraftServerConnectivityCommandInput,
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
    list: Client<
      AppaloftClientContext,
      ListDefaultAccessDomainPoliciesQueryInput,
      ListDefaultAccessDomainPoliciesResponse,
      AppaloftClientError
    >;
    show: Client<
      AppaloftClientContext,
      ShowDefaultAccessDomainPolicyQueryInput,
      ShowDefaultAccessDomainPolicyResponse,
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
      show: Client<
        AppaloftClientContext,
        ShowSshCredentialQueryInput,
        ShowSshCredentialResponse,
        AppaloftClientError
      >;
      create: Client<
        AppaloftClientContext,
        CreateSshCredentialCommandInput,
        CreateSshCredentialResponse,
        AppaloftClientError
      >;
      delete: Client<
        AppaloftClientContext,
        DeleteSshCredentialCommandInput,
        DeleteSshCredentialResponse,
        AppaloftClientError
      >;
      rotate: Client<
        AppaloftClientContext,
        RotateSshCredentialCommandInput,
        RotateSshCredentialResponse,
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
    archive: Client<
      AppaloftClientContext,
      ArchiveEnvironmentCommandInput,
      ArchiveEnvironmentResponse,
      AppaloftClientError
    >;
    clone: Client<
      AppaloftClientContext,
      CloneEnvironmentCommandInput,
      CloneEnvironmentResponse,
      AppaloftClientError
    >;
    rename: Client<
      AppaloftClientContext,
      RenameEnvironmentCommandInput,
      RenameEnvironmentResponse,
      AppaloftClientError
    >;
    lock: Client<
      AppaloftClientContext,
      LockEnvironmentCommandInput,
      LockEnvironmentResponse,
      AppaloftClientError
    >;
    unlock: Client<
      AppaloftClientContext,
      UnlockEnvironmentCommandInput,
      UnlockEnvironmentResponse,
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
    effectivePrecedence: Client<
      AppaloftClientContext,
      EnvironmentEffectivePrecedenceQueryInput,
      EnvironmentEffectivePrecedenceResponse,
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
    configureAccess: Client<
      AppaloftClientContext,
      ConfigureResourceAccessCommandInput,
      ConfigureResourceAccessResponse,
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
    recoveryReadiness: Client<
      AppaloftClientContext,
      DeploymentRecoveryReadinessQueryInput,
      DeploymentRecoveryReadinessResponse,
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
  operatorWork: {
    list: Client<
      AppaloftClientContext,
      ListOperatorWorkQueryInput,
      ListOperatorWorkResponse,
      AppaloftClientError
    >;
    show: Client<
      AppaloftClientContext,
      ShowOperatorWorkQueryInput,
      ShowOperatorWorkResponse,
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
