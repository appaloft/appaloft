import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type Command as AppCommand,
  type Query as AppQuery,
  type CommandBus,
  type ExecutionContextFactory,
  type QueryBus,
} from "@appaloft/application";
import { ok } from "@appaloft/core";
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

async function createPreviewDeployCliHarness(
  input: {
    withRouteStore?: boolean;
    deploymentSummaries?: unknown[];
    sourceLinkRecord?: Record<string, unknown> | null;
    resourceDetail?: Record<string, unknown> | null;
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
        case "ConfigureResourceRuntimeCommand":
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
      if (query.constructor.name === "ListDeploymentsQuery") {
        return ok({ items: input.deploymentSummaries ?? [] } as T);
      }
      if (query.constructor.name === "ShowResourceQuery") {
        return ok(
          (input.resourceDetail ?? {
            runtimeProfile: undefined,
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
            deleteDesired: async () => ok(false),
          },
        }
      : {}),
  });

  return {
    commands,
    createdLinks,
    desiredRoutes,
    operations,
    program,
    queries,
    sourceLinkCalls,
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
        gitRef: "main",
        commitSha: "abc123",
      },
      runtime: {
        strategy: "workspace-commands",
        installCommand: "bun install",
        buildCommand: "bun run build",
        startCommand: "bun run start",
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
    });

    expect(seed).toMatchObject({
      sourceProfile: {
        gitRef: "main",
        commitSha: "abc123",
      },
      deploymentMethod: "workspace-commands",
      installCommand: "bun install",
      buildCommand: "bun run build",
      startCommand: "bun run start",
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
    });
    expect(runtimeProfileFromDeploymentInput("workspace-commands", seed)).toMatchObject({
      strategy: "workspace-commands",
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
        deleteDesired: async () => ok(false),
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
      "ListEnvironmentsQuery",
      "ListResourcesQuery",
    ]);
    expect(operations).toEqual([
      "PrepareState:ssh-pglite",
      "ListProjectsQuery",
      "ListServersQuery",
      "CreateProjectCommand",
      "RegisterServerCommand",
      "ListEnvironmentsQuery",
      "CreateEnvironmentCommand",
      "ListResourcesQuery",
      "CreateResourceCommand",
      "UpsertServerAppliedRoutes",
      "CreateDeploymentCommand",
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

  test("[CONFIG-FILE-ENTRY-015B] deploy action PR preview reconfigures an existing preview resource runtime name", async () => {
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
              "pr-125",
              "--runtime-name",
              "appaloft-preview-125",
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

    const configureRuntime = harness.commands.find(
      (command) => command.constructor.name === "ConfigureResourceRuntimeCommand",
    );

    expect(configureRuntime).toMatchObject({
      resourceId: "res_existing",
      runtimeProfile: {
        strategy: "workspace-commands",
        buildCommand: "bun run build",
        startCommand: "bun run start",
        runtimeName: "appaloft-preview-125",
      },
    });
    expect(
      (configureRuntime as { runtimeProfile: Record<string, unknown> }).runtimeProfile,
    ).not.toHaveProperty("healthCheckPath");
    expect(harness.queries.map((query) => query.constructor.name)).toContain("ShowResourceQuery");

    expect(
      harness.commands.find((command) => command.constructor.name === "CreateResourceCommand"),
    ).toBeUndefined();

    expect(
      harness.commands.find((command) => command.constructor.name === "CreateDeploymentCommand"),
    ).toMatchObject({
      projectId: "proj_existing",
      serverId: "srv_existing",
      environmentId: "env_existing",
      resourceId: "res_existing",
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
      "ListEnvironmentsQuery",
      "CreateEnvironmentCommand",
      "ListResourcesQuery",
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
