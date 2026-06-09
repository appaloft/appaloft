import { AggregateRoot } from "../shared/entity";
import { domainError } from "../shared/errors";
import {
  type EnvironmentId,
  type ProjectId,
  type ResourceId,
  type StorageVolumeId,
} from "../shared/identifiers";
import { err, ok, type Result } from "../shared/result";
import { type CreatedAt, type OccurredAt } from "../shared/temporal";
import { type DescriptionText } from "../shared/text-values";
import { ScalarValueObject } from "../shared/value-object";
import { type StorageVolumeKindValue } from "./storage-volume";

export type StorageVolumeBackupStatus = "pending" | "ready" | "failed" | "pruned";
export type StorageVolumeRestoreAttemptStatus = "pending" | "completed" | "failed";
export type StorageVolumeBackupRetentionStatus = "retained" | "none" | "pruned";
export type StorageVolumeBackupConsistencyLevel =
  | "crash-consistent"
  | "quiesced"
  | "application-consistent"
  | "provider-snapshot-consistent";
export type StorageVolumeBackupDataFormat =
  | "sqlite"
  | "json-files"
  | "filesystem"
  | "application-export"
  | "unknown";
export type StorageVolumeBackupSourceAdapterKey =
  | "tar-volume"
  | "sqlite-online-backup"
  | "quiesce-and-copy"
  | "app-export"
  | "provider-snapshot"
  | "unsupported";
export type StorageVolumeBackupTargetProviderKey =
  | "local-filesystem"
  | "s3-compatible"
  | "webdav"
  | "restic-repository"
  | "provider-volume-snapshot";

function backupValidationError(
  message: string,
  details?: Record<string, string | number | boolean>,
) {
  return domainError.validation(message, {
    phase: "storage-volume-backup-validation",
    ...(details ?? {}),
  });
}

const storageVolumeBackupIdBrand: unique symbol = Symbol("StorageVolumeBackupId");
export class StorageVolumeBackupId extends ScalarValueObject<string> {
  private [storageVolumeBackupIdBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<StorageVolumeBackupId> {
    const normalized = value.trim();
    if (!normalized) {
      return err(backupValidationError("Storage volume backup id is required"));
    }
    return ok(new StorageVolumeBackupId(normalized));
  }

  static rehydrate(value: string): StorageVolumeBackupId {
    return new StorageVolumeBackupId(value.trim());
  }
}

const storageVolumeBackupAttemptIdBrand: unique symbol = Symbol("StorageVolumeBackupAttemptId");
export class StorageVolumeBackupAttemptId extends ScalarValueObject<string> {
  private [storageVolumeBackupAttemptIdBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<StorageVolumeBackupAttemptId> {
    const normalized = value.trim();
    if (!normalized) {
      return err(backupValidationError("Storage volume backup attempt id is required"));
    }
    return ok(new StorageVolumeBackupAttemptId(normalized));
  }

  static rehydrate(value: string): StorageVolumeBackupAttemptId {
    return new StorageVolumeBackupAttemptId(value.trim());
  }
}

const storageVolumeRestoreAttemptIdBrand: unique symbol = Symbol("StorageVolumeRestoreAttemptId");
export class StorageVolumeRestoreAttemptId extends ScalarValueObject<string> {
  private [storageVolumeRestoreAttemptIdBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<StorageVolumeRestoreAttemptId> {
    const normalized = value.trim();
    if (!normalized) {
      return err(backupValidationError("Storage volume restore attempt id is required"));
    }
    return ok(new StorageVolumeRestoreAttemptId(normalized));
  }

  static rehydrate(value: string): StorageVolumeRestoreAttemptId {
    return new StorageVolumeRestoreAttemptId(value.trim());
  }
}

const storageVolumeBackupStatusBrand: unique symbol = Symbol("StorageVolumeBackupStatusValue");
export class StorageVolumeBackupStatusValue extends ScalarValueObject<StorageVolumeBackupStatus> {
  private [storageVolumeBackupStatusBrand]!: void;

