import {
  EnvironmentConfigSet,
  type EnvironmentConfigSnapshotEntryState,
  type EnvironmentSnapshot,
} from "../configuration/environment-config-set";
import { AggregateRoot } from "../shared/entity";
import { domainError } from "../shared/errors";
import {
  type DestinationId,
  type EnvironmentId,
  type EnvironmentSnapshotId,
  type ProjectId,
  type ResourceId,
} from "../shared/identifiers";
import {
  type HealthCheckExpectedStatusCode,
  type HealthCheckIntervalSeconds,
  type HealthCheckRetryCount,
  type HealthCheckStartPeriodSeconds,
  type HealthCheckTimeoutSeconds,
  type PortNumber,
} from "../shared/numeric-values";
import { err, ok, type Result } from "../shared/result";
import {
  ConfigScopeValue,
  type HealthCheckHttpMethodValue,
  type HealthCheckSchemeValue,
  type HealthCheckTypeValue,
  type ResourceExposureModeValue,
  type ResourceKindValue,
  ResourceLifecycleStatusValue,
  type ResourceNetworkProtocolValue,
  type ResourceServiceKindValue,
  type RuntimePlanStrategyValue,
  type VariableExposureValue,
  type VariableKindValue,
} from "../shared/state-machine";
import {
  type ArchivedAt,
  type CreatedAt,
  type DeletedAt,
  type GeneratedAt,
  type UpdatedAt,
} from "../shared/temporal";
import {
  type ArchiveReason,
  type CommandText,
  type ConfigKey,
  type ConfigValueText,
  type DescriptionText,
  type HealthCheckHostText,
  type HealthCheckPathText,
  type HealthCheckResponseText,
  type ResourceName,
  type ResourceServiceName,
  ResourceSlug,
  type RuntimeNameText,
} from "../shared/text-values";
import { ScalarValueObject } from "../shared/value-object";
import {
  cloneResourceSourceBindingState,
  ResourceSourceBinding,
  type ResourceSourceBindingState,
} from "./source-binding";

export interface ResourceServiceState {
  name: ResourceServiceName;
  kind: ResourceServiceKindValue;
}

export interface ResourceHealthCheckHttpPolicyState {
  method: HealthCheckHttpMethodValue;
  scheme: HealthCheckSchemeValue;
  host: HealthCheckHostText;
  port?: PortNumber;
  path: HealthCheckPathText;
  expectedStatusCode: HealthCheckExpectedStatusCode;
  expectedResponseText?: HealthCheckResponseText;
}

export interface ResourceHealthCheckCommandPolicyState {
  command: CommandText;
}

export interface ResourceHealthCheckPolicyState {
  enabled: boolean;
  type: HealthCheckTypeValue;
  intervalSeconds: HealthCheckIntervalSeconds;
  timeoutSeconds: HealthCheckTimeoutSeconds;
  retries: HealthCheckRetryCount;
  startPeriodSeconds: HealthCheckStartPeriodSeconds;
  http?: ResourceHealthCheckHttpPolicyState;
  command?: ResourceHealthCheckCommandPolicyState;
}

export interface ResourceRuntimeProfileState {
  strategy: RuntimePlanStrategyValue;
  installCommand?: CommandText;
  buildCommand?: CommandText;
  startCommand?: CommandText;
  runtimeName?: RuntimeNameText;
  publishDirectory?: StaticPublishDirectory;
  dockerfilePath?: DockerfilePath;
  dockerComposeFilePath?: DockerComposeFilePath;
  buildTarget?: DockerBuildTarget;
  healthCheckPath?: HealthCheckPathText;
  healthCheck?: ResourceHealthCheckPolicyState;
}

function resourceRuntimeResolutionError(
  message: string,
  details?: Record<string, string | number | boolean>,
) {
  return domainError.validation(message, {
    phase: "resource-runtime-resolution",
    ...(details ?? {}),
  });
}

