import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

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
      normalizeUrlFirstDeploymentEntry,
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
    const staticEntry = normalizeUrlFirstDeploymentEntry({
      entryMode: "static-site",
      sourceLocator: "./dist",
    });
    expect(staticEntry.isOk()).toBe(true);
    expect(staticEntry._unsafeUnwrap()).toEqual({
      deploymentMethod: "static",
      publishDirectory: "/",
    });
    const { StaticPublishDirectory } = await import("@appaloft/core");
    expect(StaticPublishDirectory.create(".").isOk()).toBe(true);
    expect(StaticPublishDirectory.create(".")._unsafeUnwrap().value).toBe("/");
    expect(StaticPublishDirectory.create("public")._unsafeUnwrap().value).toBe("public");
    expect(StaticPublishDirectory.create("public")._unsafeUnwrap().value).not.toBe("/public");
    expect(
      normalizeUrlFirstDeploymentEntry({
        entryMode: "static-site",
        requestedDeploymentMethod: "dockerfile",
        sourceLocator: "./dist",
      }).isErr(),
    ).toBe(true);
  });

  test("[QUICK-DEPLOY-ENTRY-008A] source-root publish-dir aliases become / before resources.create", async () => {
    ensureReflectMetadata();
    const { normalizeUrlFirstDeploymentEntry, runtimeProfileFromDeploymentInput } =
      await import("../src/commands/deployment-interaction");
    const { wireCompatibleStaticPublishDirectory } =
      await import("../src/commands/static-publish-directory-wire");

    expect(wireCompatibleStaticPublishDirectory(".")).toBe("/");
    expect(wireCompatibleStaticPublishDirectory("./")).toBe("/");
    expect(wireCompatibleStaticPublishDirectory("/")).toBe("/");
    expect(wireCompatibleStaticPublishDirectory("dist")).toBe("dist");
    expect(wireCompatibleStaticPublishDirectory("/dist")).toBe("/dist");
    expect(wireCompatibleStaticPublishDirectory("public")).toBe("public");
    expect(runtimeProfileFromDeploymentInput("static", { publishDirectory: "public" })).toEqual({
      strategy: "static",
      publishDirectory: "public",
    });
    expect(
      JSON.stringify(runtimeProfileFromDeploymentInput("static", { publishDirectory: "public" })),
    ).not.toContain("/public");

    for (const publishDirectory of [".", "./", "/"] as const) {
      expect(
        normalizeUrlFirstDeploymentEntry({
          requestedDeploymentMethod: "static",
          publishDirectory,
        })._unsafeUnwrap(),
      ).toEqual({
        deploymentMethod: "static",
        publishDirectory: "/",
      });
      expect(runtimeProfileFromDeploymentInput("static", { publishDirectory })).toEqual({
        strategy: "static",
        publishDirectory: "/",
      });
    }

    const asStaticSite = normalizeUrlFirstDeploymentEntry({
      entryMode: "static-site",
      sourceLocator: ".",
    })._unsafeUnwrap();
    expect(asStaticSite).toEqual({
      deploymentMethod: "static",
      publishDirectory: "/",
    });
    const wireBody = JSON.stringify({
      runtimeProfile: runtimeProfileFromDeploymentInput("static", asStaticSite),
    });
    expect(JSON.parse(wireBody).runtimeProfile.publishDirectory).toBe("/");
    expect(wireBody).not.toMatch(/"publishDirectory"\s*:\s*"\.+"/);
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

  test("[K8S-HELM-013] maps typed Helm CLI and config source input", async () => {
    ensureReflectMetadata();
    const {
      deploymentPromptSeedFromConfig,
      runtimeProfileFromDeploymentInput,
      sourceBindingForDeploymentInput,
    } = await import("../src/commands/deployment-interaction");

    const helmChart = {
      version: "1.7.3",
      valuesSecretReferences: ["secret://helm/storefront/production"],
      hookPolicy: "bounded" as const,
      timeoutSeconds: 420,
    };
    expect(
      sourceBindingForDeploymentInput("oci://registry.example.com/charts/storefront", "helm", {
        helmChart,
      }),
    ).toEqual({
      kind: "helm-chart",
      locator: "oci://registry.example.com/charts/storefront",
      displayName: "storefront",
      helmChart,
    });
    expect(runtimeProfileFromDeploymentInput("helm", {})).toEqual({ strategy: "helm" });
    expect(
      deploymentPromptSeedFromConfig({
        source: {
          type: "helm",
          chart: "oci://registry.example.com/charts/storefront",
          version: "1.7.3",
          valuesSecretReferences: ["secret://helm/storefront/production"],
          hookPolicy: "bounded",
          timeoutSeconds: 420,
        },
        runtime: { strategy: "helm" },
      }),
    ).toMatchObject({
      sourceLocator: "oci://registry.example.com/charts/storefront",
      deploymentMethod: "helm",
      sourceProfile: { kind: "helm-chart", helmChart },
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

  test("[QUICK-DEPLOY-WF-044] updates reusable resource sources for docker compose deploys", async () => {
    ensureReflectMetadata();
    const { shouldConfigureReusableResourceSource } =
      await import("../src/commands/deployment-interaction");

    expect(
      shouldConfigureReusableResourceSource({
        seed: {},
        sourceLocator: "/workspace/compose.yml",
        deploymentMethod: "docker-compose",
      }),
    ).toBe(true);

    expect(
      shouldConfigureReusableResourceSource({
        seed: {},
        sourceLocator: "/workspace/app",
        deploymentMethod: "workspace-commands",
      }),
    ).toBe(false);

    expect(
      shouldConfigureReusableResourceSource({
        seed: {},
        sourceLocator: "/Users/nichenqin/projects/nux-9859a0e9-static",
        deploymentMethod: "static",
      }),
    ).toBe(true);
  });

  test("[DEP-CREATE-PKG-007] threads the CLI-resolved deploy path into source metadata", async () => {
    ensureReflectMetadata();
    const { sourceBindingForDeploymentInput } =
      await import("../src/commands/deployment-interaction");
    const { CLI_RESOLVED_SOURCE_METADATA_KEY } = await import("@appaloft/application");
    const locator = "/Users/nichenqin/projects/nux-772b6112-static";

    expect(sourceBindingForDeploymentInput(locator, "static")).toEqual({
      kind: "local-folder",
      locator,
      displayName: "nux-772b6112-static",
      metadata: {
        [CLI_RESOLVED_SOURCE_METADATA_KEY]: locator,
      },
    });
    expect(
      sourceBindingForDeploymentInput("https://github.com/acme/docs.git", "static").metadata,
    ).toBe(undefined);
  });

  test("[QUICK-DEPLOY-WF-067] reuses an enrolled localhost local-shell instead of registering 127.0.0.1", async () => {
    ensureReflectMetadata();
    const { findServer } = await import("../src/commands/deployment-interaction");

    const occupancyMac = {
      id: "srv_uil9cpctplou",
      name: "occupancy-mac",
      host: "localhost",
      port: 22,
      providerKey: "local-shell",
      targetKind: "single-server" as const,
      workloadRoles: [],
      lifecycleStatus: "active" as const,
      createdAt: "2026-08-15T00:00:00.000Z",
    };

    expect(
      findServer([occupancyMac], {
        host: "127.0.0.1",
        port: 22,
        providerKey: "local-shell",
      })?.id,
    ).toBe("srv_uil9cpctplou");
  });

  test("[QUICK-DEPLOY-ENTRY-008B] auto-detects static from public/index.html and defaults publish-dir", async () => {
    ensureReflectMetadata();
    const { detectLocalStaticPublishDirectory, normalizeCliPathOrSource } =
      await import("../src/commands/deployment-source");
    const { normalizeUrlFirstDeploymentEntry } =
      await import("../src/commands/deployment-interaction");

    const parent = mkdtempSync(join(tmpdir(), "appaloft-deploy-door-"));
    const sourceRoot = join(parent, "nux-fb4bd8c5-static");
    mkdirSync(join(sourceRoot, "public"), { recursive: true });
    writeFileSync(join(sourceRoot, "public", "index.html"), "<!doctype html><title>nux</title>");
    const previousCwd = process.cwd();
    const previousPwd = process.env.PWD;
    try {
      process.chdir(sourceRoot);
      process.env.PWD = parent;

      expect(detectLocalStaticPublishDirectory(".")).toBe("public");
      expect(detectLocalStaticPublishDirectory(sourceRoot)).toBe("public");
      expect(normalizeCliPathOrSource(".", "auto")).toBe(resolve(sourceRoot));
      expect(normalizeCliPathOrSource(".", "auto")).toContain("nux-fb4bd8c5-static");
      expect(normalizeCliPathOrSource(".", "auto")).not.toBe(resolve(parent));

      const autoEntry = normalizeUrlFirstDeploymentEntry({
        sourceLocator: ".",
      });
      expect(autoEntry.isOk()).toBe(true);
      expect(autoEntry._unsafeUnwrap()).toEqual({
        deploymentMethod: "static",
        publishDirectory: "public",
      });

      const methodOnly = normalizeUrlFirstDeploymentEntry({
        requestedDeploymentMethod: "static",
        sourceLocator: ".",
      });
      expect(methodOnly._unsafeUnwrap()).toEqual({
        deploymentMethod: "static",
        publishDirectory: "public",
      });

      const emptyRoot = join(parent, "empty-static-method");
      mkdirSync(emptyRoot, { recursive: true });
      const methodWithoutFiles = normalizeUrlFirstDeploymentEntry({
        requestedDeploymentMethod: "static",
        sourceLocator: emptyRoot,
      });
      expect(methodWithoutFiles._unsafeUnwrap()).toEqual({
        deploymentMethod: "static",
      });
    } finally {
      process.chdir(previousCwd);
      if (previousPwd === undefined) {
        delete process.env.PWD;
      } else {
        process.env.PWD = previousPwd;
      }
      rmSync(parent, { recursive: true, force: true });
    }
  });

  test("[QUICK-DEPLOY-ENTRY-008B][RES-CREATE-ADM-037C] root index.html defaults to source-root publish-dir", async () => {
    ensureReflectMetadata();
    const { normalizeUrlFirstDeploymentEntry } =
      await import("../src/commands/deployment-interaction");
    const rootSite = mkdtempSync(join(tmpdir(), "appaloft-static-root-"));
    writeFileSync(join(rootSite, "index.html"), "<!doctype html><title>root</title>");
    const previousCwd = process.cwd();
    try {
      process.chdir(rootSite);
      const entry = normalizeUrlFirstDeploymentEntry({
        requestedDeploymentMethod: "static",
        sourceLocator: ".",
      });
      expect(entry._unsafeUnwrap()).toEqual({
        deploymentMethod: "static",
        publishDirectory: "/",
      });
      const dotted = normalizeUrlFirstDeploymentEntry({
        requestedDeploymentMethod: "static",
        publishDirectory: ".",
        sourceLocator: ".",
      });
      expect(dotted._unsafeUnwrap().publishDirectory).toBe("/");
    } finally {
      process.chdir(previousCwd);
      rmSync(rootSite, { recursive: true, force: true });
    }
  });
});