  private constructor(value: StorageVolumeBackupStatus) {
    super(value);
  }

  static pending(): StorageVolumeBackupStatusValue {
    return new StorageVolumeBackupStatusValue("pending");
  }

  static ready(): StorageVolumeBackupStatusValue {
    return new StorageVolumeBackupStatusValue("ready");
  }

  static failed(): StorageVolumeBackupStatusValue {
    return new StorageVolumeBackupStatusValue("failed");
  }

  static pruned(): StorageVolumeBackupStatusValue {
    return new StorageVolumeBackupStatusValue("pruned");
  }

  static rehydrate(value: StorageVolumeBackupStatus): StorageVolumeBackupStatusValue {
    return new StorageVolumeBackupStatusValue(value);
  }
}

const storageVolumeBackupRetentionStatusBrand: unique symbol = Symbol(
  "StorageVolumeBackupRetentionStatusValue",
);
export class StorageVolumeBackupRetentionStatusValue extends ScalarValueObject<StorageVolumeBackupRetentionStatus> {
  private [storageVolumeBackupRetentionStatusBrand]!: void;

  private constructor(value: StorageVolumeBackupRetentionStatus) {
    super(value);
  }

  static retained(): StorageVolumeBackupRetentionStatusValue {
    return new StorageVolumeBackupRetentionStatusValue("retained");
  }

  static none(): StorageVolumeBackupRetentionStatusValue {
    return new StorageVolumeBackupRetentionStatusValue("none");
  }

  static pruned(): StorageVolumeBackupRetentionStatusValue {
    return new StorageVolumeBackupRetentionStatusValue("pruned");
  }

  static rehydrate(
    value: StorageVolumeBackupRetentionStatus,
  ): StorageVolumeBackupRetentionStatusValue {
    return new StorageVolumeBackupRetentionStatusValue(value);
  }

  blocksDelete(): boolean {
    return this.value === "retained";
  }
}

const storageVolumeRestoreAttemptStatusBrand: unique symbol = Symbol(
  "StorageVolumeRestoreAttemptStatusValue",
);
export class StorageVolumeRestoreAttemptStatusValue extends ScalarValueObject<StorageVolumeRestoreAttemptStatus> {
  private [storageVolumeRestoreAttemptStatusBrand]!: void;

  private constructor(value: StorageVolumeRestoreAttemptStatus) {
    super(value);
  }

  static pending(): StorageVolumeRestoreAttemptStatusValue {
    return new StorageVolumeRestoreAttemptStatusValue("pending");
  }

  static completed(): StorageVolumeRestoreAttemptStatusValue {
    return new StorageVolumeRestoreAttemptStatusValue("completed");
  }

  static failed(): StorageVolumeRestoreAttemptStatusValue {
    return new StorageVolumeRestoreAttemptStatusValue("failed");
  }

  static rehydrate(
    value: StorageVolumeRestoreAttemptStatus,
  ): StorageVolumeRestoreAttemptStatusValue {
    return new StorageVolumeRestoreAttemptStatusValue(value);
  }

