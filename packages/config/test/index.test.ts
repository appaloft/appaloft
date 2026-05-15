import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { resolveConfig } from "../src";

const rootPackageJson = JSON.parse(
  readFileSync(new URL("../../../package.json", import.meta.url), "utf8"),
) as { version: string };
const testHome = "/Users/appaloft";
const testXdgDataHome = "/var/lib/xdg-data";
const testAppData = "C:\\Users\\appaloft\\AppData\\Roaming";

function expectedDefaultDataDir(): string {
  if (process.platform === "darwin") {
    return join(testHome, "Library", "Application Support", "Appaloft", "data");
  }

  if (process.platform === "win32") {
    return join(testAppData, "Appaloft", "data");
  }

  return join(testXdgDataHome, "appaloft", "data");
}

describe("resolveConfig", () => {
  test("defaults the runtime app version to the source checkout package version", () => {
    const config = resolveConfig({
      env: {},
    });

    expect(config.appVersion).toBe(rootPackageJson.version);
  });

  test("allows overriding the runtime app version through environment", () => {
    const config = resolveConfig({
      env: {
        APPALOFT_APP_VERSION: "0.2.0-dev.1",
      },
    });

    expect(config.appVersion).toBe("0.2.0-dev.1");
  });

  test("defaults to embedded pglite with user-level storage", () => {
    const config = resolveConfig({
      env: {
        APPDATA: testAppData,
        HOME: testHome,
        XDG_DATA_HOME: testXdgDataHome,
      },
    });

    expect(config.databaseDriver).toBe("pglite");
    expect(config.databaseUrl).toBeUndefined();
    expect(config.dataDir).toBe(expectedDefaultDataDir());
    expect(config.pgliteDataDir).toBe(join(expectedDefaultDataDir(), "pglite"));
    expect(config.remoteRuntimeRoot).toBe("/var/lib/appaloft/runtime");
  });

  test("[CONFIG-FILE-ENTRY-008] headless CI defaults to embedded pglite without DATABASE_URL", () => {
    const config = resolveConfig({
      env: {
        GITHUB_ACTIONS: "true",
        APPDATA: testAppData,
        HOME: testHome,
        XDG_DATA_HOME: testXdgDataHome,
      },
    });

    expect(config.databaseDriver).toBe("pglite");
    expect(config.databaseUrl).toBeUndefined();
    expect(config.pgliteDataDir).toBe(join(expectedDefaultDataDir(), "pglite"));
  });

  test("infers postgres when a database URL is configured", () => {
    const config = resolveConfig({
      env: {
        APPALOFT_DATABASE_URL: "postgres://postgres:postgres@127.0.0.1:5432/appaloft",
      },
    });

    expect(config.databaseDriver).toBe("postgres");
    expect(config.databaseUrl).toBe("postgres://postgres:postgres@127.0.0.1:5432/appaloft");
  });

  test("keeps automatic migrations opt-in for Postgres runtime startup", () => {
    const defaults = resolveConfig({
      env: {
        APPALOFT_DATABASE_URL: "postgres://postgres:postgres@127.0.0.1:5432/appaloft",
      },
    });
    const configured = resolveConfig({
      env: {
        APPALOFT_AUTO_MIGRATE: "true",
        APPALOFT_DATABASE_URL: "postgres://postgres:postgres@127.0.0.1:5432/appaloft",
      },
    });

    expect(defaults.autoMigrate).toBe(false);
    expect(configured.autoMigrate).toBe(true);
  });

  test("[SCHED-MAINT-WORKER-003] keeps scheduled maintenance workers disabled by default", () => {
    const config = resolveConfig({ env: {} });

    expect(config.certificateRetryScheduler.enabled).toBe(true);
    expect(config.previewCleanupRetryScheduler.enabled).toBe(false);
    expect(config.previewExpiryCleanupScheduler.enabled).toBe(false);
    expect(config.scheduledTaskRunner.enabled).toBe(false);
    expect(config.scheduledRuntimePruneRunner.enabled).toBe(false);
    expect(config.scheduledHistoryRetentionRunner.enabled).toBe(false);
    expect(config.runtimeMonitoringCollectorRunner.enabled).toBe(false);
  });

  test("derives pglite storage from explicit data dir", () => {
    const config = resolveConfig({
      env: {
        APPALOFT_DATA_DIR: ".appaloft/data",
      },
    });

    expect(config.dataDir.endsWith(".appaloft/data")).toBe(true);
    expect(config.pgliteDataDir.endsWith(".appaloft/data/pglite")).toBe(true);
  });

  test("allows overriding the remote runtime root", () => {
    const config = resolveConfig({
      env: {
        APPALOFT_REMOTE_RUNTIME_ROOT: "/srv/appaloft/runtime",
      },
    });

    expect(config.remoteRuntimeRoot).toBe("/srv/appaloft/runtime");
  });

  test("allows overriding Web and docs static asset directories independently", () => {
    const config = resolveConfig({
      env: {
        APPALOFT_WEB_STATIC_DIR: "/srv/appaloft/web",
        APPALOFT_DOCS_STATIC_DIR: "/srv/appaloft/docs",
      },
    });

    expect(config.webStaticDir).toBe("/srv/appaloft/web");
    expect(config.docsStaticDir).toBe("/srv/appaloft/docs");
  });

  test("reads the GitHub webhook secret from runtime configuration", () => {
    const config = resolveConfig({
      env: {
        APPALOFT_GITHUB_WEBHOOK_SECRET: "github-webhook-secret",
      },
    });

    expect(config.githubWebhookSecret).toBe("github-webhook-secret");
  });

  test("reads the self-hosted Action deploy token from runtime configuration", () => {
    const config = resolveConfig({
      env: {
        APPALOFT_ACTION_DEPLOY_TOKEN: "action-deploy-token",
      },
    });

    expect(config.actionDeployToken).toBe("action-deploy-token");
  });

  test("reads the self-hosted Action deploy token scope from runtime configuration", () => {
    const config = resolveConfig({
      env: {
        APPALOFT_ACTION_DEPLOY_TOKEN_ENVIRONMENT_ID: "env_prod",
        APPALOFT_ACTION_DEPLOY_TOKEN_PROJECT_ID: "prj_console",
        APPALOFT_ACTION_DEPLOY_TOKEN_REPOSITORY_FULL_NAME: "appaloft/www",
        APPALOFT_ACTION_DEPLOY_TOKEN_RESOURCE_ID: "res_www",
        APPALOFT_ACTION_DEPLOY_TOKEN_SERVER_ID: "srv_prod",
        APPALOFT_ACTION_DEPLOY_TOKEN_WORKFLOWS: "source-link-deploy,server-config-deploy",
      },
    });

    expect(config.actionDeployTokenScope).toEqual({
      environmentId: "env_prod",
      projectId: "prj_console",
      repositoryFullName: "appaloft/www",
      resourceId: "res_www",
      serverId: "srv_prod",
      workflows: ["source-link-deploy", "server-config-deploy"],
    });
  });

  test("reads the installer deploy-token bootstrap output file from runtime configuration", () => {
    const defaultConfig = resolveConfig({});
    expect(defaultConfig.bootstrapDeployTokenOutputFile).toBeUndefined();

    const config = resolveConfig({
      env: {
        APPALOFT_BOOTSTRAP_DEPLOY_TOKEN_OUTPUT_FILE: "/tmp/appaloft-bootstrap/deploy-token.json",
      },
    });

    expect(config.bootstrapDeployTokenOutputFile).toBe("/tmp/appaloft-bootstrap/deploy-token.json");
  });

  test("reads the installer first-admin bootstrap settings from runtime configuration", () => {
    const config = resolveConfig({
      env: {
        APPALOFT_BOOTSTRAP_FIRST_ADMIN_OUTPUT_FILE: "/tmp/appaloft-bootstrap/first-admin.json",
        APPALOFT_FIRST_ADMIN_DISPLAY_NAME: "Admin User",
        APPALOFT_FIRST_ADMIN_EMAIL: "admin@example.com",
        APPALOFT_FIRST_ADMIN_PASSWORD: "local-admin-password",
      },
    });

    expect(config.bootstrapFirstAdminOutputFile).toBe("/tmp/appaloft-bootstrap/first-admin.json");
    expect(config.firstAdminDisplayName).toBe("Admin User");
    expect(config.firstAdminEmail).toBe("admin@example.com");
    expect(config.firstAdminPassword).toBe("local-admin-password");
  });

  test("reads the GitHub preview feedback worker token from runtime configuration", () => {
    const config = resolveConfig({
      env: {
        APPALOFT_GITHUB_PREVIEW_FEEDBACK_TOKEN: "github-preview-worker-token",
      },
    });

    expect(config.githubPreviewFeedbackToken).toBe("github-preview-worker-token");
  });

  test("[FIRST-ADMIN-BOOTSTRAP-005] reads optional OAuth provider settings from runtime configuration", () => {
    const config = resolveConfig({
      env: {
        APPALOFT_GOOGLE_CLIENT_ID: "google-client-id",
        APPALOFT_GOOGLE_CLIENT_SECRET: "google-client-secret",
        APPALOFT_GOOGLE_REDIRECT_URI: "https://appaloft.example.com/api/auth/callback/google",
        APPALOFT_GITHUB_CLIENT_ID: "github-client-id",
        APPALOFT_GITHUB_CLIENT_SECRET: "github-client-secret",
        APPALOFT_GITHUB_REDIRECT_URI: "https://appaloft.example.com/api/auth/callback/github",
        APPALOFT_OIDC_CLIENT_ID: "oidc-client-id",
        APPALOFT_OIDC_CLIENT_SECRET: "oidc-client-secret",
        APPALOFT_OIDC_DISCOVERY_URL:
          "https://identity.example.com/.well-known/openid-configuration",
        APPALOFT_OIDC_ISSUER: "https://identity.example.com",
        APPALOFT_OIDC_REDIRECT_URI: "https://appaloft.example.com/api/auth/oauth2/callback/oidc",
      },
    });

    expect(config.googleClientId).toBe("google-client-id");
    expect(config.googleClientSecret).toBe("google-client-secret");
    expect(config.googleRedirectUri).toBe("https://appaloft.example.com/api/auth/callback/google");
    expect(config.githubClientId).toBe("github-client-id");
    expect(config.githubClientSecret).toBe("github-client-secret");
    expect(config.githubRedirectUri).toBe("https://appaloft.example.com/api/auth/callback/github");
    expect(config.oidcClientId).toBe("oidc-client-id");
    expect(config.oidcClientSecret).toBe("oidc-client-secret");
    expect(config.oidcDiscoveryUrl).toBe(
      "https://identity.example.com/.well-known/openid-configuration",
    );
    expect(config.oidcIssuer).toBe("https://identity.example.com");
    expect(config.oidcRedirectUri).toBe(
      "https://appaloft.example.com/api/auth/oauth2/callback/oidc",
    );
  });

  test("enables Docker Swarm execution by default and accepts explicit shell opt-out", () => {
    const defaults = resolveConfig();
    const configured = resolveConfig({
      env: {
        APPALOFT_DOCKER_SWARM_EXECUTION_ENABLED: "false",
        APPALOFT_DOCKER_SWARM_COMMAND_TIMEOUT_MS: "45000",
        APPALOFT_DOCKER_SWARM_EDGE_NETWORK: "appaloft-smoke-edge",
      },
    });

    expect(defaults.dockerSwarmExecution).toEqual({
      enabled: true,
      commandTimeoutMs: 60000,
      edgeNetworkName: "appaloft-edge",
    });
    expect(configured.dockerSwarmExecution).toEqual({
      enabled: false,
      commandTimeoutMs: 45000,
      edgeNetworkName: "appaloft-smoke-edge",
    });
  });

  test("uses an explicit resource access failure renderer URL only when it is HTTP based", () => {
    const configured = resolveConfig({
      env: {
        APPALOFT_RESOURCE_ACCESS_FAILURE_RENDERER_URL:
          "http://appaloft.internal:3001/.appaloft/resource-access-failure",
      },
    });
    const invalid = resolveConfig({
      env: {
        APPALOFT_RESOURCE_ACCESS_FAILURE_RENDERER_URL: "unix:///var/run/appaloft.sock",
      },
    });

    expect(configured.resourceAccessFailureRendererUrl).toBe(
      "http://appaloft.internal:3001/.appaloft/resource-access-failure",
    );
    expect(invalid.resourceAccessFailureRendererUrl).toBeUndefined();
  });

  test("uses shared logger environment variables", () => {
    const config = resolveConfig({
      env: {
        APPALOFT_LOG_LEVEL: "debug",
        APPALOFT_SECRET_MASK: "[masked]",
      },
    });

    expect(config.logLevel).toBe("debug");
    expect(config.secretMask).toBe("[masked]");
  });

  test("keeps an explicit pglite driver even if a database URL exists", () => {
    const config = resolveConfig({
      env: {
        APPALOFT_DATABASE_DRIVER: "pglite",
        APPALOFT_DATABASE_URL: "postgres://postgres:postgres@127.0.0.1:5432/appaloft",
      },
    });

    expect(config.databaseDriver).toBe("pglite");
    expect(config.databaseUrl).toBe("postgres://postgres:postgres@127.0.0.1:5432/appaloft");
  });

  test("uses standard OpenTelemetry environment variables", () => {
    const config = resolveConfig({
      env: {
        OTEL_SERVICE_NAME: "appaloft-api",
        OTEL_EXPORTER_OTLP_ENDPOINT: "http://collector:4318",
        OTEL_EXPORTER_OTLP_HEADERS: "authorization=Bearer%20token",
        OTEL_TRACES_SAMPLER: "parentbased_traceidratio",
        OTEL_TRACES_SAMPLER_ARG: "0.5",
        TRACE_LINK_URL_TEMPLATE: "http://traces.local/detail/{traceId}",
      },
    });

    expect(config.otelEnabled).toBe(true);
    expect(config.otelServiceName).toBe("appaloft-api");
    expect(config.otelExporterEndpoint).toBe("http://collector:4318/v1/traces");
    expect(config.otelExporterHeaders).toBe("authorization=Bearer%20token");
    expect(config.otelTracesSampler).toBe("parentbased_traceidratio");
    expect(config.otelTracesSamplerArg).toBe("0.5");
    expect(config.traceLinkUrlTemplate).toBe("http://traces.local/detail/{traceId}");
  });

  test("does not default production tracing to localhost", () => {
    const config = resolveConfig({
      env: {
        APPALOFT_ENV: "production",
        APPALOFT_OTEL_ENABLED: "true",
      },
    });

    expect(config.otelEnabled).toBe(true);
    expect(config.otelExporterEndpoint).toBeUndefined();
  });

  test("keeps ACME certificate provider disabled by default", () => {
    const config = resolveConfig();

    expect(config.certificateProvider).toMatchObject({
      mode: "disabled",
      providerKey: "acme",
      acme: {
        directoryUrl: "https://acme-staging-v02.api.letsencrypt.org/directory",
        termsOfServiceAgreed: false,
        skipChallengeVerification: false,
        challengeTokenTtlSeconds: 600,
      },
    });
    expect(config.certificateRetryScheduler).toEqual({
      enabled: true,
      intervalSeconds: 300,
      defaultRetryDelaySeconds: 300,
      batchSize: 25,
    });
    expect(config.scheduledTaskRunner).toEqual({
      enabled: false,
      intervalSeconds: 60,
      batchSize: 25,
    });
    expect(config.scheduledRuntimePruneRunner).toEqual({
      enabled: false,
      intervalSeconds: 3600,
      batchSize: 25,
    });
    expect(config.scheduledDependencyBackupRunner).toEqual({
      enabled: false,
      intervalSeconds: 3600,
      batchSize: 25,
    });
    expect(config.scheduledHistoryRetentionRunner).toEqual({
      enabled: false,
      intervalSeconds: 3600,
      batchSize: 25,
    });
    expect(config.runtimeMonitoringCollectorRunner).toEqual({
      enabled: false,
      intervalSeconds: 60,
      batchSize: 25,
      rawRetentionHours: 24,
    });
    expect(config.previewCleanupRetryScheduler).toEqual({
      enabled: false,
      intervalSeconds: 300,
      batchSize: 25,
    });
    expect(config.previewExpiryCleanupScheduler).toEqual({
      enabled: false,
      intervalSeconds: 300,
      batchSize: 25,
    });
  });

  test("allows enabling ACME certificate provider through environment", () => {
    const config = resolveConfig({
      env: {
        APPALOFT_CERTIFICATE_PROVIDER: "acme",
        APPALOFT_ACME_DIRECTORY_URL: "https://ca.example.test/directory",
        APPALOFT_ACME_EMAIL: "ops@example.com",
        APPALOFT_ACME_ACCOUNT_KEY_PEM: "account-key",
        APPALOFT_ACME_TERMS_OF_SERVICE_AGREED: "true",
        APPALOFT_ACME_SKIP_CHALLENGE_VERIFICATION: "true",
        APPALOFT_ACME_CHALLENGE_TOKEN_TTL_SECONDS: "120",
      },
    });

    expect(config.certificateProvider).toEqual({
      mode: "acme",
      providerKey: "acme",
      acme: {
        directoryUrl: "https://ca.example.test/directory",
        email: "ops@example.com",
        accountPrivateKeyPem: "account-key",
        termsOfServiceAgreed: true,
        skipChallengeVerification: true,
        challengeTokenTtlSeconds: 120,
      },
    });
  });

  test("allows configuring the certificate retry scheduler through environment", () => {
    const config = resolveConfig({
      env: {
        APPALOFT_CERTIFICATE_RETRY_SCHEDULER_ENABLED: "false",
        APPALOFT_CERTIFICATE_RETRY_SCHEDULER_INTERVAL_SECONDS: "30",
        APPALOFT_CERTIFICATE_RETRY_DEFAULT_DELAY_SECONDS: "45",
        APPALOFT_CERTIFICATE_RETRY_SCHEDULER_BATCH_SIZE: "7",
      },
    });

    expect(config.certificateRetryScheduler).toEqual({
      enabled: false,
      intervalSeconds: 30,
      defaultRetryDelaySeconds: 45,
      batchSize: 7,
    });
  });

  test("allows configuring the scheduled task runner through environment", () => {
    const config = resolveConfig({
      env: {
        APPALOFT_SCHEDULED_TASK_RUNNER_ENABLED: "true",
        APPALOFT_SCHEDULED_TASK_RUNNER_INTERVAL_SECONDS: "15",
        APPALOFT_SCHEDULED_TASK_RUNNER_BATCH_SIZE: "3",
      },
    });

    expect(config.scheduledTaskRunner).toEqual({
      enabled: true,
      intervalSeconds: 15,
      batchSize: 3,
    });
  });

  test("[RT-CAP-SCHED-007] allows configuring the scheduled runtime prune runner through environment", () => {
    const config = resolveConfig({
      env: {
        APPALOFT_SCHEDULED_RUNTIME_PRUNE_RUNNER_ENABLED: "true",
        APPALOFT_SCHEDULED_RUNTIME_PRUNE_RUNNER_INTERVAL_SECONDS: "120",
        APPALOFT_SCHEDULED_RUNTIME_PRUNE_RUNNER_BATCH_SIZE: "6",
      },
    });

    expect(config.scheduledRuntimePruneRunner).toEqual({
      enabled: true,
      intervalSeconds: 120,
      batchSize: 6,
    });
  });

  test("[DEP-RES-BACKUP-POLICY-003] allows configuring the scheduled dependency backup runner through environment", () => {
    const config = resolveConfig({
      env: {
        APPALOFT_SCHEDULED_DEPENDENCY_BACKUP_RUNNER_ENABLED: "true",
        APPALOFT_SCHEDULED_DEPENDENCY_BACKUP_RUNNER_INTERVAL_SECONDS: "240",
        APPALOFT_SCHEDULED_DEPENDENCY_BACKUP_RUNNER_BATCH_SIZE: "8",
      },
    });

    expect(config.scheduledDependencyBackupRunner).toEqual({
      enabled: true,
      intervalSeconds: 240,
      batchSize: 8,
    });
  });

  test("[TERM-SESSION-LIFE-005][TERM-SESSION-TRANSPORT-004] allows configuring terminal session lifecycle through environment", () => {
    const config = resolveConfig({
      env: {
        APPALOFT_TERMINAL_SESSION_ACTIVE_TTL_SECONDS: "900",
        APPALOFT_TERMINAL_SESSION_OUTPUT_RETENTION_BYTES: "32768",
      },
    });

    expect(config.terminalSessions).toEqual({
      activeTtlSeconds: 900,
      outputRetentionBytes: 32768,
    });
  });

  test("[SCHED-HISTORY-RETENTION-006] allows configuring the scheduled history retention runner through environment", () => {
    const config = resolveConfig({
      env: {
        APPALOFT_SCHEDULED_HISTORY_RETENTION_RUNNER_ENABLED: "true",
        APPALOFT_SCHEDULED_HISTORY_RETENTION_RUNNER_INTERVAL_SECONDS: "180",
        APPALOFT_SCHEDULED_HISTORY_RETENTION_RUNNER_BATCH_SIZE: "9",
      },
    });

    expect(config.scheduledHistoryRetentionRunner).toEqual({
      enabled: true,
      intervalSeconds: 180,
      batchSize: 9,
    });
  });

  test("[RT-MON-001] allows configuring the runtime monitoring collector runner through environment", () => {
    const config = resolveConfig({
      env: {
        APPALOFT_RUNTIME_MONITORING_COLLECTOR_RUNNER_ENABLED: "true",
        APPALOFT_RUNTIME_MONITORING_COLLECTOR_RUNNER_INTERVAL_SECONDS: "90",
        APPALOFT_RUNTIME_MONITORING_COLLECTOR_RUNNER_BATCH_SIZE: "4",
        APPALOFT_RUNTIME_MONITORING_RAW_RETENTION_HOURS: "6",
      },
    });

    expect(config.runtimeMonitoringCollectorRunner).toEqual({
      enabled: true,
      intervalSeconds: 90,
      batchSize: 4,
      rawRetentionHours: 6,
    });
  });

  test("allows configuring the preview cleanup retry scheduler through environment", () => {
    const config = resolveConfig({
      env: {
        APPALOFT_PREVIEW_CLEANUP_RETRY_SCHEDULER_ENABLED: "true",
        APPALOFT_PREVIEW_CLEANUP_RETRY_SCHEDULER_INTERVAL_SECONDS: "20",
        APPALOFT_PREVIEW_CLEANUP_RETRY_SCHEDULER_BATCH_SIZE: "4",
      },
    });

    expect(config.previewCleanupRetryScheduler).toEqual({
      enabled: true,
      intervalSeconds: 20,
      batchSize: 4,
    });
  });

  test("allows configuring the preview expiry cleanup scheduler through environment", () => {
    const config = resolveConfig({
      env: {
        APPALOFT_PREVIEW_EXPIRY_CLEANUP_SCHEDULER_ENABLED: "true",
        APPALOFT_PREVIEW_EXPIRY_CLEANUP_SCHEDULER_INTERVAL_SECONDS: "30",
        APPALOFT_PREVIEW_EXPIRY_CLEANUP_SCHEDULER_BATCH_SIZE: "6",
      },
    });

    expect(config.previewExpiryCleanupScheduler).toEqual({
      enabled: true,
      intervalSeconds: 30,
      batchSize: 6,
    });
  });
});
