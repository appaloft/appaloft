import {
  ArchiveEnvironmentCommandHandler,
  ArchiveEnvironmentUseCase,
  ArchiveProjectCommandHandler,
  ArchiveProjectUseCase,
  ArchiveResourceCommandHandler,
  ArchiveResourceUseCase,
  BootstrapServerEdgeProxyOnTargetRegisteredHandler,
  BootstrapServerProxyCommandHandler,
  BootstrapServerProxyUseCase,
  type CertificateProviderSelection,
  type CertificateProviderSelectionInput,
  type CertificateProviderSelectionPolicy,
  CertificateRetryScheduler,
  CheckServerDeleteSafetyQueryHandler,
  CheckServerDeleteSafetyQueryService,
  CleanupPreviewCommandHandler,
  CleanupPreviewUseCase,
  CloneEnvironmentCommandHandler,
  CloneEnvironmentUseCase,
  ConfigureDefaultAccessDomainPolicyCommandHandler,
  ConfigureDefaultAccessDomainPolicyUseCase,
  ConfigureResourceAccessCommandHandler,
  ConfigureResourceAccessUseCase,
  ConfigureResourceHealthCommandHandler,
  ConfigureResourceHealthUseCase,
  ConfigureResourceNetworkCommandHandler,
  ConfigureResourceNetworkUseCase,
  ConfigureResourceRuntimeCommandHandler,
  ConfigureResourceRuntimeUseCase,
  ConfigureResourceSourceCommandHandler,
  ConfigureResourceSourceUseCase,
  ConfigureServerCredentialUseCase,
  ConfigureServerEdgeProxyCommandHandler,
  ConfigureServerEdgeProxyUseCase,
  ConfirmDomainBindingOwnershipUseCase,
  CreateDeploymentUseCase,
  CreateDomainBindingUseCase,
  CreateEnvironmentUseCase,
  CreateProjectUseCase,
  CreateResourceUseCase,
  CreateSshCredentialUseCase,
  DbMigrateUseCase,
  DbStatusQueryService,
  DeactivateServerCommandHandler,
  DeactivateServerUseCase,
  DeleteResourceCommandHandler,
  DeleteResourceUseCase,
  DeleteServerCommandHandler,
  DeleteServerUseCase,
  DeleteSshCredentialCommandHandler,
  DeleteSshCredentialUseCase,
  DeploymentContextBootstrapService,
  DeploymentContextDefaultsFactory,
  DeploymentContextResolver,
  DeploymentFactory,
  DeploymentLifecycleService,
  DeploymentLogsQueryService,
  DeploymentRecoveryReadinessQueryHandler,
  DeploymentRecoveryReadinessQueryService,
  DeploymentSnapshotFactory,
  DiffEnvironmentsQueryService,
  DoctorQueryService,
  EnvironmentEffectivePrecedenceQueryHandler,
  EnvironmentEffectivePrecedenceQueryService,
  type ExecutionContext,
  ImportCertificateCommandHandler,
  ImportCertificateUseCase,
  InspectServerCapacityQueryHandler,
  InspectServerCapacityQueryService,
  IssueCertificateOnCertificateRequestedHandler,
  IssueOrRenewCertificateCommandHandler,
  IssueOrRenewCertificateUseCase,
  ListCertificatesQueryHandler,
  ListCertificatesQueryService,
  ListDefaultAccessDomainPoliciesQueryHandler,
  ListDefaultAccessDomainPoliciesQueryService,
  ListDeploymentsQueryService,
  ListDomainBindingsQueryService,
  ListEnvironmentsQueryService,
  ListGitHubRepositoriesQueryService,
  ListOperatorWorkQueryHandler,
  ListPluginsQueryService,
  ListProjectsQueryService,
  ListProvidersQueryService,
  ListResourcesQueryService,
  ListServersQueryService,
  ListSshCredentialsQueryService,
  LockEnvironmentCommandHandler,
  LockEnvironmentUseCase,
  MarkDomainReadyOnCertificateImportedHandler,
  MarkDomainReadyOnCertificateIssuedHandler,
  MarkDomainReadyOnDeploymentFinishedHandler,
  MarkDomainReadyOnDomainBoundHandler,
  MarkDomainRouteFailedOnDeploymentFinishedHandler,
  MarkServerAppliedRouteStatusOnDeploymentFinishedHandler,
  OpenTerminalSessionUseCase,
  OperatorWorkQueryService,
  PromoteEnvironmentUseCase,
  RegisterServerUseCase,
  RelinkSourceLinkCommandHandler,
  RelinkSourceLinkUseCase,
  RenameEnvironmentCommandHandler,
  RenameEnvironmentUseCase,
  RenameProjectCommandHandler,
  RenameProjectUseCase,
  RenameServerCommandHandler,
  RenameServerUseCase,
  ResourceDiagnosticSummaryQueryService,
  ResourceEffectiveConfigQueryHandler,
  ResourceEffectiveConfigQueryService,
  ResourceHealthQueryService,
  ResourceProxyConfigurationPreviewQueryService,
  ResourceRuntimeLogsQueryService,
  RotateSshCredentialCommandHandler,
  RotateSshCredentialUseCase,
  RuntimePlanResolutionInputBuilder,
  SetEnvironmentVariableUseCase,
  SetResourceVariableCommandHandler,
  SetResourceVariableUseCase,
  ShowDefaultAccessDomainPolicyQueryHandler,
  ShowDefaultAccessDomainPolicyQueryService,
  ShowDeploymentQueryHandler,
  ShowDeploymentQueryService,
  ShowEnvironmentQueryService,
  ShowOperatorWorkQueryHandler,
  ShowProjectQueryHandler,
  ShowProjectQueryService,
  ShowResourceQueryHandler,
  ShowResourceQueryService,
  ShowServerQueryService,
  ShowSshCredentialQueryHandler,
  ShowSshCredentialQueryService,
  StreamDeploymentEventsQueryHandler,
  StreamDeploymentEventsQueryService,
  TestServerConnectivityUseCase,
  tokens,
  UnlockEnvironmentCommandHandler,
  UnlockEnvironmentUseCase,
  UnsetEnvironmentVariableUseCase,
  UnsetResourceVariableCommandHandler,
  UnsetResourceVariableUseCase,
} from "@appaloft/application";
import { type DomainError, ok, type Result } from "@appaloft/core";
import { type DependencyContainer } from "tsyringe";
import { ShellDeploymentEventObserver } from "./deployment-event-observer";
import { PublicDnsDomainOwnershipVerifier } from "./domain-ownership-verifier";

