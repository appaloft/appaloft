import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

type ConfigEnv = Record<string, string | undefined>;

export interface DefaultAccessDomainConfig {
  mode: "disabled" | "provider";
  providerKey: string;
  zone: string;
  scheme: "http" | "https";
}

export interface AcmeCertificateProviderConfig {
  directoryUrl: string;
  email?: string;
  accountPrivateKeyPem?: string;
  accountPrivateKeyPath?: string;
  termsOfServiceAgreed: boolean;
  skipChallengeVerification: boolean;
  challengeTokenTtlSeconds: number;
}

export interface CertificateProviderConfig {
  mode: "disabled" | "acme";
  providerKey: string;
  acme: AcmeCertificateProviderConfig;
}

export interface CertificateRetrySchedulerConfig {
  enabled: boolean;
  intervalSeconds: number;
  defaultRetryDelaySeconds: number;
  batchSize: number;
}

export interface ScheduledTaskRunnerConfig {
  enabled: boolean;
  intervalSeconds: number;
  batchSize: number;
}

export interface ScheduledRuntimePruneRunnerConfig {
  enabled: boolean;
  intervalSeconds: number;
  batchSize: number;
}

export interface ScheduledDependencyBackupRunnerConfig {
  enabled: boolean;
  intervalSeconds: number;
  batchSize: number;
}

export interface ScheduledHistoryRetentionRunnerConfig {
  enabled: boolean;
  intervalSeconds: number;
  batchSize: number;
}

export interface RuntimeMonitoringCollectorRunnerConfig {
  enabled: boolean;
  intervalSeconds: number;
  batchSize: number;
  rawRetentionHours: number;
}

export type WorkerRuntimeMode = "embedded" | "standalone" | "disabled";
export type WorkerQueueBackend = "database" | "external";
export type ExternalWorkerBackendKind = "kafka" | "temporal" | "custom";

export interface WorkerRuntimeConfig {
  mode: WorkerRuntimeMode;
  queueBackend: WorkerQueueBackend;
  workerCount: number;
  workerGroup: string;
  externalBackendKind?: ExternalWorkerBackendKind;
}

export interface PreviewCleanupRetrySchedulerConfig {
  enabled: boolean;
  intervalSeconds: number;
  batchSize: number;
}

export interface PreviewExpiryCleanupSchedulerConfig {
  enabled: boolean;
  intervalSeconds: number;
  batchSize: number;
}

export interface DockerSwarmExecutionConfig {
  enabled: boolean;
  commandTimeoutMs: number;
  edgeNetworkName?: string;
}

export interface TerminalSessionsConfig {
  activeTtlSeconds: number;
  outputRetentionBytes: number;
}

export type ActionDeployTokenWorkflow =
  | "preview-cleanup"
  | "server-config-deploy"
  | "source-link-deploy";

export interface ActionDeployTokenScopeConfig {
  environmentId?: string;
  projectId?: string;
  repositoryFullName?: string;
  resourceId?: string;
  serverId?: string;
  workflows?: ActionDeployTokenWorkflow[];
}

export interface AppConfig {
  appName: string;
  appVersion: string;
  runtimeMode: "self-hosted" | "hosted-control-plane";
  authProvider: "better-auth" | "none";
  betterAuthBaseUrl: string;
  betterAuthCookieDomain?: string;
  betterAuthCookiePrefix?: string;
  betterAuthSecret: string;
  betterAuthMinPasswordLength?: number;
  betterAuthTrustedProxyHeaders?: boolean;
  betterAuthTrustedOrigins?: string[];
  actionDeployToken?: string;
  actionDeployTokenScope?: ActionDeployTokenScopeConfig;
  bootstrapDeployTokenOutputFile?: string;
  bootstrapFirstAdminOutputFile?: string;
  firstAdminDisplayName?: string;
  firstAdminEmail?: string;
  firstAdminOrganizationName?: string;
  firstAdminOrganizationSlug?: string;
  firstAdminPassword?: string;
  githubClientId?: string;
  githubClientSecret?: string;
  githubRedirectUri?: string;
  githubConnectionMode?: "user-oauth" | "hosted-provider-app" | "operator-managed-app";
  githubAppOwner?: string;
  githubAppSlug?: string;
  githubAppId?: string;
  githubAppClientId?: string;
  githubAppClientSecret?: string;
  githubAppInstallUrl?: string;
  githubAppCallbackUrl?: string;
  githubAppWebhookUrl?: string;
  githubAppWebhookSecret?: string;
  githubAppPrivateKey?: string;
  githubAppPrivateKeyBase64?: string;
  googleClientId?: string;
  googleClientSecret?: string;
  googleRedirectUri?: string;
  oidcClientId?: string;
  oidcClientSecret?: string;
  oidcDiscoveryUrl?: string;
  oidcIssuer?: string;
  oidcRedirectUri?: string;
  githubWebhookSecret?: string;
  githubPreviewFeedbackToken?: string;
  httpHost: string;
  httpIdleTimeoutSeconds?: number;
  httpPort: number;
  webOrigin: string;
  resourceAccessFailureRendererUrl?: string;
  webStaticDir?: string;
  docsStaticDir?: string;
  databaseDriver: "postgres" | "pglite";
  autoMigrate: boolean;
  databaseUrl?: string;
  databasePoolMax?: number;
  dataDir: string;
  pgliteDataDir: string;
  remoteRuntimeRoot: string;
  remotePgliteSyncBackupRetentionDays: number;
  remotePgliteSyncBackupMaxCount: number;
  logLevel: "debug" | "info" | "warn" | "error";
  environment: string;
  otelEnabled: boolean;
  otelServiceName: string;
  otelExporterEndpoint?: string;
  otelExporterHeaders?: string;
  otelTracesSampler?: string;
  otelTracesSamplerArg?: string;
  traceLinkBaseUrl?: string;
  traceLinkUrlTemplate?: string;
  secretMask: string;
  defaultAccessDomain: DefaultAccessDomainConfig;
  certificateProvider: CertificateProviderConfig;
  certificateRetryScheduler: CertificateRetrySchedulerConfig;
  previewExpiryCleanupScheduler: PreviewExpiryCleanupSchedulerConfig;
  previewCleanupRetryScheduler: PreviewCleanupRetrySchedulerConfig;
  dockerSwarmExecution: DockerSwarmExecutionConfig;
  terminalSessions: TerminalSessionsConfig;
  scheduledTaskRunner: ScheduledTaskRunnerConfig;
  scheduledRuntimePruneRunner: ScheduledRuntimePruneRunnerConfig;
  scheduledDependencyBackupRunner: ScheduledDependencyBackupRunnerConfig;
  scheduledHistoryRetentionRunner: ScheduledHistoryRetentionRunnerConfig;
  runtimeMonitoringCollectorRunner: RuntimeMonitoringCollectorRunnerConfig;
  workerRuntime: WorkerRuntimeConfig;
  enabledSystemPlugins: string[];
  configFilePath?: string;
}

export interface ConfigSource<TValue> {
  flags?: Partial<TValue>;
  env?: ConfigEnv;
  configFilePath?: string;
}

const defaultDockerSwarmEdgeNetworkName = "appaloft-edge";

