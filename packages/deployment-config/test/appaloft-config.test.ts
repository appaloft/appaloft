import { describe, expect, test } from "bun:test";
import {
  appaloftDeploymentConfigFileNames,
  parseAppaloftDeploymentConfig,
  parseAppaloftDeploymentConfigText,
} from "../src";

describe("Appaloft deployment config schema", () => {
  test("[CONFIG-FILE-PARSE-001] accepts repository profile config in JSON and YAML", () => {
    const parsed = parseAppaloftDeploymentConfig({
      runtime: {
        strategy: "workspace-commands",
        installCommand: "bun install",
        buildCommand: "bun run build",
        startCommand: "bun run start",
        healthCheckPath: "/ready",
      },
      network: {
        internalPort: 4310,
        upstreamProtocol: "http",
        exposureMode: "reverse-proxy",
      },
      source: {
        baseDirectory: "apps/api",
      },
      env: {
        PUBLIC_MODE: "demo",
      },
      secrets: {
        SSH_PRIVATE_KEY: {
          from: "server-credential:ssh_prod",
        },
      },
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect("project" in parsed.data).toBe(false);
      expect("targets" in parsed.data).toBe(false);
      expect(parsed.data.runtime?.strategy).toBe("workspace-commands");
      expect(parsed.data.network?.internalPort).toBe(4310);
    }

    const yaml = parseAppaloftDeploymentConfigText(
      [
        "runtime:",
        "  strategy: static",
        "  buildCommand: bun run build",
        "  publishDirectory: dist",
        "network:",
        "  internalPort: 80",
        "source:",
        "  baseDirectory: apps/web",
      ].join("\n"),
      "appaloft.yml",
    );

    expect(yaml.success).toBe(true);
    if (yaml.success) {
      expect(yaml.data.runtime?.strategy).toBe("static");
      expect(yaml.data.runtime?.publishDirectory).toBe("dist");
    }
  });

  test("[CONFIG-FILE-DISC-001] declares JSON and YAML config discovery names", () => {
    expect(appaloftDeploymentConfigFileNames).toContain("appaloft.json");
    expect(appaloftDeploymentConfigFileNames).toContain("appaloft.yml");
    expect(appaloftDeploymentConfigFileNames).toContain("appaloft.yaml");
  });

  test("[CONFIG-FILE-ID-001] rejects identity and destination fields from config files", () => {
    const parsed = parseAppaloftDeploymentConfig({
      project: {
        name: "production",
      },
      runtime: {
        strategy: "auto",
      },
    });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.message).toContain("config_identity_field");
      expect(parsed.error.issues[0]?.path).toEqual(["project"]);
    }

    const targetParsed = parseAppaloftDeploymentConfig({
      targets: [
        {
          providerKey: "generic-ssh",
          host: "example.com",
        },
      ],
    });

    expect(targetParsed.success).toBe(false);
  });

  test("[CONFIG-FILE-SEC-001] rejects raw secret material while accepting references", () => {
    const reference = parseAppaloftDeploymentConfig({
      secrets: {
        DATABASE_URL: {
          from: "environment-secret:database_url",
        },
      },
    });
    expect(reference.success).toBe(true);

    const rawSecret = parseAppaloftDeploymentConfig({
      secrets: {
        SSH_PRIVATE_KEY: "-----BEGIN OPENSSH PRIVATE KEY-----\nsecret",
      },
    });

    expect(rawSecret.success).toBe(false);
    if (!rawSecret.success) {
      expect(rawSecret.error.issues[0]?.message).toContain("raw_secret_config_field");
      expect(rawSecret.error.issues[0]?.path).toEqual(["secrets", "SSH_PRIVATE_KEY"]);
    }

    const envSecretName = parseAppaloftDeploymentConfig({
      env: {
        API_TOKEN: "plain-token",
      },
    });

    expect(envSecretName.success).toBe(false);

    const databaseUrl = parseAppaloftDeploymentConfig({
      env: {
        DATABASE_URL: "postgres://user:password@example.test/app",
      },
    });

    expect(databaseUrl.success).toBe(false);
  });

  test("[CONFIG-FILE-UNSUPPORTED-001] rejects resource sizing fields until resource-profile support exists", () => {
    const parsed = parseAppaloftDeploymentConfig({
      runtime: {
        strategy: "auto",
      },
      resources: {
        cpu: "1",
        memory: "512Mi",
      },
    });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.message).toContain("unsupported_config_field");
      expect(parsed.error.issues[0]?.path).toEqual(["resources"]);
    }

    const nested = parseAppaloftDeploymentConfig({
      runtime: {
        strategy: "auto",
        memory: "512Mi",
      },
    });

    expect(nested.success).toBe(false);
  });

  test("[CONFIG-FILE-PROFILE-004] rejects source-root path escapes and absolute paths", () => {
    const escapesSourceRoot = parseAppaloftDeploymentConfig({
      source: {
        baseDirectory: "../api",
      },
    });

    expect(escapesSourceRoot.success).toBe(false);

    const absolutePath = parseAppaloftDeploymentConfig({
      runtime: {
        strategy: "dockerfile",
        dockerfilePath: "/tmp/Dockerfile",
      },
    });

    expect(absolutePath.success).toBe(false);

    const safePath = parseAppaloftDeploymentConfig({
      source: {
        baseDirectory: "apps/api",
      },
      runtime: {
        strategy: "static",
        publishDirectory: "dist",
      },
    });

    expect(safePath.success).toBe(true);
  });

  test("[CONFIG-FILE-DOMAIN-001] accepts provider-neutral access domains", () => {
    const parsed = parseAppaloftDeploymentConfig({
      access: {
        domains: [
          {
            host: "WWW.Example.COM",
          },
          {
            host: "api.example.com",
            pathPrefix: "/api",
            tlsMode: "disabled",
          },
        ],
      },
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.access?.domains).toEqual([
        {
          host: "www.example.com",
          pathPrefix: "/",
          tlsMode: "auto",
        },
        {
          host: "api.example.com",
          pathPrefix: "/api",
          tlsMode: "disabled",
        },
      ]);
    }
  });

  test("[CONFIG-FILE-DOMAIN-002] rejects domain identity selectors", () => {
    const parsed = parseAppaloftDeploymentConfig({
      access: {
        domains: [
          {
            host: "www.example.com",
            serverId: "srv_prod",
          },
        ],
      },
    });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.message).toContain("config_identity_field");
      expect(parsed.error.issues[0]?.path).toEqual(["access", "domains", 0, "serverId"]);
    }
  });

  test("[CONFIG-FILE-DOMAIN-003] rejects raw TLS material in access domains", () => {
    const parsed = parseAppaloftDeploymentConfig({
      access: {
        domains: [
          {
            host: "www.example.com",
            privateKey: "-----BEGIN PRIVATE KEY-----\nsecret\n-----END PRIVATE KEY-----",
          },
        ],
      },
    });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.message).toContain("raw_secret_config_field");
      expect(parsed.error.issues[0]?.path).toEqual(["access", "domains", 0, "privateKey"]);
    }
  });

  test("[CONFIG-FILE-DOMAIN-004] rejects unsafe access domain host and path shapes", () => {
    for (const host of [
      "https://www.example.com",
      "www.example.com:443",
      "www.example.com/path",
      "*.example.com",
      "bad_domain",
    ]) {
      const parsed = parseAppaloftDeploymentConfig({
        access: {
          domains: [
            {
              host,
            },
          ],
        },
      });

      expect(parsed.success, host).toBe(false);
      if (!parsed.success) {
        expect(parsed.error.issues[0]?.message).toContain("config_domain_resolution");
        expect(parsed.error.issues[0]?.path).toEqual(["access", "domains", 0, "host"]);
      }
    }

    const path = parseAppaloftDeploymentConfig({
      access: {
        domains: [
          {
            host: "www.example.com",
            pathPrefix: "admin",
          },
        ],
      },
    });

    expect(path.success).toBe(false);
    if (!path.success) {
      expect(path.error.issues[0]?.message).toContain("config_domain_resolution");
      expect(path.error.issues[0]?.path).toEqual(["access", "domains", 0, "pathPrefix"]);
    }
  });
});
