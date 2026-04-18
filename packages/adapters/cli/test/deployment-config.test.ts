import { describe, expect, test } from "bun:test";
import { type Command as AppCommand, type Query as AppQuery } from "@appaloft/application";
import { ok } from "@appaloft/core";
import { Effect, Layer } from "effect";

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
      port: 4310,
      upstreamProtocol: "http",
      exposureMode: "reverse-proxy",
      healthCheckPath: "/ready",
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

  test("[CONFIG-FILE-ENTRY-008] headless pglite deploy can bootstrap temporary context without ids", async () => {
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
});
