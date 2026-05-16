import {
  type ArchiveDeploymentCommandInput,
  type ArchiveEnvironmentCommandInput,
  type ArchiveProjectCommandInput,
  type ArchiveResourceCommandInput,
  type BindResourceDependencyCommandInput,
  type BootstrapFirstAdminCommandInput,
  type BootstrapServerProxyCommandInput,
  type CancelDeploymentCommandInput,
  type ChangeOrganizationMemberRoleCommandInput,
  type CheckDomainBindingDeleteSafetyQueryInput,
  type CheckProjectDeleteSafetyQueryInput,
  type CheckServerDeleteSafetyQueryInput,
  type CleanupPreviewCommandInput,
  type CloneEnvironmentCommandInput,
  type CloseTerminalSessionCommandInput,
  type ConfigureDefaultAccessDomainPolicyCommandInput,
  type ConfigureDependencyResourceBackupPolicyCommandInput,
  type ConfigureDomainBindingRouteCommandInput,
  type ConfigurePreviewPolicyCommandInput,
  type ConfigureResourceAccessCommandInput,
  type ConfigureResourceAutoDeployCommandInput,
  type ConfigureResourceHealthCommandInput,
  type ConfigureResourceNetworkCommandInput,
  type ConfigureResourceRuntimeCommandInput,
  type ConfigureResourceSourceCommandInput,
  type ConfigureRuntimeMonitoringThresholdsCommandInput,
  type ConfigureScheduledRuntimePrunePolicyCommandInput,
  type ConfigureScheduledTaskCommandInput,
  type ConfigureServerCredentialCommandInput,
  type ConfigureServerEdgeProxyCommandInput,
  type ConfirmDomainBindingOwnershipCommandInput,
  type CreateDependencyResourceBackupCommandInput,
  type CreateDeploymentCommandInput,
  type CreateDeployTokenCommandInput,
  type CreateDomainBindingCommandInput,
  type CreateEnvironmentCommandInput,
  type CreateProjectCommandInput,
  type CreateResourceCommandInput,
  type CreateResourceSecretReferenceCommandInput,
  type CreateScheduledTaskCommandInput,
  type CreateSshCredentialCommandInput,
  type DeactivateServerCommandInput,
  type DeleteCertificateCommandInput,
  type DeleteDependencyResourceCommandInput,
  type DeleteDomainBindingCommandInput,
  type DeletePreviewEnvironmentCommandInput,
  type DeleteProjectCommandInput,
  type DeleteResourceCommandInput,
  type DeleteResourceSecretReferenceCommandInput,
  type DeleteScheduledTaskCommandInput,
  type DeleteServerCommandInput,
  type DeleteSourceLinkCommandInput,
  type DeleteSshCredentialCommandInput,
  type DeploymentLogsQueryInput,
  type DeploymentPlanQueryInput,
  type DeploymentRecoveryReadinessQueryInput,
  type DiffEnvironmentsQueryInput,
  type EnvironmentEffectivePrecedenceQueryInput,
  type ExpireTerminalSessionsCommandInput,
  type GetAuthBootstrapStatusQueryInput,
  type GetCurrentOrganizationContextQueryInput,
  type ImportCertificateCommandInput,
  type ImportPostgresDependencyResourceCommandInput,
  type ImportRedisDependencyResourceCommandInput,
  type ImportResourceVariablesCommandInput,
  type InspectRuntimeUsageQueryInput,
  type InspectServerCapacityQueryInput,
  type InviteOrganizationMemberCommandInput,
  type IssueOrRenewCertificateCommandInput,
  type ListCertificatesQueryInput,
  type ListDefaultAccessDomainPoliciesQueryInput,
  type ListDependencyResourceBackupPoliciesQueryInput,
  type ListDependencyResourceBackupsQueryInput,
  type ListDependencyResourcesQueryInput,
  type ListDeploymentsQueryInput,
  type ListDeployTokensQueryInput,
  type ListDomainBindingsQueryInput,
  type ListEnvironmentsQueryInput,
  type ListGitHubRepositoriesQueryInput,
  type ListOperatorWorkQueryInput,
  type ListOrganizationInvitationsQueryInput,
  type ListOrganizationMembersQueryInput,
  type ListPreviewEnvironmentsQueryInput,
  type ListResourceDependencyBindingsQueryInput,
  type ListResourceSecretReferencesQueryInput,
  type ListResourcesQueryInput,
  type ListRuntimeMonitoringSamplesQueryInput,
  type ListScheduledTaskRunsQueryInput,
  type ListScheduledTasksQueryInput,
  type ListSourceEventsQueryInput,
  type ListSourceLinksQueryInput,
  type ListSshCredentialsQueryInput,
  type ListTerminalSessionsQueryInput,
  type LockEnvironmentCommandInput,
  type OpenTerminalSessionCommandInput,
  type PromoteEnvironmentCommandInput,
  type ProvisionPostgresDependencyResourceCommandInput,
  type ProvisionRedisDependencyResourceCommandInput,
  type PruneDeploymentLogsCommandInput,
  type PruneDeploymentsCommandInput,
  type PruneServerCapacityCommandInput,
  type PruneSourceEventsCommandInput,
  type RedeployDeploymentCommandInput,
  type RegisterServerCommandInput,
  type RelinkSourceLinkCommandInput,
  type RemoveOrganizationMemberCommandInput,
  type RenameDependencyResourceCommandInput,
  type RenameEnvironmentCommandInput,
  type RenameProjectCommandInput,
  type RenameServerCommandInput,
  type ReplaySourceEventCommandInput,
  type ResetResourceHealthCommandInput,
  type ResourceAccessFailureEvidenceLookupQueryInput,
  type ResourceDiagnosticSummaryQueryInput,
  type ResourceEffectiveConfigQueryInput,
  type ResourceHealthHistoryQueryInput,
  type ResourceHealthQueryInput,
  type ResourceProxyConfigurationPreviewQueryInput,
  type ResourceRuntimeLogsQueryInput,
  type RestartResourceRuntimeCommandInput,
  type RestoreDependencyResourceBackupCommandInput,
  type RestoreProjectCommandInput,
  type RetryCertificateCommandInput,
  type RetryDeploymentCommandInput,
  type RetryDomainBindingVerificationCommandInput,
  type RevokeCertificateCommandInput,
  type RevokeDeployTokenCommandInput,
  type RollbackDeploymentCommandInput,
  type RotateDeployTokenCommandInput,
  type RotateResourceDependencyBindingSecretCommandInput,
  type RotateResourceSecretReferenceCommandInput,
  type RotateSshCredentialCommandInput,
  type RunScheduledTaskNowCommandInput,
  type RuntimeMonitoringRollupQueryInput,
  type ScheduledTaskRunLogsQueryInput,
  type SetEnvironmentVariableCommandInput,
  type SetProjectDescriptionCommandInput,
  type SetResourceVariableCommandInput,
  type ShowCertificateQueryInput,
  type ShowDefaultAccessDomainPolicyQueryInput,
  type ShowDependencyResourceBackupPolicyQueryInput,
  type ShowDependencyResourceBackupQueryInput,
  type ShowDependencyResourceQueryInput,
  type ShowDeploymentQueryInput,
  type ShowDeployTokenQueryInput,
  type ShowDomainBindingQueryInput,
  type ShowEnvironmentQueryInput,
  type ShowOperatorWorkQueryInput,
  type ShowPreviewEnvironmentQueryInput,
  type ShowPreviewPolicyQueryInput,
  type ShowProjectQueryInput,
  type ShowResourceDependencyBindingQueryInput,
  type ShowResourceQueryInput,
  type ShowResourceSecretReferenceQueryInput,
  type ShowRuntimeMonitoringThresholdsQueryInput,
  type ShowScheduledTaskQueryInput,
  type ShowScheduledTaskRunQueryInput,
  type ShowServerQueryInput,
  type ShowSourceEventQueryInput,
  type ShowSourceLinkQueryInput,
  type ShowSshCredentialQueryInput,
  type ShowTerminalSessionQueryInput,
  type StartResourceRuntimeCommandInput,
  type StopResourceRuntimeCommandInput,
  type StreamDeploymentEventsQueryInput,
  type SwitchCurrentOrganizationCommandInput,
  type TestDraftServerConnectivityCommandInput,
  type TestRegisteredServerConnectivityCommandInput,
  type UnbindResourceDependencyCommandInput,
  type UnlockEnvironmentCommandInput,
  type UnsetEnvironmentVariableCommandInput,
  type UnsetResourceVariableCommandInput,
} from "@appaloft/application/schemas";
import {
  type ArchiveDeploymentResponse,
  type ArchiveEnvironmentResponse,
  type ArchiveProjectResponse,
  type ArchiveResourceResponse,
  type AttachResourceStorageInput,
  type AttachResourceStorageResponse,
  type BindResourceDependencyResponse,
  type BootstrapServerProxyResponse,
  type CancelDeploymentResponse,
  type ChangeOrganizationMemberRoleResponse,
  type CheckDomainBindingDeleteSafetyResponse,
  type CheckProjectDeleteSafetyResponse,
  type CheckServerDeleteSafetyResponse,
  type CleanupPreviewResponse,
  type CleanupStorageVolumeRuntimeInput,
  type CleanupStorageVolumeRuntimeResponse,
  type CloneEnvironmentResponse,
  type CloseTerminalSessionResponse,
  type ConfigureDefaultAccessDomainPolicyResponse,
  type ConfigureDependencyResourceBackupPolicyResponse,
  type ConfigureDomainBindingRouteResponse,
  type ConfigurePreviewPolicyResponse,
  type ConfigureResourceAccessResponse,
  type ConfigureResourceAutoDeployResponse,
  type ConfigureResourceHealthResponse,
  type ConfigureResourceNetworkResponse,
  type ConfigureResourceRuntimeResponse,
  type ConfigureResourceSourceResponse,
  type ConfigureRuntimeMonitoringThresholdsResponse,
  type ConfigureScheduledRuntimePrunePolicyResponse,
  type ConfigureServerEdgeProxyResponse,
  type ConfirmDomainBindingOwnershipResponse,
  type CreateDeploymentResponse,
  type CreateDeployTokenResponse,
  type CreateDomainBindingResponse,
  type CreateEnvironmentResponse,
  type CreateProjectResponse,
  type CreateResourceResponse,
  type CreateResourceSecretReferenceResponse,
  type CreateSshCredentialResponse,
  type CreateStorageVolumeInput,
  type CreateStorageVolumeResponse,
  type CurrentOrganizationContextResponse,
  type DeactivateServerResponse,
  type DeleteCertificateResponse,
  type DeleteDomainBindingResponse,
  type DeletePreviewEnvironmentResponse,
  type DeleteProjectResponse,
  type DeleteResourceResponse,
  type DeleteResourceSecretReferenceResponse,
  type DeleteScheduledTaskResponse,
  type DeleteServerResponse,
  type DeleteSshCredentialResponse,
  type DeleteStorageVolumeInput,
  type DeleteStorageVolumeResponse,
  type DependencyResourceResponse,
  type DeploymentEventStreamEnvelope,
  type DeploymentEventStreamResponse,
  type DeploymentEventStreamStreamResponse,
  type DeploymentLogsResponse,
  type DeploymentPlanResponse,
  type DeploymentProgressEvent,
  type DeploymentRecoveryReadinessResponse,
  type DetachResourceStorageInput,
  type DetachResourceStorageResponse,
  type DiffEnvironmentResponse,
  type DoctorResponse,
  type EnvironmentEffectivePrecedenceResponse,
  type EnvironmentSummary,
  type ExpireTerminalSessionsResponse,
  type ImportCertificateResponse,
  type ImportResourceVariablesResponse,
  type InspectRuntimeUsageResponse,
  type InspectServerCapacityResponse,
  type InviteOrganizationMemberResponse,
  type IssueOrRenewCertificateResponse,
  type ListCertificatesResponse,
  type ListDefaultAccessDomainPoliciesResponse,
  type ListDependencyResourceBackupPoliciesResponse,
  type ListDependencyResourceBackupsResponse,
  type ListDependencyResourcesResponse,
  type ListDeploymentsResponse,
  type ListDeployTokensResponse,
  type ListDomainBindingsResponse,
  type ListEnvironmentsResponse,
  type ListGitHubRepositoriesResponse,
  type ListOperatorWorkResponse,
  type ListOrganizationInvitationsResponse,
  type ListOrganizationMembersResponse,
  type ListPluginsResponse,
  type ListPreviewEnvironmentsResponse,
  type ListProjectsResponse,
  type ListProvidersResponse,
  type ListResourceDependencyBindingsResponse,
  type ListResourceSecretReferencesResponse,
  type ListResourcesResponse,
  type ListScheduledRuntimePrunePoliciesResponse,
  type ListScheduledTaskRunsResponse,
  type ListScheduledTasksResponse,
  type ListServersResponse,
  type ListSourceEventsResponse,
  type ListSshCredentialsResponse,
  type ListStorageVolumesInput,
  type ListStorageVolumesResponse,
  type ListTerminalSessionsResponse,
  type LockEnvironmentResponse,
  type PromoteEnvironmentResponse,
  type ProxyConfigurationView,
  type PruneDeploymentLogsResponse,
  type PruneDeploymentsResponse,
  type PruneServerCapacityResponse,
  type PruneSourceEventsResponse,
  type RedeployDeploymentResponse,
  type RegisterServerResponse,
  type RemoveOrganizationMemberResponse,
  type RenameEnvironmentResponse,
  type RenameProjectResponse,
  type RenameServerResponse,
  type RenameStorageVolumeInput,
  type RenameStorageVolumeResponse,
  type ReplaySourceEventResponse,
  type ResetResourceHealthResponse,
  type ResourceAccessFailureEvidenceLookup,
  type ResourceDetail,
  type ResourceDiagnosticSummary,
  type ResourceEffectiveConfigResponse,
  type ResourceHealthHistory,
  type ResourceHealthSummary,
  type ResourceRuntimeLogEvent,
  type ResourceRuntimeLogsResponse,
  type ResourceRuntimeLogsStreamResponse,
  type RestartResourceRuntimeResponse,
  type RestoreProjectResponse,
  type RetryCertificateResponse,
  type RetryDeploymentResponse,
  type RetryDomainBindingVerificationResponse,
  type RevokeCertificateResponse,
  type RevokeDeployTokenResponse,
  type RollbackDeploymentResponse,
  type RotateDeployTokenResponse,
  type RotateResourceDependencyBindingSecretResponse,
  type RotateResourceSecretReferenceResponse,
  type RotateSshCredentialResponse,
  type RunScheduledTaskNowResponse,
  type RuntimeMonitoringRollupResponse,
  type RuntimeMonitoringSamplesResponse,
  type RuntimeMonitoringThresholdsResponse,
  type ScheduledTaskCommandResponse,
  type ScheduledTaskRunLogsResponse,
  type SetProjectDescriptionResponse,
  type SetResourceVariableResponse,
  type ShowCertificateResponse,
  type ShowDefaultAccessDomainPolicyResponse,
  type ShowDependencyResourceBackupPolicyResponse,
  type ShowDependencyResourceBackupResponse,
  type ShowDependencyResourceResponse,
  type ShowDeploymentResponse,
  type ShowDeployTokenResponse,
  type ShowDomainBindingResponse,
  type ShowOperatorWorkResponse,
  type ShowPreviewEnvironmentResponse,
  type ShowPreviewPolicyResponse,
  type ShowProjectResponse,
  type ShowResourceDependencyBindingResponse,
  type ShowResourceSecretReferenceResponse,
  type ShowScheduledRuntimePrunePolicyResponse,
  type ShowScheduledTaskResponse,
  type ShowScheduledTaskRunResponse,
  type ShowServerResponse,
  type ShowSourceEventResponse,
  type ShowSshCredentialResponse,
  type ShowStorageVolumeInput,
  type ShowStorageVolumeResponse,
  type ShowTerminalSessionResponse,
  type StartResourceRuntimeResponse,
  type StopResourceRuntimeResponse,
  type TerminalSessionDescriptor,
  type TestServerConnectivityResponse,
  type UnbindResourceDependencyResponse,
  type UnlockEnvironmentResponse,
  type UnsetResourceVariableResponse,
} from "@appaloft/contracts";
import { type AsyncIteratorClass, type Client, type ORPCError } from "@orpc/client";

