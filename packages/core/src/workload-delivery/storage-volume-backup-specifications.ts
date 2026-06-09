import { type StorageVolumeId } from "../shared/identifiers";
import {
  type StorageVolumeBackup,
  type StorageVolumeBackupId,
  type StorageVolumeBackupState,
} from "./storage-volume-backup";

export interface StorageVolumeBackupSelectionSpecVisitor<TResult> {
  visitStorageVolumeBackupById(query: TResult, spec: StorageVolumeBackupByIdSpec): TResult;
  visitStorageVolumeBackupsByStorageVolume(
    query: TResult,
    spec: StorageVolumeBackupsByStorageVolumeSpec,
  ): TResult;
}

export interface StorageVolumeBackupMutationSpecVisitor<TResult> {
  visitUpsertStorageVolumeBackup(spec: UpsertStorageVolumeBackupSpec): TResult;
}

export interface StorageVolumeBackupSelectionSpec {
  isSatisfiedBy(candidate: StorageVolumeBackup): boolean;
  accept<TResult>(
    query: TResult,
    visitor: StorageVolumeBackupSelectionSpecVisitor<TResult>,
  ): TResult;
}

export interface StorageVolumeBackupMutationSpec {
  accept<TResult>(visitor: StorageVolumeBackupMutationSpecVisitor<TResult>): TResult;
}

export class StorageVolumeBackupByIdSpec implements StorageVolumeBackupSelectionSpec {
  private constructor(private readonly expectedId: StorageVolumeBackupId) {}

  static create(id: StorageVolumeBackupId): StorageVolumeBackupByIdSpec {
    return new StorageVolumeBackupByIdSpec(id);
  }

  get id(): StorageVolumeBackupId {
    return this.expectedId;
  }

  isSatisfiedBy(candidate: StorageVolumeBackup): boolean {
    return candidate.toState().id.equals(this.expectedId);
  }

  accept<TResult>(
    query: TResult,
    visitor: StorageVolumeBackupSelectionSpecVisitor<TResult>,
  ): TResult {
    return visitor.visitStorageVolumeBackupById(query, this);
  }
}

export class StorageVolumeBackupsByStorageVolumeSpec implements StorageVolumeBackupSelectionSpec {
  private constructor(private readonly expectedStorageVolumeId: StorageVolumeId) {}

  static create(storageVolumeId: StorageVolumeId): StorageVolumeBackupsByStorageVolumeSpec {
    return new StorageVolumeBackupsByStorageVolumeSpec(storageVolumeId);
  }

  get storageVolumeId(): StorageVolumeId {
    return this.expectedStorageVolumeId;
  }

  isSatisfiedBy(candidate: StorageVolumeBackup): boolean {
    return candidate.toState().storageVolumeId.equals(this.expectedStorageVolumeId);
  }

  accept<TResult>(
    query: TResult,
    visitor: StorageVolumeBackupSelectionSpecVisitor<TResult>,
  ): TResult {
    return visitor.visitStorageVolumeBackupsByStorageVolume(query, this);
  }
}

export class UpsertStorageVolumeBackupSpec implements StorageVolumeBackupMutationSpec {
  private constructor(private readonly nextState: StorageVolumeBackupState) {}

  static fromStorageVolumeBackup(backup: StorageVolumeBackup): UpsertStorageVolumeBackupSpec {
    return new UpsertStorageVolumeBackupSpec(backup.toState());
  }

  get state(): StorageVolumeBackupState {
    return this.nextState;
  }

  accept<TResult>(visitor: StorageVolumeBackupMutationSpecVisitor<TResult>): TResult {
    return visitor.visitUpsertStorageVolumeBackup(this);
  }
}
