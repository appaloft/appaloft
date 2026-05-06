import {
  type BuildStrategyKind,
  type Certificate,
  type CertificateIssueReason,
  type CertificateMutationSpec,
  type CertificatePolicy,
  type CertificateSelectionSpec,
  type CertificateSource,
  type CertificateStatus,
  type ConfigScope,
  type DependencyResourceBackup,
  type DependencyResourceBackupMutationSpec,
  type DependencyResourceBackupSelectionSpec,
  type Deployment,
  type DeploymentLogEntry,
  type DeploymentLogSource,
  type DeploymentMutationSpec,
  type DeploymentSelectionSpec,
  type DeploymentStatus,
  type DeploymentTargetState,
  type DeploymentTriggerKind,
  type Destination,
  type DestinationKind,
  type DestinationMutationSpec,
  type DestinationSelectionSpec,
  type DomainBinding,
  type DomainBindingMutationSpec,
  type DomainBindingSelectionSpec,
  type DomainBindingStatus,
  type DomainError,
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
  type LogLevel,
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
  type SshCredential,
  type SshCredentialMutationSpec,
  type SshCredentialSelectionSpec,
  type StorageVolume,
  type StorageVolumeKind,
  type StorageVolumeMutationSpec,
  type StorageVolumeSelectionSpec,
  type TargetKind,
  type TlsMode,
  type VariableExposure,
  type VariableKind,
} from "@appaloft/core";
import { type ExecutionContext, type RepositoryContext } from "./execution-context";
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
  source: DeploymentLogSource;
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

export interface DeploymentProgressObserver {
  subscribe(listener: DeploymentProgressListener): () => void;
}

export type DeploymentObservedEventSource =
  | "domain-event"
  | "process-observation"
  | "progress-projection";

export type DeploymentObservedEventType =
  | "deployment-requested"
  | "build-requested"
  | "deployment-started"
  | "deployment-succeeded"
  | "deployment-failed"
  | "deployment-progress";

export type DeploymentEventStreamPhase = "event-replay" | "live-follow";

export interface DeploymentObservedEvent {
  deploymentId: string;
  sequence: number;
  cursor: string;
  emittedAt: string;
  source: DeploymentObservedEventSource;
  eventType: DeploymentObservedEventType;
  phase?: DeploymentProgressPhase;
  status?: string;
  retriable?: boolean;
  summary?: string;
}

export interface DeploymentEventStreamGap {
  code: string;
  phase: DeploymentEventStreamPhase;
  retriable: boolean;
  cursor?: string;
  lastSequence?: number;
  recommendedAction?: "restart-stream" | "open-deployment-detail";
}

export type DeploymentEventStreamEnvelope =
  | {
      schemaVersion: "deployments.stream-events/v1";
      kind: "event";
      event: DeploymentObservedEvent;
    }
  | {
      schemaVersion: "deployments.stream-events/v1";
      kind: "heartbeat";
      at: string;
      cursor?: string;
    }
  | {
      schemaVersion: "deployments.stream-events/v1";
      kind: "gap";
      gap: DeploymentEventStreamGap;
    }
  | {
      schemaVersion: "deployments.stream-events/v1";
      kind: "closed";
      reason: "completed" | "cancelled" | "source-ended" | "idle-timeout";
      cursor?: string;
    }
  | {
      schemaVersion: "deployments.stream-events/v1";
      kind: "error";
      error: DomainError;
    };

export interface DeploymentEventObservationRequest {
  cursor?: string;
  historyLimit: number;
  includeHistory: boolean;
  follow: boolean;
  untilTerminal: boolean;
}

export interface DeploymentEventObservationContext {
  deployment: DeploymentSummary;
}

export interface DeploymentEventStream extends AsyncIterable<DeploymentEventStreamEnvelope> {
  close(): Promise<void>;
}

export interface DeploymentEventObserver {
  open(
    context: ExecutionContext,
    observationContext: DeploymentEventObservationContext,
    request: DeploymentEventObservationRequest,
    signal: AbortSignal,
  ): Promise<Result<DeploymentEventStream>>;
}

export interface SourceLinkTarget {
  projectId: string;
  environmentId: string;
  resourceId: string;
  serverId?: string;
  destinationId?: string;
}

