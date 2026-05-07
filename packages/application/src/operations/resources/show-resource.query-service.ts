import {
  type DomainError,
  domainError,
  err,
  ok,
  type ResourceAccessProfileState,
  type ResourceAutoDeployPolicyState,
  ResourceByIdSpec,
  type ResourceHealthCheckPolicyState,
  ResourceId,
  type ResourceNetworkProfileState,
  type ResourceRuntimeProfileState,
  type ResourceSourceBindingState,
  type ResourceState,
  type Result,
  SourceBindingFingerprint,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type Clock,
  type DeploymentReadModel,
  type DeploymentSummary,
  type RequestedDeploymentHealthCheck,
  type ResourceAccessProfile,
  type ResourceAccessSummary,
  type ResourceDetail,
  type ResourceDetailAutoDeployPolicy,
  type ResourceDetailDeploymentContext,
  type ResourceDetailIdentity,
  type ResourceDetailNetworkProfile,
  type ResourceDetailProfileDiagnostic,
  type ResourceDetailRuntimeProfile,
  type ResourceDetailSourceProfile,
  type ResourceRepository,
  type ResourceStorageAttachmentSummary,
  type ResourceSummary,
} from "../../ports";
import { tokens } from "../../tokens";
import { type ListResourcesQueryService } from "./list-resources.query-service";
import {
  compareResourceProfileDrift,
  resourceProfileFromDeploymentSnapshot,
} from "./resource-profile-drift";
import { type ShowResourceQuery } from "./show-resource.query";

function withShowResourceDetails(
  error: DomainError,
  details: Record<string, string | number | boolean | null>,
): DomainError {
  return {
    ...error,
    details: {
      ...(error.details ?? {}),
      queryName: "resources.show",
      ...details,
    },
  };
}

function resourceReadNotFound(resourceId: string): DomainError {
  return withShowResourceDetails(domainError.notFound("resource", resourceId), {
    phase: "resource-read",
    resourceId,
  });
}

function resourceReadInfraError(resourceId: string, error: unknown): DomainError {
  return domainError.infra("Resource detail could not be assembled", {
    queryName: "resources.show",
    phase: "resource-read",
    resourceId,
    reason: error instanceof Error ? error.message : "unknown",
  });
}

function latestDeployment(deployments: DeploymentSummary[]): DeploymentSummary | undefined {
  return [...deployments].sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
}