function normalizeStaticPublishDirectory(value: string): Result<string> {
  const trimmed = value.trim();
  if (!trimmed) {
    return err(
      resourceRuntimeResolutionError("Static publish directory is required", {
        runtimePlanStrategy: "static",
      }),
    );
  }

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
    return err(
      resourceRuntimeResolutionError("Static publish directory must not be a URL", {
        runtimePlanStrategy: "static",
        publishDirectory: trimmed,
      }),
    );
  }

  if (/^[a-z]:[\\/]/i.test(trimmed)) {
    return err(
      resourceRuntimeResolutionError("Static publish directory must not be a host path", {
        runtimePlanStrategy: "static",
        publishDirectory: trimmed,
      }),
    );
  }

  if (/[;&|`$<>]/.test(trimmed)) {
    return err(
      resourceRuntimeResolutionError(
        "Static publish directory contains unsupported shell characters",
        {
          runtimePlanStrategy: "static",
          publishDirectory: trimmed,
        },
      ),
    );
  }

  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  const segments = withLeadingSlash.split("/").filter(Boolean);
  if (segments.some((segment) => segment === "." || segment === "..")) {
    return err(
      resourceRuntimeResolutionError("Static publish directory must not contain dot segments", {
        runtimePlanStrategy: "static",
        publishDirectory: trimmed,
      }),
    );
  }

  if (segments.length === 0) {
    return err(
      resourceRuntimeResolutionError("Static publish directory cannot be the source root", {
        runtimePlanStrategy: "static",
        publishDirectory: trimmed,
      }),
    );
  }

  return ok(`/${segments.join("/")}`);
}

function normalizeRuntimeProfileRelativePath(
  value: string,
  input: { field: string; runtimePlanStrategy: string },
): Result<string> {
  const trimmed = value.trim();
  if (!trimmed) {
    return err(
      resourceRuntimeResolutionError("Runtime profile path is required", {
        field: input.field,
        runtimePlanStrategy: input.runtimePlanStrategy,
      }),
    );
  }

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
    return err(
      resourceRuntimeResolutionError("Runtime profile path must not be a URL", {
        field: input.field,
        runtimePlanStrategy: input.runtimePlanStrategy,
      }),
    );
  }

  if (trimmed.startsWith("/") || trimmed.startsWith("\\\\") || /^[a-z]:[\\/]/i.test(trimmed)) {
    return err(
      resourceRuntimeResolutionError("Runtime profile path must be source-root-relative", {
        field: input.field,
        runtimePlanStrategy: input.runtimePlanStrategy,
      }),
    );
  }

  if (/[;&|`$<>]/.test(trimmed)) {
    return err(
      resourceRuntimeResolutionError("Runtime profile path contains unsupported shell characters", {
        field: input.field,
        runtimePlanStrategy: input.runtimePlanStrategy,
      }),
    );
  }

  const segments = trimmed.replace(/\\/g, "/").split("/").filter(Boolean);
  if (segments.length === 0 || segments.some((segment) => segment === "." || segment === "..")) {
    return err(
      resourceRuntimeResolutionError("Runtime profile path must not contain dot segments", {
        field: input.field,
        runtimePlanStrategy: input.runtimePlanStrategy,
      }),
    );
  }

  return ok(segments.join("/"));
}

function normalizeDockerBuildTarget(value: string): Result<string> {
  const trimmed = value.trim();
  if (!trimmed) {
    return err(
      resourceRuntimeResolutionError("Docker build target is required", {
        field: "runtimeProfile.buildTarget",
        runtimePlanStrategy: "dockerfile",
      }),
    );
  }

  if (!/^[A-Za-z0-9_.-]+$/.test(trimmed)) {
    return err(
      resourceRuntimeResolutionError("Docker build target contains unsupported characters", {
        field: "runtimeProfile.buildTarget",
        runtimePlanStrategy: "dockerfile",
      }),
    );
  }

  return ok(trimmed);
}

