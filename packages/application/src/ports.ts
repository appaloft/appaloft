import {
  type AcceptedConnectionCapabilityPlanSnapshot,
  type BuildStrategyKind,
  type Certificate,
  type CertificateIssueReason,
  type CertificateMutationSpec,
  type CertificatePolicy,
  type CertificateSelectionSpec,
  type CertificateSource,
  type CertificateStatus,
  type ConfigScope,
  type ConnectionCategoryKey,
  type ConnectionCredentialGrantSnapshot,
  type ConnectionOwnerSnapshot,
  type ConnectionSnapshot,
  type ConnectorDefinitionSnapshot,
  type DependencyResourceBackup,
  type DependencyResourceBackupMutationSpec,
  type DependencyResourceBackupSelectionSpec,
  type Deployment,
  type DeploymentMutationSpec,
  type DeploymentSelectionSpec,
  type DeploymentStatus,
  type DeploymentTargetState,
  type DeploymentTimelineJournalEntry,
  type DeploymentTimelineJournalSource,
  type DeploymentTriggerKind,
  type DeployToken,
  type DeployTokenMutationSpec,
  type DeployTokenSecretSuffix,
  type DeployTokenSelectionSpec,
  type DeployTokenVerifierDigest,
  type Destination,
  type DestinationKind,
  type DestinationMutationSpec,
  type DestinationSelectionSpec,
  type DnsRecordApplySnapshot,
  type DnsRecordConflictSnapshot,
  type DnsRecordPlanSnapshot,
  type DnsRecordRequirementSnapshot,
  type DomainBinding,
  type DomainBindingMutationSpec,
  type DomainBindingSelectionSpec,
  type DomainBindingStatus,
  type DomainConnectApplySnapshot,
  type DomainConnectSetupSnapshot,
  type DomainError,
  type DomainErrorDetails,
  type DomainEvent,
  type DomainRouteFailurePhase,
  type EdgeProxyKind,
  type EdgeProxyStatus,
  type EnvironmentKind,
  type EnvironmentLifecycleStatus,
  type EnvironmentMutationSpec,
  type EnvironmentProfile,
  type EnvironmentSelectionSpec,
  type EnvironmentSnapshot,
  type ExecutionStrategyKind,
  type InfrastructureServerProposalSnapshot,
  type LogLevel,
  type NotificationMessageDeliverySnapshot,
  type NotificationMessageSnapshot,
  type PackagingMode,
  type PreviewEnvironment,
  type PreviewEnvironmentMutationSpec,
  type PreviewEnvironmentProvider,
  type PreviewEnvironmentSelectionSpec,
  type PreviewEnvironmentStatus,
  type Project,
  type ProjectMutationSpec,
  type ProjectSelectionSpec,
  type Resource,
  type ResourceBinding,
  type ResourceBindingMutationSpec,
  type ResourceBindingSelectionSpec,
  type ResourceExposureMode,
  type ResourceInstance,
  type ResourceInstanceMutationSpec,
  type ResourceInstanceSelectionSpec,
  type ResourceKind,
  type ResourceMutationSpec,
  type ResourceNetworkProtocol,
  type ResourceSelectionSpec,
  type ResourceServiceKind,
  type Result,
  type RollbackPlan,
  type RuntimeArtifactIntent,
  type RuntimeArtifactKind,
  type RuntimePlan,
  type ScheduledTaskDefinition,
  type ScheduledTaskDefinitionMutationSpec,
  type ScheduledTaskDefinitionSelectionSpec,
  type ScheduledTaskRunAttempt,
  type ScheduledTaskRunAttemptMutationSpec,
  type ScheduledTaskRunAttemptSelectionSpec,
  type Server,
  type ServerMutationSpec,
  type ServerSelectionSpec,
  type SourceDescriptor,
  type SourceKind,
  type SourceRepositoryAccessSnapshot,
  type SshCredential,
  type SshCredentialMutationSpec,
  type SshCredentialSelectionSpec,
  type StaticArtifactManifest,
  type StaticArtifactPublication,
  type StaticArtifactRouteActivation,
  type StaticArtifactStoredManifest,
  type StorageVolume,
  type StorageVolumeBackup,
  type StorageVolumeBackupDataFormat,
  type StorageVolumeBackupMutationSpec,
  type StorageVolumeBackupSelectionSpec,
  type StorageVolumeBackupStatus,
  type StorageVolumeBackupTargetProviderKey,
  type StorageVolumeKind,
  type StorageVolumeMutationSpec,
  type StorageVolumeSelectionSpec,
  type StorageVolumeState,
  type TargetKind,
  type TlsMode,
  type VariableExposure,
  type VariableKind,
  type Version,
  type VersionReference,
  type VersionReferenceKind,
  type VersionSourceKind,
} from "@appaloft/core";
import {
  defaultExecutionTenantContext,
  type ExecutionActor,
  type ExecutionContext,
  type ExecutionTenantContext,
  type RepositoryContext,
  type TraceAttributes,
} from "./execution-context";
import {
  type AppliedRouteContextMetadata,
  type ResourceAccessFailureDiagnostic,
} from "./resource-access-failure-diagnostics";

export type { ResourceAccessFailureDiagnostic } from "./resource-access-failure-diagnostics";

export interface Clock {
  now(): string;
}

export interface IdGenerator {
  next(prefix: string): string;
}

export interface AppLogger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

export interface EventBus {
  publish(context: ExecutionContext, events: DomainEvent[]): Promise<void>;
}

export type MaintenanceWorkerKey =
  | "certificate-retry-scheduler"
  | "durable-worker-runtime"
  | "preview-expiry-cleanup-scheduler"
  | "preview-cleanup-retry-scheduler"
  | "scheduled-task-runner"
  | "scheduled-runtime-prune-runner"
  | "scheduled-history-retention-runner"
  | "runtime-monitoring-collector-runner";

export type MaintenanceWorkerActivation =
  | "disabled-by-config"
  | "starts-with-backend-service"
  | "starts-as-standalone-process";

export type MaintenanceWorkerSafetyMode =
  | "certificate-retry"
  | "durable-process-delivery"
  | "preview-expiry-cleanup"
  | "preview-cleanup-retry"
  | "runtime-execution"
  | "policy-gated-prune"
  | "policy-gated-retention"
  | "read-only-collection";

export interface MaintenanceWorkerRuntimeTopology {
  mode: "embedded" | "standalone" | "disabled";
  queueBackend: "database" | "external";
  workerCount: number;
  workerGroup: string;
  workerIds: string[];
  coordinationRole: "coordinator" | "worker" | "disabled";
  slotAssignment?: "all-local" | "explicit" | "leased" | "none";
  localWorkerIds?: string[];
  workerSlot?: number;
  externalBackendKind?: "kafka" | "temporal" | "custom";
  heartbeat?: MaintenanceWorkerRuntimeHeartbeat;
}

export interface MaintenanceWorkerRuntimeHeartbeatWorker {
  workerId: string;
  workerGroup: string;
  slot: number;
  status: "online" | "stopping";
  online: boolean;
  lastSeenAt: string;
}

export interface MaintenanceWorkerRuntimeHeartbeat {
  staleAfterSeconds: number;
  onlineWorkerCount: number;
  staleWorkerCount: number;
  lastSeenAt?: string;
  workers: MaintenanceWorkerRuntimeHeartbeatWorker[];
}

export interface MaintenanceWorkerObservedRuntimeHeartbeat {
  workerGroup: string;
  workerCount: number;
  workerIds: string[];
  heartbeat?: MaintenanceWorkerRuntimeHeartbeat;
}

export interface MaintenanceWorkerStatus {
  key: MaintenanceWorkerKey;
  label: string;
  enabled: boolean;
  activation: MaintenanceWorkerActivation;
  safetyMode: MaintenanceWorkerSafetyMode;
  intervalSeconds: number;
  batchSize?: number;
  defaultRetryDelaySeconds?: number;
  rawRetentionHours?: number;
  runtimeTopology?: MaintenanceWorkerRuntimeTopology;
  observedRuntimeHeartbeats?: MaintenanceWorkerObservedRuntimeHeartbeat[];
  configurationKeys: string[];
  operationKeys: string[];
}

export interface MaintenanceWorkerStatusReader {
  list(): MaintenanceWorkerStatus[] | Promise<MaintenanceWorkerStatus[]>;
}

export type CoordinationScopeKind =
  | "resource-runtime"
  | "preview-lifecycle"
  | "source-link"
  | "state-root-maintenance";

export type CoordinationMode = "supersede-active" | "serialize-with-bounded-wait";

export interface CoordinationScope {
  kind: CoordinationScopeKind;
  key: string;
}

export interface CoordinationOwner {
  ownerId: string;
  label: string;
}

export interface CoordinationPolicy {
  operationKey: string;
  scopeKind: CoordinationScopeKind;
  mode: CoordinationMode;
  waitTimeoutMs: number;
  retryIntervalMs: number;
  leaseTtlMs: number;
  heartbeatIntervalMs: number;
}

export interface MutationCoordinatorRunExclusiveInput<T> {
  context: ExecutionContext;
  policy: CoordinationPolicy;
  scope: CoordinationScope;
  owner: CoordinationOwner;
  work: () => Promise<Result<T>>;
}

export interface MutationCoordinator {
  runExclusive<T>(input: MutationCoordinatorRunExclusiveInput<T>): Promise<Result<T>>;
}

export type DeploymentProgressPhase =
  | "detect"
  | "plan"
  | "package"
  | "deploy"
  | "verify"
  | "rollback";

export type DeploymentProgressStatus = "running" | "succeeded" | "failed";

export interface DeploymentProgressEvent {
  timestamp: string;
  source: DeploymentTimelineJournalSource;
  phase: DeploymentProgressPhase;
  level: LogLevel;
  message: string;
  deploymentId?: string;
  status?: DeploymentProgressStatus;
  step?: {
    current: number;
    total: number;
    label: string;
  };
  stream?: "stdout" | "stderr";
}

export type DeploymentProgressListener = (
  context: ExecutionContext,
  event: DeploymentProgressEvent,
) => void;

export interface DeploymentProgressReporter {
  report(context: ExecutionContext, event: DeploymentProgressEvent): void;
}

export interface DeploymentProgressRecorder {
  record(context: ExecutionContext, event: DeploymentProgressEvent): Promise<Result<void>>;
}

export interface DeploymentProgressObserver {
  subscribe(listener: DeploymentProgressListener): () => void;
}

export type DeploymentTimelineSource =
  | "appaloft"
  | "ssh"
  | "docker"
  | "application"
  | "provider"
  | "health"
  | "domain-event";

export type DeploymentTimelineKind =
  | "lifecycle"
  | "step"
  | "command"
  | "output"
  | "container-log"
  | "health-check"
  | "status"
  | "diagnostic"
  | "gap";

export interface DeploymentTimelineEntry {
  deploymentId: string;
  sequence: number;
  cursor: string;
  occurredAt: string;
  source: DeploymentTimelineSource;
  kind: DeploymentTimelineKind;
  phase?: DeploymentProgressPhase;
  level: LogLevel;
  message: string;
  status?: DeploymentProgressStatus | "canceled" | "rolled-back";
  stream?: "stdout" | "stderr";
  step?: {
    current: number;
    total: number;
    label: string;
  };
  metadata?: Record<string, string | number | boolean | null>;
}

export type DeploymentTimelineEnvelope =
  | {
      schemaVersion: "deployments.timeline/v1";
      kind: "entry";
      entry: DeploymentTimelineEntry;
    }
  | {
      schemaVersion: "deployments.timeline/v1";
      kind: "heartbeat";
      at: string;
      cursor?: string;
    }
  | {
      schemaVersion: "deployments.timeline/v1";
      kind: "gap";
      entry: DeploymentTimelineEntry;
    }
  | {
      schemaVersion: "deployments.timeline/v1";
      kind: "closed";
      reason: "completed" | "cancelled" | "source-ended" | "idle-timeout";
      cursor?: string;
    }
  | {
      schemaVersion: "deployments.timeline/v1";
      kind: "error";
      error: DomainError;
    };

export interface DeploymentTimelineObservationRequest {
  cursor?: string;
  limit: number;
  includeHistory: boolean;
  follow: boolean;
  untilTerminal: boolean;
  kinds?: DeploymentTimelineKind[];
  sources?: DeploymentTimelineSource[];
}

export interface DeploymentTimelineObservationContext {
  deployment: DeploymentSummary;
}

export interface DeploymentTimelineStream extends AsyncIterable<DeploymentTimelineEnvelope> {
  close(): Promise<void>;
}

export interface DeploymentTimelineObserver {
  open(
    context: ExecutionContext,
    observationContext: DeploymentTimelineObservationContext,
    request: DeploymentTimelineObservationRequest,
    signal: AbortSignal,
  ): Promise<Result<DeploymentTimelineStream>>;
}

export interface DomainEventStreamRecordInput {
  event: DomainEvent;
  requestId: string;
}

export interface DomainEventStreamRecorder {
  record(context: RepositoryContext, input: DomainEventStreamRecordInput): Promise<Result<void>>;
}

export interface SourceLinkTarget {
  projectId: string;
  environmentId: string;
  resourceId: string;
  serverId?: string;
  destinationId?: string;
}

export interface SourceLinkDependencyProvenanceEntry {
  key: string;
  kind: ManagedDependencyResourceKind;
  source: "managed";
  lifecycle: "ephemeral";
  resourceId: string;
  dependencyResourceId: string;
  bindingId: string;
  targetName: string;
  createdAt: string;
}

export interface SourceLinkDependencyProvenance {
  schemaVersion: "source-link.dependency-provenance/v1";
  source: "repository-config";
  sourceFingerprint: string;
  entries: SourceLinkDependencyProvenanceEntry[];
}

export interface SourceLinkStorageProvenanceEntry {
  key: string;
  kind: "volume";
  source: "managed";
  lifecycle: "ephemeral";
  resourceId: string;
  storageVolumeId: string;
  attachmentId: string;
  destinationPath: string;
  createdAt: string;
}

export interface SourceLinkStorageProvenance {
  schemaVersion: "source-link.storage-provenance/v1";
  source: "repository-config";
  sourceFingerprint: string;
  entries: SourceLinkStorageProvenanceEntry[];
}

export interface SourceLinkScheduledTaskProvenanceEntry {
  key: string;
  source: "repository-config";
  lifecycle: "persistent" | "ephemeral";
  resourceId: string;
  taskId: string;
  commandFingerprint: string;
  createdAt: string;
}

export interface SourceLinkScheduledTaskProvenance {
  schemaVersion: "source-link.scheduled-task-provenance/v1";
  source: "repository-config";
  sourceFingerprint: string;
  entries: SourceLinkScheduledTaskProvenanceEntry[];
}

export interface SourceLinkRecord extends SourceLinkTarget {
  sourceFingerprint: string;
  updatedAt: string;
  reason?: string;
  dependencyProvenance?: SourceLinkDependencyProvenance;
  storageProvenance?: SourceLinkStorageProvenance;
  scheduledTaskProvenance?: SourceLinkScheduledTaskProvenance;
}

export interface SourceLinkSelectionSpecVisitor<TResult> {
  visitSourceLinkBySourceFingerprint(
    query: TResult,
    spec: SourceLinkBySourceFingerprintSpec,
  ): TResult;
}

export interface SourceLinkUpsertSpecVisitor<TResult> {
  visitUpsertSourceLink(spec: UpsertSourceLinkSpec): TResult;
}

export interface SourceLinkSelectionSpec {
  accept<TResult>(query: TResult, visitor: SourceLinkSelectionSpecVisitor<TResult>): TResult;
}

export interface SourceLinkUpsertSpec {
  accept<TResult>(visitor: SourceLinkUpsertSpecVisitor<TResult>): TResult;
}

export class SourceLinkBySourceFingerprintSpec implements SourceLinkSelectionSpec {
  private constructor(public readonly sourceFingerprint: string) {}

  static create(sourceFingerprint: string): SourceLinkBySourceFingerprintSpec {
    return new SourceLinkBySourceFingerprintSpec(sourceFingerprint);
  }

  accept<TResult>(query: TResult, visitor: SourceLinkSelectionSpecVisitor<TResult>): TResult {
    return visitor.visitSourceLinkBySourceFingerprint(query, this);
  }
}

export class UpsertSourceLinkSpec implements SourceLinkUpsertSpec {
  private constructor(public readonly record: SourceLinkRecord) {}

  static fromRecord(record: SourceLinkRecord): UpsertSourceLinkSpec {
    return new UpsertSourceLinkSpec(record);
  }

  accept<TResult>(visitor: SourceLinkUpsertSpecVisitor<TResult>): TResult {
    return visitor.visitUpsertSourceLink(this);
  }
}

export interface SourceLinkRepository {
  findOne(spec: SourceLinkSelectionSpec): Promise<Result<SourceLinkRecord | null>>;
  upsert(record: SourceLinkRecord, spec: SourceLinkUpsertSpec): Promise<Result<SourceLinkRecord>>;
  deleteOne(spec: SourceLinkSelectionSpec): Promise<Result<boolean>>;
}

export interface SourceLinkReadModel {
  list(
    context: RepositoryContext,
    input?: {
      projectId?: string;
      resourceId?: string;
      serverId?: string;
      limit?: number;
    },
  ): Promise<SourceLinkRecord[]>;
}

export interface ProjectRepository {
  findOne(context: RepositoryContext, spec: ProjectSelectionSpec): Promise<Project | null>;
  upsert(context: RepositoryContext, project: Project, spec: ProjectMutationSpec): Promise<void>;
}

export type ProjectDeleteBlockerKind =
  | "active-project"
  | "environment"
  | "resource"
  | "deployment-history"
  | "domain-binding"
  | "certificate"
  | "source-link"
  | "source-event"
  | "dependency-resource"
  | "storage-volume"
  | "scheduled-task"
  | "preview-environment"
  | "runtime-monitoring"
  | "runtime-log-retention"
  | "provider-job-log"
  | "domain-event-retention"
  | "audit-retention";

export interface ProjectDeleteBlocker {
  kind: ProjectDeleteBlockerKind;
  relatedEntityId?: string;
  relatedEntityType?: string;
  count?: number;
}

export interface ProjectDeletionBlocker extends Omit<ProjectDeleteBlocker, "kind"> {
  kind: Exclude<ProjectDeleteBlockerKind, "active-project">;
}

export interface ProjectEmptyEnvironmentArchiveCandidate {
  environmentId: string;
  lifecycleStatus: "active" | "locked";
}

export interface ProjectDeletionBlockerReader {
  findBlockers(
    context: RepositoryContext,
    input: { projectId: string },
  ): Promise<Result<ProjectDeletionBlocker[], DomainError>>;
  findEmptyEnvironmentArchiveCandidates(
    context: RepositoryContext,
    input: { projectId: string },
  ): Promise<Result<ProjectEmptyEnvironmentArchiveCandidate[], DomainError>>;
}

export interface ServerRepository {
  findOne(context: RepositoryContext, spec: ServerSelectionSpec): Promise<Server | null>;
  upsert(context: RepositoryContext, server: Server, spec: ServerMutationSpec): Promise<void>;
}

export interface SshCredentialRepository {
  findOne(
    context: RepositoryContext,
    spec: SshCredentialSelectionSpec,
  ): Promise<SshCredential | null>;
  upsert(
    context: RepositoryContext,
    credential: SshCredential,
    spec: SshCredentialMutationSpec,
  ): Promise<void>;
  updateOne(
    context: RepositoryContext,
    credential: SshCredential,
    spec: SshCredentialMutationSpec,
  ): Promise<boolean>;
  deleteOne(context: RepositoryContext, spec: SshCredentialSelectionSpec): Promise<boolean>;
}

export interface DestinationRepository {
  findOne(context: RepositoryContext, spec: DestinationSelectionSpec): Promise<Destination | null>;
  upsert(
    context: RepositoryContext,
    destination: Destination,
    spec: DestinationMutationSpec,
  ): Promise<void>;
}

export interface EnvironmentRepository {
  findOne(
    context: RepositoryContext,
    spec: EnvironmentSelectionSpec,
  ): Promise<EnvironmentProfile | null>;
  upsert(
    context: RepositoryContext,
    environment: EnvironmentProfile,
    spec: EnvironmentMutationSpec,
  ): Promise<void>;
}

export interface ResourceRepository {
  findOne(context: RepositoryContext, spec: ResourceSelectionSpec): Promise<Resource | null>;
  upsert(context: RepositoryContext, resource: Resource, spec: ResourceMutationSpec): Promise<void>;
}

export interface ScheduledTaskDefinitionRepository {
  findOne(
    context: RepositoryContext,
    spec: ScheduledTaskDefinitionSelectionSpec,
  ): Promise<ScheduledTaskDefinition | null>;
  upsert(
    context: RepositoryContext,
    task: ScheduledTaskDefinition,
    spec: ScheduledTaskDefinitionMutationSpec,
  ): Promise<void>;
  delete(context: RepositoryContext, spec: ScheduledTaskDefinitionMutationSpec): Promise<void>;
}

export interface PreviewEnvironmentRepository {
  findOne(
    context: RepositoryContext,
    spec: PreviewEnvironmentSelectionSpec,
  ): Promise<PreviewEnvironment | null>;
  upsert(
    context: RepositoryContext,
    previewEnvironment: PreviewEnvironment,
    spec: PreviewEnvironmentMutationSpec,
  ): Promise<void>;
  delete(context: RepositoryContext, spec: PreviewEnvironmentMutationSpec): Promise<void>;
}

export interface ScheduledTaskRunAttemptRepository {
  findOne(
    context: RepositoryContext,
    spec: ScheduledTaskRunAttemptSelectionSpec,
  ): Promise<ScheduledTaskRunAttempt | null>;
  upsert(
    context: RepositoryContext,
    runAttempt: ScheduledTaskRunAttempt,
    spec: ScheduledTaskRunAttemptMutationSpec,
  ): Promise<void>;
}

export interface ScheduledTaskDueCandidate {
  taskId: string;
  resourceId: string;
  scheduledFor: string;
}

export interface ScheduledTaskDueCandidateReader {
  listDue(
    context: RepositoryContext,
    input: {
      now: string;
      limit: number;
    },
  ): Promise<ScheduledTaskDueCandidate[]>;
}

export interface StorageVolumeRepository {
  findOne(
    context: RepositoryContext,
    spec: StorageVolumeSelectionSpec,
  ): Promise<StorageVolume | null>;
  upsert(
    context: RepositoryContext,
    storageVolume: StorageVolume,
    spec: StorageVolumeMutationSpec,
  ): Promise<void>;
}

export interface StorageVolumeBackupRepository {
  findOne(
    context: RepositoryContext,
    spec: StorageVolumeBackupSelectionSpec,
  ): Promise<StorageVolumeBackup | null>;
  findMany(
    context: RepositoryContext,
    spec: StorageVolumeBackupSelectionSpec,
  ): Promise<StorageVolumeBackup[]>;
  upsert(
    context: RepositoryContext,
    backup: StorageVolumeBackup,
    spec: StorageVolumeBackupMutationSpec,
  ): Promise<void>;
}

export interface DependencyResourceRepository {
  findOne(
    context: RepositoryContext,
    spec: ResourceInstanceSelectionSpec,
  ): Promise<ResourceInstance | null>;
  upsert(
    context: RepositoryContext,
    dependencyResource: ResourceInstance,
    spec: ResourceInstanceMutationSpec,
  ): Promise<void>;
}

export interface DependencyResourceBackupRepository {
  findOne(
    context: RepositoryContext,
    spec: DependencyResourceBackupSelectionSpec,
  ): Promise<DependencyResourceBackup | null>;
  findMany(
    context: RepositoryContext,
    spec: DependencyResourceBackupSelectionSpec,
  ): Promise<DependencyResourceBackup[]>;
  upsert(
    context: RepositoryContext,
    backup: DependencyResourceBackup,
    spec: DependencyResourceBackupMutationSpec,
  ): Promise<void>;
}

export interface ResourceDependencyBindingRepository {
  findOne(
    context: RepositoryContext,
    spec: ResourceBindingSelectionSpec,
  ): Promise<ResourceBinding | null>;
  upsert(
    context: RepositoryContext,
    resourceBinding: ResourceBinding,
    spec: ResourceBindingMutationSpec,
  ): Promise<void>;
}

export interface DeployTokenRepository {
  findOne(context: RepositoryContext, spec: DeployTokenSelectionSpec): Promise<DeployToken | null>;
  upsert(
    context: RepositoryContext,
    deployToken: DeployToken,
    spec: DeployTokenMutationSpec,
  ): Promise<void>;
  updateOne(
    context: RepositoryContext,
    deployToken: DeployToken,
    spec: DeployTokenMutationSpec,
  ): Promise<boolean>;
}

export interface DeployTokenScopeSummary {
  deploymentTargetIds: string[];
  environmentIds: string[];
  projectIds: string[];
  repositoryFullNames: string[];
  resourceIds: string[];
  workflowCommands: ActionDeployTokenWorkflow[];
}

export interface DeployTokenSummary {
  tokenId: string;
  organizationId: string;
  displayName: string;
  status: "active" | "revoked";
  secretSuffix: string;
  scope: DeployTokenScopeSummary;
  createdAt: string;
  expiresAt?: string;
  lastUsedAt?: string;
  rotatedAt?: string;
  revokedAt?: string;
}

export interface DeployTokenListInput {
  organizationId: string;
  limit?: number;
  repositoryFullName?: string;
  resourceId?: string;
  status?: "active" | "revoked";
}

export interface DeployTokenReadModel {
  list(context: RepositoryContext, input: DeployTokenListInput): Promise<DeployTokenSummary[]>;
  findOne(
    context: RepositoryContext,
    input: {
      organizationId: string;
      tokenId: string;
    },
  ): Promise<DeployTokenSummary | null>;
}

export type DependencyResourceDeleteBlockerKind =
  | "resource-binding"
  | "backup-relationship"
  | "dependency-resource-backup"
  | "provider-managed-unsafe"
  | "deployment-snapshot-reference";

export interface DependencyResourceDeleteBlocker {
  kind: DependencyResourceDeleteBlockerKind;
  relatedEntityId?: string;
  relatedEntityType?: string;
  count?: number;
}

export interface DependencyResourceDeleteSafetyReader {
  findBlockers(
    context: RepositoryContext,
    input: {
      dependencyResourceId: string;
    },
  ): Promise<Result<DependencyResourceDeleteBlocker[]>>;
}

export type ResourceDeletionBlockerKind =
  | "active-resource"
  | "runtime-instance"
  | "domain-binding"
  | "certificate"
  | "source-link"
  | "dependency-binding"
  | "terminal-session"
  | "runtime-log-retention"
  | "audit-retention"
  | "generated-access-route"
  | "server-applied-route"
  | "proxy-route";

export interface ResourceDeletionBlocker {
  kind: ResourceDeletionBlockerKind;
  relatedEntityId?: string;
  relatedEntityType?: string;
  count?: number;
}

export type ResourceDeleteBlockerKind = ResourceDeletionBlockerKind;

export interface ResourceDeleteBlocker {
  kind: ResourceDeleteBlockerKind;
  relatedEntityId?: string;
  relatedEntityType?: string;
  count?: number;
}

export interface ResourceDeleteSafety {
  schemaVersion: "resources.delete-check/v1";
  resourceId: string;
  lifecycleStatus: "active" | "archived";
  eligible: boolean;
  blockers: ResourceDeleteBlocker[];
  checkedAt: string;
}

export interface ResourceDeletionBlockerReader {
  findBlockers(
    context: RepositoryContext,
    input: {
      resourceId: string;
    },
  ): Promise<Result<ResourceDeletionBlocker[]>>;
}

export type ServerDeletionBlockerKind =
  | "deployment-history"
  | "active-deployment"
  | "resource-placement"
  | "domain-binding"
  | "certificate"
  | "credential"
  | "source-link"
  | "server-applied-route"
  | "default-access-policy"
  | "terminal-session"
  | "runtime-task"
  | "runtime-log-retention"
  | "audit-retention";

export interface ServerDeletionBlocker {
  kind: ServerDeletionBlockerKind;
  relatedEntityId?: string;
  relatedEntityType?: string;
  count?: number;
}

export interface ServerDeletionBlockerReader {
  findBlockers(
    context: RepositoryContext,
    input: {
      serverId: string;
    },
  ): Promise<Result<ServerDeletionBlocker[]>>;
}

export interface DeploymentRepository {
  findOne(context: RepositoryContext, spec: DeploymentSelectionSpec): Promise<Deployment | null>;
  insertOne(
    context: RepositoryContext,
    deployment: Deployment,
    spec: DeploymentMutationSpec,
  ): Promise<Result<void>>;
  updateOne(
    context: RepositoryContext,
    deployment: Deployment,
    spec: DeploymentMutationSpec,
  ): Promise<Result<void>>;
}

export interface DomainBindingRepository {
  findOne(
    context: RepositoryContext,
    spec: DomainBindingSelectionSpec,
  ): Promise<DomainBinding | null>;
  upsert(
    context: RepositoryContext,
    domainBinding: DomainBinding,
    spec: DomainBindingMutationSpec,
  ): Promise<void>;
}

export interface DomainRouteFailureCandidate {
  domainBindingId: string;
}

export interface DomainRouteFailureCandidateReader {
  listAffectedBindings(
    context: RepositoryContext,
    input: {
      deploymentId: string;
    },
  ): Promise<DomainRouteFailureCandidate[]>;
}

export type DomainOwnershipVerificationStatus =
  | "pending"
  | "matched"
  | "mismatch"
  | "unresolved"
  | "lookup_failed"
  | "skipped";

export interface DomainOwnershipVerificationResult {
  status: DomainOwnershipVerificationStatus;
  observedTargets: string[];
  message?: string;
}

export interface DomainOwnershipVerifier {
  verifyDns(
    context: ExecutionContext,
    input: {
      domainName: string;
      expectedTargets: string[];
    },
  ): Promise<DomainOwnershipVerificationResult>;
}

export interface DomainRouteBindingCandidate {
  id: string;
  domainName: string;
  pathPrefix: string;
  proxyKind: EdgeProxyKind;
  tlsMode: TlsMode;
  redirectTo?: string;
  redirectStatus?: 301 | 302 | 307 | 308;
  status: DomainBindingStatus;
  createdAt: string;
}

export interface DomainRouteBindingReader {
  listDeployableBindings(
    context: RepositoryContext,
    input: {
      projectId: string;
      environmentId: string;
      resourceId: string;
      serverId: string;
      destinationId: string;
    },
  ): Promise<DomainRouteBindingCandidate[]>;
}

export interface ServerAppliedRouteDesiredStateTarget {
  projectId: string;
  environmentId: string;
  resourceId: string;
  serverId: string;
  destinationId?: string;
}

export interface ServerAppliedRouteDesiredStateDomain {
  host: string;
  pathPrefix: string;
  tlsMode: TlsMode;
  redirectTo?: string;
  redirectStatus?: 301 | 302 | 307 | 308;
}

export type ServerAppliedRouteDesiredStateStatus = "desired" | "applied" | "failed";

export interface ServerAppliedRouteAppliedState {
  deploymentId: string;
  appliedAt: string;
  providerKey?: string;
  proxyKind?: EdgeProxyKind;
}

export interface ServerAppliedRouteFailureState {
  deploymentId: string;
  failedAt: string;
  phase: string;
  errorCode: string;
  message?: string;
  retryable: boolean;
  providerKey?: string;
  proxyKind?: EdgeProxyKind;
}

export interface ServerAppliedRouteDesiredStateRecord extends ServerAppliedRouteDesiredStateTarget {
  routeSetId: string;
  sourceFingerprint?: string;
  domains: ServerAppliedRouteDesiredStateDomain[];
  status: ServerAppliedRouteDesiredStateStatus;
  updatedAt: string;
  lastApplied?: ServerAppliedRouteAppliedState;
  lastFailure?: ServerAppliedRouteFailureState;
}

export interface ServerAppliedRouteDesiredStateReader {
  findOne(
    spec: ServerAppliedRouteStateSelectionSpec,
  ): Promise<Result<ServerAppliedRouteDesiredStateRecord | null>>;
}

export interface ServerAppliedRouteStateSelectionSpecVisitor<TResult> {
  visitServerAppliedRouteStateByTarget(
    query: TResult,
    spec: ServerAppliedRouteStateByTargetSpec,
  ): TResult;
  visitServerAppliedRouteStateByRouteSetId(
    query: TResult,
    spec: ServerAppliedRouteStateByRouteSetIdSpec,
  ): TResult;
  visitServerAppliedRouteStateBySourceFingerprint(
    query: TResult,
    spec: ServerAppliedRouteStateBySourceFingerprintSpec,
  ): TResult;
}

export interface ServerAppliedRouteStateUpsertSpecVisitor<TResult> {
  visitUpsertServerAppliedRouteDesiredState(
    spec: UpsertServerAppliedRouteDesiredStateSpec,
  ): TResult;
}

export interface ServerAppliedRouteStateUpdateSpecVisitor<TResult> {
  visitMarkServerAppliedRouteApplied(spec: MarkServerAppliedRouteAppliedSpec): TResult;
  visitMarkServerAppliedRouteFailed(spec: MarkServerAppliedRouteFailedSpec): TResult;
}

export interface ServerAppliedRouteStateSelectionSpec {
  accept<TResult>(
    query: TResult,
    visitor: ServerAppliedRouteStateSelectionSpecVisitor<TResult>,
  ): TResult;
}

export interface ServerAppliedRouteStateUpsertSpec {
  accept<TResult>(visitor: ServerAppliedRouteStateUpsertSpecVisitor<TResult>): TResult;
}

export interface ServerAppliedRouteStateUpdateSpec {
  accept<TResult>(visitor: ServerAppliedRouteStateUpdateSpecVisitor<TResult>): TResult;
}

export class ServerAppliedRouteStateByTargetSpec implements ServerAppliedRouteStateSelectionSpec {
  private constructor(public readonly target: ServerAppliedRouteDesiredStateTarget) {}

  static create(target: ServerAppliedRouteDesiredStateTarget): ServerAppliedRouteStateByTargetSpec {
    return new ServerAppliedRouteStateByTargetSpec(target);
  }

  accept<TResult>(
    query: TResult,
    visitor: ServerAppliedRouteStateSelectionSpecVisitor<TResult>,
  ): TResult {
    return visitor.visitServerAppliedRouteStateByTarget(query, this);
  }
}

export class ServerAppliedRouteStateByRouteSetIdSpec
  implements ServerAppliedRouteStateSelectionSpec
{
  private constructor(public readonly routeSetId: string) {}

  static create(routeSetId: string): ServerAppliedRouteStateByRouteSetIdSpec {
    return new ServerAppliedRouteStateByRouteSetIdSpec(routeSetId);
  }

  accept<TResult>(
    query: TResult,
    visitor: ServerAppliedRouteStateSelectionSpecVisitor<TResult>,
  ): TResult {
    return visitor.visitServerAppliedRouteStateByRouteSetId(query, this);
  }
}

export class ServerAppliedRouteStateBySourceFingerprintSpec
  implements ServerAppliedRouteStateSelectionSpec
{
  private constructor(public readonly sourceFingerprint: string) {}

  static create(sourceFingerprint: string): ServerAppliedRouteStateBySourceFingerprintSpec {
    return new ServerAppliedRouteStateBySourceFingerprintSpec(sourceFingerprint);
  }

  accept<TResult>(
    query: TResult,
    visitor: ServerAppliedRouteStateSelectionSpecVisitor<TResult>,
  ): TResult {
    return visitor.visitServerAppliedRouteStateBySourceFingerprint(query, this);
  }
}

export class UpsertServerAppliedRouteDesiredStateSpec implements ServerAppliedRouteStateUpsertSpec {
  private constructor(public readonly record: ServerAppliedRouteDesiredStateRecord) {}

  static fromRecord(
    record: ServerAppliedRouteDesiredStateRecord,
  ): UpsertServerAppliedRouteDesiredStateSpec {
    return new UpsertServerAppliedRouteDesiredStateSpec(record);
  }

  accept<TResult>(visitor: ServerAppliedRouteStateUpsertSpecVisitor<TResult>): TResult {
    return visitor.visitUpsertServerAppliedRouteDesiredState(this);
  }
}

export class MarkServerAppliedRouteAppliedSpec implements ServerAppliedRouteStateUpdateSpec {
  private constructor(
    public readonly deploymentId: string,
    public readonly updatedAt: string,
    public readonly providerKey?: string,
    public readonly proxyKind?: EdgeProxyKind,
  ) {}

  static create(input: {
    deploymentId: string;
    updatedAt: string;
    providerKey?: string;
    proxyKind?: EdgeProxyKind;
  }): MarkServerAppliedRouteAppliedSpec {
    return new MarkServerAppliedRouteAppliedSpec(
      input.deploymentId,
      input.updatedAt,
      input.providerKey,
      input.proxyKind,
    );
  }