const defaults: Omit<AppConfig, "dataDir" | "pgliteDataDir"> & { databasePoolMax: number } = {
  appName: "Appaloft",
  appVersion: readSourceCheckoutAppVersion(),
  runtimeMode: "self-hosted",
  authProvider: "better-auth",
  betterAuthBaseUrl: "http://localhost:3001",
  betterAuthSecret: "development-only-appaloft-better-auth-secret-change-me",
  httpHost: "0.0.0.0",
  httpPort: 3001,
  webOrigin: "http://localhost:4173",
  databaseDriver: "pglite",
  autoMigrate: false,
  databaseUrl: "postgres://postgres:postgres@localhost:5432/appaloft",
  databasePoolMax: 10,
  remoteRuntimeRoot: "/var/lib/appaloft/runtime",
  remotePgliteSyncBackupRetentionDays: 7,
  remotePgliteSyncBackupMaxCount: 20,
  logLevel: "info",
  environment: "development",
  otelEnabled: false,
  otelServiceName: "appaloft-backend",
  secretMask: "****",
  defaultAccessDomain: {
    mode: "provider",
    providerKey: "sslip",
    zone: "sslip.io",
    scheme: "http",
  },
  certificateProvider: {
    mode: "disabled",
    providerKey: "acme",
    acme: {
      directoryUrl: "https://acme-staging-v02.api.letsencrypt.org/directory",
      termsOfServiceAgreed: false,
      skipChallengeVerification: false,
      challengeTokenTtlSeconds: 600,
    },
  },
  certificateRetryScheduler: {
    enabled: true,
    intervalSeconds: 300,
    defaultRetryDelaySeconds: 300,
    batchSize: 25,
  },
  previewCleanupRetryScheduler: {
    enabled: false,
    intervalSeconds: 300,
    batchSize: 25,
  },
  previewExpiryCleanupScheduler: {
    enabled: false,
    intervalSeconds: 300,
    batchSize: 25,
  },
  dockerSwarmExecution: {
    enabled: true,
    commandTimeoutMs: 60_000,
    edgeNetworkName: defaultDockerSwarmEdgeNetworkName,
  },
  terminalSessions: {
    activeTtlSeconds: 3600,
    outputRetentionBytes: 65536,
  },
  scheduledTaskRunner: {
    enabled: false,
    intervalSeconds: 60,
    batchSize: 25,
  },
  scheduledRuntimePruneRunner: {
    enabled: false,
    intervalSeconds: 3600,
    batchSize: 25,
  },
  scheduledDependencyBackupRunner: {
    enabled: false,
    intervalSeconds: 3600,
    batchSize: 25,
  },
  scheduledHistoryRetentionRunner: {
    enabled: false,
    intervalSeconds: 3600,
    batchSize: 25,
  },
  runtimeMonitoringCollectorRunner: {
    enabled: false,
    intervalSeconds: 60,
    batchSize: 25,
    rawRetentionHours: 24,
  },
  workerRuntime: {
    mode: "embedded",
    queueBackend: "database",
    workerCount: 1,
    workerGroup: "appaloft-worker",
  },
  enabledSystemPlugins: [],
};

function readSourceCheckoutAppVersion(): string {
  try {
    const packageJson = JSON.parse(
      readFileSync(new URL("../../../package.json", import.meta.url), "utf8"),
    ) as { version?: unknown };
    return typeof packageJson.version === "string" && packageJson.version.length > 0
      ? packageJson.version
      : "0.0.0-dev";
  } catch {
    return "0.0.0-dev";
  }
}

function defaultUserDataRoot(env: ConfigEnv): string | undefined {
  if (process.platform === "darwin") {
    return env.HOME ? join(env.HOME, "Library", "Application Support", "Appaloft") : undefined;
  }

  if (process.platform === "win32") {
    if (env.APPDATA) {
      return join(env.APPDATA, "Appaloft");
    }

    return env.USERPROFILE ? join(env.USERPROFILE, "AppData", "Roaming", "Appaloft") : undefined;
  }

  if (env.XDG_DATA_HOME) {
    return join(env.XDG_DATA_HOME, "appaloft");
  }

  return env.HOME ? join(env.HOME, ".local", "share", "appaloft") : undefined;
}

function defaultDataDir(env: ConfigEnv): string {
  const userDataRoot = defaultUserDataRoot(env);
  return userDataRoot ? join(userDataRoot, "data") : resolve(".appaloft/data");
}

function readConfigFile(configFilePath?: string): Partial<AppConfig> {
  if (!configFilePath) {
    return {};
  }

  const path = resolve(configFilePath);

  if (!existsSync(path)) {
    return {};
  }

  return JSON.parse(readFileSync(path, "utf8")) as Partial<AppConfig>;
}

function parseBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();

  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return undefined;
}

function parsePositiveInteger(value: string | number | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  const numberValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numberValue)) {
    return undefined;
  }

  const normalized = Math.trunc(numberValue);
  return normalized > 0 ? normalized : undefined;
}

function parseNonNegativeInteger(value: string | number | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  const numberValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numberValue)) {
    return undefined;
  }

  const normalized = Math.trunc(numberValue);
  return normalized >= 0 ? normalized : undefined;
}

function parseWorkerRuntimeMode(value: string | undefined): WorkerRuntimeMode | undefined {
  const normalized = value?.trim().toLowerCase();
  return normalized === "embedded" || normalized === "standalone" || normalized === "disabled"
    ? normalized
    : undefined;
}

function parseWorkerQueueBackend(value: string | undefined): WorkerQueueBackend | undefined {
  const normalized = value?.trim().toLowerCase();
  return normalized === "database" || normalized === "external" ? normalized : undefined;
}

function parseExternalWorkerBackendKind(
  value: string | undefined,
): ExternalWorkerBackendKind | undefined {
  const normalized = value?.trim().toLowerCase();
  return normalized === "kafka" || normalized === "temporal" || normalized === "custom"
    ? normalized
    : undefined;
}

function parseStringList(value: readonly string[] | string | undefined): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  const items: readonly string[] = typeof value === "string" ? value.split(",") : value;
  const normalized = items
    .map((item: string) => item.trim())
    .filter((item: string) => item.length > 0);

  return normalized.length > 0 ? Array.from(new Set(normalized)) : undefined;
}

function defaultBetterAuthCallbackUrl(baseUrl: string, path: string): string | undefined {
  try {
    const url = new URL(baseUrl);
    url.pathname = `${url.pathname.replace(/\/+$/g, "")}${path}`;
    url.search = "";
    url.hash = "";

    return url.toString();
  } catch {
    return undefined;
  }
}

function normalizeOtlpTraceEndpointFromBase(endpoint: string): string {
  const trimmed = endpoint.trim().replace(/\/+$/, "");

  if (trimmed.endsWith("/v1/traces")) {
    return trimmed;
  }

  return `${trimmed}/v1/traces`;
}

function normalizeHttpUrl(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }

  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function actionDeployTokenScopeFromEnv(env: ConfigEnv): ActionDeployTokenScopeConfig | undefined {
  const workflows = env.APPALOFT_ACTION_DEPLOY_TOKEN_WORKFLOWS?.split(",")
    .map((workflow) => workflow.trim())
    .filter((workflow): workflow is ActionDeployTokenWorkflow =>
      ["preview-cleanup", "server-config-deploy", "source-link-deploy"].includes(workflow),
    );
  const scope: ActionDeployTokenScopeConfig = {
    ...(env.APPALOFT_ACTION_DEPLOY_TOKEN_ENVIRONMENT_ID
      ? { environmentId: env.APPALOFT_ACTION_DEPLOY_TOKEN_ENVIRONMENT_ID }
      : {}),
    ...(env.APPALOFT_ACTION_DEPLOY_TOKEN_PROJECT_ID
      ? { projectId: env.APPALOFT_ACTION_DEPLOY_TOKEN_PROJECT_ID }
      : {}),
    ...(env.APPALOFT_ACTION_DEPLOY_TOKEN_REPOSITORY_FULL_NAME
      ? { repositoryFullName: env.APPALOFT_ACTION_DEPLOY_TOKEN_REPOSITORY_FULL_NAME }
      : {}),
    ...(env.APPALOFT_ACTION_DEPLOY_TOKEN_RESOURCE_ID
      ? { resourceId: env.APPALOFT_ACTION_DEPLOY_TOKEN_RESOURCE_ID }
      : {}),
    ...(env.APPALOFT_ACTION_DEPLOY_TOKEN_SERVER_ID
      ? { serverId: env.APPALOFT_ACTION_DEPLOY_TOKEN_SERVER_ID }
      : {}),
    ...(workflows && workflows.length > 0 ? { workflows } : {}),
  };

  return Object.keys(scope).length > 0 ? scope : undefined;
}