const staticPublishDirectoryBrand: unique symbol = Symbol("StaticPublishDirectory");
export class StaticPublishDirectory extends ScalarValueObject<string> {
  private [staticPublishDirectoryBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<StaticPublishDirectory> {
    return normalizeStaticPublishDirectory(value).map(
      (normalized) => new StaticPublishDirectory(normalized),
    );
  }

  static rehydrate(value: string): StaticPublishDirectory {
    return new StaticPublishDirectory(value.trim());
  }
}

const dockerfilePathBrand: unique symbol = Symbol("DockerfilePath");
export class DockerfilePath extends ScalarValueObject<string> {
  private [dockerfilePathBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<DockerfilePath> {
    return normalizeRuntimeProfileRelativePath(value, {
      field: "runtimeProfile.dockerfilePath",
      runtimePlanStrategy: "dockerfile",
    }).map((normalized) => new DockerfilePath(normalized));
  }

  static rehydrate(value: string): DockerfilePath {
    return new DockerfilePath(value.trim());
  }
}

const dockerComposeFilePathBrand: unique symbol = Symbol("DockerComposeFilePath");
export class DockerComposeFilePath extends ScalarValueObject<string> {
  private [dockerComposeFilePathBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<DockerComposeFilePath> {
    return normalizeRuntimeProfileRelativePath(value, {
      field: "runtimeProfile.dockerComposeFilePath",
      runtimePlanStrategy: "docker-compose",
    }).map((normalized) => new DockerComposeFilePath(normalized));
  }

  static rehydrate(value: string): DockerComposeFilePath {
    return new DockerComposeFilePath(value.trim());
  }
}

const dockerBuildTargetBrand: unique symbol = Symbol("DockerBuildTarget");
export class DockerBuildTarget extends ScalarValueObject<string> {
  private [dockerBuildTargetBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<DockerBuildTarget> {
    return normalizeDockerBuildTarget(value).map((normalized) => new DockerBuildTarget(normalized));
  }

  static rehydrate(value: string): DockerBuildTarget {
    return new DockerBuildTarget(value.trim());
  }
}

export interface ResourceNetworkProfileState {
  internalPort: PortNumber;
  upstreamProtocol: ResourceNetworkProtocolValue;
  exposureMode: ResourceExposureModeValue;
  targetServiceName?: ResourceServiceName;
  hostPort?: PortNumber;
}

export interface ResourceState {
  id: ResourceId;
  projectId: ProjectId;
  environmentId: EnvironmentId;
  destinationId?: DestinationId;
  name: ResourceName;
  slug: ResourceSlug;
  kind: ResourceKindValue;
  services: ResourceServiceState[];
  sourceBinding?: ResourceSourceBindingState;
  runtimeProfile?: ResourceRuntimeProfileState;
  networkProfile?: ResourceNetworkProfileState;
  variables: EnvironmentConfigSet;
  lifecycleStatus: ResourceLifecycleStatusValue;
  archivedAt?: ArchivedAt;
  archiveReason?: ArchiveReason;
  deletedAt?: DeletedAt;
  createdAt: CreatedAt;
  description?: DescriptionText;
}

function cloneResourceHealthCheckPolicyState(
  policy: ResourceHealthCheckPolicyState,
): ResourceHealthCheckPolicyState {
  return {
    ...policy,
    ...(policy.http ? { http: { ...policy.http } } : {}),
    ...(policy.command ? { command: { ...policy.command } } : {}),
  };
}

function cloneResourceRuntimeProfileState(
  profile: ResourceRuntimeProfileState,
): ResourceRuntimeProfileState {
  return {
    ...profile,
    ...(profile.healthCheck
      ? { healthCheck: cloneResourceHealthCheckPolicyState(profile.healthCheck) }
      : {}),
  };
}

function cloneResourceNetworkProfileState(
  profile: ResourceNetworkProfileState,
): ResourceNetworkProfileState {
  return { ...profile };
}

export type ResourceVariableState = ReturnType<EnvironmentConfigSet["toState"]>[number];

function serializedNetworkProfile(profile: ResourceNetworkProfileState): Record<string, unknown> {
  return {
    internalPort: profile.internalPort.value,
    upstreamProtocol: profile.upstreamProtocol.value,
    exposureMode: profile.exposureMode.value,
    ...(profile.targetServiceName ? { targetServiceName: profile.targetServiceName.value } : {}),
    ...(profile.hostPort ? { hostPort: profile.hostPort.value } : {}),
  };
}

function resourceNetworkResolutionError(
  message: string,
  details?: Record<string, string | number | boolean>,
) {
  return domainError.validation(message, {
    phase: "resource-network-resolution",
    ...(details ?? {}),
  });
}

function resourceArchivedError(input: {
  resourceId: ResourceId;
  commandName: string;
  archivedAt?: ArchivedAt;
}) {
  return domainError.resourceArchived("Archived resources cannot accept new mutations", {
    phase: "resource-lifecycle-guard",
    resourceId: input.resourceId.value,
    lifecycleStatus: "archived",
    commandName: input.commandName,
    ...(input.archivedAt ? { archivedAt: input.archivedAt.value } : {}),
  });
}

function resourceDeletedNotFoundError(input: { resourceId: ResourceId }) {
  return domainError.notFound("resource", input.resourceId.value);
}

function validateResourceNetworkProfile(input: {
  resourceId?: ResourceId;
  kind: ResourceKindValue;
  services: ResourceServiceState[];
  networkProfile: ResourceNetworkProfileState;
  directPortAllowed: boolean;
}): Result<void> {
  const targetServiceName = input.networkProfile.targetServiceName;

  if (
    targetServiceName &&
    input.services.length > 0 &&
    !input.services.some((service) => service.name.equals(targetServiceName))
  ) {
    return err(
      resourceNetworkResolutionError("Network target service must be declared on the resource", {
        ...(input.resourceId ? { resourceId: input.resourceId.value } : {}),
        resourceKind: input.kind.value,
        targetServiceName: targetServiceName.value,
      }),
    );
  }

  if (
    input.kind.value === "compose-stack" &&
    input.services.length > 1 &&
    !input.networkProfile.targetServiceName
  ) {
    return err(
      resourceNetworkResolutionError(
        "Compose stack network profiles must declare a target service",
        {
          ...(input.resourceId ? { resourceId: input.resourceId.value } : {}),
          resourceKind: input.kind.value,
          serviceCount: input.services.length,
        },
      ),
    );
  }

  if (input.networkProfile.hostPort && input.networkProfile.exposureMode.value !== "direct-port") {
    return err(
      resourceNetworkResolutionError("Host port is valid only for direct-port resource exposure", {
        ...(input.resourceId ? { resourceId: input.resourceId.value } : {}),
        exposureMode: input.networkProfile.exposureMode.value,
      }),
    );
  }

  if (!input.directPortAllowed && input.networkProfile.exposureMode.value === "direct-port") {
    return err(
      resourceNetworkResolutionError("Direct-port resource exposure is not implemented", {
        ...(input.resourceId ? { resourceId: input.resourceId.value } : {}),
        exposureMode: input.networkProfile.exposureMode.value,
      }),
    );
  }

  return ok(undefined);
}

function serializedHealthCheckPolicy(
  policy: ResourceHealthCheckPolicyState,
): Record<string, unknown> {
  return {
    enabled: policy.enabled,
    type: policy.type.value,
    intervalSeconds: policy.intervalSeconds.value,
    timeoutSeconds: policy.timeoutSeconds.value,
    retries: policy.retries.value,
    startPeriodSeconds: policy.startPeriodSeconds.value,
    ...(policy.http
      ? {
          http: {
            method: policy.http.method.value,
            scheme: policy.http.scheme.value,
            host: policy.http.host.value,
            ...(policy.http.port ? { port: policy.http.port.value } : {}),
            path: policy.http.path.value,
            expectedStatusCode: policy.http.expectedStatusCode.value,
            ...(policy.http.expectedResponseText
              ? { expectedResponseText: policy.http.expectedResponseText.value }
              : {}),
          },
        }
      : {}),
    ...(policy.command ? { command: { command: policy.command.command.value } } : {}),
  };
}

function serializedRuntimeProfile(profile: ResourceRuntimeProfileState): Record<string, unknown> {
  return {
    strategy: profile.strategy.value,
    ...(profile.installCommand ? { installCommand: profile.installCommand.value } : {}),
    ...(profile.buildCommand ? { buildCommand: profile.buildCommand.value } : {}),
    ...(profile.startCommand ? { startCommand: profile.startCommand.value } : {}),
    ...(profile.runtimeName ? { runtimeName: profile.runtimeName.value } : {}),
    ...(profile.publishDirectory ? { publishDirectory: profile.publishDirectory.value } : {}),
    ...(profile.dockerfilePath ? { dockerfilePath: profile.dockerfilePath.value } : {}),
    ...(profile.dockerComposeFilePath
      ? { dockerComposeFilePath: profile.dockerComposeFilePath.value }
      : {}),
    ...(profile.buildTarget ? { buildTarget: profile.buildTarget.value } : {}),
    ...(profile.healthCheckPath ? { healthCheckPath: profile.healthCheckPath.value } : {}),
    ...(profile.healthCheck
      ? { healthCheck: serializedHealthCheckPolicy(profile.healthCheck) }
      : {}),
  };
}

function validateResourceRuntimeProfile(input: {
  resourceId?: ResourceId;
  runtimeProfile: ResourceRuntimeProfileState;
  enforceStrategySpecificPaths?: boolean;
}): Result<void> {
  const strategy = input.runtimeProfile.strategy.value;
  const commonDetails = {
    ...(input.resourceId ? { resourceId: input.resourceId.value } : {}),
    runtimePlanStrategy: strategy,
  };

  if (strategy === "static" && !input.runtimeProfile.publishDirectory) {
    return err(
      resourceRuntimeResolutionError("Static runtime profiles require publishDirectory", {
        ...commonDetails,
        field: "runtimeProfile.publishDirectory",
      }),
    );
  }

  if (
    input.enforceStrategySpecificPaths &&
    strategy === "dockerfile" &&
    !input.runtimeProfile.dockerfilePath
  ) {
    return err(
      resourceRuntimeResolutionError("Dockerfile runtime profiles require dockerfilePath", {
        ...commonDetails,
        field: "runtimeProfile.dockerfilePath",
      }),
    );
  }

  if (
    input.enforceStrategySpecificPaths &&
    strategy === "docker-compose" &&
    !input.runtimeProfile.dockerComposeFilePath
  ) {
    return err(
      resourceRuntimeResolutionError(
        "Docker Compose runtime profiles require dockerComposeFilePath",
        {
          ...commonDetails,
          field: "runtimeProfile.dockerComposeFilePath",
        },
      ),
    );
  }

  return ok(undefined);
}

export interface ResourceVisitor<TContext, TResult> {
  visitResource(resource: Resource, context: TContext): TResult;
}

type ResourceRehydrateState = Omit<
  ResourceState,
  "archiveReason" | "archivedAt" | "deletedAt" | "lifecycleStatus" | "variables"
> &
  Partial<Pick<ResourceState, "archiveReason" | "archivedAt" | "deletedAt" | "lifecycleStatus">> & {
    variables?: EnvironmentConfigSet;
  };

export class Resource extends AggregateRoot<ResourceState> {
  private constructor(state: ResourceState) {
    super(state);
  }

