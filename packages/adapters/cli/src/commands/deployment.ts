import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import {
  ArchiveDeploymentCommand,
  CancelDeploymentCommand,
  CleanupPreviewCommand,
  CreateDeploymentCommand,
  type CreateDeploymentCommandInput,
  DeploymentPlanQuery,
  DeploymentProofQuery,
  DeploymentRecoveryReadinessQuery,
  type DeploymentSummary,
  DeploymentTimelineQuery,
  ForceRedeployDeploymentCommand,
  ListDeploymentsQuery,
  ListStaleDeploymentAttemptsQuery,
  PruneDeploymentsCommand,
  publicPreviewUrlsFromDeploymentSummary,
  ReconcileStaleDeploymentCommand,
  RedeployDeploymentCommand,
  RetryDeploymentCommand,
  RollbackDeploymentCommand,
  ShowDeploymentQuery,
  StreamDeploymentTimelineQuery,
} from "@appaloft/application";
import { createQuickDeployGeneratedResourceName } from "@appaloft/contracts";
import {
  domainError,
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
  applyAppaloftDeploymentConfigProfile,
  applyAppaloftDeploymentPreviewProfile,
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
  runDeploymentTimelineQuery,
  runQuery,
} from "../runtime.js";
import {
  applicationDeploymentPromptSeedsFromConfig,
  type DeploymentEnvironmentVariableSeed,
  type DeploymentPromptSeed,
  type DeploymentServerAppliedRouteSeed,
  defaultHttpHealthCheckPolicy,
  deploymentEntryModes,
  deploymentEnvironmentVariablesFromConfig,
  deploymentPromptSeedFromConfig,
  normalizeUrlFirstDeploymentEntry,
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
const entryModeOption = Options.choice("as", deploymentEntryModes).pipe(Options.optional);
const configOption = Options.text("config").pipe(Options.optional);
const configProfileOption = Options.text("config-profile").pipe(Options.optional);
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
const acknowledgeResourceProfileDriftOption = Options.boolean(
  "acknowledge-resource-profile-drift",
).pipe(Options.withDefault(false));
const appLogLinesOption = Options.text("app-log-lines").pipe(Options.withDefault("3"));
const followTimelineOption = Options.boolean("follow").pipe(Options.withDefault(false));
const deploymentTimelineJsonOption = Options.boolean("json").pipe(Options.withDefault(false));
const deploymentCursorOption = Options.text("cursor").pipe(Options.optional);
const deploymentHistoryLimitOption = Options.text("history-limit").pipe(Options.withDefault("100"));
const includeHistoryOption = Options.boolean("include-history").pipe(Options.withDefault(true));
const untilTerminalOption = Options.boolean("until-terminal").pipe(Options.withDefault(true));
const dryRunOption = Options.boolean("dry-run").pipe(Options.withDefault(true));
const includeArchivedOption = Options.boolean("include-archived").pipe(Options.withDefault(false));
const readinessGeneratedAtOption = Options.text("readiness-generated-at").pipe(Options.optional);
const staleAfterSecondsOption = Options.integer("stale-after-seconds").pipe(
  Options.withDefault(900),
);
const stateVersionOption = Options.text("state-version");
const sourceDeploymentOption = Options.text("source-deployment").pipe(Options.optional);
const rollbackCandidateOption = Options.text("candidate");
const confirmDeploymentCancelOption = Options.text("confirm");
const confirmDeploymentArchiveOption = Options.text("confirm");
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

function withConfigServiceGraph(
  resource: NonNullable<DeploymentPromptSeed["resource"]>,
  services: DeploymentPromptSeed["services"],
): NonNullable<DeploymentPromptSeed["resource"]> {
  if (!services || services.length === 0) {
    return resource;
  }

  return {
    ...resource,
    kind: services.length > 1 ? "compose-stack" : (resource.kind ?? "application"),
    services: services.map((service) => ({
      name: service.name,
      kind: service.kind,
    })),
  };
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

  if (messages.includes("config_profile_resolution")) {
    return "config-profile-resolution";
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
  previewContext: PreviewDeployContext | undefined,
): Result<DeploymentServerAppliedRouteSeed[] | undefined> {
  const template = previewDomainTemplate?.trim();
  if (!template) {
    return ok(undefined);
  }

  if (template.includes("${{") || template.includes("}}")) {
    return err(
      domainError.validation("Preview domain template contains unresolved GitHub expression", {
        phase: "preview-domain-template-resolution",
        reason: "unresolved_github_expression",
      }),
    );
  }

  const rendered = renderPreviewDomainTemplate(template, previewContext);
  if (rendered.isErr()) {
    return err(rendered.error);
  }
  const host = rendered.value;

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
    (parsed.data.domains ?? []).map((domain) => ({
      host: domain.host,
      pathPrefix: domain.pathPrefix,
      tlsMode: domain.tlsMode,
    })),
  );
}

function renderPreviewDomainTemplate(
  template: string,
  previewContext: PreviewDeployContext | undefined,
): Result<string> {
  const normalizedTemplate = template.trim().toLowerCase();
  let missingVariable: "preview_id" | "pr_number" | undefined;
  let unsupportedVariable = false;
  const rendered = normalizedTemplate.replace(/\{([^{}]+)\}/g, (_, rawToken: string) => {
    const token = rawToken.trim().toLowerCase();
    if (token === "preview_id") {
      const previewId = previewContext?.previewId.trim().toLowerCase();
      if (!previewId) {
        missingVariable = token;
        return "";
      }

      return previewId;
    }
    if (token === "pr_number") {
      const pullRequestNumber = previewContext?.pullRequestNumber;
      if (!pullRequestNumber) {
        missingVariable = token;
        return "";
      }

      return String(pullRequestNumber);
    }

    unsupportedVariable = true;
    return "";
  });

  if (unsupportedVariable || /[{}]/.test(rendered)) {
    return err(
      domainError.validation("Preview domain template includes unsupported variables", {
        phase: "preview-domain-template-resolution",
        previewDomainTemplate: normalizedTemplate,
      }),
    );
  }

  if (missingVariable) {
    return err(
      domainError.validation("Preview domain template requires preview context", {
        phase: "preview-domain-template-resolution",
        previewDomainTemplate: normalizedTemplate,
        variable: missingVariable,
      }),
    );
  }

  return ok(rendered);
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
  applicationKey?: string;
}): string {
  const env = Bun.env;
  const repositoryLocator = env.GITHUB_REPOSITORY
    ? `https://github.com/${env.GITHUB_REPOSITORY}`
    : input.sourceLocator;
  const sourceDirectory = resolveLocalSourceDirectory(input.sourceLocator) ?? process.cwd();
  const workspaceRoot = env.GITHUB_WORKSPACE ?? resolveGitRoot(sourceDirectory) ?? sourceDirectory;
  const configFilePath = input.configResolution?.configFilePath ?? "appaloft.yml";
  const applicationConfigPath = input.applicationKey
    ? `${configPathForApplicationFingerprint(configFilePath, workspaceRoot)}#applications.${input.applicationKey}`
    : undefined;

  return createSourceFingerprint({
    provider: env.GITHUB_REPOSITORY ? "github" : "local",
    ...(env.GITHUB_REPOSITORY_ID ? { providerRepositoryId: env.GITHUB_REPOSITORY_ID } : {}),
    repositoryLocator,
    baseDirectory:
      input.baseDirectory ?? input.configResolution?.config.source?.baseDirectory ?? ".",
    configPath: applicationConfigPath ?? configFilePath,
    workspaceRoot,
    ...(env.GITHUB_REF ? { gitRef: env.GITHUB_REF } : {}),
    ...(env.GITHUB_SHA ? { commitSha: env.GITHUB_SHA } : {}),
    scope:
      input.previewContext?.sourceScope ??
      (env.GITHUB_REPOSITORY ? githubScopeFromEnv(env) : { kind: "default" }),
  }).key;
}

