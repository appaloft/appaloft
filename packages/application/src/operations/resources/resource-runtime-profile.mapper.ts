import {
  CommandText,
  DockerBuildTarget,
  DockerComposeFilePath,
  DockerfilePath,
  domainError,
  err,
  HealthCheckPathText,
  ok,
  type ResourceRuntimeProfileState,
  type Result,
  RuntimePlanStrategyValue,
  StaticPublishDirectory,
} from "@appaloft/core";
import { type z } from "zod";

import { type configureResourceRuntimeProfileInputSchema } from "./create-resource.schema";
import { resourceHealthCheckPolicyFromInput } from "./resource-health-policy.mapper";

type ResourceRuntimeProfileMapperInput = z.input<typeof configureResourceRuntimeProfileInputSchema>;

type ResourceRuntimeProfileMapperOptions = {
  allowHealthPolicy?: boolean;
};

const unsupportedRuntimeTargetFields = [
  "kubernetesNamespace",
  "helmChart",
  "swarmService",
  "replicas",
  "nodeSelector",
  "ingressClass",
  "providerOptions",
] as const;

function runtimeResolutionError(
  message: string,
  details?: Record<string, string | number | boolean>,
) {
  return domainError.validation(message, {
    phase: "resource-runtime-resolution",
    ...(details ?? {}),
  });
}

function hasDefinedOwnProperty(input: ResourceRuntimeProfileMapperInput, field: string): boolean {
  const record = input as Record<string, unknown>;
  return Object.hasOwn(record, field) && record[field] !== undefined;
}

export function resourceRuntimeProfileFromInput(
  input: ResourceRuntimeProfileMapperInput,
  options: ResourceRuntimeProfileMapperOptions = {},
): Result<ResourceRuntimeProfileState> {
  const allowHealthPolicy = options.allowHealthPolicy ?? true;

  if (!allowHealthPolicy) {
    if (hasDefinedOwnProperty(input, "healthCheck")) {
      return err(
        runtimeResolutionError("Runtime profile changes must not include health policy mutation", {
          field: "runtimeProfile.healthCheck",
        }),
      );
    }

    if (hasDefinedOwnProperty(input, "healthCheckPath")) {
      return err(
        runtimeResolutionError(
          "Runtime profile changes must not include health check path mutation",
          {
            field: "runtimeProfile.healthCheckPath",
          },
        ),
      );
    }
  }

  for (const field of unsupportedRuntimeTargetFields) {
    if (hasDefinedOwnProperty(input, field)) {
      return err(
        runtimeResolutionError("Unsupported runtime target configuration", {
          field: `runtimeProfile.${field}`,
        }),
      );
    }
  }

  const strategy = RuntimePlanStrategyValue.create(input.strategy ?? "auto");
  if (strategy.isErr()) return err(strategy.error);
  const profile: ResourceRuntimeProfileState = {
    strategy: strategy.value,
  };

  if (input.installCommand) {
    const installCommand = CommandText.create(input.installCommand);
    if (installCommand.isErr()) return err(installCommand.error);
    profile.installCommand = installCommand.value;
  }

  if (input.buildCommand) {
    const buildCommand = CommandText.create(input.buildCommand);
    if (buildCommand.isErr()) return err(buildCommand.error);
    profile.buildCommand = buildCommand.value;
  }

  if (input.startCommand) {
    const startCommand = CommandText.create(input.startCommand);
    if (startCommand.isErr()) return err(startCommand.error);
    profile.startCommand = startCommand.value;
  }

  if (input.publishDirectory) {
    const publishDirectory = StaticPublishDirectory.create(input.publishDirectory);
    if (publishDirectory.isErr()) return err(publishDirectory.error);
    profile.publishDirectory = publishDirectory.value;
  }

  if (input.dockerfilePath) {
    const dockerfilePath = DockerfilePath.create(input.dockerfilePath);
    if (dockerfilePath.isErr()) return err(dockerfilePath.error);
    profile.dockerfilePath = dockerfilePath.value;
  }

  if (input.dockerComposeFilePath) {
    const dockerComposeFilePath = DockerComposeFilePath.create(input.dockerComposeFilePath);
    if (dockerComposeFilePath.isErr()) return err(dockerComposeFilePath.error);
    profile.dockerComposeFilePath = dockerComposeFilePath.value;
  }

  if (input.buildTarget) {
    const buildTarget = DockerBuildTarget.create(input.buildTarget);
    if (buildTarget.isErr()) return err(buildTarget.error);
    profile.buildTarget = buildTarget.value;
  }

  if (allowHealthPolicy && input.healthCheckPath) {
    const healthCheckPath = HealthCheckPathText.create(input.healthCheckPath);
    if (healthCheckPath.isErr()) return err(healthCheckPath.error);
    profile.healthCheckPath = healthCheckPath.value;
  }

  if (allowHealthPolicy && input.healthCheck) {
    const healthCheck = resourceHealthCheckPolicyFromInput(input.healthCheck);
    if (healthCheck.isErr()) return err(healthCheck.error);
    profile.healthCheck = healthCheck.value;
  }

  return ok(profile);
}
