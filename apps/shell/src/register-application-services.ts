import {
  ArchiveEnvironmentCommandHandler,
  ArchiveEnvironmentUseCase,
  ArchiveProjectCommandHandler,
  ArchiveProjectUseCase,
  ArchiveResourceCommandHandler,
  ArchiveResourceUseCase,
  AttachResourceStorageCommandHandler,
  AttachResourceStorageUseCase,
  AutomaticRouteContextLookupService,
  BindResourceDependencyCommandHandler,
  BindResourceDependencyUseCase,
  BootstrapServerEdgeProxyOnTargetRegisteredHandler,
  BootstrapServerProxyCommandHandler,
  BootstrapServerProxyUseCase,
  type CertificateProviderSelection,
  type CertificateProviderSelectionInput,
  type CertificateProviderSelectionPolicy,
  CertificateRetryScheduler,
  CheckDomainBindingDeleteSafetyQueryHandler,
  CheckDomainBindingDeleteSafetyQueryService,
  CheckServerDeleteSafetyQueryHandler,
  CheckServerDeleteSafetyQueryService,
  CleanupPreviewCommandHandler,
  CleanupPreviewUseCase,
  CloneEnvironmentCommandHandler,
  CloneEnvironmentUseCase,
  ConfigureDefaultAccessDomainPolicyCommandHandler,
  ConfigureDefaultAccessDomainPolicyUseCase,
  ConfigureDomainBindingRouteCommandHandler,
  ConfigureDomainBindingRouteUseCase,
  ConfigurePreviewPolicyCommandHandler,
  ConfigurePreviewPolicyUseCase,
  ConfigureResourceAccessCommandHandler,
  ConfigureResourceAccessUseCase,
  ConfigureResourceAutoDeployCommandHandler,
  ConfigureResourceAutoDeployUseCase,
  ConfigureResourceHealthCommandHandler,
  ConfigureResourceHealthUseCase,
  ConfigureResourceNetworkCommandHandler,
  ConfigureResourceNetworkUseCase,
  ConfigureResourceRuntimeCommandHandler,
  ConfigureResourceRuntimeUseCase,
  ConfigureResourceSourceCommandHandler,
  ConfigureResourceSourceUseCase,
  ConfigureScheduledTaskCommandHandler,
  ConfigureScheduledTaskUseCase,
  ConfigureServerCredentialUseCase,
  ConfigureServerEdgeProxyCommandHandler,
  ConfigureServerEdgeProxyUseCase,
  ConfirmDomainBindingOwnershipUseCase,
  CreateDependencyResourceBackupCommandHandler,
  CreateDependencyResourceBackupUseCase,
  CreateDeploymentSourceEventDispatcher,
  CreateDeploymentUseCase,
  CreateDomainBindingUseCase,
  CreateEnvironmentUseCase,
  CreateProjectUseCase,
  CreateResourceUseCase,
  CreateScheduledTaskCommandHandler,
  CreateScheduledTaskUseCase,
  CreateSshCredentialUseCase,
  CreateStorageVolumeCommandHandler,
  CreateStorageVolumeUseCase,
  DbMigrateUseCase,
  DbStatusQueryService,
  DeactivateServerCommandHandler,
  DeactivateServerUseCase,
  DeleteCertificateCommandHandler,
  DeleteCertificateUseCase,
  DeleteDependencyResourceCommandHandler,
  DeleteDependencyResourceUseCase,
  DeleteDomainBindingCommandHandler,
  DeleteDomainBindingUseCase,
  DeletePreviewEnvironmentCommandHandler,
  DeleteResourceCommandHandler,
  DeleteResourceUseCase,
  DeleteScheduledTaskCommandHandler,
  DeleteScheduledTaskUseCase,
  DeleteServerCommandHandler,
  DeleteServerUseCase,
  DeleteSshCredentialCommandHandler,
  DeleteSshCredentialUseCase,
  DeleteStorageVolumeCommandHandler,
  DeleteStorageVolumeUseCase,
  type DependencyResourceBackupProviderInput,
  type DependencyResourceBackupProviderPort,
  type DependencyResourceBackupProviderResult,
  type DependencyResourceKind,
  type DependencyResourceRestoreProviderInput,
  type DependencyResourceRestoreProviderResult,
  DeploymentContextBootstrapService,
  DeploymentContextDefaultsFactory,
  DeploymentContextResolver,
  DeploymentFactory,
  DeploymentLifecycleService,
  DeploymentLogsQueryService,
  DeploymentPlanQueryHandler,
  DeploymentPlanQueryService,
  DeploymentRecoveryReadinessQueryHandler,
  DeploymentRecoveryReadinessQueryService,
  DeploymentSnapshotFactory,
  DetachResourceStorageCommandHandler,
  DetachResourceStorageUseCase,
  DiffEnvironmentsQueryService,
  DoctorQueryService,
  EnvironmentEffectivePrecedenceQueryHandler,
  EnvironmentEffectivePrecedenceQueryService,
  type ExecutionContext,
  GenericSignedSourceEventVerifier,
  ImportCertificateCommandHandler,
  ImportCertificateUseCase,
  ImportPostgresDependencyResourceCommandHandler,
  ImportPostgresDependencyResourceUseCase,
  ImportRedisDependencyResourceCommandHandler,
  ImportRedisDependencyResourceUseCase,
  ImportResourceVariablesCommandHandler,
  ImportResourceVariablesUseCase,
  IngestSourceEventCommandHandler,
  IngestSourceEventUseCase,
  InspectServerCapacityQueryHandler,
  InspectServerCapacityQueryService,
  IssueCertificateOnCertificateRequestedHandler,
  IssueOrRenewCertificateCommandHandler,
  IssueOrRenewCertificateUseCase,
  ListCertificatesQueryHandler,
  ListCertificatesQueryService,
  ListDefaultAccessDomainPoliciesQueryHandler,
  ListDefaultAccessDomainPoliciesQueryService,
  ListDependencyResourceBackupsQueryHandler,
  ListDependencyResourceBackupsQueryService,
  ListDependencyResourcesQueryHandler,
  ListDependencyResourcesQueryService,
  ListDeploymentsQueryService,
  ListDomainBindingsQueryService,
  ListEnvironmentsQueryService,
  ListGitHubRepositoriesQueryService,
  ListOperatorWorkQueryHandler,
  ListPluginsQueryService,
  ListPreviewEnvironmentsQueryHandler,
  ListPreviewEnvironmentsQueryService,
  ListProjectsQueryService,
  ListProvidersQueryService,
  ListResourceDependencyBindingsQueryHandler,
  ListResourceDependencyBindingsQueryService,
  ListResourcesQueryService,
  ListScheduledTaskRunsQueryHandler,
  ListScheduledTaskRunsQueryService,
  ListScheduledTasksQueryHandler,
  ListScheduledTasksQueryService,
  ListServersQueryService,
  ListSourceEventsQueryHandler,
  ListSourceEventsQueryService,
  ListSshCredentialsQueryService,
  ListStorageVolumesQueryHandler,
  ListStorageVolumesQueryService,
  LockEnvironmentCommandHandler,
  LockEnvironmentUseCase,
  type ManagedPostgresDeleteInput,
  type ManagedPostgresDeleteResult,
  type ManagedPostgresProviderPort,
  type ManagedPostgresRealizationInput,
  type ManagedPostgresRealizationResult,
  MarkDomainReadyOnCertificateImportedHandler,
  MarkDomainReadyOnCertificateIssuedHandler,
  MarkDomainReadyOnDeploymentFinishedHandler,
  MarkDomainReadyOnDomainBoundHandler,
  MarkDomainRouteFailedOnDeploymentFinishedHandler,
  MarkServerAppliedRouteStatusOnDeploymentFinishedHandler,
  OpenTerminalSessionUseCase,
  OperatorWorkQueryService,
  PreviewCleanupRetryScheduler,
  PreviewDeploymentProcessManager,
  PreviewEnvironmentCleanupService,
  PreviewFeedbackService,
  PreviewLifecycleService,
  PromoteEnvironmentUseCase,
  ProvisionPostgresDependencyResourceCommandHandler,
  ProvisionPostgresDependencyResourceUseCase,
  ProvisionRedisDependencyResourceCommandHandler,
  ProvisionRedisDependencyResourceUseCase,
  RedeployDeploymentCommandHandler,
  RedeployDeploymentUseCase,
  RegisterServerUseCase,
  RelinkSourceLinkCommandHandler,
  RelinkSourceLinkUseCase,
  RenameDependencyResourceCommandHandler,
  RenameDependencyResourceUseCase,
  RenameEnvironmentCommandHandler,
  RenameEnvironmentUseCase,
  RenameProjectCommandHandler,
  RenameProjectUseCase,
  RenameServerCommandHandler,
  RenameServerUseCase,
  RenameStorageVolumeCommandHandler,
  RenameStorageVolumeUseCase,
  ResourceAccessFailureEvidenceLookupQueryHandler,
  ResourceAccessFailureEvidenceLookupQueryService,
  ResourceDiagnosticSummaryQueryService,
  ResourceEffectiveConfigQueryHandler,
  ResourceEffectiveConfigQueryService,
  ResourceHealthQueryService,
  ResourceProxyConfigurationPreviewQueryService,
  ResourceRuntimeControlUseCase,
  ResourceRuntimeLogsQueryService,
  RestartResourceRuntimeCommandHandler,
  RestoreDependencyResourceBackupCommandHandler,
  RestoreDependencyResourceBackupUseCase,
  RetryCertificateCommandHandler,
  RetryCertificateUseCase,
  RetryDeploymentCommandHandler,
  RetryDeploymentUseCase,
  RetryDomainBindingVerificationCommandHandler,
  RetryDomainBindingVerificationUseCase,
  RevokeCertificateCommandHandler,
  RevokeCertificateUseCase,
  RollbackDeploymentCommandHandler,
  RollbackDeploymentUseCase,
  RotateResourceDependencyBindingSecretCommandHandler,
  RotateResourceDependencyBindingSecretUseCase,
  RotateSshCredentialCommandHandler,
  RotateSshCredentialUseCase,
  RunScheduledTaskNowCommandHandler,
  RunScheduledTaskNowUseCase,
  RuntimePlanResolutionInputBuilder,
  ScheduledTaskRunAdmissionService,
  ScheduledTaskRunLogsQueryHandler,
  ScheduledTaskRunLogsQueryService,
  ScheduledTaskRunWorker,
  ScheduledTaskScheduler,
  SetEnvironmentVariableUseCase,
  SetResourceVariableCommandHandler,
  SetResourceVariableUseCase,
  ShowCertificateQueryHandler,
  ShowCertificateQueryService,
  ShowDefaultAccessDomainPolicyQueryHandler,
  ShowDefaultAccessDomainPolicyQueryService,
  ShowDependencyResourceBackupQueryHandler,
  ShowDependencyResourceBackupQueryService,
  ShowDependencyResourceQueryHandler,
  ShowDependencyResourceQueryService,
  ShowDeploymentQueryHandler,
  ShowDeploymentQueryService,
  ShowDomainBindingQueryHandler,
  ShowDomainBindingQueryService,
  ShowEnvironmentQueryService,
  ShowOperatorWorkQueryHandler,
  ShowPreviewEnvironmentQueryHandler,
  ShowPreviewEnvironmentQueryService,
  ShowPreviewPolicyQueryHandler,
  ShowPreviewPolicyQueryService,
  ShowProjectQueryHandler,
  ShowProjectQueryService,
  ShowResourceDependencyBindingQueryHandler,
  ShowResourceDependencyBindingQueryService,
  ShowResourceQueryHandler,
  ShowResourceQueryService,
  ShowScheduledTaskQueryHandler,
  ShowScheduledTaskQueryService,
  ShowScheduledTaskRunQueryHandler,
  ShowScheduledTaskRunQueryService,
  ShowServerQueryService,
  ShowSourceEventQueryHandler,
  ShowSourceEventQueryService,
  ShowSshCredentialQueryHandler,
  ShowSshCredentialQueryService,
  ShowStorageVolumeQueryHandler,
  ShowStorageVolumeQueryService,
  StartResourceRuntimeCommandHandler,
  StopResourceRuntimeCommandHandler,
  StreamDeploymentEventsQueryHandler,
  StreamDeploymentEventsQueryService,
  TestServerConnectivityUseCase,
  tokens,
  UnbindResourceDependencyCommandHandler,
  UnbindResourceDependencyUseCase,
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
import { ShellPreviewEnvironmentCleaner } from "./preview-environment-cleaner";

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

class ShellManagedPostgresProvider implements ManagedPostgresProviderPort {
  supports(providerKey: string): boolean {
    return providerKey === "appaloft-managed-postgres";
  }

  async realize(
    context: ExecutionContext,
    input: ManagedPostgresRealizationInput,
  ): Promise<Result<ManagedPostgresRealizationResult, DomainError>> {
    void context;
    const databaseName = input.slug.replaceAll("-", "_");
    return ok({
      providerResourceHandle: `pg/${input.dependencyResourceId}`,
      endpoint: {
        host: `${input.slug}.postgres.internal`,
        port: 5432,
        databaseName,
        maskedConnection: `postgres://app:********@${input.slug}.postgres.internal:5432/${databaseName}`,
      },
      secretRef: `secret://dependency/postgres/${input.dependencyResourceId}`,
      realizedAt: input.requestedAt,
    });
  }

  async delete(
    context: ExecutionContext,
    input: ManagedPostgresDeleteInput,
  ): Promise<Result<ManagedPostgresDeleteResult, DomainError>> {
    void context;
    return ok({ deletedAt: input.requestedAt });
  }
}

class ShellDependencyResourceBackupProvider implements DependencyResourceBackupProviderPort {
  supports(providerKey: string, dependencyKind: DependencyResourceKind): boolean {
    return (
      (providerKey === "appaloft-managed-postgres" && dependencyKind === "postgres") ||
      (providerKey === "external-postgres" && dependencyKind === "postgres") ||
      (providerKey === "external-redis" && dependencyKind === "redis")
    );
  }

  async createBackup(
    context: ExecutionContext,
    input: DependencyResourceBackupProviderInput,
  ): Promise<Result<DependencyResourceBackupProviderResult, DomainError>> {
    void context;
    return ok({
      providerArtifactHandle: `backup/${input.dependencyResourceId}/${input.backupId}`,
      completedAt: input.requestedAt,
      retentionStatus: "retained",
    });
  }

  async restoreBackup(
    context: ExecutionContext,
    input: DependencyResourceRestoreProviderInput,
  ): Promise<Result<DependencyResourceRestoreProviderResult, DomainError>> {
    void context;
    return ok({ completedAt: input.requestedAt });
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
  container.registerSingleton(CheckDomainBindingDeleteSafetyQueryHandler);
  container.registerSingleton(CheckServerDeleteSafetyQueryHandler);
  container.registerSingleton(CleanupPreviewCommandHandler);
  container.registerSingleton(ConfigureDefaultAccessDomainPolicyCommandHandler);
  container.registerSingleton(ConfigurePreviewPolicyCommandHandler);
  container.registerSingleton(DeletePreviewEnvironmentCommandHandler);
  container.registerSingleton(ListPreviewEnvironmentsQueryHandler);
  container.registerSingleton(ShowPreviewEnvironmentQueryHandler);
  container.registerSingleton(ShowPreviewPolicyQueryHandler);
  container.registerSingleton(ListDefaultAccessDomainPoliciesQueryHandler);
  container.registerSingleton(ShowDefaultAccessDomainPolicyQueryHandler);
  container.registerSingleton(ConfigureServerEdgeProxyCommandHandler);
  container.registerSingleton(ConfigureDomainBindingRouteCommandHandler);
  container.registerSingleton(ConfigureResourceAccessCommandHandler);
  container.registerSingleton(ConfigureResourceAutoDeployCommandHandler);
  container.registerSingleton(IngestSourceEventCommandHandler);
  container.registerSingleton(ConfigureResourceHealthCommandHandler);
  container.registerSingleton(ConfigureResourceNetworkCommandHandler);
  container.registerSingleton(ConfigureResourceRuntimeCommandHandler);
  container.registerSingleton(ConfigureResourceSourceCommandHandler);
  container.registerSingleton(CreateScheduledTaskCommandHandler);
  container.registerSingleton(ConfigureScheduledTaskCommandHandler);
  container.registerSingleton(DeleteScheduledTaskCommandHandler);
  container.registerSingleton(RunScheduledTaskNowCommandHandler);
  container.registerSingleton(ListScheduledTasksQueryHandler);
  container.registerSingleton(ShowScheduledTaskQueryHandler);
  container.registerSingleton(ListScheduledTaskRunsQueryHandler);
  container.registerSingleton(ShowScheduledTaskRunQueryHandler);
  container.registerSingleton(ScheduledTaskRunLogsQueryHandler);
  container.registerSingleton(AttachResourceStorageCommandHandler);
  container.registerSingleton(DetachResourceStorageCommandHandler);
  container.registerSingleton(SetResourceVariableCommandHandler);
  container.registerSingleton(ImportResourceVariablesCommandHandler);
  container.registerSingleton(UnsetResourceVariableCommandHandler);
  container.registerSingleton(ArchiveResourceCommandHandler);
  container.registerSingleton(DeleteResourceCommandHandler);
  container.registerSingleton(DeactivateServerCommandHandler);
  container.registerSingleton(DeleteServerCommandHandler);
  container.registerSingleton(DeleteSshCredentialCommandHandler);
  container.registerSingleton(DeleteDomainBindingCommandHandler);
  container.registerSingleton(RotateSshCredentialCommandHandler);
  container.registerSingleton(RenameServerCommandHandler);
  container.registerSingleton(ShowResourceQueryHandler);
  container.registerSingleton(ResourceEffectiveConfigQueryHandler);
  container.registerSingleton(ResourceAccessFailureEvidenceLookupQueryHandler);
  container.registerSingleton(EnvironmentEffectivePrecedenceQueryHandler);
  container.registerSingleton(ShowDeploymentQueryHandler);
  container.registerSingleton(DeploymentPlanQueryHandler);
  container.registerSingleton(DeploymentRecoveryReadinessQueryHandler);
  container.registerSingleton(RetryDeploymentCommandHandler);
  container.registerSingleton(RedeployDeploymentCommandHandler);
  container.registerSingleton(RollbackDeploymentCommandHandler);
  container.registerSingleton(StopResourceRuntimeCommandHandler);
  container.registerSingleton(StartResourceRuntimeCommandHandler);
  container.registerSingleton(RestartResourceRuntimeCommandHandler);
  container.registerSingleton(StreamDeploymentEventsQueryHandler);
  container.registerSingleton(ImportCertificateCommandHandler);
  container.registerSingleton(IssueOrRenewCertificateCommandHandler);
  container.registerSingleton(RetryCertificateCommandHandler);
  container.registerSingleton(RevokeCertificateCommandHandler);
  container.registerSingleton(DeleteCertificateCommandHandler);
  container.registerSingleton(RetryDomainBindingVerificationCommandHandler);
  container.registerSingleton(RelinkSourceLinkCommandHandler);
  container.registerSingleton(RenameProjectCommandHandler);
  container.registerSingleton(ListCertificatesQueryHandler);
  container.registerSingleton(ShowCertificateQueryHandler);
  container.registerSingleton(ListOperatorWorkQueryHandler);
  container.registerSingleton(ShowOperatorWorkQueryHandler);
  container.registerSingleton(ShowProjectQueryHandler);
  container.registerSingleton(ShowDomainBindingQueryHandler);
  container.registerSingleton(ShowSshCredentialQueryHandler);
  container.registerSingleton(InspectServerCapacityQueryHandler);
  container.registerSingleton(CreateStorageVolumeCommandHandler);
  container.registerSingleton(BindResourceDependencyCommandHandler);
  container.registerSingleton(UnbindResourceDependencyCommandHandler);
  container.registerSingleton(RotateResourceDependencyBindingSecretCommandHandler);
  container.registerSingleton(ListResourceDependencyBindingsQueryHandler);
  container.registerSingleton(ShowResourceDependencyBindingQueryHandler);
  container.registerSingleton(ListSourceEventsQueryHandler);
  container.registerSingleton(ShowSourceEventQueryHandler);
  container.registerSingleton(ProvisionPostgresDependencyResourceCommandHandler);
  container.registerSingleton(ImportPostgresDependencyResourceCommandHandler);
  container.registerSingleton(ProvisionRedisDependencyResourceCommandHandler);
  container.registerSingleton(ImportRedisDependencyResourceCommandHandler);
  container.registerSingleton(RenameDependencyResourceCommandHandler);
  container.registerSingleton(DeleteDependencyResourceCommandHandler);
  container.registerSingleton(CreateDependencyResourceBackupCommandHandler);
  container.registerSingleton(RestoreDependencyResourceBackupCommandHandler);
  container.registerSingleton(ListDependencyResourcesQueryHandler);
  container.registerSingleton(ShowDependencyResourceQueryHandler);
  container.registerSingleton(ListDependencyResourceBackupsQueryHandler);
  container.registerSingleton(ShowDependencyResourceBackupQueryHandler);
  container.registerSingleton(RenameStorageVolumeCommandHandler);
  container.registerSingleton(DeleteStorageVolumeCommandHandler);
  container.registerSingleton(ListStorageVolumesQueryHandler);
  container.registerSingleton(ShowStorageVolumeQueryHandler);
  container.registerSingleton(
    tokens.certificateProviderSelectionPolicy,
    ShellCertificateProviderSelectionPolicy,
  );
  container.registerSingleton(tokens.managedPostgresProvider, ShellManagedPostgresProvider);
  container.registerSingleton(
    tokens.dependencyResourceBackupProvider,
    ShellDependencyResourceBackupProvider,
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
  container.registerSingleton(tokens.configurePreviewPolicyUseCase, ConfigurePreviewPolicyUseCase);
  container.registerSingleton(tokens.showPreviewPolicyQueryService, ShowPreviewPolicyQueryService);
  container.registerSingleton(
    tokens.listPreviewEnvironmentsQueryService,
    ListPreviewEnvironmentsQueryService,
  );
  container.registerSingleton(
    tokens.showPreviewEnvironmentQueryService,
    ShowPreviewEnvironmentQueryService,
  );
  container.registerSingleton(tokens.createResourceUseCase, CreateResourceUseCase);
  container.registerSingleton(tokens.archiveResourceUseCase, ArchiveResourceUseCase);
  container.registerSingleton(tokens.deleteResourceUseCase, DeleteResourceUseCase);
  container.registerSingleton(tokens.attachResourceStorageUseCase, AttachResourceStorageUseCase);
  container.registerSingleton(tokens.detachResourceStorageUseCase, DetachResourceStorageUseCase);
  container.registerSingleton(
    tokens.configureResourceSourceUseCase,
    ConfigureResourceSourceUseCase,
  );
  container.registerSingleton(
    tokens.configureResourceAccessUseCase,
    ConfigureResourceAccessUseCase,
  );
  container.registerSingleton(
    tokens.configureResourceAutoDeployUseCase,
    ConfigureResourceAutoDeployUseCase,
  );
  container.registerSingleton(tokens.ingestSourceEventUseCase, IngestSourceEventUseCase);
  container.registerSingleton(tokens.sourceEventVerificationPort, GenericSignedSourceEventVerifier);
  container.registerSingleton(
    tokens.sourceEventDeploymentDispatcher,
    CreateDeploymentSourceEventDispatcher,
  );
  container.registerSingleton(tokens.previewLifecycleService, PreviewLifecycleService);
  container.registerSingleton(tokens.previewFeedbackService, PreviewFeedbackService);
  container.registerSingleton(
    tokens.previewDeploymentProcessManager,
    PreviewDeploymentProcessManager,
  );
  container.registerSingleton(
    tokens.previewEnvironmentCleanupService,
    PreviewEnvironmentCleanupService,
  );
  container.registerSingleton(tokens.previewEnvironmentCleaner, ShellPreviewEnvironmentCleaner);
  container.registerSingleton(tokens.previewCleanupRetryScheduler, PreviewCleanupRetryScheduler);
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
  container.registerSingleton(tokens.resourceRuntimeControlUseCase, ResourceRuntimeControlUseCase);
  container.registerSingleton(
    tokens.importResourceVariablesUseCase,
    ImportResourceVariablesUseCase,
  );
  container.registerSingleton(tokens.setResourceVariableUseCase, SetResourceVariableUseCase);
  container.registerSingleton(tokens.unsetResourceVariableUseCase, UnsetResourceVariableUseCase);
  container.registerSingleton(tokens.listResourcesQueryService, ListResourcesQueryService);
  container.registerSingleton(tokens.showResourceQueryService, ShowResourceQueryService);
  container.registerSingleton(tokens.createScheduledTaskUseCase, CreateScheduledTaskUseCase);
  container.registerSingleton(tokens.configureScheduledTaskUseCase, ConfigureScheduledTaskUseCase);
  container.registerSingleton(tokens.deleteScheduledTaskUseCase, DeleteScheduledTaskUseCase);
  container.registerSingleton(tokens.runScheduledTaskNowUseCase, RunScheduledTaskNowUseCase);
  container.registerSingleton(
    tokens.scheduledTaskRunAdmissionService,
    ScheduledTaskRunAdmissionService,
  );
  container.registerSingleton(tokens.scheduledTaskRunWorker, ScheduledTaskRunWorker);
  container.registerSingleton(tokens.scheduledTaskScheduler, ScheduledTaskScheduler);
  container.registerSingleton(
    tokens.listScheduledTasksQueryService,
    ListScheduledTasksQueryService,
  );
  container.registerSingleton(tokens.showScheduledTaskQueryService, ShowScheduledTaskQueryService);
  container.registerSingleton(
    tokens.listScheduledTaskRunsQueryService,
    ListScheduledTaskRunsQueryService,
  );
  container.registerSingleton(
    tokens.showScheduledTaskRunQueryService,
    ShowScheduledTaskRunQueryService,
  );
  container.registerSingleton(
    tokens.scheduledTaskRunLogsQueryService,
    ScheduledTaskRunLogsQueryService,
  );
  container.registerSingleton(
    tokens.provisionPostgresDependencyResourceUseCase,
    ProvisionPostgresDependencyResourceUseCase,
  );
  container.registerSingleton(
    tokens.importPostgresDependencyResourceUseCase,
    ImportPostgresDependencyResourceUseCase,
  );
  container.registerSingleton(
    tokens.provisionRedisDependencyResourceUseCase,
    ProvisionRedisDependencyResourceUseCase,
  );
  container.registerSingleton(
    tokens.importRedisDependencyResourceUseCase,
    ImportRedisDependencyResourceUseCase,
  );
  container.registerSingleton(
    tokens.renameDependencyResourceUseCase,
    RenameDependencyResourceUseCase,
  );
  container.registerSingleton(
    tokens.deleteDependencyResourceUseCase,
    DeleteDependencyResourceUseCase,
  );
  container.registerSingleton(
    tokens.listDependencyResourcesQueryService,
    ListDependencyResourcesQueryService,
  );
  container.registerSingleton(
    tokens.showDependencyResourceQueryService,
    ShowDependencyResourceQueryService,
  );
  container.registerSingleton(
    tokens.createDependencyResourceBackupUseCase,
    CreateDependencyResourceBackupUseCase,
  );
  container.registerSingleton(
    tokens.restoreDependencyResourceBackupUseCase,
    RestoreDependencyResourceBackupUseCase,
  );
  container.registerSingleton(
    tokens.listDependencyResourceBackupsQueryService,
    ListDependencyResourceBackupsQueryService,
  );
  container.registerSingleton(
    tokens.showDependencyResourceBackupQueryService,
    ShowDependencyResourceBackupQueryService,
  );
  container.registerSingleton(tokens.bindResourceDependencyUseCase, BindResourceDependencyUseCase);
  container.registerSingleton(
    tokens.unbindResourceDependencyUseCase,
    UnbindResourceDependencyUseCase,
  );
  container.registerSingleton(
    tokens.rotateResourceDependencyBindingSecretUseCase,
    RotateResourceDependencyBindingSecretUseCase,
  );
  container.registerSingleton(
    tokens.listResourceDependencyBindingsQueryService,
    ListResourceDependencyBindingsQueryService,
  );
  container.registerSingleton(
    tokens.showResourceDependencyBindingQueryService,
    ShowResourceDependencyBindingQueryService,
  );
  container.registerSingleton(tokens.listSourceEventsQueryService, ListSourceEventsQueryService);
  container.registerSingleton(tokens.showSourceEventQueryService, ShowSourceEventQueryService);
  container.registerSingleton(tokens.createStorageVolumeUseCase, CreateStorageVolumeUseCase);
  container.registerSingleton(tokens.renameStorageVolumeUseCase, RenameStorageVolumeUseCase);
  container.registerSingleton(tokens.deleteStorageVolumeUseCase, DeleteStorageVolumeUseCase);
  container.registerSingleton(
    tokens.listStorageVolumesQueryService,
    ListStorageVolumesQueryService,
  );
  container.registerSingleton(tokens.showStorageVolumeQueryService, ShowStorageVolumeQueryService);
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
  container.registerSingleton(tokens.retryDeploymentUseCase, RetryDeploymentUseCase);
  container.registerSingleton(tokens.redeployDeploymentUseCase, RedeployDeploymentUseCase);
  container.registerSingleton(tokens.rollbackDeploymentUseCase, RollbackDeploymentUseCase);
  container.registerSingleton(tokens.cleanupPreviewUseCase, CleanupPreviewUseCase);
  container.registerSingleton(tokens.createDomainBindingUseCase, CreateDomainBindingUseCase);
  container.registerSingleton(
    tokens.configureDomainBindingRouteUseCase,
    ConfigureDomainBindingRouteUseCase,
  );
  container.registerSingleton(
    tokens.confirmDomainBindingOwnershipUseCase,
    ConfirmDomainBindingOwnershipUseCase,
  );
  container.registerSingleton(tokens.deleteDomainBindingUseCase, DeleteDomainBindingUseCase);
  container.registerSingleton(
    tokens.retryDomainBindingVerificationUseCase,
    RetryDomainBindingVerificationUseCase,
  );
  container.registerSingleton(
    tokens.listDomainBindingsQueryService,
    ListDomainBindingsQueryService,
  );
  container.registerSingleton(tokens.showDomainBindingQueryService, ShowDomainBindingQueryService);
  container.registerSingleton(
    tokens.checkDomainBindingDeleteSafetyQueryService,
    CheckDomainBindingDeleteSafetyQueryService,
  );
  container.registerSingleton(tokens.importCertificateUseCase, ImportCertificateUseCase);
  container.registerSingleton(
    tokens.issueOrRenewCertificateUseCase,
    IssueOrRenewCertificateUseCase,
  );
  container.registerSingleton(tokens.retryCertificateUseCase, RetryCertificateUseCase);
  container.registerSingleton(tokens.revokeCertificateUseCase, RevokeCertificateUseCase);
  container.registerSingleton(tokens.deleteCertificateUseCase, DeleteCertificateUseCase);
  container.registerSingleton(tokens.certificateRetryScheduler, CertificateRetryScheduler);
  container.registerSingleton(tokens.listCertificatesQueryService, ListCertificatesQueryService);
  container.registerSingleton(tokens.showCertificateQueryService, ShowCertificateQueryService);
  container.registerSingleton(tokens.listDeploymentsQueryService, ListDeploymentsQueryService);
  container.registerSingleton(tokens.showDeploymentQueryService, ShowDeploymentQueryService);
  container.registerSingleton(tokens.deploymentPlanQueryService, DeploymentPlanQueryService);
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
  container.registerSingleton(
    tokens.resourceAccessFailureEvidenceLookupQueryService,
    ResourceAccessFailureEvidenceLookupQueryService,
  );
  container.registerSingleton(
    tokens.automaticRouteContextLookupService,
    AutomaticRouteContextLookupService,
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