function safeMetadata(
  metadata: Record<string, string> | undefined,
): Record<string, string> | undefined {
  const entries = Object.entries(metadata ?? {}).map(([key, value]) => [
    key,
    /token|secret|password|credential|private|deploy[-_]?key/i.test(key) ? "********" : value,
  ]);

  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function sourceProfileFromState(
  source: ResourceSourceBindingState | undefined,
): ResourceDetailSourceProfile | undefined {
  if (!source) {
    return undefined;
  }

  const metadata = safeMetadata(source.metadata);
  return {
    kind: source.kind.value,
    locator: source.locator.value,
    displayName: source.displayName.value,
    sourceBindingFingerprint: SourceBindingFingerprint.fromSourceBindingState(source).value,
    ...(source.gitRef ? { gitRef: source.gitRef.value } : {}),
    ...(source.commitSha ? { commitSha: source.commitSha.value } : {}),
    ...(source.baseDirectory ? { baseDirectory: source.baseDirectory.value } : {}),
    ...(source.originalLocator ? { originalLocator: source.originalLocator.value } : {}),
    ...(source.repositoryId ? { repositoryId: source.repositoryId.value } : {}),
    ...(source.repositoryFullName ? { repositoryFullName: source.repositoryFullName.value } : {}),
    ...(source.defaultBranch ? { defaultBranch: source.defaultBranch.value } : {}),
    ...(source.imageName ? { imageName: source.imageName.value } : {}),
    ...(source.imageTag ? { imageTag: source.imageTag.value } : {}),
    ...(source.imageDigest ? { imageDigest: source.imageDigest.value } : {}),
    ...(metadata ? { metadata } : {}),
  };
}

function autoDeployPolicyFromState(
  policy: ResourceAutoDeployPolicyState | undefined,
): ResourceDetailAutoDeployPolicy | undefined {
  if (!policy) {
    return undefined;
  }

  return {
    status: policy.status.value,
    triggerKind: policy.triggerKind.value,
    refs: policy.refs.map((ref) => ref.value),
    eventKinds: policy.eventKinds.map((eventKind) => eventKind.value),
    sourceBindingFingerprint: policy.sourceBindingFingerprint.value,
    ...(policy.blockedReason ? { blockedReason: policy.blockedReason.value } : {}),
    ...(policy.genericWebhookSecretRef
      ? { genericWebhookSecretRef: policy.genericWebhookSecretRef.value }
      : {}),
    ...(policy.dedupeWindowSeconds
      ? { dedupeWindowSeconds: policy.dedupeWindowSeconds.value }
      : {}),
    updatedAt: policy.updatedAt.value,
  };
}

function healthCheckFromState(
  policy: ResourceHealthCheckPolicyState | undefined,
): RequestedDeploymentHealthCheck | undefined {
  if (!policy) {
    return undefined;
  }

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

function runtimeProfileFromState(
  profile: ResourceRuntimeProfileState | undefined,
): ResourceDetailRuntimeProfile | undefined {
  if (!profile) {
    return undefined;
  }

  const healthCheck = healthCheckFromState(profile.healthCheck);
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
    ...(healthCheck ? { healthCheck } : {}),
  };
}

function networkProfileFromState(
  profile: ResourceNetworkProfileState | undefined,
): ResourceDetailNetworkProfile | undefined {
  if (!profile) {
    return undefined;
  }

  return {
    internalPort: profile.internalPort.value,
    upstreamProtocol: profile.upstreamProtocol.value,
    exposureMode: profile.exposureMode.value,
    ...(profile.targetServiceName ? { targetServiceName: profile.targetServiceName.value } : {}),
    ...(profile.hostPort ? { hostPort: profile.hostPort.value } : {}),
  };
}

function accessProfileFromState(
  profile: ResourceAccessProfileState | undefined,
): ResourceAccessProfile | undefined {
  if (!profile) {
    return undefined;
  }

  return {
    generatedAccessMode: profile.generatedAccessMode.value,
    pathPrefix: profile.pathPrefix.value,
  };
}

function storageAttachmentsFromState(state: ResourceState): ResourceStorageAttachmentSummary[] {
  return state.storageAttachments.map((attachment) => ({
    id: attachment.id.value,
    storageVolumeId: attachment.storageVolumeId.value,
    destinationPath: attachment.destinationPath.value,
    mountMode: attachment.mountMode.value,
    attachedAt: attachment.attachedAt.value,
  }));
}

function identityFromState(
  state: ResourceState,
  summary: ResourceSummary | undefined,
  deployment: DeploymentSummary | undefined,
): ResourceDetailIdentity {
  const identity: ResourceDetailIdentity = {
    id: state.id.value,
    projectId: state.projectId.value,
    environmentId: state.environmentId.value,
    ...(state.destinationId ? { destinationId: state.destinationId.value } : {}),
    name: state.name.value,
    slug: state.slug.value,
    kind: state.kind.value,
    ...(state.description ? { description: state.description.value } : {}),
    createdAt: state.createdAt.value,
    services: state.services.map((service) => ({
      name: service.name.value,
      kind: service.kind.value,
    })),
    deploymentCount: summary?.deploymentCount ?? (deployment ? 1 : 0),
  };

  const lastDeploymentId = summary?.lastDeploymentId ?? deployment?.id;
  const lastDeploymentStatus = summary?.lastDeploymentStatus ?? deployment?.status;
  if (lastDeploymentId) {
    identity.lastDeploymentId = lastDeploymentId;
  }
  if (lastDeploymentStatus) {
    identity.lastDeploymentStatus = lastDeploymentStatus;
  }

  return identity;
}

function deploymentContextFromSummary(
  deployment: DeploymentSummary,
): ResourceDetailDeploymentContext {
  return {
    id: deployment.id,
    status: deployment.status,
    createdAt: deployment.createdAt,
    ...(deployment.startedAt ? { startedAt: deployment.startedAt } : {}),
    ...(deployment.finishedAt ? { finishedAt: deployment.finishedAt } : {}),
    serverId: deployment.serverId,
    destinationId: deployment.destinationId,
  };
}

function diagnosticsFromState(input: {
  state: ResourceState;
  source?: ResourceDetailSourceProfile;
  runtimeProfile?: ResourceDetailRuntimeProfile;
  networkProfile?: ResourceDetailNetworkProfile;
  accessProfile?: ResourceAccessProfile;
  deployment?: DeploymentSummary;
}): ResourceDetailProfileDiagnostic[] {
  const diagnostics: ResourceDetailProfileDiagnostic[] = [];
  const { state } = input;

  if (!state.sourceBinding) {
    diagnostics.push({
      code: "resource_source_profile_missing",
      severity: "warning",
      message: "Resource source profile is not configured.",
      path: "source",
    });
  }

  if (!state.runtimeProfile) {
    diagnostics.push({
      code: "resource_runtime_profile_missing",
      severity: "warning",
      message: "Resource runtime profile is not configured.",
      path: "runtimeProfile",
    });
  }

  if (!state.networkProfile) {
    diagnostics.push({
      code: "resource_network_profile_missing",
      severity: "warning",
      message: "Resource network profile is not configured.",
      path: "networkProfile",
    });
  }

  if (state.runtimeProfile?.strategy.value === "static" && !state.runtimeProfile.publishDirectory) {
    diagnostics.push({
      code: "resource_static_publish_directory_missing",
      severity: "warning",
      message: "Static runtime profile has no publish directory.",
      path: "runtimeProfile.publishDirectory",
    });
  }

  if (input.deployment) {
    diagnostics.push(
      ...compareResourceProfileDrift({
        resource: {
          ...(input.source ? { source: input.source } : {}),
          ...(input.runtimeProfile ? { runtimeProfile: input.runtimeProfile } : {}),
          ...(input.networkProfile ? { networkProfile: input.networkProfile } : {}),
          ...(input.accessProfile ? { accessProfile: input.accessProfile } : {}),
        },
        profile: resourceProfileFromDeploymentSnapshot(input.deployment),
        comparison: "resource-vs-latest-snapshot",
        comparedValueKey: "deploymentSnapshotValue",
        latestDeploymentId: input.deployment.id,
        blocksDeploymentAdmission: false,
      }),
    );
  }

  return diagnostics;
}

@injectable()
export class ShowResourceQueryService {
  constructor(
    @inject(tokens.resourceRepository)
    private readonly resourceRepository: ResourceRepository,
    @inject(tokens.listResourcesQueryService)
    private readonly listResourcesQueryService: ListResourcesQueryService,
    @inject(tokens.deploymentReadModel)
    private readonly deploymentReadModel: DeploymentReadModel,
    @inject(tokens.clock)
    private readonly clock: Clock,
  ) {}

  async execute(
    context: ExecutionContext,
    query: ShowResourceQuery,
  ): Promise<Result<ResourceDetail>> {
    const resourceIdResult = ResourceId.create(query.resourceId);
    if (resourceIdResult.isErr()) {
      return err(
        withShowResourceDetails(resourceIdResult.error, {
          phase: "query-validation",
          resourceId: query.resourceId,
        }),
      );
    }

    const repositoryContext = toRepositoryContext(context);

    try {
      const resource = await this.resourceRepository.findOne(
        repositoryContext,
        ResourceByIdSpec.create(resourceIdResult.value),
      );

      if (!resource) {
        return err(resourceReadNotFound(query.resourceId));
      }

      const state = resource.toState();
      if (state.lifecycleStatus.isDeleted()) {
        return err(resourceReadNotFound(query.resourceId));
      }

      const summary = (await this.listResourcesQueryService.execute(context)).items.find(
        (candidate) => candidate.id === query.resourceId,
      );
      const deployments = query.includeLatestDeployment
        ? await this.deploymentReadModel.list(repositoryContext, { resourceId: query.resourceId })
        : [];
      const deployment = latestDeployment(deployments);
      const source = sourceProfileFromState(state.sourceBinding);
      const autoDeployPolicy = autoDeployPolicyFromState(state.autoDeployPolicy);
      const runtimeProfile = runtimeProfileFromState(state.runtimeProfile);
      const networkProfile = networkProfileFromState(state.networkProfile);
      const accessProfile = accessProfileFromState(state.accessProfile);
      const storageAttachments = storageAttachmentsFromState(state);
      const healthPolicy = healthCheckFromState(state.runtimeProfile?.healthCheck);
      const accessSummary: ResourceAccessSummary | undefined = query.includeAccessSummary
        ? summary?.accessSummary
        : undefined;

      return ok({
        schemaVersion: "resources.show/v1",
        resource: identityFromState(state, summary, deployment),
        ...(source ? { source } : {}),
        ...(autoDeployPolicy ? { autoDeployPolicy } : {}),
        ...(runtimeProfile ? { runtimeProfile } : {}),
        ...(networkProfile ? { networkProfile } : {}),
        ...(accessProfile ? { accessProfile } : {}),
        ...(storageAttachments.length > 0 ? { storageAttachments } : {}),
        ...(healthPolicy ? { healthPolicy } : {}),
        ...(accessSummary ? { accessSummary } : {}),
        ...(deployment ? { latestDeployment: deploymentContextFromSummary(deployment) } : {}),
        lifecycle: {
          status: state.lifecycleStatus.value,
          ...(state.archivedAt ? { archivedAt: state.archivedAt.value } : {}),
        },
        diagnostics: query.includeProfileDiagnostics
          ? diagnosticsFromState({
              state,
              ...(source ? { source } : {}),
              ...(runtimeProfile ? { runtimeProfile } : {}),
              ...(networkProfile ? { networkProfile } : {}),
              ...(accessProfile ? { accessProfile } : {}),
              ...(deployment ? { deployment } : {}),
            })
          : [],
        generatedAt: this.clock.now(),
      });
    } catch (error) {
      return err(resourceReadInfraError(query.resourceId, error));
    }
  }
}