  isPending(): boolean {
    return this.value === "pending";
  }
}

const storageVolumeBackupArtifactHandleBrand: unique symbol = Symbol(
  "StorageVolumeBackupArtifactHandle",
);
export class StorageVolumeBackupArtifactHandle extends ScalarValueObject<string> {
  private [storageVolumeBackupArtifactHandleBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<StorageVolumeBackupArtifactHandle> {
    const normalized = value.trim();
    if (!normalized) {
      return err(backupValidationError("Storage backup artifact handle is required"));
    }
    if (/\s/.test(normalized)) {
      return err(
        backupValidationError("Storage backup artifact handle must be a single token", {
          field: "artifactHandle",
        }),
      );
    }
    return ok(new StorageVolumeBackupArtifactHandle(normalized));
  }

  static rehydrate(value: string): StorageVolumeBackupArtifactHandle {
    return new StorageVolumeBackupArtifactHandle(value.trim());
  }
}

const storageVolumeBackupFailureCodeBrand: unique symbol = Symbol("StorageVolumeBackupFailureCode");
export class StorageVolumeBackupFailureCode extends ScalarValueObject<string> {
  private [storageVolumeBackupFailureCodeBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<StorageVolumeBackupFailureCode> {
    const normalized = value.trim();
    if (!normalized) {
      return err(backupValidationError("Storage backup failure code is required"));
    }
    if (!/^[a-z0-9_.-]+$/i.test(normalized)) {
      return err(
        backupValidationError("Storage backup failure code contains unsupported characters"),
      );
    }
    return ok(new StorageVolumeBackupFailureCode(normalized));
  }

  static rehydrate(value: string): StorageVolumeBackupFailureCode {
    return new StorageVolumeBackupFailureCode(value.trim());
  }
}

const storageVolumeBackupSourceAdapterBrand: unique symbol = Symbol(
  "StorageVolumeBackupSourceAdapterKeyValue",
);
export class StorageVolumeBackupSourceAdapterKeyValue extends ScalarValueObject<StorageVolumeBackupSourceAdapterKey> {
  private [storageVolumeBackupSourceAdapterBrand]!: void;

  private constructor(value: StorageVolumeBackupSourceAdapterKey) {
    super(value);
  }

  static create(value: string): Result<StorageVolumeBackupSourceAdapterKeyValue> {
    if (
      value === "tar-volume" ||
      value === "sqlite-online-backup" ||
      value === "quiesce-and-copy" ||
      value === "app-export" ||
      value === "provider-snapshot" ||
      value === "unsupported"
    ) {
      return ok(new StorageVolumeBackupSourceAdapterKeyValue(value));
    }
    return err(backupValidationError("Storage backup source adapter is unsupported"));
  }

  static rehydrate(
    value: StorageVolumeBackupSourceAdapterKey,
  ): StorageVolumeBackupSourceAdapterKeyValue {
    return new StorageVolumeBackupSourceAdapterKeyValue(value);
  }
}

const storageVolumeBackupTargetProviderBrand: unique symbol = Symbol(
  "StorageVolumeBackupTargetProviderKeyValue",
);
export class StorageVolumeBackupTargetProviderKeyValue extends ScalarValueObject<StorageVolumeBackupTargetProviderKey> {
  private [storageVolumeBackupTargetProviderBrand]!: void;

  private constructor(value: StorageVolumeBackupTargetProviderKey) {
    super(value);
  }

  static create(value: string): Result<StorageVolumeBackupTargetProviderKeyValue> {
    if (
      value === "local-filesystem" ||
      value === "s3-compatible" ||
      value === "webdav" ||
      value === "restic-repository" ||
      value === "provider-volume-snapshot"
    ) {
      return ok(new StorageVolumeBackupTargetProviderKeyValue(value));
    }
    return err(backupValidationError("Storage backup target provider is unsupported"));
  }

  static rehydrate(
    value: StorageVolumeBackupTargetProviderKey,
  ): StorageVolumeBackupTargetProviderKeyValue {
    return new StorageVolumeBackupTargetProviderKeyValue(value);
  }
}

const storageVolumeBackupConsistencyBrand: unique symbol = Symbol(
  "StorageVolumeBackupConsistencyLevelValue",
);
export class StorageVolumeBackupConsistencyLevelValue extends ScalarValueObject<StorageVolumeBackupConsistencyLevel> {
  private [storageVolumeBackupConsistencyBrand]!: void;

  private constructor(value: StorageVolumeBackupConsistencyLevel) {
    super(value);
  }

