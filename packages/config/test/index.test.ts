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

  test("reads the GitHub preview feedback worker token from runtime configuration", () => {
    const config = resolveConfig({
      env: {
        APPALOFT_GITHUB_PREVIEW_FEEDBACK_TOKEN: "github-preview-worker-token",
      },
    });

    expect(config.githubPreviewFeedbackToken).toBe("github-preview-worker-token");
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
    expect(config.previewCleanupRetryScheduler).toEqual({
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
});