  static create(input: {
    id: ResourceId;
    projectId: ProjectId;
    environmentId: EnvironmentId;
    destinationId?: DestinationId;
    name: ResourceName;
    kind: ResourceKindValue;
    services?: ResourceServiceState[];
    sourceBinding?: ResourceSourceBindingState;
    runtimeProfile?: ResourceRuntimeProfileState;
    networkProfile?: ResourceNetworkProfileState;
    variables?: ResourceVariableState[];
    createdAt: CreatedAt;
    description?: DescriptionText;
  }): Result<Resource> {
    return ResourceSlug.fromName(input.name).andThen((slug) => {
      const services = input.services ?? [];
      const sourceBinding = input.sourceBinding
        ? ResourceSourceBinding.create(input.sourceBinding)
        : ok(undefined);
      if (sourceBinding.isErr()) {
        return err(sourceBinding.error);
      }
      const normalizedSourceBinding = sourceBinding.value?.toState();

      if (input.kind.value !== "compose-stack" && services.length > 1) {
        return err(
          domainError.validation("Only compose-stack resources can declare multiple services"),
        );
      }

      if (input.networkProfile) {
        const networkProfileValidation = validateResourceNetworkProfile({
          kind: input.kind,
          services,
          networkProfile: input.networkProfile,
          directPortAllowed: true,
        });
        if (networkProfileValidation.isErr()) {
          return err(networkProfileValidation.error);
        }
      }

      if (input.runtimeProfile) {
        const runtimeProfileValidation = validateResourceRuntimeProfile({
          runtimeProfile: input.runtimeProfile,
        });
        if (runtimeProfileValidation.isErr()) {
          return err(runtimeProfileValidation.error);
        }
      }

      const resource = new Resource({
        id: input.id,
        projectId: input.projectId,
        environmentId: input.environmentId,
        ...(input.destinationId ? { destinationId: input.destinationId } : {}),
        name: input.name,
        slug,
        kind: input.kind,
        services: [...services],
        ...(normalizedSourceBinding
          ? {
              sourceBinding: cloneResourceSourceBindingState(normalizedSourceBinding),
            }
          : {}),
        ...(input.runtimeProfile
          ? { runtimeProfile: cloneResourceRuntimeProfileState(input.runtimeProfile) }
          : {}),
        ...(input.networkProfile
          ? { networkProfile: cloneResourceNetworkProfileState(input.networkProfile) }
          : {}),
        variables: EnvironmentConfigSet.rehydrate(input.variables ?? []),
        lifecycleStatus: ResourceLifecycleStatusValue.active(),
        createdAt: input.createdAt,
        ...(input.description ? { description: input.description } : {}),
      });
      resource.recordDomainEvent("resource-created", input.createdAt, {
        resourceId: input.id.value,
        projectId: input.projectId.value,
        environmentId: input.environmentId.value,
        ...(input.destinationId ? { destinationId: input.destinationId.value } : {}),
        name: input.name.value,
        slug: slug.value,
        kind: input.kind.value,
        services: services.map((service) => ({
          name: service.name.value,
          kind: service.kind.value,
        })),
        ...(normalizedSourceBinding
          ? {
              sourceBinding: {
                kind: normalizedSourceBinding.kind.value,
                locator: normalizedSourceBinding.locator.value,
                displayName: normalizedSourceBinding.displayName.value,
                ...(ResourceSourceBinding.metadataFromState(normalizedSourceBinding)
                  ? {
                      metadata: ResourceSourceBinding.metadataFromState(normalizedSourceBinding),
                    }
                  : {}),
              },
            }
          : {}),
        ...(input.runtimeProfile
          ? { runtimeProfile: serializedRuntimeProfile(input.runtimeProfile) }
          : {}),
        ...(input.networkProfile
          ? { networkProfile: serializedNetworkProfile(input.networkProfile) }
          : {}),
        createdAt: input.createdAt.value,
      });
      return ok(resource);
    });
  }

