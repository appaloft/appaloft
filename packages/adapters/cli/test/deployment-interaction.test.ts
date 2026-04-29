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

describe("CLI quick deploy draft mapping", () => {
  test("[QUICK-DEPLOY-ENTRY-008] maps static site flags to resources.create draft fields", async () => {
    ensureReflectMetadata();
    const {
      networkProfileFromDeploymentInput,
      resourceKindForDeploymentMethod,
      runtimeProfileFromDeploymentInput,
      sourceBindingForDeploymentInput,
    } = await import("../src/commands/deployment-interaction");

    expect(resourceKindForDeploymentMethod("static")).toBe("static-site");
    expect(sourceBindingForDeploymentInput("https://github.com/acme/docs.git", "static")).toEqual({
      kind: "git-public",
      locator: "https://github.com/acme/docs.git",
      displayName: "docs",
    });
    expect(
      runtimeProfileFromDeploymentInput("static", {
        installCommand: "pnpm install",
        buildCommand: "pnpm build",
        publishDirectory: "/dist",
        startCommand: "pnpm start",
      }),
    ).toEqual({
      strategy: "static",
      installCommand: "pnpm install",
      buildCommand: "pnpm build",
      publishDirectory: "/dist",
    });
    expect(networkProfileFromDeploymentInput("static", {})).toEqual({
      internalPort: 80,
      upstreamProtocol: "http",
      exposureMode: "reverse-proxy",
    });
  });

  test("[QUICK-DEPLOY-WF-040] keeps non-static CLI drafts on the application defaults", async () => {
    ensureReflectMetadata();
    const {
      networkProfileFromDeploymentInput,
      resourceKindForDeploymentMethod,
      runtimeProfileFromDeploymentInput,
    } = await import("../src/commands/deployment-interaction");

    expect(resourceKindForDeploymentMethod("workspace-commands")).toBe("application");
    expect(runtimeProfileFromDeploymentInput("workspace-commands", {})).toEqual({
      strategy: "workspace-commands",
    });
    expect(networkProfileFromDeploymentInput("workspace-commands", {})).toEqual({
      internalPort: 3000,
      upstreamProtocol: "http",
      exposureMode: "reverse-proxy",
    });
  });

  test("[QUICK-DEPLOY-ENTRY-013][WF-PLAN-ENTRY-005] maps non-static CLI framework draft fields to resource profiles", async () => {
    ensureReflectMetadata();
    const {
      networkProfileFromDeploymentInput,
      runtimeProfileFromDeploymentInput,
      sourceBindingForDeploymentInput,
    } = await import("../src/commands/deployment-interaction");

    const seed = {
      sourceProfile: {
        baseDirectory: "apps/api",
      },
      installCommand: "pnpm install --frozen-lockfile",
      buildCommand: "pnpm build",
      startCommand: "pnpm start",
      dockerfilePath: "deploy/Dockerfile",
      dockerComposeFilePath: "deploy/compose.yaml",
      buildTarget: "runner",
      port: 3000,
    };

    expect(
      sourceBindingForDeploymentInput(".", "workspace-commands", seed.sourceProfile),
    ).toMatchObject({
      kind: "local-folder",
      locator: ".",
      baseDirectory: "apps/api",
    });
    expect(runtimeProfileFromDeploymentInput("workspace-commands", seed)).toEqual({
      strategy: "workspace-commands",
      installCommand: "pnpm install --frozen-lockfile",
      buildCommand: "pnpm build",
      startCommand: "pnpm start",
      dockerfilePath: "deploy/Dockerfile",
      dockerComposeFilePath: "deploy/compose.yaml",
      buildTarget: "runner",
    });
    expect(networkProfileFromDeploymentInput("workspace-commands", seed)).toEqual({
      internalPort: 3000,
      upstreamProtocol: "http",
      exposureMode: "reverse-proxy",
    });
  });
});
