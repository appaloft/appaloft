import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  CreateDeploymentCommand,
  type CreateDeploymentCommandInput,
  DeploymentLogsQuery,
  ListDeploymentsQuery,
} from "@appaloft/application";
import { createQuickDeployGeneratedResourceName } from "@appaloft/contracts";
import { domainError, edgeProxyKinds, err, ok, type Result, resourceKinds } from "@appaloft/core";
import {
  type AppaloftDeploymentConfig,
  appaloftDeploymentConfigFileNames,
  parseAppaloftDeploymentConfigText,
} from "@appaloft/deployment-config";
import { Args, Command as EffectCommand, Options } from "@effect/cli";
import { Effect } from "effect";

import {
  optionalNumber,
  optionalValue,
  resultToEffect,
  runDeploymentCommand,
  runQuery,
} from "../runtime.js";
import {
  deploymentEnvironmentVariablesFromConfig,
  deploymentPromptSeedFromConfig,
  resolveInteractiveDeploymentInput,
} from "./deployment-interaction.js";
import { deploymentMethods, normalizeCliPathOrSource } from "./deployment-source.js";

const pathOrSourceArg = Args.text({ name: "pathOrSource" }).pipe(Args.optional);
const deploymentIdArg = Args.text({ name: "deploymentId" });

const projectOption = Options.text("project").pipe(Options.optional);
const serverOption = Options.text("server").pipe(Options.optional);
const serverHostOption = Options.text("server-host").pipe(Options.optional);
const serverNameOption = Options.text("server-name").pipe(Options.optional);
const serverProviderOption = Options.text("server-provider").pipe(Options.optional);
const serverPortOption = Options.text("server-port").pipe(Options.optional);
const serverProxyKindOption = Options.choice("server-proxy-kind", edgeProxyKinds).pipe(
  Options.optional,
);
const serverSshUsernameOption = Options.text("server-ssh-username").pipe(Options.optional);
const serverSshPublicKeyOption = Options.text("server-ssh-public-key").pipe(Options.optional);
const serverSshPrivateKeyFileOption = Options.text("server-ssh-private-key-file").pipe(
  Options.optional,
);
const destinationOption = Options.text("destination").pipe(Options.optional);
const environmentOption = Options.text("environment").pipe(Options.optional);
const resourceOption = Options.text("resource").pipe(Options.optional);
const resourceNameOption = Options.text("resource-name").pipe(Options.optional);
const resourceKindOption = Options.choice("resource-kind", resourceKinds).pipe(Options.optional);
const resourceDescriptionOption = Options.text("resource-description").pipe(Options.optional);
const methodOption = Options.choice("method", deploymentMethods).pipe(Options.optional);
const configOption = Options.text("config").pipe(Options.optional);
const installOption = Options.text("install").pipe(Options.optional);
const buildOption = Options.text("build").pipe(Options.optional);
const startOption = Options.text("start").pipe(Options.optional);
const publishDirOption = Options.text("publish-dir").pipe(Options.optional);
const portOption = Options.text("port").pipe(Options.optional);
const healthPathOption = Options.text("health-path").pipe(Options.optional);
const appLogLinesOption = Options.text("app-log-lines").pipe(Options.withDefault("3"));
function parseAppLogLines(value: string): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 3;
}

