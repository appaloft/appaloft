import { AggregateRoot } from "../shared/entity";
import { domainError } from "../shared/errors";
import { type EnvironmentId, type ProjectId, type StorageVolumeId } from "../shared/identifiers";
import { err, ok, type Result } from "../shared/result";
import { type CreatedAt, type DeletedAt, type UpdatedAt } from "../shared/temporal";
import { type DescriptionText } from "../shared/text-values";
import { ScalarValueObject } from "../shared/value-object";

export type StorageVolumeKind = "named-volume" | "bind-mount";
export type StorageVolumeLifecycleStatus = "active" | "deleted";
export type ResourceStorageMountMode = "read-write" | "read-only";

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function validateStorageSlug(value: string, label: string): Result<string> {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return err(domainError.validation(`${label} is required`));
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized)) {
    return err(
      domainError.validation(`${label} must contain only lowercase letters, digits, and hyphens`, {
        phase: "storage-volume-validation",
        field: "name",
      }),
    );
  }
  return ok(normalized);
}

function storageValidationError(message: string, details?: Record<string, string | boolean>) {
  return domainError.validation(message, {
    phase: "storage-volume-validation",
    ...(details ?? {}),
  });
}

function attachmentValidationError(message: string, details?: Record<string, string | boolean>) {
  return domainError.validation(message, {
    phase: "resource-storage-attachment",
    ...(details ?? {}),
  });
}

