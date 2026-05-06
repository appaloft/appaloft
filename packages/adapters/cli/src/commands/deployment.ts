import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import {
  CleanupPreviewCommand,
  CreateDeploymentCommand,
  type CreateDeploymentCommandInput,
  DeploymentLogsQuery,
  DeploymentPlanQuery,
  DeploymentRecoveryReadinessQuery,
  type DeploymentSummary,
  ListDeploymentsQuery,
  RedeployDeploymentCommand,
  RetryDeploymentCommand,
  RollbackDeploymentCommand,
  ShowDeploymentQuery,
  StreamDeploymentEventsQuery,
} from "@appaloft/application";
import { createQuickDeployGeneratedResourceName } from "@appaloft/contracts";
import {
  domainError,
  edgeProxyKinds,
  err,
  ok,
  type Result,
  resourceExposureModes,
  resourceKinds,
  resourceNetworkProtocols,
} from "@appaloft/core";
import {
  type AppaloftDeploymentConfig,
  appaloftDeploymentAccessConfigSchema,
  appaloftDeploymentConfigFileNames,
  parseAppaloftDeploymentConfig,
  parseAppaloftDeploymentConfigText,
  renderAppaloftDeploymentRuntimeNameTemplate,
} from "@appaloft/deployment-config";
import { Args, Command as EffectCommand, Options } from "@effect/cli";
import { Effect, Either } from "effect";

import {
  CliRuntime,
  optionalNumber,
  optionalValue,
  resultToEffect,
  runCommand,
  runDeploymentCommandResult,
  runDeploymentEventStreamQuery,
  runQuery,
} from "../runtime.js";
import {
  type DeploymentEnvironmentVariableSeed,
  type DeploymentPromptSeed,
  type DeploymentServerAppliedRouteSeed,
  deploymentEnvironmentVariablesFromConfig,
  deploymentPromptSeedFromConfig,
  resolveInteractiveDeploymentInput,
} from "./deployment-interaction.js";
import { type RemoteStateSession } from "./deployment-remote-state.js";
import {
  deploymentMethods,
  isRemoteOrImageSource,
  normalizeCliPathOrSource,
} from "./deployment-source.js";
import {
  createSourceFingerprint,
  type DeploymentStateBackendKind,
  resolveDeploymentStateBackend,
  type SourceFingerprintScope,
} from "./deployment-state.js";
import { cliCommandDescriptions, cliDocsHrefs } from "./docs-help.js";
import { previewEnvironmentCommand } from "./preview-environment.js";
import { previewPolicyCommand } from "./preview-policy.js";

const pathOrSourceArg = Args.text({ name: "pathOrSource" }).pipe(Args.optional);
const deploymentIdArg = Args.text({ name: "deploymentId" });
const resourceIdArg = Args.text({ name: "resourceId" });

const sourceBaseDirectoryOption = Options.text("source-base-directory").pipe(Options.optional);
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
const previewTlsModes = ["auto", "disabled"] as const;
const previewTlsModeOption = Options.choice("preview-tls-mode", previewTlsModes).pipe(
  Options.optional,
);
const requirePreviewUrlOption = Options.boolean("require-preview-url").pipe(
  Options.withDefault(false),
);
const previewOutputFileOption = Options.text("preview-output-file").pipe(Options.optional);
const installOption = Options.text("install").pipe(Options.optional);
const buildOption = Options.text("build").pipe(Options.optional);
const startOption = Options.text("start").pipe(Options.optional);
const runtimeNameOption = Options.text("runtime-name").pipe(Options.optional);
const publishDirOption = Options.text("publish-dir").pipe(Options.optional);
const dockerfilePathOption = Options.text("dockerfile-path").pipe(Options.optional);
const dockerComposeFilePathOption = Options.text("docker-compose-file-path").pipe(Options.optional);
const buildTargetOption = Options.text("build-target").pipe(Options.optional);
const portOption = Options.text("port").pipe(Options.optional);
const upstreamProtocolOption = Options.choice("upstream-protocol", resourceNetworkProtocols).pipe(
  Options.optional,
);
const exposureModeOption = Options.choice("exposure-mode", resourceExposureModes).pipe(
  Options.optional,
);
const targetServiceNameOption = Options.text("target-service-name").pipe(Options.optional);
const hostPortOption = Options.text("host-port").pipe(Options.optional);
const healthPathOption = Options.text("health-path").pipe(Options.optional);
const envOption = Options.text("env").pipe(Options.repeated);
const secretOption = Options.text("secret").pipe(Options.repeated);
const optionalSecretOption = Options.text("optional-secret").pipe(Options.repeated);
const appLogLinesOption = Options.text("app-log-lines").pipe(Options.withDefault("3"));
const followEventsOption = Options.boolean("follow").pipe(Options.withDefault(false));
const deploymentCursorOption = Options.text("cursor").pipe(Options.optional);
const deploymentHistoryLimitOption = Options.text("history-limit").pipe(Options.withDefault("100"));
const includeHistoryOption = Options.boolean("include-history").pipe(Options.withDefault(true));
const untilTerminalOption = Options.boolean("until-terminal").pipe(Options.withDefault(true));
const readinessGeneratedAtOption = Options.text("readiness-generated-at").pipe(Options.optional);
const sourceDeploymentOption = Options.text("source-deployment").pipe(Options.optional);
const rollbackCandidateOption = Options.text("candidate");
const deploymentStateBackendKinds = [
  "ssh-pglite",
  "local-pglite",
  "postgres-control-plane",
] as const satisfies readonly DeploymentStateBackendKind[];
const stateBackendOption = Options.choice("state-backend", deploymentStateBackendKinds).pipe(
  Options.optional,
);
export const deployCommandDocsHref = cliDocsHrefs.deploymentSource;
export const deployCommandDescription = cliCommandDescriptions.deploy;

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

