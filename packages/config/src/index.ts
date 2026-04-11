import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

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
  webStaticDir?: string;
  databaseDriver: "postgres" | "pglite";
  databaseUrl?: string;
  dataDir: string;
  pgliteDataDir: string;
  logLevel: "debug" | "info" | "warn" | "error";
  environment: string;
  otelEnabled: boolean;
  otelServiceName: string;
  otelExporterEndpoint: string;
  secretMask: string;
  enabledSystemPlugins: string[];
  configFilePath?: string;
}

export interface ConfigSource<TValue> {
  flags?: Partial<TValue>;
  env?: Record<string, string | undefined>;
  configFilePath?: string;
}

const defaults: AppConfig = {
  appName: "Yundu",
  appVersion: "0.1.0",
  runtimeMode: "self-hosted",
  authProvider: "better-auth",
  betterAuthBaseUrl: "http://localhost:3001",
  betterAuthSecret: "development-only-yundu-better-auth-secret-change-me",
  httpHost: "0.0.0.0",
  httpPort: 3001,
  webOrigin: "http://localhost:4173",
  databaseDriver: "pglite",
  databaseUrl: "postgres://postgres:postgres@localhost:5432/yundu",
  dataDir: resolve(".yundu/data"),
  pgliteDataDir: resolve(".yundu/data/pglite"),
  logLevel: "info",
  environment: "development",
  otelEnabled: false,
  otelServiceName: "yundu-backend",
  otelExporterEndpoint: "http://localhost:4318/v1/traces",
  secretMask: "****",
  enabledSystemPlugins: [],
};

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

export function resolveConfig(source: ConfigSource<AppConfig> = {}): AppConfig {
  const env = source.env ?? process.env;
  const fileConfig = readConfigFile(source.configFilePath);
  const otelEnabledFromEnv = env.YUNDU_OTEL_ENABLED ? env.YUNDU_OTEL_ENABLED === "true" : undefined;
  const explicitDatabaseDriver =
    source.flags?.databaseDriver ??
    (env.YUNDU_DATABASE_DRIVER as AppConfig["databaseDriver"] | undefined) ??
    fileConfig.databaseDriver;
  const configuredDatabaseUrl =
    source.flags?.databaseUrl ?? env.YUNDU_DATABASE_URL ?? fileConfig.databaseUrl;
  const databaseDriver =
    explicitDatabaseDriver ?? (configuredDatabaseUrl ? "postgres" : defaults.databaseDriver);
  const dataDir = resolve(
    source.flags?.dataDir ?? env.YUNDU_DATA_DIR ?? fileConfig.dataDir ?? defaults.dataDir,
  );
  const pgliteDataDir = resolve(
    source.flags?.pgliteDataDir ??
      env.YUNDU_PGLITE_DATA_DIR ??
      fileConfig.pgliteDataDir ??
      join(dataDir, "pglite"),
  );
  const databaseUrl =
    configuredDatabaseUrl ?? (databaseDriver === "postgres" ? defaults.databaseUrl : undefined);
  const enabledSystemPlugins = (
    source.flags?.enabledSystemPlugins ??
    (env.YUNDU_SYSTEM_PLUGINS
      ? env.YUNDU_SYSTEM_PLUGINS.split(",")
      : fileConfig.enabledSystemPlugins) ??
    defaults.enabledSystemPlugins
  )
    .map((plugin) => plugin.trim())
    .filter((plugin) => plugin.length > 0);

  return {
    appName: source.flags?.appName ?? env.YUNDU_APP_NAME ?? fileConfig.appName ?? defaults.appName,
    appVersion:
      source.flags?.appVersion ??
      env.YUNDU_APP_VERSION ??
      fileConfig.appVersion ??
      defaults.appVersion,
    runtimeMode:
      source.flags?.runtimeMode ??
      (env.YUNDU_RUNTIME_MODE as AppConfig["runtimeMode"] | undefined) ??
      fileConfig.runtimeMode ??
      defaults.runtimeMode,
    authProvider:
      source.flags?.authProvider ??
      (env.YUNDU_AUTH_PROVIDER as AppConfig["authProvider"] | undefined) ??
      fileConfig.authProvider ??
      defaults.authProvider,
    betterAuthBaseUrl:
      source.flags?.betterAuthBaseUrl ??
      env.YUNDU_BETTER_AUTH_URL ??
      fileConfig.betterAuthBaseUrl ??
      defaults.betterAuthBaseUrl,
    betterAuthSecret:
      source.flags?.betterAuthSecret ??
      env.YUNDU_BETTER_AUTH_SECRET ??
      fileConfig.betterAuthSecret ??
      defaults.betterAuthSecret,
    ...(source.flags?.githubClientId || env.YUNDU_GITHUB_CLIENT_ID || fileConfig.githubClientId
      ? {
          githubClientId:
            source.flags?.githubClientId ?? env.YUNDU_GITHUB_CLIENT_ID ?? fileConfig.githubClientId,
        }
      : {}),
    ...(source.flags?.githubClientSecret ||
    env.YUNDU_GITHUB_CLIENT_SECRET ||
    fileConfig.githubClientSecret
      ? {
          githubClientSecret:
            source.flags?.githubClientSecret ??
            env.YUNDU_GITHUB_CLIENT_SECRET ??
            fileConfig.githubClientSecret,
        }
      : {}),
    httpHost:
      source.flags?.httpHost ?? env.YUNDU_HTTP_HOST ?? fileConfig.httpHost ?? defaults.httpHost,
    httpPort: Number(
      source.flags?.httpPort ?? env.YUNDU_HTTP_PORT ?? fileConfig.httpPort ?? defaults.httpPort,
    ),
    webOrigin:
      source.flags?.webOrigin ?? env.YUNDU_WEB_ORIGIN ?? fileConfig.webOrigin ?? defaults.webOrigin,
    ...(source.flags?.webStaticDir || env.YUNDU_WEB_STATIC_DIR || fileConfig.webStaticDir
      ? {
          webStaticDir:
            source.flags?.webStaticDir ?? env.YUNDU_WEB_STATIC_DIR ?? fileConfig.webStaticDir,
        }
      : {}),
    databaseDriver,
    ...(databaseUrl ? { databaseUrl } : {}),
    dataDir,
    pgliteDataDir,
    logLevel:
      source.flags?.logLevel ??
      (env.YUNDU_LOG_LEVEL as AppConfig["logLevel"] | undefined) ??
      fileConfig.logLevel ??
      defaults.logLevel,
    environment:
      source.flags?.environment ?? env.YUNDU_ENV ?? fileConfig.environment ?? defaults.environment,
    otelEnabled:
      source.flags?.otelEnabled ??
      otelEnabledFromEnv ??
      fileConfig.otelEnabled ??
      defaults.otelEnabled,
    otelServiceName:
      source.flags?.otelServiceName ??
      env.YUNDU_OTEL_SERVICE_NAME ??
      fileConfig.otelServiceName ??
      defaults.otelServiceName,
    otelExporterEndpoint:
      source.flags?.otelExporterEndpoint ??
      env.YUNDU_OTEL_EXPORTER_OTLP_ENDPOINT ??
      fileConfig.otelExporterEndpoint ??
      defaults.otelExporterEndpoint,
    secretMask:
      source.flags?.secretMask ??
      env.YUNDU_SECRET_MASK ??
      fileConfig.secretMask ??
      defaults.secretMask,
    enabledSystemPlugins,
    ...(source.configFilePath ? { configFilePath: source.configFilePath } : {}),
  };
}

export function configPrecedenceDescription(): string[] {
  return ["flags", "environment variables", "config file", "built-in defaults"];
}
