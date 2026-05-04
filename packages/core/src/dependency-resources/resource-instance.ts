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
  type DescriptionText,
  type EndpointText,
  OwnerId,
  type ProviderKey,
  type ResourceInstanceName,
} from "../shared/text-values";
import { ScalarValueObject } from "../shared/value-object";

export type DependencyResourceSourceMode = "appaloft-managed" | "imported-external";
export type DependencyResourceBindingReadinessStatus = "ready" | "blocked" | "not-implemented";

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

export interface DependencyResourceDeleteBlockerState {
  kind:
    | "resource-binding"
    | "backup-relationship"
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
  connectionSecretRef?: DependencyResourceSecretRef;
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
      ...(endpoint.value ? { postgresEndpoint: endpoint.value } : {}),
      ...(input.backupRelationship
        ? { backupRelationship: cloneBackupRelationship(input.backupRelationship) }
        : { backupRelationship: { retentionRequired: false } }),
      bindingReadiness: {
        status: "not-implemented",
      },
      status: ResourceInstanceStatusValue.rehydrate("ready"),
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

  delete(input: {
    deletedAt: DeletedAt;
    blockers: DependencyResourceDeleteBlockerState[];
  }): Result<{ changed: boolean; blockers: DependencyResourceDeleteBlockerState[] }> {
    if (this.state.status.value === "deleted") {
      return ok({ changed: false, blockers: [] });
    }

    const blockers = [...input.blockers];
    if (this.state.backupRelationship?.retentionRequired) {
      blockers.push({ kind: "backup-relationship" });
    }
    if (this.state.providerManaged) {
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
      ...(this.state.connectionSecretRef
        ? { connectionSecretRef: this.state.connectionSecretRef }
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

function cloneBindingReadiness(
  bindingReadiness: DependencyResourceBindingReadinessState,
): DependencyResourceBindingReadinessState {
  return {
    status: bindingReadiness.status,
    ...(bindingReadiness.reason ? { reason: bindingReadiness.reason } : {}),
  };
}