  static create(value: string): Result<StorageVolumeBackupConsistencyLevelValue> {
    if (
      value === "crash-consistent" ||
      value === "quiesced" ||
      value === "application-consistent" ||
      value === "provider-snapshot-consistent"
    ) {
      return ok(new StorageVolumeBackupConsistencyLevelValue(value));
    }
    return err(backupValidationError("Storage backup consistency level is unsupported"));
  }

  static rehydrate(
    value: StorageVolumeBackupConsistencyLevel,
  ): StorageVolumeBackupConsistencyLevelValue {
    return new StorageVolumeBackupConsistencyLevelValue(value);
  }
}

export interface StorageVolumeBackupRestoreTargetState {
  storageVolumeId: StorageVolumeId;
  restoredVolumeId?: StorageVolumeId;
  destructiveInPlace: boolean;
}

export interface StorageVolumeRestoreAttemptState {
  attemptId: StorageVolumeRestoreAttemptId;
  status: StorageVolumeRestoreAttemptStatusValue;
  requestedAt: OccurredAt;
  target: StorageVolumeBackupRestoreTargetState;
  completedAt?: OccurredAt;
  failedAt?: OccurredAt;
  failureCode?: StorageVolumeBackupFailureCode;
  failureMessage?: DescriptionText;
}

export interface StorageVolumeBackupState {
  id: StorageVolumeBackupId;
  storageVolumeId: StorageVolumeId;
  projectId: ProjectId;
  environmentId: EnvironmentId;
  resourceId?: ResourceId;
  storageVolumeKind: StorageVolumeKindValue;
  sourceAdapterKey: StorageVolumeBackupSourceAdapterKeyValue;
  targetProviderKey: StorageVolumeBackupTargetProviderKeyValue;
  targetRef: DescriptionText;
  consistency: StorageVolumeBackupConsistencyLevelValue;
  status: StorageVolumeBackupStatusValue;
  attemptId: StorageVolumeBackupAttemptId;
  requestedAt: OccurredAt;
  retentionStatus: StorageVolumeBackupRetentionStatusValue;
  localOnly: boolean;
  artifactHandle?: StorageVolumeBackupArtifactHandle;
  sizeBytes?: number;
  checksum?: DescriptionText;
  completedAt?: OccurredAt;
  failedAt?: OccurredAt;
  failureCode?: StorageVolumeBackupFailureCode;
  failureMessage?: DescriptionText;
  latestRestoreAttempt?: StorageVolumeRestoreAttemptState;
  createdAt: CreatedAt;
}

export class StorageVolumeBackup extends AggregateRoot<StorageVolumeBackupState> {
  private constructor(state: StorageVolumeBackupState) {
    super(state);
  }

  static createPending(input: {
    id: StorageVolumeBackupId;
    storageVolumeId: StorageVolumeId;
    projectId: ProjectId;
    environmentId: EnvironmentId;
    resourceId?: ResourceId;
    storageVolumeKind: StorageVolumeKindValue;
    sourceAdapterKey: StorageVolumeBackupSourceAdapterKeyValue;
    targetProviderKey: StorageVolumeBackupTargetProviderKeyValue;
    targetRef: DescriptionText;
    consistency: StorageVolumeBackupConsistencyLevelValue;
    attemptId: StorageVolumeBackupAttemptId;
    requestedAt: OccurredAt;
    localOnly: boolean;
    createdAt: CreatedAt;
  }): Result<StorageVolumeBackup> {
    const backup = new StorageVolumeBackup({
      id: input.id,
      storageVolumeId: input.storageVolumeId,
      projectId: input.projectId,
      environmentId: input.environmentId,
      ...(input.resourceId ? { resourceId: input.resourceId } : {}),
      storageVolumeKind: input.storageVolumeKind,
      sourceAdapterKey: input.sourceAdapterKey,
      targetProviderKey: input.targetProviderKey,
      targetRef: input.targetRef,
      consistency: input.consistency,
      status: StorageVolumeBackupStatusValue.pending(),
      attemptId: input.attemptId,
      requestedAt: input.requestedAt,
      retentionStatus: StorageVolumeBackupRetentionStatusValue.none(),
      localOnly: input.localOnly,
      createdAt: input.createdAt,
    });
    backup.recordDomainEvent("storage-volume-backup-requested", input.requestedAt, {
      backupId: input.id.value,
      storageVolumeId: input.storageVolumeId.value,
      projectId: input.projectId.value,
      environmentId: input.environmentId.value,
      sourceAdapterKey: input.sourceAdapterKey.value,
      targetProviderKey: input.targetProviderKey.value,
      attemptId: input.attemptId.value,
      localOnly: input.localOnly,
    });
    return ok(backup);
  }