export interface SourceLinkRecord extends SourceLinkTarget {
  sourceFingerprint: string;
  updatedAt: string;
  reason?: string;
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

export interface ProjectRepository {
  findOne(context: RepositoryContext, spec: ProjectSelectionSpec): Promise<Project | null>;
  upsert(context: RepositoryContext, project: Project, spec: ProjectMutationSpec): Promise<void>;
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
  | "deployment-history"
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
  name: string;
  slug: string;
  description?: string;
  lifecycleStatus: "active" | "archived";
  archivedAt?: string;
  archiveReason?: string;
  createdAt: string;
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
  | "unsupported-provider";

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
  safeReclaimableEstimate: RuntimeTargetSafeReclaimableEstimate;
  warnings: RuntimeTargetCapacityWarning[];
  partial: boolean;
}

export interface RuntimeTargetCapacityInspector {
  inspect(
    context: ExecutionContext,
    input: {
      server: DeploymentTargetState;
    },
  ): Promise<Result<RuntimeTargetCapacityInspection>>;
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
  networkProfile?: {
    internalPort: number;
    upstreamProtocol: ResourceNetworkProtocol;
    exposureMode: ResourceExposureMode;
    targetServiceName?: string;
    hostPort?: number;
  };
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
  serverId: string;
  destinationId: string;
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

export type DependencyResourceKind = "postgres" | "redis";
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
  kind: "postgres";
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
  kind: "postgres";
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
    status: "deferred";
    reason: string;
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
  logs: ScheduledTaskRunLogEntry[];
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
  serverId: string;
  destinationId: string;
  lastError?: {
    timestamp: string;
    phase: DeploymentLogSummary["phase"];
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
  kind?: "durable-domain" | "server-applied-domain" | "generated-latest" | "generated-planned";
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
  | "adapter-unsupported";

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
  serverId: string;
  destinationId: string;
  reason?: string;
  idempotencyKey?: string;
}

export interface ResourceRuntimeControlTargetRequest {
  runtimeControlAttemptId: string;
  operation: ResourceRuntimeControlOperation;
  resourceId: string;
  deploymentId: string;
  serverId: string;
  destinationId: string;
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

export interface DeploymentLogSummary {
  timestamp: string;
  source: DeploymentLogSource;
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
  | "deployment-logs"
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
}

export interface ResourceDiagnosticDeployment {
  id: string;
  status: DeploymentStatus;
  lifecyclePhase: DeploymentStatus;
  runtimePlanId: string;
  sourceKind: SourceKind;
  sourceDisplayName: string;
  serverId: string;
  destinationId: string;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  logCount: number;
  lastError?: {
    timestamp: string;
    phase: DeploymentLogSummary["phase"];
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
  source?: DeploymentLogSource;
  phase?: DeploymentLogSummary["phase"];
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
  deploymentLogs: ResourceDiagnosticLogSection;
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

export interface DeploymentSummary {
  id: string;
  projectId: string;
  environmentId: string;
  resourceId: string;
  serverId: string;
  destinationId: string;
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
  logs: DeploymentLogSummary[];
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  rollbackOfDeploymentId?: string;
  logCount: number;
}

export type DeploymentDetailSummary = Omit<DeploymentSummary, "logs">;

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
  | "buildpack-preview-limited";

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
  logCount: number;
}

export interface DeploymentAttemptSnapshot {
  runtimePlan: DeploymentDetailSummary["runtimePlan"];
  environmentSnapshot: DeploymentDetailSummary["environmentSnapshot"];
  dependencyBindings?: DeploymentDependencyBindingSnapshotSummary;
}

export interface DeploymentAttemptFailureSummary {
  timestamp: string;
  source: DeploymentLogSource;
  phase: DeploymentLogSummary["phase"];
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
  server: DeploymentRelatedServerContext;
  destination: DeploymentRelatedDestinationContext;
}

export type DeploymentAttemptNextAction =
  | "logs"
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
    | "deployments.stream-events"
    | "deployments.logs"
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

export interface OperatorWorkList {
  schemaVersion: "operator-work.list/v1";
  items: OperatorWorkItem[];
  generatedAt: string;
}

export interface OperatorWorkDetail {
  schemaVersion: "operator-work.show/v1";
  item: OperatorWorkItem;
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
  resourceId?: string;
  serverId?: string;
  deploymentId?: string;
  limit?: number;
}

export interface ProcessAttemptRecorder {
  record(
    context: RepositoryContext,
    attempt: ProcessAttemptRecord,
  ): Promise<Result<ProcessAttemptRecord>>;
}

export interface ProcessAttemptReadModel {
  list(
    context: RepositoryContext,
    filter?: ProcessAttemptListFilter,
  ): Promise<ProcessAttemptRecord[]>;
  findOne(context: RepositoryContext, id: string): Promise<ProcessAttemptRecord | null>;
}

export type StreamDeploymentEventsResult =
  | {
      mode: "bounded";
      deploymentId: string;
      envelopes: DeploymentEventStreamEnvelope[];
    }
  | {
      mode: "stream";
      deploymentId: string;
      stream: DeploymentEventStream;
    };

export interface DomainBindingSummary {
  id: string;
  projectId: string;
  environmentId: string;
  resourceId: string;
  serverId: string;
  destinationId: string;
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

export interface IngestSourceEventResult {
  sourceEventId: string;
  status: SourceEventStatus;
  matchedResourceIds: string[];
  createdDeploymentIds: string[];
  ignoredReasons: SourceEventIgnoredReason[];
  dedupeOfSourceEventId?: string;
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
  providerFeedbackId?: string;
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

export interface SourceEventPolicyCandidate {
  projectId: string;
  environmentId: string;
  resourceId: string;
  serverId?: string;
  destinationId?: string;
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
  list(context: RepositoryContext): Promise<ProjectSummary[]>;
  findOne(context: RepositoryContext, spec: ProjectSelectionSpec): Promise<ProjectSummary | null>;
}

export interface ServerReadModel {
  list(context: RepositoryContext): Promise<ServerSummary[]>;
  findOne(context: RepositoryContext, spec: ServerSelectionSpec): Promise<ServerSummary | null>;
}

export interface SshCredentialReadModel {
  list(context: RepositoryContext): Promise<SshCredentialSummary[]>;
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
  list(context: RepositoryContext, projectId?: string): Promise<EnvironmentSummary[]>;
  findOne(
    context: RepositoryContext,
    spec: EnvironmentSelectionSpec,
  ): Promise<EnvironmentSummary | null>;
}

export interface ResourceReadModel {
  list(
    context: RepositoryContext,
    input?: {
      projectId?: string;
      environmentId?: string;
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

export interface DependencyResourceReadModel {
  list(
    context: RepositoryContext,
    input?: {
      projectId?: string;
      environmentId?: string;
      kind?: DependencyResourceKind;
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
  realizedAt: string;
}

export interface ManagedPostgresDeleteInput {
  dependencyResourceId: string;
  providerKey: string;
  providerResourceHandle: string;
  attemptId: string;
  requestedAt: string;
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

export interface DependencyResourceBackupProviderInput {
  backupId: string;
  dependencyResourceId: string;
  dependencyKind: DependencyResourceKind;
  providerKey: string;
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
  restoreAttemptId: string;
  requestedAt: string;
}

export interface DependencyResourceRestoreProviderResult {
  completedAt: string;
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

export interface DeploymentReadModel {
  list(
    context: RepositoryContext,
    input?: {
      projectId?: string;
      resourceId?: string;
    },
  ): Promise<DeploymentSummary[]>;
  findOne(
    context: RepositoryContext,
    spec: DeploymentSelectionSpec,
  ): Promise<DeploymentSummary | null>;
  findLogs(context: RepositoryContext, id: string): Promise<DeploymentLogSummary[]>;
}

export interface DomainBindingReadModel {
  list(
    context: RepositoryContext,
    input?: {
      projectId?: string;
      environmentId?: string;
      resourceId?: string;
    },
  ): Promise<DomainBindingSummary[]>;
}

export interface CertificateReadModel {
  list(
    context: RepositoryContext,
    input?: {
      domainBindingId?: string;
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
  port?: number;
  healthCheckPath?: string;
  healthCheck?: RequestedDeploymentHealthCheck;
  exposureMode?: ResourceExposureMode;
  upstreamProtocol?: ResourceNetworkProtocol;
  accessContext?: RequestedDeploymentAccessContext;
  runtimeMetadata?: Record<string, string>;
  accessRouteMetadata?: Record<string, string>;
  proxyKind?: EdgeProxyKind;
  domains?: string[];
  pathPrefix?: string;
  tlsMode?: TlsMode;
  accessRoutes?: RequestedAccessRouteConfig[];
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
  services?: Array<{
    name: string;
    kind: ResourceServiceKind;
  }>;
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

export interface DeploymentConfigSnapshot {
  configFilePath?: string;
  project?: DeploymentConfiguredProject;
  environment?: DeploymentConfiguredEnvironment;
  resource?: DeploymentConfiguredResource;
  targets?: DeploymentConfiguredTarget[];
  deployment?: Partial<RequestedDeploymentConfig> & {
    targetKey?: string;
  };
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
  ): Promise<Result<{ logs: DeploymentLogEntry[] }>>;
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
}

export interface IntegrationDescriptor {
  key: string;
  title: string;
  capabilities: string[];
}

export interface ProviderRegistry {
  list(): ProviderDescriptor[];
  findByKey(key: string): ProviderDescriptor | null;
}

export interface IntegrationRegistry {
  list(): IntegrationDescriptor[];
  findByKey(key: string): IntegrationDescriptor | null;
}

export interface IntegrationAuthPort {
  getProviderAccessToken(context: ExecutionContext, providerKey: "github"): Promise<string | null>;
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
  compatible: boolean;
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
