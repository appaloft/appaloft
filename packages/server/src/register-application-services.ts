import { Buffer } from "node:buffer";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  ApplyActionPreviewRouteCommandHandler,
  ApplyActionPreviewRouteUseCase,
  ApplyInstanceUpgradeCommandHandler,
  ApplyInstanceUpgradeUseCase,
  ArchiveEnvironmentCommandHandler,
  ArchiveEnvironmentUseCase,
  ArchiveProjectCommandHandler,
  ArchiveProjectUseCase,
  ArchiveResourceCommandHandler,
  ArchiveResourceRuntimeLogsCommandHandler,
  ArchiveResourceRuntimeLogsUseCase,
  ArchiveResourceUseCase,
  AttachResourceStorageCommandHandler,
  AttachResourceStorageUseCase,
  AutomaticRouteContextLookupService,
  BindResourceDependencyCommandHandler,
  BindResourceDependencyUseCase,
  BootstrapFirstAdminCommandHandler,
  BootstrapFirstAdminUseCase,
  BootstrapServerEdgeProxyOnTargetRegisteredHandler,
  BootstrapServerProxyCommandHandler,
  BootstrapServerProxyUseCase,
  CancelOperatorWorkCommandHandler,
  CancelOperatorWorkUseCase,
  type CertificateProviderSelection,
  type CertificateProviderSelectionInput,
  type CertificateProviderSelectionPolicy,
  CertificateRetryScheduler,
  ChangeOrganizationMemberRoleCommandHandler,
  ChangeOrganizationMemberRoleUseCase,
  CheckDomainBindingDeleteSafetyQueryHandler,
  CheckDomainBindingDeleteSafetyQueryService,
  CheckInstanceUpgradeQueryHandler,
  CheckInstanceUpgradeQueryService,
  CheckServerDeleteSafetyQueryHandler,
  CheckServerDeleteSafetyQueryService,
  CleanupPreviewCommandHandler,
  CleanupPreviewUseCase,
  CleanupStorageVolumeRuntimeCommandHandler,
  CleanupStorageVolumeRuntimeUseCase,
  CloneEnvironmentCommandHandler,
  CloneEnvironmentUseCase,
  CloseTerminalSessionCommandHandler,
  ConfigureAuditEventLegalHoldCommandHandler,
  ConfigureAuditEventLegalHoldUseCase,
  ConfigureDefaultAccessDomainPolicyCommandHandler,
  ConfigureDefaultAccessDomainPolicyUseCase,
  ConfigureDependencyResourceBackupPolicyCommandHandler,
  ConfigureDependencyResourceBackupPolicyUseCase,
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
  ConfigureRetentionDefaultsCommandHandler,
  ConfigureRetentionDefaultsUseCase,
  ConfigureRuntimeMonitoringThresholdsCommandHandler,
  ConfigureRuntimeMonitoringThresholdsUseCase,
  ConfigureScheduledRuntimePrunePolicyCommandHandler,
  ConfigureScheduledRuntimePrunePolicyUseCase,
  ConfigureScheduledTaskCommandHandler,
  ConfigureScheduledTaskUseCase,
  ConfigureServerCredentialUseCase,
  ConfigureServerEdgeProxyCommandHandler,
  ConfigureServerEdgeProxyUseCase,
  ConfirmActionPreviewRouteCommandHandler,
  ConfirmActionPreviewRouteUseCase,
  ConfirmDomainBindingOwnershipUseCase,
  CreateActionSourceLinkDeploymentCommandHandler,
  CreateActionSourceLinkDeploymentUseCase,
  CreateAuditEventArchiveCommandHandler,
  CreateAuditEventArchiveUseCase,
  CreateDependencyResourceBackupCommandHandler,
  CreateDependencyResourceBackupUseCase,
  CreateDeploymentSourceEventDispatcher,
  CreateDeploymentUseCase,
  CreateDeployTokenCommandHandler,
  CreateDeployTokenUseCase,
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
  DeadLetterOperatorWorkCommandHandler,
  DeadLetterOperatorWorkUseCase,
  DefaultOperationCapabilityPort,
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
  type DependencyResourceSecretStore,
  DeploymentContextBootstrapService,
  DeploymentContextDefaultsFactory,
  DeploymentContextResolver,
  DeploymentFactory,
  DeploymentLifecycleService,
  DeploymentLogsQueryService,
  DeploymentPlanQueryHandler,
  DeploymentPlanQueryService,
  type DeploymentReadModel,
  DeploymentRecoveryReadinessQueryHandler,
  DeploymentRecoveryReadinessQueryService,
  DeploymentSnapshotFactory,
  DetachResourceStorageCommandHandler,
  DetachResourceStorageUseCase,
  DiffEnvironmentsQueryService,
  DoctorQueryService,
  type DomainBindingReadModel,
  EnvironmentEffectivePrecedenceQueryHandler,
  EnvironmentEffectivePrecedenceQueryService,
  type ExecutionContext,
  ExpireTerminalSessionsCommandHandler,
  ExportAuditEventsQueryHandler,
  ExportAuditEventsQueryService,
  ExportGlobalAuditEventsQueryHandler,
  ExportGlobalAuditEventsQueryService,
  GenericSignedSourceEventVerifier,
  GetAuthBootstrapStatusQueryHandler,
  GetAuthBootstrapStatusQueryService,
  GetCurrentOrganizationContextQueryHandler,
  GetCurrentOrganizationContextQueryService,
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
  InspectRuntimeUsageQueryHandler,
  InspectServerCapacityQueryHandler,
  InspectServerCapacityQueryService,
  InviteOrganizationMemberCommandHandler,
  InviteOrganizationMemberUseCase,
  IssueCertificateOnCertificateRequestedHandler,
  IssueOrRenewCertificateCommandHandler,
  IssueOrRenewCertificateUseCase,
  ListAuditEventArchivesQueryHandler,
  ListAuditEventArchivesQueryService,
  ListAuditEventLegalHoldsQueryHandler,
  ListAuditEventLegalHoldsQueryService,
  ListAuditEventsQueryHandler,
  ListAuditEventsQueryService,
  ListCertificatesQueryHandler,
  ListCertificatesQueryService,
  ListDefaultAccessDomainPoliciesQueryHandler,
  ListDefaultAccessDomainPoliciesQueryService,
  ListDependencyResourceBackupPoliciesQueryHandler,
  ListDependencyResourceBackupPoliciesQueryService,
  ListDependencyResourceBackupsQueryHandler,
  ListDependencyResourceBackupsQueryService,
  ListDependencyResourcesQueryHandler,
  ListDependencyResourcesQueryService,
  ListDeploymentsQueryService,
  ListDeployTokensQueryHandler,
  ListDeployTokensQueryService,
  ListDomainBindingsQueryService,
  ListEnvironmentsQueryService,
  ListGitHubRepositoriesQueryService,
  ListOperatorWorkQueryHandler,
  ListOrganizationInvitationsQueryHandler,
  ListOrganizationInvitationsQueryService,
  ListOrganizationMembersQueryHandler,
  ListOrganizationMembersQueryService,
  ListPluginsQueryService,
  ListPreviewEnvironmentsQueryHandler,
  ListPreviewEnvironmentsQueryService,
  ListProjectsQueryService,
  ListProvidersQueryService,
  ListResourceDependencyBindingsQueryHandler,
  ListResourceDependencyBindingsQueryService,
  ListResourceRuntimeLogArchivesQueryHandler,
  ListResourceRuntimeLogArchivesQueryService,
  ListResourcesQueryService,
  ListRetentionDefaultsQueryHandler,
  ListRetentionDefaultsQueryService,
  ListRuntimeMonitoringSamplesQueryHandler,
  ListScheduledRuntimePrunePoliciesQueryHandler,
  ListScheduledRuntimePrunePoliciesQueryService,
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
  ListTerminalSessionsQueryHandler,
  LockEnvironmentCommandHandler,
  LockEnvironmentUseCase,
  type ManagedPostgresDeleteInput,
  type ManagedPostgresDeleteResult,
  type ManagedPostgresProviderPort,
  type ManagedPostgresRealizationInput,
  type ManagedPostgresRealizationResult,
  type ManagedRedisDeleteInput,
  type ManagedRedisDeleteResult,
  type ManagedRedisProviderPort,
  type ManagedRedisRealizationInput,
  type ManagedRedisRealizationResult,
  MarkDomainReadyOnCertificateImportedHandler,
  MarkDomainReadyOnCertificateIssuedHandler,
  MarkDomainReadyOnDeploymentFinishedHandler,
  MarkDomainReadyOnDomainBoundHandler,
  MarkDomainRouteFailedOnDeploymentFinishedHandler,
  MarkOperatorWorkRecoveredCommandHandler,
  MarkOperatorWorkRecoveredUseCase,
  MarkServerAppliedRouteStatusOnDeploymentFinishedHandler,
  OpenTerminalSessionUseCase,
  OperatorWorkQueryService,
  PreviewCleanupRetryScheduler,
  PreviewDeploymentProcessManager,
  PreviewEnvironmentCleanupService,
  PreviewExpiryCleanupScheduler,
  PreviewFeedbackService,
  PreviewLifecycleService,
  PreviewPullRequestEventIngestService,
  PromoteEnvironmentUseCase,
  ProvisionPostgresDependencyResourceCommandHandler,
  ProvisionPostgresDependencyResourceUseCase,
  ProvisionRedisDependencyResourceCommandHandler,
  ProvisionRedisDependencyResourceUseCase,
  PruneAuditEventArchivesCommandHandler,
  PruneAuditEventArchivesUseCase,
  PruneAuditEventsCommandHandler,
  PruneAuditEventsUseCase,
  PruneDeploymentLogsCommandHandler,
  PruneDeploymentLogsUseCase,
  PruneDomainEventsCommandHandler,
  PruneDomainEventsUseCase,
  PruneOperatorWorkCommandHandler,
  PruneOperatorWorkUseCase,
  PruneProviderJobLogsCommandHandler,
  PruneProviderJobLogsUseCase,
  PruneResourceRuntimeLogArchivesCommandHandler,
  PruneResourceRuntimeLogArchivesUseCase,
  PruneServerCapacityCommandHandler,
  PruneServerCapacityUseCase,
  QueryCapabilitiesQueryHandler,
  QueryCapabilitiesQueryService,
  RedeployDeploymentCommandHandler,
  RedeployDeploymentUseCase,
  RegisterServerUseCase,
  ReleaseAuditEventLegalHoldCommandHandler,
  ReleaseAuditEventLegalHoldUseCase,
  RelinkSourceLinkCommandHandler,
  RelinkSourceLinkUseCase,
  RemoveOrganizationMemberCommandHandler,
  RemoveOrganizationMemberUseCase,
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
  ResolveActionServerConfigDeploymentTargetCommandHandler,
  ResolveActionServerConfigDeploymentTargetUseCase,
  ResolveGenericSignedSourceEventSecretQueryHandler,
  ResolveGenericSignedSourceEventSecretQueryService,
  ResolvePreviewPullRequestContextQueryHandler,
  ResolvePreviewPullRequestContextQueryService,
  ResourceAccessFailureEvidenceLookupQueryHandler,
  ResourceAccessFailureEvidenceLookupQueryService,
  ResourceDiagnosticSummaryQueryService,
  ResourceEffectiveConfigQueryHandler,
  ResourceEffectiveConfigQueryService,
  ResourceHealthQueryService,
  ResourceProxyConfigurationPreviewQueryService,
  type ResourceReadModel,
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
  RetryOperatorWorkCommandHandler,
  RetryOperatorWorkUseCase,
  RevokeCertificateCommandHandler,
  RevokeCertificateUseCase,
  RevokeDeployTokenCommandHandler,
  RevokeDeployTokenUseCase,
  RollbackDeploymentCommandHandler,
  RollbackDeploymentUseCase,
  RotateDeployTokenCommandHandler,
  RotateDeployTokenUseCase,
  RotateResourceDependencyBindingSecretCommandHandler,
  RotateResourceDependencyBindingSecretUseCase,
  RotateSshCredentialCommandHandler,
  RotateSshCredentialUseCase,
  RunScheduledTaskNowCommandHandler,
  RunScheduledTaskNowUseCase,
  RuntimeMonitoringCollectorService,
  RuntimeMonitoringRollupQueryHandler,
  RuntimeMonitoringRollupQueryService,
  RuntimeMonitoringSamplesQueryService,
  RuntimePlanResolutionInputBuilder,
  RuntimeUsageInspectionQueryService,
  ScheduledDependencyBackupService,
  ScheduledHistoryRetentionService,
  ScheduledRuntimePrunePolicyResolver,
  ScheduledRuntimePruneService,
  ScheduledTaskRunAdmissionService,
  ScheduledTaskRunLogsQueryHandler,
  ScheduledTaskRunLogsQueryService,
  ScheduledTaskRunWorker,
  ScheduledTaskScheduler,
  SetEnvironmentVariableUseCase,
  SetResourceVariableCommandHandler,
  SetResourceVariableUseCase,
  ShowAuditEventArchiveQueryHandler,
  ShowAuditEventArchiveQueryService,
  ShowAuditEventLegalHoldQueryHandler,
  ShowAuditEventLegalHoldQueryService,
  ShowAuditEventQueryHandler,
  ShowAuditEventQueryService,
  ShowCertificateQueryHandler,
  ShowCertificateQueryService,
  ShowDefaultAccessDomainPolicyQueryHandler,
  ShowDefaultAccessDomainPolicyQueryService,
  ShowDependencyResourceBackupPolicyQueryHandler,
  ShowDependencyResourceBackupPolicyQueryService,
  ShowDependencyResourceBackupQueryHandler,
  ShowDependencyResourceBackupQueryService,
  ShowDependencyResourceQueryHandler,
  ShowDependencyResourceQueryService,
  ShowDeploymentQueryHandler,
  ShowDeploymentQueryService,
  ShowDeployTokenQueryHandler,
  ShowDeployTokenQueryService,
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
  ShowResourceRuntimeLogArchiveQueryHandler,
  ShowResourceRuntimeLogArchiveQueryService,
  ShowRetentionDefaultQueryHandler,
  ShowRetentionDefaultQueryService,
  ShowRuntimeMonitoringThresholdsQueryHandler,
  ShowRuntimeMonitoringThresholdsQueryService,
  ShowScheduledRuntimePrunePolicyQueryHandler,
  ShowScheduledRuntimePrunePolicyQueryService,
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
  ShowTerminalSessionQueryHandler,
  StartResourceRuntimeCommandHandler,
  StopResourceRuntimeCommandHandler,
  StreamDeploymentEventsQueryHandler,
  StreamDeploymentEventsQueryService,
  SwitchCurrentOrganizationCommandHandler,
  SwitchCurrentOrganizationUseCase,
  TerminalSessionLifecycleService,
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
import { type DomainError, domainError, err, ok, type Result } from "@appaloft/core";
import { type DependencyContainer, instanceCachingFactory } from "tsyringe";
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