  accept<TResult>(visitor: ServerAppliedRouteStateUpdateSpecVisitor<TResult>): TResult {
    return visitor.visitMarkServerAppliedRouteApplied(this);
  }
}

export class MarkServerAppliedRouteFailedSpec implements ServerAppliedRouteStateUpdateSpec {
  private constructor(
    public readonly deploymentId: string,
    public readonly updatedAt: string,
    public readonly phase: string,
    public readonly errorCode: string,
    public readonly retryable: boolean,
    public readonly message?: string,
    public readonly providerKey?: string,
    public readonly proxyKind?: EdgeProxyKind,
  ) {}

  static create(input: {
    deploymentId: string;
    updatedAt: string;
    phase: string;
    errorCode: string;
    retryable: boolean;
    message?: string;
    providerKey?: string;
    proxyKind?: EdgeProxyKind;
  }): MarkServerAppliedRouteFailedSpec {
    return new MarkServerAppliedRouteFailedSpec(
      input.deploymentId,
      input.updatedAt,
      input.phase,
      input.errorCode,
      input.retryable,
      input.message,
      input.providerKey,
      input.proxyKind,
    );
  }

  accept<TResult>(visitor: ServerAppliedRouteStateUpdateSpecVisitor<TResult>): TResult {
    return visitor.visitMarkServerAppliedRouteFailed(this);
  }
}

export interface ServerAppliedRouteStateRepository extends ServerAppliedRouteDesiredStateReader {
  upsert(
    record: ServerAppliedRouteDesiredStateRecord,
    spec: ServerAppliedRouteStateUpsertSpec,
  ): Promise<Result<ServerAppliedRouteDesiredStateRecord>>;
  updateOne(
    spec: ServerAppliedRouteStateSelectionSpec,
    updateSpec: ServerAppliedRouteStateUpdateSpec,
  ): Promise<Result<ServerAppliedRouteDesiredStateRecord | null>>;
  deleteOne(spec: ServerAppliedRouteStateSelectionSpec): Promise<Result<boolean>>;
  deleteMany(spec: ServerAppliedRouteStateSelectionSpec): Promise<Result<number>>;
}

export interface CertificateRepository {
  findOne(context: RepositoryContext, spec: CertificateSelectionSpec): Promise<Certificate | null>;
  upsert(
    context: RepositoryContext,
    certificate: Certificate,
    spec: CertificateMutationSpec,
  ): Promise<void>;
}

export interface CertificateRetryCandidate {
  certificateId: string;
  domainBindingId: string;
  domainName: string;
  attemptId: string;
  reason: CertificateIssueReason;
  providerKey: string;
  challengeType: string;
  requestedAt: string;
  failedAt?: string;
  retryAfter?: string;
}

export interface CertificateRetryCandidateReader {
  listDueRetries(
    context: RepositoryContext,
    input: {
      now: string;
      defaultRetryDelaySeconds: number;
      limit: number;
    },
  ): Promise<CertificateRetryCandidate[]>;
}

export interface CertificateProviderSelectionInput {
  domainBindingId: string;
  domainName: string;
  tlsMode: TlsMode;
  certificatePolicy: CertificatePolicy;
  providerKey?: string;
  challengeType?: string;
}

export interface CertificateProviderSelection {
  providerKey: string;
  challengeType: string;
}

export interface CertificateProviderSelectionPolicy {
  select(
    context: ExecutionContext,
    input: CertificateProviderSelectionInput,
  ): Promise<Result<CertificateProviderSelection, DomainError>>;
}

export interface CertificateProviderIssueInput {
  certificateId: string;
  domainBindingId: string;
  domainName: string;
  attemptId: string;
  reason: CertificateIssueReason;
  providerKey: string;
  challengeType: string;
  requestedAt: string;
}

export interface CertificateProviderIssueResult {
  certificateId: string;
  domainBindingId: string;
  domainName: string;
  attemptId: string;
  providerKey: string;
  issuedAt: string;
  expiresAt: string;
  fingerprint?: string;
  certificatePem: string;
  privateKeyPem: string;
  certificateChainPem?: string;
}

export interface CertificateProviderRevokeInput {
  certificateId: string;
  domainBindingId: string;
  domainName: string;
  providerKey: string;
  fingerprint?: string;
  reason?: string;
  revokedAt: string;
}

export interface CertificateProviderRevokeResult {
  certificateId: string;
  revokedAt: string;
  externalRevocation: "provider";
}

export interface CertificateProviderPort {
  issue(
    context: ExecutionContext,
    input: CertificateProviderIssueInput,
  ): Promise<Result<CertificateProviderIssueResult, DomainError>>;
  revoke(
    context: ExecutionContext,
    input: CertificateProviderRevokeInput,
  ): Promise<Result<CertificateProviderRevokeResult, DomainError>>;
}

export interface ImportedCertificateMaterialValidationInput {
  domainName: string;
  certificateChain: string;
  privateKey: string;
  passphrase?: string;
  importedAt: string;
}

export interface ImportedCertificateMaterialValidationResult {
  normalizedCertificateChain: string;
  normalizedPrivateKey: string;
  normalizedPassphrase?: string;
  normalizedMaterialFingerprint: string;
  notBefore: string;
  expiresAt: string;
  subjectAlternativeNames: string[];
  keyAlgorithm: string;
  issuer?: string;
  fingerprint?: string;
}

export interface CertificateMaterialValidator {
  validateImported(
    context: ExecutionContext,
    input: ImportedCertificateMaterialValidationInput,
  ): Promise<Result<ImportedCertificateMaterialValidationResult, DomainError>>;
}

export interface ImportedCertificateSecretStoreInput {
  certificateId: string;
  domainBindingId: string;
  domainName: string;
  attemptId: string;
  certificateChain: string;
  privateKey: string;
  passphrase?: string;
}

export interface ImportedCertificateSecretStoreResult {
  certificateChainRef: string;
  privateKeyRef: string;
  passphraseRef?: string;
}

export interface CertificateSecretStore {
  store(
    context: ExecutionContext,
    material: CertificateProviderIssueResult,
  ): Promise<Result<{ secretRef: string }, DomainError>>;
  storeImported(
    context: ExecutionContext,
    input: ImportedCertificateSecretStoreInput,
  ): Promise<Result<ImportedCertificateSecretStoreResult, DomainError>>;
  deactivate(
    context: ExecutionContext,
    input: {
      certificateId: string;
      domainBindingId: string;
      reason: "revoked" | "deleted";
      deactivatedAt: string;
    },
  ): Promise<Result<void, DomainError>>;
}

export interface DependencyBindingSecretStoreInput {
  bindingId: string;
  resourceId: string;
  secretValue: string;
  secretVersion: string;
  rotatedAt: string;
}

export interface DependencyBindingSecretStoreResult {
  secretRef: string;
  secretVersion: string;
}

export interface DependencyBindingSecretStore {
  store(
    context: ExecutionContext,
    input: DependencyBindingSecretStoreInput,
  ): Promise<Result<DependencyBindingSecretStoreResult, DomainError>>;
}

export interface DependencyResourceSecretStoreInput {
  dependencyResourceId: string;
  projectId: string;
  environmentId: string;
  kind: DependencyResourceKind;
  purpose: "connection";
  secretValue: string;
  storedAt: string;
}

export interface DependencyResourceSecretStoreResult {
  secretRef: string;
}

export interface DependencyResourceSecretResolutionInput {
  secretRef: string;
}

export interface DependencyResourceSecretResolutionResult {
  secretRef: string;
  secretValue: string;
}

export interface DependencyResourceSecretStore {
  storeConnection(
    context: ExecutionContext,
    input: DependencyResourceSecretStoreInput,
  ): Promise<Result<DependencyResourceSecretStoreResult, DomainError>>;
  resolve(
    context: ExecutionContext,
    input: DependencyResourceSecretResolutionInput,
  ): Promise<Result<DependencyResourceSecretResolutionResult, DomainError>>;
}

export interface CertificateHttpChallengeToken {
  domainName: string;
  token: string;
  keyAuthorization: string;
  publishedAt: string;
  expiresAt?: string;
  certificateId?: string;
  attemptId?: string;
  providerKey?: string;
}

export interface CertificateHttpChallengeTokenStore {
  publish(
    context: ExecutionContext,
    token: CertificateHttpChallengeToken,
  ): Promise<Result<CertificateHttpChallengeToken, DomainError>>;
  find(
    context: ExecutionContext,
    input: { token: string; domainName: string },
  ): Promise<Result<CertificateHttpChallengeToken | null, DomainError>>;
  remove(
    context: ExecutionContext,
    input: { token: string; domainName: string },
  ): Promise<Result<void, DomainError>>;
}

export interface ProjectSummary {
  id: string;
  organizationId?: string;
  name: string;
  slug: string;
  description?: string;
  lifecycleStatus: "active" | "archived";
  archivedAt?: string;
  archiveReason?: string;
  displayOrder?: number;
  createdAt: string;
}

export type ProjectListLifecycleStatus = ProjectSummary["lifecycleStatus"] | "all";

export interface ProjectDeleteSafety {
  schemaVersion: "projects.delete-check/v1";
  projectId: string;
  lifecycleStatus: "active" | "archived";
  eligible: boolean;
  blockers: ProjectDeleteBlocker[];
  checkedAt: string;
}

export interface ServerSummary {
  id: string;
  name: string;
  host: string;
  port: number;
  providerKey: string;
  targetKind: TargetKind;
  lifecycleStatus: "active" | "inactive";
  deactivatedAt?: string;
  deactivationReason?: string;
  edgeProxy?: {
    kind: EdgeProxyKind;
    status: EdgeProxyStatus;
    lastAttemptAt?: string;
    lastSucceededAt?: string;
    lastErrorCode?: string;
    lastErrorMessage?: string;
  };
  runtimeAvailability?: {
    status: "available" | "unavailable";
    reasonCodes: string[];
    message?: string;
  };
  displayOrder?: number;
  credential?: {
    kind: "local-ssh-agent" | "ssh-private-key";
    credentialId?: string;
    credentialName?: string;
    username?: string;
    publicKeyConfigured: boolean;
    privateKeyConfigured: boolean;
  };
  createdAt: string;
}

export interface ServerStatusCount<TStatus extends string> {
  status: TStatus;
  count: number;
}

export interface ServerRollups {
  resources: {
    total: number;
    deployedResourceIds: string[];
  };
  deployments: {
    total: number;
    statusCounts: Array<ServerStatusCount<DeploymentStatus>>;
    latestDeploymentId?: string;
    latestDeploymentStatus?: DeploymentStatus;
  };
  domains: {
    total: number;
    statusCounts: Array<ServerStatusCount<DomainBindingStatus>>;
    latestDomainBindingId?: string;
    latestDomainBindingStatus?: DomainBindingStatus;
  };
}

export interface ServerDetail {
  schemaVersion: "servers.show/v1";
  server: ServerSummary;
  rollups?: ServerRollups;
  generatedAt: string;
}

export type ServerDeleteBlockerKind = "active-server" | ServerDeletionBlockerKind;

export interface ServerDeleteBlocker {
  kind: ServerDeleteBlockerKind;
  relatedEntityId?: string;
  relatedEntityType?: string;
  count?: number;
}

export interface ServerDeleteSafety {
  schemaVersion: "servers.delete-check/v1";
  serverId: string;
  lifecycleStatus: "active" | "inactive";
  eligible: boolean;
  blockers: ServerDeleteBlocker[];
  checkedAt: string;
}

export type ServerConnectivityStatus = "passed" | "failed" | "skipped";

export interface SshCredentialSummary {
  id: string;
  name: string;
  kind: "ssh-private-key";
  username?: string;
  publicKeyConfigured: boolean;
  privateKeyConfigured: boolean;
  createdAt: string;
  rotatedAt?: string;
}

export interface SshCredentialUsageServerSummary {
  serverId: string;
  serverName: string;
  lifecycleStatus: "active" | "inactive";
  providerKey: string;
  host: string;
  username?: string;
}

export interface SshCredentialUsageSummary {
  totalServers: number;
  activeServers: number;
  inactiveServers: number;
  servers: SshCredentialUsageServerSummary[];
}

export interface SshCredentialDetail {
  schemaVersion: "credentials.show/v1";
  credential: SshCredentialSummary;
  usage?: SshCredentialUsageSummary;
  generatedAt: string;
}

export interface ServerConnectivityCheck {
  name: string;
  status: ServerConnectivityStatus;
  message: string;
  durationMs: number;
  metadata?: Record<string, string>;
}

export interface ServerConnectivityResult {
  serverId: string;
  name: string;
  host: string;
  port: number;
  providerKey: string;
  checkedAt: string;
  status: "healthy" | "degraded" | "unreachable";
  checks: ServerConnectivityCheck[];
}

export interface ServerRuntimePreparationStep {
  phase: "docker";
  status: "succeeded" | "failed" | "skipped";
  message: string;
  durationMs: number;
  metadata?: Record<string, string>;
}

export interface ServerRuntimePrepareResult {
  serverId: string;
  steps: ServerRuntimePreparationStep[];
}

export interface ServerRuntimePreparer {
  prepare(
    context: ExecutionContext,
    input: {
      server: DeploymentTargetState;
      mode: "prepare" | "repair" | "upgrade";
    },
  ): Promise<Result<ServerRuntimePrepareResult>>;
}

export interface RuntimeTargetDiskCapacity {
  path: string;
  mount: string;
  size: number;
  used: number;
  available: number;
  usePercent: number;
}

export interface RuntimeTargetInodeCapacity {
  path: string;
  mount: string;
  used: number;
  free: number;
  usePercent: number;
}

export interface RuntimeTargetDockerCapacity {
  imagesSize: number;
  reclaimableImagesSize: number;
  buildCacheSize: number;
  reclaimableBuildCacheSize: number;
  containersSize: number;
  volumesSize: number;
}

export interface RuntimeTargetPathCapacity {
  path: string;
  size: number | null;
  detectable: boolean;
}

export interface RuntimeTargetAppaloftCapacity {
  runtimeRoot: RuntimeTargetPathCapacity;
  stateRoot: RuntimeTargetPathCapacity;
  sourceWorkspace: RuntimeTargetPathCapacity;
}

export interface RuntimeTargetAppaloftContainerCapacity {
  id: string;
  name: string;
  running: boolean;
  status: string;
  writableBytes: number | null;
  deploymentId?: string;
  projectId?: string;
  environmentId?: string;
  resourceId?: string;
  serverId?: string;
  destinationId?: string;
  artifactKind?: string;
}

export interface RuntimeTargetAppaloftWorkspaceCapacity {
  deploymentId: string;
  path: string;
  bytes: number | null;
  activeMarker: boolean;
  rollbackCandidateMarker: boolean;
}

export interface RuntimeTargetSafeReclaimableEstimate {
  stoppedContainersSize: number;
  danglingImagesSize: number;
  oldBuildCacheSize: number;
  oldPreviewWorkspaceCandidatesSize: number;
  total: number;
}

export type RuntimeTargetCapacityWarningCode =
  | "full-disk"
  | "high-disk-usage"
  | "high-inode-usage"
  | "docker-unavailable"
  | "timeout"
  | "partial-diagnostic"
  | "unsupported-provider"
  | "audit-record-failed";

export interface RuntimeTargetCapacityWarning {
  code: RuntimeTargetCapacityWarningCode;
  message: string;
  path?: string;
  mount?: string;
  resource?: "disk" | "inode" | "docker" | "memory" | "cpu" | "appaloft-runtime";
}

export interface RuntimeTargetMemoryCapacity {
  total: number | null;
  available: number | null;
  used: number | null;
  usePercent: number | null;
}

export interface RuntimeTargetCpuCapacity {
  logicalCores: number | null;
  loadAverage1m: number | null;
  loadAverage5m: number | null;
  loadAverage15m: number | null;
}

export interface RuntimeTargetCapacityInspection {
  schemaVersion: "servers.capacity.inspect/v1";
  server: {
    id: string;
    name: string;
    host: string;
    port: number;
    providerKey: string;
    targetKind: string;
  };
  inspectedAt: string;
  disk: RuntimeTargetDiskCapacity[];
  inodes: RuntimeTargetInodeCapacity[];
  docker: RuntimeTargetDockerCapacity;
  memory: RuntimeTargetMemoryCapacity;
  cpu: RuntimeTargetCpuCapacity;
  appaloftRuntime: RuntimeTargetAppaloftCapacity;
  appaloftContainers: RuntimeTargetAppaloftContainerCapacity[];
  appaloftWorkspaces: RuntimeTargetAppaloftWorkspaceCapacity[];
  safeReclaimableEstimate: RuntimeTargetSafeReclaimableEstimate;
  warnings: RuntimeTargetCapacityWarning[];
  partial: boolean;
}

export interface RuntimeTargetCapacityInspector {
  inspect(
    context: ExecutionContext,
    input: {
      server: DeploymentTargetState;
      profile?: "full" | "attribution";
    },
  ): Promise<Result<RuntimeTargetCapacityInspection>>;
}

export type RuntimeUsageScope =
  | { kind: "server"; serverId: string }
  | { kind: "project"; projectId: string }
  | { kind: "environment"; environmentId: string }
  | { kind: "resource"; resourceId: string }
  | { kind: "deployment"; deploymentId: string };

export type RuntimeUsageFreshness = "live" | "recent-sample" | "stale" | "unknown";

export interface RuntimeCpuUsage {
  logicalCores?: number;
  loadAverage1m?: number;
  loadAverage5m?: number;
  loadAverage15m?: number;
  containerCpuPercent?: number;
}

export interface RuntimeMemoryUsage {
  totalBytes?: number;
  usedBytes?: number;
  availableBytes?: number;
  containerUsedBytes?: number;
}

export interface RuntimeDiskUsage {
  totalBytes?: number;
  usedBytes?: number;
  availableBytes?: number;
  attributedBytes?: number;
}

export interface RuntimeInodeUsage {
  total?: number;
  used?: number;
  available?: number;
}

export interface RuntimeDockerUsage {
  imageBytes?: number;
  buildCacheBytes?: number;
  containerWritableBytes?: number;
}

export interface RuntimeNetworkUsage {
  rxBytes?: number;
  txBytes?: number;
}

export interface RuntimeUsageTotals {
  cpu?: RuntimeCpuUsage;
  memory?: RuntimeMemoryUsage;
  disk?: RuntimeDiskUsage;
  inode?: RuntimeInodeUsage;
  docker?: RuntimeDockerUsage;
  network?: RuntimeNetworkUsage;
}

export type RuntimeUsageOwnership =
  | "attributed"
  | "partially-attributed"
  | "unattributed"
  | "unknown";

export interface RuntimeUsageWarning {
  code:
    | "partial-diagnostic"
    | "unsupported-provider"
    | "docker-unavailable"
    | "timeout"
    | "ownership-unproven"
    | "missing-metric-source"
    | "stale-observation";
  message: string;
  scope?: RuntimeUsageScope;
  resource?: "cpu" | "memory" | "disk" | "inode" | "docker" | "network" | "ownership";
}

export interface RuntimeUsageSourceError {
  source: "runtime-target" | "docker" | "read-model" | "capacity" | "workspace" | "unknown";
  code: string;
  message: string;
  retriable: boolean;
}

export interface RuntimeUsageRollup {
  scope: RuntimeUsageScope;
  ownership: RuntimeUsageOwnership;
  totals: RuntimeUsageTotals;
  currentDeploymentId?: string;
  currentRuntimeId?: string;
  artifactCount?: number;
  warnings: RuntimeUsageWarning[];
}

export type RuntimeUsageArtifactKind =
  | "active-runtime"
  | "rollback-candidate"
  | "source-workspace"
  | "docker-image"
  | "docker-build-cache"
  | "appaloft-state-root"
  | "volume"
  | "unknown";

export interface RuntimeUsageEvidence {
  source:
    | "label"
    | "deployment-snapshot"
    | "runtime-identity"
    | "workspace-metadata"
    | "read-model";
  key: string;
}

export interface RuntimeArtifactUsage {
  kind: RuntimeUsageArtifactKind;
  ownership: RuntimeUsageOwnership;
  serverId?: string;
  projectId?: string;
  environmentId?: string;
  resourceId?: string;
  deploymentId?: string;
  destinationId?: string;
  runtimeId?: string;
  bytes?: number;
  inodeCount?: number;
  observedAt?: string;
  evidence: RuntimeUsageEvidence[];
  reclaimable: "yes" | "no" | "unknown";
  reclaimBlockedReason?: string;
  warnings: RuntimeUsageWarning[];
}

export interface RuntimeUsageInspection {
  schemaVersion: "runtime-usage.inspect/v1";
  scope: RuntimeUsageScope;
  generatedAt: string;
  observedAt?: string;
  freshness: RuntimeUsageFreshness;
  partial: boolean;
  totals: RuntimeUsageTotals;
  byProject: RuntimeUsageRollup[];
  byEnvironment: RuntimeUsageRollup[];
  byResource: RuntimeUsageRollup[];
  byDeployment: RuntimeUsageRollup[];
  artifacts: RuntimeArtifactUsage[];
  warnings: RuntimeUsageWarning[];
  sourceErrors: RuntimeUsageSourceError[];
}

export interface RuntimeUsageInspectorInput {
  scope: RuntimeUsageScope;
  mode: "current";
  includeArtifacts: boolean;
  includeWarnings: boolean;
  collectionProfile?: "full" | "attribution";
}

export interface RuntimeUsageInspector {
  inspect(
    context: ExecutionContext,
    input: RuntimeUsageInspectorInput,
  ): Promise<Result<RuntimeUsageInspection>>;
}

export type RuntimeMonitoringScope = RuntimeUsageScope;
export type RuntimeMonitoringSignal = "cpu" | "memory" | "disk" | "inode" | "docker" | "network";
export type RuntimeMonitoringBucket = "minute" | "five-minute" | "hour";

export interface RuntimeMonitoringWindow {
  from: string;
  to: string;
}

export interface RuntimeMonitoringRetentionSummary {
  rawRetentionHours: number;
  retainedFrom?: string;
  retainedTo?: string;
}

export interface RuntimeMonitoringSafeLabels {
  providerKey?: string;
  artifactKind?: RuntimeUsageArtifactKind;
  runtimeId?: string;
}

export interface RuntimeMonitoringScopeEvidence {
  scope: RuntimeMonitoringScope;
  serverId?: string;
  projectId?: string;
  environmentId?: string;
  resourceId?: string;
  deploymentId?: string;
}

export interface RuntimeMonitoringWarning {
  code:
    | "missing-samples"
    | "partial-window"
    | "stale-samples"
    | "missing-metric-source"
    | "outside-retention";
  message: string;
  signal?: RuntimeMonitoringSignal;
  scope?: RuntimeMonitoringScope;
}

export interface RuntimeMonitoringSourceError {
  source: "monitoring-store" | "collector" | "read-model" | "unknown";
  code: string;
  message: string;
  retriable: boolean;
}

export interface RuntimeMonitoringSample {
  sampleId: string;
  observedAt: string;
  collectedAt: string;
  scopeEvidence: RuntimeMonitoringScopeEvidence;
  totals: RuntimeUsageTotals;
  freshness: RuntimeUsageFreshness;
  partial: boolean;
  labels: RuntimeMonitoringSafeLabels;
  warnings: RuntimeMonitoringWarning[];
  sourceErrors: RuntimeMonitoringSourceError[];
}

export interface RuntimeMonitoringSamplesReadInput {
  scope: RuntimeMonitoringScope;
  window: RuntimeMonitoringWindow;
  signals?: RuntimeMonitoringSignal[];
  limit: number;
}

export interface RuntimeMonitoringSamplesReadResult {
  retention: RuntimeMonitoringRetentionSummary;
  samples: RuntimeMonitoringSample[];
  warnings: RuntimeMonitoringWarning[];
  sourceErrors: RuntimeMonitoringSourceError[];
}

export interface RuntimeMonitoringSamplePruneInput {
  before: string;
  scope?: RuntimeMonitoringScope;
  limit?: number;
  dryRun: boolean;
}

export interface RuntimeMonitoringSamplePruneStoreResult {
  matchedCount: number;
  prunedCount: number;
}

export interface RuntimeMonitoringSampleRecord extends RuntimeMonitoringSample {
  retainedUntil: string;
}

export interface RuntimeMonitoringSampleWriteStore {
  record(
    context: RepositoryContext,
    sample: RuntimeMonitoringSampleRecord,
  ): Promise<Result<RuntimeMonitoringSample>>;
}

export interface RuntimeMonitoringSampleReadModel {
  listSamples(
    context: ExecutionContext,
    input: RuntimeMonitoringSamplesReadInput,
  ): Promise<Result<RuntimeMonitoringSamplesReadResult>>;
}

export interface RuntimeMonitoringSamplesWindow {
  schemaVersion: "runtime-monitoring.samples.list/v1";
  scope: RuntimeMonitoringScope;
  from: string;
  to: string;
  generatedAt: string;
  freshness: RuntimeUsageFreshness;
  partial: boolean;
  retention: RuntimeMonitoringRetentionSummary;
  samples: RuntimeMonitoringSample[];
  warnings: RuntimeMonitoringWarning[];
  sourceErrors: RuntimeMonitoringSourceError[];
}

export interface RuntimeMonitoringSeriesPoint {
  from: string;
  to: string;
  sampleCount: number;
  totals: RuntimeUsageTotals;
}

export interface RuntimeMonitoringSeries {
  signal: RuntimeMonitoringSignal;
  points: RuntimeMonitoringSeriesPoint[];
}

export interface RuntimeMonitoringContributor {
  scope: RuntimeMonitoringScope;
  totals: RuntimeUsageTotals;
  sampleCount: number;
}

export interface RuntimeMonitoringDeploymentMarker {
  deploymentId: string;
  resourceId?: string;
  environmentId?: string;
  observedAt: string;
  status: string;
  label: string;
  correlation: "time";
}

export interface RuntimeMonitoringMarkerReadModel {
  listDeploymentMarkers(
    context: ExecutionContext,
    input: { scope: RuntimeMonitoringScope; window: RuntimeMonitoringWindow },
  ): Promise<Result<RuntimeMonitoringDeploymentMarker[]>>;
}

export interface RuntimeMonitoringRollup {
  schemaVersion: "runtime-monitoring.rollup/v1";
  scope: RuntimeMonitoringScope;
  from: string;
  to: string;
  bucket: RuntimeMonitoringBucket;
  generatedAt: string;
  freshness: RuntimeUsageFreshness;
  partial: boolean;
  retention: RuntimeMonitoringRetentionSummary;
  series: RuntimeMonitoringSeries[];
  totals: RuntimeUsageTotals;
  topContributors: RuntimeMonitoringContributor[];
  deploymentMarkers: RuntimeMonitoringDeploymentMarker[];
  warnings: RuntimeMonitoringWarning[];
  sourceErrors: RuntimeMonitoringSourceError[];
}

export type RuntimeMonitoringThresholdMetric =
  | "containerCpuPercent"
  | "loadAverage1m"
  | "containerUsedBytes"
  | "usedBytes"
  | "attributedBytes"
  | "used"
  | "imageBytes"
  | "buildCacheBytes"
  | "containerWritableBytes"
  | "rxBytes"
  | "txBytes";

export interface RuntimeMonitoringThresholdRule {
  ruleId: string;
  signal: RuntimeMonitoringSignal;
  metric: RuntimeMonitoringThresholdMetric;
  warning?: number;
  critical?: number;
  comparator: "greater-than-or-equal";
}

export interface RuntimeMonitoringThresholdPolicyRecord {
  policyId: string;
  scope: RuntimeMonitoringScope;
  rules: RuntimeMonitoringThresholdRule[];
  enabled: boolean;
  updatedAt: string;
  updatedByActorId?: string;
  updatedByActorKind?: "deploy-token" | "system" | "user";
}

export interface RuntimeMonitoringThresholdPolicyRead {
  schemaVersion: "runtime-monitoring-thresholds.policy/v1";
  policyId: string;
  scope: RuntimeMonitoringScope;
  rules: RuntimeMonitoringThresholdRule[];
  enabled: boolean;
  updatedAt: string;
  updatedByActorId?: string;
  updatedByActorKind?: "deploy-token" | "system" | "user";
}

export interface RuntimeMonitoringThresholdCrossing {
  ruleId: string;
  signal: RuntimeMonitoringSignal;
  metric: RuntimeMonitoringThresholdMetric;
  severity: "warning" | "critical";
  observedValue: number;
  boundary: number;
}

export interface RuntimeMonitoringThresholdEvaluation {
  state: "ok" | "warning" | "critical" | "stale" | "unknown";
  evaluatedAt?: string;
  sourceSampleId?: string;
  crossed: RuntimeMonitoringThresholdCrossing[];
  nextActions: Array<
    | "inspect-runtime-usage"
    | "open-runtime-monitoring"
    | "inspect-capacity"
    | "review-runtime-logs"
    | "review-deployment-events"
    | "configure-thresholds"
  >;
  sourceErrors: RuntimeMonitoringSourceError[];
}

export interface RuntimeMonitoringThresholdsReadback {
  schemaVersion: "runtime-monitoring-thresholds.show/v1";
  scope: RuntimeMonitoringScope;
  generatedAt: string;
  policy: RuntimeMonitoringThresholdPolicyRead | null;
  evaluation: RuntimeMonitoringThresholdEvaluation;
}

export interface RuntimeMonitoringThresholdPolicyRepository {
  upsert(
    context: RepositoryContext,
    record: RuntimeMonitoringThresholdPolicyRecord,
  ): Promise<Result<RuntimeMonitoringThresholdPolicyRecord>>;
  findOne(
    context: RepositoryContext,
    input: { policyId?: string; scope?: RuntimeMonitoringScope },
  ): Promise<Result<RuntimeMonitoringThresholdPolicyRecord | null>>;
}

export type RuntimeTargetCapacityPruneCategory =
  | "stopped-containers"
  | "preview-workspaces"
  | "source-workspaces"
  | "docker-build-cache"
  | "unused-images"
  | "remote-state-markers";

export type RuntimeTargetCapacityPruneSkippedReason =
  | "active-runtime"
  | "rollback-candidate"
  | "cutoff-not-reached"
  | "ownership-unproven"
  | "unsupported-category"
  | "volume-excluded"
  | "state-root-excluded"
  | "remote-state-excluded"
  | "safety-evidence-missing";

export interface RuntimeTargetCapacityPruneCandidate {
  id: string;
  category: RuntimeTargetCapacityPruneCategory;
  target: string;
  updatedAt: string | null;
  size: number | null;
  action: "matched" | "pruned" | "skipped" | "excluded";
  skippedReason?: RuntimeTargetCapacityPruneSkippedReason;
}

export interface RuntimeTargetCapacityPruneSummary {
  inspectedCount: number;
  matchedCount: number;
  prunedCount: number;
  skippedCount: number;
  excludedCount: number;
  reclaimedBytes: number;
  reportedCandidateCount?: number;
  omittedCandidateCount?: number;
  outputLimit?: number;
}

export interface RuntimeTargetCapacityPruneResult {
  schemaVersion: "servers.capacity.prune/v1";
  server: {
    id: string;
    name: string;
    host: string;
    port: number;
    providerKey: string;
    targetKind: string;
  };
  before: string;
  categories: RuntimeTargetCapacityPruneCategory[];
  dryRun: boolean;
  prunedAt: string;
  summary: RuntimeTargetCapacityPruneSummary;
  candidates: RuntimeTargetCapacityPruneCandidate[];
  warnings: RuntimeTargetCapacityWarning[];
}

export interface RuntimeTargetCapacityPruner {
  prune(
    context: ExecutionContext,
    input: {
      server: DeploymentTargetState;
      before: string;
      categories: RuntimeTargetCapacityPruneCategory[];
      target?: string;
      dryRun: boolean;
    },
  ): Promise<Result<RuntimeTargetCapacityPruneResult>>;
}

export type StorageRuntimeCleanupCandidateKind = "named-volume" | "bind-mount";

export type StorageRuntimeCleanupCandidateAction = "matched" | "cleaned" | "skipped" | "blocked";

export type StorageRuntimeCleanupBlockedReason =
  | "active-attachment"
  | "active-runtime"
  | "retained-snapshot"
  | "rollback-candidate"
  | "backup-restore-in-flight"
  | "backup-retention"
  | "bind-mount-unsupported"
  | "provider-blocked"
  | "cutoff-not-reached"
  | "ownership-unproven"
  | "safety-evidence-missing";

export interface StorageRuntimeCleanupCandidate {
  id: string;
  kind: StorageRuntimeCleanupCandidateKind;
  target: string;
  updatedAt: string | null;
  action: StorageRuntimeCleanupCandidateAction;
  blockedReason?: StorageRuntimeCleanupBlockedReason;
}

export interface StorageRuntimeCleanupSummary {
  inspectedCount: number;
  matchedCount: number;
  cleanedCount: number;
  skippedCount: number;
  blockedCount: number;
}

export interface StorageRuntimeCleanupWarning {
  code: string;
  message: string;
  target?: string;
}

export interface StorageRuntimeCleanupSafetyEvidence {
  activeAttachmentCount: number;
  backupRetentionRequired: boolean;
  backupRestoreInFlightCount: number;
  retainedSnapshotCount: number;
  rollbackCandidateCount: number;
}

export interface StorageVolumeBackupSafetyEvidence {
  backupRetentionRequired: boolean;
  backupRestoreInFlightCount: number;
}

export interface StorageVolumeBackupSafetyReader {
  findSafetyEvidence(
    context: RepositoryContext,
    input: {
      storageVolumeId: string;
    },
  ): Promise<Result<StorageVolumeBackupSafetyEvidence>>;
}

export interface StorageRuntimeCleanupResult {
  schemaVersion: "storage-volumes.cleanup-runtime/v1";
  storageVolume: {
    id: string;
    name: string;
    kind: StorageVolumeKind;
  };
  server: {
    id: string;
    name: string;
    host: string;
    port: number;
    providerKey: string;
    targetKind: string;
  };
  before: string;
  dryRun: boolean;
  cleanedAt: string;
  summary: StorageRuntimeCleanupSummary;
  candidates: StorageRuntimeCleanupCandidate[];
  warnings: StorageRuntimeCleanupWarning[];
}

export interface StorageRuntimeCleaner {
  cleanup(
    context: ExecutionContext,
    input: {
      server: DeploymentTargetState;
      storageVolume: StorageVolumeState;
      before: string;
      dryRun: boolean;
      safetyEvidence: StorageRuntimeCleanupSafetyEvidence;
    },
  ): Promise<Result<StorageRuntimeCleanupResult>>;
}

export interface ServerEdgeProxyBootstrapResult {
  serverId: string;
  kind: EdgeProxyKind;
  status: "ready" | "failed";
  attemptedAt: string;
  message: string;
  errorCode?: string;
  metadata?: Record<string, string>;
}

export interface ServerEdgeProxyBootstrapper {
  bootstrap(
    context: ExecutionContext,
    input: {
      server: DeploymentTargetState;
    },
  ): Promise<Result<ServerEdgeProxyBootstrapResult>>;
}

export interface EdgeProxyProviderCapabilities {
  ensureProxy: boolean;
  dockerLabels: boolean;
  reloadProxy: boolean;
  configurationView: boolean;
  runtimeLogs: boolean;
  diagnostics: boolean;
}

export interface EdgeProxyProviderSelectionInput {
  proxyKind?: EdgeProxyKind;
  providerKey?: string;
}

export interface EdgeProxyExecutionContext {
  correlationId: string;
  causationId?: string;
  server?: DeploymentTargetState;
  resource?: ResourceSummary;
  deployment?: DeploymentSummary;
}

export interface EdgeProxyEnsureInput {
  proxyKind: EdgeProxyKind;
  httpPort?: number;
  httpsPort?: number;
}

export interface EdgeProxyEnsurePlan {
  providerKey: string;
  proxyKind: EdgeProxyKind;
  displayName: string;
  networkName: string;
  networkCommand: string;
  containerName: string;
  containerCommand: string;
  metadata?: Record<string, string>;
}

export interface EdgeProxyDiagnosticCheckPlan {
  name: string;
  command: string;
  timeoutMs: number;
  successMessage: string;
  failureMessage: string;
  metadata?: Record<string, string>;
}

export interface EdgeProxyDiagnosticsPlan {
  providerKey: string;
  proxyKind: EdgeProxyKind;
  displayName: string;
  checks: EdgeProxyDiagnosticCheckPlan[];
  metadata?: Record<string, string>;
}

export interface EdgeProxyDiagnosticsInput {
  proxyKind: EdgeProxyKind;
  httpPort?: number;
  httpsPort?: number;
}

