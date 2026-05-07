import { AggregateRoot } from "../shared/entity";
import { domainError } from "../shared/errors";
import {
  type EnvironmentId,
  type ProjectId,
  type ProviderConnectionId,
  type ResourceInstanceId,
} from "../shared/identifiers";
import { err, ok, type Result } from "../shared/result";
import {
  OwnerScopeValue,
  type ResourceInstanceKindValue,
  ResourceInstanceStatusValue,
} from "../shared/state-machine";
import {
  type CreatedAt,
  type DeletedAt,
  type OccurredAt,
  type UpdatedAt,
} from "../shared/temporal";
import {
  DescriptionText,
  type EndpointText,
  OwnerId,
  type ProviderKey,
  type ResourceInstanceName,
} from "../shared/text-values";
import { ScalarValueObject } from "../shared/value-object";

export type DependencyResourceSourceMode = "appaloft-managed" | "imported-external";
export type DependencyResourceBindingReadinessStatus = "ready" | "blocked" | "not-implemented";
export type DependencyResourceProviderRealizationStatus =
  | "pending"
  | "ready"
  | "failed"
  | "delete-pending"
  | "deleted";

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function dependencyResourceValidationError(
  message: string,
  details?: Record<string, string | number | boolean>,
) {
  return domainError.validation(message, {
    phase: "dependency-resource-validation",
    ...(details ?? {}),
  });
}

const resourceInstanceSlugBrand: unique symbol = Symbol("ResourceInstanceSlug");
export class ResourceInstanceSlug extends ScalarValueObject<string> {
  private [resourceInstanceSlugBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<ResourceInstanceSlug> {
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      return err(dependencyResourceValidationError("Dependency resource slug is required"));
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized)) {
      return err(
        dependencyResourceValidationError(
          "Dependency resource slug must contain only lowercase letters, digits, and hyphens",
          { field: "slug" },
        ),
      );
    }
    return ok(new ResourceInstanceSlug(normalized));
  }

  static fromName(name: ResourceInstanceName): Result<ResourceInstanceSlug> {
    return ResourceInstanceSlug.create(slugify(name.value));
  }

  static rehydrate(value: string): ResourceInstanceSlug {
    return new ResourceInstanceSlug(value.trim().toLowerCase());
  }
}

const dependencyResourceSourceModeBrand: unique symbol = Symbol(
  "DependencyResourceSourceModeValue",
);
export class DependencyResourceSourceModeValue extends ScalarValueObject<DependencyResourceSourceMode> {
  private [dependencyResourceSourceModeBrand]!: void;

  private constructor(value: DependencyResourceSourceMode) {
    super(value);
  }

  static create(value: string): Result<DependencyResourceSourceModeValue> {
    if (value === "appaloft-managed" || value === "imported-external") {
      return ok(new DependencyResourceSourceModeValue(value));
    }
    return err(dependencyResourceValidationError("Dependency resource source mode is unsupported"));
  }

  static rehydrate(value: DependencyResourceSourceMode): DependencyResourceSourceModeValue {
    return new DependencyResourceSourceModeValue(value);
  }

  isImportedExternal(): boolean {
    return this.value === "imported-external";
  }
}

const dependencyResourceEndpointHostBrand: unique symbol = Symbol("DependencyResourceEndpointHost");
export class DependencyResourceEndpointHost extends ScalarValueObject<string> {
  private [dependencyResourceEndpointHostBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<DependencyResourceEndpointHost> {
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      return err(dependencyResourceValidationError("Postgres endpoint host is required"));
    }
    if (/[/?#@\\\s]/.test(normalized)) {
      return err(
        dependencyResourceValidationError("Postgres endpoint host must be a host name only", {
          field: "endpoint.host",
        }),
      );
    }
    return ok(new DependencyResourceEndpointHost(normalized));
  }

  static rehydrate(value: string): DependencyResourceEndpointHost {
    return new DependencyResourceEndpointHost(value.trim().toLowerCase());
  }
}

const dependencyResourceEndpointPortBrand: unique symbol = Symbol("DependencyResourceEndpointPort");
export class DependencyResourceEndpointPort extends ScalarValueObject<number> {
  private [dependencyResourceEndpointPortBrand]!: void;

  private constructor(value: number) {
    super(value);
  }