interface ShellManagedDependencyResourceArtifact {
  schemaVersion: "appaloft.dependency-resource-realization/v1";
  dependencyResourceId: string;
  dependencyKind: DependencyResourceKind;
  providerKey: string;
  providerResourceHandle: string;
  endpoint: {
    host: string;
    port?: number;
    databaseName?: string;
    maskedConnection: string;
  };
  secretRef?: string;
  realizedAt: string;
  deletedAt?: string;
}

function shellManagedResourceArtifactDir(
  dataDir: string,
  dependencyKind: DependencyResourceKind,
): string {
  return join(dataDir, "dependency-resource-realizations", dependencyKind);
}

function shellManagedResourceArtifactPath(
  dataDir: string,
  dependencyKind: DependencyResourceKind,
  dependencyResourceId: string,
): string {
  return join(
    shellManagedResourceArtifactDir(dataDir, dependencyKind),
    `${shellBackupArtifactSegment(dependencyResourceId)}.json`,
  );
}

function shellManagedProviderError(
  message: string,
  input: {
    dependencyResourceId: string;
    providerKey: string;
    dependencyKind: DependencyResourceKind;
  },
  cause: unknown,
): DomainError {
  return domainError.provider(
    message,
    {
      phase: "dependency-resource-realization-artifact",
      dependencyResourceId: input.dependencyResourceId,
      dependencyKind: input.dependencyKind,
      providerKey: input.providerKey,
      cause: cause instanceof Error ? cause.name : "unknown",
    },
    true,
  );
}

export class ShellManagedPostgresProvider implements ManagedPostgresProviderPort {
  constructor(private readonly dataDir = ".appaloft/data") {}

  supports(providerKey: string): boolean {
    return providerKey === "appaloft-managed-postgres";
  }

  async realize(
    context: ExecutionContext,
    input: ManagedPostgresRealizationInput,
  ): Promise<Result<ManagedPostgresRealizationResult, DomainError>> {
    void context;
    const databaseName = input.slug.replaceAll("-", "_");
    const result: ManagedPostgresRealizationResult = {
      providerResourceHandle: `pg/${input.dependencyResourceId}`,
      endpoint: {
        host: `${input.slug}.postgres.internal`,
        port: 5432,
        databaseName,
        maskedConnection: `postgres://app:********@${input.slug}.postgres.internal:5432/${databaseName}`,
      },
      secretRef: `secret://dependency/postgres/${input.dependencyResourceId}`,
      realizedAt: input.requestedAt,
    };
    const artifact: ShellManagedDependencyResourceArtifact = {
      schemaVersion: "appaloft.dependency-resource-realization/v1",
      dependencyResourceId: input.dependencyResourceId,
      dependencyKind: "postgres",
      providerKey: input.providerKey,
      ...result,
    };

    try {
      await mkdir(shellManagedResourceArtifactDir(this.dataDir, "postgres"), { recursive: true });
      await Bun.write(
        shellManagedResourceArtifactPath(this.dataDir, "postgres", input.dependencyResourceId),
        `${JSON.stringify(artifact, null, 2)}\n`,
      );
    } catch (cause) {
      return err(
        shellManagedProviderError(
          "Managed Postgres artifact could not be written",
          {
            dependencyResourceId: input.dependencyResourceId,
            dependencyKind: "postgres",
            providerKey: input.providerKey,
          },
          cause,
        ),
      );
    }

    return ok(result);
  }