export function resolveConfig(source: ConfigSource<AppConfig> = {}): AppConfig {
  const env = source.env ?? process.env;
  const fileConfig = readConfigFile(source.configFilePath);
  const builtInDataDir = defaultDataDir(env);
  const otelDisabledFromEnv = parseBoolean(env.OTEL_SDK_DISABLED) === true;
  const otelEnabledFromEnv = otelDisabledFromEnv ? false : parseBoolean(env.APPALOFT_OTEL_ENABLED);
  const otelExporterEndpointFromEnv =
    env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ??
    (env.OTEL_EXPORTER_OTLP_ENDPOINT
      ? normalizeOtlpTraceEndpointFromBase(env.OTEL_EXPORTER_OTLP_ENDPOINT)
      : undefined) ??
    env.APPALOFT_OTEL_EXPORTER_OTLP_ENDPOINT;
  const otelExporterHeadersFromEnv =
    env.OTEL_EXPORTER_OTLP_TRACES_HEADERS ?? env.OTEL_EXPORTER_OTLP_HEADERS;
  const explicitDatabaseDriver =
    source.flags?.databaseDriver ??
    (env.APPALOFT_DATABASE_DRIVER as AppConfig["databaseDriver"] | undefined) ??
    fileConfig.databaseDriver;
  const configuredDatabaseUrl =
    source.flags?.databaseUrl ?? env.APPALOFT_DATABASE_URL ?? fileConfig.databaseUrl;
  const databaseDriver =
    explicitDatabaseDriver ?? (configuredDatabaseUrl ? "postgres" : defaults.databaseDriver);
  const dataDir = resolve(
    source.flags?.dataDir ?? env.APPALOFT_DATA_DIR ?? fileConfig.dataDir ?? builtInDataDir,
  );
  const pgliteDataDir = resolve(
    source.flags?.pgliteDataDir ??
      env.APPALOFT_PGLITE_DATA_DIR ??
      fileConfig.pgliteDataDir ??
      join(dataDir, "pglite"),
  );
  const databaseUrl =
    configuredDatabaseUrl ?? (databaseDriver === "postgres" ? defaults.databaseUrl : undefined);
  const databasePoolMax =
    parsePositiveInteger(source.flags?.databasePoolMax) ??
    parsePositiveInteger(env.APPALOFT_DATABASE_POOL_MAX) ??
    parsePositiveInteger(fileConfig.databasePoolMax) ??
    defaults.databasePoolMax;
  const enabledSystemPlugins = (
    source.flags?.enabledSystemPlugins ??
    (env.APPALOFT_SYSTEM_PLUGINS
      ? env.APPALOFT_SYSTEM_PLUGINS.split(",")
      : fileConfig.enabledSystemPlugins) ??
    defaults.enabledSystemPlugins
  )
    .map((plugin) => plugin.trim())
    .filter((plugin) => plugin.length > 0);
  const defaultAccessDomain =
    source.flags?.defaultAccessDomain ??
    fileConfig.defaultAccessDomain ??
    defaults.defaultAccessDomain;
  const defaultAccessDomainMode =
    (env.APPALOFT_DEFAULT_ACCESS_DOMAIN_MODE as DefaultAccessDomainConfig["mode"] | undefined) ??
    defaultAccessDomain.mode;
  const defaultAccessDomainScheme =
    (env.APPALOFT_DEFAULT_ACCESS_DOMAIN_SCHEME as
      | DefaultAccessDomainConfig["scheme"]
      | undefined) ?? defaultAccessDomain.scheme;
  const actionDeployTokenScope =
    source.flags?.actionDeployTokenScope ??
    actionDeployTokenScopeFromEnv(env) ??
    fileConfig.actionDeployTokenScope;
  const certificateProvider =
    source.flags?.certificateProvider ??
    fileConfig.certificateProvider ??
    defaults.certificateProvider;
  const certificateProviderMode = (source.flags?.certificateProvider?.mode ??
    env.APPALOFT_CERTIFICATE_PROVIDER ??
    env.APPALOFT_CERTIFICATE_PROVIDER_MODE ??
    certificateProvider.mode) as CertificateProviderConfig["mode"];
  const acmeConfig = certificateProvider.acme ?? defaults.certificateProvider.acme;
  const acmeTermsOfServiceAgreed =
    parseBoolean(env.APPALOFT_ACME_TERMS_OF_SERVICE_AGREED) ?? acmeConfig.termsOfServiceAgreed;
  const acmeSkipChallengeVerification =
    parseBoolean(env.APPALOFT_ACME_SKIP_CHALLENGE_VERIFICATION) ??
    acmeConfig.skipChallengeVerification;
  const acmeChallengeTokenTtlSeconds = Number(
    env.APPALOFT_ACME_CHALLENGE_TOKEN_TTL_SECONDS ??
      acmeConfig.challengeTokenTtlSeconds ??
      defaults.certificateProvider.acme.challengeTokenTtlSeconds,
  );
  const certificateRetryScheduler =
    source.flags?.certificateRetryScheduler ??
    fileConfig.certificateRetryScheduler ??
    defaults.certificateRetryScheduler;
  const certificateRetrySchedulerEnabled =
    parseBoolean(env.APPALOFT_CERTIFICATE_RETRY_SCHEDULER_ENABLED) ??
    certificateRetryScheduler.enabled;
  const certificateRetrySchedulerIntervalSeconds =
    parsePositiveInteger(env.APPALOFT_CERTIFICATE_RETRY_SCHEDULER_INTERVAL_SECONDS) ??
    parsePositiveInteger(certificateRetryScheduler.intervalSeconds) ??
    defaults.certificateRetryScheduler.intervalSeconds;
  const certificateRetryDefaultDelaySeconds =
    parsePositiveInteger(env.APPALOFT_CERTIFICATE_RETRY_DEFAULT_DELAY_SECONDS) ??
    parsePositiveInteger(certificateRetryScheduler.defaultRetryDelaySeconds) ??
    defaults.certificateRetryScheduler.defaultRetryDelaySeconds;
  const certificateRetrySchedulerBatchSize =
    parsePositiveInteger(env.APPALOFT_CERTIFICATE_RETRY_SCHEDULER_BATCH_SIZE) ??
    parsePositiveInteger(certificateRetryScheduler.batchSize) ??
    defaults.certificateRetryScheduler.batchSize;
  const scheduledTaskRunner =
    source.flags?.scheduledTaskRunner ??
    fileConfig.scheduledTaskRunner ??
    defaults.scheduledTaskRunner;
  const scheduledRuntimePruneRunner =
    source.flags?.scheduledRuntimePruneRunner ??
    fileConfig.scheduledRuntimePruneRunner ??
    defaults.scheduledRuntimePruneRunner;
  const scheduledDependencyBackupRunner =
    source.flags?.scheduledDependencyBackupRunner ??
    fileConfig.scheduledDependencyBackupRunner ??
    defaults.scheduledDependencyBackupRunner;
  const scheduledHistoryRetentionRunner =
    source.flags?.scheduledHistoryRetentionRunner ??
    fileConfig.scheduledHistoryRetentionRunner ??
    defaults.scheduledHistoryRetentionRunner;
  const runtimeMonitoringCollectorRunner =
    source.flags?.runtimeMonitoringCollectorRunner ??
    fileConfig.runtimeMonitoringCollectorRunner ??
    defaults.runtimeMonitoringCollectorRunner;
  const workerRuntime =
    source.flags?.workerRuntime ?? fileConfig.workerRuntime ?? defaults.workerRuntime;
  const dockerSwarmExecution =
    source.flags?.dockerSwarmExecution ??
    fileConfig.dockerSwarmExecution ??
    defaults.dockerSwarmExecution;
  const terminalSessions =
    source.flags?.terminalSessions ?? fileConfig.terminalSessions ?? defaults.terminalSessions;
  const previewCleanupRetryScheduler =
    source.flags?.previewCleanupRetryScheduler ??
    fileConfig.previewCleanupRetryScheduler ??
    defaults.previewCleanupRetryScheduler;
  const previewExpiryCleanupScheduler =
    source.flags?.previewExpiryCleanupScheduler ??
    fileConfig.previewExpiryCleanupScheduler ??
    defaults.previewExpiryCleanupScheduler;
  const previewCleanupRetrySchedulerEnabled =
    parseBoolean(env.APPALOFT_PREVIEW_CLEANUP_RETRY_SCHEDULER_ENABLED) ??
    previewCleanupRetryScheduler.enabled;
  const previewCleanupRetrySchedulerIntervalSeconds =
    parsePositiveInteger(env.APPALOFT_PREVIEW_CLEANUP_RETRY_SCHEDULER_INTERVAL_SECONDS) ??
    parsePositiveInteger(previewCleanupRetryScheduler.intervalSeconds) ??
    defaults.previewCleanupRetryScheduler.intervalSeconds;
  const previewCleanupRetrySchedulerBatchSize =
    parsePositiveInteger(env.APPALOFT_PREVIEW_CLEANUP_RETRY_SCHEDULER_BATCH_SIZE) ??
    parsePositiveInteger(previewCleanupRetryScheduler.batchSize) ??
    defaults.previewCleanupRetryScheduler.batchSize;
  const previewExpiryCleanupSchedulerEnabled =
    parseBoolean(env.APPALOFT_PREVIEW_EXPIRY_CLEANUP_SCHEDULER_ENABLED) ??
    previewExpiryCleanupScheduler.enabled;
  const previewExpiryCleanupSchedulerIntervalSeconds =
    parsePositiveInteger(env.APPALOFT_PREVIEW_EXPIRY_CLEANUP_SCHEDULER_INTERVAL_SECONDS) ??
    parsePositiveInteger(previewExpiryCleanupScheduler.intervalSeconds) ??
    defaults.previewExpiryCleanupScheduler.intervalSeconds;
  const previewExpiryCleanupSchedulerBatchSize =
    parsePositiveInteger(env.APPALOFT_PREVIEW_EXPIRY_CLEANUP_SCHEDULER_BATCH_SIZE) ??
    parsePositiveInteger(previewExpiryCleanupScheduler.batchSize) ??
    defaults.previewExpiryCleanupScheduler.batchSize;
  const scheduledTaskRunnerEnabled =
    parseBoolean(env.APPALOFT_SCHEDULED_TASK_RUNNER_ENABLED) ?? scheduledTaskRunner.enabled;
  const scheduledTaskRunnerIntervalSeconds =
    parsePositiveInteger(env.APPALOFT_SCHEDULED_TASK_RUNNER_INTERVAL_SECONDS) ??
    parsePositiveInteger(scheduledTaskRunner.intervalSeconds) ??
    defaults.scheduledTaskRunner.intervalSeconds;
  const scheduledTaskRunnerBatchSize =
    parsePositiveInteger(env.APPALOFT_SCHEDULED_TASK_RUNNER_BATCH_SIZE) ??
    parsePositiveInteger(scheduledTaskRunner.batchSize) ??
    defaults.scheduledTaskRunner.batchSize;
  const scheduledRuntimePruneRunnerEnabled =
    parseBoolean(env.APPALOFT_SCHEDULED_RUNTIME_PRUNE_RUNNER_ENABLED) ??
    scheduledRuntimePruneRunner.enabled;
  const scheduledRuntimePruneRunnerIntervalSeconds =
    parsePositiveInteger(env.APPALOFT_SCHEDULED_RUNTIME_PRUNE_RUNNER_INTERVAL_SECONDS) ??
    parsePositiveInteger(scheduledRuntimePruneRunner.intervalSeconds) ??
    defaults.scheduledRuntimePruneRunner.intervalSeconds;
  const scheduledRuntimePruneRunnerBatchSize =
    parsePositiveInteger(env.APPALOFT_SCHEDULED_RUNTIME_PRUNE_RUNNER_BATCH_SIZE) ??
    parsePositiveInteger(scheduledRuntimePruneRunner.batchSize) ??
    defaults.scheduledRuntimePruneRunner.batchSize;
  const scheduledDependencyBackupRunnerEnabled =
    parseBoolean(env.APPALOFT_SCHEDULED_DEPENDENCY_BACKUP_RUNNER_ENABLED) ??
    scheduledDependencyBackupRunner.enabled;
  const scheduledDependencyBackupRunnerIntervalSeconds =
    parsePositiveInteger(env.APPALOFT_SCHEDULED_DEPENDENCY_BACKUP_RUNNER_INTERVAL_SECONDS) ??
    parsePositiveInteger(scheduledDependencyBackupRunner.intervalSeconds) ??
    defaults.scheduledDependencyBackupRunner.intervalSeconds;
  const scheduledDependencyBackupRunnerBatchSize =
    parsePositiveInteger(env.APPALOFT_SCHEDULED_DEPENDENCY_BACKUP_RUNNER_BATCH_SIZE) ??
    parsePositiveInteger(scheduledDependencyBackupRunner.batchSize) ??
    defaults.scheduledDependencyBackupRunner.batchSize;
  const scheduledHistoryRetentionRunnerEnabled =
    parseBoolean(env.APPALOFT_SCHEDULED_HISTORY_RETENTION_RUNNER_ENABLED) ??
    scheduledHistoryRetentionRunner.enabled;
  const scheduledHistoryRetentionRunnerIntervalSeconds =
    parsePositiveInteger(env.APPALOFT_SCHEDULED_HISTORY_RETENTION_RUNNER_INTERVAL_SECONDS) ??
    parsePositiveInteger(scheduledHistoryRetentionRunner.intervalSeconds) ??
    defaults.scheduledHistoryRetentionRunner.intervalSeconds;
  const scheduledHistoryRetentionRunnerBatchSize =
    parsePositiveInteger(env.APPALOFT_SCHEDULED_HISTORY_RETENTION_RUNNER_BATCH_SIZE) ??
    parsePositiveInteger(scheduledHistoryRetentionRunner.batchSize) ??
    defaults.scheduledHistoryRetentionRunner.batchSize;
  const runtimeMonitoringCollectorRunnerEnabled =
    parseBoolean(env.APPALOFT_RUNTIME_MONITORING_COLLECTOR_RUNNER_ENABLED) ??
    runtimeMonitoringCollectorRunner.enabled;
  const runtimeMonitoringCollectorRunnerIntervalSeconds =
    parsePositiveInteger(env.APPALOFT_RUNTIME_MONITORING_COLLECTOR_RUNNER_INTERVAL_SECONDS) ??
    parsePositiveInteger(runtimeMonitoringCollectorRunner.intervalSeconds) ??
    defaults.runtimeMonitoringCollectorRunner.intervalSeconds;
  const runtimeMonitoringCollectorRunnerBatchSize =
    parsePositiveInteger(env.APPALOFT_RUNTIME_MONITORING_COLLECTOR_RUNNER_BATCH_SIZE) ??
    parsePositiveInteger(runtimeMonitoringCollectorRunner.batchSize) ??
    defaults.runtimeMonitoringCollectorRunner.batchSize;
  const runtimeMonitoringCollectorRunnerRawRetentionHours =
    parsePositiveInteger(env.APPALOFT_RUNTIME_MONITORING_RAW_RETENTION_HOURS) ??
    parsePositiveInteger(runtimeMonitoringCollectorRunner.rawRetentionHours) ??
    defaults.runtimeMonitoringCollectorRunner.rawRetentionHours;
  const workerRuntimeMode =
    parseWorkerRuntimeMode(env.APPALOFT_WORKER_RUNTIME_MODE) ??
    workerRuntime.mode ??
    defaults.workerRuntime.mode;
  const workerRuntimeQueueBackend =
    parseWorkerQueueBackend(env.APPALOFT_WORKER_QUEUE_BACKEND) ??
    workerRuntime.queueBackend ??
    defaults.workerRuntime.queueBackend;
  const workerRuntimeWorkerCount =
    parseNonNegativeInteger(env.APPALOFT_WORKER_COUNT) ??
    parseNonNegativeInteger(workerRuntime.workerCount) ??
    defaults.workerRuntime.workerCount;
  const workerRuntimeWorkerGroup =
    env.APPALOFT_WORKER_GROUP ?? workerRuntime.workerGroup ?? defaults.workerRuntime.workerGroup;
  const workerRuntimeExternalBackendKind =
    parseExternalWorkerBackendKind(env.APPALOFT_WORKER_EXTERNAL_BACKEND_KIND) ??
    workerRuntime.externalBackendKind;
  const dockerSwarmExecutionEnabled =
    parseBoolean(env.APPALOFT_DOCKER_SWARM_EXECUTION_ENABLED) ?? dockerSwarmExecution.enabled;
  const dockerSwarmExecutionCommandTimeoutMs =
    parsePositiveInteger(env.APPALOFT_DOCKER_SWARM_COMMAND_TIMEOUT_MS) ??
    parsePositiveInteger(dockerSwarmExecution.commandTimeoutMs) ??
    defaults.dockerSwarmExecution.commandTimeoutMs;
  const dockerSwarmExecutionEdgeNetworkName =
    env.APPALOFT_DOCKER_SWARM_EDGE_NETWORK ??
    dockerSwarmExecution.edgeNetworkName ??
    defaultDockerSwarmEdgeNetworkName;
  const terminalSessionActiveTtlSeconds =
    parsePositiveInteger(env.APPALOFT_TERMINAL_SESSION_ACTIVE_TTL_SECONDS) ??
    parsePositiveInteger(terminalSessions.activeTtlSeconds) ??
    defaults.terminalSessions.activeTtlSeconds;
  const terminalSessionOutputRetentionBytes =
    parsePositiveInteger(env.APPALOFT_TERMINAL_SESSION_OUTPUT_RETENTION_BYTES) ??
    parsePositiveInteger(terminalSessions.outputRetentionBytes) ??
    defaults.terminalSessions.outputRetentionBytes;
  const remotePgliteSyncBackupRetentionDays =
    parsePositiveInteger(env.APPALOFT_REMOTE_PGLITE_SYNC_BACKUP_RETENTION_DAYS) ??
    parsePositiveInteger(source.flags?.remotePgliteSyncBackupRetentionDays) ??
    parsePositiveInteger(fileConfig.remotePgliteSyncBackupRetentionDays) ??
    defaults.remotePgliteSyncBackupRetentionDays;
  const remotePgliteSyncBackupMaxCount =
    parsePositiveInteger(env.APPALOFT_REMOTE_PGLITE_SYNC_BACKUP_MAX_COUNT) ??
    parsePositiveInteger(source.flags?.remotePgliteSyncBackupMaxCount) ??
    parsePositiveInteger(fileConfig.remotePgliteSyncBackupMaxCount) ??
    defaults.remotePgliteSyncBackupMaxCount;
  const resourceAccessFailureRendererUrl = normalizeHttpUrl(
    source.flags?.resourceAccessFailureRendererUrl ??
      env.APPALOFT_RESOURCE_ACCESS_FAILURE_RENDERER_URL ??
      fileConfig.resourceAccessFailureRendererUrl,
  );
  const bootstrapDeployTokenEnabled = parseBoolean(env.APPALOFT_BOOTSTRAP_DEPLOY_TOKEN) ?? true;
  const bootstrapDeployTokenOutputFile = bootstrapDeployTokenEnabled
    ? (source.flags?.bootstrapDeployTokenOutputFile ??
      env.APPALOFT_BOOTSTRAP_DEPLOY_TOKEN_OUTPUT_FILE ??
      fileConfig.bootstrapDeployTokenOutputFile)
    : undefined;
  const betterAuthBaseUrl =
    source.flags?.betterAuthBaseUrl ??
    env.APPALOFT_BETTER_AUTH_URL ??
    fileConfig.betterAuthBaseUrl ??
    defaults.betterAuthBaseUrl;
  const webOrigin =
    source.flags?.webOrigin ??
    env.APPALOFT_WEB_ORIGIN ??
    fileConfig.webOrigin ??
    defaults.webOrigin;
  const betterAuthTrustedOrigins =
    parseStringList(source.flags?.betterAuthTrustedOrigins) ??
    parseStringList(env.APPALOFT_BETTER_AUTH_TRUSTED_ORIGINS) ??
    parseStringList(fileConfig.betterAuthTrustedOrigins);
  const githubClientId =
    source.flags?.githubClientId ?? env.APPALOFT_GITHUB_CLIENT_ID ?? fileConfig.githubClientId;
  const githubClientSecret =
    source.flags?.githubClientSecret ??
    env.APPALOFT_GITHUB_CLIENT_SECRET ??
    fileConfig.githubClientSecret;
  const githubRedirectUri =
    source.flags?.githubRedirectUri ??
    env.APPALOFT_GITHUB_REDIRECT_URI ??
    fileConfig.githubRedirectUri ??
    (githubClientId && githubClientSecret
      ? defaultBetterAuthCallbackUrl(betterAuthBaseUrl, "/api/auth/callback/github")
      : undefined);
  const githubConnectionMode =
    source.flags?.githubConnectionMode ??
    (env.APPALOFT_GITHUB_CONNECTION_MODE as AppConfig["githubConnectionMode"] | undefined) ??
    fileConfig.githubConnectionMode;
  const githubAppOwner =
    source.flags?.githubAppOwner ?? env.APPALOFT_GITHUB_APP_OWNER ?? fileConfig.githubAppOwner;
  const githubAppSlug =
    source.flags?.githubAppSlug ?? env.APPALOFT_GITHUB_APP_SLUG ?? fileConfig.githubAppSlug;
  const githubAppId =
    source.flags?.githubAppId ?? env.APPALOFT_GITHUB_APP_ID ?? fileConfig.githubAppId;
  const githubAppClientId =
    source.flags?.githubAppClientId ??
    env.APPALOFT_GITHUB_APP_CLIENT_ID ??
    fileConfig.githubAppClientId;
  const githubAppClientSecret =
    source.flags?.githubAppClientSecret ??
    env.APPALOFT_GITHUB_APP_CLIENT_SECRET ??
    fileConfig.githubAppClientSecret;
  const githubAppInstallUrl =
    source.flags?.githubAppInstallUrl ??
    env.APPALOFT_GITHUB_APP_INSTALL_URL ??
    fileConfig.githubAppInstallUrl ??
    (githubAppSlug ? `https://github.com/apps/${githubAppSlug}/installations/new` : undefined);
  const githubAppCallbackUrl =
    source.flags?.githubAppCallbackUrl ??
    env.APPALOFT_GITHUB_APP_CALLBACK_URL ??
    fileConfig.githubAppCallbackUrl;
  const githubAppWebhookUrl =
    source.flags?.githubAppWebhookUrl ??
    env.APPALOFT_GITHUB_APP_WEBHOOK_URL ??
    fileConfig.githubAppWebhookUrl;
  const githubAppWebhookSecret =
    source.flags?.githubAppWebhookSecret ??
    env.APPALOFT_GITHUB_APP_WEBHOOK_SECRET ??
    fileConfig.githubAppWebhookSecret;
  const githubAppPrivateKey =
    source.flags?.githubAppPrivateKey ??
    env.APPALOFT_GITHUB_APP_PRIVATE_KEY ??
    fileConfig.githubAppPrivateKey;
  const githubAppPrivateKeyBase64 =
    source.flags?.githubAppPrivateKeyBase64 ??
    env.APPALOFT_GITHUB_APP_PRIVATE_KEY_BASE64 ??
    fileConfig.githubAppPrivateKeyBase64;
  const googleClientId =
    source.flags?.googleClientId ?? env.APPALOFT_GOOGLE_CLIENT_ID ?? fileConfig.googleClientId;
  const googleClientSecret =
    source.flags?.googleClientSecret ??
    env.APPALOFT_GOOGLE_CLIENT_SECRET ??
    fileConfig.googleClientSecret;
  const googleRedirectUri =
    source.flags?.googleRedirectUri ??
    env.APPALOFT_GOOGLE_REDIRECT_URI ??
    fileConfig.googleRedirectUri ??
    (googleClientId && googleClientSecret
      ? defaultBetterAuthCallbackUrl(betterAuthBaseUrl, "/api/auth/callback/google")
      : undefined);
  const oidcClientId =
    source.flags?.oidcClientId ?? env.APPALOFT_OIDC_CLIENT_ID ?? fileConfig.oidcClientId;
  const oidcClientSecret =
    source.flags?.oidcClientSecret ??
    env.APPALOFT_OIDC_CLIENT_SECRET ??
    fileConfig.oidcClientSecret;
  const oidcRedirectUri =
    source.flags?.oidcRedirectUri ??
    env.APPALOFT_OIDC_REDIRECT_URI ??
    fileConfig.oidcRedirectUri ??
    (oidcClientId && oidcClientSecret
      ? defaultBetterAuthCallbackUrl(betterAuthBaseUrl, "/api/auth/oauth2/callback/oidc")
      : undefined);

  return {
    appName:
      source.flags?.appName ?? env.APPALOFT_APP_NAME ?? fileConfig.appName ?? defaults.appName,
    appVersion:
      source.flags?.appVersion ??
      env.APPALOFT_APP_VERSION ??
      fileConfig.appVersion ??
      defaults.appVersion,
    runtimeMode:
      source.flags?.runtimeMode ??
      (env.APPALOFT_RUNTIME_MODE as AppConfig["runtimeMode"] | undefined) ??
      fileConfig.runtimeMode ??
      defaults.runtimeMode,
    authProvider:
      source.flags?.authProvider ??
      (env.APPALOFT_AUTH_PROVIDER as AppConfig["authProvider"] | undefined) ??
      fileConfig.authProvider ??
      defaults.authProvider,
    betterAuthBaseUrl,
    ...(source.flags?.betterAuthCookieDomain ||
    env.APPALOFT_BETTER_AUTH_COOKIE_DOMAIN ||
    fileConfig.betterAuthCookieDomain
      ? {
          betterAuthCookieDomain:
            source.flags?.betterAuthCookieDomain ??
            env.APPALOFT_BETTER_AUTH_COOKIE_DOMAIN ??
            fileConfig.betterAuthCookieDomain,
        }
      : {}),
    ...(source.flags?.betterAuthCookiePrefix ||
    env.APPALOFT_BETTER_AUTH_COOKIE_PREFIX ||
    fileConfig.betterAuthCookiePrefix
      ? {
          betterAuthCookiePrefix:
            source.flags?.betterAuthCookiePrefix ??
            env.APPALOFT_BETTER_AUTH_COOKIE_PREFIX ??
            fileConfig.betterAuthCookiePrefix,
        }
      : {}),
    betterAuthSecret:
      source.flags?.betterAuthSecret ??
      env.APPALOFT_BETTER_AUTH_SECRET ??
      fileConfig.betterAuthSecret ??
      defaults.betterAuthSecret,
    ...(source.flags?.betterAuthTrustedProxyHeaders !== undefined ||
    env.APPALOFT_BETTER_AUTH_TRUSTED_PROXY_HEADERS ||
    fileConfig.betterAuthTrustedProxyHeaders !== undefined
      ? {
          betterAuthTrustedProxyHeaders:
            source.flags?.betterAuthTrustedProxyHeaders ??
            parseBoolean(env.APPALOFT_BETTER_AUTH_TRUSTED_PROXY_HEADERS) ??
            fileConfig.betterAuthTrustedProxyHeaders,
        }
      : {}),
    ...(betterAuthTrustedOrigins ? { betterAuthTrustedOrigins } : {}),
    ...(source.flags?.betterAuthMinPasswordLength ||
    env.APPALOFT_BETTER_AUTH_LOCAL_MIN_LENGTH ||
    fileConfig.betterAuthMinPasswordLength
      ? {
          betterAuthMinPasswordLength:
            source.flags?.betterAuthMinPasswordLength ??
            parsePositiveInteger(env.APPALOFT_BETTER_AUTH_LOCAL_MIN_LENGTH) ??
            fileConfig.betterAuthMinPasswordLength,
        }
      : {}),
    ...(source.flags?.actionDeployToken ||
    env.APPALOFT_ACTION_DEPLOY_TOKEN ||
    fileConfig.actionDeployToken
      ? {
          actionDeployToken:
            source.flags?.actionDeployToken ??
            env.APPALOFT_ACTION_DEPLOY_TOKEN ??
            fileConfig.actionDeployToken,
        }
      : {}),
    ...(actionDeployTokenScope ? { actionDeployTokenScope } : {}),
    ...(bootstrapDeployTokenOutputFile ? { bootstrapDeployTokenOutputFile } : {}),
    ...(source.flags?.bootstrapFirstAdminOutputFile ||
    env.APPALOFT_BOOTSTRAP_FIRST_ADMIN_OUTPUT_FILE ||
    fileConfig.bootstrapFirstAdminOutputFile
      ? {
          bootstrapFirstAdminOutputFile:
            source.flags?.bootstrapFirstAdminOutputFile ??
            env.APPALOFT_BOOTSTRAP_FIRST_ADMIN_OUTPUT_FILE ??
            fileConfig.bootstrapFirstAdminOutputFile,
        }
      : {}),
    ...(source.flags?.firstAdminEmail ||
    env.APPALOFT_FIRST_ADMIN_EMAIL ||
    fileConfig.firstAdminEmail
      ? {
          firstAdminEmail:
            source.flags?.firstAdminEmail ??
            env.APPALOFT_FIRST_ADMIN_EMAIL ??
            fileConfig.firstAdminEmail,
        }
      : {}),
    ...(source.flags?.firstAdminDisplayName ||
    env.APPALOFT_FIRST_ADMIN_DISPLAY_NAME ||
    fileConfig.firstAdminDisplayName
      ? {
          firstAdminDisplayName:
            source.flags?.firstAdminDisplayName ??
            env.APPALOFT_FIRST_ADMIN_DISPLAY_NAME ??
            fileConfig.firstAdminDisplayName,
        }
      : {}),
    ...(source.flags?.firstAdminPassword ||
    env.APPALOFT_FIRST_ADMIN_PASSWORD ||
    fileConfig.firstAdminPassword
      ? {
          firstAdminPassword:
            source.flags?.firstAdminPassword ??
            env.APPALOFT_FIRST_ADMIN_PASSWORD ??
            fileConfig.firstAdminPassword,
        }
      : {}),
    ...(source.flags?.firstAdminOrganizationName ||
    env.APPALOFT_FIRST_ADMIN_ORGANIZATION_NAME ||
    fileConfig.firstAdminOrganizationName
      ? {
          firstAdminOrganizationName:
            source.flags?.firstAdminOrganizationName ??
            env.APPALOFT_FIRST_ADMIN_ORGANIZATION_NAME ??
            fileConfig.firstAdminOrganizationName,
        }
      : {}),
    ...(source.flags?.firstAdminOrganizationSlug ||
    env.APPALOFT_FIRST_ADMIN_ORGANIZATION_SLUG ||
    fileConfig.firstAdminOrganizationSlug
      ? {
          firstAdminOrganizationSlug:
            source.flags?.firstAdminOrganizationSlug ??
            env.APPALOFT_FIRST_ADMIN_ORGANIZATION_SLUG ??
            fileConfig.firstAdminOrganizationSlug,
        }
      : {}),
    ...(githubClientId ? { githubClientId } : {}),
    ...(githubClientSecret ? { githubClientSecret } : {}),
    ...(githubRedirectUri ? { githubRedirectUri } : {}),
    ...(githubConnectionMode ? { githubConnectionMode } : {}),
    ...(githubAppOwner ? { githubAppOwner } : {}),
    ...(githubAppSlug ? { githubAppSlug } : {}),
    ...(githubAppId ? { githubAppId } : {}),
    ...(githubAppClientId ? { githubAppClientId } : {}),
    ...(githubAppClientSecret ? { githubAppClientSecret } : {}),
    ...(githubAppInstallUrl ? { githubAppInstallUrl } : {}),
    ...(githubAppCallbackUrl ? { githubAppCallbackUrl } : {}),
    ...(githubAppWebhookUrl ? { githubAppWebhookUrl } : {}),
    ...(githubAppWebhookSecret ? { githubAppWebhookSecret } : {}),
    ...(githubAppPrivateKey ? { githubAppPrivateKey } : {}),
    ...(githubAppPrivateKeyBase64 ? { githubAppPrivateKeyBase64 } : {}),
    ...(googleClientId ? { googleClientId } : {}),
    ...(googleClientSecret ? { googleClientSecret } : {}),
    ...(googleRedirectUri ? { googleRedirectUri } : {}),
    ...(oidcClientId ? { oidcClientId } : {}),
    ...(oidcClientSecret ? { oidcClientSecret } : {}),
    ...(source.flags?.oidcDiscoveryUrl ||
    env.APPALOFT_OIDC_DISCOVERY_URL ||
    fileConfig.oidcDiscoveryUrl
      ? {
          oidcDiscoveryUrl:
            source.flags?.oidcDiscoveryUrl ??
            env.APPALOFT_OIDC_DISCOVERY_URL ??
            fileConfig.oidcDiscoveryUrl,
        }
      : {}),
    ...(source.flags?.oidcIssuer || env.APPALOFT_OIDC_ISSUER || fileConfig.oidcIssuer
      ? {
          oidcIssuer: source.flags?.oidcIssuer ?? env.APPALOFT_OIDC_ISSUER ?? fileConfig.oidcIssuer,
        }
      : {}),
    ...(oidcRedirectUri ? { oidcRedirectUri } : {}),
    ...(source.flags?.githubWebhookSecret ||
    env.APPALOFT_GITHUB_WEBHOOK_SECRET ||
    fileConfig.githubWebhookSecret
      ? {
          githubWebhookSecret:
            source.flags?.githubWebhookSecret ??
            env.APPALOFT_GITHUB_WEBHOOK_SECRET ??
            fileConfig.githubWebhookSecret,
        }
      : {}),
    ...(source.flags?.githubPreviewFeedbackToken ||
    env.APPALOFT_GITHUB_PREVIEW_FEEDBACK_TOKEN ||
    fileConfig.githubPreviewFeedbackToken
      ? {
          githubPreviewFeedbackToken:
            source.flags?.githubPreviewFeedbackToken ??
            env.APPALOFT_GITHUB_PREVIEW_FEEDBACK_TOKEN ??
            fileConfig.githubPreviewFeedbackToken,
        }
      : {}),
    httpHost:
      source.flags?.httpHost ?? env.APPALOFT_HTTP_HOST ?? fileConfig.httpHost ?? defaults.httpHost,
    ...(source.flags?.httpIdleTimeoutSeconds ||
    env.APPALOFT_HTTP_IDLE_TIMEOUT_SECONDS ||
    fileConfig.httpIdleTimeoutSeconds
      ? {
          httpIdleTimeoutSeconds:
            source.flags?.httpIdleTimeoutSeconds ??
            parsePositiveInteger(env.APPALOFT_HTTP_IDLE_TIMEOUT_SECONDS) ??
            fileConfig.httpIdleTimeoutSeconds,
        }
      : {}),
    httpPort: Number(
      source.flags?.httpPort ?? env.APPALOFT_HTTP_PORT ?? fileConfig.httpPort ?? defaults.httpPort,
    ),
    webOrigin,
    ...(resourceAccessFailureRendererUrl ? { resourceAccessFailureRendererUrl } : {}),
    ...(source.flags?.webStaticDir || env.APPALOFT_WEB_STATIC_DIR || fileConfig.webStaticDir
      ? {
          webStaticDir:
            source.flags?.webStaticDir ?? env.APPALOFT_WEB_STATIC_DIR ?? fileConfig.webStaticDir,
        }
      : {}),
    ...(source.flags?.docsStaticDir || env.APPALOFT_DOCS_STATIC_DIR || fileConfig.docsStaticDir
      ? {
          docsStaticDir:
            source.flags?.docsStaticDir ?? env.APPALOFT_DOCS_STATIC_DIR ?? fileConfig.docsStaticDir,
        }
      : {}),
    databaseDriver,
    autoMigrate:
      source.flags?.autoMigrate ??
      parseBoolean(env.APPALOFT_AUTO_MIGRATE) ??
      fileConfig.autoMigrate ??
      defaults.autoMigrate,
    ...(databaseUrl ? { databaseUrl } : {}),
    databasePoolMax,
    dataDir,
    pgliteDataDir,
    remoteRuntimeRoot:
      source.flags?.remoteRuntimeRoot ??
      env.APPALOFT_REMOTE_RUNTIME_ROOT ??
      fileConfig.remoteRuntimeRoot ??
      defaults.remoteRuntimeRoot,
    remotePgliteSyncBackupRetentionDays,
    remotePgliteSyncBackupMaxCount,
    logLevel:
      source.flags?.logLevel ??
      (env.APPALOFT_LOG_LEVEL as AppConfig["logLevel"] | undefined) ??
      fileConfig.logLevel ??
      defaults.logLevel,
    environment:
      source.flags?.environment ??
      env.APPALOFT_ENV ??
      fileConfig.environment ??
      defaults.environment,
    otelEnabled:
      source.flags?.otelEnabled ??
      otelEnabledFromEnv ??
      fileConfig.otelEnabled ??
      (otelExporterEndpointFromEnv ? true : defaults.otelEnabled),
    otelServiceName:
      source.flags?.otelServiceName ??
      env.OTEL_SERVICE_NAME ??
      env.APPALOFT_OTEL_SERVICE_NAME ??
      fileConfig.otelServiceName ??
      defaults.otelServiceName,
    ...((source.flags?.otelExporterEndpoint ??
    otelExporterEndpointFromEnv ??
    fileConfig.otelExporterEndpoint)
      ? {
          otelExporterEndpoint:
            source.flags?.otelExporterEndpoint ??
            otelExporterEndpointFromEnv ??
            fileConfig.otelExporterEndpoint,
        }
      : {}),
    ...((source.flags?.otelExporterHeaders ??
    otelExporterHeadersFromEnv ??
    fileConfig.otelExporterHeaders)
      ? {
          otelExporterHeaders:
            source.flags?.otelExporterHeaders ??
            otelExporterHeadersFromEnv ??
            fileConfig.otelExporterHeaders,
        }
      : {}),
    ...((source.flags?.otelTracesSampler ?? env.OTEL_TRACES_SAMPLER ?? fileConfig.otelTracesSampler)
      ? {
          otelTracesSampler:
            source.flags?.otelTracesSampler ??
            env.OTEL_TRACES_SAMPLER ??
            fileConfig.otelTracesSampler,
        }
      : {}),
    ...((source.flags?.otelTracesSamplerArg ??
    env.OTEL_TRACES_SAMPLER_ARG ??
    fileConfig.otelTracesSamplerArg)
      ? {
          otelTracesSamplerArg:
            source.flags?.otelTracesSamplerArg ??
            env.OTEL_TRACES_SAMPLER_ARG ??
            fileConfig.otelTracesSamplerArg,
        }
      : {}),
    ...((source.flags?.traceLinkBaseUrl ?? env.TRACE_LINK_BASE_URL ?? fileConfig.traceLinkBaseUrl)
      ? {
          traceLinkBaseUrl:
            source.flags?.traceLinkBaseUrl ??
            env.TRACE_LINK_BASE_URL ??
            fileConfig.traceLinkBaseUrl,
        }
      : {}),
    ...((source.flags?.traceLinkUrlTemplate ??
    env.TRACE_LINK_URL_TEMPLATE ??
    fileConfig.traceLinkUrlTemplate)
      ? {
          traceLinkUrlTemplate:
            source.flags?.traceLinkUrlTemplate ??
            env.TRACE_LINK_URL_TEMPLATE ??
            fileConfig.traceLinkUrlTemplate,
        }
      : {}),
    secretMask:
      source.flags?.secretMask ??
      env.APPALOFT_SECRET_MASK ??
      fileConfig.secretMask ??
      defaults.secretMask,
    defaultAccessDomain: {
      mode: defaultAccessDomainMode,
      providerKey:
        env.APPALOFT_DEFAULT_ACCESS_DOMAIN_PROVIDER ??
        defaultAccessDomain.providerKey ??
        defaults.defaultAccessDomain.providerKey,
      zone:
        env.APPALOFT_DEFAULT_ACCESS_DOMAIN_ZONE ??
        defaultAccessDomain.zone ??
        defaults.defaultAccessDomain.zone,
      scheme: defaultAccessDomainScheme,
    },
    certificateProvider: {
      mode: certificateProviderMode,
      providerKey:
        env.APPALOFT_CERTIFICATE_PROVIDER_KEY ??
        certificateProvider.providerKey ??
        defaults.certificateProvider.providerKey,
      acme: {
        directoryUrl:
          env.APPALOFT_ACME_DIRECTORY_URL ??
          acmeConfig.directoryUrl ??
          defaults.certificateProvider.acme.directoryUrl,
        ...((env.APPALOFT_ACME_EMAIL ?? acmeConfig.email)
          ? {
              email: env.APPALOFT_ACME_EMAIL ?? acmeConfig.email,
            }
          : {}),
        ...((env.APPALOFT_ACME_ACCOUNT_KEY_PEM ?? acmeConfig.accountPrivateKeyPem)
          ? {
              accountPrivateKeyPem:
                env.APPALOFT_ACME_ACCOUNT_KEY_PEM ?? acmeConfig.accountPrivateKeyPem,
            }
          : {}),
        ...((env.APPALOFT_ACME_ACCOUNT_KEY_PATH ?? acmeConfig.accountPrivateKeyPath)
          ? {
              accountPrivateKeyPath:
                env.APPALOFT_ACME_ACCOUNT_KEY_PATH ?? acmeConfig.accountPrivateKeyPath,
            }
          : {}),
        termsOfServiceAgreed: acmeTermsOfServiceAgreed,
        skipChallengeVerification: acmeSkipChallengeVerification,
        challengeTokenTtlSeconds: acmeChallengeTokenTtlSeconds,
      },
    },
    certificateRetryScheduler: {
      enabled: certificateRetrySchedulerEnabled,
      intervalSeconds: certificateRetrySchedulerIntervalSeconds,
      defaultRetryDelaySeconds: certificateRetryDefaultDelaySeconds,
      batchSize: certificateRetrySchedulerBatchSize,
    },
    previewCleanupRetryScheduler: {
      enabled: previewCleanupRetrySchedulerEnabled,
      intervalSeconds: previewCleanupRetrySchedulerIntervalSeconds,
      batchSize: previewCleanupRetrySchedulerBatchSize,
    },
    previewExpiryCleanupScheduler: {
      enabled: previewExpiryCleanupSchedulerEnabled,
      intervalSeconds: previewExpiryCleanupSchedulerIntervalSeconds,
      batchSize: previewExpiryCleanupSchedulerBatchSize,
    },
    dockerSwarmExecution: {
      enabled: dockerSwarmExecutionEnabled,
      commandTimeoutMs: dockerSwarmExecutionCommandTimeoutMs,
      edgeNetworkName: dockerSwarmExecutionEdgeNetworkName,
    },
    terminalSessions: {
      activeTtlSeconds: terminalSessionActiveTtlSeconds,
      outputRetentionBytes: terminalSessionOutputRetentionBytes,
    },
    scheduledTaskRunner: {
      enabled: scheduledTaskRunnerEnabled,
      intervalSeconds: scheduledTaskRunnerIntervalSeconds,
      batchSize: scheduledTaskRunnerBatchSize,
    },
    scheduledRuntimePruneRunner: {
      enabled: scheduledRuntimePruneRunnerEnabled,
      intervalSeconds: scheduledRuntimePruneRunnerIntervalSeconds,
      batchSize: scheduledRuntimePruneRunnerBatchSize,
    },
    scheduledDependencyBackupRunner: {
      enabled: scheduledDependencyBackupRunnerEnabled,
      intervalSeconds: scheduledDependencyBackupRunnerIntervalSeconds,
      batchSize: scheduledDependencyBackupRunnerBatchSize,
    },
    scheduledHistoryRetentionRunner: {
      enabled: scheduledHistoryRetentionRunnerEnabled,
      intervalSeconds: scheduledHistoryRetentionRunnerIntervalSeconds,
      batchSize: scheduledHistoryRetentionRunnerBatchSize,
    },
    runtimeMonitoringCollectorRunner: {
      enabled: runtimeMonitoringCollectorRunnerEnabled,
      intervalSeconds: runtimeMonitoringCollectorRunnerIntervalSeconds,
      batchSize: runtimeMonitoringCollectorRunnerBatchSize,
      rawRetentionHours: runtimeMonitoringCollectorRunnerRawRetentionHours,
    },
    workerRuntime: {
      mode: workerRuntimeMode,
      queueBackend: workerRuntimeQueueBackend,
      workerCount: workerRuntimeWorkerCount,
      workerGroup: workerRuntimeWorkerGroup,
      ...(workerRuntimeExternalBackendKind
        ? { externalBackendKind: workerRuntimeExternalBackendKind }
        : {}),
    },
    enabledSystemPlugins,
    ...(source.configFilePath ? { configFilePath: source.configFilePath } : {}),
  };
}

export function configPrecedenceDescription(): string[] {
  return ["flags", "environment variables", "config file", "built-in defaults"];
}