  static rehydrate(state: StorageVolumeBackupState): StorageVolumeBackup {
    return new StorageVolumeBackup({
      ...state,
      ...(state.resourceId ? { resourceId: state.resourceId } : {}),
      ...(state.artifactHandle ? { artifactHandle: state.artifactHandle } : {}),
      ...(state.sizeBytes !== undefined ? { sizeBytes: state.sizeBytes } : {}),
      ...(state.checksum ? { checksum: state.checksum } : {}),
      ...(state.completedAt ? { completedAt: state.completedAt } : {}),
      ...(state.failedAt ? { failedAt: state.failedAt } : {}),
      ...(state.failureCode ? { failureCode: state.failureCode } : {}),
      ...(state.failureMessage ? { failureMessage: state.failureMessage } : {}),
      ...(state.latestRestoreAttempt
        ? { latestRestoreAttempt: cloneRestoreAttempt(state.latestRestoreAttempt) }
        : {}),
    });
  }

  markReady(input: {
    artifactHandle: StorageVolumeBackupArtifactHandle;
    completedAt: OccurredAt;
    retentionStatus?: StorageVolumeBackupRetentionStatusValue;
    sizeBytes?: number;
    checksum?: DescriptionText;
  }): Result<void> {
    if (this.state.status.value !== "pending") {
      return err(
        domainError.conflict("storage_volume_backup_not_pending", {
          phase: "storage-volume-backup",
          backupId: this.state.id.value,
          currentStatus: this.state.status.value,
        }),
      );
    }
    this.state.status = StorageVolumeBackupStatusValue.ready();
    this.state.artifactHandle = input.artifactHandle;
    this.state.completedAt = input.completedAt;
    this.state.retentionStatus =
      input.retentionStatus ?? StorageVolumeBackupRetentionStatusValue.retained();
    if (input.sizeBytes !== undefined) {
      this.state.sizeBytes = input.sizeBytes;
    }
    if (input.checksum) {
      this.state.checksum = input.checksum;
    }
    this.recordDomainEvent("storage-volume-backup-completed", input.completedAt, {
      backupId: this.state.id.value,
      storageVolumeId: this.state.storageVolumeId.value,
      sourceAdapterKey: this.state.sourceAdapterKey.value,
      targetProviderKey: this.state.targetProviderKey.value,
      artifactHandle: input.artifactHandle.value,
    });
    return ok(undefined);
  }

  markFailed(input: {
    failureCode: StorageVolumeBackupFailureCode;
    failedAt: OccurredAt;
    failureMessage?: DescriptionText;
  }): Result<void> {
    if (this.state.status.value !== "pending") {
      return err(
        domainError.conflict("storage_volume_backup_not_pending", {
          phase: "storage-volume-backup",
          backupId: this.state.id.value,
          currentStatus: this.state.status.value,
        }),
      );
    }
    this.state.status = StorageVolumeBackupStatusValue.failed();
    this.state.failedAt = input.failedAt;
    this.state.failureCode = input.failureCode;
    if (input.failureMessage) {
      this.state.failureMessage = input.failureMessage;
    }
    this.recordDomainEvent("storage-volume-backup-failed", input.failedAt, {
      backupId: this.state.id.value,
      storageVolumeId: this.state.storageVolumeId.value,
      targetProviderKey: this.state.targetProviderKey.value,
      failureCode: input.failureCode.value,
    });
    return ok(undefined);
  }