  async delete(
    context: ExecutionContext,
    input: ManagedPostgresDeleteInput,
  ): Promise<Result<ManagedPostgresDeleteResult, DomainError>> {
    void context;
    const artifact = await this.readArtifact(input.dependencyResourceId, input.providerKey);
    if (artifact.isErr()) {
      return err(artifact.error);
    }
    if (
      artifact.value.providerKey !== input.providerKey ||
      artifact.value.providerResourceHandle !== input.providerResourceHandle
    ) {
      return err(
        shellManagedProviderError(
          "Managed Postgres artifact does not match delete request",
          {
            dependencyResourceId: input.dependencyResourceId,
            dependencyKind: "postgres",
            providerKey: input.providerKey,
          },
          new Error("artifact_mismatch"),
        ),
      );
    }

    try {
      await Bun.write(
        shellManagedResourceArtifactPath(this.dataDir, "postgres", input.dependencyResourceId),
        `${JSON.stringify({ ...artifact.value, deletedAt: input.requestedAt }, null, 2)}\n`,
      );
    } catch (cause) {
      return err(
        shellManagedProviderError(
          "Managed Postgres delete artifact could not be written",
          {
            dependencyResourceId: input.dependencyResourceId,
            dependencyKind: "postgres",
            providerKey: input.providerKey,
          },
          cause,
        ),
      );
    }

    return ok({ deletedAt: input.requestedAt });
  }

  private async readArtifact(
    dependencyResourceId: string,
    providerKey: string,
  ): Promise<Result<ShellManagedDependencyResourceArtifact, DomainError>> {
    try {
      const raw = await readFile(
        shellManagedResourceArtifactPath(this.dataDir, "postgres", dependencyResourceId),
        "utf8",
      );
      const parsed = JSON.parse(raw) as ShellManagedDependencyResourceArtifact;
      if (parsed.schemaVersion !== "appaloft.dependency-resource-realization/v1") {
        return err(
          shellManagedProviderError(
            "Managed Postgres artifact has an unsupported schema",
            {
              dependencyResourceId,
              dependencyKind: "postgres",
              providerKey,
            },
            new Error("unsupported_schema"),
          ),
        );
      }
      return ok(parsed);
    } catch (cause) {
      return err(
        shellManagedProviderError(
          "Managed Postgres artifact could not be read",
          {
            dependencyResourceId,
            dependencyKind: "postgres",
            providerKey,
          },
          cause,
        ),
      );
    }
  }
}

export class ShellManagedRedisProvider implements ManagedRedisProviderPort {
  constructor(private readonly dataDir = ".appaloft/data") {}

  supports(providerKey: string): boolean {
    return providerKey === "appaloft-managed-redis";
  }

  async realize(
    context: ExecutionContext,
    input: ManagedRedisRealizationInput,
  ): Promise<Result<ManagedRedisRealizationResult, DomainError>> {
    void context;
    const result: ManagedRedisRealizationResult = {
      providerResourceHandle: `redis/${input.dependencyResourceId}`,
      endpoint: {
        host: `${input.slug}.redis.internal`,
        port: 6379,
        maskedConnection: `redis://:********@${input.slug}.redis.internal:6379/0`,
      },
      secretRef: `secret://dependency/redis/${input.dependencyResourceId}`,
      realizedAt: input.requestedAt,
    };
    const artifact: ShellManagedDependencyResourceArtifact = {
      schemaVersion: "appaloft.dependency-resource-realization/v1",
      dependencyResourceId: input.dependencyResourceId,
      dependencyKind: "redis",
      providerKey: input.providerKey,
      ...result,
    };

    try {
      await mkdir(shellManagedResourceArtifactDir(this.dataDir, "redis"), { recursive: true });
      await Bun.write(
        shellManagedResourceArtifactPath(this.dataDir, "redis", input.dependencyResourceId),
        `${JSON.stringify(artifact, null, 2)}\n`,
      );
    } catch (cause) {
      return err(
        shellManagedProviderError(
          "Managed Redis artifact could not be written",
          {
            dependencyResourceId: input.dependencyResourceId,
            dependencyKind: "redis",
            providerKey: input.providerKey,
          },
          cause,
        ),
      );
    }

    return ok(result);
  }

  async delete(
    context: ExecutionContext,
    input: ManagedRedisDeleteInput,
  ): Promise<Result<ManagedRedisDeleteResult, DomainError>> {
    void context;
    const artifact = await this.readArtifact(input.dependencyResourceId, input.providerKey);
    if (artifact.isErr()) {
      return err(artifact.error);
    }
    if (
      artifact.value.providerKey !== input.providerKey ||
      artifact.value.providerResourceHandle !== input.providerResourceHandle
    ) {
      return err(
        shellManagedProviderError(
          "Managed Redis artifact does not match delete request",
          {
            dependencyResourceId: input.dependencyResourceId,
            dependencyKind: "redis",
            providerKey: input.providerKey,
          },
          new Error("artifact_mismatch"),
        ),
      );
    }

    try {
      await Bun.write(
        shellManagedResourceArtifactPath(this.dataDir, "redis", input.dependencyResourceId),
        `${JSON.stringify({ ...artifact.value, deletedAt: input.requestedAt }, null, 2)}\n`,
      );
    } catch (cause) {
      return err(
        shellManagedProviderError(
          "Managed Redis delete artifact could not be written",
          {
            dependencyResourceId: input.dependencyResourceId,
            dependencyKind: "redis",
            providerKey: input.providerKey,
          },
          cause,
        ),
      );
    }

    return ok({ deletedAt: input.requestedAt });
  }

  private async readArtifact(
    dependencyResourceId: string,
    providerKey: string,
  ): Promise<Result<ShellManagedDependencyResourceArtifact, DomainError>> {
    try {
      const raw = await readFile(
        shellManagedResourceArtifactPath(this.dataDir, "redis", dependencyResourceId),
        "utf8",
      );
      const parsed = JSON.parse(raw) as ShellManagedDependencyResourceArtifact;
      if (parsed.schemaVersion !== "appaloft.dependency-resource-realization/v1") {
        return err(
          shellManagedProviderError(
            "Managed Redis artifact has an unsupported schema",
            {
              dependencyResourceId,
              dependencyKind: "redis",
              providerKey,
            },
            new Error("unsupported_schema"),
          ),
        );
      }
      return ok(parsed);
    } catch (cause) {
      return err(
        shellManagedProviderError(
          "Managed Redis artifact could not be read",
          {
            dependencyResourceId,
            dependencyKind: "redis",
            providerKey,
          },
          cause,
        ),
      );
    }
  }
}

interface ShellDependencyResourceBackupArtifact {
  schemaVersion: "appaloft.dependency-resource-backup/v1";
  backupId: string;
  dependencyResourceId: string;
  dependencyKind: DependencyResourceKind;
  providerKey: string;
  providerResourceHandle?: string;
  connection?: DependencyResourceBackupProviderInput["connection"];
  providerArtifactHandle: string;
  executionMode?: ShellDependencyResourceBackupExecutionMode;
  nativeArtifactPath?: string;
  completedAt: string;
}

interface ShellDependencyResourceRestoreArtifact {
  schemaVersion: "appaloft.dependency-resource-restore/v1";
  backupId: string;
  dependencyResourceId: string;
  dependencyKind: DependencyResourceKind;
  providerKey: string;
  providerArtifactHandle: string;
  restoreAttemptId: string;
  executionMode?: ShellDependencyResourceBackupExecutionMode;
  completedAt: string;
}

type ShellDependencyResourceBackupExecutionMode =
  | "metadata-only"
  | "postgres-native-command"
  | "redis-native-command";

type ShellDependencyResourceNativeOperation =
  | "postgres-backup"
  | "postgres-restore"
  | "redis-backup"
  | "redis-restore";

export interface ShellDependencyResourceNativeCommandInput {
  operation: ShellDependencyResourceNativeOperation;
  connectionUrl: string;
  artifactPath: string;
  redactions: string[];
}

export interface ShellDependencyResourceNativeCommandRunner {
  run(input: ShellDependencyResourceNativeCommandInput): Promise<Result<void, DomainError>>;
}

interface RedisLogicalBackupKey {
  key: string;
  ttlMs: number;
  dumpBase64: string;
}

interface RedisLogicalBackupArtifact {
  schemaVersion: "appaloft.redis-logical-backup/v1";
  generatedAt: string;
  keyCount: number;
  keys: RedisLogicalBackupKey[];
}

function isAppaloftOwnedDependencyResourceSecretRef(
  secretRef: string | undefined,
): secretRef is string {
  return Boolean(secretRef?.startsWith("appaloft://dependency-resources/"));
}

