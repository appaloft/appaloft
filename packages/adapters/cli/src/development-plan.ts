import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { type DevelopmentPlan, type DevelopmentServicePlan } from "@appaloft/application";
import { type DomainError, err, ok, type Result } from "@appaloft/core";
import {
  type AppaloftDeploymentConfig,
  appaloftDeploymentConfigFileNames,
  parseAppaloftDeploymentConfigText,
} from "@appaloft/deployment-config";

import { deploymentPromptSeedFromConfig } from "./commands/deployment-interaction.js";

export interface DevelopmentPlanInput {
  sourceRoot: string;
  configFilePath?: string;
}

function developmentError(
  code: "development_plan_invalid" | "development_substrate_unsupported",
  message: string,
  details: Record<string, string | number | boolean | null | readonly string[]> = {},
): DomainError {
  return {
    code,
    category: "user",
    message,
    retryable: false,
    details: { phase: "development-plan", ...details },
  };
}

async function resolveConfig(
  input: DevelopmentPlanInput,
): Promise<Result<{ config: AppaloftDeploymentConfig; configFilePath: string } | null>> {
  const sourceRoot = resolve(input.sourceRoot);
  const candidates = input.configFilePath
    ? [resolve(sourceRoot, input.configFilePath)]
    : appaloftDeploymentConfigFileNames
        .map((fileName) => join(sourceRoot, fileName))
        .filter(existsSync);

  if (candidates.length === 0) return ok(null);
  if (candidates.length > 1) {
    return err(
      developmentError("development_plan_invalid", "Multiple Appaloft config files were found", {
        configFilePaths: candidates,
      }),
    );
  }

  const configFilePath = candidates[0];
  if (!configFilePath || !existsSync(configFilePath)) {
    return err(
      developmentError("development_plan_invalid", "Appaloft config file was not found", {
        configFilePath: configFilePath ?? input.configFilePath ?? null,
      }),
    );
  }

  let text: string;
  try {
    text = await readFile(configFilePath, "utf8");
  } catch (error) {
    return err(
      developmentError("development_plan_invalid", "Appaloft config file could not be read", {
        configFilePath,
        reason: error instanceof Error ? error.message : String(error),
      }),
    );
  }

  const parsed = parseAppaloftDeploymentConfigText(text, configFilePath);
  if (!parsed.success) {
    return err(
      developmentError("development_plan_invalid", "Appaloft config file is invalid", {
        configFilePath,
        issues: JSON.stringify(
          parsed.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        ),
      }),
    );
  }

  return ok({ config: parsed.data, configFilePath });
}

function ensureSupportedSubstrate(config: AppaloftDeploymentConfig): Result<void> {
  const strategies = [
    config.runtime?.strategy,
    ...Object.values(config.services ?? {}).map((service) => service.runtime?.strategy),
  ].filter((strategy): strategy is NonNullable<typeof strategy> => strategy !== undefined);
  const unsupported = strategies.filter(
    (strategy) => strategy !== "workspace-commands" && strategy !== "docker-compose",
  );

  return unsupported.length === 0
    ? ok(undefined)
    : err(
        developmentError(
          "development_substrate_unsupported",
          "Local development supports workspace commands and Docker Compose only",
          { strategies: unsupported },
        ),
      );
}

function startCommand(config: AppaloftDeploymentConfig): string | undefined {
  return config.runtime?.startCommand ?? config.runtime?.start?.command;
}