type AppaloftClientContext = Record<never, never>;
type AppaloftClientError = ORPCError<string, unknown>;
type ScheduledRuntimePrunePolicyScope =
  | "defaults"
  | "system"
  | "organization"
  | "project"
  | "environment"
  | "deployment-snapshot";
type ListScheduledRuntimePrunePoliciesQueryInput = {
  serverId?: string;
  scope?: ScheduledRuntimePrunePolicyScope;
  enabledOnly?: boolean | string;
};
type ShowScheduledRuntimePrunePolicyQueryInput = {
  policyId: string;
};
export interface RelinkSourceLinkResponse {
  sourceFingerprint: string;
  projectId: string;
  environmentId: string;
  resourceId: string;
  serverId?: string;
  destinationId?: string;
}

export interface SourceLinkRecord {
  sourceFingerprint: string;
  projectId: string;
  environmentId: string;
  resourceId: string;
  serverId?: string;
  destinationId?: string;
  updatedAt: string;
  reason?: string;
}

export interface ListSourceLinksResponse {
  schemaVersion: "source-links.list/v1";
  items: SourceLinkRecord[];
}

export interface ShowSourceLinkResponse {
  schemaVersion: "source-links.show/v1";
  sourceLink: SourceLinkRecord;
}

export interface DeleteSourceLinkResponse {
  sourceFingerprint: string;
  deleted: boolean;
}