function isExistingFile(path: string): boolean {
  return existsSync(path) && statSync(path).isFile();
}

function addDirectoryAncestors(searchDirectories: Set<string>, directory: string): void {
  let current = resolve(directory);
  const gitRoot = resolveGitRoot(current);

  while (true) {
    searchDirectories.add(current);
    if (gitRoot ? current === gitRoot : dirname(current) === current) {
      return;
    }

    current = dirname(current);
  }
}

function explicitConfigSearchDirectories(sourceLocator: string): string[] {
  const directories = new Set<string>();
  const currentWorkingDirectory = process.cwd();
  if (existsSync(currentWorkingDirectory) && statSync(currentWorkingDirectory).isDirectory()) {
    addDirectoryAncestors(directories, currentWorkingDirectory);
  }

  const sourceDirectory = resolveLocalSourceDirectory(sourceLocator);
  if (sourceDirectory) {
    addDirectoryAncestors(directories, sourceDirectory);
  }

  return [...directories];
}

function resolveExplicitDeploymentConfigFile(input: {
  sourceLocator: string;
  configFilePath: string;
}): Result<string> {
  const requestedPath = input.configFilePath;

  if (isAbsolute(requestedPath)) {
    return isExistingFile(requestedPath)
      ? ok(requestedPath)
      : err(
          domainError.validation("Deployment config file was not found", {
            phase: "config-discovery",
            configFilePath: input.configFilePath,
          }),
        );
  }

  for (const directory of explicitConfigSearchDirectories(input.sourceLocator)) {
    const candidate = resolve(directory, requestedPath);
    if (isExistingFile(candidate)) {
      return ok(candidate);
    }
  }

  return err(
    domainError.validation("Deployment config file was not found", {
      phase: "config-discovery",
      configFilePath: input.configFilePath,
    }),
  );
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
    ? resolveExplicitDeploymentConfigFile({
        sourceLocator: input.sourceLocator,
        configFilePath: input.configFilePath,
      })
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

function resolveConfigAnchoredSourceLocator(input: {
  sourceLocator?: string;
  configResolution?: { configFilePath: string; explicit: boolean };
}): string | undefined {
  if (!input.configResolution?.explicit) {
    return input.sourceLocator;
  }

  const configDirectory = dirname(input.configResolution.configFilePath);
  if (!input.sourceLocator) {
    return configDirectory;
  }

  if (isAbsolute(input.sourceLocator) || isRemoteOrImageSource(input.sourceLocator)) {
    return input.sourceLocator;
  }

  return resolve(configDirectory, input.sourceLocator);
}

function parseAssignmentFlag(input: {
  flagName: string;
  raw: string;
}): Result<{ key: string; value: string }> {
  const separatorIndex = input.raw.indexOf("=");
  if (separatorIndex <= 0) {
    return err(
      domainError.validation("Deployment profile flag must use KEY=VALUE syntax", {
        phase: "profile-flag-resolution",
        flag: input.flagName,
      }),
    );
  }

  const key = input.raw.slice(0, separatorIndex).trim();
  if (!key) {
    return err(
      domainError.validation("Deployment profile flag key is required", {
        phase: "profile-flag-resolution",
        flag: input.flagName,
      }),
    );
  }

  return ok({
    key,
    value: input.raw.slice(separatorIndex + 1),
  });
}

function parseSecretReferenceFlag(input: {
  flagName: string;
  raw: string;
  required: boolean;
}): Result<{ key: string; value: { from: string; required?: boolean } }> {
  const separatorIndex = input.raw.indexOf("=");
  const key = separatorIndex >= 0 ? input.raw.slice(0, separatorIndex).trim() : input.raw.trim();
  const reference =
    separatorIndex >= 0 ? input.raw.slice(separatorIndex + 1).trim() : `ci-env:${key}`;

  if (!key || !reference) {
    return err(
      domainError.validation("Deployment secret flag must use KEY=ci-env:NAME syntax", {
        phase: "profile-flag-resolution",
        flag: input.flagName,
      }),
    );
  }

  return ok({
    key,
    value: {
      from: reference,
      ...(input.required ? {} : { required: false }),
    },
  });
}

function deploymentEnvironmentVariablesFromCliFlags(input: {
  envFlags: string[];
  secretFlags: string[];
  optionalSecretFlags: string[];
  env?: Record<string, string | undefined>;
}): Result<DeploymentEnvironmentVariableSeed[]> {
  if (
    input.envFlags.length === 0 &&
    input.secretFlags.length === 0 &&
    input.optionalSecretFlags.length === 0
  ) {
    return ok([]);
  }

  const env: Record<string, string> = {};
  const secrets: NonNullable<AppaloftDeploymentConfig["secrets"]> = {};

  for (const raw of input.envFlags) {
    const parsed = parseAssignmentFlag({ flagName: "env", raw });
    if (parsed.isErr()) {
      return err(parsed.error);
    }
    env[parsed.value.key] = parsed.value.value;
  }

  for (const raw of input.secretFlags) {
    const parsed = parseSecretReferenceFlag({ flagName: "secret", raw, required: true });
    if (parsed.isErr()) {
      return err(parsed.error);
    }
    secrets[parsed.value.key] = parsed.value.value;
  }

  for (const raw of input.optionalSecretFlags) {
    const parsed = parseSecretReferenceFlag({
      flagName: "optional-secret",
      raw,
      required: false,
    });
    if (parsed.isErr()) {
      return err(parsed.error);
    }
    secrets[parsed.value.key] = parsed.value.value;
  }

  const parsedConfig = parseAppaloftDeploymentConfig({
    ...(Object.keys(env).length > 0 ? { env } : {}),
    ...(Object.keys(secrets).length > 0 ? { secrets } : {}),
  });

  if (!parsedConfig.success) {
    return err(
      domainError.validation("Deployment profile flags are invalid", {
        phase: phaseFromConfigIssues(parsedConfig.error.issues),
        issues: JSON.stringify(
          parsedConfig.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        ),
      }),
    );
  }

  return deploymentEnvironmentVariablesFromConfig(parsedConfig.data, { env: input.env ?? Bun.env });
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
  previewTlsMode?: (typeof previewTlsModes)[number];
  requirePreviewUrl?: boolean;
  previewOutputFile?: string;
  env: Record<string, string | undefined>;
}): Result<PreviewDeployContext | undefined> {
  if (!input.mode) {
    if (
      input.previewId ||
      input.previewDomainTemplate ||
      input.previewTlsMode ||
      input.requirePreviewUrl ||
      input.previewOutputFile
    ) {
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

function resolveRequiredPreviewContext(input: {
  mode?: (typeof previewModes)[number];
  previewId?: string;
  env: Record<string, string | undefined>;
}): Result<PreviewDeployContext> {
  return resolvePreviewDeployContext({
    ...(input.mode ? { mode: input.mode } : {}),
    ...(input.previewId ? { previewId: input.previewId } : {}),
    env: input.env,
  }).andThen((previewContext) =>
    previewContext
      ? ok(previewContext)
      : err(
          previewContextValidationError("Preview cleanup requires preview mode", {
            reason: "preview_mode_missing",
          }),
        ),
  );
}

function resolvePreviewDomainTemplateRoutes(
  previewDomainTemplate: string | undefined,
  previewTlsMode: (typeof previewTlsModes)[number] | undefined,
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
        tlsMode: previewTlsMode ?? "auto",
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

function resolveRuntimeNameSeed(input: {
  explicitRuntimeName?: string;
  configSeed: DeploymentPromptSeed;
  previewContext?: PreviewDeployContext;
}): Result<string | undefined> {
  const explicitRuntimeName = input.explicitRuntimeName?.trim().toLowerCase();
  if (explicitRuntimeName) {
    return ok(explicitRuntimeName);
  }

  if (input.configSeed.runtimeNameTemplate) {
    return renderAppaloftDeploymentRuntimeNameTemplate({
      template: input.configSeed.runtimeNameTemplate,
      ...(input.previewContext
        ? {
            context: {
              preview_id: input.previewContext.previewId,
              pr_number: input.previewContext.pullRequestNumber,
            },
          }
        : {}),
    });
  }

  if (input.previewContext) {
    return ok(`preview-${input.previewContext.pullRequestNumber}`);
  }

  return ok(undefined);
}

function sourceFingerprintForConfigDeploy(input: {
  sourceLocator: string;
  baseDirectory?: string;
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
    baseDirectory:
      input.baseDirectory ?? input.configResolution?.config.source?.baseDirectory ?? ".",
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

function publicPreviewUrlsFromDeployment(deployment: DeploymentSummary): string[] {
  const accessRoutes = deployment.runtimePlan.execution.accessRoutes ?? [];
  const urls: string[] = [];

  for (const route of accessRoutes) {
    if (route.routeBehavior === "redirect") {
      continue;
    }

    const scheme = route.tlsMode === "disabled" ? "http" : "https";
    const path = route.pathPrefix && route.pathPrefix !== "/" ? route.pathPrefix : "";
    for (const domain of route.domains) {
      urls.push(`${scheme}://${domain}${path}`);
    }
  }

  return urls;
}

interface PreviewAccessResolution {
  deploymentId: string;
  resourceId: string;
  status?: string;
  previewUrls: string[];
}

function previewOutputFileText(input: {
  previewId?: string;
  resolution: PreviewAccessResolution;
}): string {
  const lines = [
    "schema-version=deploy.preview-output/v1",
    `deployment-id=${input.resolution.deploymentId}`,
    `resource-id=${input.resolution.resourceId}`,
  ];

  if (input.previewId) {
    lines.push(`preview-id=${input.previewId}`);
  }

  if (input.resolution.status) {
    lines.push(`deployment-status=${input.resolution.status}`);
  }

  const [previewUrl] = input.resolution.previewUrls;
  if (previewUrl) {
    lines.push(`preview-url=${previewUrl}`);
    lines.push(`preview-urls=${input.resolution.previewUrls.join(",")}`);
  }

  return `${lines.join("\n")}\n`;
}

function writePreviewOutputFile(input: {
  filePath: string;
  previewId?: string;
  resolution: PreviewAccessResolution;
}) {
  return Effect.tryPromise({
    try: async () => {
      await Bun.write(
        input.filePath,
        previewOutputFileText({
          ...(input.previewId ? { previewId: input.previewId } : {}),
          resolution: input.resolution,
        }),
      );
    },
    catch: (error) =>
      domainError.infra("Failed to write preview output file", {
        phase: "preview-access-output",
        path: input.filePath,
        message: error instanceof Error ? error.message : String(error),
      }),
  });
}

function resolvePreviewAccessForDeployment(input: {
  deploymentId: string;
  resourceId: string;
  requirePreviewUrl: boolean;
}) {
  return Effect.gen(function* () {
    const cli = yield* CliRuntime;
    const query = yield* resultToEffect(
      ListDeploymentsQuery.create({ resourceId: input.resourceId }),
    );
    const result = yield* Effect.promise(() => cli.executeQuery(query));
    const deployments = yield* resultToEffect(result);
    const deployment = deployments.items.find((item) => item.id === input.deploymentId);

    if (!deployment) {
      if (input.requirePreviewUrl) {
        return yield* Effect.fail(
          domainError.validation("Preview URL is required but the deployment was not observable", {
            phase: "preview-access-resolution",
            reason: "preview_url_missing",
            deploymentId: input.deploymentId,
            resourceId: input.resourceId,
          }),
        );
      }

      return {
        deploymentId: input.deploymentId,
        resourceId: input.resourceId,
        previewUrls: [],
      };
    }

    const previewUrls = publicPreviewUrlsFromDeployment(deployment);
    if (input.requirePreviewUrl && previewUrls.length === 0) {
      return yield* Effect.fail(
        domainError.validation("Preview URL is required but no public route was resolved", {
          phase: "preview-access-resolution",
          reason: "preview_url_missing",
          deploymentId: input.deploymentId,
          resourceId: input.resourceId,
          status: deployment.status,
        }),
      );
    }

    if (input.requirePreviewUrl && deployment.status !== "succeeded") {
      return yield* Effect.fail(
        domainError.validation("Preview URL is required but deployment did not succeed", {
          phase: "preview-access-resolution",
          reason: "deployment_failed",
          deploymentId: input.deploymentId,
          resourceId: input.resourceId,
          status: deployment.status,
          previewUrls: previewUrls.join(","),
        }),
      );
    }

    return {
      deploymentId: input.deploymentId,
      resourceId: input.resourceId,
      status: deployment.status,
      previewUrls,
    };
  });
}

function runCreateDeploymentCommand(
  input: CreateDeploymentCommandInput,
  options: {
    appLogLines: number;
    requirePreviewUrl: boolean;
    previewOutputFile?: string;
    previewId?: string;
  },
) {
  return Effect.gen(function* () {
    const output = yield* runDeploymentCommandResult(CreateDeploymentCommand.create(input), {
      appLogLines: options.appLogLines,
    });

    if (options.requirePreviewUrl || options.previewOutputFile) {
      const resolution = yield* resolvePreviewAccessForDeployment({
        deploymentId: output.id,
        resourceId: input.resourceId,
        requirePreviewUrl: options.requirePreviewUrl,
      });

      if (options.previewOutputFile) {
        yield* writePreviewOutputFile({
          filePath: options.previewOutputFile,
          ...(options.previewId ? { previewId: options.previewId } : {}),
          resolution,
        });
      }
    }
  });
}

function runCleanupPreviewCommand(sourceFingerprint: string) {
  return runCommand(CleanupPreviewCommand.create({ sourceFingerprint }));
}

const previewCleanupCommand = EffectCommand.make(
  "cleanup",
  {
    pathOrSource: pathOrSourceArg,
    config: configOption,
    preview: previewOption,
    previewId: previewIdOption,
    serverHost: serverHostOption,
    serverPort: serverPortOption,
    serverProvider: serverProviderOption,
    serverSshUsername: serverSshUsernameOption,
    serverSshPrivateKeyFile: serverSshPrivateKeyFileOption,
    stateBackend: stateBackendOption,
  },
  ({
    config,
    pathOrSource,
    preview,
    previewId,
    serverHost,
    serverPort,
    serverProvider,
    serverSshPrivateKeyFile,
    serverSshUsername,
    stateBackend,
  }) =>
    Effect.gen(function* () {
      const requestedPreviewMode = optionalValue(preview);
      const requestedPreviewId = optionalValue(previewId);
      const previewContext = yield* resultToEffect(
        resolveRequiredPreviewContext({
          ...(requestedPreviewMode ? { mode: requestedPreviewMode } : {}),
          ...(requestedPreviewId ? { previewId: requestedPreviewId } : {}),
          env: Bun.env,
        }),
      );

      const sourceLocator = optionalValue(pathOrSource) ?? ".";
      const configFilePath = optionalValue(config);
      const requestedStateBackend = optionalValue(stateBackend);
      const serverHostValue = optionalValue(serverHost);
      const serverPortValue = optionalNumber(serverPort);
      const serverProviderValue = optionalValue(serverProvider);
      const serverSshUsernameValue = optionalValue(serverSshUsername);
      const serverSshPrivateKeyFileValue = optionalValue(serverSshPrivateKeyFile);
      const normalizedSourceLocator = normalizeCliPathOrSource(sourceLocator, "auto");
      const configResolution = yield* resultToEffect(
        readDeploymentConfigForCli({
          sourceLocator: normalizedSourceLocator,
          ...(configFilePath ? { configFilePath } : {}),
        }),
      );
      const configAnchoredSourceLocator =
        resolveConfigAnchoredSourceLocator({
          sourceLocator,
          ...(configResolution ? { configResolution } : {}),
        }) ?? sourceLocator;
      const configuredSourceLocator = normalizeCliPathOrSource(configAnchoredSourceLocator, "auto");

      const stateBackendDecision =
        configResolution || previewContext || requestedStateBackend || serverHostValue
          ? resolveDeploymentStateBackend({
              ...(requestedStateBackend ? { explicitBackend: requestedStateBackend } : {}),
              ...(Bun.env.APPALOFT_DATABASE_URL
                ? { databaseUrl: Bun.env.APPALOFT_DATABASE_URL }
                : {}),
              ...(Bun.env.APPALOFT_CONTROL_PLANE_URL
                ? { controlPlaneUrl: Bun.env.APPALOFT_CONTROL_PLANE_URL }
                : {}),
              ...(serverHostValue
                ? {
                    trustedSshTarget: {
                      host: serverHostValue,
                      ...(serverPortValue === undefined ? {} : { port: serverPortValue }),
                      ...(serverProviderValue ? { providerKey: serverProviderValue } : {}),
                      ...(serverSshUsernameValue ? { username: serverSshUsernameValue } : {}),
                      ...(serverSshPrivateKeyFileValue
                        ? { identityFile: serverSshPrivateKeyFileValue }
                        : {}),
                    },
                  }
                : {}),
            })
          : undefined;

      const sourceFingerprint = sourceFingerprintForConfigDeploy({
        sourceLocator: configuredSourceLocator,
        ...(configResolution ? { configResolution } : {}),
        previewContext,
      });

      const stateSession = yield* prepareDeploymentStateSessionIfNeeded(stateBackendDecision);
      const runCleanup = runCleanupPreviewCommand(sourceFingerprint);

      if (!stateSession) {
        return yield* runCleanup;
      }

      const result = yield* Effect.either(runCleanup);
      yield* releaseDeploymentStateSession(stateSession);
      if (Either.isLeft(result)) {
        return yield* Effect.fail(result.left);
      }

      return result.right;
    }),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.previewCleanup));

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
    previewTlsMode: previewTlsModeOption,
    requirePreviewUrl: requirePreviewUrlOption,
    previewOutputFile: previewOutputFileOption,
    install: installOption,
    build: buildOption,
    start: startOption,
    runtimeName: runtimeNameOption,
    publishDir: publishDirOption,
    sourceBaseDirectory: sourceBaseDirectoryOption,
    dockerfilePath: dockerfilePathOption,
    dockerComposeFilePath: dockerComposeFilePathOption,
    buildTarget: buildTargetOption,
    port: portOption,
    upstreamProtocol: upstreamProtocolOption,
    exposureMode: exposureModeOption,
    targetServiceName: targetServiceNameOption,
    hostPort: hostPortOption,
    healthPath: healthPathOption,
    env: envOption,
    secret: secretOption,
    optionalSecret: optionalSecretOption,
    stateBackend: stateBackendOption,
    appLogLines: appLogLinesOption,
  },
  ({
    appLogLines,
    build,
    buildTarget,
    config,
    destination,
    dockerComposeFilePath,
    dockerfilePath,
    environment,
    env,
    exposureMode,
    healthPath,
    hostPort,
    install,
    method,
    optionalSecret,
    pathOrSource,
    port,
    preview,
    previewDomainTemplate,
    previewId,
    previewOutputFile,
    previewTlsMode,
    project,
    publishDir,
    requirePreviewUrl,
    resource,
    resourceDescription,
    resourceKind,
    resourceName,
    runtimeName,
    secret,
    server,
    serverHost,
    serverName,
    serverPort,
    serverProvider,
    serverProxyKind,
    serverSshPrivateKeyFile,
    serverSshPublicKey,
    serverSshUsername,
    sourceBaseDirectory,
    start,
    stateBackend,
    targetServiceName,
    upstreamProtocol,
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
      const runtimeNameValue = optionalValue(runtimeName);
      const publishDirectory = optionalValue(publishDir);
      const sourceBaseDirectoryValue = optionalValue(sourceBaseDirectory);
      const dockerfilePathValue = optionalValue(dockerfilePath);
      const dockerComposeFilePathValue = optionalValue(dockerComposeFilePath);
      const buildTargetValue = optionalValue(buildTarget);
      const upstreamProtocolValue = optionalValue(upstreamProtocol);
      const exposureModeValue = optionalValue(exposureMode);
      const targetServiceNameValue = optionalValue(targetServiceName);
      const hostPortValue = optionalNumber(hostPort);
      const healthCheckPath = optionalValue(healthPath);
      const requestedStateBackend = optionalValue(stateBackend);
      const requestedPreviewMode = optionalValue(preview);
      const requestedPreviewId = optionalValue(previewId);
      const requestedPreviewDomainTemplate = optionalValue(previewDomainTemplate);
      const requestedPreviewTlsMode = optionalValue(previewTlsMode);
      const previewOutputFilePath = optionalValue(previewOutputFile);
      const previewContext = yield* resultToEffect(
        resolvePreviewDeployContext({
          ...(requestedPreviewMode ? { mode: requestedPreviewMode } : {}),
          ...(requestedPreviewId ? { previewId: requestedPreviewId } : {}),
          ...(requestedPreviewDomainTemplate
            ? { previewDomainTemplate: requestedPreviewDomainTemplate }
            : {}),
          ...(requestedPreviewTlsMode ? { previewTlsMode: requestedPreviewTlsMode } : {}),
          ...(requirePreviewUrl ? { requirePreviewUrl } : {}),
          ...(previewOutputFilePath ? { previewOutputFile: previewOutputFilePath } : {}),
          env: Bun.env,
        }),
      );
      const previewDomainRoutes = yield* resultToEffect(
        resolvePreviewDomainTemplateRoutes(requestedPreviewDomainTemplate, requestedPreviewTlsMode),
      );
      const flagEnvironmentVariables = yield* resultToEffect(
        deploymentEnvironmentVariablesFromCliFlags({
          envFlags: env,
          secretFlags: secret,
          optionalSecretFlags: optionalSecret,
          env: Bun.env,
        }),
      );
      const hasProfileOverrides = Boolean(
        requestedDeploymentMethod ||
          installCommand ||
          buildCommand ||
          startCommand ||
          runtimeNameValue ||
          publishDirectory ||
          sourceBaseDirectoryValue ||
          dockerfilePathValue ||
          dockerComposeFilePathValue ||
          buildTargetValue ||
          portValue !== undefined ||
          upstreamProtocolValue ||
          exposureModeValue ||
          targetServiceNameValue ||
          hostPortValue !== undefined ||
          healthCheckPath ||
          flagEnvironmentVariables.length > 0 ||
          previewDomainRoutes,
      );

      if (
        !sourceLocator &&
        !configFilePath &&
        !previewContext &&
        !hasProfileOverrides &&
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

        return yield* runCreateDeploymentCommand(input, {
          appLogLines: parseAppLogLines(appLogLines),
          requirePreviewUrl,
          ...(previewOutputFilePath ? { previewOutputFile: previewOutputFilePath } : {}),
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
      const resolvedRuntimeName = yield* resultToEffect(
        resolveRuntimeNameSeed({
          ...(runtimeNameValue ? { explicitRuntimeName: runtimeNameValue } : {}),
          configSeed,
          ...(previewContext ? { previewContext } : {}),
        }),
      );
      const configEnvironmentVariables = configResolution
        ? yield* resultToEffect(deploymentEnvironmentVariablesFromConfig(configResolution.config))
        : [];
      const environmentVariables = [...configEnvironmentVariables, ...flagEnvironmentVariables];
      const deploymentMethod = requestedDeploymentMethod ?? configSeed.deploymentMethod;
      const configAnchoredSourceLocator =
        resolveConfigAnchoredSourceLocator({
          ...(sourceLocator ? { sourceLocator } : {}),
          ...(configResolution ? { configResolution } : {}),
        }) ?? (configResolution ? "." : undefined);
      const normalizedSourceLocator = configAnchoredSourceLocator
        ? normalizeCliPathOrSource(configAnchoredSourceLocator, deploymentMethod ?? "auto")
        : undefined;
      const configuredSourceLocator = normalizedSourceLocator;
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
        configResolution || requestedStateBackend || previewContext || serverSpec?.host
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
        configResolution || requestedStateBackend || previewContext || stateBackendDecision
          ? sourceFingerprintForConfigDeploy({
              sourceLocator: configuredSourceLocator ?? configSourceLocator,
              ...(sourceBaseDirectoryValue ? { baseDirectory: sourceBaseDirectoryValue } : {}),
              ...(configResolution ? { configResolution } : {}),
              ...(previewContext ? { previewContext } : {}),
            })
          : undefined;
      const sourceProfile = {
        ...configSeed.sourceProfile,
        ...(sourceBaseDirectoryValue ? { baseDirectory: sourceBaseDirectoryValue } : {}),
      };
      const seed = {
        ...configSeed,
        ...(Object.keys(sourceProfile).length > 0 ? { sourceProfile } : {}),
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
        ...(resolvedRuntimeName ? { runtimeName: resolvedRuntimeName } : {}),
        ...(publishDirectory ? { publishDirectory } : {}),
        ...(dockerfilePathValue ? { dockerfilePath: dockerfilePathValue } : {}),
        ...(dockerComposeFilePathValue
          ? { dockerComposeFilePath: dockerComposeFilePathValue }
          : {}),
        ...(buildTargetValue ? { buildTarget: buildTargetValue } : {}),
        ...(portValue === undefined ? {} : { port: portValue }),
        ...(upstreamProtocolValue ? { upstreamProtocol: upstreamProtocolValue } : {}),
        ...(exposureModeValue ? { exposureMode: exposureModeValue } : {}),
        ...(targetServiceNameValue ? { targetServiceName: targetServiceNameValue } : {}),
        ...(hostPortValue === undefined ? {} : { hostPort: hostPortValue }),
        ...(healthCheckPath ? { healthCheckPath } : {}),
        ...(environmentVariables.length > 0 ? { environmentVariables } : {}),
        ...(sourceFingerprint ? { sourceFingerprint } : {}),
        ...(stateBackendDecision ? { stateBackend: stateBackendDecision } : {}),
        ...(configResolution ? { profileDriftPreflight: true } : {}),
      };

      const stateSession = yield* prepareDeploymentStateSessionIfNeeded(stateBackendDecision);
      const runResolvedDeployment = Effect.gen(function* () {
        const input = yield* resolveInteractiveDeploymentInput({
          ...seed,
          ...(stateSession ? { stateBackendPrepared: true } : {}),
          ...(configuredSourceLocator ? { sourceLocator: configuredSourceLocator } : {}),
        });

        return yield* runCreateDeploymentCommand(input, {
          appLogLines: parseAppLogLines(appLogLines),
          requirePreviewUrl,
          ...(previewOutputFilePath ? { previewOutputFile: previewOutputFilePath } : {}),
          ...(previewContext?.previewId ? { previewId: previewContext.previewId } : {}),
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
).pipe(EffectCommand.withDescription(deployCommandDescription));

export const logsCommand = EffectCommand.make(
  "logs",
  {
    deploymentId: deploymentIdArg,
  },
  ({ deploymentId }) => runQuery(DeploymentLogsQuery.create({ deploymentId })),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.deploymentLogs));

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
).pipe(EffectCommand.withDescription(cliCommandDescriptions.deploymentList));

const showDeploymentCommand = EffectCommand.make(
  "show",
  {
    deploymentId: deploymentIdArg,
  },
  ({ deploymentId }) => runQuery(ShowDeploymentQuery.create({ deploymentId })),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.deploymentShow));

const deploymentPlanCommand = EffectCommand.make(
  "plan",
  {
    project: projectOption,
    environment: environmentOption,
    resource: resourceOption,
    server: serverOption,
    destination: destinationOption,
  },
  ({ destination, environment, project, resource, server }) =>
    runQuery(
      DeploymentPlanQuery.create({
        projectId: optionalValue(project) ?? "",
        environmentId: optionalValue(environment) ?? "",
        resourceId: optionalValue(resource) ?? "",
        serverId: optionalValue(server) ?? "",
        destinationId: optionalValue(destination),
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.deploymentPlan));

const deploymentRecoveryReadinessCommand = EffectCommand.make(
  "recovery-readiness",
  {
    deploymentId: deploymentIdArg,
  },
  ({ deploymentId }) => runQuery(DeploymentRecoveryReadinessQuery.create({ deploymentId })),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.deploymentRecoveryReadiness));

const retryDeploymentCommand = EffectCommand.make(
  "retry",
  {
    deploymentId: deploymentIdArg,
    resource: resourceOption,
    readinessGeneratedAt: readinessGeneratedAtOption,
  },
  ({ deploymentId, readinessGeneratedAt, resource }) =>
    runCommand(
      RetryDeploymentCommand.create({
        deploymentId,
        resourceId: optionalValue(resource),
        readinessGeneratedAt: optionalValue(readinessGeneratedAt),
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.deploymentRetry));

const redeployDeploymentCommand = EffectCommand.make(
  "redeploy",
  {
    resourceId: resourceIdArg,
    project: projectOption,
    environment: environmentOption,
    server: serverOption,
    destination: destinationOption,
    sourceDeployment: sourceDeploymentOption,
    readinessGeneratedAt: readinessGeneratedAtOption,
  },
  ({
    destination,
    environment,
    project,
    readinessGeneratedAt,
    resourceId,
    server,
    sourceDeployment,
  }) =>
    runCommand(
      RedeployDeploymentCommand.create({
        resourceId,
        projectId: optionalValue(project),
        environmentId: optionalValue(environment),
        serverId: optionalValue(server),
        destinationId: optionalValue(destination),
        sourceDeploymentId: optionalValue(sourceDeployment),
        readinessGeneratedAt: optionalValue(readinessGeneratedAt),
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.deploymentRedeploy));

const rollbackDeploymentCommand = EffectCommand.make(
  "rollback",
  {
    deploymentId: deploymentIdArg,
    candidate: rollbackCandidateOption,
    resource: resourceOption,
    readinessGeneratedAt: readinessGeneratedAtOption,
  },
  ({ candidate, deploymentId, readinessGeneratedAt, resource }) =>
    runCommand(
      RollbackDeploymentCommand.create({
        deploymentId,
        rollbackCandidateDeploymentId: candidate,
        resourceId: optionalValue(resource),
        readinessGeneratedAt: optionalValue(readinessGeneratedAt),
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.deploymentRollback));

const streamDeploymentEventsCommand = EffectCommand.make(
  "events",
  {
    deploymentId: deploymentIdArg,
    cursor: deploymentCursorOption,
    follow: followEventsOption,
    historyLimit: deploymentHistoryLimitOption,
    includeHistory: includeHistoryOption,
    untilTerminal: untilTerminalOption,
  },
  ({ cursor, deploymentId, follow, historyLimit, includeHistory, untilTerminal }) =>
    runDeploymentEventStreamQuery(
      StreamDeploymentEventsQuery.create({
        deploymentId,
        follow,
        includeHistory,
        historyLimit: Number(historyLimit),
        untilTerminal,
        ...(optionalValue(cursor) ? { cursor: optionalValue(cursor) } : {}),
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.deploymentEvents));

export const deploymentsCommand = EffectCommand.make("deployments").pipe(
  EffectCommand.withDescription(cliCommandDescriptions.deployments),
  EffectCommand.withSubcommands([
    listDeploymentsCommand,
    showDeploymentCommand,
    deploymentPlanCommand,
    deploymentRecoveryReadinessCommand,
    retryDeploymentCommand,
    redeployDeploymentCommand,
    rollbackDeploymentCommand,
    streamDeploymentEventsCommand,
  ]),
);

export const previewCommand = EffectCommand.make("preview").pipe(
  EffectCommand.withDescription(cliCommandDescriptions.preview),
  EffectCommand.withSubcommands([
    previewCleanupCommand,
    previewPolicyCommand,
    previewEnvironmentCommand,
  ]),
);