export interface EdgeProxyRouteInput {
  proxyKind: EdgeProxyKind;
  domains: string[];
  pathPrefix: string;
  tlsMode: TlsMode;
  targetPort?: number;
  providerKey?: string;
  source?: "generated-default" | "domain-binding" | "deployment-snapshot" | "server-applied";
  routeBehavior?: "serve" | "redirect";
  redirectTo?: string;
  redirectStatus?: 301 | 302 | 307 | 308;
  appliedRouteContext?: AppliedRouteContextMetadata;
  appliedRouteContexts?: AppliedRouteContextMetadata[];
}

export interface ResourceAccessFailureRendererTarget {
  url: string;
  middlewareName?: string;
  serviceName?: string;
}

export interface ProxyRouteRealizationInput {
  deploymentId: string;
  port: number;
  accessRoutes: EdgeProxyRouteInput[];
  resourceAccessFailureRenderer?: ResourceAccessFailureRendererTarget;
}

export interface ProxyRouteRealizationPlan {
  providerKey: string;
  networkName?: string;
  labels: string[];
  metadata?: Record<string, string>;
}

export type ProxyReloadReason =
  | "route-realization"
  | "certificate-issued"
  | "certificate-imported"
  | "certificate-renewal"
  | "manual-repair";

export type ProxyReloadMode = "automatic" | "command";

export interface ProxyReloadStepPlan {
  name: string;
  mode: ProxyReloadMode;
  command?: string;
  timeoutMs?: number;
  successMessage: string;
  failureMessage?: string;
  metadata?: Record<string, string>;
}

export interface ProxyReloadInput {
  proxyKind: EdgeProxyKind;
  deploymentId: string;
  accessRoutes: EdgeProxyRouteInput[];
  routePlan: ProxyRouteRealizationPlan;
  reason: ProxyReloadReason;
}

export interface ProxyReloadPlan {
  providerKey: string;
  proxyKind: EdgeProxyKind;
  displayName: string;
  required: boolean;
  steps: ProxyReloadStepPlan[];
  metadata?: Record<string, string>;
}

export type ProxyConfigurationRouteScope = "planned" | "latest" | "deployment-snapshot";
export type ProxyConfigurationStatus =
  | "not-configured"
  | "planned"
  | "applied"
  | "stale"
  | "failed";

export interface ProxyConfigurationRouteView {
  hostname: string;
  scheme: "http" | "https";
  url: string;
  pathPrefix: string;
  tlsMode: TlsMode;
  targetPort?: number;
  source: "generated-default" | "domain-binding" | "deployment-snapshot" | "server-applied";
  routeBehavior?: "serve" | "redirect";
  redirectTo?: string;
  redirectStatus?: 301 | 302 | 307 | 308;
  appliedRouteContext?: AppliedRouteContextMetadata;
}

export interface ProxyConfigurationSection {
  id: string;
  title: string;
  format: "docker-labels" | "file" | "command" | "yaml" | "json" | "text";
  language?: string;
  readonly: true;
  redacted: boolean;
  content: string;
  source: "provider-rendered" | "snapshot" | "diagnostic";
}

export interface ProxyConfigurationWarning {
  code: string;
  message: string;
  details?: Record<string, string | number | boolean | null>;
}

export type ProxyConfigurationTlsAutomation = "disabled" | "provider-local";
export type ProxyConfigurationTlsCertificateSource = "none" | "provider-local";

export interface ProxyConfigurationTlsDiagnostic {
  hostname: string;
  pathPrefix: string;
  tlsMode: TlsMode;
  scheme: "http" | "https";
  automation: ProxyConfigurationTlsAutomation;
  certificateSource: ProxyConfigurationTlsCertificateSource;
  appaloftCertificateManaged: boolean;
  message: string;
  details?: Record<string, string>;
}

export interface ProxyConfigurationDiagnostics {
  providerKey: string;
  routeCount: number;
  networkName?: string;
  tlsRoutes?: ProxyConfigurationTlsDiagnostic[];
  appliedRouteContexts?: AppliedRouteContextMetadata[];
  metadata?: Record<string, string>;
}

export interface ProxyConfigurationView {
  resourceId: string;
  deploymentId?: string;
  providerKey: string;
  routeScope: ProxyConfigurationRouteScope;
  status: ProxyConfigurationStatus;
  generatedAt: string;
  lastAppliedDeploymentId?: string;
  stale: boolean;
  routes: ProxyConfigurationRouteView[];
  sections: ProxyConfigurationSection[];
  warnings: ProxyConfigurationWarning[];
  diagnostics?: ProxyConfigurationDiagnostics;
}

export interface ProxyConfigurationViewInput {
  resourceId: string;
  deploymentId?: string;
  routeScope: ProxyConfigurationRouteScope;
  status: ProxyConfigurationStatus;
  generatedAt: string;
  lastAppliedDeploymentId?: string;
  stale: boolean;
  accessRoutes: EdgeProxyRouteInput[];
  port: number;
  includeDiagnostics: boolean;
  resourceAccessFailureRenderer?: ResourceAccessFailureRendererTarget;
}

export interface EdgeProxyProvider {
  key: string;
  displayName: string;
  capabilities: EdgeProxyProviderCapabilities;
  ensureProxy(
    context: EdgeProxyExecutionContext,
    input: EdgeProxyEnsureInput,
  ): Promise<Result<EdgeProxyEnsurePlan, DomainError>>;
  diagnoseProxy(
    context: EdgeProxyExecutionContext,
    input: EdgeProxyDiagnosticsInput,
  ): Promise<Result<EdgeProxyDiagnosticsPlan, DomainError>>;
  realizeRoutes(
    context: EdgeProxyExecutionContext,
    input: ProxyRouteRealizationInput,
  ): Promise<Result<ProxyRouteRealizationPlan, DomainError>>;
  reloadProxy(
    context: EdgeProxyExecutionContext,
    input: ProxyReloadInput,
  ): Promise<Result<ProxyReloadPlan, DomainError>>;
  renderConfigurationView(
    context: EdgeProxyExecutionContext,
    input: ProxyConfigurationViewInput,
  ): Promise<Result<ProxyConfigurationView, DomainError>>;
}

export interface EdgeProxyProviderRegistry {
  resolve(key: string): Result<EdgeProxyProvider, DomainError>;
  defaultFor(input: EdgeProxyProviderSelectionInput): Result<EdgeProxyProvider | null, DomainError>;
}

export type DeploymentHealthCheckStatus = "passed" | "failed" | "skipped";

export interface DeploymentHealthCheck {
  name: string;
  status: DeploymentHealthCheckStatus;
  message: string;
  durationMs: number;
  metadata?: Record<string, string>;
}

export interface DeploymentHealthResult {
  deploymentId: string;
  checkedAt: string;
  status: "healthy" | "degraded" | "unreachable";
  checks: DeploymentHealthCheck[];
}

export interface EnvironmentSummary {
  id: string;
  projectId: string;
  name: string;
  kind: EnvironmentKind;
  parentEnvironmentId?: string;
  lifecycleStatus: EnvironmentLifecycleStatus;
  lockedAt?: string;
  lockReason?: string;
  archivedAt?: string;
  archiveReason?: string;
  createdAt: string;
  maskedVariables: Array<{
    key: string;
    value: string;
    scope: ConfigScope;
    exposure: VariableExposure;
    isSecret: boolean;
    kind: VariableKind;
  }>;
}

export interface EnvironmentConfigEntryView {
  key: string;
  value: string;
  scope: ConfigScope;
  exposure: VariableExposure;
  isSecret: boolean;
  kind: VariableKind;
  updatedAt?: string;
}

export interface EnvironmentEffectivePrecedenceView {
  schemaVersion: "environments.effective-precedence/v1";
  environmentId: string;
  projectId: string;
  ownedEntries: EnvironmentConfigEntryView[];
  effectiveEntries: EnvironmentConfigEntryView[];
  precedence: ConfigScope[];
  generatedAt: string;
}

export interface ResourceSummary {
  id: string;
  projectId: string;
  environmentId: string;
  destinationId?: string | undefined;
  name: string;
  slug: string;
  kind: ResourceKind;
  description?: string;
  createdAt: string;
  services: Array<{
    name: string;
    kind: ResourceServiceKind;
  }>;
  networkProfile?:
    | {
        internalPort: number;
        upstreamProtocol: ResourceNetworkProtocol;
        exposureMode: ResourceExposureMode;
        targetServiceName?: string;
        hostPort?: number;
      }
    | undefined;
  accessProfile?: ResourceAccessProfile;
  deploymentCount: number;
  lastDeploymentId?: string;
  lastDeploymentStatus?: DeploymentStatus;
  latestRuntimeControl?: ResourceRuntimeControlSummary;
  accessSummary?: ResourceAccessSummary;
}

export interface ResourceStorageAttachmentSummary {
  id: string;
  storageVolumeId: string;
  storageVolumeName?: string;
  storageVolumeKind?: StorageVolumeKind;
  destinationPath: string;
  mountMode: "read-write" | "read-only";
  dataFormat?: StorageVolumeBackupDataFormat;
  applicationDataLabel?: string;
  attachedAt: string;
}

export interface ResourceAccessRouteSummary {
  url: string;
  hostname: string;
  scheme: "http" | "https";
  providerKey?: string;
  deploymentId: string;
  deploymentStatus: DeploymentStatus;
  pathPrefix: string;
  proxyKind: EdgeProxyKind;
  targetPort?: number;
  updatedAt: string;
}

export interface ResourceStaticArtifactAccessRouteSummary {
  url: string;
  hostname: string;
  scheme: "http" | "https";
  providerKey?: string;
  targetPort?: number;
  publicationId: string;
  artifactId: string;
  pathPrefix: string;
  fileCount?: number;
  totalBytes?: number;
  updatedAt?: string;
}

export interface PlannedResourceAccessRouteSummary {
  url: string;
  hostname: string;
  scheme: "http" | "https";
  providerKey?: string;
  pathPrefix: string;
  proxyKind: EdgeProxyKind;
  targetPort: number;
}

export interface ResourceAccessSummary {
  plannedGeneratedAccessRoute?: PlannedResourceAccessRouteSummary;
  latestGeneratedAccessRoute?: ResourceAccessRouteSummary;
  latestDurableDomainRoute?: ResourceAccessRouteSummary;
  latestServerAppliedDomainRoute?: ResourceAccessRouteSummary;
  latestStaticArtifactRoute?: ResourceStaticArtifactAccessRouteSummary;
  proxyRouteStatus?: "unknown" | "ready" | "not-ready" | "failed";
  lastRouteRealizationDeploymentId?: string;
  latestAccessFailureDiagnostic?: ResourceAccessFailureDiagnostic;
}

export type ResourceAccessFailureEvidenceMatchedSource = "short-retention-evidence-read-model";

export interface ResourceAccessFailureEvidenceRelatedIds {
  resourceId?: string;
  deploymentId?: string;
  domainBindingId?: string;
  serverId?: string;
  destinationId?: string;
  routeId?: string;
}

export interface ResourceAccessFailureEvidenceRecord {
  requestId: string;
  diagnostic: ResourceAccessFailureDiagnostic;
  capturedAt: string;
  expiresAt: string;
}

export interface ResourceAccessFailureEvidenceLookupFilters {
  resourceId?: string;
  hostname?: string;
  path?: string;
}

export interface ResourceAccessFailureEvidenceLookupNotFound {
  code: "resource_access_failure_evidence_not_found";
  phase: "evidence-lookup";
  message: string;
}

export type ResourceAccessFailureEvidenceLookup =
  | {
      schemaVersion: "resources.access-failure-evidence.lookup/v1";
      requestId: string;
      status: "found";
      generatedAt: string;
      filters?: ResourceAccessFailureEvidenceLookupFilters;
      matchedSource: ResourceAccessFailureEvidenceMatchedSource;
      evidence: ResourceAccessFailureDiagnostic;
      relatedIds?: ResourceAccessFailureEvidenceRelatedIds;
      nextAction: ResourceAccessFailureDiagnostic["nextAction"];
      capturedAt: string;
      expiresAt: string;
    }
  | {
      schemaVersion: "resources.access-failure-evidence.lookup/v1";
      requestId: string;
      status: "not-found";
      generatedAt: string;
      filters?: ResourceAccessFailureEvidenceLookupFilters;
      nextAction: "diagnostic-summary";
      notFound: ResourceAccessFailureEvidenceLookupNotFound;
    };

export interface ResourceAccessFailureEvidenceRecordInput {
  diagnostic: ResourceAccessFailureDiagnostic;
  capturedAt: string;
  expiresAt: string;
}

export interface ResourceAccessFailureEvidenceSelectionSpecVisitor<TResult> {
  visitResourceAccessFailureEvidenceByRequestId(
    query: TResult,
    spec: ResourceAccessFailureEvidenceByRequestIdSpec,
  ): TResult;
  visitResourceAccessFailureEvidenceByResourceId(
    query: TResult,
    spec: ResourceAccessFailureEvidenceByResourceIdSpec,
  ): TResult;
  visitResourceAccessFailureEvidenceByHostname(
    query: TResult,
    spec: ResourceAccessFailureEvidenceByHostnameSpec,
  ): TResult;
  visitResourceAccessFailureEvidenceByPath(
    query: TResult,
    spec: ResourceAccessFailureEvidenceByPathSpec,
  ): TResult;
  visitResourceAccessFailureEvidenceUnexpiredAt(
    query: TResult,
    spec: ResourceAccessFailureEvidenceUnexpiredAtSpec,
  ): TResult;
  visitAndResourceAccessFailureEvidenceSelectionSpec(
    query: TResult,
    spec: AndResourceAccessFailureEvidenceSelectionSpec,
  ): TResult;
}

export interface ResourceAccessFailureEvidenceSelectionSpec {
  accept<TResult>(
    query: TResult,
    visitor: ResourceAccessFailureEvidenceSelectionSpecVisitor<TResult>,
  ): TResult;
  and(
    other: ResourceAccessFailureEvidenceSelectionSpec,
  ): ResourceAccessFailureEvidenceSelectionSpec;
}

abstract class BaseResourceAccessFailureEvidenceSelectionSpec
  implements ResourceAccessFailureEvidenceSelectionSpec
{
  abstract accept<TResult>(
    query: TResult,
    visitor: ResourceAccessFailureEvidenceSelectionSpecVisitor<TResult>,
  ): TResult;

  and(
    other: ResourceAccessFailureEvidenceSelectionSpec,
  ): ResourceAccessFailureEvidenceSelectionSpec {
    return AndResourceAccessFailureEvidenceSelectionSpec.create(this, other);
  }
}

export class ResourceAccessFailureEvidenceByRequestIdSpec extends BaseResourceAccessFailureEvidenceSelectionSpec {
  private constructor(public readonly requestId: string) {
    super();
  }

  static create(requestId: string): ResourceAccessFailureEvidenceByRequestIdSpec {
    return new ResourceAccessFailureEvidenceByRequestIdSpec(requestId);
  }

  accept<TResult>(
    query: TResult,
    visitor: ResourceAccessFailureEvidenceSelectionSpecVisitor<TResult>,
  ): TResult {
    return visitor.visitResourceAccessFailureEvidenceByRequestId(query, this);
  }
}

export class ResourceAccessFailureEvidenceByResourceIdSpec extends BaseResourceAccessFailureEvidenceSelectionSpec {
  private constructor(public readonly resourceId: string) {
    super();
  }

  static create(resourceId: string): ResourceAccessFailureEvidenceByResourceIdSpec {
    return new ResourceAccessFailureEvidenceByResourceIdSpec(resourceId);
  }

  accept<TResult>(
    query: TResult,
    visitor: ResourceAccessFailureEvidenceSelectionSpecVisitor<TResult>,
  ): TResult {
    return visitor.visitResourceAccessFailureEvidenceByResourceId(query, this);
  }
}

export class ResourceAccessFailureEvidenceByHostnameSpec extends BaseResourceAccessFailureEvidenceSelectionSpec {
  private constructor(public readonly hostname: string) {
    super();
  }

  static create(hostname: string): ResourceAccessFailureEvidenceByHostnameSpec {
    return new ResourceAccessFailureEvidenceByHostnameSpec(hostname);
  }

  accept<TResult>(
    query: TResult,
    visitor: ResourceAccessFailureEvidenceSelectionSpecVisitor<TResult>,
  ): TResult {
    return visitor.visitResourceAccessFailureEvidenceByHostname(query, this);
  }
}

export class ResourceAccessFailureEvidenceByPathSpec extends BaseResourceAccessFailureEvidenceSelectionSpec {
  private constructor(public readonly path: string) {
    super();
  }

  static create(path: string): ResourceAccessFailureEvidenceByPathSpec {
    return new ResourceAccessFailureEvidenceByPathSpec(path);
  }

  accept<TResult>(
    query: TResult,
    visitor: ResourceAccessFailureEvidenceSelectionSpecVisitor<TResult>,
  ): TResult {
    return visitor.visitResourceAccessFailureEvidenceByPath(query, this);
  }
}

export class ResourceAccessFailureEvidenceUnexpiredAtSpec extends BaseResourceAccessFailureEvidenceSelectionSpec {
  private constructor(public readonly at: string) {
    super();
  }

  static create(at: string): ResourceAccessFailureEvidenceUnexpiredAtSpec {
    return new ResourceAccessFailureEvidenceUnexpiredAtSpec(at);
  }

  accept<TResult>(
    query: TResult,
    visitor: ResourceAccessFailureEvidenceSelectionSpecVisitor<TResult>,
  ): TResult {
    return visitor.visitResourceAccessFailureEvidenceUnexpiredAt(query, this);
  }
}

export class AndResourceAccessFailureEvidenceSelectionSpec extends BaseResourceAccessFailureEvidenceSelectionSpec {
  private constructor(
    public readonly left: ResourceAccessFailureEvidenceSelectionSpec,
    public readonly right: ResourceAccessFailureEvidenceSelectionSpec,
  ) {
    super();
  }

  static create(
    left: ResourceAccessFailureEvidenceSelectionSpec,
    right: ResourceAccessFailureEvidenceSelectionSpec,
  ): AndResourceAccessFailureEvidenceSelectionSpec {
    return new AndResourceAccessFailureEvidenceSelectionSpec(left, right);
  }

  accept<TResult>(
    query: TResult,
    visitor: ResourceAccessFailureEvidenceSelectionSpecVisitor<TResult>,
  ): TResult {
    return visitor.visitAndResourceAccessFailureEvidenceSelectionSpec(query, this);
  }
}

export interface ResourceAccessFailureEvidenceRecorder {
  record(
    context: RepositoryContext,
    input: ResourceAccessFailureEvidenceRecordInput,
  ): Promise<Result<ResourceAccessFailureEvidenceRecord>>;
}

export interface ResourceAccessFailureEvidenceReadModel {
  findOne(
    context: RepositoryContext,
    spec: ResourceAccessFailureEvidenceSelectionSpec,
  ): Promise<Result<ResourceAccessFailureEvidenceRecord | null>>;
}

export type RouteIntentStatusSource =
  | "generated-default-access"
  | "durable-domain-binding"
  | "server-applied-route"
  | "deployment-snapshot-route";

export type RouteAccessBlockingReason =
  | "runtime_not_ready"
  | "health_check_failing"
  | "proxy_route_missing"
  | "proxy_route_stale"
  | "domain_not_verified"
  | "certificate_missing"
  | "certificate_expired_or_not_active"
  | "dns_points_elsewhere"
  | "server_applied_route_unavailable"
  | "observation_unavailable";

export interface RouteIntentStatusDescriptor {
  schemaVersion: "route-intent-status/v1";
  routeId: string;
  diagnosticId: string;
  source: RouteIntentStatusSource;
  intent: {
    host: string;
    pathPrefix: string;
    protocol: "http" | "https";
    routeBehavior: "serve" | "redirect";
    redirectTo?: string;
    redirectStatus?: 301 | 302 | 307 | 308;
  };
  context: {
    resourceId: string;
    deploymentId?: string;
    serverId?: string;
    destinationId?: string;
    runtimeTargetKind?: string;
  };
  proxy: {
    intent: "not-required" | "required" | "unknown";
    applied:
      | "not-configured"
      | "planned"
      | "applied"
      | "ready"
      | "not-ready"
      | "stale"
      | "failed"
      | "unknown";
    providerKey?: string;
  };
  domainVerification: "not-applicable" | "pending" | "verified" | "failed" | "unknown";
  tls:
    | "not-applicable"
    | "disabled"
    | "pending"
    | "active"
    | "missing"
    | "expired"
    | "failed"
    | "unknown";
  runtimeHealth: ResourceHealthOverall;
  latestObservation?: {
    source:
      | "resource-access-summary"
      | "proxy-preview"
      | "resource-health"
      | "runtime-logs"
      | "access-failure-diagnostic"
      | "deployment-snapshot";
    observedAt?: string;
    requestId?: string;
    deploymentId?: string;
  };
  blockingReason?: RouteAccessBlockingReason;
  recommendedAction:
    | "none"
    | "wait"
    | "check-health"
    | "inspect-logs"
    | "inspect-proxy-preview"
    | "diagnostic-summary"
    | "verify-domain"
    | "fix-dns"
    | "provide-certificate"
    | "repair-proxy"
    | "manual-review";
  copySafeSummary: {
    status: "available" | "unavailable" | "not-ready" | "failed" | "stale" | "unknown";
    code?: string;
    phase?: string;
    message: string;
  };
}

export interface ResourceDetailIdentity {
  id: string;
  projectId: string;
  environmentId: string;
  destinationId?: string;
  name: string;
  slug: string;
  kind: ResourceKind;
  description?: string;
  createdAt: string;
  services: Array<{
    name: string;
    kind: ResourceServiceKind;
  }>;
  deploymentCount: number;
  lastDeploymentId?: string;
  lastDeploymentStatus?: DeploymentStatus;
}

export interface ResourceDetailSourceProfile {
  kind: SourceKind;
  locator: string;
  displayName: string;
  sourceBindingFingerprint: string;
  gitRef?: string;
  commitSha?: string;
  baseDirectory?: string;
  originalLocator?: string;
  repositoryId?: string;
  repositoryFullName?: string;
  defaultBranch?: string;
  imageName?: string;
  imageTag?: string;
  imageDigest?: string;
  version?: string;
  versionKind?: VersionReferenceKind;
  metadata?: Record<string, string>;
}

export interface ResourceDetailAutoDeployPolicy {
  status: "enabled" | "disabled" | "blocked";
  triggerKind: "git-push" | "generic-signed-webhook";
  refs: string[];
  eventKinds: SourceEventKind[];
  sourceBindingFingerprint: string;
  blockedReason?: "source-binding-changed";
  genericWebhookSecretRef?: string;
  dedupeWindowSeconds?: number;
  updatedAt: string;
}

export interface ResourceDetailRuntimeProfile {
  strategy: RequestedDeploymentMethod;
  installCommand?: string;
  buildCommand?: string;
  startCommand?: string;
  runtimeName?: string;
  publishDirectory?: string;
  dockerfilePath?: string;
  dockerComposeFilePath?: string;
  buildTarget?: string;
  replicas?: number;
  healthCheckPath?: string;
  healthCheck?: RequestedDeploymentHealthCheck;
}

export interface ResourceDetailNetworkProfile {
  internalPort: number;
  upstreamProtocol: ResourceNetworkProtocol;
  exposureMode: ResourceExposureMode;
  targetServiceName?: string;
  hostPort?: number;
}

export type ResourceGeneratedAccessMode = "inherit" | "disabled";

export interface ResourceAccessProfile {
  generatedAccessMode: ResourceGeneratedAccessMode;
  pathPrefix: string;
}

export type ResourceDetailHealthPolicy = RequestedDeploymentHealthCheck;
export type ResourceDetailAccessSummary = ResourceAccessSummary;

export interface ResourceDetailDeploymentContext {
  id: string;
  status: DeploymentStatus;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  serverId?: string;
  destinationId?: string;
}

export interface ResourceDetailLifecycle {
  status: "active" | "archived" | "deleted";
  archivedAt?: string;
  deletedAt?: string;
}

export type ResourceProfileDriftSection =
  | "source"
  | "runtime"
  | "network"
  | "access"
  | "health"
  | "configuration";

export type ResourceProfileDriftComparison =
  | "resource-vs-entry-profile"
  | "resource-vs-latest-snapshot"
  | "entry-profile-vs-latest-snapshot";

export type ResourceProfileDriftSuggestedCommand =
  | "resources.configure-source"
  | "resources.configure-runtime"
  | "resources.configure-network"
  | "resources.configure-access"
  | "resources.configure-health"
  | "resources.set-variable"
  | "resources.unset-variable";

export interface ResourceProfileDiagnosticValue {
  state: "present" | "missing" | "masked" | "redacted" | "unknown";
  displayValue?: string | number | boolean | null;
  valueHash?: string;
}

export interface ResourceDetailProfileDiagnostic {
  code: string;
  severity: "info" | "warning" | "blocking";
  message: string;
  path?: string;
  section?: ResourceProfileDriftSection;
  fieldPath?: string;
  configKey?: string;
  configExposure?: VariableExposure;
  configKind?: VariableKind;
  configScope?: ConfigScope;
  configSource?: "resource" | "entry-profile" | "deployment-snapshot";
  comparison?: ResourceProfileDriftComparison;
  resourceValue?: ResourceProfileDiagnosticValue;
  entryProfileValue?: ResourceProfileDiagnosticValue;
  deploymentSnapshotValue?: ResourceProfileDiagnosticValue;
  latestDeploymentId?: string;
  configPointer?: string;
  blocksDeploymentAdmission?: boolean;
  suggestedCommand?: ResourceProfileDriftSuggestedCommand;
}

export interface ResourceDetail {
  schemaVersion: "resources.show/v1";
  resource: ResourceDetailIdentity;
  source?: ResourceDetailSourceProfile;
  autoDeployPolicy?: ResourceDetailAutoDeployPolicy;
  runtimeProfile?: ResourceDetailRuntimeProfile;
  networkProfile?: ResourceDetailNetworkProfile;
  accessProfile?: ResourceAccessProfile;
  healthPolicy?: ResourceDetailHealthPolicy;
  storageAttachments?: ResourceStorageAttachmentSummary[];
  accessSummary?: ResourceDetailAccessSummary;
  latestDeployment?: ResourceDetailDeploymentContext;
  lifecycle: ResourceDetailLifecycle;
  diagnostics: ResourceDetailProfileDiagnostic[];
  generatedAt: string;
}

export interface StorageVolumeAttachmentSummary {
  attachmentId: string;
  resourceId: string;
  resourceName?: string;
  resourceSlug?: string;
  destinationPath: string;
  mountMode: "read-write" | "read-only";
  dataFormat?: StorageVolumeBackupDataFormat;
  applicationDataLabel?: string;
  attachedAt: string;
}

export interface StorageVolumeSummary {
  id: string;
  projectId: string;
  environmentId: string;
  name: string;
  slug: string;
  kind: StorageVolumeKind;
  sourcePath?: string;
  description?: string;
  lifecycleStatus: "active" | "deleted";
  backupRelationship?: {
    retentionRequired: boolean;
    reason?: string;
  };
  attachmentCount: number;
  attachments: StorageVolumeAttachmentSummary[];
  createdAt: string;
  deletedAt?: string;
}

export interface ListStorageVolumesResult {
  schemaVersion: "storage-volumes.list/v1";
  items: StorageVolumeSummary[];
  generatedAt: string;
}

export interface ShowStorageVolumeResult {
  schemaVersion: "storage-volumes.show/v1";
  storageVolume: StorageVolumeSummary;
  generatedAt: string;
}

export interface StorageVolumeBackupRestoreAttemptSummary {
  attemptId: string;
  status: "pending" | "completed" | "failed";
  requestedAt: string;
  target: {
    storageVolumeId: string;
    restoredVolumeId?: string;
    destructiveInPlace: boolean;
  };
  completedAt?: string;
  failedAt?: string;
  failureCode?: string;
  failureMessage?: string;
}

export interface StorageVolumeBackupSummary {
  id: string;
  storageVolumeId: string;
  projectId: string;
  environmentId: string;
  resourceId?: string;
  storageVolumeKind: StorageVolumeKind;
  sourceAdapterKey: string;
  targetProviderKey: StorageVolumeBackupTargetProviderKey;
  targetRef: string;
  consistency: string;
  status: StorageVolumeBackupStatus;
  attemptId: string;
  requestedAt: string;
  retentionStatus: "retained" | "none" | "pruned";
  localOnly: boolean;
  artifactHandle?: string;
  sizeBytes?: number;
  checksum?: string;
  completedAt?: string;
  failedAt?: string;
  failureCode?: string;
  failureMessage?: string;
  latestRestoreAttempt?: StorageVolumeBackupRestoreAttemptSummary;
  createdAt: string;
}

export interface CreateStorageVolumeBackupResult {
  id: string;
}

export interface ListStorageVolumeBackupsResult {
  schemaVersion: "storage-volumes.backups.list/v1";
  items: StorageVolumeBackupSummary[];
  generatedAt: string;
}

export interface ShowStorageVolumeBackupResult {
  schemaVersion: "storage-volumes.backups.show/v1";
  backup: StorageVolumeBackupSummary;
  generatedAt: string;
}

export interface StorageVolumeRestorePlan {
  schemaVersion: "storage-volumes.restore-plan/v1";
  backupId: string;
  sourceStorageVolumeId: string;
  targetMode: "new-volume" | "in-place";
  destructive: boolean;
  targetStorageVolumeId?: string;
  defaultRestoredVolumeName?: string;
  blockers: Array<{
    code: string;
    message: string;
  }>;
}

export interface CreateStorageVolumeRestoreResult {
  id: string;
  restoredStorageVolumeId?: string;
}

export interface PruneStorageVolumeBackupResult {
  id: string;
  prunedAt: string;
}

export const dependencyResourceKinds = [
  "postgres",
  "redis",
  "mysql",
  "clickhouse",
  "object-storage",
  "opensearch",
] as const;
export type DependencyResourceKind = (typeof dependencyResourceKinds)[number];

export const managedDependencyResourceKinds = dependencyResourceKinds;
export type ManagedDependencyResourceKind = (typeof managedDependencyResourceKinds)[number];

export type DependencyResourceSourceMode = "appaloft-managed" | "imported-external";
export type DependencyResourceLifecycleStatus = "provisioning" | "ready" | "degraded" | "deleted";

export interface DependencyResourceConnectionSummary {
  host: string;
  port?: number;
  databaseName?: string;
  maskedConnection: string;
  secretRef?: string;
}

export interface DependencyResourceProviderRealizationSummary {
  status: "pending" | "ready" | "failed" | "delete-pending" | "deleted";
  attemptId: string;
  attemptedAt: string;
  providerResourceHandle?: string;
  realizedAt?: string;
  failedAt?: string;
  failureCode?: string;
  failureMessage?: string;
}

export interface DependencyResourceBindingReadinessSummary {
  status: "ready" | "blocked" | "not-implemented";
  reason?: string;
}

export type DependencyResourceCapabilityRequirement =
  | {
      type: "postgres-extension";
      name: string;
      required: boolean;
      description?: string;
    }
  | {
      type: "redis-module";
      name: string;
      required: boolean;
      description?: string;
    };

export interface DependencyResourceCapabilityReadback {
  type: DependencyResourceCapabilityRequirement["type"];
  name: string;
  required: boolean;
  status: "satisfied" | "unsupported" | "failed";
  evidence: string[];
  version?: string;
  checkedAt?: string;
}

export interface DependencyResourceSummary {
  id: string;
  projectId: string;
  environmentId: string;
  name: string;
  slug: string;
  kind: DependencyResourceKind;
  sourceMode: DependencyResourceSourceMode;
  providerKey: string;
  providerManaged: boolean;
  description?: string;
  lifecycleStatus: DependencyResourceLifecycleStatus;
  connection?: DependencyResourceConnectionSummary;
  providerRealization?: DependencyResourceProviderRealizationSummary;
  desiredCapabilities: DependencyResourceCapabilityRequirement[];
  capabilityReadbacks: DependencyResourceCapabilityReadback[];
  bindingReadiness: DependencyResourceBindingReadinessSummary;
  backupRelationship?: {
    retentionRequired: boolean;
    reason?: string;
  };
  deleteSafety?: {
    blockers: DependencyResourceDeleteBlocker[];
  };
  createdAt: string;
  deletedAt?: string;
}

export interface ListDependencyResourcesResult {
  schemaVersion: "dependency-resources.list/v1";
  items: DependencyResourceSummary[];
  generatedAt: string;
}

export interface ShowDependencyResourceResult {
  schemaVersion: "dependency-resources.show/v1";
  dependencyResource: DependencyResourceSummary;
  generatedAt: string;
}

export interface DependencyResourceRestoreAttemptSummary {
  attemptId: string;
  status: "pending" | "completed" | "failed";
  requestedAt: string;
  completedAt?: string;
  failedAt?: string;
  failureCode?: string;
  failureMessage?: string;
}

export interface DependencyResourceBackupSummary {
  id: string;
  dependencyResourceId: string;
  projectId: string;
  environmentId: string;
  dependencyKind: DependencyResourceKind;
  providerKey: string;
  status: "pending" | "ready" | "failed";
  attemptId: string;
  requestedAt: string;
  retentionStatus: "retained" | "none";
  providerArtifactHandle?: string;
  completedAt?: string;
  failedAt?: string;
  failureCode?: string;
  failureMessage?: string;
  latestRestoreAttempt?: DependencyResourceRestoreAttemptSummary;
  createdAt: string;
}

export interface ListDependencyResourceBackupsResult {
  schemaVersion: "dependency-resources.backups.list/v1";
  items: DependencyResourceBackupSummary[];
  generatedAt: string;
}

export interface ShowDependencyResourceBackupResult {
  schemaVersion: "dependency-resources.backups.show/v1";
  backup: DependencyResourceBackupSummary;
  generatedAt: string;
}

export interface ResourceDependencyBindingTargetSummary {
  targetName: string;
  scope: "environment" | "release" | "build-only" | "runtime-only";
  injectionMode: "env" | "file" | "reference";
  secretRef?: string;
}

export interface ResourceDependencyBindingSecretRotationSummary {
  secretRef?: string;
  secretVersion: string;
  rotatedAt: string;
  previousSecretVersion?: string;
}

export interface ResourceDependencyBindingReadinessSummary {
  status: "ready" | "blocked" | "not-implemented";
  reason?: string;
}

export interface ResourceDependencyBindingSnapshotReadinessSummary {
  status: "deferred" | "ready" | "blocked";
  reason?: string;
}

export interface ResourceDependencyBindingSummary {
  id: string;
  projectId: string;
  environmentId: string;
  resourceId: string;
  dependencyResourceId: string;
  dependencyResourceName?: string;
  dependencyResourceSlug?: string;
  kind: DependencyResourceKind;
  sourceMode: DependencyResourceSourceMode;
  providerKey: string;
  providerManaged: boolean;
  lifecycleStatus: DependencyResourceLifecycleStatus;
  target: ResourceDependencyBindingTargetSummary;
  secretRotation?: ResourceDependencyBindingSecretRotationSummary;
  connection?: DependencyResourceConnectionSummary;
  bindingReadiness: ResourceDependencyBindingReadinessSummary;
  snapshotReadiness: ResourceDependencyBindingSnapshotReadinessSummary;
  status: "active" | "removed";
  createdAt: string;
  removedAt?: string;
}

export interface DeploymentDependencyBindingSnapshotReferenceSummary {
  bindingId: string;
  dependencyResourceId: string;
  kind: DependencyResourceKind;
  targetName: string;
  scope: ResourceDependencyBindingTargetSummary["scope"];
  injectionMode: ResourceDependencyBindingTargetSummary["injectionMode"];
  snapshotReadiness: {
    status: "ready" | "blocked";
    reason?: string;
  };
}

export interface DeploymentDependencyBindingSnapshotSummary {
  status: "ready" | "blocked" | "not-applicable";
  references: DeploymentDependencyBindingSnapshotReferenceSummary[];
  runtimeInjection: {
    status: "ready" | "blocked" | "not-applicable";
    reason?: string;
  };
}

export interface ListResourceDependencyBindingsResult {
  schemaVersion: "resources.dependency-bindings.list/v1";
  items: ResourceDependencyBindingSummary[];
  generatedAt: string;
}

export interface ShowResourceDependencyBindingResult {
  schemaVersion: "resources.dependency-bindings.show/v1";
  binding: ResourceDependencyBindingSummary;
  generatedAt: string;
}

export interface ResourceConfigEntryView {
  key: string;
  value: string;
  scope: ConfigScope;
  exposure: VariableExposure;
  isSecret: boolean;
  kind: VariableKind;
  updatedAt?: string;
}