  static create(value: number): Result<DependencyResourceEndpointPort> {
    if (!Number.isInteger(value) || value < 1 || value > 65535) {
      return err(
        dependencyResourceValidationError("Postgres endpoint port must be between 1 and 65535", {
          field: "endpoint.port",
        }),
      );
    }
    return ok(new DependencyResourceEndpointPort(value));
  }

  static rehydrate(value: number): DependencyResourceEndpointPort {
    return new DependencyResourceEndpointPort(value);
  }
}

const dependencyResourceDatabaseNameBrand: unique symbol = Symbol("DependencyResourceDatabaseName");
export class DependencyResourceDatabaseName extends ScalarValueObject<string> {
  private [dependencyResourceDatabaseNameBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<DependencyResourceDatabaseName> {
    const normalized = value.trim();
    if (!normalized) {
      return err(dependencyResourceValidationError("Postgres database name is required"));
    }
    if (/[\s/?#@\\]/.test(normalized)) {
      return err(
        dependencyResourceValidationError(
          "Postgres database name contains unsupported characters",
          {
            field: "endpoint.databaseName",
          },
        ),
      );
    }
    return ok(new DependencyResourceDatabaseName(normalized));
  }

  static rehydrate(value: string): DependencyResourceDatabaseName {
    return new DependencyResourceDatabaseName(value.trim());
  }
}

const maskedDependencyConnectionBrand: unique symbol = Symbol("MaskedDependencyConnection");
export class MaskedDependencyConnection extends ScalarValueObject<string> {
  private [maskedDependencyConnectionBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<MaskedDependencyConnection> {
    const normalized = value.trim();
    if (!normalized) {
      return err(dependencyResourceValidationError("Masked connection is required"));
    }
    if (
      /password=|token=|secret=|sslkey=|sslcert=|sslpassword=/i.test(normalized) ||
      /:\/\/[^/\s:]+:[^*@\s]+@/.test(normalized.replace("********", ""))
    ) {
      return err(
        dependencyResourceValidationError(
          "Masked connection must not contain raw secret material",
          {
            field: "endpoint.maskedConnection",
          },
        ),
      );
    }
    return ok(new MaskedDependencyConnection(normalized));
  }

  static rehydrate(value: string): MaskedDependencyConnection {
    return new MaskedDependencyConnection(value.trim());
  }
}

const dependencyResourceSecretRefBrand: unique symbol = Symbol("DependencyResourceSecretRef");
export class DependencyResourceSecretRef extends ScalarValueObject<string> {
  private [dependencyResourceSecretRefBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<DependencyResourceSecretRef> {
    const normalized = value.trim();
    if (!normalized) {
      return err(dependencyResourceValidationError("Connection secret reference is required"));
    }
    if (/\s/.test(normalized)) {
      return err(
        dependencyResourceValidationError("Connection secret reference must be a single token", {
          field: "secretRef",
        }),
      );
    }
    return ok(new DependencyResourceSecretRef(normalized));
  }

  static rehydrate(value: string): DependencyResourceSecretRef {
    return new DependencyResourceSecretRef(value.trim());
  }
}

const dependencyResourceProviderRealizationStatusBrand: unique symbol = Symbol(
  "DependencyResourceProviderRealizationStatusValue",
);
export class DependencyResourceProviderRealizationStatusValue extends ScalarValueObject<DependencyResourceProviderRealizationStatus> {
  private [dependencyResourceProviderRealizationStatusBrand]!: void;

  private constructor(value: DependencyResourceProviderRealizationStatus) {
    super(value);
  }

  static pending(): DependencyResourceProviderRealizationStatusValue {
    return new DependencyResourceProviderRealizationStatusValue("pending");
  }

  static ready(): DependencyResourceProviderRealizationStatusValue {
    return new DependencyResourceProviderRealizationStatusValue("ready");
  }

  static failed(): DependencyResourceProviderRealizationStatusValue {
    return new DependencyResourceProviderRealizationStatusValue("failed");
  }

  static deletePending(): DependencyResourceProviderRealizationStatusValue {
    return new DependencyResourceProviderRealizationStatusValue("delete-pending");
  }

  static deleted(): DependencyResourceProviderRealizationStatusValue {
    return new DependencyResourceProviderRealizationStatusValue("deleted");
  }

  static rehydrate(
    value: DependencyResourceProviderRealizationStatus,
  ): DependencyResourceProviderRealizationStatusValue {
    return new DependencyResourceProviderRealizationStatusValue(value);
  }
}

const dependencyResourceProviderRealizationAttemptIdBrand: unique symbol = Symbol(
  "DependencyResourceProviderRealizationAttemptId",
);
export class DependencyResourceProviderRealizationAttemptId extends ScalarValueObject<string> {
  private [dependencyResourceProviderRealizationAttemptIdBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<DependencyResourceProviderRealizationAttemptId> {
    const normalized = value.trim();
    if (!normalized) {
      return err(dependencyResourceValidationError("Provider realization attempt id is required"));
    }
    return ok(new DependencyResourceProviderRealizationAttemptId(normalized));
  }

  static rehydrate(value: string): DependencyResourceProviderRealizationAttemptId {
    return new DependencyResourceProviderRealizationAttemptId(value.trim());
  }
}

const dependencyResourceProviderResourceHandleBrand: unique symbol = Symbol(
  "DependencyResourceProviderResourceHandle",
);
export class DependencyResourceProviderResourceHandle extends ScalarValueObject<string> {
  private [dependencyResourceProviderResourceHandleBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<DependencyResourceProviderResourceHandle> {
    const normalized = value.trim();
    if (!normalized) {
      return err(dependencyResourceValidationError("Provider resource handle is required"));
    }
    if (/\s/.test(normalized)) {
      return err(
        dependencyResourceValidationError("Provider resource handle must be a single token", {
          field: "providerResourceHandle",
        }),
      );
    }
    return ok(new DependencyResourceProviderResourceHandle(normalized));
  }

  static rehydrate(value: string): DependencyResourceProviderResourceHandle {
    return new DependencyResourceProviderResourceHandle(value.trim());
  }
}

const dependencyResourceProviderFailureCodeBrand: unique symbol = Symbol(
  "DependencyResourceProviderFailureCode",
);
export class DependencyResourceProviderFailureCode extends ScalarValueObject<string> {
  private [dependencyResourceProviderFailureCodeBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<DependencyResourceProviderFailureCode> {
    const normalized = value.trim();
    if (!normalized) {
      return err(dependencyResourceValidationError("Provider failure code is required"));
    }
    if (!/^[a-z0-9_.-]+$/i.test(normalized)) {
      return err(
        dependencyResourceValidationError("Provider failure code contains unsupported characters", {
          field: "providerFailureCode",
        }),
      );
    }
    return ok(new DependencyResourceProviderFailureCode(normalized));
  }

  static rehydrate(value: string): DependencyResourceProviderFailureCode {
    return new DependencyResourceProviderFailureCode(value.trim());
  }
}

export interface DependencyResourceEndpointInput {
  host: string;
  port?: number;
  databaseName?: string;
  maskedConnection: string;
}

export interface DependencyResourceEndpointState {
  host: DependencyResourceEndpointHost;
  port?: DependencyResourceEndpointPort;
  databaseName?: DependencyResourceDatabaseName;
  maskedConnection: MaskedDependencyConnection;
}

export interface DependencyResourceBackupRelationshipState {
  retentionRequired: boolean;
  reason?: DescriptionText;
}

export interface DependencyResourceBindingReadinessState {
  status: DependencyResourceBindingReadinessStatus;
  reason?: DescriptionText;
}

export interface DependencyResourceProviderRealizationState {
  status: DependencyResourceProviderRealizationStatusValue;
  attemptId: DependencyResourceProviderRealizationAttemptId;
  attemptedAt: OccurredAt;
  providerResourceHandle?: DependencyResourceProviderResourceHandle;
  realizedAt?: OccurredAt;
  failedAt?: OccurredAt;
  failureCode?: DependencyResourceProviderFailureCode;
  failureMessage?: DescriptionText;
}

export interface DependencyResourceDeleteBlockerState {
  kind:
    | "resource-binding"
    | "backup-relationship"
    | "dependency-resource-backup"
    | "provider-managed-unsafe"
    | "deployment-snapshot-reference";
  relatedEntityId?: string;
  relatedEntityType?: string;
  count?: number;
}

export const DependencyResourceDeleteBlocker = {
  providerManagedUnsafe(): DependencyResourceDeleteBlockerState {
    return { kind: "provider-managed-unsafe" };
  },
} as const;

export interface ResourceInstanceState {
  id: ResourceInstanceId;
  projectId?: ProjectId;
  environmentId?: EnvironmentId;
  kind: ResourceInstanceKindValue;
  ownerScope: OwnerScopeValue;
  ownerId: OwnerId;
  name: ResourceInstanceName;
  slug?: ResourceInstanceSlug;
  description?: DescriptionText;
  sourceMode?: DependencyResourceSourceModeValue;
  providerKey: ProviderKey;
  providerManaged?: boolean;
  connectionId?: ProviderConnectionId;
  endpoint?: EndpointText;
  postgresEndpoint?: DependencyResourceEndpointState;
  redisEndpoint?: DependencyResourceEndpointState;
  connectionSecretRef?: DependencyResourceSecretRef;
  providerRealization?: DependencyResourceProviderRealizationState;
  backupRelationship?: DependencyResourceBackupRelationshipState;
  bindingReadiness?: DependencyResourceBindingReadinessState;
  status: ResourceInstanceStatusValue;
  createdAt: CreatedAt;
  deletedAt?: DeletedAt;
}

export interface ResourceInstanceVisitor<TContext, TResult> {
  visitResourceInstance(resourceInstance: ResourceInstance, context: TContext): TResult;
}

export class ResourceInstance extends AggregateRoot<ResourceInstanceState> {
  private constructor(state: ResourceInstanceState) {
    super(state);
  }

  static create(
    input: Omit<ResourceInstanceState, "status"> & { status?: ResourceInstanceStatusValue },
  ): Result<ResourceInstance> {
    const instance = new ResourceInstance({
      ...input,
      status: input.status ?? ResourceInstanceStatusValue.provisioning(),
    });
    instance.recordDomainEvent("resource.instance_created", input.createdAt, {
      kind: input.kind.value,
      providerKey: input.providerKey.value,
    });
    return ok(instance);
  }

  static rehydrate(state: ResourceInstanceState): ResourceInstance {
    return new ResourceInstance(state);
  }

  static createPostgresDependencyResource(input: {
    id: ResourceInstanceId;
    projectId: ProjectId;
    environmentId: EnvironmentId;
    name: ResourceInstanceName;
    kind: ResourceInstanceKindValue;
    sourceMode: DependencyResourceSourceModeValue;
    providerKey: ProviderKey;
    providerManaged: boolean;
    endpoint?: DependencyResourceEndpointInput;
    connectionSecretRef?: DependencyResourceSecretRef;
    providerRealization?: DependencyResourceProviderRealizationState;
    description?: DescriptionText;
    backupRelationship?: DependencyResourceBackupRelationshipState;
    createdAt: CreatedAt;
  }): Result<ResourceInstance> {
    if (input.kind.value !== "postgres") {
      return err(
        dependencyResourceValidationError("Postgres dependency resources must use kind postgres", {
          field: "kind",
        }),
      );
    }

    const slug = ResourceInstanceSlug.fromName(input.name);
    if (slug.isErr()) {
      return err(slug.error);
    }

    const endpoint = input.endpoint
      ? createEndpointState(input.endpoint)
      : ok<DependencyResourceEndpointState | undefined>(undefined);
    if (endpoint.isErr()) {
      return err(endpoint.error);
    }

    const instance = new ResourceInstance({
      id: input.id,
      projectId: input.projectId,
      environmentId: input.environmentId,
      kind: input.kind,
      ownerScope: OwnerScopeValue.rehydrate("project"),
      ownerId: OwnerId.rehydrate(input.projectId.value),
      name: input.name,
      slug: slug.value,
      ...(input.description ? { description: input.description } : {}),
      sourceMode: input.sourceMode,
      providerKey: input.providerKey,
      providerManaged: input.providerManaged,
      ...(input.connectionSecretRef ? { connectionSecretRef: input.connectionSecretRef } : {}),
      ...(input.providerRealization
        ? { providerRealization: cloneProviderRealization(input.providerRealization) }
        : {}),
      ...(endpoint.value ? { postgresEndpoint: endpoint.value } : {}),
      ...(input.backupRelationship
        ? { backupRelationship: cloneBackupRelationship(input.backupRelationship) }
        : { backupRelationship: { retentionRequired: false } }),
      bindingReadiness: input.providerRealization
        ? {
            status: "blocked",
            reason: DescriptionText.rehydrate("Provider realization is pending"),
          }
        : {
            status: "not-implemented",
          },
      status: input.providerRealization
        ? ResourceInstanceStatusValue.provisioning()
        : ResourceInstanceStatusValue.rehydrate("ready"),
      createdAt: input.createdAt,
    });

    instance.recordDomainEvent("dependency-resource-created", input.createdAt, {
      dependencyResourceId: input.id.value,
      projectId: input.projectId.value,
      environmentId: input.environmentId.value,
      kind: input.kind.value,
      sourceMode: input.sourceMode.value,
      providerKey: input.providerKey.value,
      slug: slug.value.value,
      providerManaged: input.providerManaged,
    });
    if (input.providerRealization) {
      instance.recordDomainEvent("dependency-resource-realization-requested", input.createdAt, {
        dependencyResourceId: input.id.value,
        providerKey: input.providerKey.value,
        attemptId: input.providerRealization.attemptId.value,
      });
    }
    return ok(instance);
  }

  static createRedisDependencyResource(input: {
    id: ResourceInstanceId;
    projectId: ProjectId;
    environmentId: EnvironmentId;
    name: ResourceInstanceName;
    kind: ResourceInstanceKindValue;
    sourceMode: DependencyResourceSourceModeValue;
    providerKey: ProviderKey;
    providerManaged: boolean;
    endpoint?: DependencyResourceEndpointInput;
    connectionSecretRef?: DependencyResourceSecretRef;
    providerRealization?: DependencyResourceProviderRealizationState;
    description?: DescriptionText;
    backupRelationship?: DependencyResourceBackupRelationshipState;
    createdAt: CreatedAt;
  }): Result<ResourceInstance> {
    if (input.kind.value !== "redis") {
      return err(
        dependencyResourceValidationError("Redis dependency resources must use kind redis", {
          field: "kind",
        }),
      );
    }

    const slug = ResourceInstanceSlug.fromName(input.name);
    if (slug.isErr()) {
      return err(slug.error);
    }

    const endpoint = input.endpoint
      ? createEndpointState(input.endpoint)
      : ok<DependencyResourceEndpointState | undefined>(undefined);
    if (endpoint.isErr()) {
      return err(endpoint.error);
    }

    const instance = new ResourceInstance({
      id: input.id,
      projectId: input.projectId,
      environmentId: input.environmentId,
      kind: input.kind,
      ownerScope: OwnerScopeValue.rehydrate("project"),
      ownerId: OwnerId.rehydrate(input.projectId.value),
      name: input.name,
      slug: slug.value,
      ...(input.description ? { description: input.description } : {}),
      sourceMode: input.sourceMode,
      providerKey: input.providerKey,
      providerManaged: input.providerManaged,
      ...(input.connectionSecretRef ? { connectionSecretRef: input.connectionSecretRef } : {}),
      ...(input.providerRealization
        ? { providerRealization: cloneProviderRealization(input.providerRealization) }
        : {}),
      ...(endpoint.value ? { redisEndpoint: endpoint.value } : {}),
      ...(input.backupRelationship
        ? { backupRelationship: cloneBackupRelationship(input.backupRelationship) }
        : { backupRelationship: { retentionRequired: false } }),
      bindingReadiness: input.providerRealization
        ? {
            status: "blocked",
            reason: DescriptionText.rehydrate("Provider realization is pending"),
          }
        : {
            status: "not-implemented",
          },
      status: input.providerRealization
        ? ResourceInstanceStatusValue.provisioning()
        : ResourceInstanceStatusValue.rehydrate("ready"),
      createdAt: input.createdAt,
    });

    instance.recordDomainEvent("dependency-resource-created", input.createdAt, {
      dependencyResourceId: input.id.value,
      projectId: input.projectId.value,
      environmentId: input.environmentId.value,
      kind: input.kind.value,
      sourceMode: input.sourceMode.value,
      providerKey: input.providerKey.value,
      slug: slug.value.value,
      providerManaged: input.providerManaged,
    });
    if (input.providerRealization) {
      instance.recordDomainEvent("dependency-resource-realization-requested", input.createdAt, {
        dependencyResourceId: input.id.value,
        providerKey: input.providerKey.value,
        attemptId: input.providerRealization.attemptId.value,
      });
    }
    return ok(instance);
  }

  accept<TContext, TResult>(
    visitor: ResourceInstanceVisitor<TContext, TResult>,
    context: TContext,
  ): TResult {
    return visitor.visitResourceInstance(this, context);
  }

  markReady(at: OccurredAt, endpoint?: EndpointText): void {
    this.state.status = this.state.status.markReady();
    if (endpoint) {
      this.state.endpoint = endpoint;
    }
    this.recordDomainEvent("resource.instance_ready", at, {
      endpoint: this.state.endpoint?.value,
    });
  }

  markDeleted(at: OccurredAt): void {
    this.state.status = this.state.status.markDeleted();
    this.recordDomainEvent("resource.instance_deleted", at, {});
  }

  rename(input: { name: ResourceInstanceName; renamedAt: UpdatedAt }): Result<void> {
    const slug = ResourceInstanceSlug.fromName(input.name);
    if (slug.isErr()) {
      return err(slug.error);
    }
    this.state.name = input.name;
    this.state.slug = slug.value;
    this.recordDomainEvent("dependency-resource-renamed", input.renamedAt, {
      dependencyResourceId: this.state.id.value,
      name: input.name.value,
      slug: slug.value.value,
      renamedAt: input.renamedAt.value,
    });
    return ok(undefined);
  }

  markProviderRealized(input: {
    attemptId: DependencyResourceProviderRealizationAttemptId;
    providerResourceHandle: DependencyResourceProviderResourceHandle;
    endpoint: DependencyResourceEndpointInput;
    connectionSecretRef?: DependencyResourceSecretRef;
    bindingReadiness?: DependencyResourceBindingReadinessState;
    realizedAt: OccurredAt;
  }): Result<void> {
    if (!this.state.providerManaged || this.state.sourceMode?.value !== "appaloft-managed") {
      return err(
        dependencyResourceValidationError("Only Appaloft-managed resources can be realized", {
          dependencyResourceId: this.state.id.value,
        }),
      );
    }
    const endpoint = createEndpointState(input.endpoint);
    if (endpoint.isErr()) {
      return err(endpoint.error);
    }

    this.state.providerRealization = {
      status: DependencyResourceProviderRealizationStatusValue.ready(),
      attemptId: input.attemptId,
      attemptedAt: this.state.providerRealization?.attemptedAt ?? input.realizedAt,
      providerResourceHandle: input.providerResourceHandle,
      realizedAt: input.realizedAt,
    };
    if (this.state.kind.value === "redis") {
      this.state.redisEndpoint = endpoint.value;
    } else {
      this.state.postgresEndpoint = endpoint.value;
    }
    if (input.connectionSecretRef) {
      this.state.connectionSecretRef = input.connectionSecretRef;
    }
    this.state.bindingReadiness = input.bindingReadiness
      ? cloneBindingReadiness(input.bindingReadiness)
      : { status: "ready" };
    this.state.status = this.state.status.markReady();
    this.recordDomainEvent("dependency-resource-realized", input.realizedAt, {
      dependencyResourceId: this.state.id.value,
      providerKey: this.state.providerKey.value,
      providerResourceHandle: input.providerResourceHandle.value,
      attemptId: input.attemptId.value,
    });
    return ok(undefined);
  }

  markProviderRealizationFailed(input: {
    attemptId: DependencyResourceProviderRealizationAttemptId;
    failureCode: DependencyResourceProviderFailureCode;
    failureMessage?: DescriptionText;
    failedAt: OccurredAt;
  }): Result<void> {
    if (!this.state.providerManaged || this.state.sourceMode?.value !== "appaloft-managed") {
      return err(
        dependencyResourceValidationError("Only Appaloft-managed resources can fail realization", {
          dependencyResourceId: this.state.id.value,
        }),
      );
    }
    this.state.providerRealization = {
      status: DependencyResourceProviderRealizationStatusValue.failed(),
      attemptId: input.attemptId,
      attemptedAt: this.state.providerRealization?.attemptedAt ?? input.failedAt,
      failedAt: input.failedAt,
      failureCode: input.failureCode,
      ...(input.failureMessage ? { failureMessage: input.failureMessage } : {}),
    };
    this.state.bindingReadiness = {
      status: "blocked",
      reason: DescriptionText.rehydrate("Provider realization failed"),
    };
    this.state.status = ResourceInstanceStatusValue.rehydrate("degraded");
    this.recordDomainEvent("dependency-resource-realization-failed", input.failedAt, {
      dependencyResourceId: this.state.id.value,
      providerKey: this.state.providerKey.value,
      attemptId: input.attemptId.value,
      failureCode: input.failureCode.value,
    });
    return ok(undefined);
  }

  markProviderDeleteRequested(input: {
    attemptId: DependencyResourceProviderRealizationAttemptId;
    requestedAt: OccurredAt;
  }): Result<void> {
    if (this.state.providerRealization?.status.value !== "ready") {
      return err(
        domainError.dependencyResourceDeleteBlocked("dependency_resource_delete_blocked", {
          phase: "dependency-resource-delete-safety",
          dependencyResourceId: this.state.id.value,
          deletionBlockers: "provider-managed-unsafe",
        }),
      );
    }
    this.state.providerRealization = {
      ...cloneProviderRealization(this.state.providerRealization),
      status: DependencyResourceProviderRealizationStatusValue.deletePending(),
      attemptId: input.attemptId,
      attemptedAt: input.requestedAt,
    };
    this.recordDomainEvent("dependency-resource-provider-delete-requested", input.requestedAt, {
      dependencyResourceId: this.state.id.value,
      providerKey: this.state.providerKey.value,
      attemptId: input.attemptId.value,
    });
    return ok(undefined);
  }

  ensureCanCreateBackup(): Result<void> {
    if (this.state.status.value !== "ready") {
      return err(
        domainError.dependencyResourceBackupBlocked("Dependency resource is not ready", {
          phase: "dependency-resource-backup-admission",
          dependencyResourceId: this.state.id.value,
          currentStatus: this.state.status.value,
        }),
      );
    }
    if (
      this.state.providerManaged &&
      this.state.sourceMode?.value === "appaloft-managed" &&
      this.state.providerRealization?.status.value !== "ready"
    ) {
      return err(
        domainError.dependencyResourceBackupBlocked("Managed dependency resource is not realized", {
          phase: "dependency-resource-backup-admission",
          dependencyResourceId: this.state.id.value,
          currentStatus: this.state.providerRealization?.status.value ?? "missing",
        }),
      );
    }
    if (
      !this.state.connectionSecretRef &&
      !this.state.postgresEndpoint &&
      !this.state.redisEndpoint
    ) {
      return err(
        domainError.dependencyResourceBackupBlocked(
          "Dependency resource has no backup connection",
          {
            phase: "dependency-resource-backup-admission",
            dependencyResourceId: this.state.id.value,
          },
        ),
      );
    }
    return ok(undefined);
  }

  ensureCanRestoreBackup(): Result<void> {
    if (this.state.status.value !== "ready") {
      return err(
        domainError.dependencyResourceRestoreBlocked("Dependency resource is not ready", {
          phase: "dependency-resource-restore-admission",
          dependencyResourceId: this.state.id.value,
          currentStatus: this.state.status.value,
        }),
      );
    }
    if (
      this.state.providerManaged &&
      this.state.sourceMode?.value === "appaloft-managed" &&
      this.state.providerRealization?.status.value !== "ready"
    ) {
      return err(
        domainError.dependencyResourceRestoreBlocked(
          "Managed dependency resource is not realized",
          {
            phase: "dependency-resource-restore-admission",
            dependencyResourceId: this.state.id.value,
            currentStatus: this.state.providerRealization?.status.value ?? "missing",
          },
        ),
      );
    }
    return ok(undefined);
  }

  delete(input: {
    deletedAt: DeletedAt;
    blockers: DependencyResourceDeleteBlockerState[];
    allowProviderManaged?: boolean;
  }): Result<{ changed: boolean; blockers: DependencyResourceDeleteBlockerState[] }> {
    if (this.state.status.value === "deleted") {
      return ok({ changed: false, blockers: [] });
    }

    const blockers = [...input.blockers];
    if (this.state.backupRelationship?.retentionRequired) {
      blockers.push({ kind: "backup-relationship" });
    }
    if (this.state.providerManaged && !input.allowProviderManaged) {
      blockers.push({ kind: "provider-managed-unsafe" });
    }

    if (blockers.length > 0) {
      return err(
        domainError.dependencyResourceDeleteBlocked("dependency_resource_delete_blocked", {
          phase: "dependency-resource-delete-safety",
          dependencyResourceId: this.state.id.value,
          deletionBlockers: blockers.map((blocker) => blocker.kind).join(","),
        }),
      );
    }

    this.state.status = this.state.status.markDeleted();
    this.state.deletedAt = input.deletedAt;
    if (this.state.providerRealization) {
      this.state.providerRealization = {
        ...cloneProviderRealization(this.state.providerRealization),
        status: DependencyResourceProviderRealizationStatusValue.deleted(),
      };
    }
    this.recordDomainEvent("dependency-resource-deleted", input.deletedAt, {
      dependencyResourceId: this.state.id.value,
      deletedAt: input.deletedAt.value,
    });
    return ok({ changed: true, blockers: [] });
  }

  toState(): ResourceInstanceState {
    return {
      ...this.state,
      ...(this.state.projectId ? { projectId: this.state.projectId } : {}),
      ...(this.state.environmentId ? { environmentId: this.state.environmentId } : {}),
      ...(this.state.slug ? { slug: this.state.slug } : {}),
      ...(this.state.description ? { description: this.state.description } : {}),
      ...(this.state.sourceMode ? { sourceMode: this.state.sourceMode } : {}),
      ...(this.state.postgresEndpoint
        ? { postgresEndpoint: cloneEndpoint(this.state.postgresEndpoint) }
        : {}),
      ...(this.state.redisEndpoint
        ? { redisEndpoint: cloneEndpoint(this.state.redisEndpoint) }
        : {}),
      ...(this.state.connectionSecretRef
        ? { connectionSecretRef: this.state.connectionSecretRef }
        : {}),
      ...(this.state.providerRealization
        ? { providerRealization: cloneProviderRealization(this.state.providerRealization) }
        : {}),
      ...(this.state.backupRelationship
        ? { backupRelationship: cloneBackupRelationship(this.state.backupRelationship) }
        : {}),
      ...(this.state.bindingReadiness
        ? { bindingReadiness: cloneBindingReadiness(this.state.bindingReadiness) }
        : {}),
      ...(this.state.deletedAt ? { deletedAt: this.state.deletedAt } : {}),
    };
  }
}

function createEndpointState(
  input: DependencyResourceEndpointInput,
): Result<DependencyResourceEndpointState> {
  const host = DependencyResourceEndpointHost.create(input.host);
  if (host.isErr()) {
    return err(host.error);
  }
  let port: DependencyResourceEndpointPort | undefined;
  if (input.port) {
    const portResult = DependencyResourceEndpointPort.create(input.port);
    if (portResult.isErr()) {
      return err(portResult.error);
    }
    port = portResult.value;
  }
  let databaseName: DependencyResourceDatabaseName | undefined;
  if (input.databaseName) {
    const databaseNameResult = DependencyResourceDatabaseName.create(input.databaseName);
    if (databaseNameResult.isErr()) {
      return err(databaseNameResult.error);
    }
    databaseName = databaseNameResult.value;
  }
  const maskedConnection = MaskedDependencyConnection.create(input.maskedConnection);
  if (maskedConnection.isErr()) {
    return err(maskedConnection.error);
  }
  return ok({
    host: host.value,
    ...(port ? { port } : {}),
    ...(databaseName ? { databaseName } : {}),
    maskedConnection: maskedConnection.value,
  });
}

function cloneEndpoint(endpoint: DependencyResourceEndpointState): DependencyResourceEndpointState {
  return {
    host: endpoint.host,
    ...(endpoint.port ? { port: endpoint.port } : {}),
    ...(endpoint.databaseName ? { databaseName: endpoint.databaseName } : {}),
    maskedConnection: endpoint.maskedConnection,
  };
}

function cloneBackupRelationship(
  backupRelationship: DependencyResourceBackupRelationshipState,
): DependencyResourceBackupRelationshipState {
  return {
    retentionRequired: backupRelationship.retentionRequired,
    ...(backupRelationship.reason ? { reason: backupRelationship.reason } : {}),
  };
}

function cloneProviderRealization(
  providerRealization: DependencyResourceProviderRealizationState,
): DependencyResourceProviderRealizationState {
  return {
    status: providerRealization.status,
    attemptId: providerRealization.attemptId,
    attemptedAt: providerRealization.attemptedAt,
    ...(providerRealization.providerResourceHandle
      ? { providerResourceHandle: providerRealization.providerResourceHandle }
      : {}),
    ...(providerRealization.realizedAt ? { realizedAt: providerRealization.realizedAt } : {}),
    ...(providerRealization.failedAt ? { failedAt: providerRealization.failedAt } : {}),
    ...(providerRealization.failureCode ? { failureCode: providerRealization.failureCode } : {}),
    ...(providerRealization.failureMessage
      ? { failureMessage: providerRealization.failureMessage }
      : {}),
  };
}

function cloneBindingReadiness(
  bindingReadiness: DependencyResourceBindingReadinessState,
): DependencyResourceBindingReadinessState {
  return {
    status: bindingReadiness.status,
    ...(bindingReadiness.reason ? { reason: bindingReadiness.reason } : {}),
  };
}