function servicePlansFromConfig(
  config: AppaloftDeploymentConfig,
  sourceRoot: string,
): Result<DevelopmentServicePlan[]> {
  const services = Object.entries(config.services ?? {});
  const rootEnvironment = Object.fromEntries(
    Object.entries(config.env ?? {}).map(([key, value]) => [key, String(value)]),
  );
  const inputs =
    services.length > 0
      ? services.map(([key, service]) => ({
          key,
          commandIntent:
            service.development?.command ??
            service.runtime?.startCommand ??
            service.runtime?.start?.command,
          watch: service.development?.watch ?? config.development?.watch ?? "none",
          port: service.network?.internalPort,
          healthPath:
            service.runtime?.healthCheckPath ??
            service.runtime?.healthCheck?.path ??
            service.health?.path,
          environment: {
            ...rootEnvironment,
            ...Object.fromEntries(
              Object.entries(service.env ?? {}).map(([name, value]) => [name, String(value)]),
            ),
          },
          commandArgs:
            service.runtime?.strategy === "docker-compose"
              ? [
                  "docker",
                  "compose",
                  "-f",
                  resolve(
                    sourceRoot,
                    service.runtime.dockerComposeFilePath ??
                      config.runtime?.dockerComposeFilePath ??
                      "docker-compose.yml",
                  ),
                  "up",
                  key,
                ]
              : undefined,
          cleanupArgs:
            service.runtime?.strategy === "docker-compose"
              ? [
                  "docker",
                  "compose",
                  "-f",
                  resolve(
                    sourceRoot,
                    service.runtime.dockerComposeFilePath ??
                      config.runtime?.dockerComposeFilePath ??
                      "docker-compose.yml",
                  ),
                  "down",
                ]
              : undefined,
        }))
      : [
          {
            key: "app",
            commandIntent:
              config.development?.command ??
              (config.runtime?.strategy === "docker-compose"
                ? "docker compose up"
                : startCommand(config)),
            watch: config.development?.watch ?? "none",
            port: config.network?.internalPort,
            healthPath:
              config.runtime?.healthCheckPath ??
              config.runtime?.healthCheck?.path ??
              config.health?.path,
            environment: rootEnvironment,
            commandArgs:
              config.runtime?.strategy === "docker-compose"
                ? [
                    "docker",
                    "compose",
                    "-f",
                    resolve(
                      sourceRoot,
                      config.runtime.dockerComposeFilePath ?? "docker-compose.yml",
                    ),
                    "up",
                  ]
                : undefined,
            cleanupArgs:
              config.runtime?.strategy === "docker-compose"
                ? [
                    "docker",
                    "compose",
                    "-f",
                    resolve(
                      sourceRoot,
                      config.runtime.dockerComposeFilePath ?? "docker-compose.yml",
                    ),
                    "down",
                  ]
                : undefined,
          },
        ];

  const missing = inputs.filter((service) => !service.commandIntent).map((service) => service.key);
  if (missing.length > 0) {
    return err(
      developmentError(
        "development_plan_invalid",
        "Every local development service requires a development or start command",
        { services: missing },
      ),
    );
  }

  return ok(
    inputs.map((service) => ({
      key: service.key,
      commandIntent: service.commandIntent as string,
      watch: service.watch,
      workingDirectory: sourceRoot,
      ...(service.port ? { port: service.port } : {}),
      ...(service.healthPath ? { healthPath: service.healthPath } : {}),
      ...(Object.keys(service.environment).length > 0 ? { environment: service.environment } : {}),
      ...(service.commandArgs ? { commandArgs: service.commandArgs } : {}),
      ...(service.cleanupArgs ? { cleanupArgs: service.cleanupArgs } : {}),
    })),
  );
}

async function detectedPackagePlan(sourceRoot: string): Promise<Result<DevelopmentPlan>> {
  const packagePath = join(sourceRoot, "package.json");
  if (!existsSync(packagePath)) {
    return err(
      developmentError(
        "development_plan_invalid",
        "No Appaloft config or supported development command was found",
      ),
    );
  }

  try {
    const packageJson = JSON.parse(await readFile(packagePath, "utf8")) as {
      scripts?: Record<string, unknown>;
    };
    if (typeof packageJson.scripts?.dev !== "string" || !packageJson.scripts.dev.trim()) {
      return err(developmentError("development_plan_invalid", "package.json has no dev script"));
    }
  } catch (error) {
    return err(
      developmentError("development_plan_invalid", "package.json could not be parsed", {
        reason: error instanceof Error ? error.message : String(error),
      }),
    );
  }

  return ok({
    sourceRoot,
    configFilePath: null,
    deploymentGraph: {},
    services: [
      {
        key: "app",
        commandIntent: "bun run dev",
        watch: "native",
        workingDirectory: sourceRoot,
      },
    ],
  });
}

export async function developmentPlanFromSource(
  input: DevelopmentPlanInput,
): Promise<Result<DevelopmentPlan>> {
  const sourceRoot = resolve(input.sourceRoot);
  const resolved = await resolveConfig({ ...input, sourceRoot });
  if (resolved.isErr()) return err(resolved.error);
  if (!resolved.value) return detectedPackagePlan(sourceRoot);

  const supported = ensureSupportedSubstrate(resolved.value.config);
  if (supported.isErr()) return err(supported.error);
  const services = servicePlansFromConfig(resolved.value.config, sourceRoot);
  if (services.isErr()) return err(services.error);

  return ok({
    sourceRoot,
    configFilePath: resolved.value.configFilePath,
    deploymentGraph: deploymentPromptSeedFromConfig(resolved.value.config),
    services: services.value,
  });
}
