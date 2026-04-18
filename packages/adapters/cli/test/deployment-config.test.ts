import { describe, expect, test } from "bun:test";

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
});
