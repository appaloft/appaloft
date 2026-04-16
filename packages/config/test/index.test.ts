import { describe, expect, test } from "bun:test";
import { join } from "node:path";

import { resolveConfig } from "../src";

const testHome = "/Users/yundu";
const testXdgDataHome = "/var/lib/xdg-data";
const testAppData = "C:\\Users\\yundu\\AppData\\Roaming";

function expectedDefaultDataDir(): string {
  if (process.platform === "darwin") {
    return join(testHome, "Library", "Application Support", "Yundu", "data");
  }

  if (process.platform === "win32") {
    return join(testAppData, "Yundu", "data");
  }

  return join(testXdgDataHome, "yundu", "data");
}

describe("resolveConfig", () => {
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
    expect(config.remoteRuntimeRoot).toBe("/var/lib/yundu/runtime");
  });

  test("infers postgres when a database URL is configured", () => {
    const config = resolveConfig({
      env: {
        YUNDU_DATABASE_URL: "postgres://postgres:postgres@127.0.0.1:5432/yundu",
      },
    });

    expect(config.databaseDriver).toBe("postgres");
    expect(config.databaseUrl).toBe("postgres://postgres:postgres@127.0.0.1:5432/yundu");
  });

  test("derives pglite storage from explicit data dir", () => {
    const config = resolveConfig({
      env: {
        YUNDU_DATA_DIR: ".yundu/data",
      },
    });

    expect(config.dataDir.endsWith(".yundu/data")).toBe(true);
    expect(config.pgliteDataDir.endsWith(".yundu/data/pglite")).toBe(true);
  });

  test("allows overriding the remote runtime root", () => {
    const config = resolveConfig({
      env: {
        YUNDU_REMOTE_RUNTIME_ROOT: "/srv/yundu/runtime",
      },
    });

    expect(config.remoteRuntimeRoot).toBe("/srv/yundu/runtime");
  });

  test("keeps an explicit pglite driver even if a database URL exists", () => {
    const config = resolveConfig({
      env: {
        YUNDU_DATABASE_DRIVER: "pglite",
        YUNDU_DATABASE_URL: "postgres://postgres:postgres@127.0.0.1:5432/yundu",
      },
    });

    expect(config.databaseDriver).toBe("pglite");
    expect(config.databaseUrl).toBe("postgres://postgres:postgres@127.0.0.1:5432/yundu");
  });

  test("uses standard OpenTelemetry environment variables", () => {
    const config = resolveConfig({
      env: {
        OTEL_SERVICE_NAME: "yundu-api",
        OTEL_EXPORTER_OTLP_ENDPOINT: "http://collector:4318",
        OTEL_EXPORTER_OTLP_HEADERS: "authorization=Bearer%20token",
        OTEL_TRACES_SAMPLER: "parentbased_traceidratio",
        OTEL_TRACES_SAMPLER_ARG: "0.5",
        TRACE_LINK_URL_TEMPLATE: "http://traces.local/detail/{traceId}",
      },
    });

    expect(config.otelEnabled).toBe(true);
    expect(config.otelServiceName).toBe("yundu-api");
    expect(config.otelExporterEndpoint).toBe("http://collector:4318/v1/traces");
    expect(config.otelExporterHeaders).toBe("authorization=Bearer%20token");
    expect(config.otelTracesSampler).toBe("parentbased_traceidratio");
    expect(config.otelTracesSamplerArg).toBe("0.5");
    expect(config.traceLinkUrlTemplate).toBe("http://traces.local/detail/{traceId}");
  });

  test("does not default production tracing to localhost", () => {
    const config = resolveConfig({
      env: {
        YUNDU_ENV: "production",
        YUNDU_OTEL_ENABLED: "true",
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
  });

  test("allows enabling ACME certificate provider through environment", () => {
    const config = resolveConfig({
      env: {
        YUNDU_CERTIFICATE_PROVIDER: "acme",
        YUNDU_ACME_DIRECTORY_URL: "https://ca.example.test/directory",
        YUNDU_ACME_EMAIL: "ops@example.com",
        YUNDU_ACME_ACCOUNT_KEY_PEM: "account-key",
        YUNDU_ACME_TERMS_OF_SERVICE_AGREED: "true",
        YUNDU_ACME_SKIP_CHALLENGE_VERIFICATION: "true",
        YUNDU_ACME_CHALLENGE_TOKEN_TTL_SECONDS: "120",
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
        YUNDU_CERTIFICATE_RETRY_SCHEDULER_ENABLED: "false",
        YUNDU_CERTIFICATE_RETRY_SCHEDULER_INTERVAL_SECONDS: "30",
        YUNDU_CERTIFICATE_RETRY_DEFAULT_DELAY_SECONDS: "45",
        YUNDU_CERTIFICATE_RETRY_SCHEDULER_BATCH_SIZE: "7",
      },
    });

    expect(config.certificateRetryScheduler).toEqual({
      enabled: false,
      intervalSeconds: 30,
      defaultRetryDelaySeconds: 45,
      batchSize: 7,
    });
  });
});
