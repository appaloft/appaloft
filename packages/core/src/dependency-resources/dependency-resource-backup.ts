import { AggregateRoot } from "../shared/entity";
import { domainError } from "../shared/errors";
import { type EnvironmentId, type ProjectId, type ResourceInstanceId } from "../shared/identifiers";
import { err, ok, type Result } from "../shared/result";
import { type ResourceInstanceKindValue } from "../shared/state-machine";
import { type CreatedAt, type OccurredAt } from "../shared/temporal";
import { type DescriptionText, type ProviderKey } from "../shared/text-values";
import { ScalarValueObject } from "../shared/value-object";

export type DependencyResourceBackupStatus = "pending" | "ready" | "failed";
export type DependencyResourceRestoreAttemptStatus = "pending" | "completed" | "failed";
export type DependencyResourceBackupRetentionStatus = "retained" | "none";

function backupValidationError(
  message: string,
  details?: Record<string, string | number | boolean>,
) {
  return domainError.validation(message, {
    phase: "dependency-resource-backup-validation",
    ...(details ?? {}),
  });
}

const dependencyResourceBackupIdBrand: unique symbol = Symbol("DependencyResourceBackupId");
export class DependencyResourceBackupId extends ScalarValueObject<string> {
  private [dependencyResourceBackupIdBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<DependencyResourceBackupId> {
    const normalized = value.trim();
    if (!normalized) {
      return err(backupValidationError("Dependency resource backup id is required"));
    }
    return ok(new DependencyResourceBackupId(normalized));
  }

  static rehydrate(value: string): DependencyResourceBackupId {
    return new DependencyResourceBackupId(value.trim());
  }
}

const dependencyResourceBackupAttemptIdBrand: unique symbol = Symbol(
  "DependencyResourceBackupAttemptId",
);
export class DependencyResourceBackupAttemptId extends ScalarValueObject<string> {
  private [dependencyResourceBackupAttemptIdBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<DependencyResourceBackupAttemptId> {
    const normalized = value.trim();
    if (!normalized) {
      return err(backupValidationError("Dependency resource backup attempt id is required"));
    }
    return ok(new DependencyResourceBackupAttemptId(normalized));
  }

  static rehydrate(value: string): DependencyResourceBackupAttemptId {
    return new DependencyResourceBackupAttemptId(value.trim());
  }
}

const dependencyResourceRestoreAttemptIdBrand: unique symbol = Symbol(
  "DependencyResourceRestoreAttemptId",
);
export class DependencyResourceRestoreAttemptId extends ScalarValueObject<string> {
  private [dependencyResourceRestoreAttemptIdBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<DependencyResourceRestoreAttemptId> {
    const normalized = value.trim();
    if (!normalized) {
      return err(backupValidationError("Dependency resource restore attempt id is required"));
    }
    return ok(new DependencyResourceRestoreAttemptId(normalized));
  }

  static rehydrate(value: string): DependencyResourceRestoreAttemptId {
    return new DependencyResourceRestoreAttemptId(value.trim());
  }
}

const dependencyResourceBackupStatusBrand: unique symbol = Symbol(
  "DependencyResourceBackupStatusValue",
);
export class DependencyResourceBackupStatusValue extends ScalarValueObject<DependencyResourceBackupStatus> {
  private [dependencyResourceBackupStatusBrand]!: void;

  private constructor(value: DependencyResourceBackupStatus) {
    super(value);
  }

  static pending(): DependencyResourceBackupStatusValue {
    return new DependencyResourceBackupStatusValue("pending");
  }

  static ready(): DependencyResourceBackupStatusValue {
    return new DependencyResourceBackupStatusValue("ready");
  }

  static failed(): DependencyResourceBackupStatusValue {
    return new DependencyResourceBackupStatusValue("failed");
  }

  static rehydrate(value: DependencyResourceBackupStatus): DependencyResourceBackupStatusValue {
    return new DependencyResourceBackupStatusValue(value);
  }
}

const dependencyResourceBackupRetentionStatusBrand: unique symbol = Symbol(
  "DependencyResourceBackupRetentionStatusValue",
);
export class DependencyResourceBackupRetentionStatusValue extends ScalarValueObject<DependencyResourceBackupRetentionStatus> {
  private [dependencyResourceBackupRetentionStatusBrand]!: void;

  private constructor(value: DependencyResourceBackupRetentionStatus) {
    super(value);
  }

  static retained(): DependencyResourceBackupRetentionStatusValue {
    return new DependencyResourceBackupRetentionStatusValue("retained");
  }

