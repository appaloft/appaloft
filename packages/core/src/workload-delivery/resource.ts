import { AggregateRoot } from "../shared/entity";
import { domainError } from "../shared/errors";
import {
  type DestinationId,
  type EnvironmentId,
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
  type HealthCheckHttpMethodValue,
  type HealthCheckSchemeValue,
  type HealthCheckTypeValue,
  type ResourceExposureModeValue,
  type ResourceKindValue,
  type ResourceNetworkProtocolValue,
  type ResourceServiceKindValue,
  type RuntimePlanStrategyValue,
} from "../shared/state-machine";
import { type CreatedAt } from "../shared/temporal";
import {
  type CommandText,
  type DescriptionText,
  type HealthCheckHostText,
  type HealthCheckPathText,
  type HealthCheckResponseText,
  type ResourceName,
  type ResourceServiceName,
  ResourceSlug,
} from "../shared/text-values";
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
  healthCheckPath?: HealthCheckPathText;
  healthCheck?: ResourceHealthCheckPolicyState;
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

export interface ResourceVisitor<TContext, TResult> {
  visitResource(resource: Resource, context: TContext): TResult;
}

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

      if (
        input.networkProfile?.targetServiceName &&
        services.length > 0 &&
        !services.some((service) =>
          service.name.equals(input.networkProfile?.targetServiceName as ResourceServiceName),
        )
      ) {
        return err(
          domainError.validation("Network target service must be declared on the resource", {
            phase: "resource-network-resolution",
            resourceKind: input.kind.value,
            targetServiceName: input.networkProfile.targetServiceName.value,
          }),
        );
      }

      if (
        input.networkProfile &&
        input.kind.value === "compose-stack" &&
        services.length > 1 &&
        !input.networkProfile.targetServiceName
      ) {
        return err(
          domainError.validation("Compose stack network profiles must declare a target service", {
            phase: "resource-network-resolution",
            resourceKind: input.kind.value,
            serviceCount: services.length,
          }),
        );
      }

      if (
        input.networkProfile?.hostPort &&
        input.networkProfile.exposureMode.value !== "direct-port"
      ) {
        return err(
          domainError.validation("Host port is valid only for direct-port resource exposure", {
            phase: "resource-network-resolution",
            exposureMode: input.networkProfile.exposureMode.value,
          }),
        );
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
        ...(input.networkProfile ? { networkProfile: { ...input.networkProfile } } : {}),
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
          ? {
              runtimeProfile: {
                strategy: input.runtimeProfile.strategy.value,
                ...(input.runtimeProfile.installCommand
                  ? { installCommand: input.runtimeProfile.installCommand.value }
                  : {}),
                ...(input.runtimeProfile.buildCommand
                  ? { buildCommand: input.runtimeProfile.buildCommand.value }
                  : {}),
                ...(input.runtimeProfile.startCommand
                  ? { startCommand: input.runtimeProfile.startCommand.value }
                  : {}),
                ...(input.runtimeProfile.healthCheckPath
                  ? { healthCheckPath: input.runtimeProfile.healthCheckPath.value }
                  : {}),
                ...(input.runtimeProfile.healthCheck
                  ? { healthCheck: serializedHealthCheckPolicy(input.runtimeProfile.healthCheck) }
                  : {}),
              },
            }
          : {}),
        ...(input.networkProfile
          ? {
              networkProfile: {
                internalPort: input.networkProfile.internalPort.value,
                upstreamProtocol: input.networkProfile.upstreamProtocol.value,
                exposureMode: input.networkProfile.exposureMode.value,
                ...(input.networkProfile.targetServiceName
                  ? { targetServiceName: input.networkProfile.targetServiceName.value }
                  : {}),
                ...(input.networkProfile.hostPort
                  ? { hostPort: input.networkProfile.hostPort.value }
                  : {}),
              },
            }
          : {}),
        createdAt: input.createdAt.value,
      });
      return ok(resource);
    });
  }

  static rehydrate(state: ResourceState): Resource {
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
      ...(state.networkProfile ? { networkProfile: { ...state.networkProfile } } : {}),
    });
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
      ...(this.state.networkProfile ? { networkProfile: { ...this.state.networkProfile } } : {}),
    };
  }
}
