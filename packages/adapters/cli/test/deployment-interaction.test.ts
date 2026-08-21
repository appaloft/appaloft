import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
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

    const hostRoot = mkdtempSync(join(tmpdir(), "appaloft-cli-generic-cwd-"));
    const cliCwd = join(hostRoot, "cli");
    mkdirSync(cliCwd, { recursive: true });
    const previousCwd = process.cwd();
    try {
      process.chdir(cliCwd);
      const sent = sourceBindingForDeploymentInput(".", "workspace-commands", seed.sourceProfile);
      expect(sent).toMatchObject({
        kind: "local-folder",
        locator: ".",
        baseDirectory: "apps/api",
      });
      expect(sent.locator).not.toBe(resolve(cliCwd));
      expect(sent.metadata?.cliPackedSourceTarGz).toBeUndefined();
    } finally {
      process.chdir(previousCwd);
      rmSync(hostRoot, { recursive: true, force: true });
    }
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
      originalLocator: locator,
      metadata: {
        [CLI_RESOLVED_SOURCE_METADATA_KEY]: locator,
      },
    });
    expect(
      sourceBindingForDeploymentInput("https://github.com/acme/docs.git", "static").metadata,
    ).toBe(undefined);
    expect(
      sourceBindingForDeploymentInput("ghcr.io/acme/api:1.7.3", "prebuilt-image"),
    ).toMatchObject({
      kind: "docker-image",
      locator: "ghcr.io/acme/api:1.7.3",
    });
    expect(
      sourceBindingForDeploymentInput("ghcr.io/acme/api:1.7.3", "prebuilt-image").metadata,
    ).toBe(undefined);
  });

  test("[DEP-CREATE-PKG-007][QUICK-DEPLOY-ENTRY-008B] attaches the CLI-host packed archive to local-folder source metadata", async () => {
    ensureReflectMetadata();
    const { sourceBindingForDeploymentInput, sourceProfilesMatch } =
      await import("../src/commands/deployment-interaction");
    const { CLI_PACKED_SOURCE_ARCHIVE_METADATA_KEY, CLI_RESOLVED_SOURCE_METADATA_KEY } =
      await import("@appaloft/application");
    const locator = "/Users/nichenqin/projects/nux-055483c0-static";
    const packedSourceArchiveTarGz = "H4sIAAAAAAAAAytKLSpILC4u1gMA";
    const desired = sourceBindingForDeploymentInput(locator, "static", {
      packedSourceArchiveTarGz,
    });

    expect(desired.metadata?.[CLI_RESOLVED_SOURCE_METADATA_KEY]).toBe(locator);
    expect(desired.metadata?.[CLI_PACKED_SOURCE_ARCHIVE_METADATA_KEY]).toBe(
      packedSourceArchiveTarGz,
    );
    expect(
      sourceProfilesMatch({
        current: {
          kind: "local-folder",
          locator,
          displayName: "nux-055483c0-static",
          originalLocator: locator,
          sourceBindingFingerprint: "fp_same_locator",
        },
        desired,
      }),
    ).toBe(true);
  });

  test("[DEP-CREATE-PKG-007] refreshes a reused static source when CLI-resolved metadata is missing", async () => {
    ensureReflectMetadata();
    const { sourceBindingForDeploymentInput, sourceProfilesMatch } =
      await import("../src/commands/deployment-interaction");
    const locator = "/Users/nichenqin/projects/nux-772b6112-static";
    const desired = sourceBindingForDeploymentInput(locator, "static");

    expect(
      sourceProfilesMatch({
        current: {
          kind: "local-folder",
          locator,
          displayName: "nux-772b6112-static",
          sourceBindingFingerprint: "fp_missing_cli_resolved",
        },
        desired,
      }),
    ).toBe(false);
    expect(
      sourceProfilesMatch({
        current: {
          kind: "local-folder",
          locator,
          displayName: "nux-772b6112-static",
          sourceBindingFingerprint: "fp_with_original_locator",
          originalLocator: locator,
        },
        desired,
      }),
    ).toBe(true);
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

  test("[DEP-CREATE-PKG-007][QUICK-DEPLOY-ENTRY-008B] flagged static deploy keeps hyphenated appaloft-cloud under projects", async () => {
    ensureReflectMetadata();
    const { normalizeCliPathOrSource, resolveCliHostLocalSourceFolder } =
      await import("../src/commands/deployment-source");
    const { normalizeUrlFirstDeploymentEntry } =
      await import("../src/commands/deployment-interaction");

    const hostRoot = mkdtempSync(join(tmpdir(), "appaloft-cloud-cwd-"));
    const parent = join(hostRoot, "projects");
    const leaf = "appaloft-cloud";
    const folder = join(parent, leaf);
    mkdirSync(join(folder, "public"), { recursive: true });
    writeFileSync(join(folder, "public", "index.html"), "<!doctype html><title>cloud</title>");
    const previousCwd = process.cwd();
    const previousPwd = process.env.PWD;

    try {
      process.chdir(folder);
      process.env.PWD = parent;
      expect(normalizeCliPathOrSource(".", "static")).toBe(resolve(folder));
      expect(normalizeCliPathOrSource(parent, "static")).toBe(resolve(folder));
      expect(resolveCliHostLocalSourceFolder(parent)).toBe(resolve(folder));
      expect(normalizeCliPathOrSource(".", "static")).not.toBe(resolve(parent));

      const flagged = normalizeUrlFirstDeploymentEntry({
        entryMode: "static-site",
        sourceLocator: ".",
      });
      expect(flagged._unsafeUnwrap()).toEqual({
        deploymentMethod: "static",
        publishDirectory: "public",
      });

      process.chdir(parent);
      process.env.PWD = folder;
      expect(normalizeCliPathOrSource(".", "static")).toBe(resolve(folder));
      expect(normalizeCliPathOrSource(parent, "static")).toBe(resolve(folder));
      expect(resolveCliHostLocalSourceFolder()).toBe(resolve(folder));
    } finally {
      process.chdir(previousCwd);
      if (previousPwd === undefined) {
        delete process.env.PWD;
      } else {
        process.env.PWD = previousPwd;
      }
      rmSync(hostRoot, { recursive: true, force: true });
    }
  });

  test("[DEP-CREATE-PKG-007][QUICK-DEPLOY-ENTRY-008B] deploy . keeps a non-git hyphenated nux leaf under projects", async () => {
    ensureReflectMetadata();
    const { normalizeCliPathOrSource, resolveCliHostLocalSourceFolder } =
      await import("../src/commands/deployment-source");
    const { normalizeUrlFirstDeploymentEntry } =
      await import("../src/commands/deployment-interaction");

    const hostRoot = mkdtempSync(join(tmpdir(), "appaloft-nux-cwd-"));
    const parent = join(hostRoot, "projects");
    const leaf = "nux-d73d53b6-static";
    const folder = join(parent, leaf);
    mkdirSync(join(folder, "public"), { recursive: true });
    writeFileSync(join(folder, "public", "index.html"), "<!doctype html><title>nux</title>");
    const previousCwd = process.cwd();
    const previousPwd = process.env.PWD;

    try {
      process.chdir(folder);
      process.env.PWD = parent;
      expect(normalizeCliPathOrSource(".", "auto")).toBe(resolve(folder));
      expect(normalizeCliPathOrSource(parent, "auto")).toBe(resolve(folder));
      expect(resolveCliHostLocalSourceFolder(parent)).toBe(resolve(folder));
      expect(normalizeCliPathOrSource(".", "auto")).not.toBe(resolve(parent));

      const autoEntry = normalizeUrlFirstDeploymentEntry({
        sourceLocator: ".",
      });
      expect(autoEntry._unsafeUnwrap()).toEqual({
        deploymentMethod: "static",
        publishDirectory: "public",
      });
    } finally {
      process.chdir(previousCwd);
      if (previousPwd === undefined) {
        delete process.env.PWD;
      } else {
        process.env.PWD = previousPwd;
      }
      rmSync(hostRoot, { recursive: true, force: true });
    }
  });

  test("[DEP-CREATE-PKG-007][QUICK-DEPLOY-ENTRY-008B] create-resource send fields keep nux-c689b0f1-static off the projects parent", async () => {
    ensureReflectMetadata();
    const { sourceBindingForDeploymentInput } =
      await import("../src/commands/deployment-interaction");
    const { CLI_PACKED_SOURCE_ARCHIVE_METADATA_KEY, CLI_RESOLVED_SOURCE_METADATA_KEY } =
      await import("@appaloft/application");

    const hostRoot = mkdtempSync(join(tmpdir(), "appaloft-cli-bind-nux-"));
    const parent = join(hostRoot, "projects");
    const leaf = "nux-c689b0f1-static";
    const folder = join(parent, leaf);
    mkdirSync(join(folder, "public"), { recursive: true });
    writeFileSync(join(folder, "public", "index.html"), "<!doctype html><title>nux</title>");
    const previousCwd = process.cwd();
    const previousPwd = process.env.PWD;

    try {
      process.chdir(folder);
      process.env.PWD = parent;

      for (const incoming of [".", parent, folder] as const) {
        const sent = sourceBindingForDeploymentInput(incoming, "static");
        expect(sent.locator).toBe(resolve(folder));
        expect(sent.locator).not.toBe(resolve(parent));
        expect(sent.originalLocator).toBe(resolve(folder));
        expect(sent.originalLocator).not.toBe(resolve(parent));
        expect(sent.displayName).toBe(leaf);
        expect(sent.metadata?.[CLI_RESOLVED_SOURCE_METADATA_KEY]).toBe(resolve(folder));
        expect(sent.metadata?.[CLI_PACKED_SOURCE_ARCHIVE_METADATA_KEY]?.length).toBeGreaterThan(0);

        const listingDir = mkdtempSync(join(tmpdir(), "appaloft-cli-bind-nux-list-"));
        const archivePath = join(listingDir, "source.tgz");
        writeFileSync(
          archivePath,
          Buffer.from(sent.metadata?.[CLI_PACKED_SOURCE_ARCHIVE_METADATA_KEY] ?? "", "base64"),
        );
        const listing = spawnSync("tar", ["-tzf", archivePath], { encoding: "utf8" });
        expect(listing.status).toBe(0);
        expect(listing.stdout).toContain("public/index.html");
        expect(listing.stdout.split("\n").some((line) => line.endsWith("/projects"))).toBe(false);
        rmSync(listingDir, { recursive: true, force: true });
      }
    } finally {
      process.chdir(previousCwd);
      if (previousPwd === undefined) {
        delete process.env.PWD;
      } else {
        process.env.PWD = previousPwd;
      }
      rmSync(hostRoot, { recursive: true, force: true });
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