  static rehydrate(state: ResourceRehydrateState): Resource {
    return new Resource({
      ...state,
      services: [...state.services],
      ...(state.sourceBinding
        ? {
            sourceBinding: {
              ...cloneResourceSourceBindingState(state.sourceBinding),
            },
          }
        : {}),
      ...(state.runtimeProfile
        ? { runtimeProfile: cloneResourceRuntimeProfileState(state.runtimeProfile) }
        : {}),
      ...(state.networkProfile
        ? { networkProfile: cloneResourceNetworkProfileState(state.networkProfile) }
        : {}),
      variables: EnvironmentConfigSet.rehydrate(state.variables?.toState() ?? []),
      lifecycleStatus: state.lifecycleStatus ?? ResourceLifecycleStatusValue.active(),
      ...(state.archivedAt ? { archivedAt: state.archivedAt } : {}),
      ...(state.archiveReason ? { archiveReason: state.archiveReason } : {}),
      ...(state.deletedAt ? { deletedAt: state.deletedAt } : {}),
    });
  }

  private rejectInactiveResource(commandName: string): Result<void> {
    if (this.state.lifecycleStatus.isDeleted()) {
      return err(resourceDeletedNotFoundError({ resourceId: this.state.id }));
    }

    if (this.state.lifecycleStatus.isArchived()) {
      return err(
        resourceArchivedError({
          resourceId: this.state.id,
          commandName,
          ...(this.state.archivedAt ? { archivedAt: this.state.archivedAt } : {}),
        }),
      );
    }

    return ok(undefined);
  }