export interface ResourceEffectiveConfigView {
  schemaVersion: "resources.effective-config/v1";
  resourceId: string;
  environmentId: string;
  ownedEntries: ResourceConfigEntryView[];
  effectiveEntries: ResourceConfigEntryView[];
  overrides: ResourceConfigOverrideSummary[];
  precedence: ConfigScope[];
  generatedAt: string;
}

export interface ResourceSecretReferenceSummary {
  resourceId: string;
  key: string;
  value: "****";
  scope: "resource";
  exposure: VariableExposure;
  isSecret: true;
  kind: "secret";
  updatedAt: string;
}

export interface ListResourceSecretReferencesResult {
  schemaVersion: "resources.secrets.list/v1";
  resourceId: string;
  items: ResourceSecretReferenceSummary[];
  generatedAt: string;
}

export interface ShowResourceSecretReferenceResult {
  schemaVersion: "resources.secrets.show/v1";
  secret: ResourceSecretReferenceSummary;
  generatedAt: string;
}

export interface ResourceConfigOverrideSummary {
  key: string;
  exposure: VariableExposure;
  selectedScope: ConfigScope;
  overriddenScopes: ConfigScope[];
}

export type ScheduledTaskConcurrencyPolicy = "forbid";
export type ScheduledTaskDefinitionStatus = "enabled" | "disabled";
export type ScheduledTaskRunTriggerKind = "manual" | "scheduled";
export type ScheduledTaskRunStatus = "accepted" | "running" | "succeeded" | "failed" | "skipped";
export type ScheduledTaskRunSkippedReason =
  | "concurrency-forbidden"
  | "resource-archived"
  | "task-disabled";

export interface ScheduledTaskRunSummary {
  runId: string;
  taskId: string;
  resourceId: string;
  triggerKind: ScheduledTaskRunTriggerKind;
  status: ScheduledTaskRunStatus;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  exitCode?: number;
  failureSummary?: string;
  skippedReason?: ScheduledTaskRunSkippedReason;
}

export interface ScheduledTaskDefinitionSummary {
  taskId: string;
  resourceId: string;
  schedule: string;
  timezone: string;
  commandIntent: string;
  timeoutSeconds: number;
  retryLimit: number;
  concurrencyPolicy: ScheduledTaskConcurrencyPolicy;
  status: ScheduledTaskDefinitionStatus;
  createdAt: string;
  updatedAt?: string;
  latestRun?: ScheduledTaskRunSummary;
}

export interface ScheduledTaskCommandResult {
  schemaVersion: "scheduled-tasks.command/v1";
  task: ScheduledTaskDefinitionSummary;
}

export interface DeleteScheduledTaskResult {
  schemaVersion: "scheduled-tasks.delete/v1";
  taskId: string;
  resourceId: string;
  status: "deleted";
  deletedAt: string;
}

export interface RunScheduledTaskNowResult {
  schemaVersion: "scheduled-tasks.run-now/v1";
  run: ScheduledTaskRunSummary;
}

export interface ListScheduledTasksResult {
  schemaVersion: "scheduled-tasks.list/v1";
  items: ScheduledTaskDefinitionSummary[];
  nextCursor?: string;
  generatedAt: string;
}

export interface ShowScheduledTaskResult {
  schemaVersion: "scheduled-tasks.show/v1";
  task: ScheduledTaskDefinitionSummary;
  generatedAt: string;
}

export interface ListScheduledTaskRunsResult {
  schemaVersion: "scheduled-task-runs.list/v1";
  items: ScheduledTaskRunSummary[];
  nextCursor?: string;
  generatedAt: string;
}

export interface ShowScheduledTaskRunResult {
  schemaVersion: "scheduled-task-runs.show/v1";
  run: ScheduledTaskRunSummary;
  generatedAt: string;
}

export interface ScheduledTaskRunLogEntry {
  timestamp: string;
  stream: "stdout" | "stderr" | "system";
  message: string;
}

export interface ScheduledTaskRunLogsResult {
  schemaVersion: "scheduled-task-runs.logs/v1";
  runId: string;
  taskId: string;
  resourceId: string;
  entries: ScheduledTaskRunLogEntry[];
  nextCursor?: string;
  generatedAt: string;
}

export interface ScheduledTaskReadModel {
  list(
    context: RepositoryContext,
    input: {
      projectId?: string;
      environmentId?: string;
      resourceId?: string;
      status?: ScheduledTaskDefinitionStatus;
      limit?: number;
      cursor?: string;
    },
  ): Promise<Omit<ListScheduledTasksResult, "schemaVersion" | "generatedAt">>;
  show(
    context: RepositoryContext,
    input: { taskId: string; resourceId?: string },
  ): Promise<ScheduledTaskDefinitionSummary | null>;
}

export interface ScheduledTaskRunReadModel {
  list(
    context: RepositoryContext,
    input: {
      taskId?: string;
      resourceId?: string;
      status?: ScheduledTaskRunStatus;
      triggerKind?: ScheduledTaskRunTriggerKind;
      limit?: number;
      cursor?: string;
    },
  ): Promise<Omit<ListScheduledTaskRunsResult, "schemaVersion" | "generatedAt">>;
  show(
    context: RepositoryContext,
    input: { runId: string; taskId?: string; resourceId?: string },
  ): Promise<ScheduledTaskRunSummary | null>;
}

export interface ScheduledTaskRunLogReadModel {
  read(
    context: RepositoryContext,
    input: {
      runId: string;
      taskId?: string;
      resourceId?: string;
      cursor?: string;
      limit?: number;
    },
  ): Promise<Omit<ScheduledTaskRunLogsResult, "schemaVersion" | "generatedAt">>;
}

export interface ScheduledTaskRunLogRecord {
  id: string;
  runId: string;
  taskId: string;
  resourceId: string;
  timestamp: string;
  stream: ScheduledTaskRunLogEntry["stream"];
  message: string;
}

export interface ScheduledTaskRunLogRecorder {
  recordMany(
    context: RepositoryContext,
    records: ScheduledTaskRunLogRecord[],
  ): Promise<Result<{ recorded: number }, DomainError>>;
}

export interface ScheduledTaskRuntimeExecutionRequest {
  runId: string;
  taskId: string;
  resourceId: string;
  commandIntent: string;
  timeoutSeconds: number;
  environment?: Record<string, string>;
}

export interface ScheduledTaskRuntimeExecutionResult {
  status: Extract<ScheduledTaskRunStatus, "succeeded" | "failed">;
  exitCode: number;
  startedAt: string;
  finishedAt: string;
  timeline: ScheduledTaskRunLogEntry[];
  failureSummary?: string;
}

export interface ScheduledTaskRuntimePort {
  execute(
    context: ExecutionContext,
    request: ScheduledTaskRuntimeExecutionRequest,
  ): Promise<Result<ScheduledTaskRuntimeExecutionResult, DomainError>>;
}

export type ResourceHealthOverall =
  | "healthy"
  | "degraded"
  | "unhealthy"
  | "starting"
  | "stopped"
  | "not-deployed"
  | "unknown";

export type ResourceRuntimeLifecycle =
  | "not-deployed"
  | "starting"
  | "running"
  | "restarting"
  | "degraded"
  | "stopped"
  | "exited"
  | "unknown";

export type ResourceRuntimeHealth = "healthy" | "unhealthy" | "unknown" | "not-configured";

export type ResourceHealthSource =
  | "deployment"
  | "runtime"
  | "health-policy"
  | "health-check"
  | "proxy"
  | "public-access"
  | "domain-binding"
  | "runtime-control";

export interface ResourceHealthSourceError {
  source: ResourceHealthSource;
  code: string;
  category: string;
  phase: string;
  retriable: boolean;
  relatedEntityId?: string;
  relatedState?: string;
  message?: string;
}

export interface ResourceHealthDeploymentContext {
  id: string;
  status: DeploymentStatus;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  serverId?: string;
  destinationId?: string;
  lastError?: {
    timestamp: string;
    phase: DeploymentTimelineJournalSummary["phase"];
    message: string;
  };
}

export interface ResourceRuntimeHealthSection {
  lifecycle: ResourceRuntimeLifecycle;
  health: ResourceRuntimeHealth;
  observedAt?: string;
  runtimeKind?: ExecutionStrategyKind;
  reasonCode?: string;
  message?: string;
}

export interface ResourceHealthPolicySection {
  status: "configured" | "not-configured" | "unsupported";
  enabled: boolean;
  type?: "http" | "command";
  path?: string;
  port?: number;
  expectedStatusCode?: number;
  intervalSeconds?: number;
  timeoutSeconds?: number;
  retries?: number;
  startPeriodSeconds?: number;
  reasonCode?: string;
}

export interface ResourcePublicAccessHealthSection {
  status: "ready" | "not-ready" | "failed" | "unknown" | "not-configured";
  url?: string;
  kind?:
    | "durable-domain"
    | "static-artifact"
    | "server-applied-domain"
    | "generated-latest"
    | "generated-planned";
  reasonCode?: string;
  phase?: string;
  routeIntentStatus?: RouteIntentStatusDescriptor;
  latestAccessFailure?: ResourceAccessFailureDiagnostic;
}

export interface ResourceProxyHealthSection {
  status: "ready" | "not-ready" | "failed" | "unknown" | "not-configured";
  providerKey?: string;
  lastRouteRealizationDeploymentId?: string;
  reasonCode?: string;
}

export interface ResourceHealthCheck {
  name: string;
  target: "runtime" | "container" | "command" | "public-access" | "proxy-route";
  status: "passed" | "failed" | "skipped" | "unknown";
  observedAt: string;
  durationMs?: number;
  statusCode?: number;
  exitCode?: number;
  message?: string;
  reasonCode?: string;
  phase?: string;
  retriable?: boolean;
  metadata?: Record<string, string>;
}

export type ResourceRuntimeControlOperation = "stop" | "start" | "restart";

export type ResourceRuntimeControlStatus =
  | "accepted"
  | "running"
  | "succeeded"
  | "failed"
  | "blocked";

export type ResourceRuntimeControlRuntimeState =
  | "starting"
  | "running"
  | "restarting"
  | "stopping"
  | "stopped"
  | "unknown";

export type ResourceRuntimeControlBlockedReason =
  | "resource-archived"
  | "resource-deleted"
  | "runtime-not-found"
  | "runtime-metadata-stale"
  | "runtime-already-running"
  | "runtime-already-stopped"
  | "runtime-control-in-progress"
  | "deployment-in-progress"
  | "profile-acknowledgement-required"
  | "adapter-unsupported"
  | "runtime-control-target-unsupported";

export interface ResourceRuntimeControlPhaseSummary {
  phase: "stop" | "start";
  status: "pending" | "running" | "succeeded" | "failed" | "skipped";
  errorCode?: string;
}

export interface ResourceRuntimeControlSummary {
  runtimeControlAttemptId: string;
  operation: ResourceRuntimeControlOperation;
  status: ResourceRuntimeControlStatus;
  startedAt: string;
  completedAt?: string;
  runtimeState: ResourceRuntimeControlRuntimeState;
  blockedReason?: ResourceRuntimeControlBlockedReason;
  errorCode?: string;
  phases?: ResourceRuntimeControlPhaseSummary[];
}

export interface ResourceRuntimeControlCommandResult extends ResourceRuntimeControlSummary {
  resourceId: string;
  deploymentId?: string;
}

export interface ResourceRuntimeControlAttemptRecord extends ResourceRuntimeControlCommandResult {
  serverId?: string;
  destinationId?: string;
  reason?: string;
  idempotencyKey?: string;
}

export interface ResourceRuntimeControlAttemptPruneInput {
  before: string;
  deploymentId?: string;
  resourceId?: string;
  serverId?: string;
  dryRun: boolean;
}

export interface ResourceRuntimeControlAttemptPruneStoreResult {
  matchedCount: number;
  prunedCount: number;
  affectedResourceCount: number;
  affectedDeploymentCount: number;
}

export interface ResourceRuntimeControlAttemptPruneResult
  extends ResourceRuntimeControlAttemptPruneStoreResult {
  schemaVersion: "resources.runtime-control-attempts.prune/v1";
  before: string;
  deploymentId?: string;
  resourceId?: string;
  serverId?: string;
  dryRun: boolean;
  prunedAt: string;
}

export interface ResourceRuntimeControlTargetRequest {
  runtimeControlAttemptId: string;
  operation: ResourceRuntimeControlOperation;
  resourceId: string;
  deploymentId: string;
  serverId?: string;
  destinationId?: string;
  runtimeKind: ExecutionStrategyKind;
  targetKind: TargetKind;
  providerKey: string;
  runtimeMetadata?: Record<string, string>;
  composeFile?: string;
  workingDirectory?: string;
  targetServiceName?: string;
  reason?: string;
}

export interface ResourceRuntimeControlTargetResult {
  status: "succeeded" | "failed" | "blocked";
  runtimeState: ResourceRuntimeControlRuntimeState;
  blockedReason?: ResourceRuntimeControlBlockedReason;
  errorCode?: string;
  phases?: ResourceRuntimeControlPhaseSummary[];
}

export interface ResourceRuntimeControlTargetPort {
  control(
    context: ExecutionContext,
    request: ResourceRuntimeControlTargetRequest,
  ): Promise<Result<ResourceRuntimeControlTargetResult, DomainError>>;
}

export interface ResourceRuntimeControlAttemptRecorder {
  record(
    context: RepositoryContext,
    attempt: ResourceRuntimeControlAttemptRecord,
  ): Promise<Result<ResourceRuntimeControlAttemptRecord, DomainError>>;
}

export interface ResourceRuntimeControlAttemptRetentionStore {
  prune(
    context: RepositoryContext,
    input: ResourceRuntimeControlAttemptPruneInput,
  ): Promise<Result<ResourceRuntimeControlAttemptPruneStoreResult, DomainError>>;
}

export interface ResourceHealthProbeRequest {
  name: string;
  target: "runtime" | "public-access";
  url: string;
  method: "GET" | "HEAD" | "POST" | "OPTIONS";
  expectedStatusCode: number;
  expectedResponseText?: string;
  timeoutSeconds: number;
}

export interface ResourceHealthProbeResult {
  name: string;
  target: "runtime" | "public-access";
  status: "passed" | "failed";
  observedAt: string;
  durationMs: number;
  statusCode?: number;
  message?: string;
  reasonCode?: string;
  retriable?: boolean;
  metadata?: Record<string, string>;
}

export interface ResourceRuntimeHealthProbeRequest {
  resourceId: string;
  deploymentId: string;
  targetServerId?: string;
  runtimeKind: ExecutionStrategyKind;
  targetKind: TargetKind;
  providerKey: string;
  runtimeMetadata?: Record<string, string>;
  timeoutSeconds: number;
}

export interface ResourceRuntimeHealthProbeResult {
  lifecycle: ResourceRuntimeLifecycle;
  health: ResourceRuntimeHealth;
  observedAt: string;
  reasonCode?: string;
  message?: string;
  check: ResourceHealthCheck;
}

export interface ResourceHealthProbeRunner {
  probe(
    context: ExecutionContext,
    request: ResourceHealthProbeRequest,
  ): Promise<Result<ResourceHealthProbeResult, DomainError>>;
  probeRuntime?(
    context: ExecutionContext,
    request: ResourceRuntimeHealthProbeRequest,
  ): Promise<Result<ResourceRuntimeHealthProbeResult, DomainError>>;
}

export interface ResourceHealthSummary {
  schemaVersion: "resources.health/v1";
  resourceId: string;
  generatedAt: string;
  observedAt?: string;
  overall: ResourceHealthOverall;
  latestDeployment?: ResourceHealthDeploymentContext;
  runtime: ResourceRuntimeHealthSection;
  latestRuntimeControl?: ResourceRuntimeControlSummary;
  healthPolicy: ResourceHealthPolicySection;
  publicAccess: ResourcePublicAccessHealthSection;
  proxy: ResourceProxyHealthSection;
  checks: ResourceHealthCheck[];
  sourceErrors: ResourceHealthSourceError[];
}

export interface ResourceHealthObservationRecord {
  observationId: string;
  resourceId: string;
  observedAt: string;
  retainedUntil: string;
  summary: ResourceHealthSummary;
}

export interface ResourceHealthHistoryObservation {
  observationId: string;
  observedAt: string;
  overall: ResourceHealthOverall;
  runtimeLifecycle: ResourceRuntimeLifecycle;
  runtimeHealth: ResourceRuntimeHealth;
  publicAccessStatus: ResourcePublicAccessHealthSection["status"];
  proxyStatus: ResourceProxyHealthSection["status"];
  healthPolicyStatus: ResourceHealthPolicySection["status"];
  latestDeploymentId?: string;
  summary: ResourceHealthSummary;
}

export interface ResourceHealthHistoryReadInput {
  resourceId: string;
  window: RuntimeMonitoringWindow;
  limit: number;
}

export interface ResourceHealthHistoryReadResult {
  observations: ResourceHealthHistoryObservation[];
  sourceErrors: ResourceHealthSourceError[];
}

export interface ResourceHealthObservationRecorder {
  record(
    context: RepositoryContext,
    record: ResourceHealthObservationRecord,
  ): Promise<Result<ResourceHealthHistoryObservation>>;
}

export interface ResourceHealthObservationHistoryReadModel {
  listObservations(
    context: ExecutionContext,
    input: ResourceHealthHistoryReadInput,
  ): Promise<Result<ResourceHealthHistoryReadResult>>;
}

export interface ResourceHealthHistory {
  schemaVersion: "resources.health-history/v1";
  resourceId: string;
  from: string;
  to: string;
  generatedAt: string;
  observations: ResourceHealthHistoryObservation[];
  sourceErrors: ResourceHealthSourceError[];
}

export interface DeploymentTimelineJournalSummary {
  timestamp: string;
  source: DeploymentTimelineJournalSource;
  phase: "detect" | "plan" | "package" | "deploy" | "verify" | "rollback";
  level: LogLevel;
  message: string;
  masked?: boolean;
}

export type ResourceRuntimeLogStreamName = "stdout" | "stderr" | "unknown";

export interface ResourceRuntimeLogLine {
  resourceId: string;
  deploymentId?: string;
  serviceName?: string;
  runtimeKind?: string;
  runtimeInstanceId?: string;
  stream?: ResourceRuntimeLogStreamName;
  timestamp?: string;
  sequence?: number;
  cursor?: string;
  message: string;
  masked: boolean;
}

export type ResourceRuntimeLogEvent =
  | {
      kind: "line";
      line: ResourceRuntimeLogLine;
    }
  | {
      kind: "heartbeat";
      at: string;
    }
  | {
      kind: "closed";
      reason: "completed" | "cancelled" | "source-ended";
    }
  | {
      kind: "error";
      error: DomainError;
    };

export interface ResourceRuntimeLogRequest {
  serviceName?: string;
  tailLines: number;
  since?: string;
  cursor?: string;
  follow: boolean;
}

export interface ResourceRuntimeLogContext {
  resource: ResourceSummary;
  deployment: DeploymentSummary;
  redactions: readonly string[];
}

export interface ResourceRuntimeLogStream extends AsyncIterable<ResourceRuntimeLogEvent> {
  close(): Promise<void>;
}

export interface ResourceRuntimeLogReader {
  open(
    context: ExecutionContext,
    logContext: ResourceRuntimeLogContext,
    request: ResourceRuntimeLogRequest,
    signal: AbortSignal,
  ): Promise<Result<ResourceRuntimeLogStream>>;
}

export type TerminalSessionTargetScope =
  | {
      kind: "server";
      server: ServerSummary;
    }
  | {
      kind: "resource";
      resource: ResourceSummary;
      deployment: DeploymentSummary;
      server: ServerSummary;
      workingDirectory: string;
    };

export interface TerminalSessionOpenRequest {
  sessionId: string;
  scope: TerminalSessionTargetScope;
  initialRows: number;
  initialCols: number;
}

export interface TerminalSessionDescriptor {
  sessionId: string;
  scope: "server" | "resource";
  serverId: string;
  resourceId?: string;
  deploymentId?: string;
  transport: {
    kind: "websocket";
    path: string;
  };
  providerKey: string;
  workingDirectory?: string;
  createdAt: string;
}

export type TerminalSessionStatus = "active" | "closing";

export interface TerminalSessionSummary extends TerminalSessionDescriptor {
  status: TerminalSessionStatus;
}

export interface TerminalSessionList {
  schemaVersion: "terminal-sessions.list/v1";
  items: TerminalSessionSummary[];
}

export interface TerminalSessionDetail {
  schemaVersion: "terminal-sessions.show/v1";
  item: TerminalSessionSummary;
}

export interface CloseTerminalSessionResponse {
  sessionId: string;
  closed: boolean;
  status: "closed";
}

export interface ExpireTerminalSessionsResponse {
  expiredCount: number;
  sessionIds: string[];
}

export interface ListTerminalSessionsInput {
  scope?: "server" | "resource";
  serverId?: string;
  resourceId?: string;
  deploymentId?: string;
  limit?: number;
}

export interface ExpireTerminalSessionsInput {
  olderThan?: string;
  limit?: number;
}

export type TerminalSessionFrame =
  | {
      kind: "ready";
      sessionId: string;
      workingDirectory?: string;
    }
  | {
      kind: "output";
      stream: "stdout" | "stderr";
      data: string;
    }
  | {
      kind: "closed";
      reason: "completed" | "cancelled" | "source-ended";
      exitCode?: number;
    }
  | {
      kind: "error";
      error: DomainError;
    };

export interface TerminalSession extends AsyncIterable<TerminalSessionFrame> {
  write(data: string): Promise<void>;
  resize(input: { rows: number; cols: number }): Promise<void>;
  close(): Promise<void>;
}

export interface TerminalSessionGateway {
  open(
    context: ExecutionContext,
    request: TerminalSessionOpenRequest,
  ): Promise<Result<TerminalSessionDescriptor>>;
  attach(sessionId: string): Result<TerminalSession>;
  list(input?: ListTerminalSessionsInput): TerminalSessionSummary[];
  show(sessionId: string): Result<TerminalSessionSummary>;
  close(sessionId: string): Promise<Result<CloseTerminalSessionResponse>>;
  expire(input?: ExpireTerminalSessionsInput): Promise<Result<ExpireTerminalSessionsResponse>>;
}

export type ResourceRuntimeLogsResult =
  | {
      mode: "bounded";
      resourceId: string;
      deploymentId?: string;
      logs: ResourceRuntimeLogLine[];
    }
  | {
      mode: "stream";
      resourceId: string;
      deploymentId?: string;
      stream: ResourceRuntimeLogStream;
    };

export interface ResourceRuntimeLogArchiveSummary {
  archiveId: string;
  resourceId: string;
  deploymentId?: string;
  serverId?: string;
  serviceName?: string;
  runtimeKind?: string;
  capturedAt: string;
  lineCount: number;
  retentionStatus: "retained";
  reason?: string;
}

export interface ResourceRuntimeLogArchiveDetail extends ResourceRuntimeLogArchiveSummary {
  lines: ResourceRuntimeLogLine[];
}

export interface ResourceRuntimeLogArchiveCreateInput {
  archiveId: string;
  resourceId: string;
  deploymentId?: string;
  serverId?: string;
  serviceName?: string;
  runtimeKind?: string;
  capturedAt: string;
  reason?: string;
  lines: ResourceRuntimeLogLine[];
}

export interface ResourceRuntimeLogArchiveListInput {
  resourceId?: string;
  deploymentId?: string;
  serverId?: string;
  serviceName?: string;
  limit: number;
  cursor?: string;
}

export interface ResourceRuntimeLogArchiveShowInput {
  archiveId: string;
}

export interface ResourceRuntimeLogArchivePruneInput {
  before: string;
  resourceId?: string;
  deploymentId?: string;
  serverId?: string;
  serviceName?: string;
  dryRun: boolean;
}

export interface ResourceRuntimeLogArchivePruneStoreResult {
  matchedCount: number;
  prunedCount: number;
  affectedResourceCount: number;
}

export interface ResourceRuntimeLogArchiveListPage {
  items: ResourceRuntimeLogArchiveSummary[];
  nextCursor?: string;
}

export interface ResourceRuntimeLogArchiveResult {
  schemaVersion: "resources.runtime-logs.archive/v1";
  archive: ResourceRuntimeLogArchiveDetail;
}

export interface ResourceRuntimeLogArchiveListResult extends ResourceRuntimeLogArchiveListPage {
  schemaVersion: "resources.runtime-log-archives.list/v1";
  generatedAt: string;
}

export interface ResourceRuntimeLogArchiveShowResult {
  schemaVersion: "resources.runtime-log-archives.show/v1";
  archive: ResourceRuntimeLogArchiveDetail;
}

export interface ResourceRuntimeLogArchivePruneResult
  extends ResourceRuntimeLogArchivePruneStoreResult {
  schemaVersion: "resources.runtime-log-archives.prune/v1";
  before: string;
  resourceId?: string;
  deploymentId?: string;
  serverId?: string;
  serviceName?: string;
  dryRun: boolean;
  prunedAt: string;
}

export type ResourceDiagnosticSectionStatus =
  | "available"
  | "empty"
  | "not-configured"
  | "not-requested"
  | "unavailable"
  | "failed"
  | "unknown";

export type ResourceDiagnosticSource =
  | "deployment"
  | "access"
  | "proxy"
  | "deployment-timeline"
  | "runtime-logs"
  | "system"
  | "copy";

export interface ResourceDiagnosticSourceError {
  source: ResourceDiagnosticSource;
  code: string;
  category: string;
  phase: string;
  retryable: boolean;
  relatedEntityId?: string;
  relatedState?: string;
  message?: string;
}

export interface ResourceDiagnosticFocus {
  resourceId: string;
  requestedDeploymentId?: string;
  deploymentId?: string;
}

export interface ResourceDiagnosticContext {
  projectId: string;
  environmentId: string;
  resourceName: string;
  resourceSlug: string;
  resourceKind: ResourceKind;
  destinationId?: string;
  serverId?: string;
  runtimeStrategy?: ExecutionStrategyKind;
  buildStrategy?: BuildStrategyKind;
  packagingMode?: PackagingMode;
  targetKind?: TargetKind;
  targetProviderKey?: string;
  services: Array<{
    name: string;
    kind: ResourceServiceKind;
  }>;
  networkProfile?: ResourceSummary["networkProfile"];
  observationWindow?: {
    from: string;
    to: string;
  };
}

export interface ResourceDiagnosticDeployment {
  id: string;
  status: DeploymentStatus;
  lifecyclePhase: DeploymentStatus;
  runtimePlanId: string;
  sourceKind: SourceKind;
  sourceDisplayName: string;
  serverId?: string;
  destinationId?: string;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  timelineCount: number;
  lastError?: {
    timestamp: string;
    phase: DeploymentTimelineJournalSummary["phase"];
    message: string;
  };
}

export interface ResourceDiagnosticAccess {
  status: ResourceDiagnosticSectionStatus;
  generatedUrl?: string;
  durableUrl?: string;
  serverAppliedUrl?: string;
  plannedUrl?: string;
  latestAccessFailure?: ResourceAccessFailureDiagnostic;
  selectedRoute?: RouteIntentStatusDescriptor;
  routeIntentStatuses?: RouteIntentStatusDescriptor[];
  proxyRouteStatus?: ResourceAccessSummary["proxyRouteStatus"];
  lastRouteRealizationDeploymentId?: string;
  reasonCode?: string;
  phase?: string;
}

export interface ResourceDiagnosticProxySectionSummary {
  id: string;
  title: string;
  format: ProxyConfigurationSection["format"];
  redacted: boolean;
  source: ProxyConfigurationSection["source"];
}

export interface ResourceDiagnosticProxyTlsRouteSummary {
  hostname: string;
  pathPrefix: string;
  tlsMode: TlsMode;
  scheme: "http" | "https";
  automation: ProxyConfigurationTlsAutomation;
  certificateSource: ProxyConfigurationTlsCertificateSource;
  appaloftCertificateManaged: boolean;
  message: string;
}

export interface ResourceDiagnosticProxy {
  status: ResourceDiagnosticSectionStatus;
  providerKey?: string;
  proxyRouteStatus?: ResourceAccessSummary["proxyRouteStatus"];
  configurationIncluded: boolean;
  configurationStatus?: ProxyConfigurationStatus;
  configurationGeneratedAt?: string;
  routeCount?: number;
  sectionCount?: number;
  sections?: ResourceDiagnosticProxySectionSummary[];
  tlsRoutes?: ResourceDiagnosticProxyTlsRouteSummary[];
  warnings?: ProxyConfigurationWarning[];
  reasonCode?: string;
  phase?: string;
}

export interface ResourceDiagnosticLogLine {
  timestamp?: string;
  source?: DeploymentTimelineJournalSource;
  phase?: DeploymentTimelineJournalSummary["phase"];
  level?: LogLevel;
  stream?: ResourceRuntimeLogStreamName;
  serviceName?: string;
  message: string;
  masked: boolean;
}

export interface ResourceDiagnosticLogSection {
  status: ResourceDiagnosticSectionStatus;
  tailLimit: number;
  lineCount: number;
  lines: ResourceDiagnosticLogLine[];
  reasonCode?: string;
  phase?: string;
}

export interface ResourceDiagnosticSystem {
  entrypoint: ExecutionContext["entrypoint"];
  requestId: string;
  locale: ExecutionContext["locale"];
  readinessStatus?: DiagnosticsStatus["status"];
  databaseDriver?: string;
  databaseMode?: string;
}

export interface ResourceDiagnosticRedaction {
  policy: "deployment-environment-secrets";
  masked: boolean;
  maskedValueCount: number;
}

export interface ResourceDiagnosticCopyPayload {
  json: string;
  markdown?: string;
  plainText?: string;
}

export interface ResourceDiagnosticSummary {
  schemaVersion: "resources.diagnostic-summary/v1";
  generatedAt: string;
  focus: ResourceDiagnosticFocus;
  context: ResourceDiagnosticContext;
  deployment?: ResourceDiagnosticDeployment;
  access: ResourceDiagnosticAccess;
  proxy: ResourceDiagnosticProxy;
  deploymentTimeline: ResourceDiagnosticLogSection;
  runtimeLogs: ResourceDiagnosticLogSection;
  system: ResourceDiagnosticSystem;
  sourceErrors: ResourceDiagnosticSourceError[];
  redaction: ResourceDiagnosticRedaction;
  copy: ResourceDiagnosticCopyPayload;
}

export interface EnvironmentDiffSummary {
  key: string;
  exposure: VariableExposure;
  change: "added" | "removed" | "changed" | "unchanged";
  left?: {
    key: string;
    value: string;
    scope: ConfigScope;
    exposure: VariableExposure;
    isSecret: boolean;
    kind: VariableKind;
  };
  right?: {
    key: string;
    value: string;
    scope: ConfigScope;
    exposure: VariableExposure;
    isSecret: boolean;
    kind: VariableKind;
  };
}

export type EnvironmentDuplicateDependencyDecisionHint =
  | "create-new-managed"
  | "bind-existing"
  | "reuse-source"
  | "defer";

export interface EnvironmentDuplicateTargetSummary {
  projectId: string;
  name: string;
  environmentId?: string;
  existingEnvironmentId?: string;
  existingLifecycleStatus?: EnvironmentSummary["lifecycleStatus"];
  conflict: boolean;
}

export interface EnvironmentDuplicateVariableCandidate {
  key: string;
  scope: ConfigScope;
  exposure: VariableExposure;
  kind: VariableKind;
  isSecret: boolean;
  maskedValue: string;
  decisionHint: "copy" | "defer";
}

export interface EnvironmentDuplicateResourceCandidate {
  resourceId: string;
  name: string;
  slug: string;
  kind: ResourceSummary["kind"];
  services: ResourceSummary["services"];
  networkProfile?: ResourceSummary["networkProfile"];
  accessProfile?: ResourceSummary["accessProfile"];
  decisionHint: "recreate-resource" | "bind-existing" | "defer";
}

export interface EnvironmentDuplicateDependencyCandidate {
  dependencyResourceId: string;
  name: string;
  slug: string;
  kind: DependencyResourceSummary["kind"];
  sourceMode: DependencyResourceSummary["sourceMode"];
  providerKey: string;
  providerManaged: boolean;
  lifecycleStatus: DependencyResourceSummary["lifecycleStatus"];
  desiredCapabilities: DependencyResourceSummary["desiredCapabilities"];
  decisionHint: EnvironmentDuplicateDependencyDecisionHint;
  reasons: string[];
}

export interface EnvironmentDuplicateDependencyBindingCandidate {
  bindingId: string;
  resourceId: string;
  dependencyResourceId: string;
  kind: ResourceDependencyBindingSummary["kind"];
  target: ResourceDependencyBindingSummary["target"];
  decisionHint: "rebind-after-dependency-decision" | "defer";
}

export interface EnvironmentDuplicateDomainRouteCandidate {
  domainBindingId: string;
  resourceId: string;
  domainName: string;
  pathPrefix: string;
  proxyKind: EdgeProxyKind;
  tlsMode: TlsMode;
  redirectTo?: string;
  redirectStatus?: 301 | 302 | 307 | 308;
  status: DomainBindingSummary["status"];
  decisionHint: "regenerate" | "defer";
  reasons: string[];
}

export interface EnvironmentDuplicateStorageDecisionCandidate {
  storageVolumeId: string;
  storageVolumeName: string;
  storageVolumeKind: StorageVolumeKind;
  resourceId: string;
  attachmentId: string;
  destinationPath: string;
  mountMode: "read-write" | "read-only";
  dataFormat?: StorageVolumeBackupDataFormat;
  applicationDataLabel?: string;
  decisionHint: "empty" | "restore-backup" | "import-data" | "defer";
  reasons: string[];
}

export interface EnvironmentDuplicatePlanWarning {
  code: string;
  message: string;
}

export interface EnvironmentDuplicatePlanSummary {
  schemaVersion: "environments.duplicate-plan/v1";
  sourceEnvironment: EnvironmentSummary;
  target: EnvironmentDuplicateTargetSummary;
  variableCandidates: EnvironmentDuplicateVariableCandidate[];
  resourceCandidates: EnvironmentDuplicateResourceCandidate[];
  dependencyCandidates: EnvironmentDuplicateDependencyCandidate[];
  dependencyBindingCandidates: EnvironmentDuplicateDependencyBindingCandidate[];
  domainRouteCandidates: EnvironmentDuplicateDomainRouteCandidate[];
  storageDecisionCandidates: EnvironmentDuplicateStorageDecisionCandidate[];
  warnings: EnvironmentDuplicatePlanWarning[];
  generatedAt: string;
}

export type EnvironmentDuplicateResourceDecision = "copy-shape" | "defer";

export type EnvironmentDuplicateDependencyApplyDecision =
  EnvironmentDuplicateDependencyDecisionHint;

export interface EnvironmentDuplicateCopiedResourceSummary {
  sourceResourceId: string;
  targetResourceId: string;
  name: string;
  slug: string;
}

export interface EnvironmentDuplicateAppliedDependencySummary {
  sourceDependencyResourceId: string;
  targetDependencyResourceId: string;
  decision: EnvironmentDuplicateDependencyApplyDecision;
  kind: DependencyResourceKind;
  name: string;
}

export interface EnvironmentDuplicateCreatedDependencyBindingSummary {
  sourceBindingId: string;
  sourceResourceId: string;
  targetResourceId: string;
  sourceDependencyResourceId: string;
  targetDependencyResourceId: string;
  targetName: string;
  scope: ResourceDependencyBindingTargetSummary["scope"];
  injectionMode: ResourceDependencyBindingTargetSummary["injectionMode"];
  bindingId: string;
}

export interface EnvironmentDuplicateDeferredDecisionSummary {
  kind:
    | "resource"
    | "dependency"
    | "dependency-binding"
    | "route"
    | "storage"
    | "resource-variable"
    | "access-profile"
    | "auto-deploy-policy"
    | "runtime-health-check";
  sourceId: string;
  decision?: string;
  reason: string;
}

export interface EnvironmentProfilePendingDecisionSummary {
  id: string;
  projectId: string;
  environmentId: string;
  resourceId?: string;
  kind: EnvironmentDuplicateDeferredDecisionSummary["kind"];
  sourceId: string;
  sourceEnvironmentId?: string;
  sourceResourceId?: string;
  decision?: string;
  reason: string;
  status: "pending" | "resolved";
  createdAt: string;
  resolvedAt?: string;
}

export interface RecordEnvironmentProfilePendingDecisionInput {
  id: string;
  projectId: string;
  environmentId: string;
  kind: EnvironmentProfilePendingDecisionSummary["kind"];
  sourceId: string;
  reason: string;
  createdAt: string;
  resourceId?: string;
  sourceEnvironmentId?: string;
  sourceResourceId?: string;
  decision?: string;
}