  static none(): DependencyResourceBackupRetentionStatusValue {
    return new DependencyResourceBackupRetentionStatusValue("none");
  }

  static rehydrate(
    value: DependencyResourceBackupRetentionStatus,
  ): DependencyResourceBackupRetentionStatusValue {
    return new DependencyResourceBackupRetentionStatusValue(value);
  }

  blocksDelete(): boolean {
    return this.value === "retained";
  }
}

const dependencyResourceRestoreAttemptStatusBrand: unique symbol = Symbol(
  "DependencyResourceRestoreAttemptStatusValue",
);
export class DependencyResourceRestoreAttemptStatusValue extends ScalarValueObject<DependencyResourceRestoreAttemptStatus> {
  private [dependencyResourceRestoreAttemptStatusBrand]!: void;

  private constructor(value: DependencyResourceRestoreAttemptStatus) {
    super(value);
  }

  static pending(): DependencyResourceRestoreAttemptStatusValue {
    return new DependencyResourceRestoreAttemptStatusValue("pending");
  }

  static completed(): DependencyResourceRestoreAttemptStatusValue {
    return new DependencyResourceRestoreAttemptStatusValue("completed");
  }

  static failed(): DependencyResourceRestoreAttemptStatusValue {
    return new DependencyResourceRestoreAttemptStatusValue("failed");
  }

  static rehydrate(
    value: DependencyResourceRestoreAttemptStatus,
  ): DependencyResourceRestoreAttemptStatusValue {
    return new DependencyResourceRestoreAttemptStatusValue(value);
  }

  isPending(): boolean {
    return this.value === "pending";
  }
}

const dependencyResourceProviderArtifactHandleBrand: unique symbol = Symbol(
  "DependencyResourceProviderArtifactHandle",
);
export class DependencyResourceProviderArtifactHandle extends ScalarValueObject<string> {
  private [dependencyResourceProviderArtifactHandleBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<DependencyResourceProviderArtifactHandle> {
    const normalized = value.trim();
    if (!normalized) {
      return err(backupValidationError("Provider artifact handle is required"));
    }
    if (/\s/.test(normalized)) {
      return err(
        backupValidationError("Provider artifact handle must be a single token", {
          field: "providerArtifactHandle",
        }),
      );
    }
    return ok(new DependencyResourceProviderArtifactHandle(normalized));
  }

  static rehydrate(value: string): DependencyResourceProviderArtifactHandle {
    return new DependencyResourceProviderArtifactHandle(value.trim());
  }
}

const dependencyResourceBackupFailureCodeBrand: unique symbol = Symbol(
  "DependencyResourceBackupFailureCode",
);
export class DependencyResourceBackupFailureCode extends ScalarValueObject<string> {
  private [dependencyResourceBackupFailureCodeBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<DependencyResourceBackupFailureCode> {
    const normalized = value.trim();
    if (!normalized) {
      return err(backupValidationError("Backup failure code is required"));
    }
    if (!/^[a-z0-9_.-]+$/i.test(normalized)) {
      return err(backupValidationError("Backup failure code contains unsupported characters"));
    }
    return ok(new DependencyResourceBackupFailureCode(normalized));
  }

  static rehydrate(value: string): DependencyResourceBackupFailureCode {
    return new DependencyResourceBackupFailureCode(value.trim());
  }
}

export interface DependencyResourceRestoreAttemptState {
  attemptId: DependencyResourceRestoreAttemptId;
  status: DependencyResourceRestoreAttemptStatusValue;
  requestedAt: OccurredAt;
  completedAt?: OccurredAt;
  failedAt?: OccurredAt;
  failureCode?: DependencyResourceBackupFailureCode;
  failureMessage?: DescriptionText;
}

export interface DependencyResourceBackupState {
  id: DependencyResourceBackupId;
  dependencyResourceId: ResourceInstanceId;
  projectId: ProjectId;
  environmentId: EnvironmentId;
  dependencyKind: ResourceInstanceKindValue;
  providerKey: ProviderKey;
  status: DependencyResourceBackupStatusValue;
  attemptId: DependencyResourceBackupAttemptId;
  requestedAt: OccurredAt;
  retentionStatus: DependencyResourceBackupRetentionStatusValue;
  providerArtifactHandle?: DependencyResourceProviderArtifactHandle;
  completedAt?: OccurredAt;
  failedAt?: OccurredAt;
  failureCode?: DependencyResourceBackupFailureCode;
  failureMessage?: DescriptionText;
  latestRestoreAttempt?: DependencyResourceRestoreAttemptState;
  createdAt: CreatedAt;
}

export class DependencyResourceBackup extends AggregateRoot<DependencyResourceBackupState> {
  private constructor(state: DependencyResourceBackupState) {
    super(state);
  }

