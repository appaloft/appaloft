import {
  type DeploymentTargetState,
  type DomainError,
  domainError,
  ok,
  type Result,
  type StorageVolumeBackupConsistencyLevel as StorageBackupConsistencyLevel,
  type StorageVolumeBackupSourceAdapterKey as StorageBackupSourceAdapterKey,
  type StorageVolumeBackupTargetProviderKey as StorageBackupTargetProviderKey,
  type StorageVolumeBackupDataFormat,
} from "@appaloft/core";

export type {
  StorageBackupConsistencyLevel,
  StorageBackupSourceAdapterKey,
  StorageBackupTargetProviderKey,
};

export interface StorageBackupSourceDescriptor {
  storageVolumeId: string;
  resourceId?: string | undefined;
  serverId?: string | undefined;
  attachmentId?: string | undefined;
  destinationPath?: string | undefined;
  dataFormat?: StorageVolumeBackupDataFormat | undefined;
  liveWrites?: boolean | undefined;
}

export interface StorageBackupTargetDescriptor {
  providerKey: StorageBackupTargetProviderKey;
  targetRef: string;
  failureDomain?: string | undefined;
  secretRef?: string | undefined;
}

export interface StorageBackupRetentionPolicy {
  maxCount: number;
  maxAgeDays?: number | undefined;
  maxBytes?: number | undefined;
  minFreeBytes?: number | undefined;
}

export interface StorageBackupPlanRequest {
  source: StorageBackupSourceDescriptor;
  requestedConsistency: StorageBackupConsistencyLevel;
  preferredSourceAdapter?: StorageBackupSourceAdapterKey | undefined;
  target: StorageBackupTargetDescriptor;
  retention: StorageBackupRetentionPolicy;
}

export interface StorageBackupPlanBlocker {
  code:
    | "source-adapter-unsupported"
    | "target-provider-unsupported"
    | "unsafe-live-sqlite-copy"
    | "local-target-guard-missing"
    | "retention-policy-invalid";
  message: string;
}

export interface StorageBackupPlan {
  schemaVersion: "storage-volumes.backup-plan/v1";
  storageVolumeId: string;
  sourceAdapterKey: StorageBackupSourceAdapterKey;
  targetProviderKey: StorageBackupTargetProviderKey;
  consistency: StorageBackupConsistencyLevel;
  localOnly: boolean;
  retention: StorageBackupRetentionPolicy;
  blockers: StorageBackupPlanBlocker[];
}

export interface StorageBackupSourceAdapterPort {
  key: StorageBackupSourceAdapterKey;
  supports(input: StorageBackupPlanRequest): boolean;
  createBackup?(
    input: StorageBackupExecutionRequest,
  ): Promise<Result<StorageBackupSourceResult, DomainError>>;
  restoreBackup?(
    input: StorageBackupRestoreRequest,
  ): Promise<Result<StorageBackupRestoreSourceResult, DomainError>>;
}

export interface StorageBackupTargetProviderPort {
  key: StorageBackupTargetProviderKey;
  localOnly(input: StorageBackupPlanRequest): boolean;
  supports(input: StorageBackupPlanRequest): boolean;
  store?(
    input: StorageBackupTargetStoreRequest,
  ): Promise<Result<StorageBackupTargetStoreResult, DomainError>>;
  restore?(
    input: StorageBackupTargetRestoreRequest,
  ): Promise<Result<StorageBackupTargetRestoreResult, DomainError>>;
  prune?(
    input: StorageBackupTargetPruneRequest,
  ): Promise<Result<{ prunedAt: string }, DomainError>>;
}

export interface StorageBackupExecutionRequest {
  backupId: string;
  attemptId: string;
  requestedAt: string;
  plan: StorageBackupPlan;
  source: StorageBackupSourceDescriptor;
  runtimeTarget?: DeploymentTargetState | undefined;
}

export interface StorageBackupSourceResult {
  sourceRef: string;
  manifest?: Record<string, string | number | boolean>;
}

export interface StorageBackupTargetStoreRequest {
  backupId: string;
  attemptId: string;
  requestedAt: string;
  plan: StorageBackupPlan;
  target: StorageBackupTargetDescriptor;
  sourceResult: StorageBackupSourceResult;
  runtimeTarget?: DeploymentTargetState | undefined;
}

export interface StorageBackupTargetStoreResult {
  artifactHandle: string;
  completedAt: string;
  retentionStatus: "retained" | "none";
  sizeBytes?: number;
  checksum?: string;
}

export interface StorageBackupObjectTransferAuthorization {
  url: string;
  headers?: Readonly<Record<string, string>>;
  expiresAt: string;
}

export interface StorageBackupObjectUploadAuthorization
  extends StorageBackupObjectTransferAuthorization {
  artifactHandle: string;
}