export interface EnvironmentProfileDecisionRepository {
  recordPending(
    context: RepositoryContext,
    input: RecordEnvironmentProfilePendingDecisionInput,
  ): Promise<void>;
}

export interface EnvironmentProfileDecisionReadModel {
  listPending(
    context: RepositoryContext,
    input: {
      environmentId: string;
      resourceId?: string;
    },
  ): Promise<EnvironmentProfilePendingDecisionSummary[]>;
}

export interface EnvironmentDuplicateProfileApplyResult {
  schemaVersion: "environments.duplicate-profile/v1";
  sourceEnvironmentId: string;
  targetEnvironmentId: string;
  copiedResources: EnvironmentDuplicateCopiedResourceSummary[];
  appliedDependencies: EnvironmentDuplicateAppliedDependencySummary[];
  createdDependencyBindings: EnvironmentDuplicateCreatedDependencyBindingSummary[];
  deferredDecisions: EnvironmentDuplicateDeferredDecisionSummary[];
  warnings: EnvironmentDuplicatePlanWarning[];
  generatedAt: string;
}

export type EnvironmentProfileDiffSection =
  | "variable"
  | "resource"
  | "dependency-binding"
  | "route"
  | "storage"
  | "pending-decision";

export type EnvironmentProfileDiffChange = "added" | "removed" | "changed" | "unchanged";

export interface EnvironmentProfileDiffEntry<TValue = Record<string, unknown>> {
  section: EnvironmentProfileDiffSection;
  key: string;
  change: EnvironmentProfileDiffChange;
  source?: TValue;
  target?: TValue;
}

export interface EnvironmentProfileDiffSummary {
  schemaVersion: "environments.diff-profile/v1";
  sourceEnvironment: EnvironmentSummary;
  targetEnvironment: EnvironmentSummary;
  entries: EnvironmentProfileDiffEntry[];
  counts: {
    added: number;
    removed: number;
    changed: number;
    unchanged: number;
  };
  generatedAt: string;
}

export interface EnvironmentProfileSyncedResourceSummary {
  sourceResourceId: string;
  targetResourceId: string;
  name: string;
  slug: string;
  action: "created";
}

export interface EnvironmentProfileSyncSkippedResourceSummary {
  sourceResourceId: string;
  targetResourceId: string;
  name: string;
  slug: string;
  reason: "target-resource-exists";
}

export interface EnvironmentProfileSyncResult {
  schemaVersion: "environments.sync-profile/v1";
  sourceEnvironmentId: string;
  targetEnvironmentId: string;
  syncedResources: EnvironmentProfileSyncedResourceSummary[];
  skippedResources: EnvironmentProfileSyncSkippedResourceSummary[];
  deferredDecisions: EnvironmentDuplicateDeferredDecisionSummary[];
  warnings: EnvironmentDuplicatePlanWarning[];
  generatedAt: string;
}

export interface ServerBackedDeploymentSummaryTarget {
  kind: "server-backed";
  serverId: string;
  destinationId: string;
}

export interface ServerlessStaticArtifactDeploymentSummaryTarget {
  kind: "serverless-static-artifact";
  publicationId: string;
  artifactId: string;
  routeUrl: string;
}

export type DeploymentSummaryTarget =
  | ServerBackedDeploymentSummaryTarget
  | ServerlessStaticArtifactDeploymentSummaryTarget;

export interface BaseDeploymentSummary {
  id: string;
  projectId: string;
  environmentId: string;
  resourceId: string;
  target: DeploymentSummaryTarget;
  status: DeploymentStatus;
  triggerKind?: DeploymentTriggerKind;
  sourceDeploymentId?: string;
  rollbackCandidateDeploymentId?: string;
  sourceCommitSha?: string;
  runtimePlan: {
    id: string;
    source: {
      kind: SourceKind;
      locator: string;
      displayName: string;
      version?: {
        reference: {
          sourceKind: VersionSourceKind;
          referenceKind: VersionReferenceKind;
          value: string;
        };
        fixedIdentifier?: {
          sourceKind: VersionSourceKind;
          referenceKind: VersionReferenceKind;
          value: string;
        };
        aliases?: Array<{
          sourceKind: VersionSourceKind;
          referenceKind: VersionReferenceKind;
          value: string;
        }>;
        detected?: boolean;
      };
      inspection?: {
        runtimeFamily?:
          | "custom"
          | "dotnet"
          | "elixir"
          | "go"
          | "java"
          | "node"
          | "php"
          | "python"
          | "ruby"
          | "rust"
          | "static";
        framework?:
          | "actix-web"
          | "angular"
          | "astro"
          | "aspnet-core"
          | "axum"
          | "chi"
          | "django"
          | "echo"
          | "express"
          | "fastapi"
          | "fastify"
          | "fiber"
          | "flask"
          | "gin"
          | "hono"
          | "koa"
          | "laravel"
          | "micronaut"
          | "nestjs"
          | "nextjs"
          | "nuxt"
          | "phoenix"
          | "quarkus"
          | "rails"
          | "react"
          | "remix"
          | "rocket"
          | "sinatra"
          | "spring-boot"
          | "solid"
          | "svelte"
          | "sveltekit"
          | "symfony"
          | "vite"
          | "vue";
        packageManager?:
          | "bun"
          | "cargo"
          | "composer"
          | "dotnet"
          | "go"
          | "gradle"
          | "maven"
          | "mix"
          | "npm"
          | "pip"
          | "pnpm"
          | "poetry"
          | "uv"
          | "yarn";
        applicationShape?:
          | "static"
          | "serverful-http"
          | "ssr"
          | "hybrid-static-server"
          | "worker"
          | "container-native";
        runtimeVersion?: string;
        projectName?: string;
        detectedFiles?: Array<
          | "compose-manifest"
          | "angular-json"
          | "astro-config"
          | "bun-lock"
          | "cargo-toml"
          | "composer-json"
          | "csproj"
          | "django-manage"
          | "dockerfile"
          | "git-directory"
          | "go-mod"
          | "gradle-build"
          | "gradle-kotlin-build"
          | "gradle-wrapper"
          | "jvm-runnable-jar"
          | "mix-exs"
          | "maven-wrapper"
          | "next-app-router"
          | "next-config"
          | "next-pages-router"
          | "next-standalone-output"
          | "next-static-output"
          | "nuxt-config"
          | "package-lock"
          | "package-json"
          | "pnpm-lock"
          | "poetry-lock"
          | "pom-xml"
          | "pyproject-toml"
          | "requirements-txt"
          | "remix-config"
          | "svelte-config"
          | "spring-boot-actuator"
          | "uv-lock"
          | "vite-config"
          | "yarn-lock"
        >;
        detectedScripts?: Array<
          "build" | "dev" | "export" | "generate" | "preview" | "serve" | "start" | "start-built"
        >;
        dockerfilePath?: string;
        composeFilePath?: string;
        jarPath?: string;
      };
      metadata?: Record<string, string>;
    };
    buildStrategy: BuildStrategyKind;
    packagingMode: PackagingMode;
    runtimeArtifact?: {
      kind: RuntimeArtifactKind;
      intent: RuntimeArtifactIntent;
      image?: string;
      composeFile?: string;
      metadata?: Record<string, string>;
    };
    execution: {
      kind: ExecutionStrategyKind;
      workingDirectory?: string;
      installCommand?: string;
      buildCommand?: string;
      startCommand?: string;
      healthCheckPath?: string;
      healthCheck?: RequestedDeploymentHealthCheck;
      port?: number;
      image?: string;
      dockerfilePath?: string;
      composeFile?: string;
      accessRoutes?: Array<{
        proxyKind: EdgeProxyKind;
        domains: string[];
        pathPrefix: string;
        tlsMode: TlsMode;
        targetPort?: number;
        routeBehavior?: "serve" | "redirect";
        redirectTo?: string;
        redirectStatus?: 301 | 302 | 307 | 308;
      }>;
      verificationSteps?: Array<{
        kind: "internal-http" | "public-http";
        label: string;
      }>;
      metadata?: Record<string, string>;
    };
    target: {
      kind: TargetKind;
      providerKey: string;
      serverIds: string[];
      metadata?: Record<string, string>;
    };
    detectSummary: string;
    generatedAt: string;
    steps: string[];
  };
  environmentSnapshot: {
    id: string;
    environmentId: string;
    createdAt: string;
    precedence: string[];
    variables: Array<{
      key: string;
      value: string;
      kind: VariableKind;
      exposure: VariableExposure;
      scope: ConfigScope;
      isSecret: boolean;
    }>;
  };
  dependencyBindingReferences?: DeploymentDependencyBindingSnapshotReferenceSummary[];
  timeline: DeploymentTimelineJournalSummary[];
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  archivedAt?: string;
  rollbackOfDeploymentId?: string;
  timelineCount: number;
}

export type ServerBackedDeploymentSummary = BaseDeploymentSummary & {
  target: ServerBackedDeploymentSummaryTarget;
  serverId: string;
  destinationId: string;
};

export type ServerlessStaticArtifactDeploymentSummary = BaseDeploymentSummary & {
  target: ServerlessStaticArtifactDeploymentSummaryTarget;
  serverId?: never;
  destinationId?: never;
};

export type DeploymentSummary =
  | ServerBackedDeploymentSummary
  | ServerlessStaticArtifactDeploymentSummary;

export type DeploymentDetailSummary = Omit<DeploymentSummary, "timeline">;

export type DeploymentPlanReadinessStatus = "ready" | "blocked" | "warning";

export type DeploymentPlanReasonCode =
  | "resource-source-missing"
  | "resource-source-unnormalized"
  | "runtime-profile-missing"
  | "network-profile-missing"
  | "internal-port-missing"
  | "missing-internal-port"
  | "static-publish-directory-missing"
  | "compose-target-service-missing"
  | "unsupported-framework"
  | "unsupported-runtime-family"
  | "ambiguous-framework"
  | "ambiguous-framework-evidence"
  | "ambiguous-build-tool"
  | "ambiguous-jvm-build-tool"
  | "ambiguous-python-app-target"
  | "missing-asgi-app"
  | "missing-build-tool"
  | "missing-jvm-build-tool"
  | "missing-runnable-jar"
  | "missing-wsgi-app"
  | "missing-python-app-target"
  | "missing-start-intent"
  | "missing-build-intent"
  | "missing-production-start-command"
  | "missing-static-output"
  | "missing-source-root"
  | "missing-artifact-output"
  | "incompatible-source-strategy"
  | "runtime-target-unsupported"
  | "unsupported-runtime-target"
  | "unsupported-container-native-profile"
  | "access-plan-unavailable"
  | "buildpack-disabled"
  | "buildpack-target-unavailable"
  | "unsupported-buildpack-builder"
  | "unsupported-buildpack-lifecycle-feature"
  | "ambiguous-buildpack-evidence"
  | "missing-buildpack-evidence"
  | "buildpack-start-intent-missing"
  | "buildpack-preview-limited"
  | "dependency-runtime-injection-blocked"
  | "environment-profile-decision-pending";

export interface DeploymentPlanReason {
  code: DeploymentPlanReasonCode;
  reasonCode?: DeploymentPlanReasonCode;
  category: "blocked" | "warning" | "info";
  phase: string;
  message: string;
  recommendation?: string;
  evidence?: Array<{
    kind: string;
    label: string;
    value?: string;
    source?: string;
  }>;
  fixPath?: Array<{
    kind: "query" | "command" | "workflow-action" | "docs";
    targetOperation?: string;
    label: string;
    profileField?: string;
    docsAnchor?: string;
    safeByDefault?: boolean;
  }>;
  overridePath?: Array<{
    kind: "query" | "command" | "workflow-action" | "docs";
    targetOperation?: string;
    label: string;
    profileField?: string;
    docsAnchor?: string;
    safeByDefault?: boolean;
  }>;
  affectedProfileField?: string;
  relatedEntityId?: string;
  relatedEntityType?: string;
}

export interface DeploymentPlanPreview {
  schemaVersion: "deployments.plan/v1";
  context: {
    projectId: string;
    environmentId: string;
    resourceId: string;
    serverId: string;
    destinationId: string;
    projectName?: string;
    environmentName?: string;
    resourceName?: string;
    serverName?: string;
  };
  readiness: {
    status: DeploymentPlanReadinessStatus;
    ready: boolean;
    reasonCodes: DeploymentPlanReasonCode[];
  };
  source: {
    kind: SourceKind;
    displayName: string;
    locator: string;
    runtimeFamily?: string;
    framework?: string;
    packageManager?: string;
    applicationShape?: string;
    runtimeVersion?: string;
    projectName?: string;
    detectedFiles: string[];
    detectedScripts: string[];
    dockerfilePath?: string;
    composeFilePath?: string;
    jarPath?: string;
    reasoning: string[];
  };
  planner: {
    plannerKey: string;
    supportTier:
      | "first-class"
      | "generic"
      | "custom"
      | "explicit-custom"
      | "container-native"
      | "buildpack-accelerated"
      | "unsupported"
      | "ambiguous"
      | "requires-override";
    buildStrategy: BuildStrategyKind;
    packagingMode: PackagingMode;
    targetKind: TargetKind;
    targetProviderKey: string;
  };
  buildpack?: {
    status: "selected" | "non-winning" | "blocked" | "disabled" | "unavailable";
    supportTier: "buildpack-accelerated" | "unsupported" | "ambiguous" | "requires-override";
    evidence: {
      platformFiles: string[];
      languageFamilies: string[];
      frameworkHints: string[];
      builderEvidence: string[];
      detectedBuildpacks: Array<{
        id: string;
        version?: string;
      }>;
    };
    builderPolicy: {
      defaultBuilder?: string;
      requestedBuilder?: string;
      override: "none" | "allowed" | "blocked";
      blockedBuilders: string[];
    };
    artifactIntent?: RuntimeArtifactIntent;
    limitations: Array<{
      code: DeploymentPlanReasonCode | string;
      message: string;
      fixPath?: string;
    }>;
  };
  artifact: {
    kind:
      | "dockerfile-image"
      | "static-server-image"
      | "compose-project"
      | "prebuilt-image"
      | "custom-command-image"
      | "workspace-image";
    runtimeArtifactKind?: RuntimeArtifactKind;
    runtimeArtifactIntent?: RuntimeArtifactIntent;
    image?: string;
    composeFile?: string;
    metadata?: Record<string, string>;
  };
  commands: Array<{
    kind: "install" | "build" | "package" | "start";
    command: string;
    source: "resource-runtime-profile" | "planner";
  }>;
  network: {
    internalPort?: number;
    upstreamProtocol?: ResourceNetworkProtocol;
    exposureMode?: ResourceExposureMode;
    hostPort?: number;
    targetServiceName?: string;
  };
  health: {
    enabled: boolean;
    kind: "http" | "command" | "none";
    path?: string;
    port?: number;
  };
  access?: {
    routeSource?: string;
    hostname?: string;
    scheme?: "http" | "https";
    routeCount?: number;
    routeGroupCount?: number;
  };
  dependencyBindings?: DeploymentDependencyBindingSnapshotSummary;
  warnings: DeploymentPlanReason[];
  unsupportedReasons: DeploymentPlanReason[];
  nextActions: Array<{
    kind: "query" | "command" | "workflow-action";
    targetOperation: string;
    label: string;
    safeByDefault: boolean;
    blockedReasonCode?: DeploymentPlanReasonCode;
  }>;
  generatedAt: string;
}

export type DeploymentDetailSection =
  | "related-context"
  | "timeline"
  | "snapshot"
  | "latest-failure";

export interface DeploymentDetailSectionError {
  section: DeploymentDetailSection;
  code: string;
  category: string;
  phase: string;
  retriable: boolean;
  relatedEntityId?: string;
  relatedState?: string;
}

export interface DeploymentAttemptStatusSummary {
  current: DeploymentStatus;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  rollbackOfDeploymentId?: string;
}

export interface DeploymentAttemptTimeline {
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  timelineCount: number;
}

export interface DeploymentAttemptSnapshot {
  runtimePlan: DeploymentDetailSummary["runtimePlan"];
  environmentSnapshot: DeploymentDetailSummary["environmentSnapshot"];
  dependencyBindings?: DeploymentDependencyBindingSnapshotSummary;
}

export interface DeploymentAttemptFailureSummary {
  timestamp: string;
  source: DeploymentTimelineJournalSource;
  phase: DeploymentTimelineJournalSummary["phase"];
  level: LogLevel;
  message: string;
}

export interface DeploymentRelatedProjectContext {
  id: string;
  name?: string;
  slug?: string;
}

export interface DeploymentRelatedEnvironmentContext {
  id: string;
  name?: string;
  kind?: EnvironmentKind;
}

export interface DeploymentRelatedResourceContext {
  id: string;
  name?: string;
  slug?: string;
  kind?: ResourceKind;
}

export interface DeploymentRelatedServerContext {
  id: string;
  name?: string;
  host?: string;
  port?: number;
  providerKey?: string;
}

export interface DeploymentRelatedDestinationContext {
  id: string;
}

export interface DeploymentRelatedContext {
  project: DeploymentRelatedProjectContext;
  environment: DeploymentRelatedEnvironmentContext;
  resource: DeploymentRelatedResourceContext;
  server?: DeploymentRelatedServerContext;
  destination?: DeploymentRelatedDestinationContext;
}

export type DeploymentAttemptNextAction =
  | "timeline"
  | "resource-detail"
  | "resource-health"
  | "diagnostic-summary";

export type DeploymentRecoveryReasonCode =
  | "attempt-not-terminal"
  | "attempt-status-not-recoverable"
  | "snapshot-missing"
  | "environment-snapshot-missing"
  | "runtime-target-missing"
  | "runtime-artifact-missing"
  | "rollback-candidate-not-successful"
  | "rollback-candidate-expired"
  | "rollback-candidate-target-mismatch"
  | "resource-profile-invalid"
  | "resource-runtime-busy"
  | "stateful-data-rollback-unsupported"
  | "recovery-command-not-active";

export interface DeploymentRecoveryReadinessReason {
  code: DeploymentRecoveryReasonCode;
  category: "allowed" | "blocked" | "warning" | "info";
  phase: string;
  relatedDeploymentId?: string;
  relatedEntityId?: string;
  relatedEntityType?: string;
  retriable: boolean;
  recommendation?: string;
}

export interface DeploymentRecoveryActionReadiness {
  allowed: boolean;
  commandActive: boolean;
  reasons: DeploymentRecoveryReadinessReason[];
  targetOperation: "deployments.retry" | "deployments.redeploy" | "deployments.rollback";
}

export interface RollbackCandidateReadiness {
  deploymentId: string;
  finishedAt: string;
  status: "succeeded";
  sourceSummary?: string;
  artifactSummary?: string;
  environmentSnapshotId?: string;
  runtimeTargetSummary?: string;
  rollbackReady: boolean;
  reasons: DeploymentRecoveryReadinessReason[];
}

export interface DeploymentRecoveryRecommendedAction {
  kind: "query" | "command" | "workflow-action";
  targetOperation:
    | "deployments.show"
    | "deployments.timeline"
    | "deployments.timeline.stream"
    | "resources.health"
    | "resources.diagnostic-summary"
    | "deployments.retry"
    | "deployments.redeploy"
    | "deployments.rollback";
  label: string;
  safeByDefault: boolean;
  blockedReasonCode?: DeploymentRecoveryReasonCode;
  commandActive?: boolean;
}

export interface DeploymentRecoveryReadiness {
  schemaVersion: "deployments.recovery-readiness/v1";
  deploymentId: string;
  resourceId: string;
  generatedAt: string;
  stateVersion: string;
  recoverable: boolean;
  retryable: boolean;
  redeployable: boolean;
  rollbackReady: boolean;
  rollbackCandidateCount: number;
  retry: DeploymentRecoveryActionReadiness;
  redeploy: DeploymentRecoveryActionReadiness;
  rollback: {
    allowed: boolean;
    commandActive: boolean;
    reasons: DeploymentRecoveryReadinessReason[];
    candidates: RollbackCandidateReadiness[];
    recommendedCandidateId?: string;
  };
  recommendedActions: DeploymentRecoveryRecommendedAction[];
}

export interface DeploymentAttemptRecoverySummary {
  source: "deployments.recovery-readiness";
  retryable: boolean;
  redeployable: boolean;
  rollbackReady: boolean;
  rollbackCandidateCount: number;
  blockedReasonCodes: string[];
}

export interface DeploymentDetail {
  schemaVersion: "deployments.show/v1";
  deployment: DeploymentDetailSummary;
  status: DeploymentAttemptStatusSummary;
  relatedContext?: DeploymentRelatedContext;
  snapshot?: DeploymentAttemptSnapshot;
  timeline?: DeploymentAttemptTimeline;
  latestFailure?: DeploymentAttemptFailureSummary;
  recoverySummary?: DeploymentAttemptRecoverySummary;
  nextActions: DeploymentAttemptNextAction[];
  sectionErrors: DeploymentDetailSectionError[];
  generatedAt: string;
}

export const operatorWorkKinds = [
  "deployment",
  "quick-deploy",
  "blueprint-install",
  "proxy-bootstrap",
  "certificate",
  "remote-state",
  "route-realization",
  "runtime-maintenance",
  "system",
] as const;

export type OperatorWorkKind = (typeof operatorWorkKinds)[number];

export const operatorWorkStatuses = [
  "pending",
  "running",
  "retry-scheduled",
  "succeeded",
  "failed",
  "canceled",
  "dead-lettered",
  "unknown",
] as const;

export type OperatorWorkStatus = (typeof operatorWorkStatuses)[number];

export const operatorWorkNextActions = [
  "diagnostic",
  "retry",
  "manual-review",
  "no-action",
] as const;

export type OperatorWorkNextAction = (typeof operatorWorkNextActions)[number];

export interface OperatorWorkItem {
  id: string;
  kind: OperatorWorkKind;
  status: OperatorWorkStatus;
  operationKey: string;
  phase?: string;
  step?: string;
  projectId?: string;
  resourceId?: string;
  deploymentId?: string;
  serverId?: string;
  domainBindingId?: string;
  certificateId?: string;
  startedAt?: string;
  updatedAt: string;
  finishedAt?: string;
  errorCode?: string;
  errorCategory?: string;
  retriable?: boolean;
  nextActions: OperatorWorkNextAction[];
  safeDetails?: Record<string, string | number | boolean | null>;
}

export interface OperatorWorkEvent {
  id: string;
  sequence: number;
  kind: string;
  status?: OperatorWorkStatus;
  phase?: string;
  step?: string;
  message?: string;
  workerId?: string;
  workerGroup?: string;
  occurredAt: string;
  safeDetails?: Record<string, string | number | boolean | null>;
}

export type OperatorWorkEventStreamStatusKind =
  | "accepted"
  | "running"
  | "progress"
  | "retry-scheduled"
  | "succeeded"
  | "failed"
  | "canceled"
  | "dead-lettered";

export interface OperatorWorkObservedEvent {
  workId: string;
  sequence: number;
  cursor: string;
  emittedAt: string;
  kind: OperatorWorkEventStreamStatusKind;
  status: OperatorWorkStatus;
  operationKey: string;
  workKind: OperatorWorkKind;
  phase?: string;
  step?: string;
  message?: string;
  projectId?: string;
  resourceId?: string;
  deploymentId?: string;
  serverId?: string;
  errorCode?: string;
  errorCategory?: string;
  retriable?: boolean;
  safeDetails?: Record<string, string | number | boolean | null>;
}

export type OperatorWorkEventStreamPhase = "event-replay" | "live-follow";

export interface OperatorWorkEventStreamGap {
  code: string;
  phase: OperatorWorkEventStreamPhase;
  retriable: boolean;
  cursor?: string;
  lastSequence?: number;
  recommendedAction?: "restart-stream" | "open-work-detail";
}

export type OperatorWorkEventStreamEnvelope =
  | {
      schemaVersion: "operator-work.stream-events/v1";
      kind: OperatorWorkEventStreamStatusKind;
      event: OperatorWorkObservedEvent;
    }
  | {
      schemaVersion: "operator-work.stream-events/v1";
      kind: "heartbeat";
      at: string;
      cursor?: string;
    }
  | {
      schemaVersion: "operator-work.stream-events/v1";
      kind: "gap";
      gap: OperatorWorkEventStreamGap;
    }
  | {
      schemaVersion: "operator-work.stream-events/v1";
      kind: "closed";
      reason: "completed" | "cancelled" | "source-ended" | "idle-timeout";
      cursor?: string;
    }
  | {
      schemaVersion: "operator-work.stream-events/v1";
      kind: "error";
      error: DomainError;
    };

export interface OperatorWorkEventStream extends AsyncIterable<OperatorWorkEventStreamEnvelope> {
  close(): Promise<void>;
}

export type StreamOperatorWorkEventsResult =
  | {
      mode: "bounded";
      workId: string;
      envelopes: OperatorWorkEventStreamEnvelope[];
    }
  | {
      mode: "stream";
      workId: string;
      stream: OperatorWorkEventStream;
    };

export interface RouteRealizationWorkSummary {
  id: string;
  status: OperatorWorkStatus;
  operationKey: string;
  phase?: string;
  step?: string;
  projectId?: string;
  resourceId?: string;
  deploymentId?: string;
  serverId?: string;
  domainBindingId?: string;
  startedAt?: string;
  updatedAt: string;
  finishedAt?: string;
  errorCode?: string;
  errorCategory?: string;
  retriable?: boolean;
  nextActions: OperatorWorkNextAction[];
  safeDetails?: Record<string, string | number | boolean | null>;
}

export interface RouteRealizationWorkReadModel {
  list(
    context: RepositoryContext,
    input?: {
      resourceId?: string;
      serverId?: string;
      deploymentId?: string;
      limit?: number;
    },
  ): Promise<RouteRealizationWorkSummary[]>;
}

export interface RemoteStateWorkSummary {
  id: string;
  status: OperatorWorkStatus;
  operationKey: string;
  phase:
    | "remote-state-lock"
    | "remote-state-migration"
    | "remote-state-backup"
    | "remote-state-recovery";
  step?: string;
  serverId?: string;
  startedAt?: string;
  updatedAt: string;
  finishedAt?: string;
  errorCode?: string;
  errorCategory?: string;
  retriable?: boolean;
  nextActions: OperatorWorkNextAction[];
  safeDetails?: Record<string, string | number | boolean | null>;
}

export interface RemoteStateWorkReadModel {
  list(
    context: RepositoryContext,
    input?: {
      serverId?: string;
      limit?: number;
    },
  ): Promise<RemoteStateWorkSummary[]>;
}

export interface OperatorWorkList {
  schemaVersion: "operator-work.list/v1";
  items: OperatorWorkItem[];
  generatedAt: string;
}

export interface OperatorWorkDetail {
  schemaVersion: "operator-work.show/v1";
  item: OperatorWorkItem;
  events?: OperatorWorkEvent[];
  generatedAt: string;
}

export type ProcessAttemptKind = OperatorWorkKind;
export type ProcessAttemptStatus = OperatorWorkStatus;
export type ProcessAttemptNextAction = OperatorWorkNextAction;

export interface ProcessAttemptRecord {
  id: string;
  kind: ProcessAttemptKind;
  status: ProcessAttemptStatus;
  operationKey: string;
  dedupeKey?: string;
  correlationId?: string;
  requestId?: string;
  phase?: string;
  step?: string;
  projectId?: string;
  resourceId?: string;
  deploymentId?: string;
  serverId?: string;
  domainBindingId?: string;
  certificateId?: string;
  startedAt?: string;
  updatedAt: string;
  finishedAt?: string;
  errorCode?: string;
  errorCategory?: string;
  retriable?: boolean;
  nextEligibleAt?: string;
  nextActions: ProcessAttemptNextAction[];
  safeDetails?: Record<string, string | number | boolean | null>;
}

export interface ProcessAttemptListFilter {
  kind?: ProcessAttemptKind;
  status?: ProcessAttemptStatus;
  projectId?: string;
  resourceId?: string;
  serverId?: string;
  deploymentId?: string;
  limit?: number;
}

export interface ProcessAttemptRetryCandidateFilter {
  kind?: ProcessAttemptKind;
  now: string;
  limit?: number;
}

export interface ProcessAttemptDeliveryCandidateFilter {
  kind?: ProcessAttemptKind;
  operationKey?: string;
  now: string;
  limit?: number;
}

export interface ProcessAttemptRetryGenerationFilter {
  kind?: ProcessAttemptKind;
  operationKey?: string;
  now: string;
  limit?: number;
}

export const prunableProcessAttemptStatuses = [
  "succeeded",
  "failed",
  "canceled",
  "dead-lettered",
] as const;

export type PrunableProcessAttemptStatus = (typeof prunableProcessAttemptStatuses)[number];

export interface ProcessAttemptPruneInput {
  before: string;
  statuses: PrunableProcessAttemptStatus[];
  dryRun: boolean;
}

export interface ProcessAttemptPruneResult {
  matchedCount: number;
  prunedCount: number;
  countsByStatus: Partial<Record<PrunableProcessAttemptStatus, number>>;
}

export interface ProcessAttemptClaimInput {
  attemptId: string;
  workerId: string;
  claimedAt: string;
  safeDetails?: Record<string, string | number | boolean | null>;
}

export type ProcessAttemptClaimResult =
  | {
      status: "claimed";
      attempt: ProcessAttemptRecord;
    }
  | {
      status: "not-found";
      attemptId: string;
    }
  | {
      status: "already-claimed";
      attempt: ProcessAttemptRecord;
    }
  | {
      status: "not-due";
      attempt: ProcessAttemptRecord;
    }
  | {
      status: "not-claimable";
      attempt: ProcessAttemptRecord;
    };

export type ProcessAttemptCompletionStatus = "succeeded" | "failed" | "retry-scheduled";

export interface ProcessAttemptCompletionInput {
  attemptId: string;
  status: ProcessAttemptCompletionStatus;
  completedAt: string;
  phase?: string;
  step?: string;
  errorCode?: string;
  errorCategory?: string;
  retriable?: boolean;
  nextEligibleAt?: string;
  nextActions: ProcessAttemptNextAction[];
  safeDetails?: Record<string, string | number | boolean | null>;
}

export type ProcessAttemptCompletionResult =
  | {
      status: "completed";
      attempt: ProcessAttemptRecord;
    }
  | {
      status: "not-found";
      attemptId: string;
    }
  | {
      status: "not-running";
      attempt: ProcessAttemptRecord;
    };

export interface ProcessAttemptRetryGenerationInput {
  sourceAttemptId: string;
  retryAttemptId: string;
  generatedAt: string;
  phase: string;
  step: string;
  safeDetails?: Record<string, string | number | boolean | null>;
}

export type ProcessAttemptRetryGenerationResult =
  | {
      status: "generated";
      sourceAttempt: ProcessAttemptRecord;
      retryAttempt: ProcessAttemptRecord;
    }
  | {
      status: "not-found";
      sourceAttemptId: string;
    }
  | {
      status: "not-due";
      sourceAttempt: ProcessAttemptRecord;
    }
  | {
      status: "not-retriable";
      sourceAttempt: ProcessAttemptRecord;
    }
  | {
      status: "stale-generation";
      sourceAttempt: ProcessAttemptRecord;
      latestAttempt: ProcessAttemptRecord;
    };

export interface ProcessAttemptRecorder {
  record(
    context: RepositoryContext,
    attempt: ProcessAttemptRecord,
  ): Promise<Result<ProcessAttemptRecord>>;
}

export interface ProcessAttemptRecoveryRecorder {
  markRecovered(
    context: RepositoryContext,
    attempt: ProcessAttemptRecord,
  ): Promise<Result<ProcessAttemptRecord>>;
  deadLetter(
    context: RepositoryContext,
    attempt: ProcessAttemptRecord,
  ): Promise<Result<ProcessAttemptRecord>>;
  cancel(
    context: RepositoryContext,
    attempt: ProcessAttemptRecord,
  ): Promise<Result<ProcessAttemptRecord>>;
  retry(
    context: RepositoryContext,
    attempt: ProcessAttemptRecord,
  ): Promise<Result<ProcessAttemptRecord>>;
  prune(
    context: RepositoryContext,
    input: ProcessAttemptPruneInput,
  ): Promise<Result<ProcessAttemptPruneResult>>;
}

export interface ProcessAttemptReadModel {
  list(
    context: RepositoryContext,
    filter?: ProcessAttemptListFilter,
  ): Promise<ProcessAttemptRecord[]>;
  findOne(context: RepositoryContext, id: string): Promise<ProcessAttemptRecord | null>;
}

export interface ProcessAttemptRetryCandidateReader {
  listDueRetries(
    context: RepositoryContext,
    filter: ProcessAttemptRetryCandidateFilter,
  ): Promise<ProcessAttemptRecord[]>;
}

export interface ProcessAttemptDeliveryCandidateReader {
  listDueDeliveryCandidates(
    context: RepositoryContext,
    filter: ProcessAttemptDeliveryCandidateFilter,
  ): Promise<ProcessAttemptRecord[]>;
}

export interface ProcessAttemptRetryGenerator {
  generateDueRetry(
    context: RepositoryContext,
    input: ProcessAttemptRetryGenerationInput,
  ): Promise<Result<ProcessAttemptRetryGenerationResult>>;
}

export interface ProcessAttemptClaimer {
  claimDue(
    context: RepositoryContext,
    input: ProcessAttemptClaimInput,
  ): Promise<Result<ProcessAttemptClaimResult>>;
}

export interface ProcessAttemptCompleter {
  complete(
    context: RepositoryContext,
    input: ProcessAttemptCompletionInput,
  ): Promise<Result<ProcessAttemptCompletionResult>>;
}

export interface DeploymentTimelineReadResult {
  schemaVersion: "deployments.timeline/v1";
  deploymentId: string;
  entries: DeploymentTimelineEntry[];
  nextCursor?: string;
  hasMore: boolean;
}

export type StreamDeploymentTimelineResult =
  | {
      mode: "bounded";
      deploymentId: string;
      envelopes: DeploymentTimelineEnvelope[];
    }
  | {
      mode: "stream";
      deploymentId: string;
      stream: DeploymentTimelineStream;
    };

export interface DomainBindingSummary {
  id: string;
  projectId: string;
  environmentId: string;
  resourceId: string;
  serverId?: string;
  destinationId?: string;
  domainName: string;
  pathPrefix: string;
  proxyKind: EdgeProxyKind;
  tlsMode: TlsMode;
  redirectTo?: string;
  redirectStatus?: 301 | 302 | 307 | 308;
  certificatePolicy: CertificatePolicy;
  status: DomainBindingStatus;
  dnsObservation?: {
    status: "pending" | "matched" | "mismatch" | "unresolved" | "lookup_failed" | "skipped";
    expectedTargets: string[];
    observedTargets: string[];
    checkedAt?: string;
    message?: string;
  };
  routeFailure?: {
    deploymentId: string;
    failedAt: string;
    errorCode: string;
    failurePhase: DomainRouteFailurePhase;
    retriable: boolean;
    errorMessage?: string;
  };
  verificationAttemptCount: number;
  createdAt: string;
}

export interface DomainBindingDeleteBlocker {
  kind: "active-certificate" | "certificate-history";
  severity: "blocking" | "warning";
  message: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
  count?: number;
}

export interface DomainBindingDeleteSafety {
  domainBindingId: string;
  safeToDelete: boolean;
  blockers: DomainBindingDeleteBlocker[];
  warnings: DomainBindingDeleteBlocker[];
  preservesGeneratedAccess: true;
  preservesDeploymentSnapshots: true;
  preservesServerAppliedRouteAudit: true;
}

export interface DomainBindingDetail {
  binding: DomainBindingSummary;
  routeReadiness: {
    status: "ready" | "not-ready" | "pending" | "failed" | "deleted";
    routeBehavior: "serve" | "redirect";
    selectedRoute?: RouteIntentStatusDescriptor;
    contextRoutes: RouteIntentStatusDescriptor[];
  };
  generatedAccessFallback?: ResourceAccessRouteSummary | PlannedResourceAccessRouteSummary;
  proxyReadiness?: ResourceAccessSummary["proxyRouteStatus"];
  certificates: CertificateSummary[];
  deleteSafety: DomainBindingDeleteSafety;
}

export interface CertificateAttemptSummary {
  id: string;
  status: "requested" | "issuing" | "issued" | "failed" | "retry_scheduled";
  reason: CertificateIssueReason;
  providerKey: string;
  challengeType: string;
  requestedAt: string;
  issuedAt?: string;
  expiresAt?: string;
  failedAt?: string;
  errorCode?: string;
  failurePhase?: string;
  failureMessage?: string;
  retriable?: boolean;
  retryAfter?: string;
}