  static createPending(input: {
    id: DependencyResourceBackupId;
    dependencyResourceId: ResourceInstanceId;
    projectId: ProjectId;
    environmentId: EnvironmentId;
    dependencyKind: ResourceInstanceKindValue;
    providerKey: ProviderKey;
    attemptId: DependencyResourceBackupAttemptId;
    requestedAt: OccurredAt;
    createdAt: CreatedAt;
  }): Result<DependencyResourceBackup> {
    const backup = new DependencyResourceBackup({
      id: input.id,
      dependencyResourceId: input.dependencyResourceId,
      projectId: input.projectId,
      environmentId: input.environmentId,
      dependencyKind: input.dependencyKind,
      providerKey: input.providerKey,
      status: DependencyResourceBackupStatusValue.pending(),
      attemptId: input.attemptId,
      requestedAt: input.requestedAt,
      retentionStatus: DependencyResourceBackupRetentionStatusValue.none(),
      createdAt: input.createdAt,
    });
    backup.recordDomainEvent("dependency-resource-backup-requested", input.requestedAt, {
      backupId: input.id.value,
      dependencyResourceId: input.dependencyResourceId.value,
      projectId: input.projectId.value,
      environmentId: input.environmentId.value,
      dependencyKind: input.dependencyKind.value,
      providerKey: input.providerKey.value,
      attemptId: input.attemptId.value,
    });
    return ok(backup);
  }

  static rehydrate(state: DependencyResourceBackupState): DependencyResourceBackup {
    return new DependencyResourceBackup(state);
  }

  markReady(input: {
    providerArtifactHandle: DependencyResourceProviderArtifactHandle;
    completedAt: OccurredAt;
    retentionStatus?: DependencyResourceBackupRetentionStatusValue;
  }): Result<void> {
    if (this.state.status.value !== "pending") {
      return err(
        domainError.dependencyResourceBackupBlocked("Backup is not pending", {
          phase: "dependency-resource-backup",
          backupId: this.state.id.value,
          currentStatus: this.state.status.value,
        }),
      );
    }
    this.state.status = DependencyResourceBackupStatusValue.ready();
    this.state.providerArtifactHandle = input.providerArtifactHandle;
    this.state.completedAt = input.completedAt;
    this.state.retentionStatus =
      input.retentionStatus ?? DependencyResourceBackupRetentionStatusValue.retained();
    this.recordDomainEvent("dependency-resource-backup-completed", input.completedAt, {
      backupId: this.state.id.value,
      dependencyResourceId: this.state.dependencyResourceId.value,
      providerKey: this.state.providerKey.value,
      attemptId: this.state.attemptId.value,
      providerArtifactHandle: input.providerArtifactHandle.value,
    });
    return ok(undefined);
  }

  markFailed(input: {
    failureCode: DependencyResourceBackupFailureCode;
    failureMessage?: DescriptionText;
    failedAt: OccurredAt;
  }): Result<void> {
    if (this.state.status.value !== "pending") {
      return err(
        domainError.dependencyResourceBackupBlocked("Backup is not pending", {
          phase: "dependency-resource-backup",
          backupId: this.state.id.value,
          currentStatus: this.state.status.value,
        }),
      );
    }
    this.state.status = DependencyResourceBackupStatusValue.failed();
    this.state.failedAt = input.failedAt;
    this.state.failureCode = input.failureCode;
    if (input.failureMessage) {
      this.state.failureMessage = input.failureMessage;
    }
    this.recordDomainEvent("dependency-resource-backup-failed", input.failedAt, {
      backupId: this.state.id.value,
      dependencyResourceId: this.state.dependencyResourceId.value,
      providerKey: this.state.providerKey.value,
      attemptId: this.state.attemptId.value,
      failureCode: input.failureCode.value,
    });
    return ok(undefined);
  }

