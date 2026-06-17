import {
  type ResourceHealthCheckPolicyState,
  type ResourceNetworkProfileState,
  type ResourceRuntimeProfileState,
  type ResourceSourceBindingState,
  type ResourceState,
} from "@appaloft/core";

import { type EnvironmentDuplicateDeferredDecisionSummary } from "../../ports";
import { type CreateResourceCommandInput } from "../resources/create-resource.schema";

export function createResourceInputFromSource(
  source: ResourceState,
  targetEnvironmentId: string,
): CreateResourceCommandInput {
  return {
    projectId: source.projectId.value,
    environmentId: targetEnvironmentId,
    ...(source.destinationId ? { destinationId: source.destinationId.value } : {}),
    name: source.name.value,
    kind: source.kind.value,
    ...(source.description ? { description: source.description.value } : {}),
    ...(source.services.length
      ? {
          services: source.services.map((service) => ({
            name: service.name.value,
            kind: service.kind.value,
          })),
        }
      : {}),
    ...(source.sourceBinding ? { source: sourceBindingInput(source.sourceBinding) } : {}),
    ...(source.runtimeProfile
      ? { runtimeProfile: runtimeProfileInput(source.runtimeProfile) }
      : {}),
    ...(source.networkProfile
      ? { networkProfile: networkProfileInput(source.networkProfile) }
      : {}),
  };
}

export function deferredResourceProfileDecisions(
  source: ResourceState,
): EnvironmentDuplicateDeferredDecisionSummary[] {
  const decisions: EnvironmentDuplicateDeferredDecisionSummary[] = [];
  const sourceId = source.id.value;

  if (source.accessProfile) {
    decisions.push({
      kind: "access-profile",
      sourceId,
      decision: "defer",
      reason:
        "Resource access profile requires route/access apply support before it can be copied.",
    });
  }

  if (source.storageAttachments.length > 0) {
    decisions.push({
      kind: "storage",
      sourceId,
      decision: "defer",
      reason: "Storage attachments require explicit storage data and mount decisions.",
    });
  }

  if (source.variables.toState().length > 0) {
    decisions.push({
      kind: "resource-variable",
      sourceId,
      decision: "defer",
      reason: "Resource variables may contain secret material and must be reviewed before copying.",
    });
  }

  if (source.autoDeployPolicy) {
    decisions.push({
      kind: "auto-deploy-policy",
      sourceId,
      decision: "defer",
      reason: "Auto deploy policy requires explicit target branch and event policy confirmation.",
    });
  }

  if (source.runtimeProfile?.healthCheck?.type.value === "command") {
    decisions.push({
      kind: "runtime-health-check",
      sourceId,
      decision: "defer",
      reason: "Command health checks are not part of the create-resource apply surface yet.",
    });
  }

  return decisions;
}

function sourceBindingInput(
  sourceBinding: ResourceSourceBindingState,
): NonNullable<CreateResourceCommandInput["source"]> {
  const versionReference = sourceBinding.versionReference?.toState();
  return {
    kind: sourceBinding.kind.value,
    locator: sourceBinding.locator.value,
    displayName: sourceBinding.displayName.value,
    ...(sourceBinding.gitRef ? { gitRef: sourceBinding.gitRef.value } : {}),
    ...(sourceBinding.commitSha ? { commitSha: sourceBinding.commitSha.value } : {}),
    ...(sourceBinding.baseDirectory ? { baseDirectory: sourceBinding.baseDirectory.value } : {}),
    ...(sourceBinding.originalLocator
      ? { originalLocator: sourceBinding.originalLocator.value }
      : {}),
    ...(sourceBinding.repositoryId ? { repositoryId: sourceBinding.repositoryId.value } : {}),
    ...(sourceBinding.repositoryFullName
      ? { repositoryFullName: sourceBinding.repositoryFullName.value }
      : {}),
    ...(sourceBinding.defaultBranch ? { defaultBranch: sourceBinding.defaultBranch.value } : {}),
    ...(sourceBinding.imageName ? { imageName: sourceBinding.imageName.value } : {}),
    ...(sourceBinding.imageTag ? { imageTag: sourceBinding.imageTag.value } : {}),
    ...(sourceBinding.imageDigest ? { imageDigest: sourceBinding.imageDigest.value } : {}),
    ...(versionReference
      ? {
          version: versionReference.value.value,
          versionKind: versionReference.referenceKind.value,
        }
      : {}),
    ...(sourceBinding.metadata ? { metadata: { ...sourceBinding.metadata } } : {}),
  };
}

