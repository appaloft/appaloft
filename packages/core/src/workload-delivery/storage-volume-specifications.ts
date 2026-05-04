import { type EnvironmentId, type ProjectId, type StorageVolumeId } from "../shared/identifiers";
import {
  type StorageVolume,
  type StorageVolumeSlug,
  type StorageVolumeState,
} from "./storage-volume";

export interface StorageVolumeSelectionSpecVisitor<TResult> {
  visitStorageVolumeById(query: TResult, spec: StorageVolumeByIdSpec): TResult;
  visitStorageVolumeByEnvironmentAndSlug(
    query: TResult,
    spec: StorageVolumeByEnvironmentAndSlugSpec,
  ): TResult;
}

export interface StorageVolumeMutationSpecVisitor<TResult> {
  visitUpsertStorageVolume(spec: UpsertStorageVolumeSpec): TResult;
}

export interface StorageVolumeSelectionSpec {
  isSatisfiedBy(candidate: StorageVolume): boolean;
  accept<TResult>(query: TResult, visitor: StorageVolumeSelectionSpecVisitor<TResult>): TResult;
}

export interface StorageVolumeMutationSpec {
  accept<TResult>(visitor: StorageVolumeMutationSpecVisitor<TResult>): TResult;
}

export class StorageVolumeByIdSpec implements StorageVolumeSelectionSpec {
  private constructor(private readonly expectedId: StorageVolumeId) {}

  static create(id: StorageVolumeId): StorageVolumeByIdSpec {
    return new StorageVolumeByIdSpec(id);
  }

  get id(): StorageVolumeId {
    return this.expectedId;
  }

  isSatisfiedBy(candidate: StorageVolume): boolean {
    return candidate.toState().id.equals(this.expectedId);
  }

  accept<TResult>(query: TResult, visitor: StorageVolumeSelectionSpecVisitor<TResult>): TResult {
    return visitor.visitStorageVolumeById(query, this);
  }
}

export class StorageVolumeByEnvironmentAndSlugSpec implements StorageVolumeSelectionSpec {
  private constructor(
    private readonly expectedProjectId: ProjectId,
    private readonly expectedEnvironmentId: EnvironmentId,
    private readonly expectedSlug: StorageVolumeSlug,
  ) {}

  static create(
    projectId: ProjectId,
    environmentId: EnvironmentId,
    slug: StorageVolumeSlug,
  ): StorageVolumeByEnvironmentAndSlugSpec {
    return new StorageVolumeByEnvironmentAndSlugSpec(projectId, environmentId, slug);
  }

  get projectId(): ProjectId {
    return this.expectedProjectId;
  }

  get environmentId(): EnvironmentId {
    return this.expectedEnvironmentId;
  }

  get slug(): StorageVolumeSlug {
    return this.expectedSlug;
  }

  isSatisfiedBy(candidate: StorageVolume): boolean {
    const state = candidate.toState();
    return (
      state.projectId.equals(this.expectedProjectId) &&
      state.environmentId.equals(this.expectedEnvironmentId) &&
      state.slug.equals(this.expectedSlug)
    );
  }

  accept<TResult>(query: TResult, visitor: StorageVolumeSelectionSpecVisitor<TResult>): TResult {
    return visitor.visitStorageVolumeByEnvironmentAndSlug(query, this);
  }
}

export class UpsertStorageVolumeSpec implements StorageVolumeMutationSpec {
  private constructor(private readonly nextState: StorageVolumeState) {}

  static fromStorageVolume(storageVolume: StorageVolume): UpsertStorageVolumeSpec {
    return new UpsertStorageVolumeSpec(storageVolume.toState());
  }

  get state(): StorageVolumeState {
    return this.nextState;
  }

  accept<TResult>(visitor: StorageVolumeMutationSpecVisitor<TResult>): TResult {
    return visitor.visitUpsertStorageVolume(this);
  }
}