  ensureCanCreateDeployment(): Result<void> {
    return this.rejectInactiveResource("deployments.create");
  }

  setVariable(input: {
    key: ConfigKey;
    value: ConfigValueText;
    kind: VariableKindValue;
    exposure: VariableExposureValue;
    isSecret?: boolean;
    updatedAt: UpdatedAt;
  }): Result<void> {
    const active = this.rejectInactiveResource("resources.set-variable");
    if (active.isErr()) {
      return active;
    }

    const configSet = EnvironmentConfigSet.rehydrate(this.state.variables.toState());
    return configSet
      .setEntry({
        ...input,
        scope: ConfigScopeValue.rehydrate("resource"),
      })
      .map((nextEntry) => {
        this.state.variables = configSet;
        this.recordDomainEvent("resource-variable-set", input.updatedAt, {
          resourceId: this.state.id.value,
          projectId: this.state.projectId.value,
          environmentId: this.state.environmentId.value,
          variableKey: nextEntry.toState().key.value,
          variableExposure: nextEntry.toState().exposure.value,
          variableKind: nextEntry.toState().kind.value,
          isSecret: nextEntry.toState().isSecret,
          configuredAt: input.updatedAt.value,
        });
        return undefined;
      });
  }

  unsetVariable(input: {
    key: ConfigKey;
    exposure: VariableExposureValue;
    updatedAt: UpdatedAt;
  }): Result<void> {
    const active = this.rejectInactiveResource("resources.unset-variable");
    if (active.isErr()) {
      return active;
    }

    const configSet = EnvironmentConfigSet.rehydrate(this.state.variables.toState());
    return configSet
      .unsetEntry({
        key: input.key,
        exposure: input.exposure,
        scope: ConfigScopeValue.rehydrate("resource"),
      })
      .map(() => {
        this.state.variables = configSet;
        this.recordDomainEvent("resource-variable-unset", input.updatedAt, {
          resourceId: this.state.id.value,
          projectId: this.state.projectId.value,
          environmentId: this.state.environmentId.value,
          variableKey: input.key.value,
          variableExposure: input.exposure.value,
          removedAt: input.updatedAt.value,
        });
        return undefined;
      });
  }

  materializeEffectiveEnvironmentSnapshot(input: {
    environmentId: EnvironmentId;
    snapshotId: EnvironmentSnapshotId;
    createdAt: GeneratedAt;
    inherited?: EnvironmentConfigSnapshotEntryState[];
  }): EnvironmentSnapshot {
    return this.state.variables.materializeSnapshot({
      environmentId: input.environmentId,
      snapshotId: input.snapshotId,
      createdAt: input.createdAt,
      ...(input.inherited ? { inherited: input.inherited } : {}),
    });
  }

  archive(input: { archivedAt: ArchivedAt; reason?: ArchiveReason }): Result<{ changed: boolean }> {
    if (this.state.lifecycleStatus.isArchived()) {
      return ok({ changed: false });
    }

    const lifecycleStatus = this.state.lifecycleStatus.archive();
    if (lifecycleStatus.isErr()) {
      return err(lifecycleStatus.error);
    }

    this.state.lifecycleStatus = lifecycleStatus.value;
    this.state.archivedAt = input.archivedAt;
    if (input.reason) {
      this.state.archiveReason = input.reason;
    } else {
      delete this.state.archiveReason;
    }

    this.recordDomainEvent("resource-archived", input.archivedAt, {
      resourceId: this.state.id.value,
      projectId: this.state.projectId.value,
      environmentId: this.state.environmentId.value,
      resourceSlug: this.state.slug.value,
      archivedAt: input.archivedAt.value,
      ...(input.reason ? { reason: input.reason.value } : {}),
    });

    return ok({ changed: true });
  }