  startRestore(input: {
    attemptId: StorageVolumeRestoreAttemptId;
    requestedAt: OccurredAt;
    target: StorageVolumeBackupRestoreTargetState;
  }): Result<void> {
    if (this.state.status.value !== "ready" || !this.state.artifactHandle) {
      return err(
        domainError.conflict("storage_volume_backup_not_ready", {
          phase: "storage-volume-restore-admission",
          backupId: this.state.id.value,
          currentStatus: this.state.status.value,
        }),
      );
    }
    if (input.target.destructiveInPlace) {
      return err(
        domainError.conflict("storage_volume_restore_in_place_requires_acknowledgement", {
          phase: "storage-volume-restore-admission",
          backupId: this.state.id.value,
        }),
      );
    }
    if (this.state.latestRestoreAttempt?.status.isPending()) {
      return err(
        domainError.conflict("storage_volume_restore_already_pending", {
          phase: "storage-volume-restore-admission",
          backupId: this.state.id.value,
          restoreAttemptId: this.state.latestRestoreAttempt.attemptId.value,
        }),
      );
    }
    this.state.latestRestoreAttempt = {
      attemptId: input.attemptId,
      status: StorageVolumeRestoreAttemptStatusValue.pending(),
      requestedAt: input.requestedAt,
      target: cloneRestoreTarget(input.target),
    };
    this.recordDomainEvent("storage-volume-restore-requested", input.requestedAt, {
      backupId: this.state.id.value,
      restoreAttemptId: input.attemptId.value,
      sourceStorageVolumeId: this.state.storageVolumeId.value,
      targetStorageVolumeId: input.target.storageVolumeId.value,
      destructiveInPlace: input.target.destructiveInPlace,
    });
    return ok(undefined);
  }

  markRestoreCompleted(input: {
    attemptId: StorageVolumeRestoreAttemptId;
    completedAt: OccurredAt;
    restoredVolumeId: StorageVolumeId;
  }): Result<void> {
    if (!this.state.latestRestoreAttempt?.attemptId.equals(input.attemptId)) {
      return err(
        domainError.conflict("storage_volume_restore_attempt_mismatch", {
          phase: "storage-volume-restore",
          backupId: this.state.id.value,
          restoreAttemptId: input.attemptId.value,
        }),
      );
    }
    this.state.latestRestoreAttempt = {
      ...cloneRestoreAttempt(this.state.latestRestoreAttempt),
      status: StorageVolumeRestoreAttemptStatusValue.completed(),
      target: {
        ...cloneRestoreTarget(this.state.latestRestoreAttempt.target),
        restoredVolumeId: input.restoredVolumeId,
      },
      completedAt: input.completedAt,
    };
    this.recordDomainEvent("storage-volume-restore-completed", input.completedAt, {
      backupId: this.state.id.value,
      restoreAttemptId: input.attemptId.value,
      sourceStorageVolumeId: this.state.storageVolumeId.value,
      restoredVolumeId: input.restoredVolumeId.value,
    });
    return ok(undefined);
  }

  markRestoreFailed(input: {
    attemptId: StorageVolumeRestoreAttemptId;
    failureCode: StorageVolumeBackupFailureCode;
    failedAt: OccurredAt;
    failureMessage?: DescriptionText;
  }): Result<void> {
    if (!this.state.latestRestoreAttempt?.attemptId.equals(input.attemptId)) {
      return err(
        domainError.conflict("storage_volume_restore_attempt_mismatch", {
          phase: "storage-volume-restore",
          backupId: this.state.id.value,
          restoreAttemptId: input.attemptId.value,
        }),
      );
    }
    this.state.latestRestoreAttempt = {
      ...cloneRestoreAttempt(this.state.latestRestoreAttempt),
      status: StorageVolumeRestoreAttemptStatusValue.failed(),
      failedAt: input.failedAt,
      failureCode: input.failureCode,
      ...(input.failureMessage ? { failureMessage: input.failureMessage } : {}),
    };
    this.recordDomainEvent("storage-volume-restore-failed", input.failedAt, {
      backupId: this.state.id.value,
      restoreAttemptId: input.attemptId.value,
      sourceStorageVolumeId: this.state.storageVolumeId.value,
      failureCode: input.failureCode.value,
    });
    return ok(undefined);
  }