function runtimeProfileInput(
  runtimeProfile: ResourceRuntimeProfileState,
): NonNullable<CreateResourceCommandInput["runtimeProfile"]> {
  return {
    strategy: runtimeProfile.strategy.value,
    ...(runtimeProfile.installCommand
      ? { installCommand: runtimeProfile.installCommand.value }
      : {}),
    ...(runtimeProfile.buildCommand ? { buildCommand: runtimeProfile.buildCommand.value } : {}),
    ...(runtimeProfile.startCommand ? { startCommand: runtimeProfile.startCommand.value } : {}),
    ...(runtimeProfile.runtimeName ? { runtimeName: runtimeProfile.runtimeName.value } : {}),
    ...(runtimeProfile.publishDirectory
      ? { publishDirectory: runtimeProfile.publishDirectory.value }
      : {}),
    ...(runtimeProfile.dockerfilePath
      ? { dockerfilePath: runtimeProfile.dockerfilePath.value }
      : {}),
    ...(runtimeProfile.dockerComposeFilePath
      ? { dockerComposeFilePath: runtimeProfile.dockerComposeFilePath.value }
      : {}),
    ...(runtimeProfile.buildTarget ? { buildTarget: runtimeProfile.buildTarget.value } : {}),
    ...(runtimeProfile.replicas ? { replicas: runtimeProfile.replicas.value } : {}),
    ...(runtimeProfile.healthCheckPath
      ? { healthCheckPath: runtimeProfile.healthCheckPath.value }
      : {}),
    ...(runtimeProfile.healthCheck && runtimeProfile.healthCheck.type.value === "http"
      ? { healthCheck: healthCheckInput(runtimeProfile.healthCheck) }
      : {}),
  };
}

function healthCheckInput(
  healthCheck: ResourceHealthCheckPolicyState,
): NonNullable<NonNullable<CreateResourceCommandInput["runtimeProfile"]>["healthCheck"]> {
  return {
    enabled: healthCheck.enabled,
    type: "http",
    intervalSeconds: healthCheck.intervalSeconds.value,
    timeoutSeconds: healthCheck.timeoutSeconds.value,
    retries: healthCheck.retries.value,
    startPeriodSeconds: healthCheck.startPeriodSeconds.value,
    ...(healthCheck.http
      ? {
          http: {
            method: healthCheck.http.method.value,
            scheme: healthCheck.http.scheme.value,
            host: healthCheck.http.host.value,
            ...(healthCheck.http.port ? { port: healthCheck.http.port.value } : {}),
            path: healthCheck.http.path.value,
            expectedStatusCode: healthCheck.http.expectedStatusCode.value,
            ...(healthCheck.http.expectedResponseText
              ? { expectedResponseText: healthCheck.http.expectedResponseText.value }
              : {}),
          },
        }
      : {}),
  };
}

function networkProfileInput(
  networkProfile: ResourceNetworkProfileState,
): NonNullable<CreateResourceCommandInput["networkProfile"]> {
  return {
    internalPort: networkProfile.internalPort.value,
    upstreamProtocol: networkProfile.upstreamProtocol.value,
    exposureMode: networkProfile.exposureMode.value,
    ...(networkProfile.targetServiceName
      ? { targetServiceName: networkProfile.targetServiceName.value }
      : {}),
    ...(networkProfile.hostPort ? { hostPort: networkProfile.hostPort.value } : {}),
  };
}