export type ProductLoginMethodKey = "local-password" | "github" | "google" | "oidc";

export interface ProductLoginMethodStatus {
  key: ProductLoginMethodKey;
  configured: boolean;
  enabled: boolean;
  reason?: string;
}

export interface AuthBootstrapStatusResponse {
  bootstrapRequired: boolean;
  firstAdminConfigured: boolean;
  organizationConfigured: boolean;
  loginMethods: ProductLoginMethodStatus[];
  firstAdminEmail?: string;
  loginUrl?: string;
  organizationId?: string;
  organizationSlug?: string;
  nextSteps?: string[];
}

export interface BootstrapFirstAdminResponse {
  bootstrapRequired: false;
  created: boolean;
  email: string;
  loginMethods: ProductLoginMethodStatus[];
  organizationId: string;
  organizationSlug: string;
  userId: string;
  generatedPassword?: string;
  loginUrl?: string;
}

export type AppaloftOrpcClientContract = {
  auth: {
    bootstrapStatus: Client<
      AppaloftClientContext,
      GetAuthBootstrapStatusQueryInput,
      AuthBootstrapStatusResponse,
      AppaloftClientError
    >;
    bootstrapFirstAdmin: Client<
      AppaloftClientContext,
      BootstrapFirstAdminCommandInput,
      BootstrapFirstAdminResponse,
      AppaloftClientError
    >;
  };
  deployTokens: {
    create: Client<
      AppaloftClientContext,
      CreateDeployTokenCommandInput,
      CreateDeployTokenResponse,
      AppaloftClientError
    >;
    list: Client<
      AppaloftClientContext,
      ListDeployTokensQueryInput,
      ListDeployTokensResponse,
      AppaloftClientError
    >;
    show: Client<
      AppaloftClientContext,
      ShowDeployTokenQueryInput,
      ShowDeployTokenResponse,
      AppaloftClientError
    >;
    rotate: Client<
      AppaloftClientContext,
      RotateDeployTokenCommandInput,
      RotateDeployTokenResponse,
      AppaloftClientError
    >;
    revoke: Client<
      AppaloftClientContext,
      RevokeDeployTokenCommandInput,
      RevokeDeployTokenResponse,
      AppaloftClientError
    >;
  };
  organizations: {
    currentContext: Client<
      AppaloftClientContext,
      GetCurrentOrganizationContextQueryInput,
      CurrentOrganizationContextResponse,
      AppaloftClientError
    >;
    switchCurrent: Client<
      AppaloftClientContext,
      SwitchCurrentOrganizationCommandInput,
      CurrentOrganizationContextResponse,
      AppaloftClientError
    >;
    listMembers: Client<
      AppaloftClientContext,
      ListOrganizationMembersQueryInput,
      ListOrganizationMembersResponse,
      AppaloftClientError
    >;
    listInvitations: Client<
      AppaloftClientContext,
      ListOrganizationInvitationsQueryInput,
      ListOrganizationInvitationsResponse,
      AppaloftClientError
    >;
    inviteMember: Client<
      AppaloftClientContext,
      InviteOrganizationMemberCommandInput,
      InviteOrganizationMemberResponse,
      AppaloftClientError
    >;
    updateMemberRole: Client<
      AppaloftClientContext,
      ChangeOrganizationMemberRoleCommandInput,
      ChangeOrganizationMemberRoleResponse,
      AppaloftClientError
    >;
    removeMember: Client<
      AppaloftClientContext,
      RemoveOrganizationMemberCommandInput,
      RemoveOrganizationMemberResponse,
      AppaloftClientError
    >;
  };
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
    setDescription: Client<
      AppaloftClientContext,
      SetProjectDescriptionCommandInput,
      SetProjectDescriptionResponse,
      AppaloftClientError
    >;
    archive: Client<
      AppaloftClientContext,
      ArchiveProjectCommandInput,
      ArchiveProjectResponse,
      AppaloftClientError
    >;
    restore: Client<
      AppaloftClientContext,
      RestoreProjectCommandInput,
      RestoreProjectResponse,
      AppaloftClientError
    >;
    deleteCheck: Client<
      AppaloftClientContext,
      CheckProjectDeleteSafetyQueryInput,
      CheckProjectDeleteSafetyResponse,
      AppaloftClientError
    >;
    delete: Client<
      AppaloftClientContext,
      DeleteProjectCommandInput,
      DeleteProjectResponse,
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
    capacity: {
      inspect: Client<
        AppaloftClientContext,
        InspectServerCapacityQueryInput,
        InspectServerCapacityResponse,
        AppaloftClientError
      >;
      prune: Client<
        AppaloftClientContext,
        PruneServerCapacityCommandInput,
        PruneServerCapacityResponse,
        AppaloftClientError
      >;
      policy: {
        configure: Client<
          AppaloftClientContext,
          ConfigureScheduledRuntimePrunePolicyCommandInput,
          ConfigureScheduledRuntimePrunePolicyResponse,
          AppaloftClientError
        >;
        list: Client<
          AppaloftClientContext,
          ListScheduledRuntimePrunePoliciesQueryInput,
          ListScheduledRuntimePrunePoliciesResponse,
          AppaloftClientError
        >;
        show: Client<
          AppaloftClientContext,
          ShowScheduledRuntimePrunePolicyQueryInput,
          ShowScheduledRuntimePrunePolicyResponse,
          AppaloftClientError
        >;
      };
    };
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
    attachStorage: Client<
      AppaloftClientContext,
      AttachResourceStorageInput,
      AttachResourceStorageResponse,
      AppaloftClientError
    >;
    detachStorage: Client<
      AppaloftClientContext,
      DetachResourceStorageInput,
      DetachResourceStorageResponse,
      AppaloftClientError
    >;
    configureHealth: Client<
      AppaloftClientContext,
      ConfigureResourceHealthCommandInput,
      ConfigureResourceHealthResponse,
      AppaloftClientError
    >;
    resetHealth: Client<
      AppaloftClientContext,
      ResetResourceHealthCommandInput,
      ResetResourceHealthResponse,
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
    configureAutoDeploy: Client<
      AppaloftClientContext,
      ConfigureResourceAutoDeployCommandInput,
      ConfigureResourceAutoDeployResponse,
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
    secrets: {
      create: Client<
        AppaloftClientContext,
        CreateResourceSecretReferenceCommandInput,
        CreateResourceSecretReferenceResponse,
        AppaloftClientError
      >;
      rotate: Client<
        AppaloftClientContext,
        RotateResourceSecretReferenceCommandInput,
        RotateResourceSecretReferenceResponse,
        AppaloftClientError
      >;
      delete: Client<
        AppaloftClientContext,
        DeleteResourceSecretReferenceCommandInput,
        DeleteResourceSecretReferenceResponse,
        AppaloftClientError
      >;
      list: Client<
        AppaloftClientContext,
        ListResourceSecretReferencesQueryInput,
        ListResourceSecretReferencesResponse,
        AppaloftClientError
      >;
      show: Client<
        AppaloftClientContext,
        ShowResourceSecretReferenceQueryInput,
        ShowResourceSecretReferenceResponse,
        AppaloftClientError
      >;
    };
    importVariables: Client<
      AppaloftClientContext,
      ImportResourceVariablesCommandInput,
      ImportResourceVariablesResponse,
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
    accessFailureEvidence: Client<
      AppaloftClientContext,
      ResourceAccessFailureEvidenceLookupQueryInput,
      ResourceAccessFailureEvidenceLookup,
      AppaloftClientError
    >;
    health: Client<
      AppaloftClientContext,
      ResourceHealthQueryInput,
      ResourceHealthSummary,
      AppaloftClientError
    >;
    healthHistory: Client<
      AppaloftClientContext,
      ResourceHealthHistoryQueryInput,
      ResourceHealthHistory,
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
    runtime: {
      stop: Client<
        AppaloftClientContext,
        StopResourceRuntimeCommandInput,
        StopResourceRuntimeResponse,
        AppaloftClientError
      >;
      start: Client<
        AppaloftClientContext,
        StartResourceRuntimeCommandInput,
        StartResourceRuntimeResponse,
        AppaloftClientError
      >;
      restart: Client<
        AppaloftClientContext,
        RestartResourceRuntimeCommandInput,
        RestartResourceRuntimeResponse,
        AppaloftClientError
      >;
    };
    dependencyBindings: {
      bind: Client<
        AppaloftClientContext,
        BindResourceDependencyCommandInput,
        BindResourceDependencyResponse,
        AppaloftClientError
      >;
      unbind: Client<
        AppaloftClientContext,
        UnbindResourceDependencyCommandInput,
        UnbindResourceDependencyResponse,
        AppaloftClientError
      >;
      rotateSecret: Client<
        AppaloftClientContext,
        RotateResourceDependencyBindingSecretCommandInput,
        RotateResourceDependencyBindingSecretResponse,
        AppaloftClientError
      >;
      list: Client<
        AppaloftClientContext,
        ListResourceDependencyBindingsQueryInput,
        ListResourceDependencyBindingsResponse,
        AppaloftClientError
      >;
      show: Client<
        AppaloftClientContext,
        ShowResourceDependencyBindingQueryInput,
        ShowResourceDependencyBindingResponse,
        AppaloftClientError
      >;
    };
  };
  storageVolumes: {
    create: Client<
      AppaloftClientContext,
      CreateStorageVolumeInput,
      CreateStorageVolumeResponse,
      AppaloftClientError
    >;
    list: Client<
      AppaloftClientContext,
      ListStorageVolumesInput,
      ListStorageVolumesResponse,
      AppaloftClientError
    >;
    show: Client<
      AppaloftClientContext,
      ShowStorageVolumeInput,
      ShowStorageVolumeResponse,
      AppaloftClientError
    >;
    rename: Client<
      AppaloftClientContext,
      RenameStorageVolumeInput,
      RenameStorageVolumeResponse,
      AppaloftClientError
    >;
    delete: Client<
      AppaloftClientContext,
      DeleteStorageVolumeInput,
      DeleteStorageVolumeResponse,
      AppaloftClientError
    >;
    cleanupRuntime: Client<
      AppaloftClientContext,
      CleanupStorageVolumeRuntimeInput,
      CleanupStorageVolumeRuntimeResponse,
      AppaloftClientError
    >;
  };
  dependencyResources: {
    provisionPostgres: Client<
      AppaloftClientContext,
      ProvisionPostgresDependencyResourceCommandInput,
      DependencyResourceResponse,
      AppaloftClientError
    >;
    importPostgres: Client<
      AppaloftClientContext,
      ImportPostgresDependencyResourceCommandInput,
      DependencyResourceResponse,
      AppaloftClientError
    >;
    provisionRedis: Client<
      AppaloftClientContext,
      ProvisionRedisDependencyResourceCommandInput,
      DependencyResourceResponse,
      AppaloftClientError
    >;
    importRedis: Client<
      AppaloftClientContext,
      ImportRedisDependencyResourceCommandInput,
      DependencyResourceResponse,
      AppaloftClientError
    >;
    list: Client<
      AppaloftClientContext,
      ListDependencyResourcesQueryInput,
      ListDependencyResourcesResponse,
      AppaloftClientError
    >;
    show: Client<
      AppaloftClientContext,
      ShowDependencyResourceQueryInput,
      ShowDependencyResourceResponse,
      AppaloftClientError
    >;
    rename: Client<
      AppaloftClientContext,
      RenameDependencyResourceCommandInput,
      DependencyResourceResponse,
      AppaloftClientError
    >;
    delete: Client<
      AppaloftClientContext,
      DeleteDependencyResourceCommandInput,
      DependencyResourceResponse,
      AppaloftClientError
    >;
    createBackup: Client<
      AppaloftClientContext,
      CreateDependencyResourceBackupCommandInput,
      DependencyResourceResponse,
      AppaloftClientError
    >;
    listBackups: Client<
      AppaloftClientContext,
      ListDependencyResourceBackupsQueryInput,
      ListDependencyResourceBackupsResponse,
      AppaloftClientError
    >;
    showBackup: Client<
      AppaloftClientContext,
      ShowDependencyResourceBackupQueryInput,
      ShowDependencyResourceBackupResponse,
      AppaloftClientError
    >;
    restoreBackup: Client<
      AppaloftClientContext,
      RestoreDependencyResourceBackupCommandInput,
      DependencyResourceResponse,
      AppaloftClientError
    >;
    configureBackupPolicy: Client<
      AppaloftClientContext,
      ConfigureDependencyResourceBackupPolicyCommandInput,
      ConfigureDependencyResourceBackupPolicyResponse,
      AppaloftClientError
    >;
    listBackupPolicies: Client<
      AppaloftClientContext,
      ListDependencyResourceBackupPoliciesQueryInput,
      ListDependencyResourceBackupPoliciesResponse,
      AppaloftClientError
    >;
    showBackupPolicy: Client<
      AppaloftClientContext,
      ShowDependencyResourceBackupPolicyQueryInput,
      ShowDependencyResourceBackupPolicyResponse,
      AppaloftClientError
    >;
  };
  scheduledTasks: {
    list: Client<
      AppaloftClientContext,
      ListScheduledTasksQueryInput,
      ListScheduledTasksResponse,
      AppaloftClientError
    >;
    show: Client<
      AppaloftClientContext,
      ShowScheduledTaskQueryInput,
      ShowScheduledTaskResponse,
      AppaloftClientError
    >;
    create: Client<
      AppaloftClientContext,
      CreateScheduledTaskCommandInput,
      ScheduledTaskCommandResponse,
      AppaloftClientError
    >;
    configure: Client<
      AppaloftClientContext,
      ConfigureScheduledTaskCommandInput,
      ScheduledTaskCommandResponse,
      AppaloftClientError
    >;
    delete: Client<
      AppaloftClientContext,
      DeleteScheduledTaskCommandInput,
      DeleteScheduledTaskResponse,
      AppaloftClientError
    >;
    runNow: Client<
      AppaloftClientContext,
      RunScheduledTaskNowCommandInput,
      RunScheduledTaskNowResponse,
      AppaloftClientError
    >;
    runs: {
      list: Client<
        AppaloftClientContext,
        ListScheduledTaskRunsQueryInput,
        ListScheduledTaskRunsResponse,
        AppaloftClientError
      >;
      show: Client<
        AppaloftClientContext,
        ShowScheduledTaskRunQueryInput,
        ShowScheduledTaskRunResponse,
        AppaloftClientError
      >;
      logs: Client<
        AppaloftClientContext,
        ScheduledTaskRunLogsQueryInput,
        ScheduledTaskRunLogsResponse,
        AppaloftClientError
      >;
    };
  };
  terminalSessions: {
    open: Client<
      AppaloftClientContext,
      OpenTerminalSessionCommandInput,
      TerminalSessionDescriptor,
      AppaloftClientError
    >;
    list: Client<
      AppaloftClientContext,
      ListTerminalSessionsQueryInput,
      ListTerminalSessionsResponse,
      AppaloftClientError
    >;
    show: Client<
      AppaloftClientContext,
      ShowTerminalSessionQueryInput,
      ShowTerminalSessionResponse,
      AppaloftClientError
    >;
    close: Client<
      AppaloftClientContext,
      CloseTerminalSessionCommandInput,
      CloseTerminalSessionResponse,
      AppaloftClientError
    >;
    expire: Client<
      AppaloftClientContext,
      ExpireTerminalSessionsCommandInput,
      ExpireTerminalSessionsResponse,
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
    show: Client<
      AppaloftClientContext,
      ShowDomainBindingQueryInput,
      ShowDomainBindingResponse,
      AppaloftClientError
    >;
    create: Client<
      AppaloftClientContext,
      CreateDomainBindingCommandInput,
      CreateDomainBindingResponse,
      AppaloftClientError
    >;
    configureRoute: Client<
      AppaloftClientContext,
      ConfigureDomainBindingRouteCommandInput,
      ConfigureDomainBindingRouteResponse,
      AppaloftClientError
    >;
    confirmOwnership: Client<
      AppaloftClientContext,
      ConfirmDomainBindingOwnershipCommandInput,
      ConfirmDomainBindingOwnershipResponse,
      AppaloftClientError
    >;
    deleteCheck: Client<
      AppaloftClientContext,
      CheckDomainBindingDeleteSafetyQueryInput,
      CheckDomainBindingDeleteSafetyResponse,
      AppaloftClientError
    >;
    delete: Client<
      AppaloftClientContext,
      DeleteDomainBindingCommandInput,
      DeleteDomainBindingResponse,
      AppaloftClientError
    >;
    retryVerification: Client<
      AppaloftClientContext,
      RetryDomainBindingVerificationCommandInput,
      RetryDomainBindingVerificationResponse,
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
    show: Client<
      AppaloftClientContext,
      ShowCertificateQueryInput,
      ShowCertificateResponse,
      AppaloftClientError
    >;
    retry: Client<
      AppaloftClientContext,
      RetryCertificateCommandInput,
      RetryCertificateResponse,
      AppaloftClientError
    >;
    revoke: Client<
      AppaloftClientContext,
      RevokeCertificateCommandInput,
      RevokeCertificateResponse,
      AppaloftClientError
    >;
    delete: Client<
      AppaloftClientContext,
      DeleteCertificateCommandInput,
      DeleteCertificateResponse,
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
    plan: Client<
      AppaloftClientContext,
      DeploymentPlanQueryInput,
      DeploymentPlanResponse,
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
    cleanupPreview: Client<
      AppaloftClientContext,
      CleanupPreviewCommandInput,
      CleanupPreviewResponse,
      AppaloftClientError
    >;
    retry: Client<
      AppaloftClientContext,
      RetryDeploymentCommandInput,
      RetryDeploymentResponse,
      AppaloftClientError
    >;
    redeploy: Client<
      AppaloftClientContext,
      RedeployDeploymentCommandInput,
      RedeployDeploymentResponse,
      AppaloftClientError
    >;
    rollback: Client<
      AppaloftClientContext,
      RollbackDeploymentCommandInput,
      RollbackDeploymentResponse,
      AppaloftClientError
    >;
    cancel: Client<
      AppaloftClientContext,
      CancelDeploymentCommandInput,
      CancelDeploymentResponse,
      AppaloftClientError
    >;
    archive: Client<
      AppaloftClientContext,
      ArchiveDeploymentCommandInput,
      ArchiveDeploymentResponse,
      AppaloftClientError
    >;
    prune: Client<
      AppaloftClientContext,
      PruneDeploymentsCommandInput,
      PruneDeploymentsResponse,
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
    pruneLogs: Client<
      AppaloftClientContext,
      PruneDeploymentLogsCommandInput,
      PruneDeploymentLogsResponse,
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
  runtimeUsage: {
    inspect: Client<
      AppaloftClientContext,
      InspectRuntimeUsageQueryInput,
      InspectRuntimeUsageResponse,
      AppaloftClientError
    >;
  };
  runtimeMonitoring: {
    samples: Client<
      AppaloftClientContext,
      ListRuntimeMonitoringSamplesQueryInput,
      RuntimeMonitoringSamplesResponse,
      AppaloftClientError
    >;
    rollup: Client<
      AppaloftClientContext,
      RuntimeMonitoringRollupQueryInput,
      RuntimeMonitoringRollupResponse,
      AppaloftClientError
    >;
    thresholdConfigure: Client<
      AppaloftClientContext,
      ConfigureRuntimeMonitoringThresholdsCommandInput,
      ConfigureRuntimeMonitoringThresholdsResponse,
      AppaloftClientError
    >;
    thresholdShow: Client<
      AppaloftClientContext,
      ShowRuntimeMonitoringThresholdsQueryInput,
      RuntimeMonitoringThresholdsResponse,
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
  sourceEvents: {
    list: Client<
      AppaloftClientContext,
      ListSourceEventsQueryInput,
      ListSourceEventsResponse,
      AppaloftClientError
    >;
    show: Client<
      AppaloftClientContext,
      ShowSourceEventQueryInput,
      ShowSourceEventResponse,
      AppaloftClientError
    >;
    replay: Client<
      AppaloftClientContext,
      ReplaySourceEventCommandInput,
      ReplaySourceEventResponse,
      AppaloftClientError
    >;
    prune: Client<
      AppaloftClientContext,
      PruneSourceEventsCommandInput,
      PruneSourceEventsResponse,
      AppaloftClientError
    >;
  };
  sourceLinks: {
    list: Client<
      AppaloftClientContext,
      ListSourceLinksQueryInput,
      ListSourceLinksResponse,
      AppaloftClientError
    >;
    show: Client<
      AppaloftClientContext,
      ShowSourceLinkQueryInput,
      ShowSourceLinkResponse,
      AppaloftClientError
    >;
    relink: Client<
      AppaloftClientContext,
      RelinkSourceLinkCommandInput,
      RelinkSourceLinkResponse,
      AppaloftClientError
    >;
    delete: Client<
      AppaloftClientContext,
      DeleteSourceLinkCommandInput,
      DeleteSourceLinkResponse,
      AppaloftClientError
    >;
  };
  previewPolicies: {
    configure: Client<
      AppaloftClientContext,
      ConfigurePreviewPolicyCommandInput,
      ConfigurePreviewPolicyResponse,
      AppaloftClientError
    >;
    show: Client<
      AppaloftClientContext,
      ShowPreviewPolicyQueryInput,
      ShowPreviewPolicyResponse,
      AppaloftClientError
    >;
  };
  previewEnvironments: {
    list: Client<
      AppaloftClientContext,
      ListPreviewEnvironmentsQueryInput,
      ListPreviewEnvironmentsResponse,
      AppaloftClientError
    >;
    show: Client<
      AppaloftClientContext,
      ShowPreviewEnvironmentQueryInput,
      ShowPreviewEnvironmentResponse,
      AppaloftClientError
    >;
    delete: Client<
      AppaloftClientContext,
      DeletePreviewEnvironmentCommandInput,
      DeletePreviewEnvironmentResponse,
      AppaloftClientError
    >;
  };
  providers: {
    list: Client<AppaloftClientContext, undefined, ListProvidersResponse, AppaloftClientError>;
  };
  plugins: {
    list: Client<AppaloftClientContext, undefined, ListPluginsResponse, AppaloftClientError>;
  };
  system: {
    doctor: Client<AppaloftClientContext, undefined, DoctorResponse, AppaloftClientError>;
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
