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
  appaloftDeploymentAccessConfigSchema,
  appaloftDeploymentConfigFileNames,
  parseAppaloftDeploymentConfigText,
} from "@appaloft/deployment-config";
import { Args, Command as EffectCommand, Options } from "@effect/cli";
import { Effect, Either } from "effect";

import {
  CliRuntime,
  optionalNumber,
  optionalValue,
  resultToEffect,
  runDeploymentCommand,
  runQuery,
} from "../runtime.js";
import {
  type DeploymentPromptSeed,
  type DeploymentServerAppliedRouteSeed,
  deploymentEnvironmentVariablesFromConfig,
  deploymentPromptSeedFromConfig,
  resolveInteractiveDeploymentInput,
} from "./deployment-interaction.js";
import { type RemoteStateSession } from "./deployment-remote-state.js";
import { deploymentMethods, normalizeCliPathOrSource } from "./deployment-source.js";
import {
  createSourceFingerprint,
  type DeploymentStateBackendKind,
  resolveDeploymentStateBackend,
  type SourceFingerprintScope,
} from "./deployment-state.js";

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
const previewModes = ["pull-request"] as const;
const previewOption = Options.choice("preview", previewModes).pipe(Options.optional);
const previewIdOption = Options.text("preview-id").pipe(Options.optional);
const previewDomainTemplateOption = Options.text("preview-domain-template").pipe(Options.optional);
const installOption = Options.text("install").pipe(Options.optional);
const buildOption = Options.text("build").pipe(Options.optional);
const startOption = Options.text("start").pipe(Options.optional);
const publishDirOption = Options.text("publish-dir").pipe(Options.optional);
const portOption = Options.text("port").pipe(Options.optional);
const healthPathOption = Options.text("health-path").pipe(Options.optional);
const appLogLinesOption = Options.text("app-log-lines").pipe(Options.withDefault("3"));
const deploymentStateBackendKinds = [
  "ssh-pglite",
  "local-pglite",
  "postgres-control-plane",
] as const satisfies readonly DeploymentStateBackendKind[];
const stateBackendOption = Options.choice("state-backend", deploymentStateBackendKinds).pipe(
  Options.optional,
);
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

  if (messages.includes("config_domain_resolution")) {
    return "config-domain-resolution";
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
  explicit: boolean;
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
      explicit: Boolean(input.configFilePath),
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

function githubScopeFromEnv(env: Record<string, string | undefined>): SourceFingerprintScope {
  const ref = env.GITHUB_REF;
  const pullRequestMatch = ref?.match(/^refs\/pull\/(\d+)\/(?:merge|head)$/);
  if (pullRequestMatch?.[1]) {
    return {
      kind: "preview",
      pullRequestNumber: Number(pullRequestMatch[1]),
      ...(env.GITHUB_HEAD_REF ? { branch: env.GITHUB_HEAD_REF } : {}),
    };
  }

  if (env.GITHUB_HEAD_REF) {
    return { kind: "preview", branch: env.GITHUB_HEAD_REF };
  }

  if (ref?.startsWith("refs/heads/")) {
    return { kind: "branch", branch: ref };
  }

  return { kind: "default" };
}

interface PreviewDeployContext {
  mode: (typeof previewModes)[number];
  previewId: string;
  pullRequestNumber: number;
  environmentName: string;
  sourceScope: SourceFingerprintScope;
}

function previewContextValidationError(message: string, details: Record<string, string>) {
  return domainError.validation(message, {
    phase: "preview-context-resolution",
    ...details,
  });
}

function normalizePullRequestPreviewId(value: string | undefined): string | null {
  const normalized = value
    ?.trim()
    .toLowerCase()
    .replace(/^preview-/, "");
  if (!normalized) {
    return null;
  }

  if (/^\d+$/.test(normalized)) {
    return `pr-${normalized}`;
  }

  return /^pr-\d+$/.test(normalized) ? normalized : null;
}

function pullRequestNumberFromPreviewId(previewId: string): number {
  return Number(previewId.replace(/^pr-/, ""));
}

function resolvePreviewDeployContext(input: {
  mode?: (typeof previewModes)[number];
  previewId?: string;
  previewDomainTemplate?: string;
  env: Record<string, string | undefined>;
}): Result<PreviewDeployContext | undefined> {
  if (!input.mode) {
    if (input.previewId || input.previewDomainTemplate) {
      return err(
        previewContextValidationError("Preview inputs require preview mode", {
          reason: "preview_mode_missing",
        }),
      );
    }

    return ok(undefined);
  }

  const previewId = normalizePullRequestPreviewId(input.previewId);
  if (!previewId) {
    return err(
      previewContextValidationError("Pull request preview requires a valid preview id", {
        preview: input.mode,
        reason: "preview_id_missing_or_invalid",
      }),
    );
  }

  const pullRequestNumber = pullRequestNumberFromPreviewId(previewId);
  return ok({
    mode: input.mode,
    previewId,
    pullRequestNumber,
    environmentName: `preview-${previewId}`,
    sourceScope: {
      kind: "preview",
      pullRequestNumber,
      ...(input.env.GITHUB_HEAD_REF ? { branch: input.env.GITHUB_HEAD_REF } : {}),
    },
  });
}

function resolvePreviewDomainTemplateRoutes(
  previewDomainTemplate: string | undefined,
): Result<DeploymentServerAppliedRouteSeed[] | undefined> {
  const host = previewDomainTemplate?.trim();
  if (!host) {
    return ok(undefined);
  }

  if (host.includes("${{") || host.includes("}}")) {
    return err(
      domainError.validation("Preview domain template contains unresolved GitHub expression", {
        phase: "preview-domain-template-resolution",
        reason: "unresolved_github_expression",
      }),
    );
  }

  const parsed = appaloftDeploymentAccessConfigSchema.safeParse({
    domains: [
      {
        host,
        pathPrefix: "/",
        tlsMode: "auto",
      },
    ],
  });

  if (!parsed.success) {
    return err(
      domainError.validation("Preview domain template rendered an invalid host", {
        phase: "preview-domain-template-resolution",
        previewDomainTemplate: host,
        issues: JSON.stringify(
          parsed.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        ),
      }),
    );
  }

  return ok(
    parsed.data.domains.map((domain) => ({
      host: domain.host,
      pathPrefix: domain.pathPrefix,
      tlsMode: domain.tlsMode,
    })),
  );
}

function applyPreviewRoutePrecedence(input: {
  configSeed: DeploymentPromptSeed;
  configResolution?: { explicit: boolean };
  previewContext?: PreviewDeployContext;
  previewDomainRoutes?: DeploymentServerAppliedRouteSeed[];
}): DeploymentPromptSeed {
  const { serverAppliedRoutes: configRoutes, ...seedWithoutRoutes } = input.configSeed;
  const selectedRoutes =
    input.previewDomainRoutes ??
    (input.previewContext && input.configResolution && !input.configResolution.explicit
      ? undefined
      : configRoutes);

  return {
    ...seedWithoutRoutes,
    ...(selectedRoutes && selectedRoutes.length > 0 ? { serverAppliedRoutes: selectedRoutes } : {}),
  };
}

function sourceFingerprintForConfigDeploy(input: {
  sourceLocator: string;
  configResolution?: { config: AppaloftDeploymentConfig; configFilePath: string };
  previewContext?: PreviewDeployContext;
}): string {
  const env = Bun.env;
  const repositoryLocator = env.GITHUB_REPOSITORY
    ? `https://github.com/${env.GITHUB_REPOSITORY}`
    : input.sourceLocator;
  const sourceDirectory = resolveLocalSourceDirectory(input.sourceLocator) ?? process.cwd();
  const workspaceRoot = env.GITHUB_WORKSPACE ?? resolveGitRoot(sourceDirectory) ?? sourceDirectory;

  return createSourceFingerprint({
    provider: env.GITHUB_REPOSITORY ? "github" : "local",
    ...(env.GITHUB_REPOSITORY_ID ? { providerRepositoryId: env.GITHUB_REPOSITORY_ID } : {}),
    repositoryLocator,
    baseDirectory: input.configResolution?.config.source?.baseDirectory ?? ".",
    configPath: input.configResolution?.configFilePath ?? "appaloft.yml",
    workspaceRoot,
    ...(env.GITHUB_REF ? { gitRef: env.GITHUB_REF } : {}),
    ...(env.GITHUB_SHA ? { commitSha: env.GITHUB_SHA } : {}),
    scope:
      input.previewContext?.sourceScope ??
      (env.GITHUB_REPOSITORY ? githubScopeFromEnv(env) : { kind: "default" }),
  }).key;
}

function prepareDeploymentStateSessionIfNeeded(
  stateBackendDecision: ReturnType<typeof resolveDeploymentStateBackend> | undefined,
) {
  return Effect.gen(function* () {
    if (!stateBackendDecision?.requiresRemoteStateLifecycle) {
      return undefined;
    }

    const cli = yield* CliRuntime;
    if (!cli.prepareDeploymentStateBackend) {
      return yield* Effect.fail(
        domainError.validation(
          "SSH remote state lifecycle is required before deployment config bootstrap",
          {
            phase: "remote-state-resolution",
            stateBackend: stateBackendDecision.kind,
            storageScope: stateBackendDecision.storageScope,
            reason: "remote_state_lifecycle_adapter_missing",
          },
        ),
      );
    }

    const prepare = cli.prepareDeploymentStateBackend;
    const prepared = yield* Effect.promise(() => prepare(stateBackendDecision));
    return yield* resultToEffect(prepared);
  });
}

function releaseDeploymentStateSession(session: RemoteStateSession) {
  return Effect.gen(function* () {
    const released = yield* Effect.promise(() => session.release());
    yield* resultToEffect(released);
  });
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
    preview: previewOption,
    previewId: previewIdOption,
    previewDomainTemplate: previewDomainTemplateOption,
    install: installOption,
    build: buildOption,
    start: startOption,
    publishDir: publishDirOption,
    port: portOption,
    healthPath: healthPathOption,
    stateBackend: stateBackendOption,
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
    preview,
    previewDomainTemplate,
    previewId,
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
    stateBackend,
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
      const requestedStateBackend = optionalValue(stateBackend);
      const requestedPreviewMode = optionalValue(preview);
      const requestedPreviewId = optionalValue(previewId);
      const requestedPreviewDomainTemplate = optionalValue(previewDomainTemplate);
      const previewContext = yield* resultToEffect(
        resolvePreviewDeployContext({
          ...(requestedPreviewMode ? { mode: requestedPreviewMode } : {}),
          ...(requestedPreviewId ? { previewId: requestedPreviewId } : {}),
          ...(requestedPreviewDomainTemplate
            ? { previewDomainTemplate: requestedPreviewDomainTemplate }
            : {}),
          env: Bun.env,
        }),
      );
      const previewDomainRoutes = yield* resultToEffect(
        resolvePreviewDomainTemplateRoutes(requestedPreviewDomainTemplate),
      );

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
      const configSeed = applyPreviewRoutePrecedence({
        configSeed: configResolution ? deploymentPromptSeedFromConfig(configResolution.config) : {},
        ...(configResolution ? { configResolution } : {}),
        ...(previewContext ? { previewContext } : {}),
        ...(previewDomainRoutes ? { previewDomainRoutes } : {}),
      });
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
      const stateBackendDecision =
        configResolution || requestedStateBackend
          ? resolveDeploymentStateBackend({
              ...(requestedStateBackend ? { explicitBackend: requestedStateBackend } : {}),
              ...(Bun.env.APPALOFT_DATABASE_URL
                ? { databaseUrl: Bun.env.APPALOFT_DATABASE_URL }
                : {}),
              ...(Bun.env.APPALOFT_CONTROL_PLANE_URL
                ? { controlPlaneUrl: Bun.env.APPALOFT_CONTROL_PLANE_URL }
                : {}),
              ...(serverSpec?.host
                ? {
                    trustedSshTarget: {
                      host: serverSpec.host,
                      ...(serverSpec.port === undefined ? {} : { port: serverSpec.port }),
                      ...(serverSpec.providerKey ? { providerKey: serverSpec.providerKey } : {}),
                      ...(serverSshUsernameValue ? { username: serverSshUsernameValue } : {}),
                      ...(serverSshPrivateKeyFileValue
                        ? { identityFile: serverSshPrivateKeyFileValue }
                        : {}),
                    },
                  }
                : {}),
            })
          : undefined;
      const sourceFingerprint =
        configResolution || requestedStateBackend || previewContext
          ? sourceFingerprintForConfigDeploy({
              sourceLocator: configuredSourceLocator ?? configSourceLocator,
              ...(configResolution ? { configResolution } : {}),
              ...(previewContext ? { previewContext } : {}),
            })
          : undefined;
      const seed = {
        ...configSeed,
        ...(projectId ? { projectId } : {}),
        ...(serverId ? { serverId } : {}),
        ...(serverSpec ? { server: serverSpec } : {}),
        ...(destinationId ? { destinationId } : {}),
        ...(environmentId ? { environmentId } : {}),
        ...(previewContext && !environmentId
          ? { environment: { name: previewContext.environmentName, kind: "preview" as const } }
          : {}),
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
        ...(sourceFingerprint ? { sourceFingerprint } : {}),
        ...(stateBackendDecision ? { stateBackend: stateBackendDecision } : {}),
      };

      const stateSession = yield* prepareDeploymentStateSessionIfNeeded(stateBackendDecision);
      const runResolvedDeployment = Effect.gen(function* () {
        const input = yield* resolveInteractiveDeploymentInput({
          ...seed,
          ...(stateSession ? { stateBackendPrepared: true } : {}),
          ...(configuredSourceLocator ? { sourceLocator: configuredSourceLocator } : {}),
        });

        return yield* runDeploymentCommand(CreateDeploymentCommand.create(input), {
          appLogLines: parseAppLogLines(appLogLines),
        });
      });

      if (!stateSession) {
        return yield* runResolvedDeployment;
      }

      const result = yield* Effect.either(runResolvedDeployment);
      yield* releaseDeploymentStateSession(stateSession);
      if (Either.isLeft(result)) {
        return yield* Effect.fail(result.left);
      }

      return result.right;
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