function normalizeAbsolutePath(
  value: string,
  input: {
    label: string;
    field: string;
    phase: "storage-volume-validation" | "resource-storage-attachment";
  },
): Result<string> {
  const trimmed = value.trim();
  if (!trimmed) {
    return err(
      domainError.validation(`${input.label} is required`, {
        phase: input.phase,
        field: input.field,
      }),
    );
  }
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
    return err(
      domainError.validation(`${input.label} must not be a URL`, {
        phase: input.phase,
        field: input.field,
      }),
    );
  }
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || /^[a-z]:[\\/]/i.test(trimmed)) {
    return err(
      domainError.validation(`${input.label} must be an absolute normalized path`, {
        phase: input.phase,
        field: input.field,
      }),
    );
  }
  if (/[;&|`$<>]/.test(trimmed)) {
    return err(
      domainError.validation(`${input.label} contains unsupported shell characters`, {
        phase: input.phase,
        field: input.field,
      }),
    );
  }
  const segments = trimmed.split("/").filter(Boolean);
  if (segments.length === 0) {
    return err(
      domainError.validation(`${input.label} cannot be /`, {
        phase: input.phase,
        field: input.field,
      }),
    );
  }
  if (segments.some((segment) => segment === "." || segment === "..")) {
    return err(
      domainError.validation(`${input.label} must not contain dot segments`, {
        phase: input.phase,
        field: input.field,
      }),
    );
  }
  return ok(`/${segments.join("/")}`);
}

const storageVolumeNameBrand: unique symbol = Symbol("StorageVolumeName");
export class StorageVolumeName extends ScalarValueObject<string> {
  private [storageVolumeNameBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<StorageVolumeName> {
    const normalized = value.trim();
    if (!normalized) {
      return err(storageValidationError("Storage volume name is required", { field: "name" }));
    }
    return ok(new StorageVolumeName(normalized));
  }

  static rehydrate(value: string): StorageVolumeName {
    return new StorageVolumeName(value.trim());
  }
}

const storageVolumeSlugBrand: unique symbol = Symbol("StorageVolumeSlug");
export class StorageVolumeSlug extends ScalarValueObject<string> {
  private [storageVolumeSlugBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<StorageVolumeSlug> {
    return validateStorageSlug(value, "Storage volume slug").map(
      (normalized) => new StorageVolumeSlug(normalized),
    );
  }

  static fromName(name: StorageVolumeName): Result<StorageVolumeSlug> {
    return StorageVolumeSlug.create(slugify(name.value));
  }

  static rehydrate(value: string): StorageVolumeSlug {
    return new StorageVolumeSlug(value.trim().toLowerCase());
  }
}

const storageVolumeKindBrand: unique symbol = Symbol("StorageVolumeKindValue");
export class StorageVolumeKindValue extends ScalarValueObject<StorageVolumeKind> {
  private [storageVolumeKindBrand]!: void;

  private constructor(value: StorageVolumeKind) {
    super(value);
  }

  static create(value: string): Result<StorageVolumeKindValue> {
    if (value === "named-volume" || value === "bind-mount") {
      return ok(new StorageVolumeKindValue(value));
    }
    return err(storageValidationError("Storage volume kind is unsupported", { field: "kind" }));
  }

  static rehydrate(value: StorageVolumeKind): StorageVolumeKindValue {
    return new StorageVolumeKindValue(value);
  }

  isBindMount(): boolean {
    return this.value === "bind-mount";
  }
}

const storageVolumeLifecycleStatusBrand: unique symbol = Symbol(
  "StorageVolumeLifecycleStatusValue",
);
export class StorageVolumeLifecycleStatusValue extends ScalarValueObject<StorageVolumeLifecycleStatus> {
  private [storageVolumeLifecycleStatusBrand]!: void;

  private constructor(value: StorageVolumeLifecycleStatus) {
    super(value);
  }

  static active(): StorageVolumeLifecycleStatusValue {
    return new StorageVolumeLifecycleStatusValue("active");
  }

  static rehydrate(value: StorageVolumeLifecycleStatus): StorageVolumeLifecycleStatusValue {
    return new StorageVolumeLifecycleStatusValue(value);
  }

  delete(): Result<StorageVolumeLifecycleStatusValue> {
    if (this.value === "deleted") {
      return ok(this);
    }
    return ok(new StorageVolumeLifecycleStatusValue("deleted"));
  }

  isDeleted(): boolean {
    return this.value === "deleted";
  }
}

const storageBindSourcePathBrand: unique symbol = Symbol("StorageBindSourcePath");
export class StorageBindSourcePath extends ScalarValueObject<string> {
  private [storageBindSourcePathBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<StorageBindSourcePath> {
    return normalizeAbsolutePath(value, {
      label: "Storage bind source path",
      field: "sourcePath",
      phase: "storage-volume-validation",
    }).map((normalized) => new StorageBindSourcePath(normalized));
  }

  static rehydrate(value: string): StorageBindSourcePath {
    return new StorageBindSourcePath(value.trim());
  }
}

const storageDestinationPathBrand: unique symbol = Symbol("StorageDestinationPath");
export class StorageDestinationPath extends ScalarValueObject<string> {
  private [storageDestinationPathBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<StorageDestinationPath> {
    return normalizeAbsolutePath(value, {
      label: "Storage destination path",
      field: "destinationPath",
      phase: "resource-storage-attachment",
    }).map((normalized) => new StorageDestinationPath(normalized));
  }

  static rehydrate(value: string): StorageDestinationPath {
    return new StorageDestinationPath(value.trim());
  }
}

const resourceStorageMountModeBrand: unique symbol = Symbol("ResourceStorageMountModeValue");
export class ResourceStorageMountModeValue extends ScalarValueObject<ResourceStorageMountMode> {
  private [resourceStorageMountModeBrand]!: void;

  private constructor(value: ResourceStorageMountMode) {
    super(value);
  }

  static create(value: string): Result<ResourceStorageMountModeValue> {
    if (value === "read-write" || value === "read-only") {
      return ok(new ResourceStorageMountModeValue(value));
    }
    return err(
      attachmentValidationError("Storage mount mode is unsupported", { field: "mountMode" }),
    );
  }

  static readWrite(): ResourceStorageMountModeValue {
    return new ResourceStorageMountModeValue("read-write");
  }

  static rehydrate(value: ResourceStorageMountMode): ResourceStorageMountModeValue {
    return new ResourceStorageMountModeValue(value);
  }
}

export interface StorageBackupRelationshipState {
  retentionRequired: boolean;
  reason?: DescriptionText;
}

export interface StorageVolumeState {
  id: StorageVolumeId;
  projectId: ProjectId;
  environmentId: EnvironmentId;
  name: StorageVolumeName;
  slug: StorageVolumeSlug;
  kind: StorageVolumeKindValue;
  sourcePath?: StorageBindSourcePath;
  description?: DescriptionText;
  backupRelationship?: StorageBackupRelationshipState;
  lifecycleStatus: StorageVolumeLifecycleStatusValue;
  createdAt: CreatedAt;
  deletedAt?: DeletedAt;
}

export interface StorageVolumeDeleteBlocker {
  kind: "resource-attachment" | "backup-relationship";
  relatedEntityId?: string;
  relatedEntityType?: string;
  count?: number;
}

export interface StorageVolumeVisitor<TContext, TResult> {
  visitStorageVolume(storageVolume: StorageVolume, context: TContext): TResult;
}

function cloneBackupRelationship(
  backupRelationship: StorageBackupRelationshipState,
): StorageBackupRelationshipState {
  return {
    retentionRequired: backupRelationship.retentionRequired,
    ...(backupRelationship.reason ? { reason: backupRelationship.reason } : {}),
  };
}

export class StorageVolume extends AggregateRoot<StorageVolumeState> {
  private constructor(state: StorageVolumeState) {
    super(state);
  }

  static create(input: {
    id: StorageVolumeId;
    projectId: ProjectId;
    environmentId: EnvironmentId;
    name: StorageVolumeName;
    kind: StorageVolumeKindValue;
    sourcePath?: StorageBindSourcePath;
    description?: DescriptionText;
    backupRelationship?: StorageBackupRelationshipState;
    createdAt: CreatedAt;
  }): Result<StorageVolume> {
    if (input.kind.isBindMount() && !input.sourcePath) {
      return err(
        storageValidationError("Bind mount storage volumes require sourcePath", {
          field: "sourcePath",
        }),
      );
    }
    if (!input.kind.isBindMount() && input.sourcePath) {
      return err(
        storageValidationError("Named storage volumes must not include sourcePath", {
          field: "sourcePath",
        }),
      );
    }

    return StorageVolumeSlug.fromName(input.name).map((slug) => {
      const storageVolume = new StorageVolume({
        id: input.id,
        projectId: input.projectId,
        environmentId: input.environmentId,
        name: input.name,
        slug,
        kind: input.kind,
        ...(input.sourcePath ? { sourcePath: input.sourcePath } : {}),
        ...(input.description ? { description: input.description } : {}),
        ...(input.backupRelationship
          ? { backupRelationship: cloneBackupRelationship(input.backupRelationship) }
          : {}),
        lifecycleStatus: StorageVolumeLifecycleStatusValue.active(),
        createdAt: input.createdAt,
      });
      storageVolume.recordDomainEvent("storage-volume-created", input.createdAt, {
        storageVolumeId: input.id.value,
        projectId: input.projectId.value,
        environmentId: input.environmentId.value,
        name: input.name.value,
        slug: slug.value,
        kind: input.kind.value,
        ...(input.sourcePath ? { sourcePath: input.sourcePath.value } : {}),
        createdAt: input.createdAt.value,
      });
      return storageVolume;
    });
  }

  static rehydrate(state: StorageVolumeState): StorageVolume {
    return new StorageVolume({
      ...state,
      ...(state.sourcePath ? { sourcePath: state.sourcePath } : {}),
      ...(state.description ? { description: state.description } : {}),
      ...(state.backupRelationship
        ? { backupRelationship: cloneBackupRelationship(state.backupRelationship) }
        : {}),
      ...(state.deletedAt ? { deletedAt: state.deletedAt } : {}),
    });
  }

  get id(): StorageVolumeId {
    return this.state.id;
  }

  belongsToProject(projectId: ProjectId): boolean {
    return this.state.projectId.equals(projectId);
  }

  belongsToEnvironment(environmentId: EnvironmentId): boolean {
    return this.state.environmentId.equals(environmentId);
  }

  ensureActive(): Result<void> {
    if (this.state.lifecycleStatus.isDeleted()) {
      return err(domainError.notFound("storage_volume", this.state.id.value));
    }
    return ok(undefined);
  }

  rename(input: { name: StorageVolumeName; renamedAt: UpdatedAt }): Result<void> {
    return StorageVolumeSlug.fromName(input.name).map((slug) => {
      this.state.name = input.name;
      this.state.slug = slug;
      this.recordDomainEvent("storage-volume-renamed", input.renamedAt, {
        storageVolumeId: this.state.id.value,
        projectId: this.state.projectId.value,
        environmentId: this.state.environmentId.value,
        name: input.name.value,
        slug: slug.value,
        renamedAt: input.renamedAt.value,
      });
      return undefined;
    });
  }

  delete(input: {
    deletedAt: DeletedAt;
    attachmentCount: number;
  }): Result<{ changed: boolean; blockers: StorageVolumeDeleteBlocker[] }> {
    if (this.state.lifecycleStatus.isDeleted()) {
      return ok({ changed: false, blockers: [] });
    }

    const blockers: StorageVolumeDeleteBlocker[] = [];
    if (input.attachmentCount > 0) {
      blockers.push({ kind: "resource-attachment", count: input.attachmentCount });
    }
    if (this.state.backupRelationship?.retentionRequired) {
      blockers.push({ kind: "backup-relationship" });
    }
    if (blockers.length > 0) {
      return err(
        domainError.conflict("storage_volume_delete_blocked", {
          phase: "storage-volume-delete-safety",
          storageVolumeId: this.state.id.value,
          deletionBlockers: blockers.map((blocker) => blocker.kind).join(","),
        }),
      );
    }

    const lifecycleStatus = this.state.lifecycleStatus.delete();
    if (lifecycleStatus.isErr()) {
      return err(lifecycleStatus.error);
    }

    this.state.lifecycleStatus = lifecycleStatus.value;
    this.state.deletedAt = input.deletedAt;
    this.recordDomainEvent("storage-volume-deleted", input.deletedAt, {
      storageVolumeId: this.state.id.value,
      projectId: this.state.projectId.value,
      environmentId: this.state.environmentId.value,
      deletedAt: input.deletedAt.value,
    });
    return ok({ changed: true, blockers: [] });
  }

  accept<TContext, TResult>(
    visitor: StorageVolumeVisitor<TContext, TResult>,
    context: TContext,
  ): TResult {
    return visitor.visitStorageVolume(this, context);
  }

  toState(): StorageVolumeState {
    return {
      ...this.state,
      ...(this.state.sourcePath ? { sourcePath: this.state.sourcePath } : {}),
      ...(this.state.description ? { description: this.state.description } : {}),
      ...(this.state.backupRelationship
        ? { backupRelationship: cloneBackupRelationship(this.state.backupRelationship) }
        : {}),
      ...(this.state.deletedAt ? { deletedAt: this.state.deletedAt } : {}),
    };
  }
}