function postgresEnvironmentFromConnectionUrl(connectionUrl: string): Result<NodeJS.ProcessEnv> {
  try {
    const parsed = new URL(connectionUrl);
    const databaseName = parsed.pathname.replace(/^\//, "");
    return ok({
      ...process.env,
      PGHOST: parsed.hostname,
      ...(parsed.port ? { PGPORT: parsed.port } : {}),
      ...(databaseName ? { PGDATABASE: databaseName } : {}),
      ...(parsed.username ? { PGUSER: decodeURIComponent(parsed.username) } : {}),
      ...(parsed.password ? { PGPASSWORD: decodeURIComponent(parsed.password) } : {}),
    });
  } catch (cause) {
    return err(
      domainError.provider(
        "Postgres connection URL could not be parsed for native backup execution",
        {
          phase: "dependency-resource-backup-native-command",
          cause: cause instanceof Error ? cause.name : "unknown",
        },
        false,
      ),
    );
  }
}

function isRedisLogicalBackupArtifact(value: unknown): value is RedisLogicalBackupArtifact {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as {
    schemaVersion?: unknown;
    generatedAt?: unknown;
    keyCount?: unknown;
    keys?: unknown;
  };
  return (
    candidate.schemaVersion === "appaloft.redis-logical-backup/v1" &&
    typeof candidate.generatedAt === "string" &&
    typeof candidate.keyCount === "number" &&
    Array.isArray(candidate.keys) &&
    candidate.keys.every((entry) => {
      if (!entry || typeof entry !== "object") {
        return false;
      }
      const key = entry as { key?: unknown; ttlMs?: unknown; dumpBase64?: unknown };
      return (
        typeof key.key === "string" &&
        typeof key.ttlMs === "number" &&
        typeof key.dumpBase64 === "string"
      );
    })
  );
}

function redisLogicalBackupError(
  message: string,
  input: ShellDependencyResourceNativeCommandInput,
  details: Record<string, string | number | boolean | undefined>,
  retryable = true,
): DomainError {
  return domainError.provider(
    message,
    {
      phase: "dependency-resource-backup-native-command",
      operation: input.operation,
      ...details,
    },
    retryable,
  );
}

export class BunDependencyResourceNativeCommandRunner
  implements ShellDependencyResourceNativeCommandRunner
{
  async run(input: ShellDependencyResourceNativeCommandInput): Promise<Result<void, DomainError>> {
    if (input.operation === "redis-backup") {
      return await this.runRedisBackup(input);
    }
    if (input.operation === "redis-restore") {
      return await this.runRedisRestore(input);
    }

    const env = postgresEnvironmentFromConnectionUrl(input.connectionUrl);
    if (env.isErr()) {
      return err(env.error);
    }

    const command =
      input.operation === "postgres-backup"
        ? ["pg_dump", "--format=custom", "--file", input.artifactPath]
        : [
            "pg_restore",
            "--clean",
            "--if-exists",
            "--dbname",
            env.value.PGDATABASE ?? "",
            input.artifactPath,
          ];
    const tool = command[0] ?? "postgres-native-tool";
    let started: ReturnType<typeof Bun.spawnSync>;
    try {
      started = Bun.spawnSync(command, {
        env: env.value,
        stdout: "pipe",
        stderr: "pipe",
      });
    } catch (cause) {
      return err(
        domainError.provider(
          "Postgres native backup command could not start",
          {
            phase: "dependency-resource-backup-native-command",
            operation: input.operation,
            tool,
            cause: cause instanceof Error ? cause.name : "unknown",
          },
          true,
        ),
      );
    }
    if (started.success) {
      return ok(undefined);
    }

    return err(
      domainError.provider(
        "Postgres native backup command failed",
        {
          phase: "dependency-resource-backup-native-command",
          operation: input.operation,
          tool,
          exitCode: started.exitCode,
        },
        true,
      ),
    );
  }

  private async runRedisBackup(
    input: ShellDependencyResourceNativeCommandInput,
  ): Promise<Result<void, DomainError>> {
    const scanned = this.runRedisCli(input, ["--raw", "--scan"]);
    if (scanned.isErr()) {
      return err(scanned.error);
    }

    const keys = new TextDecoder()
      .decode(scanned.value)
      .split(/\r?\n/)
      .filter((key) => key.length > 0);
    const backupKeys: RedisLogicalBackupKey[] = [];
    for (const key of keys) {
      const ttl = this.runRedisCli(input, ["--raw", "PTTL", key]);
      if (ttl.isErr()) {
        return err(ttl.error);
      }
      const dump = this.runRedisCli(input, ["--raw", "DUMP", key]);
      if (dump.isErr()) {
        return err(dump.error);
      }
      const ttlMs = Number.parseInt(new TextDecoder().decode(ttl.value).trim(), 10);
      backupKeys.push({
        key,
        ttlMs: Number.isFinite(ttlMs) ? ttlMs : -1,
        dumpBase64: Buffer.from(dump.value).toString("base64"),
      });
    }

    const artifact: RedisLogicalBackupArtifact = {
      schemaVersion: "appaloft.redis-logical-backup/v1",
      generatedAt: new Date().toISOString(),
      keyCount: backupKeys.length,
      keys: backupKeys,
    };
    try {
      await Bun.write(input.artifactPath, `${JSON.stringify(artifact, null, 2)}\n`);
      return ok(undefined);
    } catch (cause) {
      return err(
        redisLogicalBackupError("Redis logical backup artifact could not be written", input, {
          cause: cause instanceof Error ? cause.name : "unknown",
        }),
      );
    }
  }

  private async runRedisRestore(
    input: ShellDependencyResourceNativeCommandInput,
  ): Promise<Result<void, DomainError>> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(await readFile(input.artifactPath, "utf8"));
    } catch (cause) {
      return err(
        redisLogicalBackupError("Redis logical backup artifact could not be read", input, {
          cause: cause instanceof Error ? cause.name : "unknown",
        }),
      );
    }
    if (!isRedisLogicalBackupArtifact(parsed)) {
      return err(
        redisLogicalBackupError(
          "Redis logical backup artifact has an unsupported schema",
          input,
          { cause: "unsupported_schema" },
          false,
        ),
      );
    }

    for (const entry of parsed.keys) {
      const deleted = this.runRedisCli(input, ["DEL", entry.key]);
      if (deleted.isErr()) {
        return err(deleted.error);
      }
      const payload = Buffer.from(entry.dumpBase64, "base64");
      const ttlMs = entry.ttlMs > 0 ? String(entry.ttlMs) : "0";
      const restored = this.runRedisCli(input, ["-x", "RESTORE", entry.key, ttlMs, "REPLACE"], {
        stdin: payload,
      });
      if (restored.isErr()) {
        return err(restored.error);
      }
    }
    return ok(undefined);
  }

  private runRedisCli(
    input: ShellDependencyResourceNativeCommandInput,
    args: string[],
    options: { stdin?: Uint8Array } = {},
  ): Result<Uint8Array, DomainError> {
    const command = ["redis-cli", "-u", input.connectionUrl, ...args];
    let started: ReturnType<typeof Bun.spawnSync>;
    try {
      started = Bun.spawnSync(command, {
        ...(options.stdin ? { stdin: options.stdin } : {}),
        stdout: "pipe",
        stderr: "pipe",
      });
    } catch (cause) {
      return err(
        redisLogicalBackupError("Redis native backup command could not start", input, {
          tool: "redis-cli",
          cause: cause instanceof Error ? cause.name : "unknown",
        }),
      );
    }
    if (started.success) {
      return ok(started.stdout ? Uint8Array.from(started.stdout) : new Uint8Array());
    }

    return err(
      redisLogicalBackupError("Redis native backup command failed", input, {
        tool: "redis-cli",
        exitCode: started.exitCode,
      }),
    );
  }
}

function shellBackupArtifactSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function shellBackupProviderError(
  message: string,
  input:
    | DependencyResourceBackupProviderInput
    | DependencyResourceRestoreProviderInput
    | {
        dependencyResourceId: string;
        dependencyKind: DependencyResourceKind;
        providerKey: string;
        backupId?: string;
      },
  cause: unknown,
): DomainError {
  return domainError.provider(
    message,
    {
      phase: "dependency-resource-backup-artifact",
      dependencyResourceId: input.dependencyResourceId,
      dependencyKind: input.dependencyKind,
      providerKey: input.providerKey,
      ...(input.backupId ? { backupId: input.backupId } : {}),
      cause: cause instanceof Error ? cause.name : "unknown",
    },
    true,
  );
}

export class ShellDependencyResourceBackupProvider implements DependencyResourceBackupProviderPort {
  constructor(
    private readonly dataDir = ".appaloft/data",
    private readonly options: {
      dependencyResourceSecretStore?: DependencyResourceSecretStore;
      nativeCommandRunner?: ShellDependencyResourceNativeCommandRunner;
    } = {},
  ) {}

  supports(providerKey: string, dependencyKind: DependencyResourceKind): boolean {
    return (
      (providerKey === "appaloft-managed-postgres" && dependencyKind === "postgres") ||
      (providerKey === "appaloft-managed-redis" && dependencyKind === "redis") ||
      (providerKey === "external-postgres" && dependencyKind === "postgres") ||
      (providerKey === "external-redis" && dependencyKind === "redis")
    );
  }