function configPathForApplicationFingerprint(
  configFilePath: string,
  workspaceRoot: string,
): string {
  if (!isAbsolute(configFilePath)) {
    return configFilePath;
  }

  const resolvedConfigPath = resolve(configFilePath);
  const resolvedWorkspaceRoot = resolve(workspaceRoot).replace(/\/+$/, "");
  if (
    resolvedWorkspaceRoot &&
    (resolvedConfigPath === resolvedWorkspaceRoot ||
      resolvedConfigPath.startsWith(`${resolvedWorkspaceRoot}/`))
  ) {
    const relativePath = relative(resolvedWorkspaceRoot, resolvedConfigPath);
    return relativePath || basename(resolvedConfigPath);
  }

  return basename(resolvedConfigPath);
}

function applyCommonDeploymentSeed(input: {
  seed: DeploymentPromptSeed;
  projectId?: string;
  serverId?: string;
  serverSpec?: DeploymentPromptSeed["server"];
  destinationId?: string;
  environmentId?: string;
  previewContext?: PreviewDeployContext;
  resourceId?: string;
  resourceSpec?: DeploymentPromptSeed["resource"];
  deploymentMethod?: DeploymentPromptSeed["deploymentMethod"];
  installCommand?: string;
  buildCommand?: string;
  startCommand?: string;
  runtimeName?: string;
  publishDirectory?: string;
  dockerfilePath?: string;
  dockerComposeFilePath?: string;
  buildTarget?: string;
  port?: number;
  upstreamProtocol?: DeploymentPromptSeed["upstreamProtocol"];
  exposureMode?: DeploymentPromptSeed["exposureMode"];
  targetServiceName?: string;
  hostPort?: number;
  healthCheckPath?: string;
  healthCheck?: DeploymentPromptSeed["healthCheck"];
  environmentVariables?: DeploymentPromptSeed["environmentVariables"];
  sourceProfile?: DeploymentPromptSeed["sourceProfile"];
  sourceFingerprint?: string;
  stateBackendDecision?: DeploymentPromptSeed["stateBackend"];
  profileDriftPreflight?: boolean;
}): DeploymentPromptSeed {
  return {
    ...input.seed,
    ...(input.sourceProfile && Object.keys(input.sourceProfile).length > 0
      ? {
          sourceProfile: {
            ...(input.seed.sourceProfile ?? {}),
            ...input.sourceProfile,
          },
        }
      : {}),
    ...(input.projectId ? { projectId: input.projectId } : {}),
    ...(input.serverId ? { serverId: input.serverId } : {}),
    ...(input.serverSpec ? { server: input.serverSpec } : {}),
    ...(input.destinationId ? { destinationId: input.destinationId } : {}),
    ...(input.environmentId ? { environmentId: input.environmentId } : {}),
    ...(input.previewContext && !input.environmentId
      ? { environment: { name: input.previewContext.environmentName, kind: "preview" as const } }
      : {}),
    ...(input.resourceId ? { resourceId: input.resourceId } : {}),
    ...(input.resourceSpec ? { resource: input.resourceSpec } : {}),
    ...(input.deploymentMethod ? { deploymentMethod: input.deploymentMethod } : {}),
    ...(input.installCommand ? { installCommand: input.installCommand } : {}),
    ...(input.buildCommand ? { buildCommand: input.buildCommand } : {}),
    ...(input.startCommand ? { startCommand: input.startCommand } : {}),
    ...(input.runtimeName ? { runtimeName: input.runtimeName } : {}),
    ...(input.publishDirectory ? { publishDirectory: input.publishDirectory } : {}),
    ...(input.dockerfilePath ? { dockerfilePath: input.dockerfilePath } : {}),
    ...(input.dockerComposeFilePath ? { dockerComposeFilePath: input.dockerComposeFilePath } : {}),
    ...(input.buildTarget ? { buildTarget: input.buildTarget } : {}),
    ...(input.port === undefined ? {} : { port: input.port }),
    ...(input.upstreamProtocol ? { upstreamProtocol: input.upstreamProtocol } : {}),
    ...(input.exposureMode ? { exposureMode: input.exposureMode } : {}),
    ...(input.targetServiceName ? { targetServiceName: input.targetServiceName } : {}),
    ...(input.hostPort === undefined ? {} : { hostPort: input.hostPort }),
    ...(input.healthCheckPath ? { healthCheckPath: input.healthCheckPath } : {}),
    ...(input.healthCheck ? { healthCheck: input.healthCheck } : {}),
    ...(input.environmentVariables && input.environmentVariables.length > 0
      ? { environmentVariables: input.environmentVariables }
      : {}),
    ...(input.sourceFingerprint ? { sourceFingerprint: input.sourceFingerprint } : {}),
    ...(input.stateBackendDecision ? { stateBackend: input.stateBackendDecision } : {}),
    ...(input.previewContext ? { isPullRequestPreview: true } : {}),
    ...(input.profileDriftPreflight ? { profileDriftPreflight: true } : {}),
  };
}

