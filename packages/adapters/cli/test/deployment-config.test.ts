import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type Command as AppCommand,
  type Query as AppQuery,
  type CommandBus,
  type ExecutionContextFactory,
  type QueryBus,
} from "@appaloft/application";
import { domainError, err, ok } from "@appaloft/core";
import { Effect, Either, Layer } from "effect";
import { resolveDeploymentStateBackend } from "../src/commands/deployment-state";

function ensureReflectMetadata(): void {
  const reflectObject = Reflect as typeof Reflect & {
    defineMetadata?: (...args: unknown[]) => void;
    getMetadata?: (...args: unknown[]) => unknown;
    getOwnMetadata?: (...args: unknown[]) => unknown;
    hasMetadata?: (...args: unknown[]) => boolean;
    metadata?: (_metadataKey: unknown, _metadataValue: unknown) => ClassDecorator;
  };

  reflectObject.defineMetadata ??= () => {};
  reflectObject.getMetadata ??= () => undefined;
  reflectObject.getOwnMetadata ??= () => undefined;
  reflectObject.hasMetadata ??= () => false;
  reflectObject.metadata ??= () => () => {};
}

async function withMutedProcessOutput<T>(callback: () => Promise<T>): Promise<T> {
  const writeStdout = process.stdout.write;
  const writeStderr = process.stderr.write;

  try {
    process.stdout.write = (() => true) as typeof process.stdout.write;
    process.stderr.write = (() => true) as typeof process.stderr.write;
    return await callback();
  } finally {
    process.stdout.write = writeStdout;
    process.stderr.write = writeStderr;
    process.exitCode = 0;
  }
}

async function withBunEnv<T>(
  values: Record<string, string | undefined>,
  callback: () => Promise<T>,
): Promise<T> {
  const previous = new Map<string, string | undefined>();

  for (const key of Object.keys(values)) {
    previous.set(key, Bun.env[key]);
    const value = values[key];
    if (value === undefined) {
      delete Bun.env[key];
    } else {
      Bun.env[key] = value;
    }
  }

  try {
    return await callback();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) {
        delete Bun.env[key];
      } else {
        Bun.env[key] = value;
      }
    }
  }
}

async function withProcessCwd<T>(directory: string, callback: () => Promise<T>): Promise<T> {
  const previous = process.cwd();
  process.chdir(directory);

  try {
    return await callback();
  } finally {
    process.chdir(previous);
  }
}

function repositoryConfigBackupPolicyIdForTest(dependencyResourceId: string): string {
  return `dbp_cfg_${new Bun.CryptoHasher("sha256")
    .update(`repository-config:${dependencyResourceId}`)
    .digest("hex")
    .slice(0, 24)}`;
}

async function createPreviewDeployCliHarness(
  input: {
    withRouteStore?: boolean;
    deploymentSummaries?: unknown[];
    createResourceSlugConflict?: boolean;
    resourceSlugConflictResourceId?: string;
    sourceLinkRecord?: Record<string, unknown> | null;
    resourceSummaries?: unknown[];
    resourceDetail?: Record<string, unknown> | null;
    resourceEffectiveConfig?: Record<string, unknown> | null;
    dependencyResources?: unknown[];
    dependencyBindings?: unknown[];
    dependencyBackupPolicies?: unknown[];
    storageVolumes?: unknown[];
    scheduledTasks?: unknown[];
    monitoringThresholdsReadback?: Record<string, unknown> | null;
  } = {},
) {
  const { createExecutionContext } = await import("@appaloft/application");
  const { createCliProgram } = await import("../src");
  const commands: AppCommand<unknown>[] = [];
  const queries: AppQuery<unknown>[] = [];
  const operations: string[] = [];
  const desiredRoutes: unknown[] = [];
  const sourceLinkCalls: string[] = [];
  const createdLinks: unknown[] = [];
  const dependencyProvenanceWrites: unknown[] = [];
  const storageProvenanceWrites: unknown[] = [];
  const scheduledTaskProvenanceWrites: unknown[] = [];
  const commandBus = {
    execute: async <T>(_context: unknown, command: AppCommand<T>) => {
      operations.push(command.constructor.name);
      commands.push(command as AppCommand<unknown>);
      switch (command.constructor.name) {
        case "CreateProjectCommand":
          return ok({ id: "proj_1" } as T);
        case "RegisterServerCommand":
          return ok({ id: "srv_1" } as T);
        case "CreateEnvironmentCommand":
          return ok({ id: "env_1" } as T);
        case "CreateResourceCommand":
          if (input.createResourceSlugConflict) {
            return err(
              domainError.resourceSlugConflict(
                "Resource name already exists for this project environment",
                {
                  phase: "resource-admission",
                  projectId: "proj_1",
                  environmentId: "env_1",
                  ...(input.resourceSlugConflictResourceId
                    ? { resourceId: input.resourceSlugConflictResourceId }
                    : {}),
                  resourceSlug: "appaloft-console-backend-preview-pr-262",
                },
              ),
            );
          }
          return ok({ id: "res_1" } as T);
        case "ConfigureResourceRuntimeCommand":
          return ok({ id: "res_1" } as T);
        case "ConfigureResourceAccessCommand":
          return ok({ id: "res_1" } as T);
        case "ConfigureRuntimeMonitoringThresholdsCommand": {
          const thresholdCommand = command as unknown as { input: Record<string, unknown> };
          return ok({
            policy: {
              schemaVersion: "runtime-monitoring-thresholds.policy/v1",
              policyId: thresholdCommand.input.policyId ?? "rmtp_resource",
              scope: thresholdCommand.input.scope,
              rules: thresholdCommand.input.rules,
              enabled: thresholdCommand.input.enabled,
              updatedAt: "2026-05-24T00:00:00.000Z",
            },
          } as T);
        }
        case "ConfigureResourceAutoDeployCommand": {
          const autoDeployCommand = command as unknown as Record<string, unknown>;
          const policy = autoDeployCommand.policy as Record<string, unknown> | undefined;
          return ok({
            resourceId: autoDeployCommand.resourceId,
            status: autoDeployCommand.mode === "disable" ? "disabled" : "enabled",
            ...(policy?.triggerKind ? { triggerKind: policy.triggerKind } : {}),
            ...(policy?.refs ? { refs: policy.refs } : {}),
            ...(policy?.eventKinds ? { eventKinds: policy.eventKinds } : {}),
            ...(policy?.dedupeWindowSeconds
              ? { dedupeWindowSeconds: policy.dedupeWindowSeconds }
              : {}),
          } as T);
        }
        case "ProvisionDependencyResourceCommand":
          return ok({ id: "dep_res_db" } as T);
        case "BindResourceDependencyCommand":
          return ok({ id: "rbd_db" } as T);
        case "ConfigureDependencyResourceBackupPolicyCommand": {
          const backupCommand = command as unknown as { input: Record<string, unknown> };
          return ok({ id: backupCommand.input.policyId ?? "dbp_cfg_db" } as T);
        }
        case "CreateStorageVolumeCommand":
          return ok({ id: "stv_uploads" } as T);
        case "AttachResourceStorageCommand":
          return ok({ id: "rsa_uploads" } as T);
        case "CreateScheduledTaskCommand": {
          const taskCommand = command as unknown as Record<string, unknown>;
          return ok({
            schemaVersion: "scheduled-tasks.command/v1",
            task: {
              taskId: "tsk_nightly_sync",
              resourceId: taskCommand.resourceId,
              schedule: taskCommand.schedule,
              timezone: taskCommand.timezone,
              commandIntent: taskCommand.commandIntent,
              timeoutSeconds: taskCommand.timeoutSeconds,
              retryLimit: taskCommand.retryLimit,
              concurrencyPolicy: taskCommand.concurrencyPolicy,
              status: taskCommand.status,
              createdAt: "2026-05-24T00:00:00.000Z",
            },
          } as T);
        }
        case "ConfigureScheduledTaskCommand": {
          const taskCommand = command as unknown as Record<string, unknown>;
          return ok({
            schemaVersion: "scheduled-tasks.command/v1",
            task: {
              taskId: taskCommand.taskId,
              resourceId: taskCommand.resourceId,
              schedule: taskCommand.schedule,
              timezone: taskCommand.timezone,
              commandIntent: taskCommand.commandIntent,
              timeoutSeconds: taskCommand.timeoutSeconds,
              retryLimit: taskCommand.retryLimit,
              concurrencyPolicy: taskCommand.concurrencyPolicy,
              status: taskCommand.status,
              createdAt: "2026-05-24T00:00:00.000Z",
            },
          } as T);
        }
        case "CreateDeploymentCommand":
          return ok({ id: "dep_1" } as T);
        default:
          return ok(null as T);
      }
    },
  } as unknown as CommandBus;
  const queryBus = {
    execute: async <T>(_context: unknown, query: AppQuery<T>) => {
      operations.push(query.constructor.name);
      queries.push(query as AppQuery<unknown>);
      if (query.constructor.name === "ListDeploymentsQuery") {
        return ok({ items: input.deploymentSummaries ?? [] } as T);
      }
      if (query.constructor.name === "ListResourcesQuery") {
        return ok({ items: input.resourceSummaries ?? [] } as T);
      }
      if (query.constructor.name === "ShowResourceQuery") {
        return ok(
          (input.resourceDetail ?? {
            runtimeProfile: undefined,
          }) as Record<string, unknown> as T,
        );
      }
      if (query.constructor.name === "ResourceEffectiveConfigQuery") {
        return ok(
          (input.resourceEffectiveConfig ?? {
            schemaVersion: "resources.effective-config/v1",
            resourceId: "res_existing",
            environmentId: "env_existing",
            ownedEntries: [],
            effectiveEntries: [],
            overrides: [],
            precedence: [
              "defaults",
              "system",
              "organization",
              "project",
              "environment",
              "resource",
              "deployment",
            ],
            generatedAt: "2026-05-16T00:00:00.000Z",
          }) as Record<string, unknown> as T,
        );
      }
      if (query.constructor.name === "ListDependencyResourcesQuery") {
        return ok({ items: input.dependencyResources ?? [] } as T);
      }
      if (query.constructor.name === "ListDependencyResourceBackupPoliciesQuery") {
        return ok({ items: input.dependencyBackupPolicies ?? [] } as T);
      }
      if (query.constructor.name === "ListResourceDependencyBindingsQuery") {
        return ok({ items: input.dependencyBindings ?? [] } as T);
      }
      if (query.constructor.name === "ListStorageVolumesQuery") {
        return ok({ items: input.storageVolumes ?? [] } as T);
      }
      if (query.constructor.name === "ListScheduledTasksQuery") {
        return ok({ items: input.scheduledTasks ?? [] } as T);
      }
      if (query.constructor.name === "ShowRuntimeMonitoringThresholdsQuery") {
        return ok(
          (input.monitoringThresholdsReadback ?? {
            schemaVersion: "runtime-monitoring-thresholds.show/v1",
            scope: { kind: "resource", resourceId: "res_1" },
            generatedAt: "2026-05-24T00:00:00.000Z",
            policy: null,
            evaluation: {
              state: "unknown",
              crossed: [],
              nextActions: ["open-runtime-monitoring"],
              sourceErrors: [],
            },
          }) as Record<string, unknown> as T,
        );
      }
      return ok({ items: [] } as T);
    },
  } as unknown as QueryBus;
  const executionContextFactory: ExecutionContextFactory = {
    create: (contextInput) =>
      createExecutionContext({
        ...contextInput,
        requestId: "req_cli_preview_deploy_test",
      }),
  };
  const program = createCliProgram({
    version: "0.1.0-test",
    startServer: async () => {},
    commandBus,
    queryBus,
    executionContextFactory,
    prepareDeploymentStateBackend: async (decision) => {
      operations.push(`PrepareState:${decision.kind}`);
      return ok({
        dataRoot: "/var/lib/appaloft/runtime/state",
        schemaVersion: 1,
        release: async () => {
          operations.push(`ReleaseState:${decision.kind}`);
          return ok(undefined);
        },
      });
    },
    sourceLinkStore: {
      read: async (sourceFingerprint) => {
        sourceLinkCalls.push(`read:${sourceFingerprint}`);
        return ok((input.sourceLinkRecord ?? null) as null);
      },
      requireSameTargetOrMissing: async (sourceFingerprint) => {
        sourceLinkCalls.push(`requireSameTargetOrMissing:${sourceFingerprint}`);
        return ok(null);
      },
      createIfMissing: async (sourceLinkInput) => {
        sourceLinkCalls.push(`createIfMissing:${sourceLinkInput.sourceFingerprint}`);
        createdLinks.push(sourceLinkInput);
        return ok({
          sourceFingerprint: sourceLinkInput.sourceFingerprint,
          updatedAt: sourceLinkInput.updatedAt,
          ...sourceLinkInput.target,
        });
      },
      recordDependencyProvenance: async (sourceLinkInput) => {
        sourceLinkCalls.push(`recordDependencyProvenance:${sourceLinkInput.sourceFingerprint}`);
        dependencyProvenanceWrites.push(sourceLinkInput);
        return ok({
          sourceFingerprint: sourceLinkInput.sourceFingerprint,
          updatedAt: sourceLinkInput.updatedAt,
          ...sourceLinkInput.target,
          dependencyProvenance: sourceLinkInput.dependencyProvenance,
        });
      },
      recordStorageProvenance: async (sourceLinkInput) => {
        sourceLinkCalls.push(`recordStorageProvenance:${sourceLinkInput.sourceFingerprint}`);
        storageProvenanceWrites.push(sourceLinkInput);
        return ok({
          sourceFingerprint: sourceLinkInput.sourceFingerprint,
          updatedAt: sourceLinkInput.updatedAt,
          ...sourceLinkInput.target,
          storageProvenance: sourceLinkInput.storageProvenance,
        });
      },
      recordScheduledTaskProvenance: async (sourceLinkInput) => {
        sourceLinkCalls.push(`recordScheduledTaskProvenance:${sourceLinkInput.sourceFingerprint}`);
        scheduledTaskProvenanceWrites.push(sourceLinkInput);
        return ok({
          sourceFingerprint: sourceLinkInput.sourceFingerprint,
          updatedAt: sourceLinkInput.updatedAt,
          ...sourceLinkInput.target,
          scheduledTaskProvenance: sourceLinkInput.scheduledTaskProvenance,
        });
      },
    },
    ...(input.withRouteStore
      ? {
          serverAppliedRouteStore: {
            upsertDesired: async (routeInput) => {
              operations.push("UpsertServerAppliedRoutes");
              desiredRoutes.push(routeInput);
              return ok({
                routeSetId: [
                  routeInput.target.projectId,
                  routeInput.target.environmentId,
                  routeInput.target.resourceId,
                  routeInput.target.serverId,
                  routeInput.target.destinationId ?? "default",
                ].join(":"),
                ...routeInput.target,
                ...(routeInput.sourceFingerprint
                  ? { sourceFingerprint: routeInput.sourceFingerprint }
                  : {}),
                domains: routeInput.domains,
                status: "desired" as const,
                updatedAt: routeInput.updatedAt,
              });
            },
            read: async () => ok(null),
            markApplied: async () => ok(null),
            markFailed: async () => ok(null),
            deleteDesired: async () => ok(false),
            deleteDesiredBySourceFingerprint: async () => ok(0),
          },
        }
      : {}),
  });

  return {
    commands,
    createdLinks,
    dependencyProvenanceWrites,
    desiredRoutes,
    operations,
    program,
    queries,
    scheduledTaskProvenanceWrites,
    sourceLinkCalls,
    storageProvenanceWrites,
  };
}