function inferResourceName(sourceLocator: string): string {
  const withoutQuery = sourceLocator.split(/[?#]/)[0] ?? sourceLocator;
  const segments = withoutQuery.split(/[\\/]/).filter(Boolean);
  return createQuickDeployGeneratedResourceName(segments.at(-1) ?? "app");
}

function resolveLocalSourceDirectory(sourceLocator: string): string | null {
  const absolutePath = resolve(sourceLocator);
  if (existsSync(absolutePath) && statSync(absolutePath).isDirectory()) {
    return absolutePath;
  }

  if (existsSync(absolutePath) && statSync(absolutePath).isFile()) {
    return dirname(absolutePath);
  }

  return null;
}

function resolveGitRoot(sourceDirectory: string): string | null {
  const git = Bun.spawnSync(["git", "-C", sourceDirectory, "rev-parse", "--show-toplevel"], {
    stdout: "pipe",
    stderr: "pipe",
  });

  if (!git.success) {
    return null;
  }

  const gitRoot = git.stdout.toString().trim();
  return gitRoot && existsSync(gitRoot) && statSync(gitRoot).isDirectory() ? gitRoot : null;
}

function discoverDeploymentConfigFile(sourceLocator: string): Result<string | null> {
  const sourceDirectory = resolveLocalSourceDirectory(sourceLocator);
  if (!sourceDirectory) {
    return ok(null);
  }

  const gitRoot = resolveGitRoot(sourceDirectory);
  const searchDirectories = [
    sourceDirectory,
    ...(gitRoot && gitRoot !== sourceDirectory ? [gitRoot] : []),
  ];
  const candidates = new Set<string>();

  for (const directory of searchDirectories) {
    for (const candidate of appaloftDeploymentConfigFileNames) {
      const configFilePath = join(directory, candidate);
      if (existsSync(configFilePath)) {
        candidates.add(configFilePath);
      }
    }
  }

  const paths = [...candidates];
  if (paths.length === 0) {
    return ok(null);
  }

  if (paths.length > 1) {
    return err(
      domainError.validation("Multiple Appaloft deployment config files were found", {
        phase: "config-discovery",
        configFilePaths: paths.join(","),
      }),
    );
  }

  return ok(paths[0] ?? null);
}

function phaseFromConfigIssues(issues: { message: string }[]): string {
  const messages = issues.map((issue) => issue.message).join("\n");

  if (messages.includes("config_identity_field")) {
    return "config-identity";
  }

  if (messages.includes("raw_secret_config_field")) {
    return "config-secret-validation";
  }

  if (messages.includes("unsupported_config_field")) {
    return "config-capability-resolution";
  }

  if (messages.includes("config_parse_error")) {
    return "config-parse";
  }

  return "config-schema";
}

function readDeploymentConfigForCli(input: {
  sourceLocator: string;
  configFilePath?: string;
}): Result<{
  config: AppaloftDeploymentConfig;
  configFilePath: string;
} | null> {
  const resolvedPath = input.configFilePath
    ? existsSync(resolve(input.configFilePath))
      ? ok(resolve(input.configFilePath))
      : err(
          domainError.validation("Deployment config file was not found", {
            phase: "config-discovery",
            configFilePath: input.configFilePath,
          }),
        )
    : discoverDeploymentConfigFile(input.sourceLocator);

  return resolvedPath.andThen((configFilePath) => {
    if (!configFilePath) {
      return ok(null);
    }

    let configText: string;
    try {
      configText = readFileSync(configFilePath, "utf8");
    } catch (error) {
      return err(
        domainError.validation("Deployment config file could not be read", {
          phase: "config-read",
          configFilePath,
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }

    const parsedConfig = parseAppaloftDeploymentConfigText(configText, configFilePath);

    if (!parsedConfig.success) {
      return err(
        domainError.validation("Appaloft deployment config is invalid", {
          phase: phaseFromConfigIssues(parsedConfig.error.issues),
          configFilePath,
          issues: JSON.stringify(
            parsedConfig.error.issues.map((issue) => ({
              path: issue.path.join("."),
              message: issue.message,
            })),
          ),
        }),
      );
    }

    return ok({
      config: parsedConfig.data,
      configFilePath,
    });
  });
}

function applyConfigSourceBase(
  sourceLocator: string,
  config: AppaloftDeploymentConfig | undefined,
): string {
  const baseDirectory = config?.source?.baseDirectory;
  if (!baseDirectory) {
    return sourceLocator;
  }

  if (!existsSync(sourceLocator) || !statSync(sourceLocator).isDirectory()) {
    return sourceLocator;
  }

  return resolve(sourceLocator, baseDirectory);
}

export const deployCommand = EffectCommand.make(
  "deploy",
  {
    pathOrSource: pathOrSourceArg,
    project: projectOption,
    server: serverOption,
    serverHost: serverHostOption,
    serverName: serverNameOption,
    serverProvider: serverProviderOption,
    serverPort: serverPortOption,
    serverProxyKind: serverProxyKindOption,
    serverSshUsername: serverSshUsernameOption,
    serverSshPublicKey: serverSshPublicKeyOption,
    serverSshPrivateKeyFile: serverSshPrivateKeyFileOption,
    destination: destinationOption,
    environment: environmentOption,
    resource: resourceOption,
    resourceName: resourceNameOption,
    resourceKind: resourceKindOption,
    resourceDescription: resourceDescriptionOption,
    method: methodOption,
    config: configOption,
    install: installOption,
    build: buildOption,
    start: startOption,
    publishDir: publishDirOption,
    port: portOption,
    healthPath: healthPathOption,
    appLogLines: appLogLinesOption,
  },
  ({
    appLogLines,
    build,
    config,
    destination,
    environment,
    healthPath,
    install,
    method,
    pathOrSource,
    port,
    project,
    publishDir,
    resource,
    resourceDescription,
    resourceKind,
    resourceName,
    server,
    serverHost,
    serverName,
    serverPort,
    serverProvider,
    serverProxyKind,
    serverSshPrivateKeyFile,
    serverSshPublicKey,
    serverSshUsername,
    start,
  }) =>
    Effect.gen(function* () {
      const sourceLocator = optionalValue(pathOrSource);
      const requestedDeploymentMethod = optionalValue(method);
      const portValue = optionalNumber(port);
      const configFilePath = optionalValue(config);
      const projectId = optionalValue(project);
      const serverId = optionalValue(server);
      const serverHostValue = optionalValue(serverHost);
      const serverNameValue = optionalValue(serverName);
      const serverProviderValue = optionalValue(serverProvider);
      const serverPortValue = optionalNumber(serverPort);
      const serverProxyKindValue = optionalValue(serverProxyKind);
      const serverSshUsernameValue = optionalValue(serverSshUsername);
      const serverSshPublicKeyValue = optionalValue(serverSshPublicKey);
      const serverSshPrivateKeyFileValue = optionalValue(serverSshPrivateKeyFile);
      const destinationId = optionalValue(destination);
      const environmentId = optionalValue(environment);
      const resourceId = optionalValue(resource);
      const resourceNameValue = optionalValue(resourceName);
      const resourceKindValue = optionalValue(resourceKind);
      const resourceDescriptionValue = optionalValue(resourceDescription);
      const installCommand = optionalValue(install);
      const buildCommand = optionalValue(build);
      const startCommand = optionalValue(start);
      const publishDirectory = optionalValue(publishDir);
      const healthCheckPath = optionalValue(healthPath);

      if (
        !sourceLocator &&
        !configFilePath &&
        projectId &&
        serverId &&
        environmentId &&
        resourceId
      ) {
        const input = {
          projectId,
          serverId,
          environmentId,
          resourceId,
          ...(destinationId ? { destinationId } : {}),
        } satisfies CreateDeploymentCommandInput;

        return yield* runDeploymentCommand(CreateDeploymentCommand.create(input), {
          appLogLines: parseAppLogLines(appLogLines),
        });
      }

      const configSourceLocator = sourceLocator ?? ".";
      const configResolution = yield* resultToEffect(
        readDeploymentConfigForCli({
          sourceLocator: configSourceLocator,
          ...(configFilePath ? { configFilePath } : {}),
        }),
      );
      const configSeed = configResolution
        ? deploymentPromptSeedFromConfig(configResolution.config)
        : {};
      const configEnvironmentVariables = configResolution
        ? yield* resultToEffect(deploymentEnvironmentVariablesFromConfig(configResolution.config))
        : [];
      const deploymentMethod = requestedDeploymentMethod ?? configSeed.deploymentMethod;
      const normalizedSourceLocator = sourceLocator
        ? normalizeCliPathOrSource(sourceLocator, deploymentMethod ?? "auto")
        : configResolution
          ? normalizeCliPathOrSource(".", deploymentMethod ?? "auto")
          : undefined;
      const configuredSourceLocator = normalizedSourceLocator
        ? applyConfigSourceBase(normalizedSourceLocator, configResolution?.config)
        : undefined;
      const resourceSpec =
        !resourceId && (resourceNameValue || configuredSourceLocator)
          ? {
              name: resourceNameValue ?? inferResourceName(configuredSourceLocator ?? "."),
              kind:
                resourceKindValue ??
                (deploymentMethod === "docker-compose"
                  ? "compose-stack"
                  : deploymentMethod === "static"
                    ? "static-site"
                    : "application"),
              ...(resourceDescriptionValue ? { description: resourceDescriptionValue } : {}),
            }
          : undefined;
      const serverSshPrivateKey = serverSshPrivateKeyFileValue
        ? yield* Effect.promise(() => Bun.file(serverSshPrivateKeyFileValue).text())
        : undefined;
      const serverSpec =
        serverHostValue ||
        serverNameValue ||
        serverProviderValue ||
        serverPortValue !== undefined ||
        serverProxyKindValue ||
        serverSshUsernameValue ||
        serverSshPublicKeyValue ||
        serverSshPrivateKey
          ? {
              ...(serverNameValue ? { name: serverNameValue } : {}),
              ...(serverHostValue ? { host: serverHostValue } : {}),
              ...(serverProviderValue ? { providerKey: serverProviderValue } : {}),
              ...(serverPortValue === undefined ? {} : { port: serverPortValue }),
              ...(serverProxyKindValue ? { proxyKind: serverProxyKindValue } : {}),
              ...(serverSshPrivateKey
                ? {
                    credential: {
                      kind: "ssh-private-key" as const,
                      ...(serverSshUsernameValue ? { username: serverSshUsernameValue } : {}),
                      ...(serverSshPublicKeyValue ? { publicKey: serverSshPublicKeyValue } : {}),
                      privateKey: serverSshPrivateKey,
                    },
                  }
                : serverSshUsernameValue
                  ? {
                      credential: {
                        kind: "local-ssh-agent" as const,
                        username: serverSshUsernameValue,
                      },
                    }
                  : {}),
            }
          : undefined;
      const seed = {
        ...configSeed,
        ...(projectId ? { projectId } : {}),
        ...(serverId ? { serverId } : {}),
        ...(serverSpec ? { server: serverSpec } : {}),
        ...(destinationId ? { destinationId } : {}),
        ...(environmentId ? { environmentId } : {}),
        ...(resourceId ? { resourceId } : {}),
        ...(resourceSpec ? { resource: resourceSpec } : {}),
        ...(deploymentMethod ? { deploymentMethod } : {}),
        ...(installCommand ? { installCommand } : {}),
        ...(buildCommand ? { buildCommand } : {}),
        ...(startCommand ? { startCommand } : {}),
        ...(publishDirectory ? { publishDirectory } : {}),
        ...(portValue === undefined ? {} : { port: portValue }),
        ...(healthCheckPath ? { healthCheckPath } : {}),
        ...(configEnvironmentVariables.length > 0
          ? { environmentVariables: configEnvironmentVariables }
          : {}),
      };
      const input = yield* resolveInteractiveDeploymentInput({
        ...seed,
        ...(configuredSourceLocator ? { sourceLocator: configuredSourceLocator } : {}),
      });

      return yield* runDeploymentCommand(CreateDeploymentCommand.create(input), {
        appLogLines: parseAppLogLines(appLogLines),
      });
    }),
).pipe(EffectCommand.withDescription("Create a deployment"));

export const logsCommand = EffectCommand.make(
  "logs",
  {
    deploymentId: deploymentIdArg,
  },
  ({ deploymentId }) => runQuery(DeploymentLogsQuery.create({ deploymentId })),
).pipe(EffectCommand.withDescription("Show deployment logs"));

const listDeploymentsCommand = EffectCommand.make(
  "list",
  {
    project: projectOption,
    resource: resourceOption,
  },
  ({ project, resource }) =>
    runQuery(
      ListDeploymentsQuery.create({
        projectId: optionalValue(project),
        resourceId: optionalValue(resource),
      }),
    ),
).pipe(EffectCommand.withDescription("List deployments"));

export const deploymentsCommand = EffectCommand.make("deployments").pipe(
  EffectCommand.withDescription("Deployment queries"),
  EffectCommand.withSubcommands([listDeploymentsCommand]),
);