type CommonDeploymentSeedInput = Omit<Parameters<typeof applyCommonDeploymentSeed>[0], "seed">;

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

interface PreviewAccessResolution {
  deploymentId: string;
  resourceId: string;
  status?: string;
  previewUrls: string[];
}

const deploymentTerminalStatuses = new Set<DeploymentSummary["status"]>([
  "succeeded",
  "failed",
  "canceled",
  "interrupted",
  "rolled-back",
]);
const synchronousDeploymentPollIntervalMs = 250;
const synchronousDeploymentTimeoutMs = 15 * 60 * 1000;

function deploymentFailureLogTailDetails(deployment: DeploymentSummary) {
  const timeline = deployment.timeline ?? [];
  if (timeline.length === 0) {
    return {};
  }

  const diagnosticLogs = timeline.filter((log) => log.level === "error" || log.level === "warn");
  const selectedLogs = (diagnosticLogs.length > 0 ? diagnosticLogs : timeline).slice(-8);

  return {
    failureLogCount: timeline.length,
    failureLogTail: selectedLogs.map((log) =>
      [
        log.timestamp,
        `${log.phase}/${log.level}`,
        log.source,
        log.masked ? "[masked]" : log.message,
      ]
        .filter(Boolean)
        .join(" ")
        .slice(0, 1000),
    ),
  };
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

function readDeploymentSummary(input: { deploymentId: string; resourceId: string }) {
  return Effect.gen(function* () {
    const cli = yield* CliRuntime;
    const query = yield* resultToEffect(
      ListDeploymentsQuery.create({ resourceId: input.resourceId }),
    );
    const result = yield* Effect.promise(() => cli.executeQuery(query));
    const deployments = yield* resultToEffect(result);
    return deployments.items.find((item) => item.id === input.deploymentId);
  });
}

function waitForSynchronousDeployment(input: { deploymentId: string; resourceId: string }) {
  return Effect.gen(function* () {
    const cli = yield* CliRuntime;
    yield* Effect.promise(() => (cli.startWorkerRuntime ?? cli.startServer)());

    const deadline = Date.now() + synchronousDeploymentTimeoutMs;
    while (true) {
      const deployment = yield* readDeploymentSummary(input);
      if (deployment && deploymentTerminalStatuses.has(deployment.status)) {
        return deployment;
      }

      if (Date.now() >= deadline) {
        return deployment;
      }

      yield* Effect.promise(() => Bun.sleep(synchronousDeploymentPollIntervalMs));
    }
  });
}

function failIfSynchronousDeploymentDidNotSucceed(deployment: DeploymentSummary | undefined) {
  return Effect.gen(function* () {
    if (deployment?.status === "succeeded") {
      return;
    }

    const details = deployment ? deploymentFailureLogTailDetails(deployment) : {};
    const failureLogTail = Array.isArray(details.failureLogTail)
      ? details.failureLogTail.join("\n")
      : undefined;

    return yield* Effect.fail(
      domainError.infra("Deployment execution failed", {
        phase: "runtime-execution",
        reason: deployment ? "deployment_failed" : "deployment_not_observable",
        ...(deployment
          ? {
              deploymentId: deployment.id,
              resourceId: deployment.resourceId,
              status: deployment.status,
            }
          : {}),
        ...(typeof details.failureLogCount === "number"
          ? { failureLogCount: details.failureLogCount }
          : {}),
        ...(failureLogTail ? { failureLogTail } : {}),
      }),
    );
  });
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
    const deployment = yield* readDeploymentSummary({
      deploymentId: input.deploymentId,
      resourceId: input.resourceId,
    });

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

    const previewUrls = publicPreviewUrlsFromDeploymentSummary(deployment);
    if (input.requirePreviewUrl && previewUrls.length === 0) {
      return yield* Effect.fail(
        domainError.validation("Preview URL is required but no public route was resolved", {
          phase: "preview-access-resolution",
          reason: "preview_url_missing",
          deploymentId: input.deploymentId,
          resourceId: input.resourceId,
          status: deployment.status,
          ...deploymentFailureLogTailDetails(deployment),
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
          ...deploymentFailureLogTailDetails(deployment),
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
    let deployment: DeploymentSummary | undefined;
    if (input.executionMode === "detached") {
      deployment = yield* readDeploymentSummary({
        deploymentId: output.id,
        resourceId: input.resourceId,
      });
    } else {
      deployment = yield* waitForSynchronousDeployment({
        deploymentId: output.id,
        resourceId: input.resourceId,
      });
    }

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

    if (input.executionMode !== "detached") {
      yield* failIfSynchronousDeploymentDidNotSucceed(deployment);
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
    entryMode: entryModeOption,
    config: configOption,
    configProfile: configProfileOption,
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
    acknowledgeResourceProfileDrift: acknowledgeResourceProfileDriftOption,
    stateBackend: stateBackendOption,
    appLogLines: appLogLinesOption,
  },
  ({
    acknowledgeResourceProfileDrift,
    appLogLines,
    build,
    buildTarget,
    config,
    configProfile,
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
    entryMode,
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
      const requestedEntryMode = optionalValue(entryMode);
      const requestedDeploymentMethodFromFlag = optionalValue(method);
      const publishDirectoryFromFlag = optionalValue(publishDir);
      const requestedConfigProfile = optionalValue(configProfile);
      const urlFirstEntry = yield* resultToEffect(
        normalizeUrlFirstDeploymentEntry({
          ...(requestedDeploymentMethodFromFlag
            ? { requestedDeploymentMethod: requestedDeploymentMethodFromFlag }
            : {}),
          ...(requestedEntryMode ? { entryMode: requestedEntryMode } : {}),
          sourceLocator: sourceLocator ?? ".",
          ...(publishDirectoryFromFlag ? { publishDirectory: publishDirectoryFromFlag } : {}),
        }),
      );
      const requestedDeploymentMethod = urlFirstEntry.deploymentMethod;
      const portValue = optionalNumber(port);
      const configFilePath = optionalValue(config);
      const projectId = optionalValue(project);
      const serverId = optionalValue(server);
      const serverHostValue = optionalValue(serverHost);
      const serverNameValue = optionalValue(serverName);
      const serverProviderValue = optionalValue(serverProvider);
      const serverPortValue = optionalNumber(serverPort);
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
      const publishDirectory = urlFirstEntry.publishDirectory;
      const sourceBaseDirectoryValue = optionalValue(sourceBaseDirectory);
      const dockerfilePathValue = optionalValue(dockerfilePath);
      const dockerComposeFilePathValue = optionalValue(dockerComposeFilePath);
      const buildTargetValue = optionalValue(buildTarget);
      const upstreamProtocolValue = optionalValue(upstreamProtocol);
      const exposureModeValue = optionalValue(exposureMode);
      const targetServiceNameValue = optionalValue(targetServiceName);
      const hostPortValue = optionalNumber(hostPort);
      const healthCheckPath = optionalValue(healthPath);
      const healthCheck = healthCheckPath
        ? defaultHttpHealthCheckPolicy({ path: healthCheckPath })
        : undefined;
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
          requestedConfigProfile ||
          flagEnvironmentVariables.length > 0 ||
          requestedPreviewDomainTemplate ||
          requestedPreviewTlsMode,
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
      if (requestedConfigProfile && !configResolution) {
        return yield* Effect.fail(
          domainError.validation("Deployment config profile requires a config file", {
            phase: "config-profile-resolution",
            profile: requestedConfigProfile,
          }),
        );
      }
      const selectedConfig =
        configResolution && requestedConfigProfile
          ? yield* resultToEffect(
              applyAppaloftDeploymentConfigProfile(configResolution.config, requestedConfigProfile),
            )
          : configResolution?.config;
      const effectiveConfig =
        selectedConfig && previewContext
          ? applyAppaloftDeploymentPreviewProfile(selectedConfig)
          : selectedConfig;
      const configPreviewDomainTemplate = previewContext
        ? effectiveConfig?.preview?.pullRequest?.domainTemplate
        : undefined;
      const configPreviewTlsMode = previewContext
        ? effectiveConfig?.preview?.pullRequest?.tlsMode
        : undefined;
      const previewDomainRoutes = yield* resultToEffect(
        resolvePreviewDomainTemplateRoutes(
          requestedPreviewDomainTemplate ?? configPreviewDomainTemplate,
          requestedPreviewTlsMode ?? configPreviewTlsMode,
          previewContext,
        ),
      );
      const configSeed = applyPreviewRoutePrecedence({
        configSeed: effectiveConfig ? deploymentPromptSeedFromConfig(effectiveConfig) : {},
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
        ? yield* resultToEffect(
            deploymentEnvironmentVariablesFromConfig(effectiveConfig ?? configResolution.config, {
              ...(previewContext
                ? {
                    previewContext: {
                      previewId: previewContext.previewId,
                      pullRequestNumber: previewContext.pullRequestNumber,
                    },
                  }
                : {}),
            }),
          )
        : [];
      const environmentVariables = [...configEnvironmentVariables, ...flagEnvironmentVariables];
      const deploymentMethod = requestedDeploymentMethod ?? configSeed.deploymentMethod;
      const configAnchoredSourceLocator =
        effectiveConfig?.source?.type === "image" && configSeed.sourceLocator
          ? configSeed.sourceLocator
          : sourceLocator
            ? resolveConfigAnchoredSourceLocator({
                sourceLocator,
                ...(configResolution ? { configResolution } : {}),
              })
            : (configSeed.sourceLocator ??
              resolveConfigAnchoredSourceLocator({
                ...(configResolution ? { configResolution } : {}),
              }) ??
              (configResolution ? "." : undefined));
      const normalizedSourceLocator = configAnchoredSourceLocator
        ? normalizeCliPathOrSource(configAnchoredSourceLocator, deploymentMethod ?? "auto")
        : undefined;
      const configuredSourceLocator = normalizedSourceLocator;
      const resourceSpec =
        !resourceId && (resourceNameValue || configuredSourceLocator)
          ? withConfigServiceGraph(
              {
                name: resourceNameValue ?? inferResourceName(configuredSourceLocator ?? "."),
                kind:
                  resourceKindValue ??
                  (deploymentMethod === "docker-compose"
                    ? "compose-stack"
                    : deploymentMethod === "static"
                      ? "static-site"
                      : "application"),
                ...(resourceDescriptionValue ? { description: resourceDescriptionValue } : {}),
              },
              configSeed.services,
            )
          : undefined;
      const serverSshPrivateKey = serverSshPrivateKeyFileValue
        ? yield* Effect.promise(() => Bun.file(serverSshPrivateKeyFileValue).text())
        : undefined;
      const serverSpec =
        serverHostValue ||
        serverNameValue ||
        serverProviderValue ||
        serverPortValue !== undefined ||
        serverSshUsernameValue ||
        serverSshPublicKeyValue ||
        serverSshPrivateKey
          ? {
              ...(serverNameValue ? { name: serverNameValue } : {}),
              ...(serverHostValue ? { host: serverHostValue } : {}),
              ...(serverProviderValue ? { providerKey: serverProviderValue } : {}),
              ...(serverPortValue === undefined ? {} : { port: serverPortValue }),
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

      const stateSession = yield* prepareDeploymentStateSessionIfNeeded(stateBackendDecision);
      const runResolvedDeploymentFromSeed = (inputSeed: DeploymentPromptSeed) =>
        Effect.gen(function* () {
          const sourceLocatorForSeed = inputSeed.sourceLocator ?? configuredSourceLocator;
          const seed = {
            ...inputSeed,
            ...(stateSession ? { stateBackendPrepared: true } : {}),
            ...(sourceLocatorForSeed ? { sourceLocator: sourceLocatorForSeed } : {}),
          };
          const input = yield* resolveInteractiveDeploymentInput(seed);

          return yield* runCreateDeploymentCommand(input, {
            appLogLines: parseAppLogLines(appLogLines),
            requirePreviewUrl,
            ...(previewOutputFilePath ? { previewOutputFile: previewOutputFilePath } : {}),
            ...(previewContext?.previewId ? { previewId: previewContext.previewId } : {}),
          });
        });
      const commonSeedInput = {
        ...(projectId ? { projectId } : {}),
        ...(serverId ? { serverId } : {}),
        ...(serverSpec ? { serverSpec } : {}),
        ...(destinationId ? { destinationId } : {}),
        ...(environmentId ? { environmentId } : {}),
        ...(previewContext ? { previewContext } : {}),
        ...(resourceId ? { resourceId } : {}),
        ...(resourceSpec ? { resourceSpec } : {}),
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
        ...(healthCheck ? { healthCheck } : {}),
        ...(environmentVariables.length > 0 ? { environmentVariables } : {}),
        ...(sourceFingerprint ? { sourceFingerprint } : {}),
        ...(stateBackendDecision ? { stateBackendDecision } : {}),
        ...(configResolution && !acknowledgeResourceProfileDrift
          ? { profileDriftPreflight: true }
          : {}),
      } satisfies CommonDeploymentSeedInput;
      const applicationSeeds =
        effectiveConfig && configResolution
          ? applicationDeploymentPromptSeedsFromConfig(effectiveConfig).map((application) => ({
              key: application.key,
              seed: applyPreviewRoutePrecedence({
                configSeed: application.seed,
                configResolution,
                ...(previewContext ? { previewContext } : {}),
                ...(previewDomainRoutes ? { previewDomainRoutes } : {}),
              }),
            }))
          : [];
      const runResolvedDeployment = Effect.gen(function* () {
        if (applicationSeeds.length > 0) {
          if (!effectiveConfig || !configResolution) {
            return yield* Effect.fail(
              domainError.validation("Application graph deploy requires a resolved config file", {
                phase: "config-application-resolution",
                reason: "config_missing",
              }),
            );
          }

          if (resourceId || resourceNameValue || resourceKindValue || resourceDescriptionValue) {
            return yield* Effect.fail(
              domainError.validation(
                "Application graph deploy cannot use a single Resource selector or Resource draft override",
                {
                  phase: "config-application-resolution",
                  reason: "single_resource_override",
                },
              ),
            );
          }

          const {
            deploymentMethod: _topLevelDeploymentMethod,
            environmentVariables: _topLevelEnvironmentVariables,
            resourceId: _topLevelResourceId,
            resourceSpec: _topLevelResourceSpec,
            runtimeName: _topLevelRuntimeName,
            sourceFingerprint: _topLevelSourceFingerprint,
            ...applicationCommonSeedInput
          } = commonSeedInput;
          const applicationFlagSeedInput = {
            ...applicationCommonSeedInput,
            ...(requestedDeploymentMethod ? { deploymentMethod: requestedDeploymentMethod } : {}),
          } satisfies CommonDeploymentSeedInput;

          for (const application of applicationSeeds) {
            const applicationSourceLocator =
              application.seed.sourceLocator ?? configuredSourceLocator ?? configSourceLocator;
            const applicationSourceProfile = {
              ...(application.seed.sourceProfile ?? {}),
              ...(sourceBaseDirectoryValue ? { baseDirectory: sourceBaseDirectoryValue } : {}),
            };
            const applicationRuntimeName = yield* resultToEffect(
              resolveRuntimeNameSeed({
                ...(runtimeNameValue ? { explicitRuntimeName: runtimeNameValue } : {}),
                configSeed: application.seed,
                ...(previewContext ? { previewContext } : {}),
              }),
            );
            const applicationEnvironmentVariables = yield* resultToEffect(
              deploymentEnvironmentVariablesFromConfig(
                effectiveConfig.applications?.[application.key] ?? {},
                {
                  ...(previewContext
                    ? {
                        previewContext: {
                          previewId: previewContext.previewId,
                          pullRequestNumber: previewContext.pullRequestNumber,
                        },
                      }
                    : {}),
                },
              ),
            );
            const applicationSourceFingerprint =
              configResolution || requestedStateBackend || previewContext || stateBackendDecision
                ? sourceFingerprintForConfigDeploy({
                    sourceLocator: applicationSourceLocator,
                    ...(applicationSourceProfile.baseDirectory
                      ? { baseDirectory: applicationSourceProfile.baseDirectory }
                      : {}),
                    configResolution,
                    ...(previewContext ? { previewContext } : {}),
                    applicationKey: application.key,
                  })
                : undefined;
            const applicationSeed = applyCommonDeploymentSeed({
              ...applicationFlagSeedInput,
              ...(applicationSourceFingerprint
                ? { sourceFingerprint: applicationSourceFingerprint }
                : {}),
              seed: application.seed,
              sourceProfile: applicationSourceProfile,
              ...(applicationRuntimeName ? { runtimeName: applicationRuntimeName } : {}),
              environmentVariables: [
                ...applicationEnvironmentVariables,
                ...flagEnvironmentVariables,
              ],
            });

            yield* runResolvedDeploymentFromSeed(applicationSeed);
          }

          return;
        }

        const seed = applyCommonDeploymentSeed({
          ...commonSeedInput,
          seed: configSeed,
          sourceProfile,
        });
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
  ({ deploymentId }) =>
    runQuery(
      DeploymentTimelineQuery.create({
        deploymentId,
        kinds: ["output", "container-log", "command", "diagnostic"],
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.deploymentTimeline));

const listDeploymentsCommand = EffectCommand.make(
  "list",
  {
    project: projectOption,
    resource: resourceOption,
    includeArchived: includeArchivedOption,
  },
  ({ includeArchived, project, resource }) =>
    runQuery(
      ListDeploymentsQuery.create({
        projectId: optionalValue(project),
        resourceId: optionalValue(resource),
        includeArchived,
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.deploymentList));

const listStaleDeploymentAttemptsCommand = EffectCommand.make(
  "stale",
  {
    project: projectOption,
    resource: resourceOption,
    staleAfterSeconds: staleAfterSecondsOption,
  },
  ({ project, resource, staleAfterSeconds }) =>
    runQuery(
      ListStaleDeploymentAttemptsQuery.create({
        projectId: optionalValue(project),
        resourceId: optionalValue(resource),
        staleAfterSeconds,
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.deploymentStale));

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

const deploymentProofCommand = EffectCommand.make(
  "proof",
  { deploymentId: deploymentIdArg },
  ({ deploymentId }) => runQuery(DeploymentProofQuery.create({ deploymentId })),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.deploymentProof));

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

const forceRedeployDeploymentCommand = EffectCommand.make(
  "force-redeploy",
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
      ForceRedeployDeploymentCommand.create({
        resourceId,
        projectId: optionalValue(project),
        environmentId: optionalValue(environment),
        serverId: optionalValue(server),
        destinationId: optionalValue(destination),
        sourceDeploymentId: optionalValue(sourceDeployment),
        readinessGeneratedAt: optionalValue(readinessGeneratedAt),
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.deploymentForceRedeploy));

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

const cancelDeploymentCommand = EffectCommand.make(
  "cancel",
  {
    deploymentId: deploymentIdArg,
    confirm: confirmDeploymentCancelOption,
    resource: resourceOption,
  },
  ({ confirm, deploymentId, resource }) =>
    runCommand(
      CancelDeploymentCommand.create({
        deploymentId,
        confirm,
        resourceId: optionalValue(resource),
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.deploymentCancel));

const reconcileStaleDeploymentCommand = EffectCommand.make(
  "reconcile-stale",
  {
    deploymentId: deploymentIdArg,
    confirm: confirmDeploymentCancelOption,
    resource: resourceOption,
    staleAfterSeconds: staleAfterSecondsOption,
    stateVersion: stateVersionOption,
  },
  ({ confirm, deploymentId, resource, staleAfterSeconds, stateVersion }) =>
    runCommand(
      ReconcileStaleDeploymentCommand.create({
        deploymentId,
        confirm,
        stateVersion,
        resourceId: optionalValue(resource),
        staleAfterSeconds,
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.deploymentReconcileStale));

const archiveDeploymentCommand = EffectCommand.make(
  "archive",
  {
    deploymentId: deploymentIdArg,
    confirm: confirmDeploymentArchiveOption,
    resource: resourceOption,
  },
  ({ confirm, deploymentId, resource }) =>
    runCommand(
      ArchiveDeploymentCommand.create({
        deploymentId,
        confirm,
        resourceId: optionalValue(resource),
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.deploymentArchive));

const pruneDeploymentsCommand = EffectCommand.make(
  "prune",
  {
    before: Options.text("before"),
    deployment: Options.text("deployment").pipe(Options.optional),
    resource: resourceOption,
    server: serverOption,
    dryRun: dryRunOption,
  },
  ({ before, deployment, dryRun, resource, server }) =>
    runCommand(
      PruneDeploymentsCommand.create({
        before,
        ...(optionalValue(deployment) ? { deploymentId: optionalValue(deployment) } : {}),
        ...(optionalValue(resource) ? { resourceId: optionalValue(resource) } : {}),
        ...(optionalValue(server) ? { serverId: optionalValue(server) } : {}),
        dryRun,
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.deploymentPrune));

const deploymentTimelineCommand = EffectCommand.make(
  "timeline",
  {
    deploymentId: deploymentIdArg,
    cursor: deploymentCursorOption,
    follow: followTimelineOption,
    historyLimit: deploymentHistoryLimitOption,
    includeHistory: includeHistoryOption,
    json: deploymentTimelineJsonOption,
    untilTerminal: untilTerminalOption,
  },
  ({ cursor, deploymentId, follow, historyLimit, includeHistory, json, untilTerminal }) => {
    void json;
    const normalizedCursor = optionalValue(cursor);
    const limit = Number(historyLimit);

    if (!follow) {
      void includeHistory;
      void untilTerminal;
      return runQuery(
        DeploymentTimelineQuery.create({
          deploymentId,
          limit,
          ...(normalizedCursor ? { cursor: normalizedCursor } : {}),
        }),
      );
    }

    return runDeploymentTimelineQuery(
      StreamDeploymentTimelineQuery.create({
        deploymentId,
        follow,
        includeHistory,
        limit,
        untilTerminal,
        ...(normalizedCursor ? { cursor: normalizedCursor } : {}),
      }),
    );
  },
).pipe(EffectCommand.withDescription(cliCommandDescriptions.deploymentTimeline));

export const deploymentsCommand = EffectCommand.make("deployments").pipe(
  EffectCommand.withDescription(cliCommandDescriptions.deployments),
  EffectCommand.withSubcommands([
    listDeploymentsCommand,
    listStaleDeploymentAttemptsCommand,
    showDeploymentCommand,
    deploymentPlanCommand,
    deploymentProofCommand,
    deploymentRecoveryReadinessCommand,
    retryDeploymentCommand,
    redeployDeploymentCommand,
    forceRedeployDeploymentCommand,
    rollbackDeploymentCommand,
    cancelDeploymentCommand,
    reconcileStaleDeploymentCommand,
    archiveDeploymentCommand,
    pruneDeploymentsCommand,
    logsCommand,
    deploymentTimelineCommand,
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