  delete(input: { deletedAt: DeletedAt }): Result<{ changed: boolean }> {
    if (this.state.lifecycleStatus.isDeleted()) {
      return ok({ changed: false });
    }

    if (this.state.lifecycleStatus.isActive()) {
      return err(
        domainError.resourceDeleteBlocked("Active resources must be archived before deletion", {
          phase: "resource-deletion-guard",
          resourceId: this.state.id.value,
          lifecycleStatus: "active",
          deletionBlockers: ["active-resource"],
        }),
      );
    }

    const lifecycleStatus = this.state.lifecycleStatus.delete();
    if (lifecycleStatus.isErr()) {
      return err(lifecycleStatus.error);
    }

    this.state.lifecycleStatus = lifecycleStatus.value;
    this.state.deletedAt = input.deletedAt;

    this.recordDomainEvent("resource-deleted", input.deletedAt, {
      resourceId: this.state.id.value,
      projectId: this.state.projectId.value,
      environmentId: this.state.environmentId.value,
      resourceSlug: this.state.slug.value,
      deletedAt: input.deletedAt.value,
    });

    return ok({ changed: true });
  }

  configureRuntimeProfile(input: {
    runtimeProfile: ResourceRuntimeProfileState;
    configuredAt: UpdatedAt;
  }): Result<void> {
    const lifecycleGuard = this.rejectInactiveResource("resources.configure-runtime");
    if (lifecycleGuard.isErr()) {
      return err(lifecycleGuard.error);
    }

    if (input.runtimeProfile.healthCheckPath || input.runtimeProfile.healthCheck) {
      return err(
        resourceRuntimeResolutionError(
          "Runtime profile changes must not mutate resource health policy",
          {
            resourceId: this.state.id.value,
            field: input.runtimeProfile.healthCheck
              ? "runtimeProfile.healthCheck"
              : "runtimeProfile.healthCheckPath",
          },
        ),
      );
    }

    const validation = validateResourceRuntimeProfile({
      resourceId: this.state.id,
      runtimeProfile: input.runtimeProfile,
      enforceStrategySpecificPaths: true,
    });
    if (validation.isErr()) {
      return err(validation.error);
    }

    const currentProfile = this.state.runtimeProfile;
    this.state.runtimeProfile = {
      ...cloneResourceRuntimeProfileState(input.runtimeProfile),
      ...(currentProfile?.healthCheckPath
        ? { healthCheckPath: currentProfile.healthCheckPath }
        : {}),
      ...(currentProfile?.healthCheck
        ? { healthCheck: cloneResourceHealthCheckPolicyState(currentProfile.healthCheck) }
        : {}),
    };

    this.recordDomainEvent("resource-runtime-configured", input.configuredAt, {
      resourceId: this.state.id.value,
      projectId: this.state.projectId.value,
      environmentId: this.state.environmentId.value,
      runtimePlanStrategy: input.runtimeProfile.strategy.value,
      ...(input.runtimeProfile.runtimeName
        ? { runtimeName: input.runtimeProfile.runtimeName.value }
        : {}),
      configuredAt: input.configuredAt.value,
    });

    return ok(undefined);
  }