export interface CertificateSummary {
  id: string;
  domainBindingId: string;
  domainName: string;
  status: CertificateStatus;
  source: CertificateSource;
  providerKey: string;
  challengeType: string;
  issuedAt?: string;
  expiresAt?: string;
  fingerprint?: string;
  notBefore?: string;
  issuer?: string;
  keyAlgorithm?: string;
  subjectAlternativeNames?: string[];
  latestAttempt?: CertificateAttemptSummary;
  attempts?: CertificateAttemptSummary[];
  createdAt: string;
}

export type SourceEventSourceKind = "github" | "gitlab" | "generic-signed";
export type SourceEventKind = "push" | "tag";
export type SourceEventStatus =
  | "accepted"
  | "deduped"
  | "ignored"
  | "blocked"
  | "dispatched"
  | "failed";
export type SourceEventDedupeStatus = "new" | "duplicate";
export type SourceEventVerificationMethod = "provider-signature" | "generic-hmac";
export type SourceEventIgnoredReason =
  | "no-matching-policy"
  | "ref-not-matched"
  | "policy-disabled"
  | "policy-blocked";
export type SourceEventPolicyResultStatus =
  | "matched"
  | "ignored"
  | "blocked"
  | "dispatch-failed"
  | "dispatched";
export type SourceEventPolicyResultReason =
  | "ref-not-matched"
  | "policy-disabled"
  | "policy-blocked"
  | "dispatch-failed";

export interface SourceEventIdentity {
  locator: string;
  providerRepositoryId?: string;
  repositoryFullName?: string;
}

export interface SourceEventVerificationSummary {
  status: "verified" | "rejected";
  method?: SourceEventVerificationMethod;
  keyVersion?: string;
}

export interface SourceEventPolicyResult {
  resourceId: string;
  status: SourceEventPolicyResultStatus;
  reason?: SourceEventPolicyResultReason;
  deploymentId?: string;
  errorCode?: string;
}

export interface SourceEventRecord {
  sourceEventId: string;
  projectId?: string;
  matchedResourceIds: string[];
  sourceKind: SourceEventSourceKind;
  eventKind: SourceEventKind;
  sourceIdentity: SourceEventIdentity;
  ref: string;
  revision: string;
  deliveryId?: string;
  idempotencyKey?: string;
  dedupeKey: string;
  dedupeStatus: SourceEventDedupeStatus;
  dedupeOfSourceEventId?: string;
  verification: SourceEventVerificationSummary;
  status: SourceEventStatus;
  ignoredReasons: SourceEventIgnoredReason[];
  policyResults: SourceEventPolicyResult[];
  createdDeploymentIds: string[];
  receivedAt: string;
}

export interface SourceEventOutcomeUpdate {
  sourceEventId: string;
  status: SourceEventStatus;
  projectId?: string;
  matchedResourceIds: string[];
  ignoredReasons: SourceEventIgnoredReason[];
  policyResults: SourceEventPolicyResult[];
  createdDeploymentIds: string[];
}

export interface SourceEventListInput {
  projectId?: string;
  resourceId?: string;
  status?: SourceEventStatus;
  sourceKind?: SourceEventSourceKind;
  limit?: number;
  cursor?: string;
}

export interface SourceEventShowInput {
  sourceEventId: string;
  projectId?: string;
  resourceId?: string;
}

export interface SourceEventListItem {
  sourceEventId: string;
  projectId?: string;
  resourceIds: string[];
  sourceKind: SourceEventSourceKind;
  eventKind: SourceEventKind;
  ref: string;
  revision: string;
  status: SourceEventStatus;
  dedupeStatus: SourceEventDedupeStatus;
  ignoredReasons: SourceEventIgnoredReason[];
  createdDeploymentIds: string[];
  receivedAt: string;
}

export interface SourceEventListResult {
  items: SourceEventListItem[];
  nextCursor?: string;
  generatedAt: string;
}

export interface SourceEventListPage {
  items: SourceEventListItem[];
  nextCursor?: string;
}

export interface SourceEventDetail {
  sourceEventId: string;
  projectId?: string;
  matchedResourceIds: string[];
  sourceKind: SourceEventSourceKind;
  eventKind: SourceEventKind;
  sourceIdentity: SourceEventIdentity;
  ref: string;
  revision: string;
  verification: SourceEventVerificationSummary;
  status: SourceEventStatus;
  dedupeOfSourceEventId?: string;
  policyResults: SourceEventPolicyResult[];
  createdDeploymentIds: string[];
  receivedAt: string;
}

export type AuditEventPayloadValue = string | number | boolean | null | readonly string[];

export interface AuditEventListInput {
  aggregateId: string;
  eventType?: string;
  limit?: number;
  cursor?: string;
}

export interface AuditEventShowInput {
  auditEventId: string;
  aggregateId: string;
}

export interface AuditEventExportInput {
  aggregateId: string;
  eventType?: string;
  from?: string;
  to?: string;
  limit?: number;
}

export interface AuditEventGlobalExportInput {
  from: string;
  to: string;
  aggregateId?: string;
  eventType?: string;
  limit?: number;
}

export interface AuditEventSummary {
  auditEventId: string;
  aggregateId: string;
  eventType: string;
  createdAt: string;
}

export interface AuditEventDetail {
  schemaVersion?: "audit-events.show/v1";
  auditEventId: string;
  aggregateId: string;
  eventType: string;
  payload: Record<string, AuditEventPayloadValue>;
  redactedFields: string[];
  createdAt: string;
}

export interface AuditEventListPage {
  items: AuditEventSummary[];
  nextCursor?: string;
}

export interface AuditEventListResult extends AuditEventListPage {
  schemaVersion: "audit-events.list/v1";
  generatedAt: string;
}

export interface AuditEventShowResult {
  schemaVersion: "audit-events.show/v1";
  event: AuditEventDetail;
}

export interface AuditEventExportPage {
  items: AuditEventDetail[];
  truncated: boolean;
}

export interface AuditEventExportResult extends AuditEventExportPage {
  schemaVersion: "audit-events.export/v1";
  aggregateId: string;
  filters: {
    eventType?: string;
    from?: string;
    to?: string;
    limit: number;
  };
  itemCount: number;
  generatedAt: string;
}

export interface AuditEventGlobalExportResult extends AuditEventExportPage {
  schemaVersion: "audit-events.export-global/v1";
  filters: {
    from: string;
    to: string;
    aggregateId?: string;
    eventType?: string;
    limit: number;
  };
  itemCount: number;
  generatedAt: string;
}

export interface AuditEventPruneInput {
  before: string;
  aggregateId?: string;
  eventType?: string;
  dryRun: boolean;
}

export interface AuditEventPruneStoreResult {
  matchedCount: number;
  prunedCount: number;
  heldCount: number;
  archiveRetainedCount: number;
  countsByEventType: Record<string, number>;
  heldCountsByEventType: Record<string, number>;
  archiveRetainedCountsByEventType: Record<string, number>;
  activeHoldIds: string[];
  activeArchiveIds: string[];
}

export interface AuditEventPruneResult extends AuditEventPruneStoreResult {
  schemaVersion: "audit-events.prune/v1";
  before: string;
  aggregateId?: string;
  eventType?: string;
  dryRun: boolean;
  prunedAt: string;
}

export type AuditEventLegalHoldStatus = "active" | "released";

export type AuditEventLegalHoldScope =
  | {
      kind: "aggregate";
      aggregateId: string;
      from?: string;
      to?: string;
    }
  | {
      kind: "global-window";
      from?: string;
      to?: string;
    };

export interface AuditEventLegalHoldRecord {
  holdId: string;
  status: AuditEventLegalHoldStatus;
  scope: AuditEventLegalHoldScope;
  eventType?: string;
  reason: string;
  requestedBy?: string;
  createdAt: string;
  releasedAt?: string;
  releaseReason?: string;
  releasedBy?: string;
}

export interface AuditEventLegalHoldConfigureInput {
  holdId: string;
  aggregateId?: string;
  eventType?: string;
  from?: string;
  to?: string;
  reason: string;
  requestedBy?: string;
  createdAt: string;
}

export interface AuditEventLegalHoldReleaseInput {
  holdId: string;
  releaseReason: string;
  releasedBy?: string;
  releasedAt: string;
}

export interface AuditEventLegalHoldListInput {
  status?: AuditEventLegalHoldStatus;
  aggregateId?: string;
  eventType?: string;
  limit?: number;
  cursor?: string;
}

export interface AuditEventLegalHoldListPage {
  items: AuditEventLegalHoldRecord[];
  nextCursor?: string;
}

export interface AuditEventLegalHoldResult {
  schemaVersion: "audit-events.legal-holds.hold/v1";
  hold: AuditEventLegalHoldRecord;
}

export interface AuditEventLegalHoldListResult extends AuditEventLegalHoldListPage {
  schemaVersion: "audit-events.legal-holds.list/v1";
  generatedAt: string;
}

export interface AuditEventLegalHoldShowResult {
  schemaVersion: "audit-events.legal-holds.show/v1";
  hold: AuditEventLegalHoldRecord;
  generatedAt: string;
}

export type AuditEventArchiveSourceSelection =
  | {
      kind: "aggregate";
      aggregateId: string;
      from?: string;
      to?: string;
    }
  | {
      kind: "global-window";
      from: string;
      to: string;
      aggregateId?: string;
    };

export interface AuditEventArchiveRecord {
  archiveId: string;
  archiveSchemaVersion: "audit-events.archive/v1";
  source: AuditEventArchiveSourceSelection;
  eventType?: string;
  reason: string;
  itemCount: number;
  truncated: boolean;
  contentDigest: string;
  retainSourceRows: boolean;
  createdAt: string;
}

export interface AuditEventArchiveDetail extends AuditEventArchiveRecord {
  items: AuditEventDetail[];
}

export interface AuditEventArchiveCreateInput {
  archiveId: string;
  source: AuditEventArchiveSourceSelection;
  eventType?: string;
  reason: string;
  items: AuditEventDetail[];
  truncated: boolean;
  contentDigest: string;
  retainSourceRows: boolean;
  createdAt: string;
}

export interface AuditEventArchiveListInput {
  aggregateId?: string;
  eventType?: string;
  from?: string;
  to?: string;
  limit?: number;
  cursor?: string;
}

export interface AuditEventArchiveListPage {
  items: AuditEventArchiveRecord[];
  nextCursor?: string;
}

export interface AuditEventArchivePruneInput {
  before: string;
  aggregateId?: string;
  eventType?: string;
  dryRun: boolean;
}

export interface AuditEventArchivePruneStoreResult {
  matchedCount: number;
  prunedCount: number;
  countsBySourceKind: Record<string, number>;
  countsByEventType: Record<string, number>;
}

export interface AuditEventArchiveResult {
  schemaVersion: "audit-events.archives.archive/v1";
  archive: AuditEventArchiveRecord;
}

export interface AuditEventArchiveListResult extends AuditEventArchiveListPage {
  schemaVersion: "audit-events.archives.list/v1";
  generatedAt: string;
}

export interface AuditEventArchiveShowResult {
  schemaVersion: "audit-events.archives.show/v1";
  archive: AuditEventArchiveDetail;
  generatedAt: string;
}

export interface AuditEventArchivePruneResult extends AuditEventArchivePruneStoreResult {
  schemaVersion: "audit-events.archives.prune/v1";
  before: string;
  aggregateId?: string;
  eventType?: string;
  dryRun: boolean;
  prunedAt: string;
}

export interface ProviderJobLogPruneInput {
  before: string;
  deploymentId?: string;
  providerKey?: string;
  resourceId?: string;
  serverId?: string;
  dryRun: boolean;
}

export interface ProviderJobLogPruneStoreResult {
  matchedCount: number;
  prunedCount: number;
  countsByProviderKey: Record<string, number>;
}

export interface ProviderJobLogPruneResult extends ProviderJobLogPruneStoreResult {
  schemaVersion: "provider-job-logs.prune/v1";
  before: string;
  deploymentId?: string;
  providerKey?: string;
  resourceId?: string;
  serverId?: string;
  dryRun: boolean;
  prunedAt: string;
}

export interface DomainEventStreamPruneInput {
  before: string;
  eventType?: string;
  aggregateId?: string;
  aggregateType?: string;
  deploymentId?: string;
  limit?: number;
  dryRun: boolean;
}

export interface DomainEventStreamPruneStoreResult {
  inspectedCount: number;
  candidateCount: number;
  prunedCount: number;
  skippedCount: number;
  countsByEventType: Record<string, number>;
  skippedCountsByReason: Record<string, number>;
}

export interface DomainEventStreamPruneResult extends DomainEventStreamPruneStoreResult {
  schemaVersion: "domain-events.prune/v1";
  before: string;
  eventType?: string;
  aggregateId?: string;
  aggregateType?: string;
  deploymentId?: string;
  limit?: number;
  dryRun: boolean;
  prunedAt: string;
}

export interface DeploymentAttemptPruneInput {
  before: string;
  deploymentId?: string;
  resourceId?: string;
  serverId?: string;
  dryRun: boolean;
}

export interface DeploymentAttemptPruneStoreResult {
  matchedCount: number;
  prunedCount: number;
  guardedCount: number;
  affectedDeploymentIds: string[];
  guardedDeploymentIds: string[];
}

export interface DeploymentAttemptPruneResult extends DeploymentAttemptPruneStoreResult {
  schemaVersion: "deployments.prune/v1";
  before: string;
  deploymentId?: string;
  resourceId?: string;
  serverId?: string;
  dryRun: boolean;
  prunedAt: string;
}

export interface AuditEventRecordInput {
  id: string;
  aggregateId: string;
  eventType: string;
  payload: Record<string, AuditEventPayloadValue>;
  createdAt: string;
}

export interface IngestSourceEventResult {
  sourceEventId: string;
  status: SourceEventStatus;
  matchedResourceIds: string[];
  createdDeploymentIds: string[];
  ignoredReasons: SourceEventIgnoredReason[];
  dedupeOfSourceEventId?: string;
}

export interface ReplaySourceEventResult {
  schemaVersion: "source-events.replay/v1";
  sourceEventId: string;
  status: SourceEventStatus;
  matchedResourceIds: string[];
  createdDeploymentIds: string[];
  ignoredReasons: SourceEventIgnoredReason[];
  replayedAt: string;
}

export interface SourceEventPruneInput {
  before: string;
  projectId?: string;
  resourceId?: string;
  status?: SourceEventStatus;
  sourceKind?: SourceEventSourceKind;
  dryRun: boolean;
}

export interface SourceEventPruneStoreResult {
  matchedCount: number;
  prunedCount: number;
  countsByStatus: Record<string, number>;
  countsBySourceKind: Record<string, number>;
}

export interface SourceEventPruneResult extends SourceEventPruneStoreResult {
  schemaVersion: "source-events.prune/v1";
  before: string;
  projectId?: string;
  resourceId?: string;
  status?: SourceEventStatus;
  sourceKind?: SourceEventSourceKind;
  dryRun: boolean;
  prunedAt: string;
}

export interface VerifiedSourceEventInput {
  sourceKind: SourceEventSourceKind;
  eventKind: SourceEventKind;
  sourceIdentity: SourceEventIdentity;
  ref: string;
  revision: string;
  deliveryId?: string;
  idempotencyKey?: string;
  verification: {
    status: "verified";
    method: SourceEventVerificationMethod;
    keyVersion?: string;
  };
  receivedAt?: string;
}

export interface SourceEventVerificationInput {
  sourceKind: SourceEventSourceKind;
  eventKind: SourceEventKind;
  sourceIdentity: SourceEventIdentity;
  ref: string;
  revision: string;
  rawBody: string;
  signature: string;
  secretValue: string;
  method: SourceEventVerificationMethod;
  deliveryId?: string;
  idempotencyKey?: string;
  keyVersion?: string;
  receivedAt?: string;
}

export interface SourceEventVerificationPort {
  verify(
    context: ExecutionContext,
    input: SourceEventVerificationInput,
  ): Promise<Result<VerifiedSourceEventInput>>;
}

export type ActionDeployTokenWorkflow =
  | "preview-cleanup"
  | "server-config-deploy"
  | "source-link-deploy";

export interface ActionDeployTokenRequestedScope {
  environmentId?: string;
  projectId?: string;
  repositoryFullName?: string;
  resourceId?: string;
  serverId?: string;
}

export interface ActionDeployTokenResolvedScope {
  environmentIds: string[];
  projectIds: string[];
  repositoryFullNames: string[];
  resourceIds: string[];
  serverIds: string[];
}

export interface ActionDeployTokenAuthorizationInput {
  method: string;
  path: string;
  requestedScope?: ActionDeployTokenRequestedScope;
  token: string;
  workflow: ActionDeployTokenWorkflow;
}

export interface ActionDeployTokenAuthorizationResult {
  actor: ExecutionActor;
  organizationId?: string;
  scope?: ActionDeployTokenResolvedScope;
}

export interface ActionDeployTokenAuthorizationPort {
  authorize(
    context: ExecutionContext,
    input: ActionDeployTokenAuthorizationInput,
  ): Promise<Result<ActionDeployTokenAuthorizationResult>>;
}

export type OrganizationTeamRole = "admin" | "billing" | "developer" | "owner" | "viewer";

export type ProductOrganizationRole = "admin" | "member" | "owner";

export interface ProductSessionAuthorizationInput {
  authorizationHeader?: string;
  cookieHeader?: string;
  method: string;
  organizationId?: string;
  path: string;
  requiredRole: ProductOrganizationRole;
}

export interface ProductSessionAuthorizationResult {
  actor: ExecutionActor;
  email?: string;
  organizationId: string;
  organizationRole?: OrganizationTeamRole;
  role: ProductOrganizationRole;
  userId: string;
}

export interface ProductSessionAuthorizationPort {
  authorizeProductSession(
    context: ExecutionContext,
    input: ProductSessionAuthorizationInput,
  ): Promise<Result<ProductSessionAuthorizationResult>>;
}

export interface AccountProfileSummary {
  userId: string;
  email: string;
  displayName?: string;
  avatarUrl?: string;
  emailVerified?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface ChangeAccountProfileInput {
  displayName?: string;
  avatarUrl?: string | null;
  idempotencyKey?: string;
}

export interface AccountSessionSummary {
  sessionId: string;
  userId: string;
  clientKind?: "web" | "cli" | "unknown";
  displayName?: string;
  createdAt: string;
  expiresAt: string;
  ipAddress?: string;
  userAgent?: string;
  current?: boolean;
  lastActiveAt?: string;
}

export interface RevokeAccountSessionInput {
  sessionId: string;
  idempotencyKey?: string;
}

export interface DeleteAccountInput {
  confirmation: {
    userId: string;
  };
  idempotencyKey?: string;
}

export interface AccountSettingsPort {
  showAccountProfile(context: ExecutionContext): Promise<Result<AccountProfileSummary>>;
  changeAccountProfile(
    context: ExecutionContext,
    input: ChangeAccountProfileInput,
  ): Promise<Result<AccountProfileSummary>>;
  listAccountSessions(
    context: ExecutionContext,
  ): Promise<Result<{ items: AccountSessionSummary[]; nextCursor?: string }>>;
  revokeAccountSession(
    context: ExecutionContext,
    input: RevokeAccountSessionInput,
  ): Promise<Result<{ sessionId: string; revokedAt: string }>>;
  deleteAccount(
    context: ExecutionContext,
    input: DeleteAccountInput,
  ): Promise<Result<{ userId: string; deletedAt: string }>>;
}

export interface OrganizationCurrentUserSummary {
  userId: string;
  email: string;
  displayName?: string;
  avatarUrl?: string;
}

export interface OrganizationContextOrganizationSummary {
  organizationId: string;
  name: string;
  slug: string;
  role: OrganizationTeamRole;
}

export interface OrganizationContextPermissions {
  canInviteMembers: boolean;
  canListMembers: boolean;
  canManageDeployTokens: boolean;
  canRemoveMembers: boolean;
  canTransferOwnership?: boolean;
  canUpdateMemberRoles: boolean;
}

export interface CurrentOrganizationContext {
  user: OrganizationCurrentUserSummary;
  currentOrganization: OrganizationContextOrganizationSummary;
  organizations: OrganizationContextOrganizationSummary[];
  loginMethods: ProductLoginMethodStatus[];
  permissions?: OrganizationContextPermissions;
}

export interface OrganizationMemberSummary {
  memberId: string;
  userId: string;
  role: OrganizationTeamRole;
  joinedAt: string;
  avatarUrl?: string;
  displayName?: string;
  email?: string;
  status?: "active" | "deactivated";
}

export type OrganizationInvitationStatus = "accepted" | "expired" | "pending" | "revoked";

export interface OrganizationInvitationSummary {
  invitationId: string;
  organizationId: string;
  email: string;
  role: OrganizationTeamRole;
  status: OrganizationInvitationStatus;
  createdAt: string;
  expiresAt?: string;
  inviter?: {
    userId: string;
    displayName?: string;
    email?: string;
  };
}

export interface OrganizationMemberListInput {
  organizationId: string;
  cursor?: string;
  limit?: number;
}

export interface OrganizationInvitationListInput {
  organizationId: string;
  status?: OrganizationInvitationStatus;
  cursor?: string;
  limit?: number;
}

export interface InviteOrganizationMemberInput {
  organizationId: string;
  email: string;
  role: OrganizationTeamRole;
  idempotencyKey?: string;
}

export interface ChangeOrganizationMemberRoleInput {
  organizationId: string;
  memberId: string;
  role: OrganizationTeamRole;
  idempotencyKey?: string;
}

export interface RemoveOrganizationMemberInput {
  organizationId: string;
  memberId: string;
  idempotencyKey?: string;
}

export interface ReactivateOrganizationMemberInput {
  organizationId: string;
  memberId: string;
  idempotencyKey?: string;
}

export interface TransferOrganizationOwnerInput {
  organizationId: string;
  fromMemberId: string;
  toMemberId: string;
  idempotencyKey?: string;
}

export interface SwitchCurrentOrganizationInput {
  organizationId: string;
  idempotencyKey?: string;
}

export interface OrganizationProfileSummary {
  organizationId: string;
  name: string;
  slug: string;
  role: OrganizationTeamRole;
  permissions?: OrganizationContextPermissions;
  logoUrl?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ChangeOrganizationProfileInput {
  organizationId: string;
  name?: string;
  slug?: string;
  logoUrl?: string | null;
  idempotencyKey?: string;
}

export interface DeleteOrganizationInput {
  organizationId: string;
  confirmation: {
    organizationId: string;
  };
  idempotencyKey?: string;
}

export interface OrganizationTeamManagementPort {
  getCurrentContext(context: ExecutionContext): Promise<Result<CurrentOrganizationContext>>;
  showOrganizationProfile(
    context: ExecutionContext,
    input: { organizationId: string },
  ): Promise<Result<OrganizationProfileSummary>>;
  changeOrganizationProfile(
    context: ExecutionContext,
    input: ChangeOrganizationProfileInput,
  ): Promise<Result<OrganizationProfileSummary>>;
  deleteOrganization(
    context: ExecutionContext,
    input: DeleteOrganizationInput,
  ): Promise<Result<{ organizationId: string; deletedAt: string }>>;
  switchCurrentOrganization(
    context: ExecutionContext,
    input: SwitchCurrentOrganizationInput,
  ): Promise<Result<CurrentOrganizationContext>>;
  listMembers(
    context: ExecutionContext,
    input: OrganizationMemberListInput,
  ): Promise<Result<{ items: OrganizationMemberSummary[]; nextCursor?: string }>>;
  listInvitations(
    context: ExecutionContext,
    input: OrganizationInvitationListInput,
  ): Promise<Result<{ items: OrganizationInvitationSummary[]; nextCursor?: string }>>;
  inviteMember(
    context: ExecutionContext,
    input: InviteOrganizationMemberInput,
  ): Promise<Result<OrganizationInvitationSummary>>;
  updateMemberRole(
    context: ExecutionContext,
    input: ChangeOrganizationMemberRoleInput,
  ): Promise<Result<OrganizationMemberSummary>>;
  transferOwner(
    context: ExecutionContext,
    input: TransferOrganizationOwnerInput,
  ): Promise<
    Result<{
      fromMember: OrganizationMemberSummary;
      toMember: OrganizationMemberSummary;
      transferredAt: string;
    }>
  >;
  removeMember(
    context: ExecutionContext,
    input: RemoveOrganizationMemberInput,
  ): Promise<Result<{ memberId: string; organizationId: string; removedAt: string }>>;
  reactivateMember(
    context: ExecutionContext,
    input: ReactivateOrganizationMemberInput,
  ): Promise<Result<OrganizationMemberSummary>>;
}

export type OperationKind = "command" | "query";

export type OperationCheckKind =
  | "authorization"
  | "entitlement"
  | "policy"
  | "quota"
  | "validation"
  | (string & {});

export interface OperationCheckResourceRefs {
  projectId?: string;
  environmentId?: string;
  resourceId?: string;
  serverId?: string;
  destinationId?: string;
  deploymentId?: string;
  dependencyResourceId?: string;
  storageVolumeId?: string;
  [key: string]: string | undefined;
}

export interface OperationCheckRequest {
  operationKey: string;
  operationName: string;
  kind: OperationKind;
  action?: string;
  actor?: ExecutionActor;
  organizationId?: string;
  organizationRole?: OrganizationTeamRole;
  productRole?: ProductOrganizationRole;
  userId?: string;
  email?: string;
  resourceRefs?: OperationCheckResourceRefs;
  contextAttributes?: DomainErrorDetails;
}

export interface OperationCheckResult {
  allowed: boolean;
  checkKey: string;
  kind: OperationCheckKind;
  reason: string;
  details?: DomainErrorDetails;
  traceAttributes?: TraceAttributes;
}

export interface OperationCheckPort {
  readonly checkKey: string;
  readonly kind: OperationCheckKind;

  checkOperation(
    context: ExecutionContext,
    request: OperationCheckRequest,
  ): Promise<OperationCheckResult>;
}

export interface OperationGuardDecision {
  allowed: boolean;
  checks: OperationCheckResult[];
  deniedBy?: {
    checkKey: string;
    kind: OperationCheckKind;
  };
  details?: DomainErrorDetails;
  reason: string;
  traceAttributes?: TraceAttributes;
}

export interface OperationGuardPort {
  checkOperation(
    context: ExecutionContext,
    request: OperationCheckRequest,
  ): Promise<OperationGuardDecision>;
}

export type OperationScopeConstraintKind =
  | "organization"
  | "organizationId"
  | "project"
  | "projectId"
  | "resource"
  | "resourceId"
  | "environment"
  | "environmentId"
  | "server"
  | "serverId"
  | "destination"
  | "destinationId"
  | (string & {});

export type OperationScopeConstraintOperator = "in";

export interface OperationScopeConstraint {
  kind: OperationScopeConstraintKind;
  operator: OperationScopeConstraintOperator;
  values: readonly string[];
}

export type OperationScopeVisibility = "constrained" | "denied" | "unrestricted";

export type OperationScopeDecision =
  | {
      effect: "allow";
      reason: string;
      visibility: "unrestricted";
      constraints?: undefined;
      details?: DomainErrorDetails;
      traceAttributes?: TraceAttributes;
    }
  | {
      effect: "allow";
      constraints: readonly OperationScopeConstraint[];
      reason: string;
      visibility: "constrained";
      details?: DomainErrorDetails;
      traceAttributes?: TraceAttributes;
    }
  | {
      effect: "deny";
      reason: string;
      visibility: "denied";
      deniedBy?: {
        checkKey: string;
        kind: OperationCheckKind;
      };
      details?: DomainErrorDetails;
      traceAttributes?: TraceAttributes;
    };

export interface OperationScopePort {
  scopeOperation(
    context: ExecutionContext,
    request: OperationCheckRequest,
  ): Promise<OperationScopeDecision>;
}

export type OperationCapabilityMode = OperationScopeVisibility;

export interface OperationCapabilityQuery {
  operationKey: string;
  actor?: ExecutionActor;
  organizationId?: string | undefined;
  resourceRefs?: Record<string, string | undefined> | undefined;
  contextAttributes?: DomainErrorDetails | undefined;
}

export interface OperationCapabilityResult {
  operationKey: string;
  allowed: boolean;
  mode: OperationCapabilityMode;
  hint: string;
  reason: string;
  details?: DomainErrorDetails | undefined;
}

export interface OperationCapabilityPort {
  checkCapabilities(
    context: ExecutionContext,
    input: {
      queries: readonly OperationCapabilityQuery[];
    },
  ): Promise<readonly OperationCapabilityResult[]>;
}

export type EntitlementStatus = "entitled" | "not_entitled" | "unknown";
export type EntitlementDecisionMode = "restricted" | "unrestricted" | "unknown";
export type EntitlementDetails = Record<string, unknown>;

export interface EntitlementActorRef {
  kind?: ExecutionActor["kind"] | (string & {}) | undefined;
  id?: string | undefined;
  userId?: string | undefined;
  email?: string | undefined;
}

export interface EntitlementResourceRefs {
  organizationId?: string | undefined;
  projectId?: string | undefined;
  environmentId?: string | undefined;
  resourceId?: string | undefined;
  serverId?: string | undefined;
  destinationId?: string | undefined;
  deploymentId?: string | undefined;
  [key: string]: string | undefined;
}

export interface EntitlementQuery {
  capabilityKey: string;
  actor?: EntitlementActorRef | undefined;
  tenantId?: string | undefined;
  accountId?: string | undefined;
  organizationId?: string | undefined;
  resourceRefs?: EntitlementResourceRefs | undefined;
  attributes?: EntitlementDetails | undefined;
}

export interface EntitlementDecision {
  capabilityKey: string;
  entitled: boolean;
  status: EntitlementStatus;
  mode: EntitlementDecisionMode;
  hint: string;
  reason: string;
  source: string;
  details?: EntitlementDetails;
}

export interface EntitlementPort {
  checkEntitlements(
    context: ExecutionContext,
    input: {
      queries: readonly EntitlementQuery[];
    },
  ): Promise<readonly EntitlementDecision[]>;
}

export interface TenantContextResolver {
  resolveTenantContext(context: ExecutionContext): Promise<ExecutionTenantContext>;
}

export class DefaultTenantContextResolver implements TenantContextResolver {
  async resolveTenantContext(context: ExecutionContext): Promise<ExecutionTenantContext> {
    return context.tenant ?? defaultExecutionTenantContext();
  }
}

export class DefaultEntitlementPort implements EntitlementPort {
  async checkEntitlements(
    context: ExecutionContext,
    input: { queries: readonly EntitlementQuery[] },
  ): Promise<readonly EntitlementDecision[]> {
    return input.queries.map((query) => ({
      capabilityKey: query.capabilityKey,
      entitled: true,
      status: "entitled",
      mode: "unrestricted",
      hint: "enabled",
      reason: "entitlement-default-allow",
      source: "default",
      details: {
        capabilityKey: query.capabilityKey,
        ...((query.organizationId ?? context.tenant?.organizationId)
          ? { organizationId: query.organizationId ?? context.tenant?.organizationId }
          : {}),
        ...((query.tenantId ?? context.tenant?.tenantId)
          ? { tenantId: query.tenantId ?? context.tenant?.tenantId }
          : {}),
      },
    }));
  }
}

export type UsageIntentStatus = "accepted" | "duplicate" | "rejected" | "unknown_capability";
export type UsageIntentDetails = Record<string, unknown>;

export interface UsageIntentActorRef {
  kind?: ExecutionActor["kind"] | (string & {}) | undefined;
  id?: string | undefined;
  userId?: string | undefined;
  email?: string | undefined;
}

export interface UsageIntentResourceRefs {
  organizationId?: string | undefined;
  projectId?: string | undefined;
  environmentId?: string | undefined;
  resourceId?: string | undefined;
  serverId?: string | undefined;
  destinationId?: string | undefined;
  deploymentId?: string | undefined;
  [key: string]: string | undefined;
}

export interface UsageIntentQuantity {
  value: number;
  unit: string;
}

export interface UsageIntentInput {
  idempotencyKey: string;
  capabilityKey: string;
  actor?: UsageIntentActorRef | undefined;
  tenantId?: string | undefined;
  accountId?: string | undefined;
  organizationId?: string | undefined;
  resourceRefs?: UsageIntentResourceRefs | undefined;
  quantity?: UsageIntentQuantity | undefined;
  source: string;
  occurredAt?: string | undefined;
  attributes?: UsageIntentDetails | undefined;
}

export interface UsageIntentRecord {
  schemaVersion: "usage-intent.record/v1";
  id: string;
  idempotencyKey: string;
  capabilityKey: string;
  status: UsageIntentStatus;
  reason: string;
  source: string;
  tenantId?: string | undefined;
  accountId?: string | undefined;
  organizationId?: string | undefined;
  actor?: UsageIntentActorRef | undefined;
  resourceRefs?: UsageIntentResourceRefs | undefined;
  quantity?: UsageIntentQuantity | undefined;
  occurredAt: string;
  recordedAt: string;
  attributes?: UsageIntentDetails | undefined;
  details?: UsageIntentDetails | undefined;
}

export interface UsageIntentRecordResult {
  idempotencyKey: string;
  capabilityKey: string;
  accepted: boolean;
  duplicate: boolean;
  status: UsageIntentStatus;
  reason: string;
  source: string;
  record?: UsageIntentRecord | undefined;
  details?: UsageIntentDetails | undefined;
}

export interface ListUsageIntentRecordsInput {
  tenantId?: string | undefined;
  accountId?: string | undefined;
  organizationId?: string | undefined;
  capabilityKey?: string | undefined;
  source?: string | undefined;
  limit?: number | undefined;
}

export interface UsageIntentPort {
  recordUsageIntent(
    context: ExecutionContext,
    input: UsageIntentInput,
  ): Promise<UsageIntentRecordResult>;

  listUsageIntentRecords(
    context: ExecutionContext,
    input?: ListUsageIntentRecordsInput,
  ): Promise<readonly UsageIntentRecord[]>;
}

export class DefaultUsageIntentPort implements UsageIntentPort {
  async recordUsageIntent(
    context: ExecutionContext,
    input: UsageIntentInput,
  ): Promise<UsageIntentRecordResult> {
    const tenantId = input.tenantId ?? context.tenant?.tenantId;
    const accountId = input.accountId ?? context.tenant?.accountId;
    const organizationId = input.organizationId ?? context.tenant?.organizationId;

    return {
      idempotencyKey: input.idempotencyKey,
      capabilityKey: input.capabilityKey,
      accepted: true,
      duplicate: false,
      status: "accepted",
      reason: "usage-intent-default-noop",
      source: "default",
      details: {
        capabilityKey: input.capabilityKey,
        source: input.source,
        ...(tenantId ? { tenantId } : {}),
        ...(accountId ? { accountId } : {}),
        ...(organizationId ? { organizationId } : {}),
      },
    };
  }

  async listUsageIntentRecords(): Promise<readonly UsageIntentRecord[]> {
    return [];
  }
}

export type DeploymentOverlayDecisionStatus = "enabled" | "skipped" | "rejected" | "unknown";
export type DeploymentOverlayDetails = Record<string, unknown>;

export interface DeploymentOverlayActorRef {
  kind?: ExecutionActor["kind"] | (string & {}) | undefined;
  id?: string | undefined;
  userId?: string | undefined;
  email?: string | undefined;
}

export interface DeploymentOverlayResourceRefs {
  organizationId?: string | undefined;
  projectId?: string | undefined;
  environmentId?: string | undefined;
  resourceId?: string | undefined;
  serverId?: string | undefined;
  destinationId?: string | undefined;
  deploymentId?: string | undefined;
  [key: string]: string | undefined;
}

export interface DeploymentOverlayEvaluateInput {
  operationKey: string;
  source: string;
  actor?: DeploymentOverlayActorRef | undefined;
  tenantId?: string | undefined;
  accountId?: string | undefined;
  organizationId?: string | undefined;
  resourceRefs?: DeploymentOverlayResourceRefs | undefined;
  capabilityKey?: string | undefined;
  attributes?: DeploymentOverlayDetails | undefined;
}

export interface DeploymentOverlayDecisionRecord {
  schemaVersion: "deployment-overlay.decision/v1";
  id?: string | undefined;
  operationKey: string;
  decision: DeploymentOverlayDecisionStatus;
  reason: string;
  source: string;
  tenantId?: string | undefined;
  accountId?: string | undefined;
  organizationId?: string | undefined;
  actor?: DeploymentOverlayActorRef | undefined;
  resourceRefs?: DeploymentOverlayResourceRefs | undefined;
  capabilityKey?: string | undefined;
  decidedAt: string;
  attributes?: DeploymentOverlayDetails | undefined;
  details?: DeploymentOverlayDetails | undefined;
}

export interface DeploymentOverlayDecisionResult {
  operationKey: string;
  decision: DeploymentOverlayDecisionStatus;
  allowed: boolean;
  reason: string;
  source: string;
  record?: DeploymentOverlayDecisionRecord | undefined;
  details?: DeploymentOverlayDetails | undefined;
}

export interface ListDeploymentOverlayDecisionsInput {
  tenantId?: string | undefined;
  accountId?: string | undefined;
  organizationId?: string | undefined;
  operationKey?: string | undefined;
  capabilityKey?: string | undefined;
  source?: string | undefined;
  limit?: number | undefined;
}

export interface DeploymentOverlayPort {
  evaluateDeploymentOverlay(
    context: ExecutionContext,
    input: DeploymentOverlayEvaluateInput,
  ): Promise<DeploymentOverlayDecisionResult>;