export interface StorageBackupObjectTransferBrokerPort {
  authorizeUpload(input: {
    backupId: string;
    target: StorageBackupTargetDescriptor;
    sourceManifest?: Readonly<Record<string, string | number | boolean>>;
  }): Promise<Result<StorageBackupObjectUploadAuthorization, DomainError>>;
  authorizeDownload(input: {
    backupId: string;
    artifactHandle: string;
  }): Promise<Result<StorageBackupObjectTransferAuthorization, DomainError>>;
  deleteObject(input: {
    backupId: string;
    artifactHandle: string;
    requestedAt: string;
  }): Promise<Result<{ deletedAt: string }, DomainError>>;
}

export interface StorageBackupRestoreRequest {
  backupId: string;
  restoreAttemptId: string;
  requestedAt: string;
  artifactHandle: string;
  targetStorageVolumeId: string;
  runtimeTarget?: DeploymentTargetState | undefined;
}

export interface StorageBackupRestoreSourceResult {
  restoredAt: string;
}

export interface StorageBackupTargetRestoreRequest {
  backupId: string;
  restoreAttemptId: string;
  requestedAt: string;
  artifactHandle: string;
  expectedChecksum?: string;
  targetStorageVolumeId: string;
  runtimeTarget?: DeploymentTargetState | undefined;
}

export interface StorageBackupTargetRestoreResult {
  restoredAt: string;
}

export interface StorageBackupTargetPruneRequest {
  backupId: string;
  artifactHandle?: string;
  requestedAt: string;
}

export interface StorageBackupProviderRegistryPort {
  sourceAdapters(): readonly StorageBackupSourceAdapterPort[];
  targetProviders(): readonly StorageBackupTargetProviderPort[];
}

export class UnsupportedStorageBackupProviderRegistry implements StorageBackupProviderRegistryPort {
  sourceAdapters(): readonly StorageBackupSourceAdapterPort[] {
    return [];
  }

  targetProviders(): readonly StorageBackupTargetProviderPort[] {
    return [];
  }
}

export function planStorageVolumeBackup(
  input: StorageBackupPlanRequest,
  ports: {
    readonly sourceAdapters: readonly StorageBackupSourceAdapterPort[];
    readonly targetProviders: readonly StorageBackupTargetProviderPort[];
  },
): Result<StorageBackupPlan, DomainError> {
  const sourceAdapter = selectSourceAdapter(input, ports.sourceAdapters);
  const targetProvider = ports.targetProviders.find(
    (provider) => provider.key === input.target.providerKey && provider.supports(input),
  );
  const blockers: StorageBackupPlanBlocker[] = [];

  if (!targetProvider) {
    blockers.push({
      code: "target-provider-unsupported",
      message: "Backup target provider is not available for this storage backup request.",
    });
  }

  if (!sourceAdapter) {
    blockers.push({
      code: unsafeLiveSqliteCopy(input) ? "unsafe-live-sqlite-copy" : "source-adapter-unsupported",
      message: unsafeLiveSqliteCopy(input)
        ? "Live SQLite data requires an application-consistent source adapter; unsafe file copy is blocked."
        : "No compatible storage backup source adapter is available.",
    });
  }

  if (input.target.providerKey === "local-filesystem" && !input.retention.minFreeBytes) {
    blockers.push({
      code: "local-target-guard-missing",
      message: "Local filesystem backup targets require a free-disk guard.",
    });
  }

  if (input.retention.maxCount < 1) {
    blockers.push({
      code: "retention-policy-invalid",
      message: "Storage backup retention must keep at least one restore point.",
    });
  }

  return ok({
    schemaVersion: "storage-volumes.backup-plan/v1",
    storageVolumeId: input.source.storageVolumeId,
    sourceAdapterKey: sourceAdapter?.key ?? "unsupported",
    targetProviderKey: input.target.providerKey,
    consistency: input.requestedConsistency,
    localOnly: targetProvider?.localOnly(input) ?? true,
    retention: input.retention,
    blockers,
  });
}

function selectSourceAdapter(
  input: StorageBackupPlanRequest,
  adapters: readonly StorageBackupSourceAdapterPort[],
): StorageBackupSourceAdapterPort | undefined {
  if (input.preferredSourceAdapter) {
    return adapters.find(
      (adapter) => adapter.key === input.preferredSourceAdapter && adapter.supports(input),
    );
  }
  return adapters.find((adapter) => adapter.supports(input));
}

function unsafeLiveSqliteCopy(input: StorageBackupPlanRequest): boolean {
  return (
    input.source.dataFormat === "sqlite" &&
    input.source.liveWrites === true &&
    input.requestedConsistency === "application-consistent"
  );
}

export const unsupportedStorageBackupSourceAdapter: StorageBackupSourceAdapterPort = {
  key: "unsupported",
  supports: () => false,
};

export function storageBackupUnsupportedError(plan: StorageBackupPlan): DomainError {
  return domainError.providerCapabilityUnsupported("Storage volume backup is not executable", {
    phase: "storage-volume-backup-plan",
    storageVolumeId: plan.storageVolumeId,
    blockerCodes: plan.blockers.map((blocker) => blocker.code).join(","),
    blockerCount: plan.blockers.length,
  });
}
