import { describe, expect, test } from "bun:test";
import {
  appaloftDeploymentConfigFileNames,
  appaloftDeploymentDependencyKinds,
  applyAppaloftDeploymentConfigProfile,
  applyAppaloftDeploymentPreviewProfile,
  parseAppaloftDeploymentConfig,
  parseAppaloftDeploymentConfigText,
  renderAppaloftDeploymentRuntimeNameTemplate,
} from "../src";

describe("Appaloft deployment config schema", () => {
  test("[CONFIG-FILE-PARSE-001] accepts repository profile config in JSON and YAML", () => {
    const parsed = parseAppaloftDeploymentConfig({
      runtime: {
        strategy: "workspace-commands",
        installCommand: "bun install",
        buildCommand: "bun run build",
        startCommand: "bun run start",
        dockerfilePath: "deploy/Dockerfile",
        dockerComposeFilePath: "deploy/compose.yaml",
        buildTarget: "runtime",
        name: "preview-{pr_number}",
        healthCheckPath: "/ready",
      },
      network: {
        internalPort: 4310,
        upstreamProtocol: "http",
        exposureMode: "reverse-proxy",
      },
      retention: {
        runtimePrune: {
          retentionDays: 14,
          destructive: true,
          categories: [
            "stopped-containers",
            "preview-workspaces",
            "source-workspaces",
            "docker-build-cache",
            "unused-images",
            "remote-state-markers",
          ],
          retryOnFailure: false,
          enabled: true,
        },
      },
      source: {
        baseDirectory: "apps/api",
      },
      env: {
        PUBLIC_MODE: "demo",
      },
      secrets: {
        SSH_PRIVATE_KEY: {
          from: "resource-secret:SSH_PRIVATE_KEY",
        },
      },
      preview: {
        pullRequest: {
          domainTemplate: "preview-{pr_number}.example.com",
          tlsMode: "auto",
        },
      },
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect("project" in parsed.data).toBe(false);
      expect("targets" in parsed.data).toBe(false);
      expect(parsed.data.runtime?.strategy).toBe("workspace-commands");
      expect(parsed.data.runtime?.name).toBe("preview-{pr_number}");
      expect(parsed.data.runtime?.dockerfilePath).toBe("deploy/Dockerfile");
      expect(parsed.data.runtime?.dockerComposeFilePath).toBe("deploy/compose.yaml");
      expect(parsed.data.runtime?.buildTarget).toBe("runtime");
      expect(parsed.data.network?.internalPort).toBe(4310);
      expect(parsed.data.preview?.pullRequest?.domainTemplate).toBe(
        "preview-{pr_number}.example.com",
      );
      expect(parsed.data.preview?.pullRequest?.tlsMode).toBe("auto");
      expect(parsed.data.retention?.runtimePrune).toEqual({
        retentionDays: 14,
        destructive: true,
        categories: [
          "stopped-containers",
          "preview-workspaces",
          "source-workspaces",
          "docker-build-cache",
          "unused-images",
          "remote-state-markers",
        ],
        retryOnFailure: false,
        enabled: true,
      });
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

  test("[CONFIG-FILE-RUNTIME-PRUNE-001][RT-CAP-SCHED-001] accepts runtime prune retention config defaults", () => {
    const parsed = parseAppaloftDeploymentConfig({
      retention: {
        runtimePrune: {
          retentionDays: 14,
        },
      },
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.retention?.runtimePrune).toEqual({
        retentionDays: 14,
        destructive: false,
        categories: ["stopped-containers"],
        retryOnFailure: true,
        enabled: true,
      });
    }
  });

  test("[CONFIG-FILE-RUNTIME-PRUNE-002][RT-CAP-SCHED-001] rejects unsafe scheduled runtime prune retention config", () => {
    const parsed = parseAppaloftDeploymentConfig({
      retention: {
        runtimePrune: {
          retentionDays: 0,
          categories: ["docker-volumes"],
        },
      },
    });

    expect(parsed.success).toBe(false);
  });

  test("[CONFIG-FILE-SERVICE-GRAPH-001] accepts named repository service graph declarations", () => {
    const parsed = parseAppaloftDeploymentConfig({
      services: {
        web: {
          kind: "web",
          runtime: {
            strategy: "workspace-commands",
            startCommand: "bun run start:web",
          },
          network: {
            internalPort: 3000,
            upstreamProtocol: "http",
            exposureMode: "reverse-proxy",
          },
          health: {
            path: "/ready",
          },
        },
        worker: {
          kind: "worker",
          runtime: {
            strategy: "workspace-commands",
            startCommand: "bun run start:worker",
          },
          network: {
            exposureMode: "none",
          },
          replicas: 4,
          env: {
            QUEUE: "deployments",
          },
          secrets: {
            WORKER_TOKEN: {
              from: "ci-env:WORKER_TOKEN",
            },
          },
        },
      },
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.services?.web?.kind).toBe("web");
      expect(parsed.data.services?.web?.network?.internalPort).toBe(3000);
      expect(parsed.data.services?.worker?.kind).toBe("worker");
      expect(parsed.data.services?.worker?.replicas).toBe(4);
      expect(parsed.data.services?.worker?.network?.exposureMode).toBe("none");
      expect(parsed.data.services?.worker?.secrets?.WORKER_TOKEN?.from).toBe("ci-env:WORKER_TOKEN");
    }
  });

  test("[CONFIG-FILE-SERVICE-GRAPH-002] rejects unsafe service graph fields", () => {
    const badKey = parseAppaloftDeploymentConfig({
      services: {
        Web: {
          kind: "web",
        },
      },
    });

    expect(badKey.success).toBe(false);

    const missingKind = parseAppaloftDeploymentConfig({
      services: {
        worker: {
          runtime: {
            strategy: "workspace-commands",
          },
        },
      },
    });

    expect(missingKind.success).toBe(false);

    const rawSecret = parseAppaloftDeploymentConfig({
      services: {
        worker: {
          kind: "worker",
          token: "secret-token",
        },
      },
    });

    expect(rawSecret.success).toBe(false);

    const topLevelReplicas = parseAppaloftDeploymentConfig({
      replicas: 4,
      services: {
        worker: {
          kind: "worker",
          replicas: 4,
        },
      },
    });

    expect(topLevelReplicas.success).toBe(true);
    if (topLevelReplicas.success) {
      expect(topLevelReplicas.data.replicas).toBe(4);
      expect(topLevelReplicas.data.services?.worker?.replicas).toBe(4);
    }
  });

  test("[CONFIG-FILE-APPLICATION-GRAPH-001] accepts named repository application graph declarations", () => {
    const parsed = parseAppaloftDeploymentConfig({
      applications: {
        api: {
          resource: {
            name: "Acme API",
            kind: "application",
            description: "Public API",
          },
          source: {
            type: "git",
            repository: "https://github.com/acme/app",
            baseDirectory: "apps/api",
            gitRef: "main",
          },
          runtime: {
            strategy: "workspace-commands",
            buildCommand: "bun run build:api",
            startCommand: "bun run start:api",
            healthCheckPath: "/ready",
          },
          network: {
            internalPort: 3000,
            exposureMode: "reverse-proxy",
          },
          env: {
            PUBLIC_APP: "api",
          },
          secrets: {
            DATABASE_URL: {
              from: "resource-secret:DATABASE_URL",
            },
          },
        },
        worker: {
          resource: {
            name: "Acme Worker",
            kind: "worker",
          },
          replicas: 4,
          runtime: {
            strategy: "workspace-commands",
          },
          services: {
            worker: {
              kind: "worker",
              runtime: {
                strategy: "workspace-commands",
                startCommand: "bun run worker",
              },
              network: {
                exposureMode: "none",
              },
              replicas: 4,
            },
          },
        },
      },
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.applications?.api?.resource.name).toBe("Acme API");
      expect(parsed.data.applications?.api?.source?.baseDirectory).toBe("apps/api");
      expect(parsed.data.applications?.api?.network?.internalPort).toBe(3000);
      expect(parsed.data.applications?.worker?.resource.name).toBe("Acme Worker");
      expect(parsed.data.applications?.worker?.replicas).toBe(4);
      expect(parsed.data.applications?.worker?.services?.worker?.replicas).toBe(4);
    }
  });

  test("[CONFIG-FILE-APPLICATION-GRAPH-005] accepts named shared dependency references", () => {
    const parsed = parseAppaloftDeploymentConfig({
      dependencies: {
        database: {
          resourceName: "Acme Shared Postgres",
          kind: "postgres",
          source: "managed",
          bind: { env: "DATABASE_URL" },
        },
      },
      applications: {
        api: {
          resource: { name: "Acme API" },
          dependencies: ["database"],
        },
        site: {
          resource: { name: "Acme Site", kind: "static-site" },
        },
        worker: {
          resource: { name: "Acme Worker", kind: "worker" },
          dependencies: ["database"],
        },
      },
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.dependencies?.database?.resourceName).toBe("Acme Shared Postgres");
      expect(parsed.data.applications?.api?.dependencies).toEqual(["database"]);
      expect(parsed.data.applications?.site?.dependencies).toBeUndefined();
      expect(parsed.data.applications?.worker?.dependencies).toEqual(["database"]);
    }
  });

  test("[CONFIG-FILE-APPLICATION-GRAPH-006] rejects ambiguous application dependency references", () => {
    const undefinedReference = parseAppaloftDeploymentConfig({
      applications: {
        api: {
          resource: { name: "Acme API" },
          dependencies: ["database"],
        },
      },
    });
    expect(undefinedReference.success).toBe(false);
    if (!undefinedReference.success) {
      expect(undefinedReference.error.issues[0]?.path).toEqual([
        "applications",
        "api",
        "dependencies",
        0,
      ]);
    }

    const unnamedSharedDependency = parseAppaloftDeploymentConfig({
      dependencies: {
        database: {
          kind: "postgres",
          source: "managed",
          bind: { env: "DATABASE_URL" },
        },
      },
      applications: {
        api: {
          resource: { name: "Acme API" },
          dependencies: ["database"],
        },
        worker: {
          resource: { name: "Acme Worker" },
          dependencies: ["database"],
        },
      },
    });
    expect(unnamedSharedDependency.success).toBe(false);
    if (!unnamedSharedDependency.success) {
      expect(unnamedSharedDependency.error.issues[0]?.path).toEqual([
        "dependencies",
        "database",
        "resourceName",
      ]);
    }

    const unreferencedDefinition = parseAppaloftDeploymentConfig({
      dependencies: {
        database: {
          resourceName: "Acme Shared Postgres",
          kind: "postgres",
          source: "managed",
          bind: { env: "DATABASE_URL" },
        },
      },
      applications: {
        api: { resource: { name: "Acme API" } },
      },
    });
    expect(unreferencedDefinition.success).toBe(false);
    if (!unreferencedDefinition.success) {
      expect(unreferencedDefinition.error.issues[0]?.path).toEqual(["dependencies", "database"]);
    }

    const duplicateReference = parseAppaloftDeploymentConfig({
      dependencies: {
        database: {
          resourceName: "Acme Shared Postgres",
          kind: "postgres",
          source: "managed",
          bind: { env: "DATABASE_URL" },
        },
      },
      applications: {
        api: {
          resource: { name: "Acme API" },
          dependencies: ["database", "database"],
        },
      },
    });
    expect(duplicateReference.success).toBe(false);
    if (!duplicateReference.success) {
      expect(duplicateReference.error.issues[0]?.path).toEqual([
        "applications",
        "api",
        "dependencies",
        1,
      ]);
    }

    const sharedPreviewDependency = parseAppaloftDeploymentConfig({
      dependencies: {
        database: {
          resourceName: "Acme Shared Postgres",
          kind: "postgres",
          source: "managed",
          bind: { env: "DATABASE_URL" },
          preview: { lifecycle: "ephemeral" },
        },
      },
      applications: {
        api: {
          resource: { name: "Acme API" },
          dependencies: ["database"],
        },
        worker: {
          resource: { name: "Acme Worker" },
          dependencies: ["database"],
        },
      },
    });
    expect(sharedPreviewDependency.success).toBe(false);
    if (!sharedPreviewDependency.success) {
      expect(sharedPreviewDependency.error.issues[0]?.path).toEqual([
        "dependencies",
        "database",
        "preview",
        "lifecycle",
      ]);
    }
  });

  test("[CONFIG-FILE-APPLICATION-GRAPH-002] rejects unsafe application graph declarations", () => {
    const badKey = parseAppaloftDeploymentConfig({
      applications: {
        API: {
          resource: {
            name: "Acme API",
          },
        },
      },
    });
    expect(badKey.success).toBe(false);

    const missingResourceName = parseAppaloftDeploymentConfig({
      applications: {
        api: {
          resource: {},
        },
      },
    });
    expect(missingResourceName.success).toBe(false);

    const identity = parseAppaloftDeploymentConfig({
      applications: {
        api: {
          resource: {
            name: "Acme API",
            resourceId: "res_123",
          },
        },
      },
    });
    expect(identity.success).toBe(false);

    const rawSecret = parseAppaloftDeploymentConfig({
      applications: {
        worker: {
          resource: {
            name: "Acme Worker",
          },
          env: {
            SSH_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----",
          },
        },
      },
    });
    expect(rawSecret.success).toBe(false);

    const unsupportedField = parseAppaloftDeploymentConfig({
      applications: {
        api: {
          resource: {
            name: "Acme API",
          },
          dependencies: {},
        },
      },
    });
    expect(unsupportedField.success).toBe(false);
  });

  test("[CONFIG-FILE-IMAGE-SOURCE-001] accepts prebuilt image source declarations", () => {
    const parsed = parseAppaloftDeploymentConfigText(
      [
        "source:",
        "  type: image",
        "  image: ghcr.io/acme/api:1.7.3",
        "  version: 1.7.3",
        "  versionKind: image-tag",
        "network:",
        "  internalPort: 8080",
      ].join("\n"),
      "appaloft.yaml",
    );

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.source).toEqual({
        type: "image",
        image: "ghcr.io/acme/api:1.7.3",
        version: "1.7.3",
        versionKind: "image-tag",
      });
    }

    const explicitStrategy = parseAppaloftDeploymentConfig({
      source: {
        type: "image",
        image:
          "registry.example.com/acme/api@sha256:8b1a9953c4611296a827abf8c47804d7f6f4e6a6d7f4aaf8f6f5c6e6d7c8b9a0",
      },
      runtime: {
        strategy: "prebuilt-image",
      },
    });

    expect(explicitStrategy.success).toBe(true);
  });

  test("[CONFIG-FILE-IMAGE-SOURCE-002][CONFIG-FILE-IMAGE-SOURCE-005] rejects unsafe image source declarations", () => {
    const gitFields = parseAppaloftDeploymentConfig({
      source: {
        type: "image",
        image: "ghcr.io/acme/api:1.7.3",
        repository: "https://github.com/acme/api",
      },
    });

    expect(gitFields.success).toBe(false);
    if (!gitFields.success) {
      expect(gitFields.error.issues[0]?.message).toContain("config_source_resolution");
    }

    const credentials = parseAppaloftDeploymentConfig({
      source: {
        type: "image",
        image: "https://user:password@registry.example.com/acme/api:1.7.3",
      },
    });

    expect(credentials.success).toBe(false);

    const pullSecret = parseAppaloftDeploymentConfig({
      source: {
        type: "image",
        image: "ghcr.io/acme/api:1.7.3",
        pullSecret: "resource-secret:REGISTRY_TOKEN",
      },
    });

    expect(pullSecret.success).toBe(false);

    const incompatibleStrategy = parseAppaloftDeploymentConfig({
      source: {
        type: "image",
        image: "ghcr.io/acme/api:1.7.3",
      },
      runtime: {
        strategy: "workspace-commands",
      },
    });

    expect(incompatibleStrategy.success).toBe(false);
    if (!incompatibleStrategy.success) {
      expect(incompatibleStrategy.error.issues[0]?.message).toContain(
        "source.type image requires runtime.strategy prebuilt-image",
      );
      expect(incompatibleStrategy.error.issues[0]?.path).toEqual(["runtime", "strategy"]);
    }

    const incompatibleVersionKind = parseAppaloftDeploymentConfig({
      source: {
        type: "image",
        image: "ghcr.io/acme/api:1.7.3",
        version: "main",
        versionKind: "branch",
      },
    });

    expect(incompatibleVersionKind.success).toBe(false);
  });

  test("[CONFIG-FILE-PREVIEW-OVERLAY-001] accepts and applies PR preview profile overlays", () => {
    const parsed = parseAppaloftDeploymentConfig({
      runtime: {
        strategy: "workspace-commands",
        startCommand: "bun run start",
      },
      network: {
        internalPort: 3000,
      },
      env: {
        APP_ENV: "production",
      },
      preview: {
        pullRequest: {
          domainTemplate: "pr-{pr_number}.preview.example.com",
          profile: {
            runtime: {
              name: "preview-{pr_number}",
              start: {
                command: "bun run preview",
              },
            },
            network: {
              internalPort: 3001,
            },
            health: {
              path: "/preview-ready",
            },
            access: {
              generated: {
                enabled: true,
                pathPrefix: "/",
              },
            },
            env: {
              APP_ENV: "preview",
            },
            secrets: {
              APP_SECRET: {
                from: "ci-env:APP_SECRET",
              },
            },
          },
        },
      },
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      const effective = applyAppaloftDeploymentPreviewProfile(parsed.data);
      expect(effective.runtime?.name).toBe("preview-{pr_number}");
      expect(effective.runtime?.start?.command).toBe("bun run preview");
      expect(effective.network?.internalPort).toBe(3001);
      expect(effective.health?.path).toBe("/preview-ready");
      expect(effective.access?.generated?.enabled).toBe(true);
      expect(effective.env?.APP_ENV).toBe("preview");
      expect(effective.secrets?.APP_SECRET?.from).toBe("ci-env:APP_SECRET");
    }
  });

  test("[CONFIG-FILE-PREVIEW-OVERLAY-002] rejects unsafe PR preview overlay fields", () => {
    const parsed = parseAppaloftDeploymentConfig({
      preview: {
        pullRequest: {
          profile: {
            runtime: {
              startCommand: "bun run start",
            },
            projectId: "proj_prod",
          },
        },
      },
    });

    expect(parsed.success).toBe(false);

    const unsafeDomainOverlay = parseAppaloftDeploymentConfig({
      preview: {
        pullRequest: {
          profile: {
            access: {
              domains: [
                {
                  host: "preview.example.com",
                },
              ],
            },
          },
        },
      },
    });

    expect(unsafeDomainOverlay.success).toBe(false);

    const rawSecret = parseAppaloftDeploymentConfig({
      preview: {
        pullRequest: {
          profile: {
            env: {
              DATABASE_URL: "postgres://user:password@example/db",
            },
          },
        },
      },
    });

    expect(rawSecret.success).toBe(false);

    const providerHandle = parseAppaloftDeploymentConfig({
      preview: {
        pullRequest: {
          profile: {
            runtime: {
              startCommand: "bun run start",
            },
            providerAccount: "acct_prod",
          },
        },
      },
    });

    expect(providerHandle.success).toBe(false);

    const lifecycleGraphDelta = parseAppaloftDeploymentConfig({
      preview: {
        pullRequest: {
          profile: {
            storage: {
              data: {
                kind: "volume",
              },
            },
          },
        },
      },
    });

    expect(lifecycleGraphDelta.success).toBe(false);
  });

  test("[CONFIG-FILE-PREVIEW-POLICY-001] accepts product-grade PR preview policy", () => {
    const parsed = parseAppaloftDeploymentConfig({
      preview: {
        pullRequest: {
          policy: {
            sameRepositoryPreviews: true,
            forkPreviews: "without-secrets",
            secretBackedPreviews: false,
            maxActivePreviews: 5,
            previewTtlHours: 72,
            environmentProfileBaseEnvironmentId: "env_staging",
          },
        },
      },
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.preview?.pullRequest?.policy).toEqual({
        sameRepositoryPreviews: true,
        forkPreviews: "without-secrets",
        secretBackedPreviews: false,
        maxActivePreviews: 5,
        previewTtlHours: 72,
        environmentProfileBaseEnvironmentId: "env_staging",
      });
    }

    const defaults = parseAppaloftDeploymentConfig({
      preview: {
        pullRequest: {
          policy: {},
        },
      },
    });

    expect(defaults.success).toBe(true);
    if (defaults.success) {
      expect(defaults.data.preview?.pullRequest?.policy).toEqual({
        sameRepositoryPreviews: true,
        forkPreviews: "disabled",
        secretBackedPreviews: true,
      });
    }
  });

  test("[CONFIG-FILE-PREVIEW-POLICY-002] rejects unsafe PR preview policy fields", () => {
    const unknown = parseAppaloftDeploymentConfig({
      preview: {
        pullRequest: {
          policy: {
            sameRepositoryPreviews: true,
            providerInstallationId: "inst_123",
          },
        },
      },
    });

    expect(unknown.success).toBe(false);
    if (!unknown.success) {
      expect(unknown.error.issues[0]?.path).toEqual(["preview", "pullRequest", "policy"]);
    }

    const rawSecret = parseAppaloftDeploymentConfig({
      preview: {
        pullRequest: {
          policy: {
            webhookSecret: "plain-secret-value",
          },
        },
      },
    });

    expect(rawSecret.success).toBe(false);
    if (!rawSecret.success) {
      expect(rawSecret.error.issues[0]?.message).toContain("raw_secret_config_field");
      expect(rawSecret.error.issues[0]?.path).toEqual([
        "preview",
        "pullRequest",
        "policy",
        "webhookSecret",
      ]);
    }

    const invalidTtl = parseAppaloftDeploymentConfig({
      preview: {
        pullRequest: {
          policy: {
            previewTtlHours: 0,
          },
        },
      },
    });

    expect(invalidTtl.success).toBe(false);
  });

  test("[CONFIG-FILE-NAMED-PROFILE-001] accepts and applies named config profile overlays", () => {
    const parsed = parseAppaloftDeploymentConfig({
      runtime: {
        strategy: "workspace-commands",
        startCommand: "bun run start",
      },
      network: {
        internalPort: 3000,
      },
      env: {
        APP_ENV: "production",
      },
      profiles: {
        staging: {
          runtime: {
            start: {
              command: "bun run start:staging",
            },
          },
          network: {
            internalPort: 3001,
          },
          health: {
            path: "/staging-ready",
          },
          access: {
            generated: {
              enabled: true,
              pathPrefix: "/",
            },
          },
          monitoring: {
            thresholds: {
              rules: [
                {
                  signal: "cpu",
                  metric: "containerCpuPercent",
                  warning: 70,
                },
              ],
            },
          },
          env: {
            APP_ENV: "staging",
          },
          secrets: {
            APP_SECRET: {
              from: "ci-env:APP_SECRET",
            },
          },
        },
      },
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      const effective = applyAppaloftDeploymentConfigProfile(parsed.data, "staging");
      expect(effective.isOk()).toBe(true);
      if (effective.isOk()) {
        expect(effective.value.runtime?.start?.command).toBe("bun run start:staging");
        expect(effective.value.network?.internalPort).toBe(3001);
        expect(effective.value.health?.path).toBe("/staging-ready");
        expect(effective.value.access?.generated?.enabled).toBe(true);
        expect(effective.value.monitoring?.thresholds?.rules[0]?.warning).toBe(70);
        expect(effective.value.env?.APP_ENV).toBe("staging");
        expect(effective.value.secrets?.APP_SECRET?.from).toBe("ci-env:APP_SECRET");
      }
    }
  });

  test("[CONFIG-FILE-NAMED-PROFILE-002] rejects unsafe named config profile fields", () => {
    const providerHandle = parseAppaloftDeploymentConfig({
      profiles: {
        staging: {
          runtime: {
            startCommand: "bun run start",
          },
          providerAccount: "acct_prod",
        },
      },
    });

    expect(providerHandle.success).toBe(false);

    const rawSecret = parseAppaloftDeploymentConfig({
      profiles: {
        staging: {
          env: {
            DATABASE_URL: "postgres://user:password@example/db",
          },
        },
      },
    });

    expect(rawSecret.success).toBe(false);

    const lifecycleGraphDelta = parseAppaloftDeploymentConfig({
      profiles: {
        staging: {
          dependencies: {
            db: {
              kind: "postgres",
            },
          },
        },
      },
    });

    expect(lifecycleGraphDelta.success).toBe(false);

    const unsupportedSizing = parseAppaloftDeploymentConfig({
      profiles: {
        staging: {
          cpu: "500m",
        },
      },
    });

    expect(unsupportedSizing.success).toBe(false);
  });

  test("[CONFIG-FILE-DEPENDENCY-001] accepts managed Postgres dependency declarations", () => {
    const parsed = parseAppaloftDeploymentConfigText(
      [
        "source:",
        "  type: git",
        "  repository: https://github.com/acme/api",
        "runtime:",
        "  type: node",
        "  build:",
        "    command: bun install && bun run build",
        "  start:",
        "    command: bun run start",
        "dependencies:",
        "  db:",
        "    kind: postgres",
        "    source: managed",
        "    bind:",
        "      env: DATABASE_URL",
        "    backup:",
        "      enabled: true",
        "      intervalHours: 24",
        "      retentionDays: 7",
        "      retryOnFailure: true",
        "    preview:",
        "      lifecycle: ephemeral",
      ].join("\n"),
      "appaloft.yaml",
    );

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.source?.repository).toBe("https://github.com/acme/api");
      expect(parsed.data.runtime?.type).toBe("node");
      expect(parsed.data.runtime?.build?.command).toBe("bun install && bun run build");
      expect(parsed.data.runtime?.start?.command).toBe("bun run start");
      expect(parsed.data.dependencies?.db).toEqual({
        kind: "postgres",
        source: "managed",
        bind: {
          env: "DATABASE_URL",
        },
        backup: {
          enabled: true,
          intervalHours: 24,
          retentionDays: 7,
          retryOnFailure: true,
        },
        preview: {
          lifecycle: "ephemeral",
        },
      });
    }
  });

  test("[CONFIG-FILE-DEPENDENCY-010] accepts canonical managed dependency kinds", () => {
    const parsed = parseAppaloftDeploymentConfig({
      dependencies: Object.fromEntries(
        appaloftDeploymentDependencyKinds.map((kind) => [
          kind.replaceAll("-", "_"),
          {
            kind,
            source: "managed",
            bind: {
              env: `${kind.replaceAll("-", "_").toUpperCase()}_URL`,
            },
          },
        ]),
      ),
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.dependencies?.redis?.kind).toBe("redis");
      expect(parsed.data.dependencies?.object_storage?.kind).toBe("object-storage");
      expect(parsed.data.dependencies?.opensearch?.bind.env).toBe("OPENSEARCH_URL");
    }
  });

  test("[CONFIG-FILE-DEPENDENCY-BACKUP-001] accepts managed dependency backup policy declarations", () => {
    const parsed = parseAppaloftDeploymentConfig({
      dependencies: {
        db: {
          kind: "postgres",
          source: "managed",
          bind: {
            env: "DATABASE_URL",
          },
          backup: {
            intervalHours: 24,
            retentionDays: 7,
          },
        },
        cache: {
          kind: "redis",
          source: "managed",
          bind: {
            env: "REDIS_URL",
          },
          backup: {
            enabled: false,
          },
        },
      },
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.dependencies?.db.backup).toEqual({
        enabled: true,
        intervalHours: 24,
        retentionDays: 7,
        retryOnFailure: true,
      });
      expect(parsed.data.dependencies?.cache.backup).toEqual({
        enabled: false,
        retryOnFailure: true,
      });
    }
  });

  test("[CONFIG-FILE-DEPENDENCY-002] rejects unknown dependency fields", () => {
    const parsed = parseAppaloftDeploymentConfig({
      dependencies: {
        db: {
          kind: "postgres",
          source: "managed",
          bind: {
            env: "DATABASE_URL",
          },
          plan: "starter",
        },
      },
    });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.path).toEqual(["dependencies", "db"]);
    }
  });

  test("[CONFIG-FILE-DEPENDENCY-003] rejects dependency identity and secret material", () => {
    const identity = parseAppaloftDeploymentConfig({
      dependencies: {
        db: {
          kind: "postgres",
          source: "managed",
          bind: {
            env: "DATABASE_URL",
          },
          providerAccount: "acct_prod",
        },
      },
    });

    expect(identity.success).toBe(false);
    if (!identity.success) {
      expect(identity.error.issues[0]?.message).toContain("config_identity_field");
      expect(identity.error.issues[0]?.path).toEqual(["dependencies", "db", "providerAccount"]);
    }

    const rawConnection = parseAppaloftDeploymentConfig({
      dependencies: {
        db: {
          kind: "postgres",
          source: "managed",
          bind: {
            env: "DATABASE_URL",
          },
          connectionString: "postgres://user:password@example.test/app",
        },
      },
    });

    expect(rawConnection.success).toBe(false);
    if (!rawConnection.success) {
      expect(rawConnection.error.issues[0]?.message).toContain("raw_secret_config_field");
      expect(rawConnection.error.issues[0]?.path).toEqual([
        "dependencies",
        "db",
        "connectionString",
      ]);
    }
  });

  test("[CONFIG-FILE-DEPENDENCY-BACKUP-002] rejects unknown and unsafe dependency backup policy material", () => {
    const unknown = parseAppaloftDeploymentConfig({
      dependencies: {
        db: {
          kind: "postgres",
          source: "managed",
          bind: {
            env: "DATABASE_URL",
          },
          backup: {
            intervalHours: 24,
            retentionDays: 7,
            schedule: "0 3 * * *",
          },
        },
      },
    });

    expect(unknown.success).toBe(false);
    if (!unknown.success) {
      expect(unknown.error.issues[0]?.path).toEqual(["dependencies", "db", "backup"]);
    }

    const identity = parseAppaloftDeploymentConfig({
      dependencies: {
        db: {
          kind: "postgres",
          source: "managed",
          bind: {
            env: "DATABASE_URL",
          },
          backup: {
            intervalHours: 24,
            retentionDays: 7,
            policyId: "dbp_manual",
          },
        },
      },
    });

    expect(identity.success).toBe(false);
    if (!identity.success) {
      expect(identity.error.issues[0]?.message).toContain("config_identity_field");
      expect(identity.error.issues[0]?.path).toEqual(["dependencies", "db", "backup", "policyId"]);
    }

    const rawSecret = parseAppaloftDeploymentConfig({
      dependencies: {
        db: {
          kind: "postgres",
          source: "managed",
          bind: {
            env: "DATABASE_URL",
          },
          backup: {
            intervalHours: 24,
            retentionDays: 7,
            artifactPath: "s3://secret-token@bucket/db.dump",
          },
        },
      },
    });

    expect(rawSecret.success).toBe(false);

    const missingRequired = parseAppaloftDeploymentConfig({
      dependencies: {
        db: {
          kind: "postgres",
          source: "managed",
          bind: {
            env: "DATABASE_URL",
          },
          backup: {
            enabled: true,
            retentionDays: 7,
          },
        },
      },
    });

    expect(missingRequired.success).toBe(false);
    if (!missingRequired.success) {
      expect(missingRequired.error.issues[0]?.path).toEqual([
        "dependencies",
        "db",
        "backup",
        "intervalHours",
      ]);
    }
  });

  test("[CONFIG-FILE-STORAGE-001] accepts managed storage volume declarations", () => {
    const parsed = parseAppaloftDeploymentConfigText(
      [
        "runtime:",
        "  strategy: workspace-commands",
        "storage:",
        "  uploads:",
        "    kind: volume",
        "    source: managed",
        "    mount:",
        "      path: /app/uploads",
        "      mode: read-only",
        "    preview:",
        "      lifecycle: ephemeral",
      ].join("\n"),
      "appaloft.yaml",
    );

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.storage?.uploads).toEqual({
        kind: "volume",
        source: "managed",
        mount: {
          path: "/app/uploads",
          mode: "read-only",
        },
        preview: {
          lifecycle: "ephemeral",
        },
      });
    }
  });

  test("[CONFIG-FILE-STORAGE-002] rejects unknown storage fields and unsafe mount paths", () => {
    const unknown = parseAppaloftDeploymentConfig({
      storage: {
        uploads: {
          kind: "volume",
          source: "managed",
          mount: {
            path: "/app/uploads",
          },
          size: "10Gi",
        },
      },
    });

    expect(unknown.success).toBe(false);
    if (!unknown.success) {
      expect(unknown.error.issues[0]?.path).toEqual(["storage", "uploads"]);
    }

    for (const path of ["/", "../uploads", "/app/../uploads", "https://example.com/uploads"]) {
      const parsed = parseAppaloftDeploymentConfig({
        storage: {
          uploads: {
            kind: "volume",
            source: "managed",
            mount: {
              path,
            },
          },
        },
      });

      expect(parsed.success, path).toBe(false);
    }
  });

  test("[CONFIG-FILE-STORAGE-003] rejects storage identity and host/source path material", () => {
    const identity = parseAppaloftDeploymentConfig({
      storage: {
        uploads: {
          kind: "volume",
          source: "managed",
          mount: {
            path: "/app/uploads",
          },
          providerAccount: "acct_prod",
        },
      },
    });

    expect(identity.success).toBe(false);
    if (!identity.success) {
      expect(identity.error.issues[0]?.message).toContain("config_identity_field");
      expect(identity.error.issues[0]?.path).toEqual(["storage", "uploads", "providerAccount"]);
    }

    const hostPath = parseAppaloftDeploymentConfig({
      storage: {
        uploads: {
          kind: "volume",
          source: "managed",
          mount: {
            path: "/app/uploads",
          },
          sourcePath: "/var/lib/app/uploads",
        },
      },
    });

    expect(hostPath.success).toBe(false);
  });

  test("[CONFIG-FILE-SCHED-TASK-001] accepts scheduled task declarations", () => {
    const parsed = parseAppaloftDeploymentConfigText(
      [
        "scheduledTasks:",
        "  nightly_sync:",
        '    schedule: "0 3 * * *"',
        "    timezone: UTC",
        "    command: bun run sync",
        "    timeoutSeconds: 600",
        "    retryLimit: 2",
        "    preview:",
        "      lifecycle: ephemeral",
        "  cache_warm:",
        '    schedule: "@hourly"',
        "    command: bun run cache:warm",
      ].join("\n"),
      "appaloft.yaml",
    );

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.scheduledTasks?.nightly_sync).toEqual({
        schedule: "0 3 * * *",
        timezone: "UTC",
        command: "bun run sync",
        timeoutSeconds: 600,
        retryLimit: 2,
        concurrencyPolicy: "forbid",
        status: "enabled",
        preview: {
          lifecycle: "ephemeral",
        },
      });
      expect(parsed.data.scheduledTasks?.cache_warm).toEqual({
        schedule: "@hourly",
        timezone: "UTC",
        command: "bun run cache:warm",
        timeoutSeconds: 3600,
        retryLimit: 0,
        concurrencyPolicy: "forbid",
        status: "enabled",
      });
    }
  });

  test("[CONFIG-FILE-SCHED-TASK-002] rejects unknown scheduled task fields", () => {
    const parsed = parseAppaloftDeploymentConfig({
      scheduledTasks: {
        nightly_sync: {
          schedule: "0 3 * * *",
          command: "bun run sync",
          providerScheduleHandle: "cron-123",
        },
      },
    });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.path).toEqual(["scheduledTasks", "nightly_sync"]);
    }
  });

  test("[CONFIG-FILE-SCHED-TASK-003] rejects scheduled task identity and secret material", () => {
    const identity = parseAppaloftDeploymentConfig({
      scheduledTasks: {
        nightly_sync: {
          schedule: "0 3 * * *",
          command: "bun run sync",
          providerAccount: "acct_prod",
        },
      },
    });

    expect(identity.success).toBe(false);
    if (!identity.success) {
      expect(identity.error.issues[0]?.message).toContain("config_identity_field");
      expect(identity.error.issues[0]?.path).toEqual([
        "scheduledTasks",
        "nightly_sync",
        "providerAccount",
      ]);
    }

    const credentialUrl = parseAppaloftDeploymentConfig({
      scheduledTasks: {
        nightly_sync: {
          schedule: "0 3 * * *",
          command: "psql postgres://app:secret@example.test/app -c 'select 1'",
        },
      },
    });

    expect(credentialUrl.success).toBe(false);
    if (!credentialUrl.success) {
      expect(credentialUrl.error.issues[0]?.path).toEqual([
        "scheduledTasks",
        "nightly_sync",
        "command",
      ]);
    }
  });

  test("[CONFIG-FILE-AUTO-DEPLOY-001] accepts git-push auto-deploy policy", () => {
    const parsed = parseAppaloftDeploymentConfigText(
      [
        "autoDeploy:",
        "  enabled: true",
        "  trigger: git-push",
        "  refs:",
        "    - main",
        "    - refs/tags/v1.0.0",
        "  events:",
        "    - push",
        "    - tag",
        "  includePaths:",
        "    - apps/web/**",
        "  excludePaths:",
        "    - apps/web/docs/**",
        "  dedupeWindowSeconds: 300",
      ].join("\n"),
      "appaloft.yaml",
    );

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.autoDeploy).toEqual({
        enabled: true,
        trigger: "git-push",
        refs: ["main", "refs/tags/v1.0.0"],
        events: ["push", "tag"],
        includePaths: ["apps/web/**"],
        excludePaths: ["apps/web/docs/**"],
        dedupeWindowSeconds: 300,
      });
    }

    const disabled = parseAppaloftDeploymentConfig({
      autoDeploy: {
        enabled: false,
      },
    });

    expect(disabled.success).toBe(true);
    if (disabled.success) {
      expect(disabled.data.autoDeploy).toEqual({
        enabled: false,
        trigger: "git-push",
        events: ["push"],
      });
    }
  });

  test("[CONFIG-FILE-AUTO-DEPLOY-002] rejects unknown auto-deploy fields and unsafe material", () => {
    const unknown = parseAppaloftDeploymentConfig({
      autoDeploy: {
        enabled: true,
        trigger: "git-push",
        refs: ["main"],
        providerWebhookId: "hook_123",
      },
    });

    expect(unknown.success).toBe(false);
    if (!unknown.success) {
      expect(unknown.error.issues[0]?.path).toEqual(["autoDeploy"]);
    }

    const identity = parseAppaloftDeploymentConfig({
      autoDeploy: {
        enabled: true,
        trigger: "git-push",
        refs: ["main"],
        sourceEventId: "src_evt_123",
      },
    });

    expect(identity.success).toBe(false);
    if (!identity.success) {
      expect(identity.error.issues[0]?.message).toContain("config_identity_field");
      expect(identity.error.issues[0]?.path).toEqual(["autoDeploy", "sourceEventId"]);
    }

    const secret = parseAppaloftDeploymentConfig({
      autoDeploy: {
        enabled: true,
        trigger: "git-push",
        refs: ["main"],
        webhookSecret: "plain-secret-value",
      },
    });

    expect(secret.success).toBe(false);
    if (!secret.success) {
      expect(secret.error.issues[0]?.message).toContain("raw_secret_config_field");
      expect(secret.error.issues[0]?.path).toEqual(["autoDeploy", "webhookSecret"]);
    }

    const missingRefs = parseAppaloftDeploymentConfig({
      autoDeploy: {
        enabled: true,
        trigger: "git-push",
      },
    });

    expect(missingRefs.success).toBe(false);
    if (!missingRefs.success) {
      expect(missingRefs.error.issues[0]?.path).toEqual(["autoDeploy", "refs"]);
    }
  });

  test("[CONFIG-FILE-GENERATED-ACCESS-001] accepts generated access profile declarations", () => {
    const parsed = parseAppaloftDeploymentConfigText(
      ["access:", "  generated:", "    enabled: true", "    pathPrefix: /app"].join("\n"),
      "appaloft.yaml",
    );

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.access?.generated).toEqual({
        enabled: true,
        pathPrefix: "/app",
      });
    }

    const defaults = parseAppaloftDeploymentConfig({
      access: {
        generated: {},
      },
    });

    expect(defaults.success).toBe(true);
    if (defaults.success) {
      expect(defaults.data.access?.generated).toEqual({
        enabled: true,
        pathPrefix: "/",
      });
    }
  });

  test("[CONFIG-FILE-GENERATED-ACCESS-002] rejects unknown and unsafe generated access fields", () => {
    const unknown = parseAppaloftDeploymentConfig({
      access: {
        generated: {
          enabled: true,
          providerMode: "sslip",
        },
      },
    });

    expect(unknown.success).toBe(false);
    if (!unknown.success) {
      expect(unknown.error.issues[0]?.path).toEqual(["access", "generated"]);
    }

    const identity = parseAppaloftDeploymentConfig({
      access: {
        generated: {
          enabled: true,
          routeId: "route_123",
        },
      },
    });

    expect(identity.success).toBe(false);
    if (!identity.success) {
      expect(identity.error.issues[0]?.message).toContain("config_identity_field");
      expect(identity.error.issues[0]?.path).toEqual(["access", "generated", "routeId"]);
    }

    const unsafePath = parseAppaloftDeploymentConfig({
      access: {
        generated: {
          enabled: true,
          pathPrefix: "https://example.com/app",
        },
      },
    });

    expect(unsafePath.success).toBe(false);
    if (!unsafePath.success) {
      expect(unsafePath.error.issues[0]?.path).toEqual(["access", "generated", "pathPrefix"]);
    }

    const rawCertificate = parseAppaloftDeploymentConfig({
      access: {
        generated: {
          enabled: true,
          certificate: "-----BEGIN CERTIFICATE-----\\nabc\\n-----END CERTIFICATE-----",
        },
      },
    });

    expect(rawCertificate.success).toBe(false);
    if (!rawCertificate.success) {
      expect(rawCertificate.error.issues[0]?.message).toContain("raw_secret_config_field");
      expect(rawCertificate.error.issues[0]?.path).toEqual(["access", "generated", "certificate"]);
    }
  });

  test("[CONFIG-FILE-MONITORING-THRESHOLDS-001] accepts runtime monitoring thresholds", () => {
    const parsed = parseAppaloftDeploymentConfigText(
      [
        "monitoring:",
        "  thresholds:",
        "    enabled: true",
        "    rules:",
        "      - signal: cpu",
        "        metric: containerCpuPercent",
        "        warning: 70",
        "        critical: 90",
      ].join("\n"),
      "appaloft.yaml",
    );

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.monitoring?.thresholds).toEqual({
        enabled: true,
        rules: [
          {
            signal: "cpu",
            metric: "containerCpuPercent",
            warning: 70,
            critical: 90,
            comparator: "greater-than-or-equal",
          },
        ],
      });
    }
  });

  test("[CONFIG-FILE-MONITORING-THRESHOLDS-002] rejects unknown and unsafe monitoring threshold fields", () => {
    const identity = parseAppaloftDeploymentConfig({
      monitoring: {
        thresholds: {
          policyId: "rmtp_123",
          rules: [
            {
              signal: "cpu",
              metric: "containerCpuPercent",
              warning: 70,
            },
          ],
        },
      },
    });

    expect(identity.success).toBe(false);
    if (!identity.success) {
      expect(identity.error.issues[0]?.message).toContain("config_identity_field");
      expect(identity.error.issues[0]?.path).toEqual(["monitoring", "thresholds", "policyId"]);
    }

    const metricMismatch = parseAppaloftDeploymentConfig({
      monitoring: {
        thresholds: {
          rules: [
            {
              signal: "cpu",
              metric: "usedBytes",
              warning: 70,
            },
          ],
        },
      },
    });

    expect(metricMismatch.success).toBe(false);
    if (!metricMismatch.success) {
      expect(metricMismatch.error.issues[0]?.path).toEqual([
        "monitoring",
        "thresholds",
        "rules",
        0,
        "metric",
      ]);
    }

    const rawPayload = parseAppaloftDeploymentConfig({
      monitoring: {
        thresholds: {
          rawPayload: '{"token":"secret"}',
          rules: [
            {
              signal: "cpu",
              metric: "containerCpuPercent",
              warning: 70,
            },
          ],
        },
      },
    });

    expect(rawPayload.success).toBe(false);
    if (!rawPayload.success) {
      expect(rawPayload.error.issues[0]?.message).toContain("unsupported_config_field");
      expect(rawPayload.error.issues[0]?.path).toEqual(["monitoring", "thresholds", "rawPayload"]);
    }

    const missingBoundary = parseAppaloftDeploymentConfig({
      monitoring: {
        thresholds: {
          rules: [
            {
              signal: "cpu",
              metric: "containerCpuPercent",
            },
          ],
        },
      },
    });

    expect(missingBoundary.success).toBe(false);
    if (!missingBoundary.success) {
      expect(missingBoundary.error.issues[0]?.path).toEqual([
        "monitoring",
        "thresholds",
        "rules",
        0,
        "warning",
      ]);
    }
  });

  test("[CONFIG-FILE-DISC-001] declares JSON and YAML config discovery names", () => {
    expect(appaloftDeploymentConfigFileNames).toContain("appaloft.json");
    expect(appaloftDeploymentConfigFileNames).toContain("appaloft.yml");
    expect(appaloftDeploymentConfigFileNames).toContain("appaloft.yaml");
  });

  test("[CONTROL-PLANE-MODE-010] accepts non-secret control-plane connection policy", () => {
    const parsed = parseAppaloftDeploymentConfigText(
      [
        "controlPlane:",
        "  mode: self-hosted",
        "  url: https://console.example.com/",
        "  deploymentContext:",
        "    projectId: prj_www",
        "    environmentId: env_prod",
        "    resourceId: res_www",
        "    serverId: srv_console",
        "runtime:",
        "  strategy: static",
      ].join("\n"),
      "appaloft.yml",
    );

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.controlPlane).toEqual({
        mode: "self-hosted",
        url: "https://console.example.com",
        deploymentContext: {
          projectId: "prj_www",
          environmentId: "env_prod",
          resourceId: "res_www",
          serverId: "srv_console",
        },
      });
    }
  });

  test("[CONTROL-PLANE-INSTALL-003] accepts non-secret control-plane install config", () => {
    const parsed = parseAppaloftDeploymentConfigText(
      [
        "controlPlane:",
        "  mode: self-hosted",
        "  url: https://console.example.com",
        "  install:",
        "    database: pglite",
        "    orchestrator: swarm",
        "    proxy: traefik",
        "    httpPort: 3721",
        "    swarmStackName: appaloft-console",
        "    swarmInit: true",
        "    skipDockerInstall: true",
        "    installerUrl: https://github.com/appaloft/appaloft/releases/latest/download/install.sh",
      ].join("\n"),
      "appaloft.yml",
    );

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.controlPlane?.install).toEqual({
        database: "pglite",
        orchestrator: "swarm",
        proxy: "traefik",
        httpPort: 3721,
        swarmStackName: "appaloft-console",
        swarmInit: true,
        skipDockerInstall: true,
        installerUrl: "https://github.com/appaloft/appaloft/releases/latest/download/install.sh",
      });
    }
  });

  test("[CONTROL-PLANE-MODE-011] rejects unsupported control-plane identity and secret fields", () => {
    const identity = parseAppaloftDeploymentConfig({
      controlPlane: {
        mode: "self-hosted",
        url: "https://console.example.com",
        projectId: "prj_1",
      },
    });

    expect(identity.success).toBe(false);
    if (!identity.success) {
      expect(identity.error.issues[0]?.message).toContain("config_identity_field");
      expect(identity.error.issues[0]?.path).toEqual(["controlPlane", "projectId"]);
    }

    const token = parseAppaloftDeploymentConfig({
      controlPlane: {
        mode: "self-hosted",
        url: "https://console.example.com",
        token: "secret-token",
      },
    });

    expect(token.success).toBe(false);
    if (!token.success) {
      expect(token.error.issues[0]?.message).toContain("raw_secret_config_field");
      expect(token.error.issues[0]?.path).toEqual(["controlPlane", "token"]);
    }
  });

  test("[CONTROL-PLANE-MODE-012] rejects unsafe control-plane URL shapes", () => {
    for (const url of [
      "ssh://console.example.com",
      "https://user:pass@console.example.com",
      "https://console.example.com/api",
      "https://console.example.com?token=secret",
      "https://console.example.com#fragment",
    ]) {
      const parsed = parseAppaloftDeploymentConfig({
        controlPlane: {
          mode: "self-hosted",
          url,
        },
      });

      expect(parsed.success, url).toBe(false);
    }
  });

  test("[CONFIG-FILE-PROFILE-001A] accepts runtime.name templates and renders preview values", () => {
    const parsed = parseAppaloftDeploymentConfig({
      runtime: {
        name: "preview-{pr_number}",
      },
    });

    expect(parsed.success).toBe(true);
    if (!parsed.success) {
      throw new Error("Expected runtime name template to parse");
    }

    const rendered = renderAppaloftDeploymentRuntimeNameTemplate({
      template: parsed.data.runtime?.name ?? "",
      context: {
        pr_number: 123,
      },
    });

    expect(rendered.isOk()).toBe(true);
    if (rendered.isErr()) {
      throw new Error(rendered.error.message);
    }
    expect(rendered.value).toBe("preview-123");
  });

  test("[CONFIG-FILE-PROFILE-001AA] renders preview_id runtime.name templates", () => {
    const parsed = parseAppaloftDeploymentConfig({
      runtime: {
        name: "container-{preview_id}",
      },
    });

    expect(parsed.success).toBe(true);
    if (!parsed.success) {
      throw new Error("Expected runtime name template to parse");
    }

    const rendered = renderAppaloftDeploymentRuntimeNameTemplate({
      template: parsed.data.runtime?.name ?? "",
      context: {
        preview_id: "pr-123",
      },
    });

    expect(rendered.isOk()).toBe(true);
    if (rendered.isErr()) {
      throw new Error(rendered.error.message);
    }
    expect(rendered.value).toBe("container-pr-123");
  });

  test("[CONFIG-FILE-PROFILE-001B] rejects unknown runtime.name template variables", () => {
    const parsed = parseAppaloftDeploymentConfig({
      runtime: {
        name: "preview-{branch}",
      },
    });

    expect(parsed.success).toBe(false);
  });

  test("[CONFIG-FILE-PROFILE-001C] rejects legacy camelCase runtime.name template variables", () => {
    const parsed = parseAppaloftDeploymentConfig({
      runtime: {
        name: "preview-{prNumber}",
      },
    });

    expect(parsed.success).toBe(false);
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
          from: "resource-secret:DATABASE_URL",
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

    const tokenAuthMethod = parseAppaloftDeploymentConfig({
      env: {
        APPALOFT_CLOUD_CONNECTOR_CLOUDFLARE_DNS_OAUTH_TOKEN_AUTH_METHOD: "client_secret_post",
      },
    });

    expect(tokenAuthMethod.success).toBe(true);

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

  test("[SWARM-TARGET-ADM-001] rejects Swarm target fields from repository config", () => {
    const parsed = parseAppaloftDeploymentConfig({
      runtime: {
        strategy: "dockerfile",
      },
      swarm: {
        stack: "web",
        service: "api",
        replicas: 3,
        updatePolicy: "start-first",
        registrySecret: "resource-secret:REGISTRY_TOKEN",
      },
    });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.message).toContain("unsupported_config_field");
      expect(parsed.error.issues[0]?.path).toEqual(["swarm"]);
    }

    const nested = parseAppaloftDeploymentConfig({
      runtime: {
        strategy: "dockerfile",
        replicas: 3,
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
        dockerfilePath: "deploy/Dockerfile",
        dockerComposeFilePath: "deploy/compose.yaml",
        buildTarget: "runner",
      },
    });

    expect(safePath.success).toBe(true);
    if (safePath.success) {
      expect(safePath.data.runtime?.dockerfilePath).toBe("deploy/Dockerfile");
      expect(safePath.data.runtime?.dockerComposeFilePath).toBe("deploy/compose.yaml");
      expect(safePath.data.runtime?.buildTarget).toBe("runner");
    }
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
            pathHandling: "strip",
            tlsMode: "disabled",
            targetServiceName: "api",
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
          pathHandling: "preserve",
          tlsMode: "auto",
        },
        {
          host: "api.example.com",
          pathPrefix: "/api",
          pathHandling: "strip",
          tlsMode: "disabled",
          targetServiceName: "api",
        },
      ]);
    }
  });

  test("[CONFIG-FILE-DOMAIN-010] accepts distinct path routes on one host and rejects an exact duplicate", () => {
    const distinctRoutes = parseAppaloftDeploymentConfig({
      access: {
        domains: [
          { host: "app.example.com", pathPrefix: "/api" },
          { host: "app.example.com", pathPrefix: "/v1" },
        ],
      },
    });

    expect(distinctRoutes.success).toBe(true);

    const duplicateRoute = parseAppaloftDeploymentConfig({
      access: {
        domains: [
          { host: "app.example.com", pathPrefix: "/api" },
          { host: "APP.EXAMPLE.COM", pathPrefix: "/api" },
        ],
      },
    });

    expect(duplicateRoute.success).toBe(false);
    if (!duplicateRoute.success) {
      expect(duplicateRoute.error.issues[0]?.message).toContain(
        "duplicate host and pathPrefix routes",
      );
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

  test("[CONFIG-FILE-DOMAIN-007] accepts canonical redirect config", () => {
    const parsed = parseAppaloftDeploymentConfig({
      access: {
        domains: [
          {
            host: "Example.COM",
            pathPrefix: "/",
            tlsMode: "auto",
          },
          {
            host: "WWW.Example.COM",
            redirectTo: "Example.COM",
            redirectStatus: 308,
          },
        ],
      },
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.access?.domains).toEqual([
        {
          host: "example.com",
          pathPrefix: "/",
          pathHandling: "preserve",
          tlsMode: "auto",
        },
        {
          host: "www.example.com",
          pathPrefix: "/",
          pathHandling: "preserve",
          tlsMode: "auto",
          redirectTo: "example.com",
          redirectStatus: 308,
        },
      ]);
    }
  });

  test("[CONFIG-FILE-DOMAIN-008] rejects invalid canonical redirect graph", () => {
    const cases = [
      {
        name: "self redirect",
        domains: [
          {
            host: "www.example.com",
            redirectTo: "www.example.com",
          },
        ],
      },
      {
        name: "missing target",
        domains: [
          {
            host: "www.example.com",
            redirectTo: "example.com",
          },
        ],
      },
      {
        name: "redirect-to-redirect",
        domains: [
          {
            host: "example.com",
          },
          {
            host: "www.example.com",
            redirectTo: "example.com",
          },
          {
            host: "legacy.example.com",
            redirectTo: "www.example.com",
          },
        ],
      },
      {
        name: "loop",
        domains: [
          {
            host: "www.example.com",
            redirectTo: "example.com",
          },
          {
            host: "example.com",
            redirectTo: "www.example.com",
          },
        ],
      },
      {
        name: "path-level loop hidden by unrelated served routes",
        domains: [
          { host: "a.example.com", pathPrefix: "/api" },
          { host: "b.example.com", pathPrefix: "/api" },
          {
            host: "a.example.com",
            pathPrefix: "/legacy",
            redirectTo: "b.example.com",
          },
          {
            host: "b.example.com",
            pathPrefix: "/legacy",
            redirectTo: "a.example.com",
          },
        ],
      },
      {
        name: "path-level loop hidden by a trailing slash prefix",
        domains: [
          { host: "a.example.com", pathPrefix: "/" },
          { host: "b.example.com", pathPrefix: "/" },
          {
            host: "a.example.com",
            pathPrefix: "/api/",
            redirectTo: "b.example.com",
          },
          {
            host: "b.example.com",
            pathPrefix: "/api/legacy",
            redirectTo: "a.example.com",
          },
        ],
      },
      {
        name: "redirect target only serves a trailing-slash descendant",
        domains: [
          {
            host: "a.example.com",
            pathPrefix: "/api",
            redirectTo: "b.example.com",
          },
          { host: "b.example.com", pathPrefix: "/api/" },
        ],
      },
    ];

    for (const entry of cases) {
      const parsed = parseAppaloftDeploymentConfig({
        access: {
          domains: entry.domains,
        },
      });

      expect(parsed.success, entry.name).toBe(false);
      if (!parsed.success) {
        expect(parsed.error.issues[0]?.message).toContain("config_domain_resolution");
        expect(parsed.error.issues[0]?.path).toEqual(["access", "domains"]);
      }
    }
  });
});