  prune(input: { prunedAt: OccurredAt }): Result<void> {
    if (this.state.status.value !== "ready" && this.state.status.value !== "failed") {
      return err(
        domainError.conflict("storage_volume_backup_prune_blocked", {
          phase: "storage-volume-backup-prune",
          backupId: this.state.id.value,
          currentStatus: this.state.status.value,
        }),
      );
    }
    if (this.state.latestRestoreAttempt?.status.isPending()) {
      return err(
        domainError.conflict("storage_volume_backup_prune_blocked", {
          phase: "storage-volume-backup-prune",
          backupId: this.state.id.value,
          restoreAttemptId: this.state.latestRestoreAttempt.attemptId.value,
        }),
      );
    }
    this.state.status = StorageVolumeBackupStatusValue.pruned();
    this.state.retentionStatus = StorageVolumeBackupRetentionStatusValue.pruned();
    this.recordDomainEvent("storage-volume-backup-pruned", input.prunedAt, {
      backupId: this.state.id.value,
      storageVolumeId: this.state.storageVolumeId.value,
      targetProviderKey: this.state.targetProviderKey.value,
    });
    return ok(undefined);
  }

  blocksStorageVolumeDelete(): boolean {
    return (
      this.state.status.value === "pending" ||
      this.state.retentionStatus.blocksDelete() ||
      this.state.latestRestoreAttempt?.status.isPending() === true
    );
  }

  toState(): StorageVolumeBackupState {
    return {
      ...this.state,
      ...(this.state.resourceId ? { resourceId: this.state.resourceId } : {}),
      ...(this.state.artifactHandle ? { artifactHandle: this.state.artifactHandle } : {}),
      ...(this.state.sizeBytes !== undefined ? { sizeBytes: this.state.sizeBytes } : {}),
      ...(this.state.checksum ? { checksum: this.state.checksum } : {}),
      ...(this.state.completedAt ? { completedAt: this.state.completedAt } : {}),
      ...(this.state.failedAt ? { failedAt: this.state.failedAt } : {}),
      ...(this.state.failureCode ? { failureCode: this.state.failureCode } : {}),
      ...(this.state.failureMessage ? { failureMessage: this.state.failureMessage } : {}),
      ...(this.state.latestRestoreAttempt
        ? { latestRestoreAttempt: cloneRestoreAttempt(this.state.latestRestoreAttempt) }
        : {}),
    };
  }
}

function cloneRestoreTarget(
  target: StorageVolumeBackupRestoreTargetState,
): StorageVolumeBackupRestoreTargetState {
  return {
    storageVolumeId: target.storageVolumeId,
    ...(target.restoredVolumeId ? { restoredVolumeId: target.restoredVolumeId } : {}),
    destructiveInPlace: target.destructiveInPlace,
  };
}

function cloneRestoreAttempt(
  attempt: StorageVolumeRestoreAttemptState,
): StorageVolumeRestoreAttemptState {
  return {
    attemptId: attempt.attemptId,
    status: attempt.status,
    requestedAt: attempt.requestedAt,
    target: cloneRestoreTarget(attempt.target),
    ...(attempt.completedAt ? { completedAt: attempt.completedAt } : {}),
    ...(attempt.failedAt ? { failedAt: attempt.failedAt } : {}),
    ...(attempt.failureCode ? { failureCode: attempt.failureCode } : {}),
    ...(attempt.failureMessage ? { failureMessage: attempt.failureMessage } : {}),
  };
}