  async createBackup(
    context: ExecutionContext,
    input: DependencyResourceBackupProviderInput,
  ): Promise<Result<DependencyResourceBackupProviderResult, DomainError>> {
    const providerArtifactHandle = `backup/${input.dependencyResourceId}/${input.backupId}`;
    const nativeExecution = await this.runNativeBackupIfAvailable(context, input);
    if (nativeExecution.isErr()) {
      return err(nativeExecution.error);
    }
    const artifact: ShellDependencyResourceBackupArtifact = {
      schemaVersion: "appaloft.dependency-resource-backup/v1",
      backupId: input.backupId,
      dependencyResourceId: input.dependencyResourceId,
      dependencyKind: input.dependencyKind,
      providerKey: input.providerKey,
      ...(input.providerResourceHandle
        ? { providerResourceHandle: input.providerResourceHandle }
        : {}),
      ...(input.connection ? { connection: input.connection } : {}),
      providerArtifactHandle,
      executionMode: nativeExecution.value.executionMode,
      ...(nativeExecution.value.nativeArtifactPath
        ? { nativeArtifactPath: nativeExecution.value.nativeArtifactPath }
        : {}),
      completedAt: input.requestedAt,
    };

    const artifactPath = this.backupArtifactPath(input.dependencyResourceId, input.backupId);
    try {
      await mkdir(this.backupArtifactDir(input.dependencyResourceId), { recursive: true });
      await Bun.write(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`);
    } catch (cause) {
      return err(
        shellBackupProviderError("Dependency backup artifact could not be written", input, cause),
      );
    }

    return ok({
      providerArtifactHandle,
      completedAt: artifact.completedAt,
      retentionStatus: "retained",
    });
  }

  async restoreBackup(
    context: ExecutionContext,
    input: DependencyResourceRestoreProviderInput,
  ): Promise<Result<DependencyResourceRestoreProviderResult, DomainError>> {
    const artifact = await this.readBackupArtifact(input);
    if (artifact.isErr()) {
      return err(artifact.error);
    }
    if (
      artifact.value.backupId !== input.backupId ||
      artifact.value.dependencyResourceId !== input.dependencyResourceId ||
      artifact.value.dependencyKind !== input.dependencyKind ||
      artifact.value.providerKey !== input.providerKey ||
      artifact.value.providerResourceHandle !== input.providerResourceHandle ||
      artifact.value.providerArtifactHandle !== input.providerArtifactHandle
    ) {
      return err(
        shellBackupProviderError(
          "Dependency backup artifact does not match the restore request",
          input,
          new Error("artifact_mismatch"),
        ),
      );
    }

    const nativeExecution = await this.runNativeRestoreIfRequired(context, input, artifact.value);
    if (nativeExecution.isErr()) {
      return err(nativeExecution.error);
    }

    const restoreArtifact: ShellDependencyResourceRestoreArtifact = {
      schemaVersion: "appaloft.dependency-resource-restore/v1",
      backupId: input.backupId,
      dependencyResourceId: input.dependencyResourceId,
      dependencyKind: input.dependencyKind,
      providerKey: input.providerKey,
      providerArtifactHandle: input.providerArtifactHandle,
      restoreAttemptId: input.restoreAttemptId,
      executionMode: nativeExecution.value.executionMode,
      completedAt: input.requestedAt,
    };
    try {
      await Bun.write(
        this.restoreArtifactPath(
          input.dependencyResourceId,
          input.backupId,
          input.restoreAttemptId,
        ),
        `${JSON.stringify(restoreArtifact, null, 2)}\n`,
      );
    } catch (cause) {
      return err(
        shellBackupProviderError("Dependency restore artifact could not be written", input, cause),
      );
    }

    return ok({ completedAt: input.requestedAt });
  }

  private backupArtifactDir(dependencyResourceId: string): string {
    return join(
      this.dataDir,
      "dependency-resource-backups",
      shellBackupArtifactSegment(dependencyResourceId),
    );
  }

  private backupArtifactPath(dependencyResourceId: string, backupId: string): string {
    return join(
      this.backupArtifactDir(dependencyResourceId),
      `${shellBackupArtifactSegment(backupId)}.json`,
    );
  }

  private restoreArtifactPath(
    dependencyResourceId: string,
    backupId: string,
    restoreAttemptId: string,
  ): string {
    return join(
      this.backupArtifactDir(dependencyResourceId),
      `${shellBackupArtifactSegment(backupId)}.${shellBackupArtifactSegment(restoreAttemptId)}.restore.json`,
    );
  }

  private nativeBackupArtifactPath(
    dependencyResourceId: string,
    backupId: string,
    dependencyKind: DependencyResourceKind,
  ): string {
    const extension = dependencyKind === "redis" ? "redis.json" : "pgdump";
    return join(
      this.backupArtifactDir(dependencyResourceId),
      `${shellBackupArtifactSegment(backupId)}.${extension}`,
    );
  }

  private async runNativeBackupIfAvailable(
    context: ExecutionContext,
    input: DependencyResourceBackupProviderInput,
  ): Promise<
    Result<
      { executionMode: ShellDependencyResourceBackupExecutionMode; nativeArtifactPath?: string },
      DomainError
    >
  > {
    const secretRef = input.connection?.secretRef;
    if (
      (input.dependencyKind !== "postgres" && input.dependencyKind !== "redis") ||
      !isAppaloftOwnedDependencyResourceSecretRef(secretRef) ||
      !this.options.dependencyResourceSecretStore ||
      !this.options.nativeCommandRunner
    ) {
      return ok({ executionMode: "metadata-only" });
    }

    const resolved = await this.options.dependencyResourceSecretStore.resolve(context, {
      secretRef,
    });
    if (resolved.isErr()) {
      return err(
        shellBackupProviderError(
          "Dependency backup connection secret could not be resolved",
          input,
          resolved.error,
        ),
      );
    }

    const nativeArtifactPath = this.nativeBackupArtifactPath(
      input.dependencyResourceId,
      input.backupId,
      input.dependencyKind,
    );
    try {
      await mkdir(this.backupArtifactDir(input.dependencyResourceId), { recursive: true });
    } catch (cause) {
      return err(
        shellBackupProviderError(
          "Dependency backup artifact directory could not be created",
          input,
          cause,
        ),
      );
    }
    const executed = await this.options.nativeCommandRunner.run({
      operation: input.dependencyKind === "redis" ? "redis-backup" : "postgres-backup",
      connectionUrl: resolved.value.secretValue,
      artifactPath: nativeArtifactPath,
      redactions: [resolved.value.secretValue],
    });
    if (executed.isErr()) {
      return err(executed.error);
    }

    return ok({
      executionMode:
        input.dependencyKind === "redis" ? "redis-native-command" : "postgres-native-command",
      nativeArtifactPath,
    });
  }

  private async runNativeRestoreIfRequired(
    context: ExecutionContext,
    input: DependencyResourceRestoreProviderInput,
    artifact: ShellDependencyResourceBackupArtifact,
  ): Promise<Result<{ executionMode: ShellDependencyResourceBackupExecutionMode }, DomainError>> {
    if (!artifact.executionMode || artifact.executionMode === "metadata-only") {
      return ok({ executionMode: "metadata-only" });
    }
    const secretRef = input.connection?.secretRef;
    const expectedKind = artifact.executionMode === "redis-native-command" ? "redis" : "postgres";
    if (
      input.dependencyKind !== expectedKind ||
      !artifact.nativeArtifactPath ||
      !isAppaloftOwnedDependencyResourceSecretRef(secretRef) ||
      !this.options.dependencyResourceSecretStore ||
      !this.options.nativeCommandRunner
    ) {
      return err(
        shellBackupProviderError(
          "Dependency restore native execution context is unavailable",
          input,
          new Error("native_execution_context_unavailable"),
        ),
      );
    }

    const resolved = await this.options.dependencyResourceSecretStore.resolve(context, {
      secretRef,
    });
    if (resolved.isErr()) {
      return err(
        shellBackupProviderError(
          "Dependency restore connection secret could not be resolved",
          input,
          resolved.error,
        ),
      );
    }

    const executed = await this.options.nativeCommandRunner.run({
      operation:
        artifact.executionMode === "redis-native-command" ? "redis-restore" : "postgres-restore",
      connectionUrl: resolved.value.secretValue,
      artifactPath: artifact.nativeArtifactPath,
      redactions: [resolved.value.secretValue],
    });
    if (executed.isErr()) {
      return err(executed.error);
    }

    return ok({ executionMode: artifact.executionMode });
  }

  private async readBackupArtifact(
    input: DependencyResourceRestoreProviderInput,
  ): Promise<Result<ShellDependencyResourceBackupArtifact, DomainError>> {
    try {
      const raw = await readFile(
        this.backupArtifactPath(input.dependencyResourceId, input.backupId),
        "utf8",
      );
      const parsed = JSON.parse(raw) as ShellDependencyResourceBackupArtifact;
      if (parsed.schemaVersion !== "appaloft.dependency-resource-backup/v1") {
        return err(
          shellBackupProviderError(
            "Dependency backup artifact has an unsupported schema",
            input,
            new Error("unsupported_schema"),
          ),
        );
      }
      return ok(parsed);
    } catch (cause) {
      return err(
        shellBackupProviderError("Dependency backup artifact could not be read", input, cause),
      );
    }
  }
}

export interface RegisterApplicationServicesInput {
  dataDir?: string;
}

export function registerApplicationServices(
  container: DependencyContainer,
  input: RegisterApplicationServicesInput = {},
): void {
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
  container.registerSingleton(QueryCapabilitiesQueryHandler);
  container.registerSingleton(CheckInstanceUpgradeQueryHandler);
  container.registerSingleton(ApplyInstanceUpgradeCommandHandler);
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
  container.registerSingleton(InspectRuntimeUsageQueryHandler);
  container.registerSingleton(ListRuntimeMonitoringSamplesQueryHandler);
  container.registerSingleton(RuntimeMonitoringRollupQueryHandler);
  container.registerSingleton(ConfigureRuntimeMonitoringThresholdsCommandHandler);
  container.registerSingleton(ShowRuntimeMonitoringThresholdsQueryHandler);
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
  container.registerSingleton(ApplyActionPreviewRouteCommandHandler);
  container.registerSingleton(ConfirmActionPreviewRouteCommandHandler);
  container.registerSingleton(CreateActionSourceLinkDeploymentCommandHandler);
  container.registerSingleton(ShowDeploymentQueryHandler);
  container.registerSingleton(DeploymentPlanQueryHandler);
  container.registerSingleton(DeploymentRecoveryReadinessQueryHandler);
  container.registerSingleton(RetryDeploymentCommandHandler);
  container.registerSingleton(RedeployDeploymentCommandHandler);
  container.registerSingleton(RollbackDeploymentCommandHandler);
  container.registerSingleton(StopResourceRuntimeCommandHandler);
  container.registerSingleton(StartResourceRuntimeCommandHandler);
  container.registerSingleton(RestartResourceRuntimeCommandHandler);
  container.registerSingleton(ArchiveResourceRuntimeLogsCommandHandler);
  container.registerSingleton(ListResourceRuntimeLogArchivesQueryHandler);
  container.registerSingleton(ShowResourceRuntimeLogArchiveQueryHandler);
  container.registerSingleton(PruneResourceRuntimeLogArchivesCommandHandler);
  container.registerSingleton(StreamDeploymentEventsQueryHandler);
  container.registerSingleton(ImportCertificateCommandHandler);
  container.registerSingleton(IssueOrRenewCertificateCommandHandler);
  container.registerSingleton(RetryCertificateCommandHandler);
  container.registerSingleton(RevokeCertificateCommandHandler);
  container.registerSingleton(DeleteCertificateCommandHandler);
  container.registerSingleton(RetryDomainBindingVerificationCommandHandler);
  container.registerSingleton(RelinkSourceLinkCommandHandler);
  container.registerSingleton(ResolveActionServerConfigDeploymentTargetCommandHandler);
  container.registerSingleton(RenameProjectCommandHandler);
  container.registerSingleton(CancelOperatorWorkCommandHandler);
  container.registerSingleton(DeadLetterOperatorWorkCommandHandler);
  container.registerSingleton(MarkOperatorWorkRecoveredCommandHandler);
  container.registerSingleton(PruneOperatorWorkCommandHandler);
  container.registerSingleton(RetryOperatorWorkCommandHandler);
  container.registerSingleton(ListCertificatesQueryHandler);
  container.registerSingleton(ListAuditEventsQueryHandler);
  container.registerSingleton(ExportAuditEventsQueryHandler);
  container.registerSingleton(ExportGlobalAuditEventsQueryHandler);
  container.registerSingleton(CreateAuditEventArchiveCommandHandler);
  container.registerSingleton(ListAuditEventArchivesQueryHandler);
  container.registerSingleton(ShowAuditEventArchiveQueryHandler);
  container.registerSingleton(PruneAuditEventArchivesCommandHandler);
  container.registerSingleton(ListAuditEventLegalHoldsQueryHandler);
  container.registerSingleton(ShowAuditEventLegalHoldQueryHandler);
  container.registerSingleton(ShowAuditEventQueryHandler);
  container.registerSingleton(PruneAuditEventsCommandHandler);
  container.registerSingleton(ConfigureAuditEventLegalHoldCommandHandler);
  container.registerSingleton(ReleaseAuditEventLegalHoldCommandHandler);
  container.registerSingleton(PruneDeploymentLogsCommandHandler);
  container.registerSingleton(PruneDomainEventsCommandHandler);
  container.registerSingleton(PruneProviderJobLogsCommandHandler);
  container.registerSingleton(ConfigureRetentionDefaultsCommandHandler);
  container.registerSingleton(ListRetentionDefaultsQueryHandler);
  container.registerSingleton(ShowRetentionDefaultQueryHandler);
  container.registerSingleton(ShowCertificateQueryHandler);
  container.registerSingleton(ListOperatorWorkQueryHandler);
  container.registerSingleton(ShowOperatorWorkQueryHandler);
  container.registerSingleton(ListTerminalSessionsQueryHandler);
  container.registerSingleton(ShowTerminalSessionQueryHandler);
  container.registerSingleton(CloseTerminalSessionCommandHandler);
  container.registerSingleton(ExpireTerminalSessionsCommandHandler);
  container.registerSingleton(ListDeployTokensQueryHandler);
  container.registerSingleton(ShowDeployTokenQueryHandler);
  container.registerSingleton(ShowProjectQueryHandler);
  container.registerSingleton(ShowDomainBindingQueryHandler);
  container.registerSingleton(ShowSshCredentialQueryHandler);
  container.registerSingleton(InspectServerCapacityQueryHandler);
  container.registerSingleton(PruneServerCapacityCommandHandler);
  container.registerSingleton(ConfigureScheduledRuntimePrunePolicyCommandHandler);
  container.registerSingleton(ListScheduledRuntimePrunePoliciesQueryHandler);
  container.registerSingleton(ShowScheduledRuntimePrunePolicyQueryHandler);
  container.registerSingleton(CreateStorageVolumeCommandHandler);
  container.registerSingleton(BindResourceDependencyCommandHandler);
  container.registerSingleton(UnbindResourceDependencyCommandHandler);
  container.registerSingleton(RotateResourceDependencyBindingSecretCommandHandler);
  container.registerSingleton(ListResourceDependencyBindingsQueryHandler);
  container.registerSingleton(ShowResourceDependencyBindingQueryHandler);
  container.registerSingleton(ListSourceEventsQueryHandler);
  container.registerSingleton(ShowSourceEventQueryHandler);
  container.registerSingleton(ResolveGenericSignedSourceEventSecretQueryHandler);
  container.registerSingleton(ResolvePreviewPullRequestContextQueryHandler);
  container.registerSingleton(ProvisionPostgresDependencyResourceCommandHandler);
  container.registerSingleton(ImportPostgresDependencyResourceCommandHandler);
  container.registerSingleton(ProvisionRedisDependencyResourceCommandHandler);
  container.registerSingleton(ImportRedisDependencyResourceCommandHandler);
  container.registerSingleton(RenameDependencyResourceCommandHandler);
  container.registerSingleton(DeleteDependencyResourceCommandHandler);
  container.registerSingleton(ConfigureDependencyResourceBackupPolicyCommandHandler);
  container.registerSingleton(CreateDependencyResourceBackupCommandHandler);
  container.registerSingleton(RestoreDependencyResourceBackupCommandHandler);
  container.registerSingleton(ListDependencyResourcesQueryHandler);
  container.registerSingleton(ShowDependencyResourceQueryHandler);
  container.registerSingleton(ListDependencyResourceBackupPoliciesQueryHandler);
  container.registerSingleton(ShowDependencyResourceBackupPolicyQueryHandler);
  container.registerSingleton(ListDependencyResourceBackupsQueryHandler);
  container.registerSingleton(ShowDependencyResourceBackupQueryHandler);
  container.registerSingleton(RenameStorageVolumeCommandHandler);
  container.registerSingleton(DeleteStorageVolumeCommandHandler);
  container.registerSingleton(CleanupStorageVolumeRuntimeCommandHandler);
  container.registerSingleton(ListStorageVolumesQueryHandler);
  container.registerSingleton(ShowStorageVolumeQueryHandler);
  container.registerSingleton(BootstrapFirstAdminCommandHandler);
  container.registerSingleton(GetAuthBootstrapStatusQueryHandler);
  container.registerSingleton(GetCurrentOrganizationContextQueryHandler);
  container.registerSingleton(ListOrganizationMembersQueryHandler);
  container.registerSingleton(ListOrganizationInvitationsQueryHandler);
  container.registerSingleton(InviteOrganizationMemberCommandHandler);
  container.registerSingleton(SwitchCurrentOrganizationCommandHandler);
  container.registerSingleton(ChangeOrganizationMemberRoleCommandHandler);
  container.registerSingleton(RemoveOrganizationMemberCommandHandler);
  container.registerSingleton(CreateDeployTokenCommandHandler);
  container.registerSingleton(RotateDeployTokenCommandHandler);
  container.registerSingleton(RevokeDeployTokenCommandHandler);
  container.registerSingleton(
    tokens.certificateProviderSelectionPolicy,
    ShellCertificateProviderSelectionPolicy,
  );
  container.register(tokens.managedPostgresProvider, {
    useValue: new ShellManagedPostgresProvider(input.dataDir),
  });
  container.register(tokens.managedRedisProvider, {
    useValue: new ShellManagedRedisProvider(input.dataDir),
  });
  container.register(tokens.dependencyResourceBackupProvider, {
    useFactory: instanceCachingFactory((dependencyContainer) => {
      const dependencyResourceSecretStore = dependencyContainer.isRegistered(
        tokens.dependencyResourceSecretStore,
        true,
      )
        ? dependencyContainer.resolve<DependencyResourceSecretStore>(
            tokens.dependencyResourceSecretStore,
          )
        : undefined;
      return new ShellDependencyResourceBackupProvider(input.dataDir, {
        ...(dependencyResourceSecretStore ? { dependencyResourceSecretStore } : {}),
        nativeCommandRunner: new BunDependencyResourceNativeCommandRunner(),
      });
    }),
  });
  container.registerSingleton(tokens.domainOwnershipVerifier, PublicDnsDomainOwnershipVerifier);
  container.registerSingleton(tokens.archiveProjectUseCase, ArchiveProjectUseCase);
  container.registerSingleton(tokens.bootstrapFirstAdminUseCase, BootstrapFirstAdminUseCase);
  container.registerSingleton(
    tokens.getAuthBootstrapStatusQueryService,
    GetAuthBootstrapStatusQueryService,
  );
  container.registerSingleton(
    tokens.getCurrentOrganizationContextQueryService,
    GetCurrentOrganizationContextQueryService,
  );
  container.registerSingleton(
    tokens.listOrganizationMembersQueryService,
    ListOrganizationMembersQueryService,
  );
  container.registerSingleton(
    tokens.listOrganizationInvitationsQueryService,
    ListOrganizationInvitationsQueryService,
  );
  container.registerSingleton(
    tokens.inviteOrganizationMemberUseCase,
    InviteOrganizationMemberUseCase,
  );
  container.registerSingleton(
    tokens.switchCurrentOrganizationUseCase,
    SwitchCurrentOrganizationUseCase,
  );
  container.registerSingleton(
    tokens.changeOrganizationMemberRoleUseCase,
    ChangeOrganizationMemberRoleUseCase,
  );
  container.registerSingleton(
    tokens.removeOrganizationMemberUseCase,
    RemoveOrganizationMemberUseCase,
  );
  container.registerSingleton(tokens.createDeployTokenUseCase, CreateDeployTokenUseCase);
  container.registerSingleton(tokens.listDeployTokensQueryService, ListDeployTokensQueryService);
  container.registerSingleton(tokens.revokeDeployTokenUseCase, RevokeDeployTokenUseCase);
  container.registerSingleton(tokens.rotateDeployTokenUseCase, RotateDeployTokenUseCase);
  container.registerSingleton(tokens.showDeployTokenQueryService, ShowDeployTokenQueryService);
  container.registerSingleton(tokens.operationCapabilityPort, DefaultOperationCapabilityPort);
  container.registerSingleton(tokens.createProjectUseCase, CreateProjectUseCase);
  container.registerSingleton(tokens.queryCapabilitiesQueryService, QueryCapabilitiesQueryService);
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
    tokens.previewPullRequestEventIngestService,
    PreviewPullRequestEventIngestService,
  );
  container.register(tokens.previewEnvironmentCleanupService, {
    useFactory: instanceCachingFactory(
      (dependencyContainer) =>
        new PreviewEnvironmentCleanupService(
          dependencyContainer.resolve(tokens.previewEnvironmentRepository),
          dependencyContainer.resolve(tokens.previewEnvironmentCleaner),
          dependencyContainer.resolve(tokens.previewCleanupAttemptRecorder),
          dependencyContainer.resolve(tokens.clock),
          dependencyContainer.resolve(tokens.idGenerator),
          dependencyContainer.resolve(tokens.processAttemptRecorder),
          dependencyContainer.resolve(tokens.processAttemptClaimer),
          dependencyContainer.resolve(tokens.processAttemptCompleter),
        ),
    ),
  });
  container.registerSingleton(tokens.previewEnvironmentCleaner, ShellPreviewEnvironmentCleaner);
  container.register(tokens.previewCleanupRetryScheduler, {
    useFactory: instanceCachingFactory(
      (dependencyContainer) =>
        new PreviewCleanupRetryScheduler(
          dependencyContainer.resolve(tokens.previewEnvironmentCleanupService),
          dependencyContainer.resolve(tokens.clock),
          dependencyContainer.resolve(tokens.logger),
          dependencyContainer.resolve(tokens.processAttemptRetryCandidateReader),
          dependencyContainer.resolve(tokens.processAttemptDeliveryCandidateReader),
          dependencyContainer.resolve(tokens.processAttemptRetryGenerator),
          dependencyContainer.resolve(tokens.idGenerator),
        ),
    ),
  });
  container.register(tokens.previewExpiryCleanupScheduler, {
    useFactory: instanceCachingFactory(
      (dependencyContainer) =>
        new PreviewExpiryCleanupScheduler(
          dependencyContainer.resolve(tokens.previewExpiredEnvironmentCandidateReader),
          dependencyContainer.resolve(tokens.previewEnvironmentCleanupService),
          dependencyContainer.resolve(tokens.clock),
          dependencyContainer.resolve(tokens.logger),
        ),
    ),
  });
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
  container.register(tokens.scheduledTaskRunWorker, {
    useFactory: instanceCachingFactory(
      (dependencyContainer) =>
        new ScheduledTaskRunWorker(
          dependencyContainer.resolve(tokens.scheduledTaskRunAttemptRepository),
          dependencyContainer.resolve(tokens.scheduledTaskDefinitionRepository),
          dependencyContainer.resolve(tokens.scheduledTaskRuntimePort),
          dependencyContainer.resolve(tokens.scheduledTaskRunLogRecorder),
          dependencyContainer.resolve(tokens.idGenerator),
          dependencyContainer.resolve(tokens.clock),
          dependencyContainer.resolve(tokens.processAttemptClaimer),
          dependencyContainer.resolve(tokens.processAttemptCompleter),
        ),
    ),
  });
  container.register(tokens.scheduledTaskScheduler, {
    useFactory: instanceCachingFactory(
      (dependencyContainer) =>
        new ScheduledTaskScheduler(
          dependencyContainer.resolve(tokens.scheduledTaskDueCandidateReader),
          dependencyContainer.resolve(tokens.scheduledTaskRunAdmissionService),
          dependencyContainer.resolve(tokens.clock),
          dependencyContainer.resolve(tokens.logger),
        ),
    ),
  });
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
    tokens.configureDependencyResourceBackupPolicyUseCase,
    ConfigureDependencyResourceBackupPolicyUseCase,
  );
  container.registerSingleton(
    tokens.restoreDependencyResourceBackupUseCase,
    RestoreDependencyResourceBackupUseCase,
  );
  container.registerSingleton(
    tokens.listDependencyResourceBackupPoliciesQueryService,
    ListDependencyResourceBackupPoliciesQueryService,
  );
  container.registerSingleton(
    tokens.showDependencyResourceBackupPolicyQueryService,
    ShowDependencyResourceBackupPolicyQueryService,
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
  container.registerSingleton(tokens.listAuditEventsQueryService, ListAuditEventsQueryService);
  container.registerSingleton(tokens.exportAuditEventsQueryService, ExportAuditEventsQueryService);
  container.registerSingleton(
    tokens.exportGlobalAuditEventsQueryService,
    ExportGlobalAuditEventsQueryService,
  );
  container.registerSingleton(tokens.showAuditEventQueryService, ShowAuditEventQueryService);
  container.registerSingleton(tokens.pruneAuditEventsUseCase, PruneAuditEventsUseCase);
  container.registerSingleton(
    tokens.createAuditEventArchiveUseCase,
    CreateAuditEventArchiveUseCase,
  );
  container.registerSingleton(
    tokens.listAuditEventArchivesQueryService,
    ListAuditEventArchivesQueryService,
  );
  container.registerSingleton(
    tokens.showAuditEventArchiveQueryService,
    ShowAuditEventArchiveQueryService,
  );
  container.registerSingleton(
    tokens.pruneAuditEventArchivesUseCase,
    PruneAuditEventArchivesUseCase,
  );
  container.registerSingleton(
    tokens.configureAuditEventLegalHoldUseCase,
    ConfigureAuditEventLegalHoldUseCase,
  );
  container.registerSingleton(
    tokens.releaseAuditEventLegalHoldUseCase,
    ReleaseAuditEventLegalHoldUseCase,
  );
  container.registerSingleton(
    tokens.listAuditEventLegalHoldsQueryService,
    ListAuditEventLegalHoldsQueryService,
  );
  container.registerSingleton(
    tokens.showAuditEventLegalHoldQueryService,
    ShowAuditEventLegalHoldQueryService,
  );
  container.registerSingleton(tokens.pruneDeploymentLogsUseCase, PruneDeploymentLogsUseCase);
  container.registerSingleton(tokens.pruneDomainEventsUseCase, PruneDomainEventsUseCase);
  container.registerSingleton(tokens.pruneProviderJobLogsUseCase, PruneProviderJobLogsUseCase);
  container.registerSingleton(
    tokens.resolveGenericSignedSourceEventSecretQueryService,
    ResolveGenericSignedSourceEventSecretQueryService,
  );
  container.registerSingleton(
    tokens.resolvePreviewPullRequestContextQueryService,
    ResolvePreviewPullRequestContextQueryService,
  );
  container.registerSingleton(tokens.createStorageVolumeUseCase, CreateStorageVolumeUseCase);
  container.registerSingleton(tokens.renameStorageVolumeUseCase, RenameStorageVolumeUseCase);
  container.registerSingleton(tokens.deleteStorageVolumeUseCase, DeleteStorageVolumeUseCase);
  container.registerSingleton(
    tokens.cleanupStorageVolumeRuntimeUseCase,
    CleanupStorageVolumeRuntimeUseCase,
  );
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
  container.registerSingleton(
    tokens.runtimeUsageInspectionQueryService,
    RuntimeUsageInspectionQueryService,
  );
  container.registerSingleton(
    tokens.listRuntimeMonitoringSamplesQueryService,
    RuntimeMonitoringSamplesQueryService,
  );
  container.registerSingleton(
    tokens.runtimeMonitoringRollupQueryService,
    RuntimeMonitoringRollupQueryService,
  );
  container.register(tokens.runtimeMonitoringCollectorService, {
    useFactory: instanceCachingFactory(
      (dependencyContainer) =>
        new RuntimeMonitoringCollectorService(
          dependencyContainer.resolve(tokens.runtimeUsageInspectionQueryService),
          dependencyContainer.resolve(tokens.runtimeMonitoringSampleWriteStore),
          dependencyContainer.resolve(tokens.processAttemptRecorder),
          dependencyContainer.resolve(tokens.processAttemptClaimer),
          dependencyContainer.resolve(tokens.processAttemptCompleter),
          dependencyContainer.resolve(tokens.idGenerator),
          dependencyContainer.resolve(tokens.clock),
        ),
    ),
  });
  container.registerSingleton(
    tokens.configureRuntimeMonitoringThresholdsUseCase,
    ConfigureRuntimeMonitoringThresholdsUseCase,
  );
  container.registerSingleton(
    tokens.showRuntimeMonitoringThresholdsQueryService,
    ShowRuntimeMonitoringThresholdsQueryService,
  );
  container.registerSingleton(tokens.pruneServerCapacityUseCase, PruneServerCapacityUseCase);
  container.registerSingleton(
    tokens.configureRetentionDefaultsUseCase,
    ConfigureRetentionDefaultsUseCase,
  );
  container.registerSingleton(
    tokens.listRetentionDefaultsQueryService,
    ListRetentionDefaultsQueryService,
  );
  container.registerSingleton(
    tokens.showRetentionDefaultQueryService,
    ShowRetentionDefaultQueryService,
  );
  container.register(tokens.scheduledHistoryRetentionService, {
    useFactory: instanceCachingFactory(
      (dependencyContainer) =>
        new ScheduledHistoryRetentionService(
          dependencyContainer.resolve(tokens.commandBus),
          dependencyContainer.resolve(tokens.retentionDefaultRepository),
          dependencyContainer.resolve(tokens.processAttemptRecorder),
          dependencyContainer.resolve(tokens.processAttemptClaimer),
          dependencyContainer.resolve(tokens.processAttemptCompleter),
          dependencyContainer.resolve(tokens.idGenerator),
          dependencyContainer.resolve(tokens.clock),
          dependencyContainer.resolve(tokens.runtimeMonitoringSampleRetentionStore),
        ),
    ),
  });
  container.register(tokens.scheduledDependencyBackupService, {
    useFactory: instanceCachingFactory(
      (dependencyContainer) =>
        new ScheduledDependencyBackupService(
          dependencyContainer.resolve(tokens.commandBus),
          dependencyContainer.resolve(tokens.dependencyResourceBackupPolicyRepository),
          dependencyContainer.resolve(tokens.processAttemptRecorder),
          dependencyContainer.resolve(tokens.processAttemptClaimer),
          dependencyContainer.resolve(tokens.processAttemptCompleter),
          dependencyContainer.resolve(tokens.idGenerator),
          dependencyContainer.resolve(tokens.clock),
        ),
    ),
  });
  container.registerSingleton(
    tokens.configureScheduledRuntimePrunePolicyUseCase,
    ConfigureScheduledRuntimePrunePolicyUseCase,
  );
  container.registerSingleton(
    tokens.listScheduledRuntimePrunePoliciesQueryService,
    ListScheduledRuntimePrunePoliciesQueryService,
  );
  container.registerSingleton(
    tokens.showScheduledRuntimePrunePolicyQueryService,
    ShowScheduledRuntimePrunePolicyQueryService,
  );
  container.registerSingleton(
    tokens.scheduledRuntimePrunePolicyResolver,
    ScheduledRuntimePrunePolicyResolver,
  );
  container.register(tokens.scheduledRuntimePruneService, {
    useFactory: instanceCachingFactory(
      (dependencyContainer) =>
        new ScheduledRuntimePruneService(
          dependencyContainer.resolve(tokens.commandBus),
          dependencyContainer.resolve(tokens.processAttemptRecorder),
          dependencyContainer.resolve(tokens.processAttemptClaimer),
          dependencyContainer.resolve(tokens.processAttemptCompleter),
          dependencyContainer.resolve(tokens.idGenerator),
          dependencyContainer.resolve(tokens.clock),
        ),
    ),
  });
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
  container.registerSingleton(
    tokens.applyActionPreviewRouteUseCase,
    ApplyActionPreviewRouteUseCase,
  );
  container.registerSingleton(
    tokens.confirmActionPreviewRouteUseCase,
    ConfirmActionPreviewRouteUseCase,
  );
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
  container.register(tokens.certificateRetryScheduler, {
    useFactory: instanceCachingFactory(
      (dependencyContainer) =>
        new CertificateRetryScheduler(
          dependencyContainer.resolve(tokens.certificateRetryCandidateReader),
          dependencyContainer.resolve(tokens.issueOrRenewCertificateUseCase),
          dependencyContainer.resolve(tokens.clock),
          dependencyContainer.resolve(tokens.logger),
        ),
    ),
  });
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
  container.registerSingleton(tokens.cancelOperatorWorkUseCase, CancelOperatorWorkUseCase);
  container.registerSingleton(tokens.deadLetterOperatorWorkUseCase, DeadLetterOperatorWorkUseCase);
  container.registerSingleton(
    tokens.markOperatorWorkRecoveredUseCase,
    MarkOperatorWorkRecoveredUseCase,
  );
  container.registerSingleton(tokens.pruneOperatorWorkUseCase, PruneOperatorWorkUseCase);
  container.registerSingleton(tokens.retryOperatorWorkUseCase, RetryOperatorWorkUseCase);
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
  container.register(tokens.automaticRouteContextLookupService, {
    useFactory: instanceCachingFactory(
      (dependencyContainer) =>
        new AutomaticRouteContextLookupService(
          dependencyContainer.resolve<ResourceReadModel>(tokens.resourceReadModel),
          dependencyContainer.resolve<DomainBindingReadModel>(tokens.domainBindingReadModel),
          dependencyContainer.resolve<DeploymentReadModel>(tokens.deploymentReadModel),
        ),
    ),
  });
  container.registerSingleton(tokens.resourceHealthQueryService, ResourceHealthQueryService);
  container.registerSingleton(
    tokens.resourceRuntimeLogsQueryService,
    ResourceRuntimeLogsQueryService,
  );
  container.registerSingleton(
    tokens.archiveResourceRuntimeLogsUseCase,
    ArchiveResourceRuntimeLogsUseCase,
  );
  container.registerSingleton(
    tokens.listResourceRuntimeLogArchivesQueryService,
    ListResourceRuntimeLogArchivesQueryService,
  );
  container.registerSingleton(
    tokens.showResourceRuntimeLogArchiveQueryService,
    ShowResourceRuntimeLogArchiveQueryService,
  );
  container.registerSingleton(
    tokens.pruneResourceRuntimeLogArchivesUseCase,
    PruneResourceRuntimeLogArchivesUseCase,
  );
  container.registerSingleton(tokens.openTerminalSessionUseCase, OpenTerminalSessionUseCase);
  container.registerSingleton(
    tokens.terminalSessionLifecycleService,
    TerminalSessionLifecycleService,
  );
  container.registerSingleton(
    tokens.createActionSourceLinkDeploymentUseCase,
    CreateActionSourceLinkDeploymentUseCase,
  );
  container.registerSingleton(tokens.relinkSourceLinkUseCase, RelinkSourceLinkUseCase);
  container.registerSingleton(
    tokens.resolveActionServerConfigDeploymentTargetUseCase,
    ResolveActionServerConfigDeploymentTargetUseCase,
  );
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
  container.registerSingleton(
    tokens.checkInstanceUpgradeQueryService,
    CheckInstanceUpgradeQueryService,
  );
  container.registerSingleton(tokens.applyInstanceUpgradeUseCase, ApplyInstanceUpgradeUseCase);
}
