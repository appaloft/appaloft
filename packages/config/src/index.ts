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

export interface AppConfig {
  appName: string;
  appVersion: string;
  runtimeMode: "self-hosted" | "hosted-control-plane";
  authProvider: "better-auth" | "none";
  betterAuthBaseUrl: string;
  betterAuthSecret: string;
  githubClientId?: string;
  githubClientSecret?: string;
  httpHost: string;
  httpPort: number;
  webOrigin: string;
  resourceAccessFailureRendererUrl?: string;
  webStaticDir?: string;
  docsStaticDir?: string;
  databaseDriver: "postgres" | "pglite";
  databaseUrl?: string;
  dataDir: string;
  pgliteDataDir: string;
  remoteRuntimeRoot: string;
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
  enabledSystemPlugins: string[];
  configFilePath?: string;
}

export interface ConfigSource<TValue> {
  flags?: Partial<TValue>;
  env?: ConfigEnv;
  configFilePath?: string;
}

const defaults: Omit<AppConfig, "dataDir" | "pgliteDataDir"> = {
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
  databaseUrl: "postgres://postgres:postgres@localhost:5432/appaloft",
  remoteRuntimeRoot: "/var/lib/appaloft/runtime",
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
  const resourceAccessFailureRendererUrl = normalizeHttpUrl(
    source.flags?.resourceAccessFailureRendererUrl ??
      env.APPALOFT_RESOURCE_ACCESS_FAILURE_RENDERER_URL ??
      fileConfig.resourceAccessFailureRendererUrl,
  );

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
    betterAuthBaseUrl:
      source.flags?.betterAuthBaseUrl ??
      env.APPALOFT_BETTER_AUTH_URL ??
      fileConfig.betterAuthBaseUrl ??
      defaults.betterAuthBaseUrl,
    betterAuthSecret:
      source.flags?.betterAuthSecret ??
      env.APPALOFT_BETTER_AUTH_SECRET ??
      fileConfig.betterAuthSecret ??
      defaults.betterAuthSecret,
    ...(source.flags?.githubClientId || env.APPALOFT_GITHUB_CLIENT_ID || fileConfig.githubClientId
      ? {
          githubClientId:
            source.flags?.githubClientId ??
            env.APPALOFT_GITHUB_CLIENT_ID ??
            fileConfig.githubClientId,
        }
      : {}),
    ...(source.flags?.githubClientSecret ||
    env.APPALOFT_GITHUB_CLIENT_SECRET ||
    fileConfig.githubClientSecret
      ? {
          githubClientSecret:
            source.flags?.githubClientSecret ??
            env.APPALOFT_GITHUB_CLIENT_SECRET ??
            fileConfig.githubClientSecret,
        }
      : {}),
    httpHost:
      source.flags?.httpHost ?? env.APPALOFT_HTTP_HOST ?? fileConfig.httpHost ?? defaults.httpHost,
    httpPort: Number(
      source.flags?.httpPort ?? env.APPALOFT_HTTP_PORT ?? fileConfig.httpPort ?? defaults.httpPort,
    ),
    webOrigin:
      source.flags?.webOrigin ??
      env.APPALOFT_WEB_ORIGIN ??
      fileConfig.webOrigin ??
      defaults.webOrigin,
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
    ...(databaseUrl ? { databaseUrl } : {}),
    dataDir,
    pgliteDataDir,
    remoteRuntimeRoot:
      source.flags?.remoteRuntimeRoot ??
      env.APPALOFT_REMOTE_RUNTIME_ROOT ??
      fileConfig.remoteRuntimeRoot ??
      defaults.remoteRuntimeRoot,
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
    enabledSystemPlugins,
    ...(source.configFilePath ? { configFilePath: source.configFilePath } : {}),
  };
}

export function configPrecedenceDescription(): string[] {
  return ["flags", "environment variables", "config file", "built-in defaults"];
}