  listDeploymentOverlayDecisions(
    context: ExecutionContext,
    input?: ListDeploymentOverlayDecisionsInput,
  ): Promise<readonly DeploymentOverlayDecisionRecord[]>;
}

export class DefaultDeploymentOverlayPort implements DeploymentOverlayPort {
  async evaluateDeploymentOverlay(
    context: ExecutionContext,
    input: DeploymentOverlayEvaluateInput,
  ): Promise<DeploymentOverlayDecisionResult> {
    const tenantId = input.tenantId ?? context.tenant?.tenantId;
    const accountId = input.accountId ?? context.tenant?.accountId;
    const organizationId = input.organizationId ?? context.tenant?.organizationId;

    return {
      operationKey: input.operationKey,
      decision: "skipped",
      allowed: true,
      reason: "deployment-overlay-default-noop",
      source: "default",
      details: {
        operationKey: input.operationKey,
        source: input.source,
        ...(input.capabilityKey ? { capabilityKey: input.capabilityKey } : {}),
        ...(tenantId ? { tenantId } : {}),
        ...(accountId ? { accountId } : {}),
        ...(organizationId ? { organizationId } : {}),
      },
    };
  }

  async listDeploymentOverlayDecisions(): Promise<readonly DeploymentOverlayDecisionRecord[]> {
    return [];
  }
}

export type RouteSurfaceDecisionStatus = "enabled" | "skipped" | "rejected" | "unknown";
export type RouteSurfaceKind =
  | "routing"
  | "static-artifact"
  | "domain"
  | "access-route"
  | (string & {});
export type RouteSurfaceDetails = Record<string, unknown>;

export interface RouteSurfaceActorRef {
  kind?: ExecutionActor["kind"] | (string & {}) | undefined;
  id?: string | undefined;
  userId?: string | undefined;
  email?: string | undefined;
}

export interface RouteSurfaceResourceRefs {
  organizationId?: string | undefined;
  projectId?: string | undefined;
  environmentId?: string | undefined;
  resourceId?: string | undefined;
  serverId?: string | undefined;
  destinationId?: string | undefined;
  deploymentId?: string | undefined;
  domainBindingId?: string | undefined;
  domainId?: string | undefined;
  routeId?: string | undefined;
  staticArtifactId?: string | undefined;
  [key: string]: string | undefined;
}

export interface RouteSurfaceEvaluateInput {
  operationKey: string;
  source: string;
  surfaceKind: RouteSurfaceKind;
  actor?: RouteSurfaceActorRef | undefined;
  tenantId?: string | undefined;
  accountId?: string | undefined;
  organizationId?: string | undefined;
  resourceRefs?: RouteSurfaceResourceRefs | undefined;
  capabilityKey?: string | undefined;
  attributes?: RouteSurfaceDetails | undefined;
}

export interface RouteSurfaceDecisionRecord {
  schemaVersion: "route-surface.decision/v1";
  id?: string | undefined;
  operationKey: string;
  decision: RouteSurfaceDecisionStatus;
  reason: string;
  source: string;
  surfaceKind: RouteSurfaceKind;
  tenantId?: string | undefined;
  accountId?: string | undefined;
  organizationId?: string | undefined;
  actor?: RouteSurfaceActorRef | undefined;
  resourceRefs?: RouteSurfaceResourceRefs | undefined;
  capabilityKey?: string | undefined;
  decidedAt: string;
  attributes?: RouteSurfaceDetails | undefined;
  details?: RouteSurfaceDetails | undefined;
}

export interface RouteSurfaceDecisionResult {
  operationKey: string;
  decision: RouteSurfaceDecisionStatus;
  allowed: boolean;
  reason: string;
  source: string;
  surfaceKind: RouteSurfaceKind;
  record?: RouteSurfaceDecisionRecord | undefined;
  details?: RouteSurfaceDetails | undefined;
}

export interface ListRouteSurfaceDecisionsInput {
  tenantId?: string | undefined;
  accountId?: string | undefined;
  organizationId?: string | undefined;
  operationKey?: string | undefined;
  capabilityKey?: string | undefined;
  source?: string | undefined;
  surfaceKind?: RouteSurfaceKind | undefined;
  limit?: number | undefined;
}

export interface RouteSurfacePort {
  evaluateRouteSurface(
    context: ExecutionContext,
    input: RouteSurfaceEvaluateInput,
  ): Promise<RouteSurfaceDecisionResult>;

  listRouteSurfaceDecisions(
    context: ExecutionContext,
    input?: ListRouteSurfaceDecisionsInput,
  ): Promise<readonly RouteSurfaceDecisionRecord[]>;
}

export interface StoreStaticArtifactManifestInput {
  projectId: string;
  resourceId: string;
  manifest: StaticArtifactManifest;
  files?: readonly StaticArtifactFilePayload[] | undefined;
  metadata?: Record<string, string> | undefined;
}

export interface StaticArtifactFilePayload {
  path: string;
  sizeBytes: number;
  mimeType: string;
  contentDigest: string;
  readBytes(): Promise<Uint8Array>;
}

export interface ReadStaticArtifactPayloadInput {
  artifactId: string;
  sourcePath: string;
  metadata?: Record<string, string> | undefined;
}

export interface StaticArtifactPayloadReadResult {
  manifest: StaticArtifactManifest;
  files: readonly StaticArtifactFilePayload[];
}

export interface StaticArtifactPayloadReaderPort {
  read(
    context: ExecutionContext,
    input: ReadStaticArtifactPayloadInput,
  ): Promise<Result<StaticArtifactPayloadReadResult>>;
}

export interface ActivateStaticArtifactRouteInput {
  publication: StaticArtifactPublication;
  routeKind: "immutable" | "alias";
  metadata?: Record<string, string> | undefined;
}

export interface PublishStaticArtifactInput {
  projectId: string;
  resourceId: string;
  manifest: StaticArtifactManifest;
  files?: readonly StaticArtifactFilePayload[] | undefined;
  promoteAlias?: boolean | undefined;
  metadata?: Record<string, string> | undefined;
}

export interface StaticArtifactPublicationSummary {
  publicationId: string;
  projectId: string;
  resourceId: string;
  artifactId: string;
  manifestDigest: string;
  storageRef: string;
  storeProviderKey: string;
  routeUrl?: string | undefined;
  routeProviderKey?: string | undefined;
  fileCount: number;
  totalBytes: number;
  publishedAt?: string | undefined;
  metadata?: Record<string, string> | undefined;
}

export interface RecordStaticArtifactPublicationInput {
  publication: StaticArtifactPublication;
  publishedAt?: string | undefined;
  metadata?: Record<string, string> | undefined;
}

export interface ListStaticArtifactPublicationsInput {
  projectId?: string | undefined;
  resourceId?: string | undefined;
  limit?: number | undefined;
}

export interface StaticArtifactStorePort {
  storeManifest(
    context: ExecutionContext,
    input: StoreStaticArtifactManifestInput,
  ): Promise<Result<StaticArtifactStoredManifest>>;
}

export interface StaticArtifactRouteProviderPort {
  activateRoute(
    context: ExecutionContext,
    input: ActivateStaticArtifactRouteInput,
  ): Promise<Result<StaticArtifactRouteActivation>>;
}

export interface StaticArtifactPublisherPort {
  publish(
    context: ExecutionContext,
    input: PublishStaticArtifactInput,
  ): Promise<Result<StaticArtifactPublication>>;
}

export interface StaticArtifactPublicationJournalPort {
  recordPublication(
    context: ExecutionContext,
    input: RecordStaticArtifactPublicationInput,
  ): Promise<Result<StaticArtifactPublicationSummary>>;
}

export interface StaticArtifactPublicationReadModelPort {
  listPublications(
    context: ExecutionContext,
    input?: ListStaticArtifactPublicationsInput,
  ): Promise<Result<{ items: StaticArtifactPublicationSummary[] }>>;
}

export class DefaultRouteSurfacePort implements RouteSurfacePort {
  async evaluateRouteSurface(
    context: ExecutionContext,
    input: RouteSurfaceEvaluateInput,
  ): Promise<RouteSurfaceDecisionResult> {
    const tenantId = input.tenantId ?? context.tenant?.tenantId;
    const accountId = input.accountId ?? context.tenant?.accountId;
    const organizationId = input.organizationId ?? context.tenant?.organizationId;

    return {
      operationKey: input.operationKey,
      decision: "skipped",
      allowed: true,
      reason: "route-surface-default-noop",
      source: "default",
      surfaceKind: input.surfaceKind,
      details: {
        operationKey: input.operationKey,
        source: input.source,
        surfaceKind: input.surfaceKind,
        ...(input.capabilityKey ? { capabilityKey: input.capabilityKey } : {}),
        ...(tenantId ? { tenantId } : {}),
        ...(accountId ? { accountId } : {}),
        ...(organizationId ? { organizationId } : {}),
      },
    };
  }

  async listRouteSurfaceDecisions(): Promise<readonly RouteSurfaceDecisionRecord[]> {
    return [];
  }
}

export class AllowAllOperationScopePort implements OperationScopePort {
  async scopeOperation(
    _context: ExecutionContext,
    request: OperationCheckRequest,
  ): Promise<OperationScopeDecision> {
    return {
      effect: "allow",
      reason: "community-compatibility-unrestricted-scope",
      visibility: "unrestricted",
      details: {
        operationKey: request.operationKey,
      },
    };
  }
}

export class AllowAllOperationGuardPort implements OperationGuardPort {
  async checkOperation(
    _context: ExecutionContext,
    request: OperationCheckRequest,
  ): Promise<OperationGuardDecision> {
    return {
      allowed: true,
      checks: [],
      reason: "community-compatibility-default-allow",
      details: {
        operationKey: request.operationKey,
      },
    };
  }
}

function operationCheckSpanName(checkKey: string): string {
  return `appaloft.operation_check.${checkKey
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase()}`;
}

export class CompositeOperationGuardPort implements OperationGuardPort {
  constructor(private readonly checks: OperationCheckPort[] = []) {}

  async checkOperation(
    context: ExecutionContext,
    request: OperationCheckRequest,
  ): Promise<OperationGuardDecision> {
    const results: OperationCheckResult[] = [];

    for (const check of this.checks) {
      const result = await context.tracer.startActiveSpan(
        operationCheckSpanName(check.checkKey),
        {
          attributes: {
            "appaloft.operation.check.key": check.checkKey,
            "appaloft.operation.check.kind": check.kind,
            "appaloft.operation.key": request.operationKey,
            "appaloft.operation.name": request.operationName,
          },
        },
        async (span) => {
          const checkResult = await check.checkOperation(context, request);
          span.setAttribute("appaloft.operation.check.allowed", checkResult.allowed);
          span.setAttribute("appaloft.operation.check.reason", checkResult.reason);
          if (checkResult.traceAttributes) {
            span.setAttributes(checkResult.traceAttributes);
          }
          span.setStatus(checkResult.allowed ? "ok" : "error", checkResult.reason);
          return checkResult;
        },
      );

      results.push(result);

      if (!result.allowed) {
        return {
          allowed: false,
          checks: results,
          deniedBy: {
            checkKey: result.checkKey,
            kind: result.kind,
          },
          reason: result.reason,
          ...(result.details ? { details: result.details } : {}),
          ...(result.traceAttributes ? { traceAttributes: result.traceAttributes } : {}),
        };
      }
    }

    return {
      allowed: true,
      checks: results,
      reason: results.length > 0 ? "all-operation-checks-passed" : "no-operation-checks-registered",
    };
  }
}

export type OperationAuthorizationKind = OperationKind;
export type OperationAuthorizationResourceRefs = OperationCheckResourceRefs;
export type OperationAuthorizationRequest = OperationCheckRequest;
export type OperationAuthorizationDecision = OperationGuardDecision;
export interface OperationAuthorizationPort extends OperationGuardPort {}
export class AllowAllOperationAuthorizationPort
  extends AllowAllOperationGuardPort
  implements OperationAuthorizationPort {}
export type OperationVisibilityConstraint = OperationScopeConstraint;
export type OperationVisibilityDecision = OperationScopeDecision;
export interface OperationVisibilityPort extends OperationScopePort {}
export class AllowAllOperationVisibilityPort
  extends AllowAllOperationScopePort
  implements OperationVisibilityPort {}

export interface DeployTokenMaterial {
  token: string;
  verifierDigest: DeployTokenVerifierDigest;
  secretSuffix: DeployTokenSecretSuffix;
}

export interface DeployTokenMaterialIssuer {
  issue(context: ExecutionContext): Promise<Result<DeployTokenMaterial>>;
}

export interface GitHubSourceEventWebhookVerificationInput {
  eventName: string;
  rawBody: string;
  signature: string;
  secretValue: string;
  deliveryId?: string;
  receivedAt?: string;
}

export type GitHubSourceEventWebhookVerificationResult =
  | {
      outcome: "source-event";
      sourceEvent: VerifiedSourceEventInput;
    }
  | {
      outcome: "noop";
    };

export interface GitHubSourceEventWebhookVerifier {
  verify(
    context: ExecutionContext,
    input: GitHubSourceEventWebhookVerificationInput,
  ): Promise<Result<GitHubSourceEventWebhookVerificationResult>>;
}

export type GitHubPreviewPullRequestAction = "opened" | "reopened" | "synchronize" | "closed";

export interface GitHubPreviewPullRequestWebhookEvent {
  provider: "github";
  eventKind: "pull-request";
  eventAction: GitHubPreviewPullRequestAction;
  repositoryFullName: string;
  providerRepositoryId?: string;
  installationId?: string;
  headRepositoryFullName: string;
  pullRequestNumber: number;
  headSha: string;
  baseRef: string;
  verified: true;
  deliveryId?: string;
  receivedAt?: string;
}

export interface GitHubPreviewPullRequestWebhookVerificationInput {
  eventName: string;
  rawBody: string;
  signature: string;
  secretValue: string;
  deliveryId?: string;
  receivedAt?: string;
}

export type GitHubPreviewPullRequestWebhookVerificationResult =
  | {
      outcome: "preview-pull-request-event";
      previewEvent: GitHubPreviewPullRequestWebhookEvent;
    }
  | {
      outcome: "noop";
    };

export interface GitHubPreviewPullRequestWebhookVerifier {
  verify(
    context: ExecutionContext,
    input: GitHubPreviewPullRequestWebhookVerificationInput,
  ): Promise<Result<GitHubPreviewPullRequestWebhookVerificationResult>>;
}

export type PreviewFeedbackChannel =
  | "github-pr-comment"
  | "github-check"
  | "github-deployment-status";
export type PreviewDeploymentStatusState = "success" | "inactive";
export type PreviewFeedbackStatus = "published" | "retryable-failed" | "terminal-failed";

export interface PreviewFeedbackRecord {
  feedbackKey: string;
  sourceEventId: string;
  previewEnvironmentId: string;
  channel: PreviewFeedbackChannel;
  status: PreviewFeedbackStatus;
  providerFeedbackId?: string;
  errorCode?: string;
  retryable?: boolean;
  updatedAt: string;
}

export interface PreviewFeedbackWriterInput {
  feedbackKey: string;
  sourceEventId: string;
  previewEnvironmentId: string;
  channel: PreviewFeedbackChannel;
  repositoryFullName: string;
  pullRequestNumber: number;
  body: string;
  providerDeploymentId?: string;
  providerFeedbackId?: string;
  deploymentStatusState?: PreviewDeploymentStatusState;
}

export interface PreviewFeedbackWriterResult {
  providerFeedbackId: string;
}

export interface PreviewFeedbackWriter {
  publish(
    context: ExecutionContext,
    input: PreviewFeedbackWriterInput,
  ): Promise<Result<PreviewFeedbackWriterResult>>;
}

export interface PreviewFeedbackRecorder {
  findOne(
    context: RepositoryContext,
    input: { feedbackKey: string },
  ): Promise<PreviewFeedbackRecord | null>;
  findLatestForPreviewEnvironment(
    context: RepositoryContext,
    input: { previewEnvironmentId: string; channel: PreviewFeedbackChannel },
  ): Promise<PreviewFeedbackRecord | null>;
  record(context: RepositoryContext, record: PreviewFeedbackRecord): Promise<void>;
}

export interface PreviewEnvironmentCleanerInput {
  previewEnvironmentId: string;
  resourceId: string;
  sourceBindingFingerprint: string;
  provider: PreviewEnvironmentProvider;
  repositoryFullName: string;
  pullRequestNumber: number;
}

export interface PreviewEnvironmentCleanerResult {
  cleanedRuntime: boolean;
  removedRoute: boolean;
  removedSourceLink: boolean;
  removedProviderMetadata: boolean;
  updatedFeedback: boolean;
}

export interface PreviewEnvironmentCleaner {
  cleanup(
    context: ExecutionContext,
    input: PreviewEnvironmentCleanerInput,
  ): Promise<Result<PreviewEnvironmentCleanerResult>>;
}

export type PreviewCleanupAttemptStatus = "succeeded" | "retry-scheduled" | "failed";

export interface PreviewCleanupAttemptRecord {
  attemptId: string;
  previewEnvironmentId: string;
  resourceId: string;
  sourceBindingFingerprint: string;
  owner: string;
  status: PreviewCleanupAttemptStatus;
  phase: string;
  attemptedAt: string;
  updatedAt: string;
  errorCode?: string;
  retryable?: boolean;
  nextRetryAt?: string;
}

export interface PreviewCleanupAttemptRecorder {
  record(context: RepositoryContext, record: PreviewCleanupAttemptRecord): Promise<void>;
}

export interface PreviewCleanupRetryCandidate {
  attemptId: string;
  previewEnvironmentId: string;
  resourceId: string;
  sourceBindingFingerprint: string;
  owner: string;
  phase: string;
  nextRetryAt: string;
}

export interface PreviewCleanupRetryCandidateReader {
  listDueRetries(
    context: RepositoryContext,
    input: {
      now: string;
      limit: number;
    },
  ): Promise<PreviewCleanupRetryCandidate[]>;
}

export interface PreviewExpiredEnvironmentCandidate {
  previewEnvironmentId: string;
  resourceId: string;
  expiresAt: string;
}

export interface PreviewExpiredEnvironmentCandidateReader {
  listExpiredActive(
    context: RepositoryContext,
    input: {
      now: string;
      limit: number;
    },
  ): Promise<PreviewExpiredEnvironmentCandidate[]>;
}

export interface SourceEventPolicyCandidate {
  projectId: string;
  environmentId: string;
  resourceId: string;
  serverId?: string;
  destinationId?: string;
  sourceBindingFingerprint?: string;
  status: "enabled" | "disabled" | "blocked";
  refs: string[];
  eventKinds: SourceEventKind[];
  sourceBinding: SourceEventIdentity;
  blockedReason?: "source-binding-changed";
}

export interface SourceEventPolicyReader {
  listCandidates(
    context: RepositoryContext,
    input: {
      sourceKind: SourceEventSourceKind;
      sourceIdentity: SourceEventIdentity;
    },
  ): Promise<SourceEventPolicyCandidate[]>;
}

export interface SourceEventDeploymentDispatchInput {
  sourceEventId: string;
  projectId: string;
  environmentId: string;
  resourceId: string;
  serverId: string;
  destinationId?: string;
}

export interface SourceEventDeploymentDispatchResult {
  deploymentId: string;
}

export interface SourceEventDeploymentDispatcher {
  dispatch(
    context: ExecutionContext,
    input: SourceEventDeploymentDispatchInput,
  ): Promise<Result<SourceEventDeploymentDispatchResult>>;
}

export interface SourceEventRecorder {
  findByDedupeKey(context: RepositoryContext, dedupeKey: string): Promise<SourceEventRecord | null>;
  record(context: RepositoryContext, record: SourceEventRecord): Promise<SourceEventRecord>;
  updateOutcome(
    context: RepositoryContext,
    input: SourceEventOutcomeUpdate,
  ): Promise<SourceEventRecord>;
}

export interface SourceEventReadModel {
  list(context: RepositoryContext, input: SourceEventListInput): Promise<SourceEventListPage>;
  findOne(
    context: RepositoryContext,
    input: SourceEventShowInput,
  ): Promise<SourceEventDetail | null>;
}

export interface SourceEventRetentionStore {
  prune(
    context: RepositoryContext,
    input: SourceEventPruneInput,
  ): Promise<Result<SourceEventPruneStoreResult>>;
}

export interface AuditEventReadModel {
  list(context: RepositoryContext, input: AuditEventListInput): Promise<AuditEventListPage>;
  findOne(context: RepositoryContext, input: AuditEventShowInput): Promise<AuditEventDetail | null>;
  export(context: RepositoryContext, input: AuditEventExportInput): Promise<AuditEventExportPage>;
  exportGlobal(
    context: RepositoryContext,
    input: AuditEventGlobalExportInput,
  ): Promise<AuditEventExportPage>;
}

export interface AuditEventRetentionStore {
  prune(
    context: RepositoryContext,
    input: AuditEventPruneInput,
  ): Promise<Result<AuditEventPruneStoreResult>>;
}

export interface AuditEventLegalHoldStore {
  configure(
    context: RepositoryContext,
    input: AuditEventLegalHoldConfigureInput,
  ): Promise<Result<AuditEventLegalHoldRecord>>;
  release(
    context: RepositoryContext,
    input: AuditEventLegalHoldReleaseInput,
  ): Promise<Result<AuditEventLegalHoldRecord | null>>;
  list(
    context: RepositoryContext,
    input: AuditEventLegalHoldListInput,
  ): Promise<Result<AuditEventLegalHoldListPage>>;
  findOne(
    context: RepositoryContext,
    holdId: string,
  ): Promise<Result<AuditEventLegalHoldRecord | null>>;
}

export interface AuditEventArchiveStore {
  create(
    context: RepositoryContext,
    input: AuditEventArchiveCreateInput,
  ): Promise<Result<AuditEventArchiveRecord>>;
  list(
    context: RepositoryContext,
    input: AuditEventArchiveListInput,
  ): Promise<Result<AuditEventArchiveListPage>>;
  findOne(
    context: RepositoryContext,
    archiveId: string,
  ): Promise<Result<AuditEventArchiveDetail | null>>;
  prune(
    context: RepositoryContext,
    input: AuditEventArchivePruneInput,
  ): Promise<Result<AuditEventArchivePruneStoreResult>>;
}

export interface AuditEventRecorder {
  record(context: RepositoryContext, input: AuditEventRecordInput): Promise<Result<void>>;
}

export interface ProviderJobLogRetentionStore {
  prune(
    context: RepositoryContext,
    input: ProviderJobLogPruneInput,
  ): Promise<Result<ProviderJobLogPruneStoreResult>>;
}

export interface DomainEventStreamRetentionStore {
  prune(
    context: RepositoryContext,
    input: DomainEventStreamPruneInput,
  ): Promise<Result<DomainEventStreamPruneStoreResult>>;
}

export interface DeploymentAttemptRetentionStore {
  prune(
    context: RepositoryContext,
    input: DeploymentAttemptPruneInput,
  ): Promise<Result<DeploymentAttemptPruneStoreResult>>;
}

export interface RuntimeMonitoringSampleRetentionStore {
  prune(
    context: RepositoryContext,
    input: RuntimeMonitoringSamplePruneInput,
  ): Promise<Result<RuntimeMonitoringSamplePruneStoreResult>>;
}

export interface ResourceRuntimeLogArchiveStore {
  create(
    context: RepositoryContext,
    input: ResourceRuntimeLogArchiveCreateInput,
  ): Promise<Result<ResourceRuntimeLogArchiveDetail>>;
  list(
    context: RepositoryContext,
    input: ResourceRuntimeLogArchiveListInput,
  ): Promise<Result<ResourceRuntimeLogArchiveListPage>>;
  findOne(
    context: RepositoryContext,
    input: ResourceRuntimeLogArchiveShowInput,
  ): Promise<Result<ResourceRuntimeLogArchiveDetail | null>>;
  prune(
    context: RepositoryContext,
    input: ResourceRuntimeLogArchivePruneInput,
  ): Promise<Result<ResourceRuntimeLogArchivePruneStoreResult>>;
}

export interface PreviewEnvironmentSourceSummary {
  provider: "github";
  repositoryFullName: string;
  headRepositoryFullName: string;
  pullRequestNumber: number;
  baseRef: string;
  headSha: string;
  sourceBindingFingerprint: string;
}

export interface PreviewEnvironmentSummary {
  previewEnvironmentId: string;
  projectId: string;
  environmentId: string;
  resourceId: string;
  serverId: string;
  destinationId: string;
  source: PreviewEnvironmentSourceSummary;
  status: PreviewEnvironmentStatus;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
}

export interface PreviewEnvironmentReadModel {
  list(
    context: RepositoryContext,
    input?: {
      projectId?: string;
      environmentId?: string;
      resourceId?: string;
      status?: PreviewEnvironmentStatus;
      repositoryFullName?: string;
      pullRequestNumber?: number;
      limit?: number;
      cursor?: string;
    },
  ): Promise<{ items: PreviewEnvironmentSummary[]; nextCursor?: string }>;
  findOne(
    context: RepositoryContext,
    input: {
      previewEnvironmentId: string;
      projectId?: string;
      resourceId?: string;
    },
  ): Promise<PreviewEnvironmentSummary | null>;
}

export interface ListPreviewEnvironmentsResult {
  schemaVersion: "preview-environments.list/v1";
  items: PreviewEnvironmentSummary[];
  nextCursor?: string;
  generatedAt: string;
}

export interface ShowPreviewEnvironmentResult {
  schemaVersion: "preview-environments.show/v1";
  previewEnvironment: PreviewEnvironmentSummary;
  generatedAt: string;
}

export type PreviewPolicyScope =
  | {
      kind: "project";
      projectId: string;
    }
  | {
      kind: "resource";
      projectId: string;
      resourceId: string;
    };

export interface PreviewPolicySettings {
  sameRepositoryPreviews: boolean;
  forkPreviews: "disabled" | "without-secrets" | "with-secrets";
  secretBackedPreviews: boolean;
  maxActivePreviews?: number;
  previewTtlHours?: number;
  environmentProfileBaseEnvironmentId?: string;
}

export interface PreviewPolicyRecord {
  id: string;
  scope: PreviewPolicyScope;
  settings: PreviewPolicySettings;
  updatedAt: string;
  idempotencyKey?: string;
}

export interface PreviewPolicySummary {
  id?: string;
  scope: PreviewPolicyScope;
  settings: PreviewPolicySettings;
  source: "default" | "configured";
  updatedAt?: string;
}

export type PreviewPolicyDecisionReasonCode =
  | "preview_event_unverified"
  | "preview_same_repository_disabled"
  | "preview_fork_disabled"
  | "preview_fork_secrets_blocked"
  | "preview_secret_backed_disabled"
  | "preview_quota_exceeded";

export interface PreviewPolicyDecisionProjection {
  sourceEventId: string;
  projectId: string;
  environmentId: string;
  resourceId: string;
  provider: "github";
  eventKind: "pull-request";
  eventAction: "opened" | "reopened" | "synchronize";
  repositoryFullName: string;
  headRepositoryFullName: string;
  pullRequestNumber: number;
  headSha: string;
  baseRef: string;
  fork: boolean;
  secretBacked: boolean;
  requestedSecretScopeCount: number;
  activePreviewCount: number;
  status: "allowed" | "blocked";
  phase: "preview-policy-evaluation";
  deploymentEligible: boolean;
  evaluatedAt: string;
  reasonCode?: PreviewPolicyDecisionReasonCode;
  maxActivePreviews?: number;
  environmentProfileBaseEnvironmentId?: string;
  previewEnvironmentId?: string;
  previewExpiresAt?: string;
  deploymentId?: string;
}

export interface ConfigurePreviewPolicyResult {
  id: string;
}

export interface ShowPreviewPolicyResult {
  schemaVersion: "preview-policies.show/v1";
  policy: PreviewPolicySummary;
  generatedAt: string;
}

export interface PreviewPolicyRepository {
  findOne(
    context: RepositoryContext,
    scope: PreviewPolicyScope,
  ): Promise<PreviewPolicyRecord | null>;
  upsert(context: RepositoryContext, record: PreviewPolicyRecord): Promise<PreviewPolicyRecord>;
}

export interface PreviewPolicyReadModel {
  findOneSummary(
    context: RepositoryContext,
    scope: PreviewPolicyScope,
  ): Promise<PreviewPolicySummary>;
}

export interface PreviewPolicyDecisionRecorder {
  record(context: RepositoryContext, projection: PreviewPolicyDecisionProjection): Promise<void>;
}

export interface PreviewPolicyDecisionReadModel {
  findOne(
    context: RepositoryContext,
    input: {
      sourceEventId: string;
    },
  ): Promise<PreviewPolicyDecisionProjection | null>;
}

export interface ProjectReadModel {
  count(
    context: RepositoryContext,
    input?: {
      organizationId?: string;
      organizationIds?: readonly string[];
      projectIds?: readonly string[];
      lifecycleStatus?: ProjectListLifecycleStatus;
    },
  ): Promise<number>;
  list(
    context: RepositoryContext,
    input?: {
      organizationId?: string;
      organizationIds?: readonly string[];
      projectIds?: readonly string[];
      limit?: number;
      offset?: number;
      lifecycleStatus?: ProjectListLifecycleStatus;
    },
  ): Promise<ProjectSummary[]>;
  findOne(context: RepositoryContext, spec: ProjectSelectionSpec): Promise<ProjectSummary | null>;
}

export interface ProjectOwnership {
  projectId: string;
  organizationId: string;
}

export interface ProjectOwnershipReadModel {
  findProjectOrganization(
    context: RepositoryContext,
    input: {
      projectId: string;
    },
  ): Promise<ProjectOwnership | null>;
}

export interface ServerReadModel {
  count(context: RepositoryContext): Promise<number>;
  list(
    context: RepositoryContext,
    input?: { limit?: number; offset?: number },
  ): Promise<ServerSummary[]>;
  findOne(context: RepositoryContext, spec: ServerSelectionSpec): Promise<ServerSummary | null>;
}

export interface SshCredentialReadModel {
  list(context: RepositoryContext, input?: { limit?: number }): Promise<SshCredentialSummary[]>;
  findOne(
    context: RepositoryContext,
    spec: SshCredentialSelectionSpec,
  ): Promise<SshCredentialSummary | null>;
}

export interface SshCredentialUsageReader {
  listByCredentialId(
    context: RepositoryContext,
    credentialId: string,
  ): Promise<SshCredentialUsageServerSummary[]>;
}

export interface EnvironmentReadModel {
  count(context: RepositoryContext, input?: { projectId?: string }): Promise<number>;
  list(
    context: RepositoryContext,
    input?: { projectId?: string; limit?: number },
  ): Promise<EnvironmentSummary[]>;
  findOne(
    context: RepositoryContext,
    spec: EnvironmentSelectionSpec,
  ): Promise<EnvironmentSummary | null>;
}

export interface ResourceReadModel {
  count(
    context: RepositoryContext,
    input?: {
      projectId?: string;
      environmentId?: string;
      includePreviewResources?: boolean;
    },
  ): Promise<number>;
  list(
    context: RepositoryContext,
    input?: {
      projectId?: string;
      environmentId?: string;
      includePreviewResources?: boolean;
      limit?: number;
    },
  ): Promise<ResourceSummary[]>;
  findOne(context: RepositoryContext, spec: ResourceSelectionSpec): Promise<ResourceSummary | null>;
}

export interface StorageVolumeReadModel {
  list(
    context: RepositoryContext,
    input?: {
      projectId?: string;
      environmentId?: string;
    },
  ): Promise<StorageVolumeSummary[]>;
  findOne(
    context: RepositoryContext,
    spec: StorageVolumeSelectionSpec,
  ): Promise<StorageVolumeSummary | null>;
  countAttachments(context: RepositoryContext, storageVolumeId: string): Promise<number>;
}

export interface StorageVolumeBackupReadModel {
  list(
    context: RepositoryContext,
    input: {
      storageVolumeId: string;
      status?: StorageVolumeBackupSummary["status"];
    },
  ): Promise<StorageVolumeBackupSummary[]>;
  findOne(
    context: RepositoryContext,
    spec: StorageVolumeBackupSelectionSpec,
  ): Promise<StorageVolumeBackupSummary | null>;
}

export interface DependencyResourceReadModel {
  count(
    context: RepositoryContext,
    input?: {
      projectId?: string;
      environmentId?: string;
      kind?: DependencyResourceKind;
    },
  ): Promise<number>;
  list(
    context: RepositoryContext,
    input?: {
      projectId?: string;
      environmentId?: string;
      kind?: DependencyResourceKind;
      limit?: number;
    },
  ): Promise<DependencyResourceSummary[]>;
  findOne(
    context: RepositoryContext,
    spec: ResourceInstanceSelectionSpec,
  ): Promise<DependencyResourceSummary | null>;
}

export interface DependencyResourceBackupReadModel {
  list(
    context: RepositoryContext,
    input: {
      dependencyResourceId: string;
      status?: DependencyResourceBackupSummary["status"];
    },
  ): Promise<DependencyResourceBackupSummary[]>;
  findOne(
    context: RepositoryContext,
    spec: DependencyResourceBackupSelectionSpec,
  ): Promise<DependencyResourceBackupSummary | null>;
}

export interface ResourceDependencyBindingReadModel {
  list(
    context: RepositoryContext,
    input: {
      resourceId: string;
    },
  ): Promise<Result<ResourceDependencyBindingSummary[]>>;
  findOne(
    context: RepositoryContext,
    input: {
      resourceId: string;
      bindingId: string;
    },
  ): Promise<Result<ResourceDependencyBindingSummary | null>>;
}

export interface ManagedPostgresRealizationInput {
  dependencyResourceId: string;
  projectId: string;
  environmentId: string;
  providerKey: string;
  name: string;
  slug: string;
  attemptId: string;
  requestedAt: string;
  target?: ManagedDependencySingleServerTarget;
}

export interface ManagedPostgresRealizationResult {
  providerResourceHandle: string;
  endpoint: {
    host: string;
    port?: number;
    databaseName?: string;
    maskedConnection: string;
  };
  secretRef?: string;
  connectionSecretValue?: string;
  realizedAt: string;
}

export interface ManagedPostgresDeleteInput {
  dependencyResourceId: string;
  providerKey: string;
  providerResourceHandle: string;
  attemptId: string;
  requestedAt: string;
  target?: ManagedDependencySingleServerTarget;
}

export interface ManagedPostgresDeleteResult {
  deletedAt: string;
}

export interface ManagedPostgresProviderPort {
  supports(providerKey: string): boolean;
  realize(
    context: ExecutionContext,
    input: ManagedPostgresRealizationInput,
  ): Promise<Result<ManagedPostgresRealizationResult, DomainError>>;
  delete(
    context: ExecutionContext,
    input: ManagedPostgresDeleteInput,
  ): Promise<Result<ManagedPostgresDeleteResult, DomainError>>;
}

export interface ManagedRedisRealizationInput {
  dependencyResourceId: string;
  projectId: string;
  environmentId: string;
  providerKey: string;
  name: string;
  slug: string;
  attemptId: string;
  requestedAt: string;
  target?: ManagedDependencySingleServerTarget;
}

export interface ManagedRedisRealizationResult {
  providerResourceHandle: string;
  endpoint: {
    host: string;
    port?: number;
    databaseName?: string;
    maskedConnection: string;
  };
  secretRef?: string;
  connectionSecretValue?: string;
  realizedAt: string;
}

export interface ManagedRedisDeleteInput {
  dependencyResourceId: string;
  providerKey: string;
  providerResourceHandle: string;
  attemptId: string;
  requestedAt: string;
  target?: ManagedDependencySingleServerTarget;
}

export interface ManagedRedisDeleteResult {
  deletedAt: string;
}

export interface ManagedRedisProviderPort {
  supports(providerKey: string): boolean;
  realize(
    context: ExecutionContext,
    input: ManagedRedisRealizationInput,
  ): Promise<Result<ManagedRedisRealizationResult, DomainError>>;
  delete(
    context: ExecutionContext,
    input: ManagedRedisDeleteInput,
  ): Promise<Result<ManagedRedisDeleteResult, DomainError>>;
}

export interface ManagedDependencyRealizationInput {
  dependencyResourceId: string;
  projectId: string;
  environmentId: string;
  kind: ManagedDependencyResourceKind;
  providerKey: string;
  name: string;
  slug: string;
  attemptId: string;
  requestedAt: string;
  capabilities?: readonly DependencyResourceCapabilityRequirement[];
  target?: ManagedDependencySingleServerTarget;
}

export interface ManagedDependencyRealizationResult {
  providerResourceHandle: string;
  endpoint: {
    host: string;
    port?: number;
    databaseName?: string;
    maskedConnection: string;
  };
  secretRef?: string;
  connectionSecretValue?: string;
  capabilityReadbacks?: readonly DependencyResourceCapabilityReadback[];
  realizedAt: string;
}

export interface ManagedDependencyDeleteInput {
  dependencyResourceId: string;
  kind: ManagedDependencyResourceKind;
  providerKey: string;
  providerResourceHandle: string;
  attemptId: string;
  requestedAt: string;
  target?: ManagedDependencySingleServerTarget;
}

export interface ManagedDependencyDeleteResult {
  deletedAt: string;
}

export interface ManagedDependencyProviderPort {
  supports(
    providerKey: string,
    kind: ManagedDependencyResourceKind,
    capabilities?: readonly DependencyResourceCapabilityRequirement[],
  ): boolean;
  realize(
    context: ExecutionContext,
    input: ManagedDependencyRealizationInput,
  ): Promise<Result<ManagedDependencyRealizationResult, DomainError>>;
  delete(
    context: ExecutionContext,
    input: ManagedDependencyDeleteInput,
  ): Promise<Result<ManagedDependencyDeleteResult, DomainError>>;
}

export interface DependencyResourceBackupProviderInput {
  backupId: string;
  dependencyResourceId: string;
  dependencyKind: DependencyResourceKind;
  providerKey: string;
  providerResourceHandle?: string;
  connectionSecretValue?: string;
  connection?: DependencyResourceProviderConnectionContext;
  attemptId: string;
  requestedAt: string;
}

export interface DependencyResourceBackupProviderResult {
  providerArtifactHandle: string;
  completedAt: string;
  retentionStatus?: "retained" | "none";
}

export interface DependencyResourceRestoreProviderInput {
  backupId: string;
  dependencyResourceId: string;
  dependencyKind: DependencyResourceKind;
  providerKey: string;
  providerArtifactHandle: string;
  providerResourceHandle?: string;
  connectionSecretValue?: string;
  connection?: DependencyResourceProviderConnectionContext;
  restoreAttemptId: string;
  requestedAt: string;
}

export interface DependencyResourceRestoreProviderResult {
  completedAt: string;
}

export interface DependencyResourceProviderConnectionContext {
  host?: string;
  port?: number;
  databaseName?: string;
  maskedConnection?: string;
  secretRef?: string;
}

export interface DependencyResourceBackupProviderPort {
  supports(providerKey: string, dependencyKind: DependencyResourceKind): boolean;
  createBackup(
    context: ExecutionContext,
    input: DependencyResourceBackupProviderInput,
  ): Promise<Result<DependencyResourceBackupProviderResult, DomainError>>;
  restoreBackup(
    context: ExecutionContext,
    input: DependencyResourceRestoreProviderInput,
  ): Promise<Result<DependencyResourceRestoreProviderResult, DomainError>>;
}

export interface ManagedDependencySingleServerTarget {
  serverId: string;
  providerKey: "local-shell" | "generic-ssh";
  targetKind: "single-server";
  host: string;
  port: number;
  username?: string;
  privateKey?: string;
}

export interface DeploymentReadModel {
  count(
    context: RepositoryContext,
    input?: {
      projectId?: string;
      resourceId?: string;
      includeArchived?: boolean;
      status?: DeploymentStatus;
      statuses?: readonly DeploymentStatus[];
    },
  ): Promise<number>;
  list(
    context: RepositoryContext,
    input?: {
      projectId?: string;
      resourceId?: string;
      includeArchived?: boolean;
      limit?: number;
    },
  ): Promise<DeploymentSummary[]>;
  findOne(
    context: RepositoryContext,
    spec: DeploymentSelectionSpec,
  ): Promise<DeploymentSummary | null>;
  findTimeline(context: RepositoryContext, id: string): Promise<DeploymentTimelineJournalSummary[]>;
}

export interface DomainBindingReadModel {
  list(
    context: RepositoryContext,
    input?: {
      projectId?: string;
      environmentId?: string;
      resourceId?: string;
      limit?: number;
    },
  ): Promise<DomainBindingSummary[]>;
}

export interface CertificateReadModel {
  list(
    context: RepositoryContext,
    input?: {
      domainBindingId?: string;
      limit?: number;
    },
  ): Promise<CertificateSummary[]>;
  findOne(
    context: RepositoryContext,
    input: { certificateId: string },
  ): Promise<CertificateSummary | null>;
}

export interface SourceDetectionResult {
  source: SourceDescriptor;
  reasoning: string[];
}

export type RequestedDeploymentMethod =
  | "auto"
  | "dockerfile"
  | "docker-compose"
  | "prebuilt-image"
  | "workspace-commands"
  | "static";

export interface RequestedAccessRouteConfig {
  proxyKind: EdgeProxyKind;
  domains: string[];
  pathPrefix: string;
  tlsMode: TlsMode;
  routeBehavior?: "serve" | "redirect";
  redirectTo?: string;
  redirectStatus?: 301 | 302 | 307 | 308;
}

export interface RequestedDeploymentConfig {
  method: RequestedDeploymentMethod;
  installCommand?: string;
  buildCommand?: string;
  startCommand?: string;
  publishDirectory?: string;
  dockerfilePath?: string;
  dockerComposeFilePath?: string;
  buildTarget?: string;
  replicas?: number;
  port?: number;
  healthCheckPath?: string;
  healthCheck?: RequestedDeploymentHealthCheck;
  exposureMode?: ResourceExposureMode;
  hostPort?: number;
  upstreamProtocol?: ResourceNetworkProtocol;
  targetServiceName?: string;
  accessContext?: RequestedDeploymentAccessContext;
  runtimeMetadata?: Record<string, string>;
  accessRouteMetadata?: Record<string, string>;
  proxyKind?: EdgeProxyKind;
  domains?: string[];
  pathPrefix?: string;
  tlsMode?: TlsMode;
  accessRoutes?: RequestedAccessRouteConfig[];
  storageMounts?: RequestedDeploymentStorageMount[];
  services?: RequestedDeploymentServiceConfig[];
}

export interface RequestedDeploymentHealthCheck {
  enabled: boolean;
  type: "http" | "command";
  intervalSeconds: number;
  timeoutSeconds: number;
  retries: number;
  startPeriodSeconds: number;
  http?: {
    method: "GET" | "HEAD" | "POST" | "OPTIONS";
    scheme: "http" | "https";
    host: string;
    port?: number;
    path: string;
    expectedStatusCode: number;
    expectedResponseText?: string;
  };
  command?: {
    command: string;
  };
}

export interface RequestedDeploymentAccessContext {
  projectId: string;
  environmentId: string;
  resourceId: string;
  resourceSlug: string;
  destinationId?: string;
  exposureMode: ResourceExposureMode;
  upstreamProtocol: ResourceNetworkProtocol;
  routePurpose: "default-resource-access";
  pathPrefix?: string;
}

export interface RequestedDeploymentStorageMount {
  attachmentId: string;
  storageVolumeId: string;
  storageVolumeKind: StorageVolumeKind;
  sourcePath?: string;
  destinationPath: string;
  mountMode: "read-write" | "read-only";
  dataFormat?: StorageVolumeBackupDataFormat;
  applicationDataLabel?: string;
}

export interface RequestedDeploymentServiceSource {
  type?: "git" | "image";
  repository?: string;
  image?: string;
  gitRef?: string;
  commitSha?: string;
  baseDirectory?: string;
  version?: string;
  versionKind?: string;
}

export interface RequestedDeploymentServiceRuntime {
  strategy?: RequestedDeploymentMethod;
  installCommand?: string;
  buildCommand?: string;
  startCommand?: string;
  publishDirectory?: string;
  dockerfilePath?: string;
  dockerComposeFilePath?: string;
  buildTarget?: string;
  healthCheckPath?: string;
}

export interface RequestedDeploymentServiceNetwork {
  internalPort?: number;
  upstreamProtocol?: ResourceNetworkProtocol;
  exposureMode?: ResourceExposureMode;
  targetServiceName?: string;
  hostPort?: number;
}

export interface RequestedDeploymentServiceConfig {
  name: string;
  kind: ResourceServiceKind;
  source?: RequestedDeploymentServiceSource;
  runtime?: RequestedDeploymentServiceRuntime;
  network?: RequestedDeploymentServiceNetwork;
  healthCheck?: RequestedDeploymentHealthCheck;
  replicas?: number;
  env?: Record<string, string | number | boolean>;
  secrets?: Record<
    string,
    {
      from: string;
      required?: boolean;
      description?: string;
    }
  >;
}

export type DefaultAccessRoutePurpose = "default-resource-access" | "preview-access";

export interface DefaultAccessDomainRequest {
  publicAddress: string;
  projectId: string;
  environmentId: string;
  resourceId: string;
  resourceSlug: string;
  serverId: string;
  destinationId?: string;
  deploymentId?: string;
  routePurpose: DefaultAccessRoutePurpose;
  correlationId: string;
  causationId?: string;
}

export interface GeneratedAccessDomain {
  hostname: string;
  scheme: "http" | "https";
  providerKey: string;
  expiresAt?: string;
  metadata?: Record<string, string>;
}

export type DefaultAccessDomainGeneration =
  | {
      kind: "generated";
      domain: GeneratedAccessDomain;
    }
  | {
      kind: "disabled";
      reason: string;
      providerKey?: string;
    };

export interface DefaultAccessDomainProvider {
  generate(
    context: ExecutionContext,
    input: DefaultAccessDomainRequest,
  ): Promise<Result<DefaultAccessDomainGeneration, DomainError>>;
}

export type DefaultAccessDomainPolicyScope =
  | { kind: "system" }
  | { kind: "deployment-target"; serverId: string };

export type DefaultAccessDomainPolicyMode = "disabled" | "provider" | "custom-template";

export interface DefaultAccessDomainPolicyConfiguration {
  mode: DefaultAccessDomainPolicyMode;
  providerKey?: string;
  templateRef?: string;
}

export interface DefaultAccessDomainPolicyRecord extends DefaultAccessDomainPolicyConfiguration {
  id: string;
  scope: DefaultAccessDomainPolicyScope;
  updatedAt: string;
  idempotencyKey?: string;
}

export interface DefaultAccessDomainPolicyRead {
  schemaVersion: "default-access-domain-policies.policy/v1";
  id: string;
  scope: DefaultAccessDomainPolicyScope;
  mode: DefaultAccessDomainPolicyMode;
  updatedAt: string;
  providerKey?: string;
  templateRef?: string;
}

export interface ShowDefaultAccessDomainPolicyResult {
  schemaVersion: "default-access-domain-policies.show/v1";
  scope: DefaultAccessDomainPolicyScope;
  policy: DefaultAccessDomainPolicyRead | null;
}

export interface ListDefaultAccessDomainPoliciesResult {
  schemaVersion: "default-access-domain-policies.list/v1";
  items: DefaultAccessDomainPolicyRead[];
}

export interface DefaultAccessDomainPolicySelectionSpecVisitor<TResult> {
  visitDefaultAccessDomainPolicyByScope(
    query: TResult,
    spec: DefaultAccessDomainPolicyByScopeSpec,
  ): TResult;
}

export interface DefaultAccessDomainPolicyUpsertSpecVisitor<TResult> {
  visitUpsertDefaultAccessDomainPolicy(spec: UpsertDefaultAccessDomainPolicySpec): TResult;
}

export interface DefaultAccessDomainPolicySelectionSpec {
  accept<TResult>(
    query: TResult,
    visitor: DefaultAccessDomainPolicySelectionSpecVisitor<TResult>,
  ): TResult;
}

export interface DefaultAccessDomainPolicyUpsertSpec {
  accept<TResult>(visitor: DefaultAccessDomainPolicyUpsertSpecVisitor<TResult>): TResult;
}

export class DefaultAccessDomainPolicyByScopeSpec
  implements DefaultAccessDomainPolicySelectionSpec
{
  private constructor(public readonly scope: DefaultAccessDomainPolicyScope) {}

  static create(scope: DefaultAccessDomainPolicyScope): DefaultAccessDomainPolicyByScopeSpec {
    return new DefaultAccessDomainPolicyByScopeSpec(scope);
  }

  accept<TResult>(
    query: TResult,
    visitor: DefaultAccessDomainPolicySelectionSpecVisitor<TResult>,
  ): TResult {
    return visitor.visitDefaultAccessDomainPolicyByScope(query, this);
  }
}

export class UpsertDefaultAccessDomainPolicySpec implements DefaultAccessDomainPolicyUpsertSpec {
  private constructor(public readonly record: DefaultAccessDomainPolicyRecord) {}