  configureHealthPolicy(input: {
    policy: ResourceHealthCheckPolicyState;
    configuredAt: UpdatedAt;
    defaultStrategy: RuntimePlanStrategyValue;
  }): Result<void> {
    const lifecycleGuard = this.rejectInactiveResource("resources.configure-health");
    if (lifecycleGuard.isErr()) {
      return err(lifecycleGuard.error);
    }

    if (input.policy.enabled && input.policy.type.value !== "http") {
      return err(
        domainError.validation("Only HTTP resource health policies are supported", {
          phase: "health-policy-resolution",
          resourceId: this.state.id.value,
          healthCheckType: input.policy.type.value,
        }),
      );
    }

    if (input.policy.enabled && !input.policy.http) {
      return err(
        domainError.validation("Enabled HTTP health policy requires HTTP configuration", {
          phase: "health-policy-resolution",
          resourceId: this.state.id.value,
          healthCheckType: input.policy.type.value,
        }),
      );
    }

    const currentProfile = this.state.runtimeProfile;
    const currentProfileWithoutHealth = currentProfile
      ? (() => {
          const { healthCheck, healthCheckPath, ...rest } =
            cloneResourceRuntimeProfileState(currentProfile);
          void healthCheck;
          void healthCheckPath;
          return rest;
        })()
      : undefined;
    const nextPolicy = cloneResourceHealthCheckPolicyState(input.policy);
    this.state.runtimeProfile = {
      ...(currentProfileWithoutHealth ?? {}),
      strategy: currentProfile?.strategy ?? input.defaultStrategy,
      ...(input.policy.enabled && input.policy.http
        ? { healthCheckPath: input.policy.http.path }
        : {}),
      healthCheck: nextPolicy,
    };

    this.recordDomainEvent("resource-health-policy-configured", input.configuredAt, {
      resourceId: this.state.id.value,
      projectId: this.state.projectId.value,
      environmentId: this.state.environmentId.value,
      enabled: input.policy.enabled,
      type: input.policy.type.value,
      ...(input.policy.http
        ? {
            http: {
              method: input.policy.http.method.value,
              scheme: input.policy.http.scheme.value,
              host: input.policy.http.host.value,
              ...(input.policy.http.port ? { port: input.policy.http.port.value } : {}),
              path: input.policy.http.path.value,
              expectedStatusCode: input.policy.http.expectedStatusCode.value,
              ...(input.policy.http.expectedResponseText
                ? { expectedResponseText: input.policy.http.expectedResponseText.value }
                : {}),
            },
          }
        : {}),
      intervalSeconds: input.policy.intervalSeconds.value,
      timeoutSeconds: input.policy.timeoutSeconds.value,
      retries: input.policy.retries.value,
      startPeriodSeconds: input.policy.startPeriodSeconds.value,
      configuredAt: input.configuredAt.value,
    });

    return ok(undefined);
  }

  configureNetworkProfile(input: {
    networkProfile: ResourceNetworkProfileState;
    configuredAt: UpdatedAt;
  }): Result<void> {
    const lifecycleGuard = this.rejectInactiveResource("resources.configure-network");
    if (lifecycleGuard.isErr()) {
      return err(lifecycleGuard.error);
    }

    const validation = validateResourceNetworkProfile({
      resourceId: this.state.id,
      kind: this.state.kind,
      services: this.state.services,
      networkProfile: input.networkProfile,
      directPortAllowed: false,
    });
    if (validation.isErr()) {
      return err(validation.error);
    }

    this.state.networkProfile = cloneResourceNetworkProfileState(input.networkProfile);

    this.recordDomainEvent("resource-network-configured", input.configuredAt, {
      resourceId: this.state.id.value,
      projectId: this.state.projectId.value,
      environmentId: this.state.environmentId.value,
      ...serializedNetworkProfile(input.networkProfile),
      configuredAt: input.configuredAt.value,
    });

    return ok(undefined);
  }

  configureSourceBinding(input: {
    sourceBinding: ResourceSourceBindingState;
    configuredAt: UpdatedAt;
  }): Result<void> {
    const lifecycleGuard = this.rejectInactiveResource("resources.configure-source");
    if (lifecycleGuard.isErr()) {
      return err(lifecycleGuard.error);
    }

    const sourceBinding = ResourceSourceBinding.create(input.sourceBinding);
    if (sourceBinding.isErr()) {
      return err(sourceBinding.error);
    }

    const normalizedSourceBinding = sourceBinding.value.toState();
    this.state.sourceBinding = cloneResourceSourceBindingState(normalizedSourceBinding);

    this.recordDomainEvent("resource-source-configured", input.configuredAt, {
      resourceId: this.state.id.value,
      projectId: this.state.projectId.value,
      environmentId: this.state.environmentId.value,
      sourceKind: normalizedSourceBinding.kind.value,
      sourceLocator: normalizedSourceBinding.locator.value,
      configuredAt: input.configuredAt.value,
    });

    return ok(undefined);
  }

  accept<TContext, TResult>(
    visitor: ResourceVisitor<TContext, TResult>,
    context: TContext,
  ): TResult {
    return visitor.visitResource(this, context);
  }

  toState(): ResourceState {
    return {
      ...this.state,
      services: [...this.state.services],
      ...(this.state.sourceBinding
        ? {
            sourceBinding: {
              ...cloneResourceSourceBindingState(this.state.sourceBinding),
            },
          }
        : {}),
      ...(this.state.runtimeProfile
        ? { runtimeProfile: cloneResourceRuntimeProfileState(this.state.runtimeProfile) }
        : {}),
      ...(this.state.networkProfile
        ? { networkProfile: cloneResourceNetworkProfileState(this.state.networkProfile) }
        : {}),
      variables: EnvironmentConfigSet.rehydrate(this.state.variables.toState()),
    };
  }
}