  startRestore(input: {
    attemptId: DependencyResourceRestoreAttemptId;
    requestedAt: OccurredAt;
  }): Result<void> {
    if (this.state.status.value !== "ready" || !this.state.providerArtifactHandle) {
      return err(
        domainError.dependencyResourceRestoreBlocked("Backup is not ready to restore", {
          phase: "dependency-resource-restore-admission",
          backupId: this.state.id.value,
          currentStatus: this.state.status.value,
        }),
      );
    }
    if (this.state.latestRestoreAttempt?.status.isPending()) {
      return err(
        domainError.dependencyResourceRestoreBlocked("Restore is already pending", {
          phase: "dependency-resource-restore-admission",
          backupId: this.state.id.value,
          restoreAttemptId: this.state.latestRestoreAttempt.attemptId.value,
        }),
      );
    }
    this.state.latestRestoreAttempt = {
      attemptId: input.attemptId,
      status: DependencyResourceRestoreAttemptStatusValue.pending(),
      requestedAt: input.requestedAt,
    };
    this.recordDomainEvent("dependency-resource-restore-requested", input.requestedAt, {
      backupId: this.state.id.value,
      restoreAttemptId: input.attemptId.value,
      dependencyResourceId: this.state.dependencyResourceId.value,
      providerKey: this.state.providerKey.value,
    });
    return ok(undefined);
  }

  markRestoreCompleted(input: {
    attemptId: DependencyResourceRestoreAttemptId;
    completedAt: OccurredAt;
  }): Result<void> {
    if (!this.state.latestRestoreAttempt?.attemptId.equals(input.attemptId)) {
      return err(
        domainError.dependencyResourceRestoreBlocked("Restore attempt does not match", {
          phase: "dependency-resource-restore",
          backupId: this.state.id.value,
          restoreAttemptId: input.attemptId.value,
        }),
      );
    }
    this.state.latestRestoreAttempt = {
      ...cloneRestoreAttempt(this.state.latestRestoreAttempt),
      status: DependencyResourceRestoreAttemptStatusValue.completed(),
      completedAt: input.completedAt,
    };
    this.recordDomainEvent("dependency-resource-restore-completed", input.completedAt, {
      backupId: this.state.id.value,
      restoreAttemptId: input.attemptId.value,
      dependencyResourceId: this.state.dependencyResourceId.value,
      providerKey: this.state.providerKey.value,
    });
    return ok(undefined);
  }

  markRestoreFailed(input: {
    attemptId: DependencyResourceRestoreAttemptId;
    failureCode: DependencyResourceBackupFailureCode;
    failureMessage?: DescriptionText;
    failedAt: OccurredAt;
  }): Result<void> {
    if (!this.state.latestRestoreAttempt?.attemptId.equals(input.attemptId)) {
      return err(
        domainError.dependencyResourceRestoreBlocked("Restore attempt does not match", {
          phase: "dependency-resource-restore",
          backupId: this.state.id.value,
          restoreAttemptId: input.attemptId.value,
        }),
      );
    }
    this.state.latestRestoreAttempt = {
      ...cloneRestoreAttempt(this.state.latestRestoreAttempt),
      status: DependencyResourceRestoreAttemptStatusValue.failed(),
      failedAt: input.failedAt,
      failureCode: input.failureCode,
      ...(input.failureMessage ? { failureMessage: input.failureMessage } : {}),
    };
    this.recordDomainEvent("dependency-resource-restore-failed", input.failedAt, {
      backupId: this.state.id.value,
      restoreAttemptId: input.attemptId.value,
      dependencyResourceId: this.state.dependencyResourceId.value,
      providerKey: this.state.providerKey.value,
      failureCode: input.failureCode.value,
    });
    return ok(undefined);
  }

  blocksDependencyResourceDelete(): boolean {
    return (
      this.state.status.value === "pending" ||
      this.state.retentionStatus.blocksDelete() ||
      this.state.latestRestoreAttempt?.status.isPending() === true
    );
  }

  toState(): DependencyResourceBackupState {
    return {
      ...this.state,
      ...(this.state.providerArtifactHandle
        ? { providerArtifactHandle: this.state.providerArtifactHandle }
        : {}),
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

function cloneRestoreAttempt(
  attempt: DependencyResourceRestoreAttemptState,
): DependencyResourceRestoreAttemptState {
  return {
    attemptId: attempt.attemptId,
    status: attempt.status,
    requestedAt: attempt.requestedAt,
    ...(attempt.completedAt ? { completedAt: attempt.completedAt } : {}),
    ...(attempt.failedAt ? { failedAt: attempt.failedAt } : {}),
    ...(attempt.failureCode ? { failureCode: attempt.failureCode } : {}),
    ...(attempt.failureMessage ? { failureMessage: attempt.failureMessage } : {}),
  };
}