  static fromRecord(record: DefaultAccessDomainPolicyRecord): UpsertDefaultAccessDomainPolicySpec {
    return new UpsertDefaultAccessDomainPolicySpec(record);
  }

  accept<TResult>(visitor: DefaultAccessDomainPolicyUpsertSpecVisitor<TResult>): TResult {
    return visitor.visitUpsertDefaultAccessDomainPolicy(this);
  }
}

export interface DefaultAccessDomainPolicyRepository {
  findOne(
    spec: DefaultAccessDomainPolicySelectionSpec,
  ): Promise<Result<DefaultAccessDomainPolicyRecord | null>>;
  list(): Promise<Result<DefaultAccessDomainPolicyRecord[]>>;
  upsert(
    record: DefaultAccessDomainPolicyRecord,
    spec: DefaultAccessDomainPolicyUpsertSpec,
  ): Promise<Result<DefaultAccessDomainPolicyRecord>>;
}

export interface DefaultAccessDomainPolicySupport {
  validate(
    context: ExecutionContext,
    input: DefaultAccessDomainPolicyConfiguration,
  ): Promise<Result<DefaultAccessDomainPolicyConfiguration, DomainError>>;
}

export interface DeploymentConfiguredProject {
  name: string;
  description?: string;
}

export interface DeploymentConfiguredEnvironment {
  name: string;
  kind?: EnvironmentKind;
}

export interface DeploymentConfiguredResource {
  name: string;
  kind?: ResourceKind;
  description?: string;
  services?: RequestedDeploymentServiceConfig[];
}

export interface DeploymentConfiguredSource {
  type?: "git" | "image";
  repository?: string;
  image?: string;
  gitRef?: string;
  commitSha?: string;
  baseDirectory?: string;
  version?: string;
  versionKind?: string;
}

export interface DeploymentConfiguredApplication {
  key: string;
  resource: DeploymentConfiguredResource;
  source?: DeploymentConfiguredSource;
  deployment?: Partial<RequestedDeploymentConfig>;
  services?: RequestedDeploymentServiceConfig[];
}

export interface DeploymentConfiguredDestination {
  name?: string;
  kind?: DestinationKind;
}

export interface DeploymentConfiguredTarget {
  key?: string;
  name?: string;
  providerKey: string;
  host?: string;
  port?: number;
  destination?: DeploymentConfiguredDestination;
}

export type DeploymentConfiguredRuntimePruneCategory =
  | "stopped-containers"
  | "preview-workspaces"
  | "source-workspaces"
  | "docker-build-cache"
  | "unused-images"
  | "remote-state-markers";

export interface DeploymentConfiguredRuntimePrunePolicy {
  retentionDays: number;
  destructive: boolean;
  categories: DeploymentConfiguredRuntimePruneCategory[];
  retryOnFailure: boolean;
  enabled: boolean;
}

export interface DeploymentConfiguredRetention {
  runtimePrune?: DeploymentConfiguredRuntimePrunePolicy;
}

export interface DeploymentConfigSnapshot {
  configFilePath?: string;
  project?: DeploymentConfiguredProject;
  environment?: DeploymentConfiguredEnvironment;
  resource?: DeploymentConfiguredResource;
  services?: RequestedDeploymentServiceConfig[];
  applications?: DeploymentConfiguredApplication[];
  targets?: DeploymentConfiguredTarget[];
  deployment?: Partial<RequestedDeploymentConfig> & {
    targetKey?: string;
  };
  retention?: DeploymentConfiguredRetention;
}

export interface DeploymentConfigReader {
  read(
    context: ExecutionContext,
    input: {
      sourceLocator: string;
      configFilePath?: string;
    },
  ): Promise<Result<DeploymentConfigSnapshot | null>>;
}

export interface ServerConnectivityChecker {
  test(
    context: ExecutionContext,
    input: {
      server: DeploymentTargetState;
    },
  ): Promise<Result<ServerConnectivityResult>>;
}

export interface DeploymentHealthChecker {
  check(context: ExecutionContext, deployment: Deployment): Promise<Result<DeploymentHealthResult>>;
}

export interface DeploymentContextDefaultsPolicyInput {
  sourceLocator: string;
  requestedDeploymentMethod: RequestedDeploymentMethod;
}

export type ProjectContextDefault =
  | {
      mode: "required";
    }
  | {
      mode: "reuse-or-create";
      preset: "local-project";
    };

export type ServerContextDefault =
  | {
      mode: "required";
    }
  | {
      mode: "reuse-or-create";
      preset: "local-server";
    };

export type EnvironmentContextDefault =
  | {
      mode: "required";
    }
  | {
      mode: "reuse-or-create";
      preset: "local-environment";
    };

export type ResourceContextDefault =
  | {
      mode: "required";
    }
  | {
      mode: "reuse-or-create";
      preset: "local-resource";
    };

export type DestinationContextDefault =
  | {
      mode: "required";
    }
  | {
      mode: "reuse-or-create";
      preset: "local-destination";
    };

export interface DeploymentContextDefaultsDecision {
  project: ProjectContextDefault;
  server: ServerContextDefault;
  destination: DestinationContextDefault;
  environment: EnvironmentContextDefault;
  resource: ResourceContextDefault;
}

export interface DeploymentContextDefaultsPolicy {
  decide(input: DeploymentContextDefaultsPolicyInput): Result<DeploymentContextDefaultsDecision>;
}

export interface DeploymentContextDefaultsFactoryPort {
  localProjectSelection(): Result<ProjectSelectionSpec>;
  createLocalProject(): Result<Project>;
  localServerSelection(): Result<ServerSelectionSpec>;
  createLocalServer(): Result<Server>;
  localDestinationSelection(server: Server): Result<DestinationSelectionSpec>;
  createLocalDestination(server: Server): Result<Destination>;
  localEnvironmentSelection(project: Project): Result<EnvironmentSelectionSpec>;
  createLocalEnvironment(project: Project): Result<EnvironmentProfile>;
  localResourceSelection(
    project: Project,
    environment: EnvironmentProfile,
  ): Result<ResourceSelectionSpec>;
  createLocalResource(
    project: Project,
    environment: EnvironmentProfile,
    destination: Destination,
  ): Result<Resource>;
}

export interface SourceDetector {
  detect(context: ExecutionContext, locator: string): Promise<Result<SourceDetectionResult>>;
}

export interface SourceVersionDetectionResult {
  version: Version;
  reasoning: string[];
}

export interface SourceVersionDetector {
  detect(
    context: ExecutionContext,
    input: {
      source: SourceDescriptor;
      requestedVersion?: VersionReference;
    },
  ): Promise<Result<SourceVersionDetectionResult>>;
}

export interface RuntimePlanResolver {
  resolve(
    context: ExecutionContext,
    input: {
      id: string;
      source: SourceDescriptor;
      server: DeploymentTargetState;
      environmentSnapshot: EnvironmentSnapshot;
      detectedReasoning: string[];
      requestedDeployment: RequestedDeploymentConfig;
      generatedAt: string;
    },
  ): Promise<Result<RuntimePlan>>;
}

export interface DeploymentExecutionGuardDecision {
  allowed: boolean;
  supersededByDeploymentId?: string;
}

export interface DeploymentExecutionGuard {
  shouldContinue(
    context: ExecutionContext,
    deployment: Deployment,
  ): Promise<Result<DeploymentExecutionGuardDecision>>;
}

export interface ExecutionBackend {
  execute(
    context: ExecutionContext,
    deployment: Deployment,
  ): Promise<Result<{ deployment: Deployment }>>;
  cancel(
    context: ExecutionContext,
    deployment: Deployment,
  ): Promise<Result<{ timeline: DeploymentTimelineJournalEntry[] }>>;
  rollback(
    context: ExecutionContext,
    deployment: Deployment,
    plan: RollbackPlan,
  ): Promise<Result<{ deployment: Deployment }>>;
}

export type RuntimeTargetCapability =
  | "runtime.plan-target"
  | "runtime.apply"
  | "runtime.verify"
  | "runtime.dependency-secrets"
  | "runtime.logs"
  | "runtime.health"
  | "runtime.cleanup"
  | "runtime.capacity"
  | "proxy.route";

export interface RuntimeTargetBackendDescriptor {
  key: string;
  providerKey: string;
  targetKinds: TargetKind[];
  capabilities: RuntimeTargetCapability[];
}

export interface RuntimeTargetBackend extends ExecutionBackend {
  readonly descriptor: RuntimeTargetBackendDescriptor;
}

export interface RuntimeTargetBackendSelection {
  targetKind: TargetKind;
  providerKey: string;
  requiredCapabilities?: RuntimeTargetCapability[];
}

export interface RuntimeTargetBackendRegistry {
  find(input: RuntimeTargetBackendSelection): Result<RuntimeTargetBackend>;
}

export interface ProviderDescriptor {
  key: string;
  title: string;
  category: "cloud-provider" | "deploy-target" | "infra-service";
  capabilities: string[];
  capabilityDetails?: {
    key: string;
    title: string;
    enabled: boolean;
    description?: string;
  }[];
  configuration?: {
    status: "configured" | "not-configured" | "partial" | "unknown";
    diagnostics: {
      code: string;
      severity: "info" | "warning" | "error";
      message: string;
      documentationHref?: string;
    }[];
  };
}

export interface IntegrationDescriptor {
  key: string;
  title: string;
  capabilities: string[];
  defaultConnectionModeKey?: string;
  connectionModes?: IntegrationConnectionMode[];
  setup?: IntegrationSetupDescriptor;
  configuration?: {
    status: "configured" | "not-configured" | "partial" | "unknown";
    diagnostics: {
      code: string;
      severity: "info" | "warning" | "error";
      message: string;
      documentationHref?: string;
    }[];
  };
}

export interface ProviderRegistry {
  list(): ProviderDescriptor[];
  findByKey(key: string): ProviderDescriptor | null;
}

export type IntegrationConnectionModeAudience = "end-user" | "instance-admin" | "operator";
export type IntegrationConnectionModeExternalSetup =
  | "none"
  | "provider-installation"
  | "manual-provider-app";
export type IntegrationConnectionModeKey =
  | "user-oauth"
  | "hosted-provider-app"
  | "operator-managed-app";

export interface IntegrationConnectionMode {
  key: IntegrationConnectionModeKey;
  title: string;
  audience: IntegrationConnectionModeAudience;
  externalSetup: IntegrationConnectionModeExternalSetup;
  createsExternalResources: boolean;
  secretMaterialRequired: boolean;
  description?: string;
}

export interface IntegrationSetupDescriptor {
  providerApp?: {
    installUrl?: string;
    callbackUrl?: string;
    webhookUrl?: string;
  };
}

export interface IntegrationRegistry {
  list(): IntegrationDescriptor[];
  findByKey(key: string): IntegrationDescriptor | null;
}

export type ConnectorDescriptor = ConnectorDefinitionSnapshot;

export interface ConnectorRegistryListInput {
  category?: ConnectionCategoryKey;
  includeUnavailable?: boolean;
}

export interface ConnectorRegistry {
  list(input?: ConnectorRegistryListInput): ConnectorDescriptor[];
  findByKey(key: string): ConnectorDescriptor | null;
}

export interface ConnectorConnectionStoreListInput {
  owner?: ConnectionOwnerSnapshot;
  connectorKey?: string;
  category?: ConnectionCategoryKey;
}

export interface ConnectorConnectionStore {
  list(input?: ConnectorConnectionStoreListInput): ConnectionSnapshot[];
  findById(connectionId: string): ConnectionSnapshot | null;
  save(connection: ConnectionSnapshot): void;
}

export interface AcceptedConnectionCapabilityPlanStore {
  save(plan: AcceptedConnectionCapabilityPlanSnapshot): void;
  findById(acceptedPlanId: string): AcceptedConnectionCapabilityPlanSnapshot | null;
}

export interface ConnectorConnectionProjectionSource {
  list(
    context: ExecutionContext,
    input?: ConnectorConnectionStoreListInput,
  ): Promise<ConnectionSnapshot[]>;
  findById(context: ExecutionContext, connectionId: string): Promise<ConnectionSnapshot | null>;
}

export interface ConnectionStartResult {
  connection: ConnectionSnapshot;
  authorizationUrl?: string;
  nextAction:
    | "already-connected"
    | "authorize-in-browser"
    | "provider-callback"
    | "ready"
    | "manual-secret-required";
}

export interface ConnectionCallbackResult {
  connection: ConnectionSnapshot;
}

export interface ConnectionRevokeResult {
  connection: ConnectionSnapshot;
}

export type {
  AcceptedConnectionCapabilityPlanSnapshot,
  ConnectionCredentialGrantSnapshot,
  ConnectionOwnerSnapshot,
  ConnectionSnapshot,
};

export interface ConnectorCapabilityPlanInput {
  connectorKey: string;
  capabilityKey: string;
  ownerRef?: {
    scope: "account" | "organization" | "project" | "environment" | "resource" | "operator";
    id: string;
  };
  parameters?: Record<string, unknown>;
}

export interface ConnectorCapabilityPlanPreview {
  planId: string;
  connectorKey: string;
  capabilityKey: string;
  riskLevel: "low" | "medium" | "high";
  requiresExplicitAcceptance: boolean;
  summary: string;
  effects: {
    kind: string;
    title: string;
    description?: string;
  }[];
  cleanup?: {
    supported: boolean;
    description?: string;
  };
  providerPlan?: {
    kind: "dns-records" | string;
    dnsRecords?: DnsRecordPlanSnapshot;
    domainConnectSetup?: DomainConnectSetupSnapshot;
    infrastructureServerProposal?: InfrastructureServerProposalSnapshot;
    notificationMessage?: NotificationMessageSnapshot;
    sourceRepositoryAccess?: SourceRepositoryAccessSnapshot;
  };
}

export interface ConnectorCapabilityApplyInput {
  connectorKey: string;
  capabilityKey: string;
  ownerRef?: {
    scope: "account" | "organization" | "project" | "environment" | "resource" | "operator";
    id: string;
  };
  acceptedPlanId?: string;
  parameters?: Record<string, unknown>;
}

export interface ConnectorCapabilityApplyResult {
  operationId: string;
  connectorKey: string;
  capabilityKey: string;
  status: "applied" | "verified" | "cleaned-up" | "conflict" | "skipped";
  summary: string;
  effects: {
    kind: string;
    title: string;
    description?: string;
    providerRecordId?: string;
    managed?: boolean;
  }[];
  providerResult?: {
    kind: "dns-records" | string;
    dnsRecords?: DnsRecordApplySnapshot;
    domainConnectApply?: DomainConnectApplySnapshot;
    notificationDelivery?: NotificationMessageDeliverySnapshot;
  };
}

export interface DomainBindingDnsZoneMatch {
  status: "matched" | "no-matching-zone" | "no-dns-connections";
  connectorKey?: string;
  connectionId?: string;
  providerKey?: string;
  providerAccountId?: string;
  zoneName?: string;
}

export interface DomainBindingDnsConflictReadiness {
  status: "available" | "conflict";
  conflictingDomainBindingId?: string;
  conflictingResourceId?: string;
  conflictingProjectId?: string;
  domainName?: string;
  pathPrefix?: string;
}

export interface DomainBindingDnsPlanReadiness {
  status: "ready" | "blocked" | "not-requested" | "error";
  message?: string;
  preview?: ConnectorCapabilityPlanPreview;
}

export interface DomainBindingDnsReadiness {
  domainBindingId?: string;
  resourceId: string;
  domainName: string;
  pathPrefix: string;
  zoneMatch: DomainBindingDnsZoneMatch;
  conflict: DomainBindingDnsConflictReadiness;
  plan: DomainBindingDnsPlanReadiness;
  actions: {
    canApplyDns: boolean;
    canConnectProvider: boolean;
    canShowManualDns: boolean;
    reason?: string;
  };
}

export interface ConnectorProviderAdapter {
  readonly connectorKey: string;
  listZones?(input?: {
    ownerRef?: ConnectionOwnerSnapshot;
    connectorKey?: string;
  }): Promise<Result<readonly DnsConnectorZoneSnapshot[]>>;
  canPlan(capabilityKey: string): boolean;
  planCapability(
    context: ExecutionContext,
    input: ConnectorCapabilityPlanInput,
  ): Promise<Result<ConnectorCapabilityPlanPreview>>;
  canApply(capabilityKey: string): boolean;
  applyCapability(
    context: ExecutionContext,
    input: ConnectorCapabilityApplyInput,
  ): Promise<Result<ConnectorCapabilityApplyResult>>;
}

export interface ConnectorProviderAdapterRegistry {
  list(): ConnectorProviderAdapter[];
  findForConnector(connectorKey: string): ConnectorProviderAdapter | null;
}

export interface DnsConnectorPlanParameters {
  zoneName?: string;
  records: DnsRecordRequirementSnapshot[];
}

export interface DnsConnectorZoneSnapshot {
  id?: string;
  name: string;
  providerKey?: string;
  providerAccountId?: string;
  connectionId?: string;
  verified?: boolean;
}

export interface DnsConnectorProviderReadModel {
  listZones?(input?: {
    ownerRef?: ConnectionOwnerSnapshot;
    connectorKey?: string;
  }): Promise<Result<readonly DnsConnectorZoneSnapshot[]>>;
  existingRecords(input: {
    zoneName?: string;
    records: readonly DnsRecordRequirementSnapshot[];
  }): Promise<Result<readonly DnsRecordRequirementSnapshot[]>>;
}

export interface DnsConnectorProviderRecordStore extends DnsConnectorProviderReadModel {
  applyRecords(input: {
    zoneName?: string;
    records: readonly DnsRecordRequirementSnapshot[];
  }): Promise<Result<DnsRecordApplySnapshot>>;
  verifyRecords(input: {
    zoneName?: string;
    records: readonly DnsRecordRequirementSnapshot[];
  }): Promise<Result<DnsRecordApplySnapshot>>;
  cleanupRecords(input: {
    zoneName?: string;
    records: readonly DnsRecordRequirementSnapshot[];
  }): Promise<Result<DnsRecordApplySnapshot>>;
}

export type {
  DnsRecordApplySnapshot,
  DnsRecordConflictSnapshot,
  DnsRecordPlanSnapshot,
  DnsRecordRequirementSnapshot,
  InfrastructureServerProposalSnapshot,
};

export interface IntegrationAuthPort {
  getProviderAccessToken(context: ExecutionContext, providerKey: "github"): Promise<string | null>;
}

export interface GitHubAppInstallationRecord {
  accountId?: string;
  accountLogin?: string;
  accountType?: "Organization" | "User" | string;
  installationId: string;
  installedAt: string;
  providerKey: "github";
  repositoriesSelection?: "all" | "selected";
  repositoryCount?: number;
  suspendedAt?: string;
  tenantId: string;
  updatedAt: string;
}

export interface GitHubAppInstallationRepository {
  findForTenant(
    context: RepositoryContext,
    input: { tenantId: string; providerKey: "github" },
  ): Promise<Result<GitHubAppInstallationRecord | null>>;
  findByInstallationId(
    context: RepositoryContext,
    input: { installationId: string; providerKey: "github" },
  ): Promise<Result<GitHubAppInstallationRecord | null>>;
  upsert(
    context: RepositoryContext,
    record: GitHubAppInstallationRecord,
  ): Promise<Result<GitHubAppInstallationRecord>>;
  markSuspended(
    context: RepositoryContext,
    input: { installationId: string; providerKey: "github"; suspendedAt: string },
  ): Promise<Result<GitHubAppInstallationRecord | null>>;
}

export interface GitHubAppInstallationReadback {
  accountId?: string;
  accountLogin?: string;
  accountType?: "Organization" | "User" | string;
  installationId: string;
  repositoriesSelection?: "all" | "selected";
  repositoryCount?: number;
  suspendedAt?: string;
}

export interface GitHubAppInstallationToken {
  expiresAt: string;
  token: string;
}

export interface GitHubAppRuntime {
  createInstallationAccessToken(
    context: ExecutionContext,
    input: { installationId: string },
  ): Promise<Result<GitHubAppInstallationToken>>;
  readInstallation(
    context: ExecutionContext,
    input: { installationId: string },
  ): Promise<Result<GitHubAppInstallationReadback>>;
}

export type ProductLoginMethodKey = "local-password" | "github" | "google" | "oidc";

export interface ProductLoginMethodStatus {
  key: ProductLoginMethodKey;
  configured: boolean;
  enabled: boolean;
  reason?: string;
}

export interface AuthBootstrapStatus {
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

export interface AuthBootstrapStatusReader {
  getStatus(context: RepositoryContext): Promise<Result<AuthBootstrapStatus>>;
}

export interface FirstAdminBootstrapRequest {
  displayName: string;
  email: string;
  organizationId?: string;
  organizationName: string;
  organizationSlug?: string;
  password: string;
}

export interface FirstAdminBootstrapRecord {
  email: string;
  organizationId: string;
  organizationSlug: string;
  userId: string;
}

export interface FirstAdminBootstrapper {
  bootstrapFirstAdmin(
    context: ExecutionContext,
    request: FirstAdminBootstrapRequest,
  ): Promise<Result<FirstAdminBootstrapRecord>>;
}

export interface FirstAdminPasswordMaterial {
  password: string;
}

export interface FirstAdminPasswordIssuer {
  issue(context: ExecutionContext): Promise<Result<FirstAdminPasswordMaterial>>;
}

export interface GitHubRepositorySummary {
  id: string;
  name: string;
  fullName: string;
  ownerLogin: string;
  description?: string;
  private: boolean;
  defaultBranch: string;
  htmlUrl: string;
  cloneUrl: string;
  updatedAt: string;
}

export interface GitHubRepositoryBrowser {
  listRepositories(
    context: ExecutionContext,
    input: {
      accessToken: string;
      accessTokenKind?: "installation" | "user";
      search?: string;
    },
  ): Promise<GitHubRepositorySummary[]>;
}

export interface PluginSummary {
  name: string;
  displayName?: string;
  description?: string;
  version: string;
  kind: "user-extension" | "system-extension";
  capabilities: string[];
  capabilityDetails?: {
    key: string;
    title: string;
    enabled: boolean;
    description?: string;
  }[];
  compatible: boolean;
  configuration?: {
    status: "configured" | "not-configured" | "partial" | "unknown";
    diagnostics: {
      code: string;
      severity: "info" | "warning" | "error";
      message: string;
      documentationHref?: string;
    }[];
  };
}

export interface PluginRegistry {
  list(): PluginSummary[];
  findByName(name: string): PluginSummary | null;
}

export interface DiagnosticsStatus {
  status: "ready" | "degraded";
  checks: {
    database: boolean;
    migrations: boolean;
  };
  details?: Record<string, string>;
}

export interface DiagnosticsPort {
  readiness(): Promise<DiagnosticsStatus>;
  migrationStatus(): Promise<{
    pending: string[];
    executed: string[];
  }>;
  migrate(): Promise<{
    executed: string[];
  }>;
}

export type InstanceUpgradeCheckStatus = "available" | "current" | "unknown";

export interface InstanceUpgradeCheckResult {
  schemaVersion: "system.instance-upgrade.check/v1";
  currentVersion: string;
  currentCommitSha?: string;
  targetVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  checkedAt: string;
  checkStatus: InstanceUpgradeCheckStatus;
  releaseNotesUrl?: string;
  upgradeCommand: string;
  applySupported: boolean;
  applyUnsupportedReason?: string;
}

export interface InstanceUpgradeApplyResult {
  schemaVersion: "system.instance-upgrade.apply/v1";
  targetVersion: string;
  startedAt: string;
  completedAt: string;
  exitCode: number;
  command: string[];
  stdoutTail: string;
  stderrTail: string;
}

export interface InstanceUpgradePort {
  check(input: { targetVersion?: string }): Promise<Result<InstanceUpgradeCheckResult>>;
  apply(input: {
    targetVersion?: string;
    confirm: boolean;
  }): Promise<Result<InstanceUpgradeApplyResult>>;
}