describe("CLI deployment config entry workflow", () => {
  test("[QUICK-DEPLOY-ENTRY-010] init writes a profile-only config", async () => {
    ensureReflectMetadata();
    const { createInitConfig } = await import("../src/commands/lifecycle");

    const config = createInitConfig({
      method: "workspace-commands",
      port: 4310,
      build: "bun run build",
      start: "bun run start",
      healthPath: "/ready",
    });

    expect(config).toEqual({
      runtime: {
        strategy: "workspace-commands",
        buildCommand: "bun run build",
        startCommand: "bun run start",
        healthCheckPath: "/ready",
      },
      network: {
        internalPort: 4310,
        upstreamProtocol: "http",
        exposureMode: "reverse-proxy",
      },
    });
    expect("project" in config).toBe(false);
    expect("resource" in config).toBe(false);
    expect("targets" in config).toBe(false);
  });

  test("[CONFIG-FILE-ENTRY-001] deploy --config maps config profile fields into quick deploy resource drafts", async () => {
    ensureReflectMetadata();
    const {
      deploymentPromptSeedFromConfig,
      networkProfileFromDeploymentInput,
      runtimeProfileFromDeploymentInput,
      sourceBindingForDeploymentInput,
    } = await import("../src/commands/deployment-interaction");

    const seed = deploymentPromptSeedFromConfig({
      source: {
        type: "git",
        repository: "https://github.com/acme/app",
        gitRef: "main",
        commitSha: "abc123",
        baseDirectory: "apps/api",
      },
      runtime: {
        type: "node",
        strategy: "workspace-commands",
        installCommand: "bun install",
        buildCommand: "bun run build",
        startCommand: "bun run start",
        build: {
          command: "bun run build",
        },
        start: {
          command: "bun run start",
        },
        dockerfilePath: "deploy/Dockerfile",
        dockerComposeFilePath: "deploy/compose.yaml",
        buildTarget: "runner",
        name: "www",
        healthCheck: {
          path: "/ready",
          intervalSeconds: 10,
        },
      },
      network: {
        internalPort: 4310,
        upstreamProtocol: "http",
        exposureMode: "reverse-proxy",
      },
      access: {
        domains: [
          {
            host: "www.example.com",
            pathPrefix: "/",
            tlsMode: "disabled",
          },
        ],
      },
      storage: {
        uploads: {
          kind: "volume",
          source: "managed",
          mount: {
            path: "/app/uploads",
          },
        },
      },
      autoDeploy: {
        enabled: true,
        trigger: "git-push",
        refs: ["main"],
        events: ["push"],
        dedupeWindowSeconds: 300,
      },
    });

    expect(seed).toMatchObject({
      sourceLocator: "https://github.com/acme/app",
      sourceProfile: {
        gitRef: "main",
        commitSha: "abc123",
        baseDirectory: "apps/api",
      },
      deploymentMethod: "workspace-commands",
      installCommand: "bun install",
      buildCommand: "bun run build",
      startCommand: "bun run start",
      dockerfilePath: "deploy/Dockerfile",
      dockerComposeFilePath: "deploy/compose.yaml",
      buildTarget: "runner",
      runtimeNameTemplate: "www",
      port: 4310,
      upstreamProtocol: "http",
      exposureMode: "reverse-proxy",
      healthCheckPath: "/ready",
      serverAppliedRoutes: [
        {
          host: "www.example.com",
          pathPrefix: "/",
          tlsMode: "disabled",
        },
      ],
      storageGraph: [
        {
          key: "uploads",
          kind: "volume",
          source: "managed",
          mountPath: "/app/uploads",
          mountMode: "read-write",
        },
      ],
      autoDeployPolicy: {
        enabled: true,
        triggerKind: "git-push",
        refs: ["main"],
        eventKinds: ["push"],
        dedupeWindowSeconds: 300,
      },
    });
    expect(seed.healthCheck).toMatchObject({
      enabled: true,
      type: "http",
      intervalSeconds: 10,
      http: {
        path: "/ready",
      },
    });
    expect(
      sourceBindingForDeploymentInput(
        "https://github.com/acme/app.git",
        "workspace-commands",
        seed.sourceProfile,
      ),
    ).toMatchObject({
      gitRef: "main",
      commitSha: "abc123",
      baseDirectory: "apps/api",
    });
    expect(runtimeProfileFromDeploymentInput("workspace-commands", seed)).toMatchObject({
      strategy: "workspace-commands",
      installCommand: "bun install",
      buildCommand: "bun run build",
      startCommand: "bun run start",
      dockerfilePath: "deploy/Dockerfile",
      dockerComposeFilePath: "deploy/compose.yaml",
      buildTarget: "runner",
      healthCheck: {
        http: {
          path: "/ready",
        },
      },
    });
    expect(networkProfileFromDeploymentInput("workspace-commands", seed)).toEqual({
      internalPort: 4310,
      upstreamProtocol: "http",
      exposureMode: "reverse-proxy",
    });
    expect("projectId" in seed).toBe(false);
    expect("serverId" in seed).toBe(false);
    expect("resourceId" in seed).toBe(false);
  });

  test("[CONFIG-FILE-PROFILE-003] runtime healthCheckPath produces a reusable health policy seed", async () => {
    ensureReflectMetadata();
    const { deploymentPromptSeedFromConfig } = await import(
      "../src/commands/deployment-interaction"
    );

    const seed = deploymentPromptSeedFromConfig({
      runtime: {
        strategy: "workspace-commands",
        healthCheckPath: "/ready",
      },
    });

    expect(seed.healthCheckPath).toBe("/ready");
    expect(seed.healthCheck).toEqual({
      enabled: true,
      type: "http",
      intervalSeconds: 5,
      timeoutSeconds: 5,
      retries: 10,
      startPeriodSeconds: 5,
      http: {
        method: "GET",
        scheme: "http",
        host: "localhost",
        path: "/ready",
        expectedStatusCode: 200,
      },
    });
  });

  test("[CONFIG-FILE-SEC-006] config env values become plain-config variables", async () => {
    ensureReflectMetadata();
    const { deploymentEnvironmentVariablesFromConfig } = await import(
      "../src/commands/deployment-interaction"
    );

    const result = deploymentEnvironmentVariablesFromConfig({
      env: {
        PORT: 3000,
        PUBLIC_MODE: "demo",
        FEATURE_FLAG: true,
      },
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw new Error(result.error.message);
    }
    expect(result.value).toEqual([
      {
        key: "FEATURE_FLAG",
        value: "true",
        kind: "plain-config",
        exposure: "runtime",
        scope: "environment",
        isSecret: false,
      },
      {
        key: "PORT",
        value: "3000",
        kind: "plain-config",
        exposure: "runtime",
        scope: "environment",
        isSecret: false,
      },
      {
        key: "PUBLIC_MODE",
        value: "demo",
        kind: "plain-config",
        exposure: "build-time",
        scope: "environment",
        isSecret: false,
      },
    ]);
  });

  test("[CONFIG-FILE-SEC-006] config env values can render trusted preview context", async () => {
    ensureReflectMetadata();
    const { deploymentEnvironmentVariablesFromConfig } = await import(
      "../src/commands/deployment-interaction"
    );

    const result = deploymentEnvironmentVariablesFromConfig(
      {
        env: {
          APP_URL: "http://{pr_number}.preview.example.com",
          PREVIEW_ID: "{preview_id}",
        },
      },
      {
        previewContext: {
          previewId: "pr-42",
          pullRequestNumber: 42,
        },
      },
    );

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw new Error(result.error.message);
    }
    expect(result.value).toEqual([
      expect.objectContaining({
        key: "APP_URL",
        value: "http://42.preview.example.com",
      }),
      expect.objectContaining({
        key: "PREVIEW_ID",
        value: "pr-42",
      }),
    ]);
  });

  test("[CONFIG-FILE-SEC-006] config env preview templates require preview context", async () => {
    ensureReflectMetadata();
    const { deploymentEnvironmentVariablesFromConfig } = await import(
      "../src/commands/deployment-interaction"
    );

    const result = deploymentEnvironmentVariablesFromConfig({
      env: {
        APP_URL: "http://{pr_number}.preview.example.com",
      },
    });

    expect(result.isErr()).toBe(true);
    if (result.isOk()) {
      throw new Error("Expected preview template without preview context to fail");
    }
    expect(result.error.details).toMatchObject({
      phase: "config-template-resolution",
      field: "env.APP_URL",
      variable: "pr_number",
    });
  });

  test("[CONFIG-FILE-SEC-003] required ci-env secret references become secret variables", async () => {
    ensureReflectMetadata();
    const { deploymentEnvironmentVariablesFromConfig } = await import(
      "../src/commands/deployment-interaction"
    );

    const result = deploymentEnvironmentVariablesFromConfig(
      {
        secrets: {
          DATABASE_URL: {
            from: "ci-env:DATABASE_URL",
            required: true,
          },
          OPTIONAL_TOKEN: {
            from: "ci-env:OPTIONAL_TOKEN",
            required: false,
          },
        },
      },
      {
        env: {
          DATABASE_URL: "postgres://user:pass@example.test/app",
        },
      },
    );

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw new Error(result.error.message);
    }
    expect(result.value).toEqual([
      {
        key: "DATABASE_URL",
        value: "postgres://user:pass@example.test/app",
        kind: "secret",
        exposure: "runtime",
        scope: "environment",
        isSecret: true,
      },
    ]);
  });

  test("[CONFIG-FILE-SEC-008] required ci-env secret references fail before mutation when missing", async () => {
    ensureReflectMetadata();
    const { deploymentEnvironmentVariablesFromConfig } = await import(
      "../src/commands/deployment-interaction"
    );

    const result = deploymentEnvironmentVariablesFromConfig(
      {
        secrets: {
          API_TOKEN: {
            from: "ci-env:API_TOKEN",
            required: true,
          },
        },
      },
      {
        env: {},
      },
    );

    expect(result.isErr()).toBe(true);
    if (result.isOk()) {
      throw new Error("Expected missing required secret to fail");
    }
    expect(result.error.code).toBe("validation_error");
    expect(result.error.details).toMatchObject({
      phase: "config-secret-resolution",
      secretKey: "API_TOKEN",
      secretRef: "ci-env:API_TOKEN",
    });
    expect(JSON.stringify(result.error.details)).not.toContain("postgres://");
  });

  test("[CONFIG-FILE-SEC-010] unsupported required secret resolvers fail before mutation", async () => {
    ensureReflectMetadata();
    const { deploymentEnvironmentVariablesFromConfig } = await import(
      "../src/commands/deployment-interaction"
    );

    const result = deploymentEnvironmentVariablesFromConfig({
      secrets: {
        API_TOKEN: {
          from: "vault:prod/api-token",
          required: true,
        },
      },
    });

    expect(result.isErr()).toBe(true);
    if (result.isOk()) {
      throw new Error("Expected unsupported resolver to fail");
    }
    expect(result.error.code).toBe("validation_error");
    expect(result.error.details).toMatchObject({
      phase: "config-secret-resolution",
      secretKey: "API_TOKEN",
      secretRef: "vault:prod/api-token",
    });
  });

  test("[CONFIG-FILE-DOMAIN-004] invalid access domain config maps to domain-resolution phase", async () => {
    ensureReflectMetadata();
    const { createExecutionContext } = await import("@appaloft/application");
    const { createCliProgram } = await import("../src");
    const commands: AppCommand<unknown>[] = [];
    const queries: AppQuery<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: unknown, command: AppCommand<T>) => {
        commands.push(command as AppCommand<unknown>);
        return ok(null as T);
      },
    } as unknown as CommandBus;
    const queryBus = {
      execute: async <T>(_context: unknown, query: AppQuery<T>) => {
        queries.push(query as AppQuery<unknown>);
        return ok({ items: [] } as T);
      },
    } as unknown as QueryBus;
    const executionContextFactory: ExecutionContextFactory = {
      create: (input) =>
        createExecutionContext({
          ...input,
          requestId: "req_cli_domain_config_test",
        }),
    };
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus,
      queryBus,
      executionContextFactory,
    });
    const workspace = mkdtempSync(join(tmpdir(), "appaloft-domain-config-"));
    const configPath = join(workspace, "appaloft.yml");
    writeFileSync(
      configPath,
      ["access:", "  domains:", "    - host: https://www.example.com", ""].join("\n"),
    );

    const writeStdout = process.stdout.write;
    const writeStderr = process.stderr.write;
    try {
      process.stdout.write = (() => true) as typeof process.stdout.write;
      process.stderr.write = (() => true) as typeof process.stderr.write;
      const result = await program
        .parseAsync(["node", "appaloft", "deploy", workspace, "--config", configPath])
        .then(
          () => ({ ok: true as const }),
          (error: unknown) => ({ ok: false as const, error }),
        );

      expect(result.ok).toBe(false);
      if (result.ok) {
        throw new Error("Expected invalid domain config to fail");
      }
      const errorText = String(result.error);
      expect(errorText).toContain('"code":"validation_error"');
      expect(errorText).toContain('"phase":"config-domain-resolution"');
      expect(errorText).toContain(configPath);
      expect(errorText).toContain("config_domain_resolution");
    } finally {
      process.stdout.write = writeStdout;
      process.stderr.write = writeStderr;
      process.exitCode = 0;
      rmSync(workspace, { recursive: true, force: true });
    }

    expect(commands).toHaveLength(0);
    expect(queries).toHaveLength(0);
  });

  test("[SWARM-TARGET-ADM-001] deploy --config rejects Swarm fields before command dispatch", async () => {
    ensureReflectMetadata();
    const harness = await createPreviewDeployCliHarness();
    const workspace = mkdtempSync(join(tmpdir(), "appaloft-swarm-config-"));
    const configPath = join(workspace, "appaloft.yml");
    writeFileSync(
      configPath,
      [
        "runtime:",
        "  strategy: dockerfile",
        "swarm:",
        "  stack: web",
        "  service: api",
        "  replicas: 3",
        "  updatePolicy: start-first",
        "  registrySecret: resource-secret:REGISTRY_TOKEN",
        "",
      ].join("\n"),
    );

    try {
      const result = await withMutedProcessOutput(() =>
        harness.program
          .parseAsync(["node", "appaloft", "deploy", workspace, "--config", configPath])
          .then(
            () => ({ ok: true as const }),
            (error: unknown) => ({ ok: false as const, error }),
          ),
      );

      expect(result.ok).toBe(false);
      if (result.ok) {
        throw new Error("Expected Swarm config fields to fail before dispatch");
      }
      const errorText = String(result.error);
      expect(errorText).toContain('"code":"validation_error"');
      expect(errorText).toContain("unsupported_config_field");
      expect(errorText).toContain(configPath);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }

    expect(harness.commands).toHaveLength(0);
  });

  test("[CONFIG-FILE-DOMAIN-001] access domains persist desired state before ids-only deployment", async () => {
    ensureReflectMetadata();
    const { createExecutionContext } = await import("@appaloft/application");
    const { createCliProgram } = await import("../src");
    const commands: AppCommand<unknown>[] = [];
    const queries: AppQuery<unknown>[] = [];
    const operations: string[] = [];
    const desiredRoutes: unknown[] = [];
    const commandBus = {
      execute: async <T>(_context: unknown, command: AppCommand<T>) => {
        operations.push(command.constructor.name);
        commands.push(command as AppCommand<unknown>);
        switch (command.constructor.name) {
          case "CreateProjectCommand":
            return ok({ id: "proj_1" } as T);
          case "RegisterServerCommand":
            return ok({ id: "srv_1" } as T);
          case "CreateEnvironmentCommand":
            return ok({ id: "env_1" } as T);
          case "CreateResourceCommand":
            return ok({ id: "res_1" } as T);
          case "CreateDeploymentCommand":
            return ok({ id: "dep_1" } as T);
          default:
            return ok(null as T);
        }
      },
    } as unknown as CommandBus;
    const queryBus = {
      execute: async <T>(_context: unknown, query: AppQuery<T>) => {
        operations.push(query.constructor.name);
        queries.push(query as AppQuery<unknown>);
        return ok({ items: [] } as T);
      },
    } as unknown as QueryBus;
    const executionContextFactory: ExecutionContextFactory = {
      create: (input) =>
        createExecutionContext({
          ...input,
          requestId: "req_cli_domain_gate_test",
        }),
    };
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus,
      queryBus,
      executionContextFactory,
      prepareDeploymentStateBackend: async (decision) => {
        operations.push(`PrepareState:${decision.kind}`);
        return ok({
          dataRoot: "/var/lib/appaloft/runtime/state",
          schemaVersion: 1,
          release: async () => {
            operations.push(`ReleaseState:${decision.kind}`);
            return ok(undefined);
          },
        });
      },
      serverAppliedRouteStore: {
        upsertDesired: async (input) => {
          operations.push("UpsertServerAppliedRoutes");
          desiredRoutes.push(input);
          return ok({
            routeSetId: [
              input.target.projectId,
              input.target.environmentId,
              input.target.resourceId,
              input.target.serverId,
              input.target.destinationId ?? "default",
            ].join(":"),
            ...input.target,
            ...(input.sourceFingerprint ? { sourceFingerprint: input.sourceFingerprint } : {}),
            domains: input.domains,
            status: "desired" as const,
            updatedAt: input.updatedAt,
          });
        },
        read: async () => ok(null),
        markApplied: async () => ok(null),
        markFailed: async () => ok(null),
        deleteDesired: async () => ok(false),
        deleteDesiredBySourceFingerprint: async () => ok(0),
      },
    });
    const workspace = mkdtempSync(join(tmpdir(), "appaloft-domain-config-"));
    const configPath = join(workspace, "appaloft.yml");
    writeFileSync(
      configPath,
      [
        "runtime:",
        "  strategy: workspace-commands",
        "access:",
        "  domains:",
        "    - host: www.example.com",
        "      pathPrefix: /",
        "      tlsMode: disabled",
        "",
      ].join("\n"),
    );

    const writeStdout = process.stdout.write;
    const writeStderr = process.stderr.write;
    try {
      process.stdout.write = (() => true) as typeof process.stdout.write;
      process.stderr.write = (() => true) as typeof process.stderr.write;
      const result = await program
        .parseAsync([
          "node",
          "appaloft",
          "deploy",
          workspace,
          "--config",
          configPath,
          "--server-host",
          "203.0.113.10",
          "--server-provider",
          "generic-ssh",
        ])
        .then(
          () => ({ ok: true as const }),
          (error: unknown) => ({ ok: false as const, error }),
        );

      expect(result.ok).toBe(true);
      if (!result.ok) {
        throw new Error(String(result.error));
      }
    } finally {
      process.stdout.write = writeStdout;
      process.stderr.write = writeStderr;
      process.exitCode = 0;
      rmSync(workspace, { recursive: true, force: true });
    }

    expect(queries.map((query) => query.constructor.name)).toEqual([
      "ListProjectsQuery",
      "ListServersQuery",
      "ListDeploymentsQuery",
    ]);
    expect(operations).toEqual([
      "PrepareState:ssh-pglite",
      "ListProjectsQuery",
      "ListServersQuery",
      "CreateProjectCommand",
      "RegisterServerCommand",
      "CreateEnvironmentCommand",
      "CreateResourceCommand",
      "UpsertServerAppliedRoutes",
      "CreateDeploymentCommand",
      "ListDeploymentsQuery",
      "ReleaseState:ssh-pglite",
    ]);
    expect(desiredRoutes).toHaveLength(1);
    expect(desiredRoutes[0]).toMatchObject({
      target: {
        projectId: "proj_1",
        environmentId: "env_1",
        resourceId: "res_1",
        serverId: "srv_1",
      },
      domains: [
        {
          host: "www.example.com",
          pathPrefix: "/",
          tlsMode: "disabled",
        },
      ],
    });
    expect(JSON.stringify(desiredRoutes[0])).toContain("source-fingerprint");
    const deployment = commands.find(
      (command) => command.constructor.name === "CreateDeploymentCommand",
    );
    expect(deployment).toMatchObject({
      projectId: "proj_1",
      serverId: "srv_1",
      environmentId: "env_1",
      resourceId: "res_1",
    });
    expect("domains" in (deployment as Record<string, unknown>)).toBe(false);
    expect("tlsMode" in (deployment as Record<string, unknown>)).toBe(false);
  });

  test("[CONFIG-FILE-DOMAIN-001] access domains fail before mutation when route store is unavailable", async () => {
    ensureReflectMetadata();
    const { createExecutionContext } = await import("@appaloft/application");
    const { createCliProgram } = await import("../src");
    const commands: AppCommand<unknown>[] = [];
    const queries: AppQuery<unknown>[] = [];
    const operations: string[] = [];
    const commandBus = {
      execute: async <T>(_context: unknown, command: AppCommand<T>) => {
        operations.push(command.constructor.name);
        commands.push(command as AppCommand<unknown>);
        return ok(null as T);
      },
    } as unknown as CommandBus;
    const queryBus = {
      execute: async <T>(_context: unknown, query: AppQuery<T>) => {
        operations.push(query.constructor.name);
        queries.push(query as AppQuery<unknown>);
        return ok({ items: [] } as T);
      },
    } as unknown as QueryBus;
    const executionContextFactory: ExecutionContextFactory = {
      create: (input) =>
        createExecutionContext({
          ...input,
          requestId: "req_cli_domain_store_missing_test",
        }),
    };
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus,
      queryBus,
      executionContextFactory,
      prepareDeploymentStateBackend: async (decision) => {
        operations.push(`PrepareState:${decision.kind}`);
        return ok({
          dataRoot: "/var/lib/appaloft/runtime/state",
          schemaVersion: 1,
          release: async () => {
            operations.push(`ReleaseState:${decision.kind}`);
            return ok(undefined);
          },
        });
      },
    });
    const workspace = mkdtempSync(join(tmpdir(), "appaloft-domain-config-"));
    const configPath = join(workspace, "appaloft.yml");
    writeFileSync(
      configPath,
      [
        "runtime:",
        "  strategy: workspace-commands",
        "access:",
        "  domains:",
        "    - host: www.example.com",
        "      pathPrefix: /",
        "      tlsMode: disabled",
        "",
      ].join("\n"),
    );

    const writeStdout = process.stdout.write;
    const writeStderr = process.stderr.write;
    try {
      process.stdout.write = (() => true) as typeof process.stdout.write;
      process.stderr.write = (() => true) as typeof process.stderr.write;
      const result = await program
        .parseAsync([
          "node",
          "appaloft",
          "deploy",
          workspace,
          "--config",
          configPath,
          "--server-host",
          "203.0.113.10",
          "--server-provider",
          "generic-ssh",
        ])
        .then(
          () => ({ ok: true as const }),
          (error: unknown) => ({ ok: false as const, error }),
        );

      expect(result.ok).toBe(false);
      if (result.ok) {
        throw new Error("Expected missing route store to fail");
      }
      const errorText = String(result.error);
      expect(errorText).toContain('"code":"validation_error"');
      expect(errorText).toContain('"phase":"config-domain-resolution"');
      expect(errorText).toContain("server_applied_route_store_missing");
      expect(errorText).toContain('"domainCount":"1"');
    } finally {
      process.stdout.write = writeStdout;
      process.stderr.write = writeStderr;
      process.exitCode = 0;
      rmSync(workspace, { recursive: true, force: true });
    }

    expect(commands).toHaveLength(0);
    expect(queries).toHaveLength(0);
    expect(operations).toEqual(["PrepareState:ssh-pglite", "ReleaseState:ssh-pglite"]);
  });

  test("[CONFIG-FILE-ENTRY-015] deploy action PR preview context selects preview scope and ids-only deployment", async () => {
    ensureReflectMetadata();
    const workspace = mkdtempSync(join(tmpdir(), "appaloft-preview-config-"));
    const configPath = join(workspace, "appaloft.preview.yml");
    writeFileSync(
      configPath,
      [
        "runtime:",
        "  strategy: workspace-commands",
        "network:",
        "  internalPort: 4310",
        "  exposureMode: reverse-proxy",
        "",
      ].join("\n"),
    );
    const harness = await createPreviewDeployCliHarness();

    try {
      await withBunEnv(
        {
          GITHUB_REPOSITORY: "acme/app",
          GITHUB_REPOSITORY_ID: "R_preview_repo",
          GITHUB_REF: "refs/heads/main",
          GITHUB_HEAD_REF: "feature/preview",
          GITHUB_SHA: "abc123",
          GITHUB_WORKSPACE: workspace,
        },
        () =>
          withMutedProcessOutput(async () => {
            await harness.program.parseAsync([
              "node",
              "appaloft",
              "deploy",
              workspace,
              "--config",
              configPath,
              "--preview",
              "pull-request",
              "--preview-id",
              "pr-123",
              "--server-host",
              "203.0.113.10",
              "--server-provider",
              "generic-ssh",
            ]);
          }),
      );
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }

    const createdEnvironment = harness.commands.find(
      (command) => command.constructor.name === "CreateEnvironmentCommand",
    );
    expect(createdEnvironment).toMatchObject({
      name: "preview-pr-123",
      kind: "preview",
    });
    expect(harness.sourceLinkCalls.some((call) => call.includes("preview%3Apr%3A123"))).toBe(true);
    expect(harness.sourceLinkCalls.some((call) => call.includes("appaloft.preview.yml"))).toBe(
      true,
    );
    const resource = harness.commands.find(
      (command) => command.constructor.name === "CreateResourceCommand",
    );
    expect(resource).toMatchObject({
      runtimeProfile: {
        runtimeName: "preview-123",
      },
    });
    const deployment = harness.commands.find(
      (command) => command.constructor.name === "CreateDeploymentCommand",
    );
    expect(deployment).toMatchObject({
      projectId: "proj_1",
      serverId: "srv_1",
      environmentId: "env_1",
      resourceId: "res_1",
    });
    expect("preview" in (deployment as Record<string, unknown>)).toBe(false);
    expect("pullRequestNumber" in (deployment as Record<string, unknown>)).toBe(false);
  });

  test("[CONFIG-FILE-ENTRY-015E] deploy action recovers a missing source link by reusing the resource slug", async () => {
    ensureReflectMetadata();
    const workspace = mkdtempSync(join(tmpdir(), "appaloft-preview-source-link-recovery-"));
    const configPath = join(workspace, "appaloft.preview.yml");
    writeFileSync(
      configPath,
      [
        "runtime:",
        "  strategy: workspace-commands",
        "network:",
        "  internalPort: 4310",
        "  exposureMode: reverse-proxy",
        "",
      ].join("\n"),
    );
    const harness = await createPreviewDeployCliHarness({
      createResourceSlugConflict: true,
      resourceSlugConflictResourceId: "res_existing",
    });

    try {
      await withBunEnv(
        {
          GITHUB_REPOSITORY: "acme/app",
          GITHUB_REPOSITORY_ID: "R_preview_repo",
          GITHUB_REF: "refs/pull/262/merge",
          GITHUB_HEAD_REF: "feature/preview-recovery",
          GITHUB_SHA: "abc123",
          GITHUB_WORKSPACE: workspace,
        },
        () =>
          withMutedProcessOutput(async () => {
            await harness.program.parseAsync([
              "node",
              "appaloft",
              "deploy",
              workspace,
              "--config",
              configPath,
              "--preview",
              "pull-request",
              "--preview-id",
              "pr-262",
              "--resource-name",
              "appaloft-console-backend-preview-pr-262",
              "--server-host",
              "203.0.113.10",
              "--server-provider",
              "generic-ssh",
            ]);
          }),
      );
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }

    expect(
      harness.commands.find((command) => command.constructor.name === "CreateResourceCommand"),
    ).toBeDefined();
    const deployment = harness.commands.find(
      (command) => command.constructor.name === "CreateDeploymentCommand",
    );
    expect(deployment).toMatchObject({
      projectId: "proj_1",
      environmentId: "env_1",
      resourceId: "res_existing",
    });
    expect(harness.createdLinks[0]).toMatchObject({
      target: {
        resourceId: "res_existing",
      },
    });
  });

  test("[CONFIG-FILE-ENTRY-015A] deploy action PR preview renders runtime.name templates before resource creation", async () => {
    ensureReflectMetadata();
    const workspace = mkdtempSync(join(tmpdir(), "appaloft-preview-runtime-name-template-"));
    const configPath = join(workspace, "appaloft.preview.yml");
    writeFileSync(
      configPath,
      [
        "runtime:",
        "  strategy: workspace-commands",
        "  name: preview-{pr_number}",
        "network:",
        "  internalPort: 4310",
        "",
      ].join("\n"),
    );
    const harness = await createPreviewDeployCliHarness();

    try {
      await withBunEnv(
        {
          GITHUB_REPOSITORY: "acme/app",
          GITHUB_REPOSITORY_ID: "R_preview_repo",
          GITHUB_REF: "refs/pull/124/merge",
          GITHUB_HEAD_REF: "feature/preview-runtime-name",
          GITHUB_SHA: "abc123",
          GITHUB_WORKSPACE: workspace,
        },
        () =>
          withMutedProcessOutput(async () => {
            await harness.program.parseAsync([
              "node",
              "appaloft",
              "deploy",
              workspace,
              "--config",
              configPath,
              "--preview",
              "pull-request",
              "--preview-id",
              "pr-124",
              "--server-host",
              "203.0.113.10",
              "--server-provider",
              "generic-ssh",
            ]);
          }),
      );
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }

    const resource = harness.commands.find(
      (command) => command.constructor.name === "CreateResourceCommand",
    );
    expect(resource).toMatchObject({
      runtimeProfile: {
        runtimeName: "preview-124",
      },
    });
  });

  test("[CONFIG-FILE-PROFILE-006] existing resource profile drift blocks default config deploy", async () => {
    ensureReflectMetadata();
    const workspace = mkdtempSync(join(tmpdir(), "appaloft-preview-runtime-name-existing-"));
    const configPath = join(workspace, "appaloft.preview.yml");
    writeFileSync(
      configPath,
      ["runtime:", "  strategy: workspace-commands", "network:", "  internalPort: 4310", ""].join(
        "\n",
      ),
    );
    const harness = await createPreviewDeployCliHarness({
      sourceLinkRecord: {
        projectId: "proj_existing",
        environmentId: "env_existing",
        resourceId: "res_existing",
        serverId: "srv_existing",
      },
      resourceDetail: {
        source: {
          kind: "local-folder",
          locator: workspace,
          displayName: workspace.split("/").at(-1) ?? "workspace",
        },
        runtimeProfile: {
          strategy: "workspace-commands",
          buildCommand: "bun run build",
          startCommand: "bun run start",
          healthCheckPath: "/ready",
        },
      },
    });

    try {
      await withBunEnv(
        {
          GITHUB_REPOSITORY: "acme/app",
          GITHUB_REPOSITORY_ID: "R_preview_repo",
          GITHUB_REF: "refs/pull/125/merge",
          GITHUB_HEAD_REF: "feature/preview-runtime-name-existing",
          GITHUB_SHA: "abc123",
          GITHUB_WORKSPACE: workspace,
        },
        () =>
          withMutedProcessOutput(async () => {
            const result = await harness.program
              .parseAsync([
                "node",
                "appaloft",
                "deploy",
                workspace,
                "--config",
                configPath,
                "--preview",
                "pull-request",
                "--preview-id",
                "pr-125",
                "--runtime-name",
                "appaloft-preview-125",
                "--server-host",
                "203.0.113.10",
                "--server-provider",
                "generic-ssh",
              ])
              .then(
                () => ({ ok: true as const }),
                (error: unknown) => ({ ok: false as const, error }),
              );

            expect(result.ok).toBe(false);
            if (!result.ok) {
              const errorText = String(result.error);
              expect(errorText).toContain("resource_profile_drift");
              expect(errorText).toContain("resource-profile-resolution");
              expect(errorText).toContain("res_existing");
              expect(errorText).toContain("resource-vs-entry-profile");
              expect(errorText).toContain("blocksDeploymentAdmission");
            }
          }),
      );
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }

    expect(harness.queries.map((query) => query.constructor.name)).toContain("ShowResourceQuery");

    expect(
      harness.commands.find((command) => command.constructor.name === "CreateResourceCommand"),
    ).toBeUndefined();

    expect(
      harness.commands.find(
        (command) => command.constructor.name === "ConfigureResourceRuntimeCommand",
      ),
    ).toBeUndefined();
    expect(
      harness.commands.find((command) => command.constructor.name === "CreateDeploymentCommand"),
    ).toBeUndefined();
  });

  test("[CONFIG-FILE-ENTRY-015C] deploy action surfaces structured profile drift for existing resources", async () => {
    ensureReflectMetadata();
    const workspace = mkdtempSync(join(tmpdir(), "appaloft-existing-runtime-profile-"));
    const configPath = join(workspace, "appaloft.yml");
    writeFileSync(
      configPath,
      [
        "runtime:",
        "  strategy: static",
        "  installCommand: bun install --frozen-lockfile",
        "  buildCommand: APPALOFT_DOCS_BASE=/ APPALOFT_DOCS_SITE=https://docs.appaloft.com bun run --cwd apps/docs build",
        "  publishDirectory: apps/docs/dist",
        "network:",
        "  internalPort: 80",
        "  upstreamProtocol: http",
        "  exposureMode: reverse-proxy",
        "",
      ].join("\n"),
    );
    const harness = await createPreviewDeployCliHarness({
      sourceLinkRecord: {
        projectId: "proj_existing",
        environmentId: "env_existing",
        resourceId: "res_existing",
        serverId: "srv_existing",
      },
      resourceDetail: {
        runtimeProfile: {
          strategy: "static",
          installCommand: "bun install --frozen-lockfile",
          buildCommand: "bun run --cwd apps/docs build",
          publishDirectory: "apps/docs/dist",
        },
      },
    });

    try {
      await withBunEnv(
        {
          GITHUB_REPOSITORY: "appaloft/appaloft",
          GITHUB_REPOSITORY_ID: "R_docs_repo",
          GITHUB_REF: "refs/heads/main",
          GITHUB_SHA: "550d1f8bf78b9cbb7081a03e7bdfc32e8570ddf8",
          GITHUB_WORKSPACE: workspace,
        },
        () =>
          withMutedProcessOutput(async () => {
            const result = await harness.program
              .parseAsync([
                "node",
                "appaloft",
                "deploy",
                workspace,
                "--config",
                configPath,
                "--method",
                "static",
                "--server-host",
                "203.0.113.10",
                "--server-provider",
                "generic-ssh",
              ])
              .then(
                () => ({ ok: true as const }),
                (error: unknown) => ({ ok: false as const, error }),
              );

            expect(result.ok).toBe(false);
            if (!result.ok) {
              const errorText = String(result.error);
              expect(errorText).toContain("resource_profile_drift");
              expect(errorText).toContain("resource-profile-resolution");
              expect(errorText).toContain("res_existing");
              expect(errorText).toContain("resource-vs-entry-profile");
              expect(errorText).toContain("suggestedCommand");
            }
          }),
      );
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }

    expect(
      harness.commands.find((command) => command.constructor.name === "CreateResourceCommand"),
    ).toBeUndefined();
    expect(
      harness.commands.find(
        (command) => command.constructor.name === "ConfigureResourceRuntimeCommand",
      ),
    ).toBeUndefined();
    expect(
      harness.commands.find((command) => command.constructor.name === "CreateDeploymentCommand"),
    ).toBeUndefined();
  });

  test("[RES-PROFILE-DRIFT-002][RES-PROFILE-DRIFT-003] deploy action blocks entry config shadowed by resource overrides without leaking values", async () => {
    ensureReflectMetadata();
    const workspace = mkdtempSync(join(tmpdir(), "appaloft-existing-config-profile-"));
    const configPath = join(workspace, "appaloft.yml");
    writeFileSync(
      configPath,
      [
        "runtime:",
        "  strategy: workspace-commands",
        "  buildCommand: bun run build",
        "  startCommand: bun run start",
        "network:",
        "  internalPort: 4310",
        "env:",
        "  API_URL: https://entry.example.test",
        "secrets:",
        "  DATABASE_URL:",
        "    from: ci-env:DATABASE_URL",
        "",
      ].join("\n"),
    );
    const harness = await createPreviewDeployCliHarness({
      sourceLinkRecord: {
        projectId: "proj_existing",
        environmentId: "env_existing",
        resourceId: "res_existing",
        serverId: "srv_existing",
      },
      resourceDetail: {
        source: {
          kind: "local-folder",
          locator: workspace,
          displayName: workspace.split("/").at(-1) ?? "workspace",
        },
        runtimeProfile: {
          strategy: "workspace-commands",
          buildCommand: "bun run build",
          startCommand: "bun run start",
        },
        networkProfile: {
          internalPort: 4310,
          upstreamProtocol: "http",
          exposureMode: "reverse-proxy",
        },
      },
      resourceEffectiveConfig: {
        schemaVersion: "resources.effective-config/v1",
        resourceId: "res_existing",
        environmentId: "env_existing",
        ownedEntries: [
          {
            key: "API_URL",
            value: "https://resource.example.test",
            scope: "resource",
            exposure: "runtime",
            isSecret: false,
            kind: "plain-config",
          },
          {
            key: "DATABASE_URL",
            value: "****",
            scope: "resource",
            exposure: "runtime",
            isSecret: true,
            kind: "secret",
          },
        ],
        effectiveEntries: [
          {
            key: "API_URL",
            value: "https://resource.example.test",
            scope: "resource",
            exposure: "runtime",
            isSecret: false,
            kind: "plain-config",
          },
          {
            key: "DATABASE_URL",
            value: "****",
            scope: "resource",
            exposure: "runtime",
            isSecret: true,
            kind: "secret",
          },
        ],
        overrides: [],
        precedence: [
          "defaults",
          "system",
          "organization",
          "project",
          "environment",
          "resource",
          "deployment",
        ],
        generatedAt: "2026-05-16T00:00:00.000Z",
      },
    });

    try {
      await withBunEnv(
        {
          DATABASE_URL: "postgres://entry-user:entry-pass@example.test/app",
          GITHUB_HEAD_REF: undefined,
          GITHUB_REF: undefined,
          GITHUB_REPOSITORY: undefined,
          GITHUB_REPOSITORY_ID: undefined,
          GITHUB_SHA: undefined,
          GITHUB_WORKSPACE: undefined,
        },
        () =>
          withMutedProcessOutput(async () => {
            const result = await harness.program
              .parseAsync([
                "node",
                "appaloft",
                "deploy",
                workspace,
                "--config",
                configPath,
                "--method",
                "workspace-commands",
                "--server-host",
                "203.0.113.10",
                "--server-provider",
                "generic-ssh",
              ])
              .then(
                () => ({ ok: true as const }),
                (error: unknown) => ({ ok: false as const, error }),
              );

            expect(result.ok).toBe(false);
            if (!result.ok) {
              const errorText = String(result.error);
              expect(errorText).toContain("resource_profile_drift");
              expect(errorText).toContain("resource-profile-resolution");
              expect(errorText).toContain("resource-vs-entry-profile");
              expect(errorText).toContain("configuration.runtime.API_URL");
              expect(errorText).toContain("resources.set-variable");
              expect(errorText).not.toContain("postgres://entry-user");
              expect(errorText).not.toContain("https://entry.example.test");
              expect(errorText).not.toContain("https://resource.example.test");
            }
          }),
      );
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }

    expect(harness.queries.map((query) => query.constructor.name)).toContain("ShowResourceQuery");
    expect(harness.queries.map((query) => query.constructor.name)).toContain(
      "ResourceEffectiveConfigQuery",
    );
    expect(
      harness.commands.find(
        (command) => command.constructor.name === "SetEnvironmentVariableCommand",
      ),
    ).toBeUndefined();
    expect(
      harness.commands.find((command) => command.constructor.name === "CreateDeploymentCommand"),
    ).toBeUndefined();
  });

  test("[RES-PROFILE-DRIFT-004] deploy action can explicitly acknowledge resource profile drift", async () => {
    ensureReflectMetadata();
    const workspace = mkdtempSync(join(tmpdir(), "appaloft-existing-config-profile-ack-"));
    const configPath = join(workspace, "appaloft.yml");
    writeFileSync(
      configPath,
      [
        "runtime:",
        "  strategy: workspace-commands",
        "  buildCommand: bun run build",
        "  startCommand: bun run start",
        "network:",
        "  internalPort: 4310",
        "env:",
        "  API_URL: https://entry.example.test",
        "secrets:",
        "  DATABASE_URL:",
        "    from: ci-env:DATABASE_URL",
        "",
      ].join("\n"),
    );
    const harness = await createPreviewDeployCliHarness({
      sourceLinkRecord: {
        projectId: "proj_existing",
        environmentId: "env_existing",
        resourceId: "res_existing",
        serverId: "srv_existing",
      },
      resourceDetail: {
        source: {
          kind: "local-folder",
          locator: workspace,
          displayName: workspace.split("/").at(-1) ?? "workspace",
        },
        runtimeProfile: {
          strategy: "workspace-commands",
          buildCommand: "bun run build",
          startCommand: "bun run start",
        },
        networkProfile: {
          internalPort: 4310,
          upstreamProtocol: "http",
          exposureMode: "reverse-proxy",
        },
      },
      resourceEffectiveConfig: {
        schemaVersion: "resources.effective-config/v1",
        resourceId: "res_existing",
        environmentId: "env_existing",
        ownedEntries: [
          {
            key: "API_URL",
            value: "https://resource.example.test",
            scope: "resource",
            exposure: "runtime",
            isSecret: false,
            kind: "plain-config",
          },
          {
            key: "DATABASE_URL",
            value: "****",
            scope: "resource",
            exposure: "runtime",
            isSecret: true,
            kind: "secret",
          },
        ],
        effectiveEntries: [
          {
            key: "API_URL",
            value: "https://resource.example.test",
            scope: "resource",
            exposure: "runtime",
            isSecret: false,
            kind: "plain-config",
          },
          {
            key: "DATABASE_URL",
            value: "****",
            scope: "resource",
            exposure: "runtime",
            isSecret: true,
            kind: "secret",
          },
        ],
        overrides: [],
        precedence: [
          "defaults",
          "system",
          "organization",
          "project",
          "environment",
          "resource",
          "deployment",
        ],
        generatedAt: "2026-05-16T00:00:00.000Z",
      },
      deploymentSummaries: [
        {
          id: "dep_1",
          resourceId: "res_existing",
          status: "succeeded",
          runtimePlan: {
            execution: {},
          },
        },
      ],
    });

    try {
      await withBunEnv(
        {
          DATABASE_URL: "postgres://entry-user:entry-pass@example.test/app",
          GITHUB_HEAD_REF: undefined,
          GITHUB_REF: undefined,
          GITHUB_REPOSITORY: undefined,
          GITHUB_REPOSITORY_ID: undefined,
          GITHUB_SHA: undefined,
          GITHUB_WORKSPACE: undefined,
        },
        () =>
          withMutedProcessOutput(async () => {
            await harness.program.parseAsync([
              "node",
              "appaloft",
              "deploy",
              workspace,
              "--config",
              configPath,
              "--method",
              "workspace-commands",
              "--server-host",
              "203.0.113.10",
              "--server-provider",
              "generic-ssh",
              "--acknowledge-resource-profile-drift",
            ]);
          }),
      );
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }

    expect(harness.queries.map((query) => query.constructor.name)).toContain("ShowResourceQuery");
    expect(harness.queries.map((query) => query.constructor.name)).not.toContain(
      "ResourceEffectiveConfigQuery",
    );
    expect(
      harness.commands.find(
        (command) => command.constructor.name === "SetEnvironmentVariableCommand",
      ),
    ).toBeDefined();
    expect(
      harness.commands.find((command) => command.constructor.name === "CreateDeploymentCommand"),
    ).toMatchObject({
      projectId: "proj_existing",
      environmentId: "env_existing",
      resourceId: "res_existing",
      serverId: "srv_existing",
    });
  });

  test("[CONFIG-FILE-IMAGE-001] acknowledged existing resource deploy updates source before prebuilt image deployment", async () => {
    ensureReflectMetadata();
    const workspace = mkdtempSync(join(tmpdir(), "appaloft-existing-image-profile-"));
    const configPath = join(workspace, "appaloft.image.yml");
    writeFileSync(
      configPath,
      [
        "runtime:",
        "  strategy: prebuilt-image",
        "network:",
        "  internalPort: 3001",
        "  upstreamProtocol: http",
        "  exposureMode: direct-port",
        "  hostPort: 80",
        "",
      ].join("\n"),
    );
    const imageLocator = "docker://ghcr.io/acme/api@sha256:abc";
    const harness = await createPreviewDeployCliHarness({
      sourceLinkRecord: {
        projectId: "proj_existing",
        environmentId: "env_existing",
        resourceId: "res_existing",
        serverId: "srv_existing",
      },
      resourceDetail: {
        source: {
          kind: "local-folder",
          locator: workspace,
          displayName: workspace.split("/").at(-1) ?? "workspace",
        },
        runtimeProfile: {
          strategy: "dockerfile",
          dockerfilePath: "Dockerfile",
        },
        networkProfile: {
          internalPort: 3001,
          upstreamProtocol: "http",
          exposureMode: "direct-port",
          hostPort: 80,
        },
      },
      deploymentSummaries: [
        {
          id: "dep_1",
          resourceId: "res_existing",
          status: "succeeded",
          runtimePlan: {
            execution: {},
          },
        },
      ],
    });

    try {
      await withMutedProcessOutput(async () => {
        await harness.program.parseAsync([
          "node",
          "appaloft",
          "deploy",
          imageLocator,
          "--config",
          configPath,
          "--server-host",
          "203.0.113.10",
          "--server-provider",
          "generic-ssh",
          "--acknowledge-resource-profile-drift",
        ]);
      });
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }

    expect(
      harness.commands.find(
        (command) => command.constructor.name === "ConfigureResourceSourceCommand",
      ),
    ).toMatchObject({
      resourceId: "res_existing",
      source: {
        kind: "docker-image",
        locator: imageLocator,
      },
    });
    expect(
      harness.commands.find(
        (command) => command.constructor.name === "ConfigureResourceRuntimeCommand",
      ),
    ).toMatchObject({
      resourceId: "res_existing",
      runtimeProfile: {
        strategy: "prebuilt-image",
      },
    });
    expect(
      harness.commands.find((command) => command.constructor.name === "CreateDeploymentCommand"),
    ).toMatchObject({
      projectId: "proj_existing",
      environmentId: "env_existing",
      resourceId: "res_existing",
      serverId: "srv_existing",
    });
  });

  test("[CONFIG-FILE-ENTRY-015D] deploy action resolves explicit config and source from nested shell cwd", async () => {
    ensureReflectMetadata();
    const workspace = mkdtempSync(join(tmpdir(), "appaloft-explicit-config-shell-cwd-"));
    const expectedSourceLocator = realpathSync(workspace);
    const shellDirectory = join(workspace, "apps", "shell");
    mkdirSync(shellDirectory, { recursive: true });
    writeFileSync(
      join(workspace, "appaloft.docs.yml"),
      [
        "runtime:",
        "  strategy: static",
        "  installCommand: bun install --frozen-lockfile",
        "  buildCommand: APPALOFT_DOCS_BASE=/ APPALOFT_DOCS_SITE=https://docs.appaloft.com bun run --cwd apps/docs build",
        "  publishDirectory: apps/docs/dist",
        "network:",
        "  internalPort: 80",
        "  upstreamProtocol: http",
        "  exposureMode: reverse-proxy",
        "",
      ].join("\n"),
    );
    const harness = await createPreviewDeployCliHarness();

    try {
      await withProcessCwd(shellDirectory, () =>
        withMutedProcessOutput(async () => {
          await harness.program.parseAsync([
            "node",
            "appaloft",
            "deploy",
            ".",
            "--config",
            "appaloft.docs.yml",
            "--method",
            "static",
            "--server-host",
            "203.0.113.10",
            "--server-provider",
            "generic-ssh",
          ]);
        }),
      );
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }

    expect(
      harness.commands.find((command) => command.constructor.name === "CreateResourceCommand"),
    ).toMatchObject({
      source: {
        kind: "local-folder",
        locator: expectedSourceLocator,
      },
      runtimeProfile: {
        strategy: "static",
        installCommand: "bun install --frozen-lockfile",
        buildCommand:
          "APPALOFT_DOCS_BASE=/ APPALOFT_DOCS_SITE=https://docs.appaloft.com bun run --cwd apps/docs build",
        publishDirectory: "apps/docs/dist",
      },
    });

    expect(
      harness.commands.find((command) => command.constructor.name === "CreateDeploymentCommand"),
    ).toMatchObject({
      projectId: "proj_1",
      serverId: "srv_1",
      environmentId: "env_1",
      resourceId: "res_1",
    });
  });

  test("[CONFIG-FILE-ENTRY-017] deploy action PR preview domain template persists server-applied route intent", async () => {
    ensureReflectMetadata();
    const workspace = mkdtempSync(join(tmpdir(), "appaloft-preview-domain-"));
    const configPath = join(workspace, "appaloft.preview.yml");
    writeFileSync(
      configPath,
      [
        "runtime:",
        "  strategy: workspace-commands",
        "network:",
        "  internalPort: 4310",
        "  exposureMode: reverse-proxy",
        "",
      ].join("\n"),
    );
    const harness = await createPreviewDeployCliHarness({ withRouteStore: true });

    try {
      await withBunEnv(
        {
          GITHUB_REPOSITORY: "acme/app",
          GITHUB_REPOSITORY_ID: "R_preview_repo",
          GITHUB_REF: "refs/pull/123/merge",
          GITHUB_HEAD_REF: "feature/preview",
          GITHUB_SHA: "abc123",
          GITHUB_WORKSPACE: workspace,
        },
        () =>
          withMutedProcessOutput(async () => {
            await harness.program.parseAsync([
              "node",
              "appaloft",
              "deploy",
              workspace,
              "--config",
              configPath,
              "--preview",
              "pull-request",
              "--preview-id",
              "pr-123",
              "--preview-domain-template",
              "pr-123.preview.example.com",
              "--server-host",
              "203.0.113.10",
              "--server-provider",
              "generic-ssh",
            ]);
          }),
      );
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }

    expect(harness.desiredRoutes).toHaveLength(1);
    expect(harness.desiredRoutes[0]).toMatchObject({
      domains: [
        {
          host: "pr-123.preview.example.com",
          pathPrefix: "/",
          tlsMode: "auto",
        },
      ],
      target: {
        projectId: "proj_1",
        environmentId: "env_1",
        resourceId: "res_1",
        serverId: "srv_1",
      },
    });
    const deployment = harness.commands.find(
      (command) => command.constructor.name === "CreateDeploymentCommand",
    );
    expect("domains" in (deployment as Record<string, unknown>)).toBe(false);
    expect("tlsMode" in (deployment as Record<string, unknown>)).toBe(false);
  });

  test("[CONFIG-FILE-ENTRY-023] deploy action PR preview accepts a flag-only profile", async () => {
    ensureReflectMetadata();
    const workspace = mkdtempSync(join(tmpdir(), "appaloft-preview-flag-profile-"));
    const harness = await createPreviewDeployCliHarness({
      withRouteStore: true,
      deploymentSummaries: [
        {
          id: "dep_1",
          resourceId: "res_1",
          status: "succeeded",
          runtimePlan: {
            execution: {
              accessRoutes: [
                {
                  proxyKind: "traefik",
                  domains: ["pr-123.preview.example.com"],
                  pathPrefix: "/",
                  tlsMode: "disabled",
                },
              ],
            },
          },
        },
      ],
    });

    try {
      await withBunEnv(
        {
          APP_SECRET: "resolved-secret",
          GITHUB_REPOSITORY: "acme/app",
          GITHUB_REPOSITORY_ID: "R_preview_repo",
          GITHUB_REF: "refs/pull/123/merge",
          GITHUB_HEAD_REF: "feature/preview",
          GITHUB_SHA: "abc123",
          GITHUB_WORKSPACE: workspace,
          OPTIONAL_SECRET: undefined,
        },
        () =>
          withMutedProcessOutput(async () => {
            await harness.program.parseAsync([
              "node",
              "appaloft",
              "deploy",
              workspace,
              "--method",
              "workspace-commands",
              "--source-base-directory",
              "apps/api",
              "--install",
              "bun install --frozen-lockfile",
              "--build",
              "bun run build",
              "--start",
              "bun ./dist/server/entry.mjs",
              "--port",
              "4321",
              "--upstream-protocol",
              "http",
              "--exposure-mode",
              "reverse-proxy",
              "--health-path",
              "/",
              "--env",
              "HOST=0.0.0.0",
              "--env",
              "PORT=4321",
              "--secret",
              "APP_SECRET=ci-env:APP_SECRET",
              "--optional-secret",
              "OPTIONAL_SECRET=ci-env:OPTIONAL_SECRET",
              "--preview",
              "pull-request",
              "--preview-id",
              "pr-123",
              "--preview-domain-template",
              "pr-123.preview.example.com",
              "--preview-tls-mode",
              "disabled",
              "--require-preview-url",
              "--server-host",
              "203.0.113.10",
              "--server-provider",
              "generic-ssh",
            ]);
          }),
      );
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }

    expect(harness.operations).toContain("PrepareState:ssh-pglite");
    expect(harness.operations).toContain("ListDeploymentsQuery");
    const resource = harness.commands.find(
      (command) => command.constructor.name === "CreateResourceCommand",
    );
    expect(resource).toMatchObject({
      source: {
        baseDirectory: "apps/api",
      },
      runtimeProfile: {
        strategy: "workspace-commands",
        runtimeName: "preview-123",
        installCommand: "bun install --frozen-lockfile",
        buildCommand: "bun run build",
        startCommand: "bun ./dist/server/entry.mjs",
        healthCheckPath: "/",
      },
      networkProfile: {
        internalPort: 4321,
        upstreamProtocol: "http",
        exposureMode: "reverse-proxy",
      },
    });
    const variables = harness.commands.filter(
      (command) => command.constructor.name === "SetEnvironmentVariableCommand",
    );
    expect(variables).toEqual([
      expect.objectContaining({
        key: "HOST",
        value: "0.0.0.0",
        kind: "plain-config",
        isSecret: false,
      }),
      expect.objectContaining({
        key: "PORT",
        value: "4321",
        kind: "plain-config",
        isSecret: false,
      }),
      expect.objectContaining({
        key: "APP_SECRET",
        value: "resolved-secret",
        kind: "secret",
        isSecret: true,
      }),
    ]);
    expect(harness.desiredRoutes).toHaveLength(1);
    expect(harness.desiredRoutes[0]).toMatchObject({
      domains: [
        {
          host: "pr-123.preview.example.com",
          pathPrefix: "/",
          tlsMode: "disabled",
        },
      ],
    });
    const deployment = harness.commands.find(
      (command) => command.constructor.name === "CreateDeploymentCommand",
    );
    expect(deployment).toMatchObject({
      projectId: "proj_1",
      serverId: "srv_1",
      environmentId: "env_1",
      resourceId: "res_1",
    });
    expect("runtime" in (deployment as Record<string, unknown>)).toBe(false);
    expect("network" in (deployment as Record<string, unknown>)).toBe(false);
    expect("env" in (deployment as Record<string, unknown>)).toBe(false);
    expect("secrets" in (deployment as Record<string, unknown>)).toBe(false);
  });

  test("[CONFIG-FILE-ENTRY-023] deploy action PR preview flags override selected config profile values", async () => {
    ensureReflectMetadata();
    const workspace = mkdtempSync(join(tmpdir(), "appaloft-preview-flag-override-"));
    const configPath = join(workspace, "appaloft.preview.yml");
    writeFileSync(
      configPath,
      [
        "runtime:",
        "  strategy: workspace-commands",
        "  startCommand: bun run preview-config-start",
        "network:",
        "  internalPort: 3000",
        "env:",
        "  PORT: 3000",
        "",
      ].join("\n"),
    );
    const harness = await createPreviewDeployCliHarness();

    try {
      await withBunEnv(
        {
          GITHUB_REPOSITORY: "acme/app",
          GITHUB_REPOSITORY_ID: "R_preview_repo",
          GITHUB_REF: "refs/pull/125/merge",
          GITHUB_HEAD_REF: "feature/preview",
          GITHUB_SHA: "abc123",
          GITHUB_WORKSPACE: workspace,
        },
        () =>
          withMutedProcessOutput(async () => {
            await harness.program.parseAsync([
              "node",
              "appaloft",
              "deploy",
              workspace,
              "--config",
              configPath,
              "--start",
              "bun run preview-flag-start",
              "--port",
              "4321",
              "--env",
              "PORT=4321",
              "--preview",
              "pull-request",
              "--preview-id",
              "pr-125",
              "--server-host",
              "203.0.113.10",
              "--server-provider",
              "generic-ssh",
            ]);
          }),
      );
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }

    const resource = harness.commands.find(
      (command) => command.constructor.name === "CreateResourceCommand",
    );
    expect(resource).toMatchObject({
      runtimeProfile: {
        startCommand: "bun run preview-flag-start",
      },
      networkProfile: {
        internalPort: 4321,
      },
    });
    const variables = harness.commands.filter(
      (command) => command.constructor.name === "SetEnvironmentVariableCommand",
    );
    expect(variables).toEqual([
      expect.objectContaining({
        key: "PORT",
        value: "3000",
      }),
      expect.objectContaining({
        key: "PORT",
        value: "4321",
      }),
    ]);
  });

  test("[CONFIG-FILE-ENTRY-025] deploy action PR preview accepts empty-string environment overrides", async () => {
    ensureReflectMetadata();
    const workspace = mkdtempSync(join(tmpdir(), "appaloft-preview-empty-env-"));
    const sshKeyPath = join(workspace, "appaloft-preview.key");
    writeFileSync(
      sshKeyPath,
      "-----BEGIN OPENSSH PRIVATE KEY-----\nsecret\n-----END OPENSSH PRIVATE KEY-----\n",
    );
    writeFileSync(
      join(workspace, "appaloft.yml"),
      [
        "runtime:",
        "  strategy: workspace-commands",
        "  installCommand: bun install --frozen-lockfile",
        "  buildCommand: bun run build",
        "  startCommand: bun ./dist/server/entry.mjs",
        "  healthCheckPath: /",
        "network:",
        "  internalPort: 4321",
        "  upstreamProtocol: http",
        "  exposureMode: reverse-proxy",
        "access:",
        "  domains:",
        "    - host: www.appaloft.com",
        "      pathPrefix: /",
        "      tlsMode: auto",
        "env:",
        "  HOST: 0.0.0.0",
        '  PORT: "4321"',
        "  APPALOFT_BETTER_AUTH_URL: https://www.appaloft.com",
        "  APPALOFT_BETTER_AUTH_COOKIE_DOMAIN: .appaloft.com",
        "  APPALOFT_BETTER_AUTH_TRUSTED_ORIGINS: https://www.appaloft.com,https://appaloft.com",
        '  APPALOFT_BETTER_AUTH_TRUSTED_PROXY_HEADERS: "true"',
        "  APPALOFT_LOCALE_COOKIE_DOMAIN: .appaloft.com",
        "secrets:",
        "  APPALOFT_BETTER_AUTH_SECRET:",
        "    from: ci-env:APPALOFT_BETTER_AUTH_SECRET",
        "    required: true",
        "",
      ].join("\n"),
    );
    const harness = await createPreviewDeployCliHarness({
      withRouteStore: true,
      deploymentSummaries: [
        {
          id: "dep_1",
          resourceId: "res_1",
          status: "succeeded",
          runtimePlan: {
            execution: {
              accessRoutes: [
                {
                  proxyKind: "traefik",
                  domains: ["pr-5.preview.appaloft.com"],
                  pathPrefix: "/",
                  tlsMode: "auto",
                },
              ],
            },
          },
        },
      ],
    });

    try {
      await withBunEnv(
        {
          APPALOFT_BETTER_AUTH_SECRET: "resolved-secret",
          GITHUB_REPOSITORY: "appaloft/www",
          GITHUB_REPOSITORY_ID: "R_www_repo",
          GITHUB_REF: "refs/pull/5/merge",
          GITHUB_HEAD_REF: "fix/home-copy-layout",
          GITHUB_SHA: "abc123",
          GITHUB_WORKSPACE: workspace,
        },
        () =>
          withMutedProcessOutput(async () => {
            await harness.program.parseAsync([
              "node",
              "appaloft",
              "deploy",
              workspace,
              "--server-host",
              "203.0.113.10",
              "--server-provider",
              "generic-ssh",
              "--server-ssh-username",
              "root",
              "--server-ssh-private-key-file",
              sshKeyPath,
              "--server-proxy-kind",
              "traefik",
              "--state-backend",
              "ssh-pglite",
              "--method",
              "workspace-commands",
              "--install",
              "bun install --frozen-lockfile",
              "--build",
              "bun run build",
              "--start",
              "bun ./dist/server/entry.mjs",
              "--port",
              "4321",
              "--runtime-name",
              "preview-5",
              "--health-path",
              "/",
              "--upstream-protocol",
              "http",
              "--exposure-mode",
              "reverse-proxy",
              "--preview",
              "pull-request",
              "--preview-id",
              "pr-5",
              "--preview-domain-template",
              "5.preview.appaloft.com",
              "--preview-tls-mode",
              "auto",
              "--require-preview-url",
              "--env",
              "HOST=0.0.0.0",
              "--env",
              "PORT=4321",
              "--env",
              "APPALOFT_BETTER_AUTH_URL=https://5.preview.appaloft.com",
              "--env",
              "APPALOFT_BETTER_AUTH_TRUSTED_ORIGINS=https://5.preview.appaloft.com",
              "--env",
              "APPALOFT_BETTER_AUTH_COOKIE_DOMAIN=",
              "--env",
              "APPALOFT_BETTER_AUTH_TRUSTED_PROXY_HEADERS=true",
              "--env",
              "APPALOFT_LOCALE_COOKIE_DOMAIN=",
              "--secret",
              "APPALOFT_BETTER_AUTH_SECRET=ci-env:APPALOFT_BETTER_AUTH_SECRET",
            ]);
          }),
      );
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }

    const resource = harness.commands.find(
      (command) => command.constructor.name === "CreateResourceCommand",
    );
    expect(resource).toMatchObject({
      runtimeProfile: {
        runtimeName: "preview-5",
      },
    });
    const variables = harness.commands.filter(
      (command) => command.constructor.name === "SetEnvironmentVariableCommand",
    );
    expect(variables).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "APPALOFT_BETTER_AUTH_COOKIE_DOMAIN",
          value: "",
          kind: "plain-config",
          isSecret: false,
        }),
        expect.objectContaining({
          key: "APPALOFT_LOCALE_COOKIE_DOMAIN",
          value: "",
          kind: "plain-config",
          isSecret: false,
        }),
      ]),
    );
  });

  test("[CONFIG-FILE-ENTRY-024] deploy action PR preview require-preview-url fails without a public route", async () => {
    ensureReflectMetadata();
    const workspace = mkdtempSync(join(tmpdir(), "appaloft-preview-url-required-"));
    const harness = await createPreviewDeployCliHarness({
      withRouteStore: true,
      deploymentSummaries: [
        {
          id: "dep_1",
          resourceId: "res_1",
          status: "failed",
          runtimePlan: {
            execution: {
              accessRoutes: [],
            },
          },
        },
      ],
    });

    try {
      const result = await withBunEnv(
        {
          GITHUB_REPOSITORY: "acme/app",
          GITHUB_REPOSITORY_ID: "R_preview_repo",
          GITHUB_REF: "refs/pull/124/merge",
          GITHUB_HEAD_REF: "feature/preview",
          GITHUB_SHA: "abc123",
          GITHUB_WORKSPACE: workspace,
        },
        () =>
          withMutedProcessOutput(async () =>
            harness.program
              .parseAsync([
                "node",
                "appaloft",
                "deploy",
                workspace,
                "--method",
                "workspace-commands",
                "--start",
                "bun run start",
                "--port",
                "4321",
                "--preview",
                "pull-request",
                "--preview-id",
                "pr-124",
                "--preview-domain-template",
                "pr-124.preview.example.com",
                "--preview-tls-mode",
                "disabled",
                "--require-preview-url",
                "--server-host",
                "203.0.113.10",
                "--server-provider",
                "generic-ssh",
              ])
              .then(
                () => ({ ok: true as const }),
                (error: unknown) => ({ ok: false as const, error }),
              ),
          ),
      );

      expect(result.ok).toBe(false);
      if (result.ok) {
        throw new Error("Expected require-preview-url to fail");
      }
      const errorText = String(result.error);
      expect(errorText).toContain('"phase":"preview-access-resolution"');
      expect(errorText).toContain("preview_url_missing");
      expect(errorText).toContain("dep_1");
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  test("[CONFIG-FILE-ENTRY-024B] deploy action PR preview failure includes deployment log tail", async () => {
    ensureReflectMetadata();
    const workspace = mkdtempSync(join(tmpdir(), "appaloft-preview-url-failed-"));
    const harness = await createPreviewDeployCliHarness({
      withRouteStore: true,
      deploymentSummaries: [
        {
          id: "dep_1",
          resourceId: "res_1",
          status: "failed",
          logs: [
            {
              timestamp: "2026-05-17T11:48:38.000Z",
              source: "runtime",
              phase: "deploy",
              level: "error",
              message: "docker build failed: process killed",
            },
          ],
          runtimePlan: {
            execution: {
              accessRoutes: [
                {
                  domains: ["pr-124.preview.example.com"],
                  pathPrefix: "/",
                  tlsMode: "disabled",
                },
              ],
            },
          },
        },
      ],
    });

    try {
      const result = await withBunEnv(
        {
          GITHUB_REPOSITORY: "acme/app",
          GITHUB_REPOSITORY_ID: "R_preview_repo",
          GITHUB_REF: "refs/pull/124/merge",
          GITHUB_HEAD_REF: "feature/preview",
          GITHUB_SHA: "abc123",
          GITHUB_WORKSPACE: workspace,
        },
        () =>
          withMutedProcessOutput(async () =>
            harness.program
              .parseAsync([
                "node",
                "appaloft",
                "deploy",
                workspace,
                "--method",
                "workspace-commands",
                "--start",
                "bun run start",
                "--port",
                "4321",
                "--preview",
                "pull-request",
                "--preview-id",
                "pr-124",
                "--preview-domain-template",
                "pr-124.preview.example.com",
                "--preview-tls-mode",
                "disabled",
                "--require-preview-url",
                "--server-host",
                "203.0.113.10",
                "--server-provider",
                "generic-ssh",
              ])
              .then(
                () => ({ ok: true as const }),
                (error: unknown) => ({ ok: false as const, error }),
              ),
          ),
      );

      expect(result.ok).toBe(false);
      if (result.ok) {
        throw new Error("Expected require-preview-url to fail");
      }
      const errorText = String(result.error);
      expect(errorText).toContain('"phase":"preview-access-resolution"');
      expect(errorText).toContain('"reason":"deployment_failed"');
      expect(errorText).toContain("failureLogCount");
      expect(errorText).toContain("docker build failed: process killed");
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  test("[CONFIG-FILE-ENTRY-024C] synchronous deploy fails when runtime execution records terminal failure", async () => {
    ensureReflectMetadata();
    const workspace = mkdtempSync(join(tmpdir(), "appaloft-sync-deploy-failed-"));
    const harness = await createPreviewDeployCliHarness({
      deploymentSummaries: [
        {
          id: "dep_1",
          resourceId: "res_1",
          status: "failed",
          logs: [
            {
              timestamp: "2026-05-22T10:12:00.000Z",
              source: "runtime",
              phase: "package",
              level: "error",
              message: "client_loop: send disconnect: Broken pipe",
            },
            {
              timestamp: "2026-05-22T10:12:01.000Z",
              source: "runtime",
              phase: "package",
              level: "error",
              message: "SSH Docker image build failed",
            },
          ],
          runtimePlan: {
            execution: {
              accessRoutes: [],
            },
          },
        },
      ],
    });

    try {
      const result = await withMutedProcessOutput(async () =>
        harness.program
          .parseAsync([
            "node",
            "appaloft",
            "deploy",
            workspace,
            "--method",
            "workspace-commands",
            "--start",
            "bun run start",
            "--port",
            "4321",
            "--server-host",
            "203.0.113.10",
            "--server-provider",
            "generic-ssh",
          ])
          .then(
            () => ({ ok: true as const }),
            (error: unknown) => ({ ok: false as const, error }),
          ),
      );

      expect(result.ok).toBe(false);
      if (result.ok) {
        throw new Error("Expected synchronous failed deployment to fail");
      }
      const errorText = String(result.error);
      expect(errorText).toContain('"phase":"runtime-execution"');
      expect(errorText).toContain('"reason":"deployment_failed"');
      expect(errorText).toContain("client_loop: send disconnect: Broken pipe");
      expect(errorText).toContain("SSH Docker image build failed");
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  test("[CONFIG-FILE-ENTRY-026] deploy action PR preview writes action-safe preview output", async () => {
    ensureReflectMetadata();
    const workspace = mkdtempSync(join(tmpdir(), "appaloft-preview-output-"));
    const outputFile = join(workspace, "preview-output.txt");
    const harness = await createPreviewDeployCliHarness({
      withRouteStore: true,
      deploymentSummaries: [
        {
          id: "dep_1",
          resourceId: "res_1",
          status: "succeeded",
          runtimePlan: {
            execution: {
              accessRoutes: [
                {
                  proxyKind: "traefik",
                  domains: ["generated.preview.example.com"],
                  pathPrefix: "/",
                  tlsMode: "disabled",
                },
              ],
            },
          },
        },
      ],
    });

    try {
      await withBunEnv(
        {
          GITHUB_REPOSITORY: "acme/app",
          GITHUB_REPOSITORY_ID: "R_preview_repo",
          GITHUB_REF: "refs/pull/126/merge",
          GITHUB_HEAD_REF: "feature/preview",
          GITHUB_SHA: "abc123",
          GITHUB_WORKSPACE: workspace,
        },
        () =>
          withMutedProcessOutput(() =>
            harness.program.parseAsync([
              "node",
              "appaloft",
              "deploy",
              workspace,
              "--method",
              "workspace-commands",
              "--start",
              "bun run start",
              "--port",
              "4321",
              "--preview",
              "pull-request",
              "--preview-id",
              "pr-126",
              "--require-preview-url",
              "--preview-output-file",
              outputFile,
              "--server-host",
              "203.0.113.10",
              "--server-provider",
              "generic-ssh",
            ]),
          ),
      );

      expect(readFileSync(outputFile, "utf8")).toContain("schema-version=deploy.preview-output/v1");
      expect(readFileSync(outputFile, "utf8")).toContain("preview-id=pr-126");
      expect(readFileSync(outputFile, "utf8")).toContain(
        "preview-url=http://generated.preview.example.com",
      );
      expect(harness.operations).toContain("ListDeploymentsQuery");
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  test("[CONFIG-FILE-ENTRY-020] deploy action PR preview explicit config path ignores production root config", async () => {
    ensureReflectMetadata();
    const workspace = mkdtempSync(join(tmpdir(), "appaloft-preview-explicit-config-"));
    writeFileSync(
      join(workspace, "appaloft.yml"),
      [
        "runtime:",
        "  strategy: workspace-commands",
        "access:",
        "  domains:",
        "    - host: www.example.com",
        "",
      ].join("\n"),
    );
    const previewConfigPath = join(workspace, "appaloft.preview.yml");
    writeFileSync(
      previewConfigPath,
      ["runtime:", "  strategy: workspace-commands", "network:", "  internalPort: 4310", ""].join(
        "\n",
      ),
    );
    const harness = await createPreviewDeployCliHarness();

    try {
      await withBunEnv(
        {
          GITHUB_REPOSITORY: "acme/app",
          GITHUB_REPOSITORY_ID: "R_preview_repo",
          GITHUB_REF: "refs/pull/20/merge",
          GITHUB_HEAD_REF: "feature/preview-config",
          GITHUB_SHA: "abc123",
          GITHUB_WORKSPACE: workspace,
        },
        () =>
          withMutedProcessOutput(async () => {
            await harness.program.parseAsync([
              "node",
              "appaloft",
              "deploy",
              workspace,
              "--config",
              previewConfigPath,
              "--preview",
              "pull-request",
              "--preview-id",
              "pr-20",
              "--server-host",
              "203.0.113.10",
              "--server-provider",
              "generic-ssh",
            ]);
          }),
      );
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }

    expect(harness.desiredRoutes).toHaveLength(0);
    expect(harness.operations).not.toContain("UpsertServerAppliedRoutes");
    expect(harness.sourceLinkCalls.some((call) => call.includes("appaloft.preview.yml"))).toBe(
      true,
    );
    expect(harness.sourceLinkCalls.some((call) => call.includes("appaloft.yml"))).toBe(false);
  });

  test("[CONFIG-FILE-ENTRY-021] deploy action PR preview does not reinterpret implicit root production domains", async () => {
    ensureReflectMetadata();
    const workspace = mkdtempSync(join(tmpdir(), "appaloft-preview-root-domain-"));
    writeFileSync(
      join(workspace, "appaloft.yml"),
      [
        "runtime:",
        "  strategy: workspace-commands",
        "network:",
        "  internalPort: 4310",
        "  exposureMode: reverse-proxy",
        "access:",
        "  domains:",
        "    - host: www.example.com",
        "      tlsMode: disabled",
        "",
      ].join("\n"),
    );
    const harness = await createPreviewDeployCliHarness();

    try {
      await withBunEnv(
        {
          GITHUB_REPOSITORY: "acme/app",
          GITHUB_REPOSITORY_ID: "R_preview_repo",
          GITHUB_REF: "refs/pull/21/merge",
          GITHUB_HEAD_REF: "feature/implicit-root",
          GITHUB_SHA: "abc123",
          GITHUB_WORKSPACE: workspace,
        },
        () =>
          withMutedProcessOutput(async () => {
            await harness.program.parseAsync([
              "node",
              "appaloft",
              "deploy",
              workspace,
              "--preview",
              "pull-request",
              "--preview-id",
              "pr-21",
              "--server-host",
              "203.0.113.10",
              "--server-provider",
              "generic-ssh",
            ]);
          }),
      );
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }

    expect(harness.desiredRoutes).toHaveLength(0);
    expect(harness.operations).not.toContain("UpsertServerAppliedRoutes");
    const deployment = harness.commands.find(
      (command) => command.constructor.name === "CreateDeploymentCommand",
    );
    expect(deployment).toMatchObject({
      projectId: "proj_1",
      serverId: "srv_1",
      environmentId: "env_1",
      resourceId: "res_1",
    });
  });

  test("[CONFIG-FILE-PREVIEW-OVERLAY-003] ordinary config deploy ignores PR preview profile overlay", async () => {
    ensureReflectMetadata();
    const workspace = mkdtempSync(join(tmpdir(), "appaloft-preview-overlay-ordinary-"));
    const configPath = join(workspace, "appaloft.yml");
    writeFileSync(
      configPath,
      [
        "runtime:",
        "  strategy: workspace-commands",
        "  startCommand: bun run start",
        "network:",
        "  internalPort: 3000",
        "env:",
        "  APP_ENV: production",
        "preview:",
        "  pullRequest:",
        "    profile:",
        "      runtime:",
        "        startCommand: bun run preview",
        "      network:",
        "        internalPort: 3001",
        "      env:",
        "        APP_ENV: preview",
      ].join("\n"),
    );
    const harness = await createPreviewDeployCliHarness();

    try {
      await withMutedProcessOutput(async () => {
        await harness.program.parseAsync([
          "node",
          "appaloft",
          "deploy",
          workspace,
          "--config",
          configPath,
          "--server-host",
          "203.0.113.10",
          "--server-provider",
          "generic-ssh",
        ]);
      });
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }

    const resource = harness.commands.find(
      (command) => command.constructor.name === "CreateResourceCommand",
    );
    expect(resource).toMatchObject({
      runtimeProfile: {
        startCommand: "bun run start",
      },
      networkProfile: {
        internalPort: 3000,
      },
    });
    const variable = harness.commands.find(
      (command) => command.constructor.name === "SetEnvironmentVariableCommand",
    );
    expect(variable).toMatchObject({
      key: "APP_ENV",
      value: "production",
      kind: "plain-config",
    });
  });

  test("[CONFIG-FILE-PREVIEW-OVERLAY-004] PR preview applies selected profile overlay before ids-only deployment", async () => {
    ensureReflectMetadata();
    const workspace = mkdtempSync(join(tmpdir(), "appaloft-preview-overlay-selected-"));
    const configPath = join(workspace, "appaloft.yml");
    writeFileSync(
      configPath,
      [
        "runtime:",
        "  strategy: workspace-commands",
        "  startCommand: bun run start",
        "network:",
        "  internalPort: 3000",
        "env:",
        "  APP_ENV: production",
        "preview:",
        "  pullRequest:",
        "    profile:",
        "      runtime:",
        "        name: preview-{pr_number}",
        "        startCommand: bun run preview",
        "      network:",
        "        internalPort: 3001",
        "      health:",
        "        path: /preview-ready",
        "      env:",
        "        APP_ENV: preview-{pr_number}",
      ].join("\n"),
    );
    const harness = await createPreviewDeployCliHarness();

    try {
      await withBunEnv(
        {
          GITHUB_HEAD_REF: "feature/preview-overlay",
        },
        () =>
          withMutedProcessOutput(async () => {
            await harness.program.parseAsync([
              "node",
              "appaloft",
              "deploy",
              workspace,
              "--config",
              configPath,
              "--preview",
              "pull-request",
              "--preview-id",
              "pr-44",
              "--server-host",
              "203.0.113.10",
              "--server-provider",
              "generic-ssh",
            ]);
          }),
      );
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }

    const resource = harness.commands.find(
      (command) => command.constructor.name === "CreateResourceCommand",
    );
    expect(resource).toMatchObject({
      runtimeProfile: {
        strategy: "workspace-commands",
        runtimeName: "preview-44",
        startCommand: "bun run preview",
        healthCheckPath: "/preview-ready",
      },
      networkProfile: {
        internalPort: 3001,
      },
    });
    const variable = harness.commands.find(
      (command) => command.constructor.name === "SetEnvironmentVariableCommand",
    );
    expect(variable).toMatchObject({
      key: "APP_ENV",
      value: "preview-44",
      kind: "plain-config",
    });
    const deployment = harness.commands.find(
      (command) => command.constructor.name === "CreateDeploymentCommand",
    );
    expect(deployment).toMatchObject({
      projectId: "proj_1",
      serverId: "srv_1",
      environmentId: "env_1",
      resourceId: "res_1",
    });
    expect("runtimeProfile" in (deployment as Record<string, unknown>)).toBe(false);
    expect("networkProfile" in (deployment as Record<string, unknown>)).toBe(false);
  });

  test("[CONFIG-FILE-NAMED-PROFILE-003] ordinary config deploy ignores unselected named profiles", async () => {
    ensureReflectMetadata();
    const workspace = mkdtempSync(join(tmpdir(), "appaloft-named-profile-unselected-"));
    const configPath = join(workspace, "appaloft.yml");
    writeFileSync(
      configPath,
      [
        "runtime:",
        "  strategy: workspace-commands",
        "  startCommand: bun run start",
        "network:",
        "  internalPort: 3000",
        "env:",
        "  APP_ENV: production",
        "profiles:",
        "  staging:",
        "    runtime:",
        "      startCommand: bun run staging",
        "    network:",
        "      internalPort: 3001",
        "    env:",
        "      APP_ENV: staging",
      ].join("\n"),
    );
    const harness = await createPreviewDeployCliHarness();

    try {
      await withMutedProcessOutput(async () => {
        await harness.program.parseAsync([
          "node",
          "appaloft",
          "deploy",
          workspace,
          "--config",
          configPath,
          "--server-host",
          "203.0.113.10",
          "--server-provider",
          "generic-ssh",
        ]);
      });
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }

    const resource = harness.commands.find(
      (command) => command.constructor.name === "CreateResourceCommand",
    );
    expect(resource).toMatchObject({
      runtimeProfile: {
        startCommand: "bun run start",
      },
      networkProfile: {
        internalPort: 3000,
      },
    });
    const variable = harness.commands.find(
      (command) => command.constructor.name === "SetEnvironmentVariableCommand",
    );
    expect(variable).toMatchObject({
      key: "APP_ENV",
      value: "production",
      kind: "plain-config",
    });
  });

  test("[CONFIG-FILE-NAMED-PROFILE-004] selected named profile applies before ids-only deployment", async () => {
    ensureReflectMetadata();
    const workspace = mkdtempSync(join(tmpdir(), "appaloft-named-profile-selected-"));
    const configPath = join(workspace, "appaloft.yml");
    writeFileSync(
      configPath,
      [
        "runtime:",
        "  strategy: workspace-commands",
        "  startCommand: bun run start",
        "network:",
        "  internalPort: 3000",
        "env:",
        "  APP_ENV: production",
        "profiles:",
        "  staging:",
        "    runtime:",
        "      startCommand: bun run staging",
        "    network:",
        "      internalPort: 3001",
        "    health:",
        "      path: /staging-ready",
        "    env:",
        "      APP_ENV: staging",
      ].join("\n"),
    );
    const harness = await createPreviewDeployCliHarness();

    try {
      await withMutedProcessOutput(async () => {
        await harness.program.parseAsync([
          "node",
          "appaloft",
          "deploy",
          workspace,
          "--config",
          configPath,
          "--config-profile",
          "staging",
          "--server-host",
          "203.0.113.10",
          "--server-provider",
          "generic-ssh",
        ]);
      });
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }

    const resource = harness.commands.find(
      (command) => command.constructor.name === "CreateResourceCommand",
    );
    expect(resource).toMatchObject({
      runtimeProfile: {
        strategy: "workspace-commands",
        startCommand: "bun run staging",
        healthCheckPath: "/staging-ready",
      },
      networkProfile: {
        internalPort: 3001,
      },
    });
    const variable = harness.commands.find(
      (command) => command.constructor.name === "SetEnvironmentVariableCommand",
    );
    expect(variable).toMatchObject({
      key: "APP_ENV",
      value: "staging",
      kind: "plain-config",
    });
    const deployment = harness.commands.find(
      (command) => command.constructor.name === "CreateDeploymentCommand",
    );
    expect(deployment).toMatchObject({
      projectId: "proj_1",
      serverId: "srv_1",
      environmentId: "env_1",
      resourceId: "res_1",
    });
    expect("runtimeProfile" in (deployment as Record<string, unknown>)).toBe(false);
    expect("networkProfile" in (deployment as Record<string, unknown>)).toBe(false);
  });

  test("[CONFIG-FILE-NAMED-PROFILE-005] missing selected named profile fails before mutation", async () => {
    ensureReflectMetadata();
    const workspace = mkdtempSync(join(tmpdir(), "appaloft-named-profile-missing-"));
    const configPath = join(workspace, "appaloft.yml");
    writeFileSync(
      configPath,
      [
        "runtime:",
        "  strategy: workspace-commands",
        "  startCommand: bun run start",
        "profiles:",
        "  staging:",
        "    env:",
        "      APP_ENV: staging",
      ].join("\n"),
    );
    const harness = await createPreviewDeployCliHarness();

    try {
      const result = await withMutedProcessOutput(() =>
        harness.program
          .parseAsync([
            "node",
            "appaloft",
            "deploy",
            workspace,
            "--config",
            configPath,
            "--config-profile",
            "production",
            "--server-host",
            "203.0.113.10",
            "--server-provider",
            "generic-ssh",
          ])
          .then(
            () => ({ ok: true as const }),
            (error: unknown) => ({ ok: false as const, error }),
          ),
      );

      expect(result.ok).toBe(false);
      if (result.ok) {
        throw new Error("Expected missing config profile to fail before mutation");
      }
      const errorText = String(result.error);
      expect(errorText).toContain('"code":"validation_error"');
      expect(errorText).toContain('"phase":"config-profile-resolution"');
      expect(errorText).toContain("production");
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }

    expect(harness.commands).toHaveLength(0);
  });

  test("[CONFIG-FILE-NAMED-PROFILE-006] trusted flags override selected named profile values", async () => {
    ensureReflectMetadata();
    const workspace = mkdtempSync(join(tmpdir(), "appaloft-named-profile-flag-override-"));
    const configPath = join(workspace, "appaloft.yml");
    writeFileSync(
      configPath,
      [
        "runtime:",
        "  strategy: workspace-commands",
        "  startCommand: bun run start",
        "network:",
        "  internalPort: 3000",
        "env:",
        "  APP_ENV: production",
        "profiles:",
        "  staging:",
        "    network:",
        "      internalPort: 3001",
        "    env:",
        "      APP_ENV: staging",
      ].join("\n"),
    );
    const harness = await createPreviewDeployCliHarness();

    try {
      await withMutedProcessOutput(async () => {
        await harness.program.parseAsync([
          "node",
          "appaloft",
          "deploy",
          workspace,
          "--config",
          configPath,
          "--config-profile",
          "staging",
          "--port",
          "3002",
          "--env",
          "APP_ENV=flag",
          "--server-host",
          "203.0.113.10",
          "--server-provider",
          "generic-ssh",
        ]);
      });
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }

    const resource = harness.commands.find(
      (command) => command.constructor.name === "CreateResourceCommand",
    );
    expect(resource).toMatchObject({
      networkProfile: {
        internalPort: 3002,
      },
    });
    const variables = harness.commands.filter(
      (command) => command.constructor.name === "SetEnvironmentVariableCommand",
    );
    expect(variables.at(-1)).toMatchObject({
      key: "APP_ENV",
      value: "flag",
      kind: "plain-config",
    });
  });

  test("[CONFIG-FILE-ENTRY-001] config env variables dispatch before ids-only deployment input returns", async () => {
    ensureReflectMetadata();
    const { resolveInteractiveDeploymentInput } = await import(
      "../src/commands/deployment-interaction"
    );
    const { CliRuntime } = await import("../src/runtime");

    const commands: string[] = [];
    const queries: string[] = [];
    const runtime = Layer.succeed(CliRuntime, {
      version: "test",
      startServer: async () => {},
      executeCommand: async <T>(message: AppCommand<T>) => {
        commands.push(message.constructor.name);
        return ok(null as T);
      },
      executeQuery: async <T>(message: AppQuery<T>) => {
        queries.push(message.constructor.name);
        return ok({ items: [] } as T);
      },
    });

    const input = await Effect.runPromise(
      Effect.provide(
        resolveInteractiveDeploymentInput({
          sourceLocator: ".",
          deploymentMethod: "workspace-commands",
          projectId: "proj_existing",
          serverId: "srv_existing",
          environmentId: "env_existing",
          resourceId: "res_existing",
          environmentVariables: [
            {
              key: "PUBLIC_MODE",
              value: "demo",
              kind: "plain-config",
              exposure: "build-time",
              scope: "environment",
              isSecret: false,
            },
            {
              key: "DATABASE_URL",
              value: "postgres://user:pass@example.test/app",
              kind: "secret",
              exposure: "runtime",
              scope: "environment",
              isSecret: true,
            },
          ],
        }),
        runtime,
      ),
    );

    expect(queries).toEqual(["ListProjectsQuery", "ListServersQuery"]);
    expect(commands).toEqual(["SetEnvironmentVariableCommand", "SetEnvironmentVariableCommand"]);
    expect(input).toEqual({
      projectId: "proj_existing",
      serverId: "srv_existing",
      environmentId: "env_existing",
      resourceId: "res_existing",
    });
  });

  test("[CONFIG-FILE-PROFILE-003A] acknowledged config health policy configures existing Resource before ids-only deployment", async () => {
    ensureReflectMetadata();
    const { defaultHttpHealthCheckPolicy, resolveInteractiveDeploymentInput } = await import(
      "../src/commands/deployment-interaction"
    );
    const { CliRuntime } = await import("../src/runtime");

    const commands: AppCommand<unknown>[] = [];
    const runtime = Layer.succeed(CliRuntime, {
      version: "test",
      startServer: async () => {},
      executeCommand: async <T>(message: AppCommand<T>) => {
        commands.push(message as AppCommand<unknown>);
        return ok({ id: "res_existing" } as T);
      },
      executeQuery: async <T>(message: AppQuery<T>) => {
        if (message.constructor.name === "ShowResourceQuery") {
          return ok({
            runtimeProfile: {
              strategy: "workspace-commands",
            },
          } as T);
        }
        return ok({ items: [] } as T);
      },
    });
    const healthCheck = defaultHttpHealthCheckPolicy({ path: "/ready" });

    const input = await Effect.runPromise(
      Effect.provide(
        resolveInteractiveDeploymentInput({
          sourceLocator: ".",
          deploymentMethod: "workspace-commands",
          projectId: "proj_existing",
          serverId: "srv_existing",
          environmentId: "env_existing",
          resourceId: "res_existing",
          healthCheckPath: "/ready",
          healthCheck,
        }),
        runtime,
      ),
    );

    expect(commands.map((command) => command.constructor.name)).toEqual([
      "ConfigureResourceHealthCommand",
    ]);
    expect(commands[0]).toMatchObject({
      resourceId: "res_existing",
      healthCheck,
    });
    expect(input).toEqual({
      projectId: "proj_existing",
      serverId: "srv_existing",
      environmentId: "env_existing",
      resourceId: "res_existing",
    });
  });

  test("[CONFIG-FILE-PROFILE-003B] config health policy is idempotent for existing Resource", async () => {
    ensureReflectMetadata();
    const { defaultHttpHealthCheckPolicy, resolveInteractiveDeploymentInput } = await import(
      "../src/commands/deployment-interaction"
    );
    const { CliRuntime } = await import("../src/runtime");

    const commands: AppCommand<unknown>[] = [];
    const healthCheck = defaultHttpHealthCheckPolicy({ path: "/ready" });
    const runtime = Layer.succeed(CliRuntime, {
      version: "test",
      startServer: async () => {},
      executeCommand: async <T>(message: AppCommand<T>) => {
        commands.push(message as AppCommand<unknown>);
        return ok({ id: "res_existing" } as T);
      },
      executeQuery: async <T>(message: AppQuery<T>) => {
        if (message.constructor.name === "ShowResourceQuery") {
          return ok({
            runtimeProfile: {
              strategy: "workspace-commands",
              healthCheckPath: "/ready",
              healthCheck,
            },
          } as T);
        }
        return ok({ items: [] } as T);
      },
    });

    const input = await Effect.runPromise(
      Effect.provide(
        resolveInteractiveDeploymentInput({
          sourceLocator: ".",
          deploymentMethod: "workspace-commands",
          projectId: "proj_existing",
          serverId: "srv_existing",
          environmentId: "env_existing",
          resourceId: "res_existing",
          healthCheckPath: "/ready",
          healthCheck,
        }),
        runtime,
      ),
    );

    expect(commands).toHaveLength(0);
    expect(input).toEqual({
      projectId: "proj_existing",
      serverId: "srv_existing",
      environmentId: "env_existing",
      resourceId: "res_existing",
    });
  });

  test("[CONFIG-FILE-DEPENDENCY-004][CONFIG-FILE-DEPENDENCY-007] config dependencies provision, bind, and record preview provenance before deployment", async () => {
    ensureReflectMetadata();
    const workspace = mkdtempSync(join(tmpdir(), "appaloft-dependency-config-"));
    const configPath = join(workspace, "appaloft.preview.yml");
    writeFileSync(
      configPath,
      [
        "runtime:",
        "  strategy: workspace-commands",
        "dependencies:",
        "  db:",
        "    kind: postgres",
        "    source: managed",
        "    bind:",
        "      env: DATABASE_URL",
        "    preview:",
        "      lifecycle: ephemeral",
        "",
      ].join("\n"),
    );
    const harness = await createPreviewDeployCliHarness();

    try {
      await withBunEnv(
        {
          GITHUB_REPOSITORY: "acme/api",
          GITHUB_REPOSITORY_ID: "R_dependency_repo",
          GITHUB_REF: "refs/heads/main",
          GITHUB_HEAD_REF: "feature/db",
          GITHUB_SHA: "abc123",
          GITHUB_WORKSPACE: workspace,
        },
        () =>
          withMutedProcessOutput(async () => {
            await harness.program.parseAsync([
              "node",
              "appaloft",
              "deploy",
              workspace,
              "--config",
              configPath,
              "--preview",
              "pull-request",
              "--preview-id",
              "pr-77",
              "--server-host",
              "203.0.113.77",
              "--server-provider",
              "generic-ssh",
            ]);
          }),
      );
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }

    expect(harness.operations).toContain("ListDependencyResourcesQuery");
    expect(harness.operations).toContain("ListResourceDependencyBindingsQuery");
    expect(harness.operations.indexOf("ProvisionDependencyResourceCommand")).toBeLessThan(
      harness.operations.indexOf("BindResourceDependencyCommand"),
    );
    expect(harness.operations.indexOf("BindResourceDependencyCommand")).toBeLessThan(
      harness.operations.indexOf("CreateDeploymentCommand"),
    );
    const deployment = harness.commands.find(
      (command) => command.constructor.name === "CreateDeploymentCommand",
    ) as Record<string, unknown> | undefined;
    expect(deployment).toMatchObject({
      projectId: "proj_1",
      serverId: "srv_1",
      environmentId: "env_1",
      resourceId: "res_1",
    });
    expect(deployment).not.toHaveProperty("dependencyResourceId");
    expect(deployment).not.toHaveProperty("targetName");
    expect(harness.dependencyProvenanceWrites).toHaveLength(1);
    expect(harness.dependencyProvenanceWrites[0]).toMatchObject({
      target: {
        projectId: "proj_1",
        environmentId: "env_1",
        resourceId: "res_1",
        serverId: "srv_1",
      },
      dependencyProvenance: {
        source: "repository-config",
        entries: [
          {
            key: "db",
            kind: "postgres",
            source: "managed",
            lifecycle: "ephemeral",
            resourceId: "res_1",
            dependencyResourceId: "dep_res_db",
            bindingId: "rbd_db",
            targetName: "DATABASE_URL",
          },
        ],
      },
    });
  });

  test("[CONFIG-FILE-DEPENDENCY-010] config dependencies support Redis managed kind", async () => {
    ensureReflectMetadata();
    const workspace = mkdtempSync(join(tmpdir(), "appaloft-redis-dependency-config-"));
    const configPath = join(workspace, "appaloft.preview.yml");
    writeFileSync(
      configPath,
      [
        "runtime:",
        "  strategy: workspace-commands",
        "dependencies:",
        "  cache:",
        "    kind: redis",
        "    source: managed",
        "    bind:",
        "      env: REDIS_URL",
        "    preview:",
        "      lifecycle: ephemeral",
        "",
      ].join("\n"),
    );
    const harness = await createPreviewDeployCliHarness();

    try {
      await withBunEnv(
        {
          GITHUB_REPOSITORY: "acme/api",
          GITHUB_REPOSITORY_ID: "R_redis_dependency_repo",
          GITHUB_REF: "refs/heads/main",
          GITHUB_HEAD_REF: "feature/cache",
          GITHUB_SHA: "def456",
          GITHUB_WORKSPACE: workspace,
        },
        () =>
          withMutedProcessOutput(async () => {
            await harness.program.parseAsync([
              "node",
              "appaloft",
              "deploy",
              workspace,
              "--config",
              configPath,
              "--preview",
              "pull-request",
              "--preview-id",
              "pr-88",
              "--server-host",
              "203.0.113.88",
              "--server-provider",
              "generic-ssh",
            ]);
          }),
      );
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }

    const listDependencyResources = harness.queries.find(
      (query) => query.constructor.name === "ListDependencyResourcesQuery",
    ) as Record<string, unknown> | undefined;
    expect(listDependencyResources).toMatchObject({
      kind: "redis",
    });
    const provisionDependency = harness.commands.find(
      (command) => command.constructor.name === "ProvisionDependencyResourceCommand",
    ) as Record<string, unknown> | undefined;
    expect(provisionDependency).toMatchObject({
      kind: "redis",
    });
    const bindDependency = harness.commands.find(
      (command) => command.constructor.name === "BindResourceDependencyCommand",
    ) as Record<string, unknown> | undefined;
    expect(bindDependency).toMatchObject({
      targetName: "REDIS_URL",
    });
    expect(harness.dependencyProvenanceWrites[0]).toMatchObject({
      dependencyProvenance: {
        entries: [
          {
            key: "cache",
            kind: "redis",
            targetName: "REDIS_URL",
          },
        ],
      },
    });
  });

  test("[CONFIG-FILE-DEPENDENCY-BACKUP-003] config dependency backup policy configures before deployment admission", async () => {
    ensureReflectMetadata();
    const workspace = mkdtempSync(join(tmpdir(), "appaloft-dependency-backup-config-"));
    const configPath = join(workspace, "appaloft.yml");
    writeFileSync(
      configPath,
      [
        "runtime:",
        "  strategy: workspace-commands",
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
        "      retryOnFailure: false",
        "",
      ].join("\n"),
    );
    const harness = await createPreviewDeployCliHarness();

    try {
      await withMutedProcessOutput(async () => {
        await harness.program.parseAsync([
          "node",
          "appaloft",
          "deploy",
          workspace,
          "--config",
          configPath,
          "--server-host",
          "203.0.113.78",
          "--server-provider",
          "generic-ssh",
        ]);
      });
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }

    expect(harness.operations).toContain("ListDependencyResourceBackupPoliciesQuery");
    expect(
      harness.operations.indexOf("ConfigureDependencyResourceBackupPolicyCommand"),
    ).toBeLessThan(harness.operations.indexOf("BindResourceDependencyCommand"));
    expect(harness.operations.indexOf("BindResourceDependencyCommand")).toBeLessThan(
      harness.operations.indexOf("CreateDeploymentCommand"),
    );
    const backupPolicy = harness.commands.find(
      (command) => command.constructor.name === "ConfigureDependencyResourceBackupPolicyCommand",
    ) as { input?: Record<string, unknown> } | undefined;
    expect(backupPolicy?.input).toMatchObject({
      dependencyResourceId: "dep_res_db",
      retentionDays: 7,
      scheduleIntervalHours: 24,
      retryOnFailure: false,
      enabled: true,
    });
    expect(String(backupPolicy?.input?.policyId)).toStartWith("dbp_cfg_");
    const deployment = harness.commands.find(
      (command) => command.constructor.name === "CreateDeploymentCommand",
    ) as Record<string, unknown> | undefined;
    expect(deployment).not.toHaveProperty("backup");
    expect(deployment).not.toHaveProperty("backupPolicy");
    expect(deployment).not.toHaveProperty("backupPolicyId");
  });

  test("[CONFIG-FILE-DEPENDENCY-005] config dependencies reuse existing managed resource and binding", async () => {
    ensureReflectMetadata();
    const { resolveInteractiveDeploymentInput } = await import(
      "../src/commands/deployment-interaction"
    );
    const { CliRuntime } = await import("../src/runtime");

    const commands: string[] = [];
    const runtime = Layer.succeed(CliRuntime, {
      version: "test",
      startServer: async () => {},
      executeCommand: async <T>(message: AppCommand<T>) => {
        commands.push(message.constructor.name);
        return ok(null as T);
      },
      executeQuery: async <T>(message: AppQuery<T>) => {
        if (message.constructor.name === "ListDependencyResourcesQuery") {
          return ok({
            items: [
              {
                id: "dep_res_existing_db",
                projectId: "proj_existing",
                environmentId: "env_existing",
                name: "res-existing-db",
                slug: "res-existing-db",
                kind: "postgres",
                sourceMode: "appaloft-managed",
                providerKey: "generic-ssh",
                providerManaged: true,
                lifecycleStatus: "ready",
                bindingReadiness: { status: "ready" },
                createdAt: "2026-05-24T00:00:00.000Z",
              },
            ],
          } as T);
        }
        if (message.constructor.name === "ListResourceDependencyBindingsQuery") {
          return ok({
            items: [
              {
                id: "rbd_existing_db",
                projectId: "proj_existing",
                environmentId: "env_existing",
                resourceId: "res_existing",
                dependencyResourceId: "dep_res_existing_db",
                kind: "postgres",
                sourceMode: "appaloft-managed",
                providerKey: "generic-ssh",
                providerManaged: true,
                lifecycleStatus: "ready",
                target: {
                  targetName: "DATABASE_URL",
                  scope: "runtime-only",
                  injectionMode: "env",
                },
                bindingReadiness: { status: "ready" },
                snapshotReadiness: { status: "deferred" },
                status: "active",
                createdAt: "2026-05-24T00:00:00.000Z",
              },
            ],
          } as T);
        }
        return ok({ items: [] } as T);
      },
    });

    const input = await Effect.runPromise(
      Effect.provide(
        resolveInteractiveDeploymentInput({
          sourceLocator: ".",
          deploymentMethod: "workspace-commands",
          projectId: "proj_existing",
          serverId: "srv_existing",
          environmentId: "env_existing",
          resourceId: "res_existing",
          dependencyGraph: [
            {
              key: "db",
              kind: "postgres",
              source: "managed",
              bindEnv: "DATABASE_URL",
            },
          ],
        }),
        runtime,
      ),
    );

    expect(input).toEqual({
      projectId: "proj_existing",
      serverId: "srv_existing",
      environmentId: "env_existing",
      resourceId: "res_existing",
    });
    expect(commands).not.toContain("ProvisionDependencyResourceCommand");
    expect(commands).not.toContain("BindResourceDependencyCommand");
  });

  test("[CONFIG-FILE-DEPENDENCY-BACKUP-004] config dependency backup policy is idempotent for matching owned policy", async () => {
    ensureReflectMetadata();
    const { resolveInteractiveDeploymentInput } = await import(
      "../src/commands/deployment-interaction"
    );
    const { CliRuntime } = await import("../src/runtime");
    const dependencyResourceId = "dep_res_existing_db";
    const ownedPolicyId = repositoryConfigBackupPolicyIdForTest(dependencyResourceId);
    const commands: string[] = [];
    const runtime = Layer.succeed(CliRuntime, {
      version: "test",
      startServer: async () => {},
      executeCommand: async <T>(message: AppCommand<T>) => {
        commands.push(message.constructor.name);
        return ok(null as T);
      },
      executeQuery: async <T>(message: AppQuery<T>) => {
        if (message.constructor.name === "ListDependencyResourcesQuery") {
          return ok({
            items: [
              {
                id: dependencyResourceId,
                projectId: "proj_existing",
                environmentId: "env_existing",
                name: "res-existing-db",
                slug: "res-existing-db",
                kind: "postgres",
                sourceMode: "appaloft-managed",
                providerKey: "generic-ssh",
                providerManaged: true,
                lifecycleStatus: "ready",
                bindingReadiness: { status: "ready" },
                createdAt: "2026-05-24T00:00:00.000Z",
              },
            ],
          } as T);
        }
        if (message.constructor.name === "ListDependencyResourceBackupPoliciesQuery") {
          return ok({
            items: [
              {
                schemaVersion: "dependency-resource-backup-policies.policy/v1",
                id: ownedPolicyId,
                version: "v1",
                dependencyResourceId,
                retentionDays: 7,
                scheduleIntervalHours: 24,
                providerKey: null,
                retryOnFailure: true,
                enabled: true,
                lastRunAt: null,
                nextRunAt: "2026-05-24T00:00:00.000Z",
                updatedAt: "2026-05-24T00:00:00.000Z",
              },
            ],
          } as T);
        }
        if (message.constructor.name === "ListResourceDependencyBindingsQuery") {
          return ok({
            items: [
              {
                id: "rbd_existing_db",
                projectId: "proj_existing",
                environmentId: "env_existing",
                resourceId: "res_existing",
                dependencyResourceId,
                kind: "postgres",
                sourceMode: "appaloft-managed",
                providerManaged: true,
                lifecycleStatus: "ready",
                target: {
                  targetName: "DATABASE_URL",
                  scope: "runtime-only",
                  injectionMode: "env",
                },
                bindingReadiness: { status: "ready" },
                snapshotReadiness: { status: "deferred" },
                status: "active",
                createdAt: "2026-05-24T00:00:00.000Z",
              },
            ],
          } as T);
        }
        return ok({ items: [] } as T);
      },
    });

    await Effect.runPromise(
      Effect.provide(
        resolveInteractiveDeploymentInput({
          sourceLocator: ".",
          deploymentMethod: "workspace-commands",
          projectId: "proj_existing",
          serverId: "srv_existing",
          environmentId: "env_existing",
          resourceId: "res_existing",
          dependencyGraph: [
            {
              key: "db",
              kind: "postgres",
              source: "managed",
              bindEnv: "DATABASE_URL",
              backupPolicy: {
                enabled: true,
                intervalHours: 24,
                retentionDays: 7,
                retryOnFailure: true,
              },
            },
          ],
        }),
        runtime,
      ),
    );

    expect(commands).not.toContain("ConfigureDependencyResourceBackupPolicyCommand");
  });

  test("[CONFIG-FILE-DEPENDENCY-BACKUP-005] config dependency backup policy updates owned drift", async () => {
    ensureReflectMetadata();
    const { resolveInteractiveDeploymentInput } = await import(
      "../src/commands/deployment-interaction"
    );
    const { CliRuntime } = await import("../src/runtime");
    const dependencyResourceId = "dep_res_existing_db";
    const ownedPolicyId = repositoryConfigBackupPolicyIdForTest(dependencyResourceId);
    const commands: AppCommand<unknown>[] = [];
    const runtime = Layer.succeed(CliRuntime, {
      version: "test",
      startServer: async () => {},
      executeCommand: async <T>(message: AppCommand<T>) => {
        commands.push(message as AppCommand<unknown>);
        return ok({ id: ownedPolicyId } as T);
      },
      executeQuery: async <T>(message: AppQuery<T>) => {
        if (message.constructor.name === "ListDependencyResourcesQuery") {
          return ok({
            items: [
              {
                id: dependencyResourceId,
                projectId: "proj_existing",
                environmentId: "env_existing",
                name: "res-existing-db",
                slug: "res-existing-db",
                kind: "postgres",
                sourceMode: "appaloft-managed",
                providerManaged: true,
                lifecycleStatus: "ready",
                bindingReadiness: { status: "ready" },
                createdAt: "2026-05-24T00:00:00.000Z",
              },
            ],
          } as T);
        }
        if (message.constructor.name === "ListDependencyResourceBackupPoliciesQuery") {
          return ok({
            items: [
              {
                schemaVersion: "dependency-resource-backup-policies.policy/v1",
                id: ownedPolicyId,
                version: "v1",
                dependencyResourceId,
                retentionDays: 3,
                scheduleIntervalHours: 12,
                providerKey: null,
                retryOnFailure: true,
                enabled: true,
                lastRunAt: null,
                nextRunAt: "2026-05-24T00:00:00.000Z",
                updatedAt: "2026-05-24T00:00:00.000Z",
              },
            ],
          } as T);
        }
        return ok({ items: [] } as T);
      },
    });

    await Effect.runPromise(
      Effect.provide(
        resolveInteractiveDeploymentInput({
          sourceLocator: ".",
          deploymentMethod: "workspace-commands",
          projectId: "proj_existing",
          serverId: "srv_existing",
          environmentId: "env_existing",
          resourceId: "res_existing",
          dependencyGraph: [
            {
              key: "db",
              kind: "postgres",
              source: "managed",
              bindEnv: "DATABASE_URL",
              backupPolicy: {
                enabled: true,
                intervalHours: 24,
                retentionDays: 7,
                retryOnFailure: false,
              },
            },
          ],
        }),
        runtime,
      ),
    );

    const backupPolicy = commands.find(
      (command) => command.constructor.name === "ConfigureDependencyResourceBackupPolicyCommand",
    ) as { input?: Record<string, unknown> } | undefined;
    expect(backupPolicy?.input).toMatchObject({
      policyId: ownedPolicyId,
      dependencyResourceId,
      retentionDays: 7,
      scheduleIntervalHours: 24,
      retryOnFailure: false,
      enabled: true,
    });
  });

  test("[CONFIG-FILE-DEPENDENCY-BACKUP-006] config dependency backup policy rejects manual drift", async () => {
    ensureReflectMetadata();
    const { resolveInteractiveDeploymentInput } = await import(
      "../src/commands/deployment-interaction"
    );
    const { CliRuntime } = await import("../src/runtime");
    const dependencyResourceId = "dep_res_existing_db";
    const commands: string[] = [];
    const runtime = Layer.succeed(CliRuntime, {
      version: "test",
      startServer: async () => {},
      executeCommand: async <T>(message: AppCommand<T>) => {
        commands.push(message.constructor.name);
        return ok(null as T);
      },
      executeQuery: async <T>(message: AppQuery<T>) => {
        if (message.constructor.name === "ListDependencyResourcesQuery") {
          return ok({
            items: [
              {
                id: dependencyResourceId,
                projectId: "proj_existing",
                environmentId: "env_existing",
                name: "res-existing-db",
                slug: "res-existing-db",
                kind: "postgres",
                sourceMode: "appaloft-managed",
                providerManaged: true,
                lifecycleStatus: "ready",
                bindingReadiness: { status: "ready" },
                createdAt: "2026-05-24T00:00:00.000Z",
              },
            ],
          } as T);
        }
        if (message.constructor.name === "ListDependencyResourceBackupPoliciesQuery") {
          return ok({
            items: [
              {
                schemaVersion: "dependency-resource-backup-policies.policy/v1",
                id: "dbp_manual",
                version: "v1",
                dependencyResourceId,
                retentionDays: 3,
                scheduleIntervalHours: 12,
                providerKey: null,
                retryOnFailure: true,
                enabled: true,
                lastRunAt: null,
                nextRunAt: "2026-05-24T00:00:00.000Z",
                updatedAt: "2026-05-24T00:00:00.000Z",
              },
            ],
          } as T);
        }
        return ok({ items: [] } as T);
      },
    });

    const result = await Effect.runPromise(
      Effect.provide(
        Effect.either(
          resolveInteractiveDeploymentInput({
            sourceLocator: ".",
            deploymentMethod: "workspace-commands",
            projectId: "proj_existing",
            serverId: "srv_existing",
            environmentId: "env_existing",
            resourceId: "res_existing",
            dependencyGraph: [
              {
                key: "db",
                kind: "postgres",
                source: "managed",
                bindEnv: "DATABASE_URL",
                backupPolicy: {
                  enabled: true,
                  intervalHours: 24,
                  retentionDays: 7,
                  retryOnFailure: true,
                },
              },
            ],
          }),
        ),
        runtime,
      ),
    );

    expect(Either.isLeft(result)).toBe(true);
    if (Either.isRight(result)) {
      throw new Error("Expected manual backup policy drift to fail");
    }
    expect(result.left).toMatchObject({
      code: "repository_config_dependency_backup_policy_conflict",
      details: {
        phase: "config-dependency-backup-resolution",
        dependencyKey: "db",
        dependencyResourceId,
        existingPolicyId: "dbp_manual",
      },
    });
    expect(commands).not.toContain("ConfigureDependencyResourceBackupPolicyCommand");
  });

  test("[CONFIG-FILE-DEPENDENCY-BACKUP-007] config dependency backup policy disables owned policy", async () => {
    ensureReflectMetadata();
    const { resolveInteractiveDeploymentInput } = await import(
      "../src/commands/deployment-interaction"
    );
    const { CliRuntime } = await import("../src/runtime");
    const dependencyResourceId = "dep_res_existing_db";
    const ownedPolicyId = repositoryConfigBackupPolicyIdForTest(dependencyResourceId);
    const commands: AppCommand<unknown>[] = [];
    const runtime = Layer.succeed(CliRuntime, {
      version: "test",
      startServer: async () => {},
      executeCommand: async <T>(message: AppCommand<T>) => {
        commands.push(message as AppCommand<unknown>);
        return ok({ id: ownedPolicyId } as T);
      },
      executeQuery: async <T>(message: AppQuery<T>) => {
        if (message.constructor.name === "ListDependencyResourcesQuery") {
          return ok({
            items: [
              {
                id: dependencyResourceId,
                projectId: "proj_existing",
                environmentId: "env_existing",
                name: "res-existing-db",
                slug: "res-existing-db",
                kind: "postgres",
                sourceMode: "appaloft-managed",
                providerManaged: true,
                lifecycleStatus: "ready",
                bindingReadiness: { status: "ready" },
                createdAt: "2026-05-24T00:00:00.000Z",
              },
            ],
          } as T);
        }
        if (message.constructor.name === "ListDependencyResourceBackupPoliciesQuery") {
          return ok({
            items: [
              {
                schemaVersion: "dependency-resource-backup-policies.policy/v1",
                id: ownedPolicyId,
                version: "v1",
                dependencyResourceId,
                retentionDays: 7,
                scheduleIntervalHours: 24,
                providerKey: null,
                retryOnFailure: true,
                enabled: true,
                lastRunAt: null,
                nextRunAt: "2026-05-24T00:00:00.000Z",
                updatedAt: "2026-05-24T00:00:00.000Z",
              },
            ],
          } as T);
        }
        return ok({ items: [] } as T);
      },
    });

    await Effect.runPromise(
      Effect.provide(
        resolveInteractiveDeploymentInput({
          sourceLocator: ".",
          deploymentMethod: "workspace-commands",
          projectId: "proj_existing",
          serverId: "srv_existing",
          environmentId: "env_existing",
          resourceId: "res_existing",
          dependencyGraph: [
            {
              key: "db",
              kind: "postgres",
              source: "managed",
              bindEnv: "DATABASE_URL",
              backupPolicy: {
                enabled: false,
                retryOnFailure: true,
              },
            },
          ],
        }),
        runtime,
      ),
    );

    const backupPolicy = commands.find(
      (command) => command.constructor.name === "ConfigureDependencyResourceBackupPolicyCommand",
    ) as { input?: Record<string, unknown> } | undefined;
    expect(backupPolicy?.input).toMatchObject({
      policyId: ownedPolicyId,
      dependencyResourceId,
      retentionDays: 7,
      scheduleIntervalHours: 24,
      retryOnFailure: true,
      enabled: false,
    });
  });

  test("[CONFIG-FILE-DEPENDENCY-006] config dependencies fail on env target conflicts", async () => {
    ensureReflectMetadata();
    const { resolveInteractiveDeploymentInput } = await import(
      "../src/commands/deployment-interaction"
    );
    const { CliRuntime } = await import("../src/runtime");

    const runtime = Layer.succeed(CliRuntime, {
      version: "test",
      startServer: async () => {},
      executeCommand: async <T>() => ok(null as T),
      executeQuery: async <T>(message: AppQuery<T>) => {
        if (message.constructor.name === "ListDependencyResourcesQuery") {
          return ok({
            items: [
              {
                id: "dep_res_expected_db",
                projectId: "proj_existing",
                environmentId: "env_existing",
                name: "res-existing-db",
                slug: "res-existing-db",
                kind: "postgres",
                sourceMode: "appaloft-managed",
                providerKey: "generic-ssh",
                providerManaged: true,
                lifecycleStatus: "ready",
                bindingReadiness: { status: "ready" },
                createdAt: "2026-05-24T00:00:00.000Z",
              },
            ],
          } as T);
        }
        if (message.constructor.name === "ListResourceDependencyBindingsQuery") {
          return ok({
            items: [
              {
                id: "rbd_other_db",
                projectId: "proj_existing",
                environmentId: "env_existing",
                resourceId: "res_existing",
                dependencyResourceId: "dep_res_other_db",
                kind: "postgres",
                sourceMode: "appaloft-managed",
                providerKey: "generic-ssh",
                providerManaged: true,
                lifecycleStatus: "ready",
                target: {
                  targetName: "DATABASE_URL",
                  scope: "runtime-only",
                  injectionMode: "env",
                },
                bindingReadiness: { status: "ready" },
                snapshotReadiness: { status: "deferred" },
                status: "active",
                createdAt: "2026-05-24T00:00:00.000Z",
              },
            ],
          } as T);
        }
        return ok({ items: [] } as T);
      },
    });

    const result = await Effect.runPromise(
      Effect.provide(
        Effect.either(
          resolveInteractiveDeploymentInput({
            sourceLocator: ".",
            deploymentMethod: "workspace-commands",
            projectId: "proj_existing",
            serverId: "srv_existing",
            environmentId: "env_existing",
            resourceId: "res_existing",
            dependencyGraph: [
              {
                key: "db",
                kind: "postgres",
                source: "managed",
                bindEnv: "DATABASE_URL",
              },
            ],
          }),
        ),
        runtime,
      ),
    );

    expect(Either.isLeft(result)).toBe(true);
    if (Either.isRight(result)) {
      throw new Error("Expected dependency target conflict");
    }
    expect(result.left).toMatchObject({
      code: "repository_config_dependency_binding_conflict",
      details: {
        phase: "config-dependency-resolution",
        resourceId: "res_existing",
        dependencyKey: "db",
        targetName: "DATABASE_URL",
        existingBindingId: "rbd_other_db",
        existingDependencyResourceId: "dep_res_other_db",
        expectedDependencyResourceId: "dep_res_expected_db",
      },
    });
  });

  test("[CONFIG-FILE-DEPENDENCY-008] preview ephemeral dependencies require matching provenance before reuse", async () => {
    ensureReflectMetadata();
    const { resolveInteractiveDeploymentInput } = await import(
      "../src/commands/deployment-interaction"
    );
    const { CliRuntime } = await import("../src/runtime");

    const commands: string[] = [];
    const sourceFingerprint = "source-fingerprint:v1:preview%3Apr%3A909";
    const dependencyName = `preview-${new Bun.CryptoHasher("sha256").update(sourceFingerprint).digest("hex").slice(0, 10)}-db`;
    const runtime = Layer.succeed(CliRuntime, {
      version: "test",
      startServer: async () => {},
      sourceLinkStore: {
        read: async () => ok(null),
        requireSameTargetOrMissing: async () => ok(null),
        createIfMissing: async (input) =>
          ok({
            sourceFingerprint: input.sourceFingerprint,
            updatedAt: input.updatedAt,
            ...input.target,
          }),
        recordDependencyProvenance: async (input) =>
          ok({
            sourceFingerprint: input.sourceFingerprint,
            updatedAt: input.updatedAt,
            ...input.target,
            dependencyProvenance: input.dependencyProvenance,
          }),
      },
      executeCommand: async <T>(message: AppCommand<T>) => {
        commands.push(message.constructor.name);
        return ok(null as T);
      },
      executeQuery: async <T>(message: AppQuery<T>) => {
        if (message.constructor.name === "ListDependencyResourcesQuery") {
          return ok({
            items: [
              {
                id: "dep_res_manual_db",
                projectId: "proj_existing",
                environmentId: "env_existing",
                name: dependencyName,
                slug: dependencyName,
                kind: "postgres",
                sourceMode: "appaloft-managed",
                providerKey: "generic-ssh",
                providerManaged: true,
                lifecycleStatus: "ready",
                bindingReadiness: { status: "ready" },
                createdAt: "2026-05-24T00:00:00.000Z",
              },
            ],
          } as T);
        }
        return ok({ items: [] } as T);
      },
    });

    const result = await Effect.runPromise(
      Effect.provide(
        Effect.either(
          resolveInteractiveDeploymentInput({
            sourceLocator: ".",
            deploymentMethod: "workspace-commands",
            projectId: "proj_existing",
            serverId: "srv_existing",
            environmentId: "env_existing",
            resourceId: "res_existing",
            sourceFingerprint,
            dependencyGraph: [
              {
                key: "db",
                kind: "postgres",
                source: "managed",
                bindEnv: "DATABASE_URL",
                previewLifecycle: "ephemeral",
              },
            ],
          }),
        ),
        runtime,
      ),
    );

    expect(Either.isLeft(result)).toBe(true);
    if (Either.isRight(result)) {
      throw new Error("Expected unprovenanced preview dependency resource conflict");
    }
    expect(result.left).toMatchObject({
      code: "repository_config_dependency_resource_conflict",
      details: {
        phase: "config-dependency-resolution",
        resourceId: "res_existing",
        dependencyKey: "db",
        targetName: "DATABASE_URL",
        dependencyResourceId: "dep_res_manual_db",
        sourceFingerprint,
      },
    });
    expect(commands).not.toContain("ProvisionDependencyResourceCommand");
    expect(commands).not.toContain("BindResourceDependencyCommand");
  });

  test("[CONFIG-FILE-DEPENDENCY-009] preview ephemeral dependencies fail before mutation when provenance storage is unavailable", async () => {
    ensureReflectMetadata();
    const { resolveInteractiveDeploymentInput } = await import(
      "../src/commands/deployment-interaction"
    );
    const { CliRuntime } = await import("../src/runtime");

    const commands: string[] = [];
    const runtime = Layer.succeed(CliRuntime, {
      version: "test",
      startServer: async () => {},
      executeCommand: async <T>(message: AppCommand<T>) => {
        commands.push(message.constructor.name);
        return ok(null as T);
      },
      executeQuery: async <T>() => ok({ items: [] } as T),
    });

    const result = await Effect.runPromise(
      Effect.provide(
        Effect.either(
          resolveInteractiveDeploymentInput({
            sourceLocator: ".",
            deploymentMethod: "workspace-commands",
            projectId: "proj_existing",
            serverId: "srv_existing",
            environmentId: "env_existing",
            resourceId: "res_existing",
            sourceFingerprint: "source-fingerprint:v1:preview%3Apr%3A910",
            dependencyGraph: [
              {
                key: "db",
                kind: "postgres",
                source: "managed",
                bindEnv: "DATABASE_URL",
                previewLifecycle: "ephemeral",
              },
            ],
          }),
        ),
        runtime,
      ),
    );

    expect(Either.isLeft(result)).toBe(true);
    if (Either.isRight(result)) {
      throw new Error("Expected missing provenance storage to fail");
    }
    expect(result.left).toMatchObject({
      code: "repository_config_dependency_provenance_unavailable",
      details: {
        phase: "config-dependency-resolution",
        resourceId: "res_existing",
        dependencyKey: "db",
        targetName: "DATABASE_URL",
      },
    });
    expect(commands).toEqual([]);
  });

  test("[CONFIG-FILE-STORAGE-004][CONFIG-FILE-STORAGE-007] config storage creates, attaches, and records preview provenance before deployment", async () => {
    ensureReflectMetadata();
    const workspace = mkdtempSync(join(tmpdir(), "appaloft-storage-config-"));
    const configPath = join(workspace, "appaloft.preview.yml");
    writeFileSync(
      configPath,
      [
        "runtime:",
        "  strategy: workspace-commands",
        "storage:",
        "  uploads:",
        "    kind: volume",
        "    source: managed",
        "    mount:",
        "      path: /app/uploads",
        "    preview:",
        "      lifecycle: ephemeral",
        "",
      ].join("\n"),
    );
    const harness = await createPreviewDeployCliHarness();

    try {
      await withBunEnv(
        {
          GITHUB_REPOSITORY: "acme/api",
          GITHUB_REPOSITORY_ID: "R_storage_repo",
          GITHUB_REF: "refs/heads/main",
          GITHUB_HEAD_REF: "feature/storage",
          GITHUB_SHA: "abc123",
          GITHUB_WORKSPACE: workspace,
        },
        () =>
          withMutedProcessOutput(async () => {
            await harness.program.parseAsync([
              "node",
              "appaloft",
              "deploy",
              workspace,
              "--config",
              configPath,
              "--preview",
              "pull-request",
              "--preview-id",
              "pr-88",
              "--server-host",
              "203.0.113.88",
              "--server-provider",
              "generic-ssh",
            ]);
          }),
      );
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }

    expect(harness.operations).toContain("ListStorageVolumesQuery");
    expect(harness.operations).toContain("ShowResourceQuery");
    expect(harness.operations.indexOf("CreateStorageVolumeCommand")).toBeLessThan(
      harness.operations.indexOf("AttachResourceStorageCommand"),
    );
    expect(harness.operations.indexOf("AttachResourceStorageCommand")).toBeLessThan(
      harness.operations.indexOf("CreateDeploymentCommand"),
    );
    const deployment = harness.commands.find(
      (command) => command.constructor.name === "CreateDeploymentCommand",
    ) as Record<string, unknown> | undefined;
    expect(deployment).toMatchObject({
      projectId: "proj_1",
      serverId: "srv_1",
      environmentId: "env_1",
      resourceId: "res_1",
    });
    expect(deployment).not.toHaveProperty("storageVolumeId");
    expect(deployment).not.toHaveProperty("destinationPath");
    expect(harness.storageProvenanceWrites).toHaveLength(1);
    expect(harness.storageProvenanceWrites[0]).toMatchObject({
      target: {
        projectId: "proj_1",
        environmentId: "env_1",
        resourceId: "res_1",
        serverId: "srv_1",
      },
      storageProvenance: {
        source: "repository-config",
        entries: [
          {
            key: "uploads",
            kind: "volume",
            source: "managed",
            lifecycle: "ephemeral",
            resourceId: "res_1",
            storageVolumeId: "stv_uploads",
            attachmentId: "rsa_uploads",
            destinationPath: "/app/uploads",
          },
        ],
      },
    });
  });

  test("[CONFIG-FILE-STORAGE-005] config storage reuses existing volume and attachment", async () => {
    ensureReflectMetadata();
    const { resolveInteractiveDeploymentInput } = await import(
      "../src/commands/deployment-interaction"
    );
    const { CliRuntime } = await import("../src/runtime");

    const commands: string[] = [];
    const runtime = Layer.succeed(CliRuntime, {
      version: "test",
      startServer: async () => {},
      executeCommand: async <T>(message: AppCommand<T>) => {
        commands.push(message.constructor.name);
        return ok(null as T);
      },
      executeQuery: async <T>(message: AppQuery<T>) => {
        if (message.constructor.name === "ShowResourceQuery") {
          return ok({
            storageAttachments: [
              {
                id: "rsa_existing_uploads",
                storageVolumeId: "stv_existing_uploads",
                storageVolumeName: "res-existing-uploads",
                storageVolumeKind: "named-volume",
                destinationPath: "/app/uploads",
                mountMode: "read-write",
                attachedAt: "2026-05-24T00:00:00.000Z",
              },
            ],
          } as T);
        }
        if (message.constructor.name === "ListStorageVolumesQuery") {
          return ok({
            items: [
              {
                id: "stv_existing_uploads",
                projectId: "proj_existing",
                environmentId: "env_existing",
                name: "res-existing-uploads",
                slug: "res-existing-uploads",
                kind: "named-volume",
                lifecycleStatus: "active",
                attachmentCount: 1,
                attachments: [],
                createdAt: "2026-05-24T00:00:00.000Z",
              },
            ],
          } as T);
        }
        return ok({ items: [] } as T);
      },
    });

    const input = await Effect.runPromise(
      Effect.provide(
        resolveInteractiveDeploymentInput({
          sourceLocator: ".",
          deploymentMethod: "workspace-commands",
          projectId: "proj_existing",
          serverId: "srv_existing",
          environmentId: "env_existing",
          resourceId: "res_existing",
          storageGraph: [
            {
              key: "uploads",
              kind: "volume",
              source: "managed",
              mountPath: "/app/uploads",
              mountMode: "read-write",
            },
          ],
        }),
        runtime,
      ),
    );

    expect(input).toEqual({
      projectId: "proj_existing",
      serverId: "srv_existing",
      environmentId: "env_existing",
      resourceId: "res_existing",
    });
    expect(commands).not.toContain("CreateStorageVolumeCommand");
    expect(commands).not.toContain("AttachResourceStorageCommand");
  });

  test("[CONFIG-FILE-STORAGE-006] config storage fails on mount path conflicts", async () => {
    ensureReflectMetadata();
    const { resolveInteractiveDeploymentInput } = await import(
      "../src/commands/deployment-interaction"
    );
    const { CliRuntime } = await import("../src/runtime");

    const runtime = Layer.succeed(CliRuntime, {
      version: "test",
      startServer: async () => {},
      executeCommand: async <T>() => ok(null as T),
      executeQuery: async <T>(message: AppQuery<T>) => {
        if (message.constructor.name === "ShowResourceQuery") {
          return ok({
            storageAttachments: [
              {
                id: "rsa_other_uploads",
                storageVolumeId: "stv_other_uploads",
                storageVolumeName: "manual-uploads",
                storageVolumeKind: "named-volume",
                destinationPath: "/app/uploads",
                mountMode: "read-write",
                attachedAt: "2026-05-24T00:00:00.000Z",
              },
            ],
          } as T);
        }
        if (message.constructor.name === "ListStorageVolumesQuery") {
          return ok({
            items: [
              {
                id: "stv_expected_uploads",
                projectId: "proj_existing",
                environmentId: "env_existing",
                name: "res-existing-uploads",
                slug: "res-existing-uploads",
                kind: "named-volume",
                lifecycleStatus: "active",
                attachmentCount: 0,
                attachments: [],
                createdAt: "2026-05-24T00:00:00.000Z",
              },
            ],
          } as T);
        }
        return ok({ items: [] } as T);
      },
    });

    const result = await Effect.runPromise(
      Effect.provide(
        Effect.either(
          resolveInteractiveDeploymentInput({
            sourceLocator: ".",
            deploymentMethod: "workspace-commands",
            projectId: "proj_existing",
            serverId: "srv_existing",
            environmentId: "env_existing",
            resourceId: "res_existing",
            storageGraph: [
              {
                key: "uploads",
                kind: "volume",
                source: "managed",
                mountPath: "/app/uploads",
                mountMode: "read-write",
              },
            ],
          }),
        ),
        runtime,
      ),
    );

    expect(Either.isLeft(result)).toBe(true);
    if (Either.isRight(result)) {
      throw new Error("Expected storage mount path conflict");
    }
    expect(result.left).toMatchObject({
      code: "repository_config_storage_attachment_conflict",
      details: {
        phase: "config-storage-resolution",
        resourceId: "res_existing",
        storageKey: "uploads",
        destinationPath: "/app/uploads",
        existingAttachmentId: "rsa_other_uploads",
        existingStorageVolumeId: "stv_other_uploads",
        expectedStorageVolumeId: "stv_expected_uploads",
      },
    });
  });

  test("[CONFIG-FILE-SCHED-TASK-004][CONFIG-FILE-SCHED-TASK-009] config scheduled tasks create and record provenance before deployment", async () => {
    ensureReflectMetadata();
    const workspace = mkdtempSync(join(tmpdir(), "appaloft-scheduled-task-config-"));
    const configPath = join(workspace, "appaloft.preview.yml");
    writeFileSync(
      configPath,
      [
        "runtime:",
        "  strategy: workspace-commands",
        "scheduledTasks:",
        "  nightly_sync:",
        '    schedule: "0 3 * * *"',
        "    command: bun run sync",
        "    timeoutSeconds: 600",
        "    retryLimit: 2",
        "    preview:",
        "      lifecycle: ephemeral",
        "",
      ].join("\n"),
    );
    const harness = await createPreviewDeployCliHarness();

    try {
      await withBunEnv(
        {
          GITHUB_REPOSITORY: "acme/api",
          GITHUB_REPOSITORY_ID: "R_scheduled_task_repo",
          GITHUB_REF: "refs/heads/main",
          GITHUB_HEAD_REF: "feature/scheduled-task",
          GITHUB_SHA: "abc123",
          GITHUB_WORKSPACE: workspace,
        },
        () =>
          withMutedProcessOutput(async () => {
            await harness.program.parseAsync([
              "node",
              "appaloft",
              "deploy",
              workspace,
              "--config",
              configPath,
              "--preview",
              "pull-request",
              "--preview-id",
              "pr-91",
              "--server-host",
              "203.0.113.91",
              "--server-provider",
              "generic-ssh",
            ]);
          }),
      );
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }

    expect(harness.operations).toContain("ListScheduledTasksQuery");
    expect(harness.operations.indexOf("CreateScheduledTaskCommand")).toBeLessThan(
      harness.operations.indexOf("CreateDeploymentCommand"),
    );
    const deployment = harness.commands.find(
      (command) => command.constructor.name === "CreateDeploymentCommand",
    ) as Record<string, unknown> | undefined;
    expect(deployment).toMatchObject({
      projectId: "proj_1",
      serverId: "srv_1",
      environmentId: "env_1",
      resourceId: "res_1",
    });
    expect(deployment).not.toHaveProperty("taskId");
    expect(deployment).not.toHaveProperty("schedule");
    expect(harness.scheduledTaskProvenanceWrites).toHaveLength(1);
    expect(harness.scheduledTaskProvenanceWrites[0]).toMatchObject({
      target: {
        projectId: "proj_1",
        environmentId: "env_1",
        resourceId: "res_1",
        serverId: "srv_1",
      },
      scheduledTaskProvenance: {
        source: "repository-config",
        entries: [
          {
            key: "nightly_sync",
            source: "repository-config",
            lifecycle: "ephemeral",
            resourceId: "res_1",
            taskId: "tsk_nightly_sync",
          },
        ],
      },
    });
  });

  test("[CONFIG-FILE-SCHED-TASK-005] config scheduled tasks configure provenance-owned drift", async () => {
    ensureReflectMetadata();
    const { resolveInteractiveDeploymentInput } = await import(
      "../src/commands/deployment-interaction"
    );
    const { CliRuntime } = await import("../src/runtime");

    const commands: string[] = [];
    const sourceFingerprint = "source-fingerprint:v1:preview%3Apr%3A912";
    const runtime = Layer.succeed(CliRuntime, {
      version: "test",
      startServer: async () => {},
      sourceLinkStore: {
        read: async () =>
          ok({
            sourceFingerprint,
            projectId: "proj_existing",
            environmentId: "env_existing",
            resourceId: "res_existing",
            serverId: "srv_existing",
            updatedAt: "2026-05-24T00:00:00.000Z",
            scheduledTaskProvenance: {
              schemaVersion: "source-link.scheduled-task-provenance/v1" as const,
              source: "repository-config" as const,
              sourceFingerprint,
              entries: [
                {
                  key: "nightly_sync",
                  source: "repository-config" as const,
                  lifecycle: "persistent" as const,
                  resourceId: "res_existing",
                  taskId: "tsk_nightly_sync",
                  commandFingerprint: "old",
                  createdAt: "2026-05-24T00:00:00.000Z",
                },
              ],
            },
          }),
        requireSameTargetOrMissing: async () => ok(null),
        createIfMissing: async (input) =>
          ok({
            sourceFingerprint: input.sourceFingerprint,
            updatedAt: input.updatedAt,
            ...input.target,
          }),
        recordScheduledTaskProvenance: async (input) =>
          ok({
            sourceFingerprint: input.sourceFingerprint,
            updatedAt: input.updatedAt,
            ...input.target,
            scheduledTaskProvenance: input.scheduledTaskProvenance,
          }),
      },
      executeCommand: async <T>(message: AppCommand<T>) => {
        commands.push(message.constructor.name);
        if (message.constructor.name === "ConfigureScheduledTaskCommand") {
          return ok({
            schemaVersion: "scheduled-tasks.command/v1",
            task: {
              taskId: "tsk_nightly_sync",
              resourceId: "res_existing",
              schedule: "0 3 * * *",
              timezone: "UTC",
              commandIntent: "bun run sync",
              timeoutSeconds: 600,
              retryLimit: 2,
              concurrencyPolicy: "forbid",
              status: "enabled",
              createdAt: "2026-05-24T00:00:00.000Z",
            },
          } as T);
        }
        return ok(null as T);
      },
      executeQuery: async <T>(message: AppQuery<T>) => {
        if (message.constructor.name === "ListScheduledTasksQuery") {
          return ok({
            items: [
              {
                taskId: "tsk_nightly_sync",
                resourceId: "res_existing",
                schedule: "0 2 * * *",
                timezone: "UTC",
                commandIntent: "bun run old-sync",
                timeoutSeconds: 300,
                retryLimit: 0,
                concurrencyPolicy: "forbid",
                status: "enabled",
                createdAt: "2026-05-24T00:00:00.000Z",
              },
            ],
          } as T);
        }
        return ok({ items: [] } as T);
      },
    });

    await Effect.runPromise(
      Effect.provide(
        resolveInteractiveDeploymentInput({
          sourceLocator: ".",
          deploymentMethod: "workspace-commands",
          projectId: "proj_existing",
          serverId: "srv_existing",
          environmentId: "env_existing",
          resourceId: "res_existing",
          sourceFingerprint,
          scheduledTaskGraph: [
            {
              key: "nightly_sync",
              schedule: "0 3 * * *",
              timezone: "UTC",
              command: "bun run sync",
              timeoutSeconds: 600,
              retryLimit: 2,
              concurrencyPolicy: "forbid",
              status: "enabled",
            },
          ],
        }),
        runtime,
      ),
    );

    expect(commands).toContain("ConfigureScheduledTaskCommand");
    expect(commands).not.toContain("CreateScheduledTaskCommand");
  });

  test("[CONFIG-FILE-SCHED-TASK-006] config scheduled tasks adopt exact existing tasks", async () => {
    ensureReflectMetadata();
    const { resolveInteractiveDeploymentInput } = await import(
      "../src/commands/deployment-interaction"
    );
    const { CliRuntime } = await import("../src/runtime");

    const commands: string[] = [];
    const provenanceWrites: unknown[] = [];
    const sourceFingerprint = "source-fingerprint:v1:preview%3Apr%3A913";
    const runtime = Layer.succeed(CliRuntime, {
      version: "test",
      startServer: async () => {},
      sourceLinkStore: {
        read: async () => ok(null),
        requireSameTargetOrMissing: async () => ok(null),
        createIfMissing: async (input) =>
          ok({
            sourceFingerprint: input.sourceFingerprint,
            updatedAt: input.updatedAt,
            ...input.target,
          }),
        recordScheduledTaskProvenance: async (input) => {
          provenanceWrites.push(input);
          return ok({
            sourceFingerprint: input.sourceFingerprint,
            updatedAt: input.updatedAt,
            ...input.target,
            scheduledTaskProvenance: input.scheduledTaskProvenance,
          });
        },
      },
      executeCommand: async <T>(message: AppCommand<T>) => {
        commands.push(message.constructor.name);
        return ok(null as T);
      },
      executeQuery: async <T>(message: AppQuery<T>) => {
        if (message.constructor.name === "ListScheduledTasksQuery") {
          return ok({
            items: [
              {
                taskId: "tsk_exact",
                resourceId: "res_existing",
                schedule: "@hourly",
                timezone: "UTC",
                commandIntent: "bun run sync",
                timeoutSeconds: 3600,
                retryLimit: 0,
                concurrencyPolicy: "forbid",
                status: "enabled",
                createdAt: "2026-05-24T00:00:00.000Z",
              },
            ],
          } as T);
        }
        return ok({ items: [] } as T);
      },
    });

    await Effect.runPromise(
      Effect.provide(
        resolveInteractiveDeploymentInput({
          sourceLocator: ".",
          deploymentMethod: "workspace-commands",
          projectId: "proj_existing",
          serverId: "srv_existing",
          environmentId: "env_existing",
          resourceId: "res_existing",
          sourceFingerprint,
          scheduledTaskGraph: [
            {
              key: "hourly_sync",
              schedule: "@hourly",
              timezone: "UTC",
              command: "bun run sync",
              timeoutSeconds: 3600,
              retryLimit: 0,
              concurrencyPolicy: "forbid",
              status: "enabled",
            },
          ],
        }),
        runtime,
      ),
    );

    expect(commands).not.toContain("CreateScheduledTaskCommand");
    expect(commands).not.toContain("ConfigureScheduledTaskCommand");
    expect(provenanceWrites[0]).toMatchObject({
      scheduledTaskProvenance: {
        entries: [
          {
            key: "hourly_sync",
            taskId: "tsk_exact",
            lifecycle: "persistent",
          },
        ],
      },
    });
  });

  test("[CONFIG-FILE-SCHED-TASK-007] config scheduled tasks fail on provenance conflicts", async () => {
    ensureReflectMetadata();
    const { resolveInteractiveDeploymentInput } = await import(
      "../src/commands/deployment-interaction"
    );
    const { CliRuntime } = await import("../src/runtime");

    const commands: string[] = [];
    const sourceFingerprint = "source-fingerprint:v1:preview%3Apr%3A914";
    const runtime = Layer.succeed(CliRuntime, {
      version: "test",
      startServer: async () => {},
      sourceLinkStore: {
        read: async () =>
          ok({
            sourceFingerprint,
            projectId: "proj_existing",
            environmentId: "env_existing",
            resourceId: "res_existing",
            serverId: "srv_existing",
            updatedAt: "2026-05-24T00:00:00.000Z",
            scheduledTaskProvenance: {
              schemaVersion: "source-link.scheduled-task-provenance/v1" as const,
              source: "repository-config" as const,
              sourceFingerprint,
              entries: [
                {
                  key: "nightly_sync",
                  source: "repository-config" as const,
                  lifecycle: "ephemeral" as const,
                  resourceId: "res_other",
                  taskId: "tsk_other",
                  commandFingerprint: "old",
                  createdAt: "2026-05-24T00:00:00.000Z",
                },
              ],
            },
          }),
        requireSameTargetOrMissing: async () => ok(null),
        createIfMissing: async (input) =>
          ok({
            sourceFingerprint: input.sourceFingerprint,
            updatedAt: input.updatedAt,
            ...input.target,
          }),
        recordScheduledTaskProvenance: async (input) =>
          ok({
            sourceFingerprint: input.sourceFingerprint,
            updatedAt: input.updatedAt,
            ...input.target,
            scheduledTaskProvenance: input.scheduledTaskProvenance,
          }),
      },
      executeCommand: async <T>(message: AppCommand<T>) => {
        commands.push(message.constructor.name);
        return ok(null as T);
      },
      executeQuery: async <T>() => ok({ items: [] } as T),
    });

    const result = await Effect.runPromise(
      Effect.provide(
        Effect.either(
          resolveInteractiveDeploymentInput({
            sourceLocator: ".",
            deploymentMethod: "workspace-commands",
            projectId: "proj_existing",
            serverId: "srv_existing",
            environmentId: "env_existing",
            resourceId: "res_existing",
            sourceFingerprint,
            scheduledTaskGraph: [
              {
                key: "nightly_sync",
                schedule: "0 3 * * *",
                timezone: "UTC",
                command: "bun run sync",
                timeoutSeconds: 600,
                retryLimit: 2,
                concurrencyPolicy: "forbid",
                status: "enabled",
                previewLifecycle: "ephemeral",
              },
            ],
          }),
        ),
        runtime,
      ),
    );

    expect(Either.isLeft(result)).toBe(true);
    if (Either.isRight(result)) {
      throw new Error("Expected scheduled task provenance conflict");
    }
    expect(result.left).toMatchObject({
      code: "repository_config_scheduled_task_conflict",
      details: {
        phase: "config-scheduled-task-resolution",
        resourceId: "res_existing",
        taskKey: "nightly_sync",
        existingTaskId: "tsk_other",
        existingResourceId: "res_other",
      },
    });
    expect(commands).toEqual([]);
  });

  test("[CONFIG-FILE-SCHED-TASK-008] config scheduled tasks fail before mutation when provenance storage is unavailable", async () => {
    ensureReflectMetadata();
    const { resolveInteractiveDeploymentInput } = await import(
      "../src/commands/deployment-interaction"
    );
    const { CliRuntime } = await import("../src/runtime");

    const commands: string[] = [];
    const runtime = Layer.succeed(CliRuntime, {
      version: "test",
      startServer: async () => {},
      executeCommand: async <T>(message: AppCommand<T>) => {
        commands.push(message.constructor.name);
        return ok(null as T);
      },
      executeQuery: async <T>() => ok({ items: [] } as T),
    });

    const result = await Effect.runPromise(
      Effect.provide(
        Effect.either(
          resolveInteractiveDeploymentInput({
            sourceLocator: ".",
            deploymentMethod: "workspace-commands",
            projectId: "proj_existing",
            serverId: "srv_existing",
            environmentId: "env_existing",
            resourceId: "res_existing",
            sourceFingerprint: "source-fingerprint:v1:preview%3Apr%3A915",
            scheduledTaskGraph: [
              {
                key: "nightly_sync",
                schedule: "0 3 * * *",
                timezone: "UTC",
                command: "bun run sync",
                timeoutSeconds: 600,
                retryLimit: 2,
                concurrencyPolicy: "forbid",
                status: "enabled",
              },
            ],
          }),
        ),
        runtime,
      ),
    );

    expect(Either.isLeft(result)).toBe(true);
    if (Either.isRight(result)) {
      throw new Error("Expected missing scheduled task provenance storage to fail");
    }
    expect(result.left).toMatchObject({
      code: "repository_config_scheduled_task_provenance_unavailable",
      details: {
        phase: "config-scheduled-task-resolution",
        resourceId: "res_existing",
        taskKey: "nightly_sync",
      },
    });
    expect(commands).toEqual([]);
  });

  test("[CONFIG-FILE-AUTO-DEPLOY-003] config auto-deploy configures before deployment admission", async () => {
    ensureReflectMetadata();
    const workspace = mkdtempSync(join(tmpdir(), "appaloft-auto-deploy-config-"));
    const configPath = join(workspace, "appaloft.yaml");
    writeFileSync(
      configPath,
      [
        "runtime:",
        "  strategy: workspace-commands",
        "autoDeploy:",
        "  enabled: true",
        "  trigger: git-push",
        "  refs:",
        "    - main",
        "  events:",
        "    - push",
        "  dedupeWindowSeconds: 300",
        "",
      ].join("\n"),
    );
    const harness = await createPreviewDeployCliHarness();

    try {
      await withBunEnv(
        {
          GITHUB_REPOSITORY: "acme/api",
          GITHUB_REPOSITORY_ID: "R_auto_deploy_repo",
          GITHUB_REF: "refs/heads/main",
          GITHUB_HEAD_REF: "feature/auto-deploy",
          GITHUB_SHA: "abc123",
          GITHUB_WORKSPACE: workspace,
        },
        () =>
          withMutedProcessOutput(async () => {
            await harness.program.parseAsync([
              "node",
              "appaloft",
              "deploy",
              workspace,
              "--config",
              configPath,
              "--preview",
              "pull-request",
              "--preview-id",
              "pr-92",
              "--server-host",
              "203.0.113.92",
              "--server-provider",
              "generic-ssh",
            ]);
          }),
      );
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }

    expect(harness.operations).toContain("ShowResourceQuery");
    expect(harness.operations.indexOf("ConfigureResourceAutoDeployCommand")).toBeLessThan(
      harness.operations.indexOf("CreateDeploymentCommand"),
    );
    const autoDeploy = harness.commands.find(
      (command) => command.constructor.name === "ConfigureResourceAutoDeployCommand",
    ) as Record<string, unknown> | undefined;
    expect(autoDeploy).toMatchObject({
      resourceId: "res_1",
      mode: "enable",
      policy: {
        triggerKind: "git-push",
        refs: ["main"],
        eventKinds: ["push"],
        dedupeWindowSeconds: 300,
      },
    });
    const deployment = harness.commands.find(
      (command) => command.constructor.name === "CreateDeploymentCommand",
    ) as Record<string, unknown> | undefined;
    expect(deployment).not.toHaveProperty("autoDeploy");
    expect(deployment).not.toHaveProperty("triggerKind");
    expect(deployment).not.toHaveProperty("refs");
  });

  test("[CONFIG-FILE-AUTO-DEPLOY-004] config auto-deploy is idempotent for matching policy", async () => {
    ensureReflectMetadata();
    const { resolveInteractiveDeploymentInput } = await import(
      "../src/commands/deployment-interaction"
    );
    const { CliRuntime } = await import("../src/runtime");

    const commands: string[] = [];
    const runtime = Layer.succeed(CliRuntime, {
      version: "test",
      startServer: async () => {},
      executeCommand: async <T>(message: AppCommand<T>) => {
        commands.push(message.constructor.name);
        return ok(null as T);
      },
      executeQuery: async <T>(message: AppQuery<T>) => {
        if (message.constructor.name === "ShowResourceQuery") {
          return ok({
            autoDeployPolicy: {
              status: "enabled",
              triggerKind: "git-push",
              refs: ["main"],
              eventKinds: ["push"],
              sourceBindingFingerprint: "source-binding:fingerprint",
              dedupeWindowSeconds: 300,
              updatedAt: "2026-05-24T00:00:00.000Z",
            },
          } as T);
        }
        return ok({ items: [] } as T);
      },
    });

    await Effect.runPromise(
      Effect.provide(
        resolveInteractiveDeploymentInput({
          sourceLocator: ".",
          deploymentMethod: "workspace-commands",
          projectId: "proj_existing",
          serverId: "srv_existing",
          environmentId: "env_existing",
          resourceId: "res_existing",
          autoDeployPolicy: {
            enabled: true,
            triggerKind: "git-push",
            refs: ["main"],
            eventKinds: ["push"],
            dedupeWindowSeconds: 300,
          },
        }),
        runtime,
      ),
    );

    expect(commands).not.toContain("ConfigureResourceAutoDeployCommand");
  });

  test("[CONFIG-FILE-AUTO-DEPLOY-005] config auto-deploy replaces drifted or blocked policy", async () => {
    ensureReflectMetadata();
    const { resolveInteractiveDeploymentInput } = await import(
      "../src/commands/deployment-interaction"
    );
    const { CliRuntime } = await import("../src/runtime");

    const commands: AppCommand<unknown>[] = [];
    const runtime = Layer.succeed(CliRuntime, {
      version: "test",
      startServer: async () => {},
      executeCommand: async <T>(message: AppCommand<T>) => {
        commands.push(message as AppCommand<unknown>);
        return ok({
          resourceId: "res_existing",
          status: "enabled",
          triggerKind: "git-push",
          refs: ["main"],
          eventKinds: ["push"],
        } as T);
      },
      executeQuery: async <T>(message: AppQuery<T>) => {
        if (message.constructor.name === "ShowResourceQuery") {
          return ok({
            autoDeployPolicy: {
              status: "blocked",
              triggerKind: "git-push",
              refs: ["develop"],
              eventKinds: ["push"],
              sourceBindingFingerprint: "source-binding:old",
              blockedReason: "source-binding-changed",
              updatedAt: "2026-05-24T00:00:00.000Z",
            },
          } as T);
        }
        return ok({ items: [] } as T);
      },
    });

    await Effect.runPromise(
      Effect.provide(
        resolveInteractiveDeploymentInput({
          sourceLocator: ".",
          deploymentMethod: "workspace-commands",
          projectId: "proj_existing",
          serverId: "srv_existing",
          environmentId: "env_existing",
          resourceId: "res_existing",
          autoDeployPolicy: {
            enabled: true,
            triggerKind: "git-push",
            refs: ["main"],
            eventKinds: ["push"],
          },
        }),
        runtime,
      ),
    );

    const autoDeploy = commands.find(
      (command) => command.constructor.name === "ConfigureResourceAutoDeployCommand",
    ) as Record<string, unknown> | undefined;
    expect(autoDeploy).toMatchObject({
      resourceId: "res_existing",
      mode: "enable",
      policy: {
        triggerKind: "git-push",
        refs: ["main"],
        eventKinds: ["push"],
      },
    });
  });

  test("[CONFIG-FILE-AUTO-DEPLOY-006] config auto-deploy disables existing policy", async () => {
    ensureReflectMetadata();
    const { resolveInteractiveDeploymentInput } = await import(
      "../src/commands/deployment-interaction"
    );
    const { CliRuntime } = await import("../src/runtime");

    const commands: AppCommand<unknown>[] = [];
    const runtime = Layer.succeed(CliRuntime, {
      version: "test",
      startServer: async () => {},
      executeCommand: async <T>(message: AppCommand<T>) => {
        commands.push(message as AppCommand<unknown>);
        return ok({ resourceId: "res_existing", status: "disabled" } as T);
      },
      executeQuery: async <T>(message: AppQuery<T>) => {
        if (message.constructor.name === "ShowResourceQuery") {
          return ok({
            autoDeployPolicy: {
              status: "enabled",
              triggerKind: "git-push",
              refs: ["main"],
              eventKinds: ["push"],
              sourceBindingFingerprint: "source-binding:fingerprint",
              updatedAt: "2026-05-24T00:00:00.000Z",
            },
          } as T);
        }
        return ok({ items: [] } as T);
      },
    });

    await Effect.runPromise(
      Effect.provide(
        resolveInteractiveDeploymentInput({
          sourceLocator: ".",
          deploymentMethod: "workspace-commands",
          projectId: "proj_existing",
          serverId: "srv_existing",
          environmentId: "env_existing",
          resourceId: "res_existing",
          autoDeployPolicy: {
            enabled: false,
            triggerKind: "git-push",
            eventKinds: ["push"],
          },
        }),
        runtime,
      ),
    );

    const autoDeploy = commands.find(
      (command) => command.constructor.name === "ConfigureResourceAutoDeployCommand",
    ) as Record<string, unknown> | undefined;
    expect(autoDeploy).toMatchObject({
      resourceId: "res_existing",
      mode: "disable",
    });
    expect(autoDeploy?.policy).toBeUndefined();
  });

  test("[CONFIG-FILE-GENERATED-ACCESS-003] config generated access profile configures before deployment admission", async () => {
    ensureReflectMetadata();
    const workspace = mkdtempSync(join(tmpdir(), "appaloft-generated-access-config-"));
    const configPath = join(workspace, "appaloft.yaml");
    writeFileSync(
      configPath,
      [
        "runtime:",
        "  strategy: workspace-commands",
        "access:",
        "  generated:",
        "    enabled: true",
        "    pathPrefix: /app",
        "",
      ].join("\n"),
    );
    const harness = await createPreviewDeployCliHarness();

    try {
      await withMutedProcessOutput(async () => {
        await harness.program.parseAsync([
          "node",
          "appaloft",
          "deploy",
          workspace,
          "--config",
          configPath,
          "--server-host",
          "203.0.113.94",
          "--server-provider",
          "generic-ssh",
        ]);
      });
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }

    expect(harness.operations).toContain("ShowResourceQuery");
    expect(harness.operations.indexOf("ConfigureResourceAccessCommand")).toBeLessThan(
      harness.operations.indexOf("CreateDeploymentCommand"),
    );
    const access = harness.commands.find(
      (command) => command.constructor.name === "ConfigureResourceAccessCommand",
    ) as Record<string, unknown> | undefined;
    expect(access).toMatchObject({
      resourceId: "res_1",
      accessProfile: {
        generatedAccessMode: "inherit",
        pathPrefix: "/app",
      },
    });
    const deployment = harness.commands.find(
      (command) => command.constructor.name === "CreateDeploymentCommand",
    ) as Record<string, unknown> | undefined;
    expect(deployment).not.toHaveProperty("accessProfile");
    expect(deployment).not.toHaveProperty("generatedAccessMode");
    expect(deployment).not.toHaveProperty("pathPrefix");
  });

  test("[CONFIG-FILE-GENERATED-ACCESS-004] config generated access profile is idempotent for matching profile", async () => {
    ensureReflectMetadata();
    const { resolveInteractiveDeploymentInput } = await import(
      "../src/commands/deployment-interaction"
    );
    const { CliRuntime } = await import("../src/runtime");

    const commands: string[] = [];
    const runtime = Layer.succeed(CliRuntime, {
      version: "test",
      startServer: async () => {},
      executeCommand: async <T>(message: AppCommand<T>) => {
        commands.push(message.constructor.name);
        return ok(null as T);
      },
      executeQuery: async <T>(message: AppQuery<T>) => {
        if (message.constructor.name === "ShowResourceQuery") {
          return ok({
            accessProfile: {
              generatedAccessMode: "inherit",
              pathPrefix: "/app",
            },
          } as T);
        }
        return ok({ items: [] } as T);
      },
    });

    await Effect.runPromise(
      Effect.provide(
        resolveInteractiveDeploymentInput({
          sourceLocator: ".",
          deploymentMethod: "workspace-commands",
          projectId: "proj_existing",
          serverId: "srv_existing",
          environmentId: "env_existing",
          resourceId: "res_existing",
          generatedAccessProfile: {
            generatedAccessMode: "inherit",
            pathPrefix: "/app",
          },
        }),
        runtime,
      ),
    );

    expect(commands).not.toContain("ConfigureResourceAccessCommand");
  });

  test("[CONFIG-FILE-GENERATED-ACCESS-005] config generated access profile disables generated access", async () => {
    ensureReflectMetadata();
    const { resolveInteractiveDeploymentInput } = await import(
      "../src/commands/deployment-interaction"
    );
    const { CliRuntime } = await import("../src/runtime");

    const commands: AppCommand<unknown>[] = [];
    const runtime = Layer.succeed(CliRuntime, {
      version: "test",
      startServer: async () => {},
      executeCommand: async <T>(message: AppCommand<T>) => {
        commands.push(message as AppCommand<unknown>);
        return ok({ id: "res_existing" } as T);
      },
      executeQuery: async <T>(message: AppQuery<T>) => {
        if (message.constructor.name === "ShowResourceQuery") {
          return ok({
            accessProfile: {
              generatedAccessMode: "inherit",
              pathPrefix: "/",
            },
          } as T);
        }
        return ok({ items: [] } as T);
      },
    });

    await Effect.runPromise(
      Effect.provide(
        resolveInteractiveDeploymentInput({
          sourceLocator: ".",
          deploymentMethod: "workspace-commands",
          projectId: "proj_existing",
          serverId: "srv_existing",
          environmentId: "env_existing",
          resourceId: "res_existing",
          generatedAccessProfile: {
            generatedAccessMode: "disabled",
            pathPrefix: "/",
          },
        }),
        runtime,
      ),
    );

    const access = commands.find(
      (command) => command.constructor.name === "ConfigureResourceAccessCommand",
    ) as Record<string, unknown> | undefined;
    expect(access).toMatchObject({
      resourceId: "res_existing",
      accessProfile: {
        generatedAccessMode: "disabled",
        pathPrefix: "/",
      },
    });
  });

  test("[CONFIG-FILE-MONITORING-THRESHOLDS-003] config monitoring thresholds configure before deployment admission", async () => {
    ensureReflectMetadata();
    const workspace = mkdtempSync(join(tmpdir(), "appaloft-monitoring-thresholds-config-"));
    const configPath = join(workspace, "appaloft.yaml");
    writeFileSync(
      configPath,
      [
        "runtime:",
        "  strategy: workspace-commands",
        "monitoring:",
        "  thresholds:",
        "    enabled: true",
        "    rules:",
        "      - signal: cpu",
        "        metric: containerCpuPercent",
        "        warning: 70",
        "        critical: 90",
        "",
      ].join("\n"),
    );
    const harness = await createPreviewDeployCliHarness();

    try {
      await withMutedProcessOutput(async () => {
        await harness.program.parseAsync([
          "node",
          "appaloft",
          "deploy",
          workspace,
          "--config",
          configPath,
          "--server-host",
          "203.0.113.95",
          "--server-provider",
          "generic-ssh",
        ]);
      });
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }

    expect(harness.operations).toContain("ShowRuntimeMonitoringThresholdsQuery");
    expect(harness.operations.indexOf("ConfigureRuntimeMonitoringThresholdsCommand")).toBeLessThan(
      harness.operations.indexOf("CreateDeploymentCommand"),
    );
    const thresholds = harness.commands.find(
      (command) => command.constructor.name === "ConfigureRuntimeMonitoringThresholdsCommand",
    ) as { input?: Record<string, unknown> } | undefined;
    expect(thresholds?.input).toMatchObject({
      scope: { kind: "resource", resourceId: "res_1" },
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
    const deployment = harness.commands.find(
      (command) => command.constructor.name === "CreateDeploymentCommand",
    ) as Record<string, unknown> | undefined;
    expect(deployment).not.toHaveProperty("monitoring");
    expect(deployment).not.toHaveProperty("thresholds");
    expect(deployment).not.toHaveProperty("monitoringThresholds");
  });

  test("[CONFIG-FILE-MONITORING-THRESHOLDS-004] config monitoring thresholds are idempotent for exact matching policy", async () => {
    ensureReflectMetadata();
    const { resolveInteractiveDeploymentInput } = await import(
      "../src/commands/deployment-interaction"
    );
    const { CliRuntime } = await import("../src/runtime");

    const commands: string[] = [];
    const runtime = Layer.succeed(CliRuntime, {
      version: "test",
      startServer: async () => {},
      executeCommand: async <T>(message: AppCommand<T>) => {
        commands.push(message.constructor.name);
        return ok(null as T);
      },
      executeQuery: async <T>(message: AppQuery<T>) => {
        if (message.constructor.name === "ShowRuntimeMonitoringThresholdsQuery") {
          return ok({
            schemaVersion: "runtime-monitoring-thresholds.show/v1",
            scope: { kind: "resource", resourceId: "res_existing" },
            generatedAt: "2026-05-24T00:00:00.000Z",
            policy: {
              schemaVersion: "runtime-monitoring-thresholds.policy/v1",
              policyId: "rmtp_existing",
              scope: { kind: "resource", resourceId: "res_existing" },
              enabled: true,
              rules: [
                {
                  ruleId: "rmtr_cpu",
                  signal: "cpu",
                  metric: "containerCpuPercent",
                  warning: 70,
                  critical: 90,
                  comparator: "greater-than-or-equal",
                },
              ],
              updatedAt: "2026-05-24T00:00:00.000Z",
            },
            evaluation: {
              state: "unknown",
              crossed: [],
              nextActions: ["open-runtime-monitoring"],
              sourceErrors: [],
            },
          } as T);
        }
        return ok({ items: [] } as T);
      },
    });

    await Effect.runPromise(
      Effect.provide(
        resolveInteractiveDeploymentInput({
          sourceLocator: ".",
          deploymentMethod: "workspace-commands",
          projectId: "proj_existing",
          serverId: "srv_existing",
          environmentId: "env_existing",
          resourceId: "res_existing",
          monitoringThresholds: {
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
          },
        }),
        runtime,
      ),
    );

    expect(commands).not.toContain("ConfigureRuntimeMonitoringThresholdsCommand");
  });

  test("[CONFIG-FILE-MONITORING-THRESHOLDS-005] config monitoring thresholds create exact override for inherited policy", async () => {
    ensureReflectMetadata();
    const { resolveInteractiveDeploymentInput } = await import(
      "../src/commands/deployment-interaction"
    );
    const { CliRuntime } = await import("../src/runtime");

    const commands: AppCommand<unknown>[] = [];
    const runtime = Layer.succeed(CliRuntime, {
      version: "test",
      startServer: async () => {},
      executeCommand: async <T>(message: AppCommand<T>) => {
        commands.push(message as AppCommand<unknown>);
        return ok({ policy: { policyId: "rmtp_resource" } } as T);
      },
      executeQuery: async <T>(message: AppQuery<T>) => {
        if (message.constructor.name === "ShowRuntimeMonitoringThresholdsQuery") {
          return ok({
            schemaVersion: "runtime-monitoring-thresholds.show/v1",
            scope: { kind: "resource", resourceId: "res_existing" },
            generatedAt: "2026-05-24T00:00:00.000Z",
            policy: {
              schemaVersion: "runtime-monitoring-thresholds.policy/v1",
              policyId: "rmtp_parent",
              scope: { kind: "project", projectId: "proj_existing" },
              enabled: true,
              rules: [
                {
                  ruleId: "rmtr_parent_cpu",
                  signal: "cpu",
                  metric: "containerCpuPercent",
                  warning: 60,
                  critical: 80,
                  comparator: "greater-than-or-equal",
                },
              ],
              updatedAt: "2026-05-24T00:00:00.000Z",
            },
            evaluation: {
              state: "unknown",
              crossed: [],
              nextActions: ["open-runtime-monitoring"],
              sourceErrors: [],
            },
          } as T);
        }
        return ok({ items: [] } as T);
      },
    });

    await Effect.runPromise(
      Effect.provide(
        resolveInteractiveDeploymentInput({
          sourceLocator: ".",
          deploymentMethod: "workspace-commands",
          projectId: "proj_existing",
          serverId: "srv_existing",
          environmentId: "env_existing",
          resourceId: "res_existing",
          monitoringThresholds: {
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
          },
        }),
        runtime,
      ),
    );

    const thresholds = commands.find(
      (command) => command.constructor.name === "ConfigureRuntimeMonitoringThresholdsCommand",
    ) as { input?: Record<string, unknown> } | undefined;
    expect(thresholds?.input).toMatchObject({
      scope: { kind: "resource", resourceId: "res_existing" },
      enabled: true,
    });
    expect(thresholds?.input).not.toHaveProperty("policyId");
  });

  test("[CONFIG-FILE-STATE-002] remote state lifecycle runs before identity queries and mutations", async () => {
    ensureReflectMetadata();
    const { resolveInteractiveDeploymentInput } = await import(
      "../src/commands/deployment-interaction"
    );
    const { CliRuntime } = await import("../src/runtime");

    const operations: string[] = [];
    const runtime = Layer.succeed(CliRuntime, {
      version: "test",
      startServer: async () => {},
      prepareDeploymentStateBackend: async (decision) => {
        operations.push(`PrepareState:${decision.kind}`);
        return ok({
          dataRoot: "/var/lib/appaloft/runtime/state",
          schemaVersion: 1,
          release: async () => {
            operations.push(`ReleaseState:${decision.kind}`);
            return ok(undefined);
          },
        });
      },
      executeCommand: async <T>(message: AppCommand<T>) => {
        operations.push(message.constructor.name);
        switch (message.constructor.name) {
          case "CreateProjectCommand":
            return ok({ id: "proj_1" } as T);
          case "RegisterServerCommand":
            return ok({ id: "srv_1" } as T);
          case "CreateEnvironmentCommand":
            return ok({ id: "env_1" } as T);
          case "CreateResourceCommand":
            return ok({ id: "res_1" } as T);
          default:
            return ok(null as T);
        }
      },
      executeQuery: async <T>(message: AppQuery<T>) => {
        operations.push(message.constructor.name);
        return ok({ items: [] } as T);
      },
    });

    const stateBackend = resolveDeploymentStateBackend({
      trustedSshTarget: {
        host: "203.0.113.10",
        port: 22,
        providerKey: "generic-ssh",
      },
    });

    const input = await Effect.runPromise(
      Effect.provide(
        resolveInteractiveDeploymentInput({
          sourceLocator: ".",
          deploymentMethod: "workspace-commands",
          stateBackend,
          server: {
            name: "ci-target",
            host: "203.0.113.10",
            providerKey: "generic-ssh",
            port: 22,
            credential: {
              kind: "ssh-private-key",
              username: "root",
              privateKey:
                "-----BEGIN OPENSSH PRIVATE KEY-----\nsecret\n-----END OPENSSH PRIVATE KEY-----",
            },
          },
        }),
        runtime,
      ),
    );

    expect(operations[0]).toBe("PrepareState:ssh-pglite");
    expect(operations).toEqual([
      "PrepareState:ssh-pglite",
      "ListProjectsQuery",
      "ListServersQuery",
      "CreateProjectCommand",
      "RegisterServerCommand",
      "ConfigureServerCredentialCommand",
      "CreateEnvironmentCommand",
      "CreateResourceCommand",
      "ReleaseState:ssh-pglite",
    ]);
    expect(input).toEqual({
      projectId: "proj_1",
      serverId: "srv_1",
      environmentId: "env_1",
      resourceId: "res_1",
    });
  });

  test("[CONFIG-FILE-STATE-010] SSH config deploy stops before mutation when remote lifecycle is unavailable", async () => {
    ensureReflectMetadata();
    const { resolveInteractiveDeploymentInput } = await import(
      "../src/commands/deployment-interaction"
    );
    const { CliRuntime } = await import("../src/runtime");

    const commands: string[] = [];
    const runtime = Layer.succeed(CliRuntime, {
      version: "test",
      startServer: async () => {},
      executeCommand: async <T>(message: AppCommand<T>) => {
        commands.push(message.constructor.name);
        return ok(null as T);
      },
      executeQuery: async <T>() => ok({ items: [] } as T),
    });
    const stateBackend = resolveDeploymentStateBackend({
      trustedSshTarget: {
        host: "203.0.113.10",
        port: 22,
        providerKey: "generic-ssh",
      },
    });

    const result = await Effect.runPromise(
      Effect.either(
        Effect.provide(
          resolveInteractiveDeploymentInput({
            sourceLocator: ".",
            deploymentMethod: "workspace-commands",
            stateBackend,
            server: {
              name: "ci-target",
              host: "203.0.113.10",
              providerKey: "generic-ssh",
              port: 22,
            },
          }),
          runtime,
        ),
      ),
    );

    expect(Either.isLeft(result)).toBe(true);
    if (Either.isRight(result)) {
      throw new Error("Expected remote state lifecycle gate to fail");
    }
    expect(result.left).toMatchObject({
      code: "validation_error",
      details: {
        phase: "remote-state-resolution",
        stateBackend: "ssh-pglite",
      },
    });
    expect(commands).toEqual([]);
  });

  test("[CONFIG-FILE-STATE-007] explicit local pglite deploy can bootstrap temporary context without ids", async () => {
    ensureReflectMetadata();
    const { resolveInteractiveDeploymentInput } = await import(
      "../src/commands/deployment-interaction"
    );
    const { CliRuntime } = await import("../src/runtime");

    const commands: string[] = [];
    const runtime = Layer.succeed(CliRuntime, {
      version: "test",
      startServer: async () => {},
      executeCommand: async <T>(message: AppCommand<T>) => {
        commands.push(message.constructor.name);
        switch (message.constructor.name) {
          case "CreateProjectCommand":
            return ok({ id: "proj_1" } as T);
          case "RegisterServerCommand":
            return ok({ id: "srv_1" } as T);
          case "CreateEnvironmentCommand":
            return ok({ id: "env_1" } as T);
          case "CreateResourceCommand":
            return ok({ id: "res_1" } as T);
          default:
            return ok(null as T);
        }
      },
      executeQuery: async <T>() => ok({ items: [] } as T),
    });

    const input = await Effect.runPromise(
      Effect.provide(
        resolveInteractiveDeploymentInput({
          sourceLocator: ".",
          deploymentMethod: "workspace-commands",
          stateBackend: resolveDeploymentStateBackend({
            explicitBackend: "local-pglite",
            trustedSshTarget: {
              host: "203.0.113.10",
              port: 22,
              providerKey: "generic-ssh",
            },
          }),
          server: {
            name: "ci-target",
            host: "203.0.113.10",
            providerKey: "generic-ssh",
            port: 22,
            credential: {
              kind: "ssh-private-key",
              username: "root",
              privateKey:
                "-----BEGIN OPENSSH PRIVATE KEY-----\nsecret\n-----END OPENSSH PRIVATE KEY-----",
            },
          },
        }),
        runtime,
      ),
    );

    expect(commands).toEqual([
      "CreateProjectCommand",
      "RegisterServerCommand",
      "ConfigureServerCredentialCommand",
      "CreateEnvironmentCommand",
      "CreateResourceCommand",
    ]);
    expect(input).toEqual({
      projectId: "proj_1",
      serverId: "srv_1",
      environmentId: "env_1",
      resourceId: "res_1",
    });
  });

  test("[SOURCE-LINK-STATE-005] config deploy reuses existing source link ids", async () => {
    ensureReflectMetadata();
    const { resolveInteractiveDeploymentInput } = await import(
      "../src/commands/deployment-interaction"
    );
    const { CliRuntime } = await import("../src/runtime");

    const operations: string[] = [];
    const sourceLinkCalls: string[] = [];
    const runtime = Layer.succeed(CliRuntime, {
      version: "test",
      startServer: async () => {},
      sourceLinkStore: {
        read: async (sourceFingerprint) => {
          sourceLinkCalls.push(`read:${sourceFingerprint}`);
          return ok({
            sourceFingerprint,
            projectId: "proj_linked",
            serverId: "srv_linked",
            environmentId: "env_linked",
            resourceId: "res_linked",
            updatedAt: "2026-04-19T00:00:00.000Z",
          });
        },
        requireSameTargetOrMissing: async () => {
          sourceLinkCalls.push("requireSameTargetOrMissing");
          return ok(null);
        },
        createIfMissing: async (input) => {
          sourceLinkCalls.push("createIfMissing");
          return ok({
            sourceFingerprint: input.sourceFingerprint,
            updatedAt: input.updatedAt,
            ...input.target,
          });
        },
      },
      executeCommand: async <T>(message: AppCommand<T>) => {
        operations.push(message.constructor.name);
        return ok(null as T);
      },
      executeQuery: async <T>(message: AppQuery<T>) => {
        operations.push(message.constructor.name);
        return ok({ items: [] } as T);
      },
    });

    const input = await Effect.runPromise(
      Effect.provide(
        resolveInteractiveDeploymentInput({
          sourceLocator: ".",
          deploymentMethod: "workspace-commands",
          sourceFingerprint: "source-fingerprint:v1:branch%3Amain",
        }),
        runtime,
      ),
    );

    expect(input).toEqual({
      projectId: "proj_linked",
      serverId: "srv_linked",
      environmentId: "env_linked",
      resourceId: "res_linked",
    });
    expect(operations).toEqual(["ListProjectsQuery", "ListServersQuery"]);
    expect(sourceLinkCalls).toEqual([
      "read:source-fingerprint:v1:branch%3Amain",
      "requireSameTargetOrMissing",
      "createIfMissing",
    ]);
  });

  test("[SOURCE-LINK-STATE-004] first-run config deploy creates a source link", async () => {
    ensureReflectMetadata();
    const { resolveInteractiveDeploymentInput } = await import(
      "../src/commands/deployment-interaction"
    );
    const { CliRuntime } = await import("../src/runtime");

    const createdLinks: unknown[] = [];
    const runtime = Layer.succeed(CliRuntime, {
      version: "test",
      startServer: async () => {},
      sourceLinkStore: {
        read: async () => ok(null),
        requireSameTargetOrMissing: async () => ok(null),
        createIfMissing: async (input) => {
          createdLinks.push(input);
          return ok({
            sourceFingerprint: input.sourceFingerprint,
            updatedAt: input.updatedAt,
            ...input.target,
          });
        },
      },
      executeCommand: async <T>(message: AppCommand<T>) => {
        switch (message.constructor.name) {
          case "CreateProjectCommand":
            return ok({ id: "proj_1" } as T);
          case "RegisterServerCommand":
            return ok({ id: "srv_1" } as T);
          case "CreateEnvironmentCommand":
            return ok({ id: "env_1" } as T);
          case "CreateResourceCommand":
            return ok({ id: "res_1" } as T);
          default:
            return ok(null as T);
        }
      },
      executeQuery: async <T>() => ok({ items: [] } as T),
    });

    const input = await Effect.runPromise(
      Effect.provide(
        resolveInteractiveDeploymentInput({
          sourceLocator: ".",
          deploymentMethod: "workspace-commands",
          sourceFingerprint: "source-fingerprint:v1:branch%3Amain",
        }),
        runtime,
      ),
    );

    expect(input).toEqual({
      projectId: "proj_1",
      serverId: "srv_1",
      environmentId: "env_1",
      resourceId: "res_1",
    });
    expect(createdLinks).toHaveLength(1);
    expect(createdLinks[0]).toMatchObject({
      sourceFingerprint: "source-fingerprint:v1:branch%3Amain",
      target: {
        projectId: "proj_1",
        serverId: "srv_1",
        environmentId: "env_1",
        resourceId: "res_1",
      },
    });
  });
});