class ShellCertificateProviderSelectionPolicy implements CertificateProviderSelectionPolicy {
  async select(
    context: ExecutionContext,
    input: CertificateProviderSelectionInput,
  ): Promise<Result<CertificateProviderSelection, DomainError>> {
    void context;
    return ok({
      providerKey: input.providerKey ?? "acme",
      challengeType: input.challengeType ?? "http-01",
    });
  }
}

export function registerApplicationServices(container: DependencyContainer): void {
  container.registerSingleton(BootstrapServerEdgeProxyOnTargetRegisteredHandler);
  container.registerSingleton(MarkDomainReadyOnDomainBoundHandler);
  container.registerSingleton(MarkDomainReadyOnCertificateImportedHandler);
  container.registerSingleton(MarkDomainReadyOnCertificateIssuedHandler);
  container.registerSingleton(MarkDomainReadyOnDeploymentFinishedHandler);
  container.registerSingleton(MarkDomainRouteFailedOnDeploymentFinishedHandler);
  container.registerSingleton(MarkServerAppliedRouteStatusOnDeploymentFinishedHandler);
  container.registerSingleton(IssueCertificateOnCertificateRequestedHandler);
  container.registerSingleton(ArchiveProjectCommandHandler);
  container.registerSingleton(ArchiveEnvironmentCommandHandler);
  container.registerSingleton(CloneEnvironmentCommandHandler);
  container.registerSingleton(RenameEnvironmentCommandHandler);
  container.registerSingleton(LockEnvironmentCommandHandler);
  container.registerSingleton(UnlockEnvironmentCommandHandler);
  container.registerSingleton(BootstrapServerProxyCommandHandler);
  container.registerSingleton(CheckServerDeleteSafetyQueryHandler);
  container.registerSingleton(CleanupPreviewCommandHandler);
  container.registerSingleton(ConfigureDefaultAccessDomainPolicyCommandHandler);
  container.registerSingleton(ListDefaultAccessDomainPoliciesQueryHandler);
  container.registerSingleton(ShowDefaultAccessDomainPolicyQueryHandler);
  container.registerSingleton(ConfigureServerEdgeProxyCommandHandler);
  container.registerSingleton(ConfigureResourceAccessCommandHandler);
  container.registerSingleton(ConfigureResourceHealthCommandHandler);
  container.registerSingleton(ConfigureResourceNetworkCommandHandler);
  container.registerSingleton(ConfigureResourceRuntimeCommandHandler);
  container.registerSingleton(ConfigureResourceSourceCommandHandler);
  container.registerSingleton(SetResourceVariableCommandHandler);
  container.registerSingleton(UnsetResourceVariableCommandHandler);
  container.registerSingleton(ArchiveResourceCommandHandler);
  container.registerSingleton(DeleteResourceCommandHandler);
  container.registerSingleton(DeactivateServerCommandHandler);
  container.registerSingleton(DeleteServerCommandHandler);
  container.registerSingleton(DeleteSshCredentialCommandHandler);
  container.registerSingleton(RotateSshCredentialCommandHandler);
  container.registerSingleton(RenameServerCommandHandler);
  container.registerSingleton(ShowResourceQueryHandler);
  container.registerSingleton(ResourceEffectiveConfigQueryHandler);
  container.registerSingleton(EnvironmentEffectivePrecedenceQueryHandler);
  container.registerSingleton(ShowDeploymentQueryHandler);
  container.registerSingleton(DeploymentRecoveryReadinessQueryHandler);
  container.registerSingleton(StreamDeploymentEventsQueryHandler);
  container.registerSingleton(ImportCertificateCommandHandler);
  container.registerSingleton(IssueOrRenewCertificateCommandHandler);
  container.registerSingleton(RelinkSourceLinkCommandHandler);
  container.registerSingleton(RenameProjectCommandHandler);
  container.registerSingleton(ListCertificatesQueryHandler);
  container.registerSingleton(ListOperatorWorkQueryHandler);
  container.registerSingleton(ShowOperatorWorkQueryHandler);
  container.registerSingleton(ShowProjectQueryHandler);
  container.registerSingleton(ShowSshCredentialQueryHandler);
  container.registerSingleton(InspectServerCapacityQueryHandler);
  container.registerSingleton(
    tokens.certificateProviderSelectionPolicy,
    ShellCertificateProviderSelectionPolicy,
  );
  container.registerSingleton(tokens.domainOwnershipVerifier, PublicDnsDomainOwnershipVerifier);
  container.registerSingleton(tokens.archiveProjectUseCase, ArchiveProjectUseCase);
  container.registerSingleton(tokens.createProjectUseCase, CreateProjectUseCase);
  container.registerSingleton(tokens.listProjectsQueryService, ListProjectsQueryService);
  container.registerSingleton(tokens.renameProjectUseCase, RenameProjectUseCase);
  container.registerSingleton(tokens.showProjectQueryService, ShowProjectQueryService);
  container.registerSingleton(
    tokens.configureDefaultAccessDomainPolicyUseCase,
    ConfigureDefaultAccessDomainPolicyUseCase,
  );
  container.registerSingleton(
    tokens.listDefaultAccessDomainPoliciesQueryService,
    ListDefaultAccessDomainPoliciesQueryService,
  );
  container.registerSingleton(
    tokens.showDefaultAccessDomainPolicyQueryService,
    ShowDefaultAccessDomainPolicyQueryService,
  );
  container.registerSingleton(tokens.createResourceUseCase, CreateResourceUseCase);
  container.registerSingleton(tokens.archiveResourceUseCase, ArchiveResourceUseCase);
  container.registerSingleton(tokens.deleteResourceUseCase, DeleteResourceUseCase);
  container.registerSingleton(
    tokens.configureResourceSourceUseCase,
    ConfigureResourceSourceUseCase,
  );
  container.registerSingleton(
    tokens.configureResourceAccessUseCase,
    ConfigureResourceAccessUseCase,
  );
  container.registerSingleton(
    tokens.configureResourceHealthUseCase,
    ConfigureResourceHealthUseCase,
  );
  container.registerSingleton(
    tokens.configureResourceNetworkUseCase,
    ConfigureResourceNetworkUseCase,
  );
  container.registerSingleton(
    tokens.configureResourceRuntimeUseCase,
    ConfigureResourceRuntimeUseCase,
  );
  container.registerSingleton(tokens.setResourceVariableUseCase, SetResourceVariableUseCase);
  container.registerSingleton(tokens.unsetResourceVariableUseCase, UnsetResourceVariableUseCase);
  container.registerSingleton(tokens.listResourcesQueryService, ListResourcesQueryService);
  container.registerSingleton(tokens.showResourceQueryService, ShowResourceQueryService);
  container.registerSingleton(
    tokens.resourceEffectiveConfigQueryService,
    ResourceEffectiveConfigQueryService,
  );
  container.registerSingleton(tokens.registerServerUseCase, RegisterServerUseCase);
  container.registerSingleton(
    tokens.configureServerCredentialUseCase,
    ConfigureServerCredentialUseCase,
  );
  container.registerSingleton(tokens.createSshCredentialUseCase, CreateSshCredentialUseCase);
  container.registerSingleton(
    tokens.listSshCredentialsQueryService,
    ListSshCredentialsQueryService,
  );
  container.registerSingleton(tokens.showSshCredentialQueryService, ShowSshCredentialQueryService);
  container.registerSingleton(tokens.listServersQueryService, ListServersQueryService);
  container.registerSingleton(tokens.showServerQueryService, ShowServerQueryService);
  container.registerSingleton(
    tokens.inspectServerCapacityQueryService,
    InspectServerCapacityQueryService,
  );
  container.registerSingleton(tokens.renameServerUseCase, RenameServerUseCase);
  container.registerSingleton(
    tokens.configureServerEdgeProxyUseCase,
    ConfigureServerEdgeProxyUseCase,
  );
  container.registerSingleton(tokens.deactivateServerUseCase, DeactivateServerUseCase);
  container.registerSingleton(tokens.deleteServerUseCase, DeleteServerUseCase);
  container.registerSingleton(tokens.deleteSshCredentialUseCase, DeleteSshCredentialUseCase);
  container.registerSingleton(tokens.rotateSshCredentialUseCase, RotateSshCredentialUseCase);
  container.registerSingleton(
    tokens.checkServerDeleteSafetyQueryService,
    CheckServerDeleteSafetyQueryService,
  );
  container.registerSingleton(tokens.testServerConnectivityUseCase, TestServerConnectivityUseCase);
  container.registerSingleton(tokens.bootstrapServerProxyUseCase, BootstrapServerProxyUseCase);
  container.registerSingleton(tokens.archiveEnvironmentUseCase, ArchiveEnvironmentUseCase);
  container.registerSingleton(tokens.cloneEnvironmentUseCase, CloneEnvironmentUseCase);
  container.registerSingleton(tokens.renameEnvironmentUseCase, RenameEnvironmentUseCase);
  container.registerSingleton(tokens.lockEnvironmentUseCase, LockEnvironmentUseCase);
  container.registerSingleton(tokens.unlockEnvironmentUseCase, UnlockEnvironmentUseCase);
  container.registerSingleton(tokens.createEnvironmentUseCase, CreateEnvironmentUseCase);
  container.registerSingleton(tokens.listEnvironmentsQueryService, ListEnvironmentsQueryService);
  container.registerSingleton(tokens.showEnvironmentQueryService, ShowEnvironmentQueryService);
  container.registerSingleton(
    tokens.environmentEffectivePrecedenceQueryService,
    EnvironmentEffectivePrecedenceQueryService,
  );
  container.registerSingleton(tokens.setEnvironmentVariableUseCase, SetEnvironmentVariableUseCase);
  container.registerSingleton(
    tokens.unsetEnvironmentVariableUseCase,
    UnsetEnvironmentVariableUseCase,
  );
  container.registerSingleton(tokens.diffEnvironmentsQueryService, DiffEnvironmentsQueryService);
  container.registerSingleton(tokens.promoteEnvironmentUseCase, PromoteEnvironmentUseCase);
  container.registerSingleton(
    tokens.deploymentContextDefaultsFactory,
    DeploymentContextDefaultsFactory,
  );
  container.registerSingleton(
    tokens.deploymentContextBootstrapService,
    DeploymentContextBootstrapService,
  );
  container.registerSingleton(tokens.deploymentSnapshotFactory, DeploymentSnapshotFactory);
  container.registerSingleton(
    tokens.runtimePlanResolutionInputBuilder,
    RuntimePlanResolutionInputBuilder,
  );
  container.registerSingleton(tokens.deploymentContextResolver, DeploymentContextResolver);
  container.registerSingleton(tokens.deploymentFactory, DeploymentFactory);
  container.registerSingleton(tokens.deploymentLifecycleService, DeploymentLifecycleService);
  container.registerSingleton(tokens.createDeploymentUseCase, CreateDeploymentUseCase);
  container.registerSingleton(tokens.cleanupPreviewUseCase, CleanupPreviewUseCase);
  container.registerSingleton(tokens.createDomainBindingUseCase, CreateDomainBindingUseCase);
  container.registerSingleton(
    tokens.confirmDomainBindingOwnershipUseCase,
    ConfirmDomainBindingOwnershipUseCase,
  );
  container.registerSingleton(
    tokens.listDomainBindingsQueryService,
    ListDomainBindingsQueryService,
  );
  container.registerSingleton(tokens.importCertificateUseCase, ImportCertificateUseCase);
  container.registerSingleton(
    tokens.issueOrRenewCertificateUseCase,
    IssueOrRenewCertificateUseCase,
  );
  container.registerSingleton(tokens.certificateRetryScheduler, CertificateRetryScheduler);
  container.registerSingleton(tokens.listCertificatesQueryService, ListCertificatesQueryService);
  container.registerSingleton(tokens.listDeploymentsQueryService, ListDeploymentsQueryService);
  container.registerSingleton(tokens.showDeploymentQueryService, ShowDeploymentQueryService);
  container.registerSingleton(
    tokens.deploymentRecoveryReadinessQueryService,
    DeploymentRecoveryReadinessQueryService,
  );
  container.registerSingleton(tokens.operatorWorkQueryService, OperatorWorkQueryService);
  container.registerSingleton(
    tokens.streamDeploymentEventsQueryService,
    StreamDeploymentEventsQueryService,
  );
  container.registerSingleton(tokens.logsQueryService, DeploymentLogsQueryService);
  container.registerSingleton(tokens.deploymentEventObserver, ShellDeploymentEventObserver);
  container.registerSingleton(
    tokens.resourceDiagnosticSummaryQueryService,
    ResourceDiagnosticSummaryQueryService,
  );
  container.registerSingleton(tokens.resourceHealthQueryService, ResourceHealthQueryService);
  container.registerSingleton(
    tokens.resourceRuntimeLogsQueryService,
    ResourceRuntimeLogsQueryService,
  );
  container.registerSingleton(tokens.openTerminalSessionUseCase, OpenTerminalSessionUseCase);
  container.registerSingleton(tokens.relinkSourceLinkUseCase, RelinkSourceLinkUseCase);
  container.registerSingleton(
    tokens.resourceProxyConfigurationPreviewQueryService,
    ResourceProxyConfigurationPreviewQueryService,
  );
  container.registerSingleton(tokens.providersQueryService, ListProvidersQueryService);
  container.registerSingleton(tokens.pluginsQueryService, ListPluginsQueryService);
  container.registerSingleton(
    tokens.listGitHubRepositoriesQueryService,
    ListGitHubRepositoriesQueryService,
  );
  container.registerSingleton(tokens.doctorQueryService, DoctorQueryService);
  container.registerSingleton(tokens.dbStatusQueryService, DbStatusQueryService);
  container.registerSingleton(tokens.dbMigrateUseCase, DbMigrateUseCase);
}
