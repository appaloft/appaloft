import { describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const workspaceFixtures = join(import.meta.dir, "fixtures", "workspaces");

function ensureReflectMetadata(): void {
  const reflectObject = Reflect as typeof Reflect & {
    defineMetadata?: (...args: unknown[]) => void;
    getMetadata?: (...args: unknown[]) => unknown;
    getOwnMetadata?: (...args: unknown[]) => unknown;
    getOwnMetadataKeys?: (...args: unknown[]) => unknown[];
    hasMetadata?: (...args: unknown[]) => boolean;
    metadata?: (_metadataKey: unknown, _metadataValue: unknown) => ClassDecorator;
  };

  reflectObject.defineMetadata ??= () => {};
  reflectObject.getMetadata ??= () => undefined;
  reflectObject.getOwnMetadata ??= () => undefined;
  reflectObject.getOwnMetadataKeys ??= () => [];
  reflectObject.hasMetadata ??= () => false;
  reflectObject.metadata ??= () => () => {};
}

async function createWorkspace(name: string): Promise<string> {
  return mkdtemp(join(tmpdir(), `appaloft-source-${name}-`));
}

describe("FileSystemSourceDetector", () => {
  test("[WF-PLAN-DET-001][WF-PLAN-DET-007] records manifest package manager and serverful shape", async () => {
    ensureReflectMetadata();
    const [{ createExecutionContext }, { FileSystemSourceDetector }] = await Promise.all([
      import("@appaloft/application"),
      import("../src"),
    ]);
    const source = await createWorkspace("express");

    await Bun.write(
      join(source, "package.json"),
      `${JSON.stringify({
        name: "express-service",
        packageManager: "pnpm@10.0.0",
        dependencies: {
          express: "^5.0.0",
        },
        scripts: {
          build: "tsc",
          start: "node dist/server.js",
        },
      })}\n`,
    );
    await Bun.write(join(source, "bun.lock"), "");
    await Bun.write(join(source, "yarn.lock"), "");

    const result = await new FileSystemSourceDetector().detect(
      createExecutionContext({ entrypoint: "cli", requestId: "req_source" }),
      source,
    );

    expect(result.isOk()).toBe(true);
    const inspection = result._unsafeUnwrap().source.inspection;
    expect(inspection?.framework).toBe("express");
    expect(inspection?.packageManager).toBe("pnpm");
    expect(inspection?.applicationShape).toBe("serverful-http");
  });

  test("[WF-PLAN-DET-007][WF-PLAN-CAT-007] records static shape for Vite sources", async () => {
    ensureReflectMetadata();
    const [{ createExecutionContext }, { FileSystemSourceDetector }] = await Promise.all([
      import("@appaloft/application"),
      import("../src"),
    ]);
    const source = await createWorkspace("vite");

    await Bun.write(
      join(source, "package.json"),
      `${JSON.stringify({
        name: "vite-site",
        dependencies: {
          vite: "^6.0.0",
        },
        scripts: {
          build: "vite build",
          preview: "vite preview",
        },
      })}\n`,
    );
    await Bun.write(join(source, "vite.config.ts"), "export default {};\n");
    await Bun.write(join(source, "bun.lock"), "");

    const result = await new FileSystemSourceDetector().detect(
      createExecutionContext({ entrypoint: "cli", requestId: "req_source" }),
      source,
    );

    expect(result.isOk()).toBe(true);
    const inspection = result._unsafeUnwrap().source.inspection;
    expect(inspection?.framework).toBe("vite");
    expect(inspection?.packageManager).toBe("bun");
    expect(inspection?.applicationShape).toBe("static");
  });

  test("[WF-PLAN-DET-007][WF-PLAN-CAT-002] records static shape for Next export sources", async () => {
    ensureReflectMetadata();
    const [{ createExecutionContext }, { FileSystemSourceDetector }] = await Promise.all([
      import("@appaloft/application"),
      import("../src"),
    ]);
    const source = await createWorkspace("next-export");

    await Bun.write(
      join(source, "package.json"),
      `${JSON.stringify({
        name: "next-export-site",
        dependencies: {
          next: "^15.0.0",
        },
        scripts: {
          build: "next build",
          export: "next export",
        },
      })}\n`,
    );
    await Bun.write(join(source, "next.config.mjs"), "export default { output: 'export' };\n");
    await Bun.write(join(source, "pnpm-lock.yaml"), "");

    const result = await new FileSystemSourceDetector().detect(
      createExecutionContext({ entrypoint: "cli", requestId: "req_source" }),
      source,
    );

    expect(result.isOk()).toBe(true);
    const inspection = result._unsafeUnwrap().source.inspection;
    expect(inspection?.framework).toBe("nextjs");
    expect(inspection?.packageManager).toBe("pnpm");
    expect(inspection?.detectedScripts).toContain("export");
    expect(inspection?.applicationShape).toBe("static");
  });

  test("[WF-PLAN-DET-014] fails closed for an empty source workspace", async () => {
    ensureReflectMetadata();
    const [{ createExecutionContext }, { FileSystemSourceDetector }] = await Promise.all([
      import("@appaloft/application"),
      import("../src"),
    ]);

    const result = await new FileSystemSourceDetector().detect(
      createExecutionContext({ entrypoint: "cli", requestId: "req_empty_source" }),
      join(workspaceFixtures, "empty"),
    );

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().details).toMatchObject({
      phase: "source-detection",
      reasonCode: "missing-source-root",
      candidateRoots: [],
    });
  });

  test("[WF-PLAN-DET-014] accepts an unrecognized root only for an explicit runtime profile", async () => {
    ensureReflectMetadata();
    const [{ createExecutionContext }, { FileSystemSourceDetector }] = await Promise.all([
      import("@appaloft/application"),
      import("../src"),
    ]);

    const result = await new FileSystemSourceDetector().detect(
      createExecutionContext({ entrypoint: "cli", requestId: "req_explicit_source" }),
      join(workspaceFixtures, "empty"),
      { allowUnrecognizedRoot: true },
    );

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().workspace).toMatchObject({
      selectedRoot: "/",
      selectionReason: "explicit-runtime-profile",
      candidateRoots: [],
    });
  });

  test("[WF-PLAN-DET-015] reports both deployable roots instead of selecting a monorepo root", async () => {
    ensureReflectMetadata();
    const [{ createExecutionContext }, { FileSystemSourceDetector }] = await Promise.all([
      import("@appaloft/application"),
      import("../src"),
    ]);

    const result = await new FileSystemSourceDetector().detect(
      createExecutionContext({ entrypoint: "cli", requestId: "req_ambiguous_source" }),
      join(workspaceFixtures, "two-apps"),
    );

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().details).toMatchObject({
      phase: "source-detection",
      reasonCode: "ambiguous-framework-evidence",
      candidateRoots: ["/apps/api", "/apps/web"],
    });
  });

  test("[WF-PLAN-DET-016] inspects the explicitly selected monorepo application root", async () => {
    ensureReflectMetadata();
    const [{ createExecutionContext }, { FileSystemSourceDetector }] = await Promise.all([
      import("@appaloft/application"),
      import("../src"),
    ]);

    const result = await new FileSystemSourceDetector().detect(
      createExecutionContext({ entrypoint: "cli", requestId: "req_selected_source" }),
      join(workspaceFixtures, "two-apps"),
      { baseDirectory: "/apps/web" },
    );

    expect(result.isOk()).toBe(true);
    const detected = result._unsafeUnwrap();
    expect(detected.source.inspection?.framework).toBe("vite");
    expect(detected.source.inspection?.projectName).toBe("fixture-web");
    expect(detected.source.metadata).toMatchObject({
      baseDirectory: "/apps/web",
      detectedSourceRoot: "/apps/web",
    });
    expect(detected.workspace).toEqual({
      selectedRoot: "/apps/web",
      selectionReason: "explicit-base-directory",
      candidateRoots: ["/apps/web"],
      inspectedDirectoryCount: 1,
      inspectionBoundReached: false,
    });
  });

  test("[WF-PLAN-DET-017] fails closed for conflicting Node lockfiles", async () => {
    ensureReflectMetadata();
    const [{ createExecutionContext }, { FileSystemSourceDetector }] = await Promise.all([
      import("@appaloft/application"),
      import("../src"),
    ]);

    const result = await new FileSystemSourceDetector().detect(
      createExecutionContext({ entrypoint: "cli", requestId: "req_lock_conflict" }),
      join(workspaceFixtures, "lockfile-conflict"),
    );

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().details).toMatchObject({
      phase: "source-detection",
      reasonCode: "ambiguous-build-tool",
      detectedFiles: ["bun-lock", "pnpm-lock"],
    });
  });

  test("[WS-REMOTE-INSPECT-048] inspects a cloned remote-git repo with root Dockerfile", async () => {
    ensureReflectMetadata();
    const [{ createExecutionContext }, { FileSystemSourceDetector }, { pathToFileURL }] =
      await Promise.all([import("@appaloft/application"), import("../src"), import("node:url")]);
    const remote = await createGitRemote("dockerfile", {
      Dockerfile: "FROM scratch\n",
      "README.md": "whoami\n",
    });

    const result = await new FileSystemSourceDetector().detect(
      createExecutionContext({ entrypoint: "cli", requestId: "req_remote_inspect" }),
      pathToFileURL(remote).href,
    );

    expect(result.isOk()).toBe(true);
    const detected = result._unsafeUnwrap();
    expect(detected.source.kind).toBe("git-public");
    expect(detected.source.inspection?.hasDetectedFile("dockerfile")).toBe(true);
    expect(detected.source.locator.startsWith("file:")).toBe(true);
  });

  test("[WS-REMOTE-EXPOSE-054] records a single Dockerfile EXPOSE", async () => {
    ensureReflectMetadata();
    const [{ createExecutionContext }, { FileSystemSourceDetector }, { pathToFileURL }] =
      await Promise.all([import("@appaloft/application"), import("../src"), import("node:url")]);
    const remote = await createGitRemote("expose-one", {
      Dockerfile: "FROM scratch\nEXPOSE 80\n",
    });

    const result = await new FileSystemSourceDetector().detect(
      createExecutionContext({ entrypoint: "cli", requestId: "req_expose_one" }),
      pathToFileURL(remote).href,
    );

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().source.inspection?.exposedPort).toBe(80);
  });

  test("[WS-REMOTE-EXPOSE-055] ignores multiple Dockerfile EXPOSE ports", async () => {
    ensureReflectMetadata();
    const [{ createExecutionContext }, { FileSystemSourceDetector }, { pathToFileURL }] =
      await Promise.all([import("@appaloft/application"), import("../src"), import("node:url")]);
    const remote = await createGitRemote("expose-many", {
      Dockerfile: "FROM scratch\nEXPOSE 80\nEXPOSE 443\n",
    });

    const result = await new FileSystemSourceDetector().detect(
      createExecutionContext({ entrypoint: "cli", requestId: "req_expose_many" }),
      pathToFileURL(remote).href,
    );

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().source.inspection?.exposedPort).toBeUndefined();
  });

  test("[WS-REMOTE-INSPECT-050] missing git executable fails closed without throwing", async () => {
    ensureReflectMetadata();
    const [{ createExecutionContext }, { FileSystemSourceDetector }] = await Promise.all([
      import("@appaloft/application"),
      import("../src"),
    ]);
    const previous = Bun.spawnSync;
    Bun.spawnSync = ((..._args: Parameters<typeof Bun.spawnSync>) => {
      throw new Error('Executable not found in $PATH: "git"');
    }) as typeof Bun.spawnSync;
    try {
      const result = await new FileSystemSourceDetector().detect(
        createExecutionContext({ entrypoint: "http", requestId: "req_missing_git" }),
        "https://github.com/traefik/whoami.git",
      );
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().details).toMatchObject({
        phase: "source-detection",
        reasonCode: "missing-source-root",
        affectedProfileField: "source.locator",
        detail: 'Executable not found in $PATH: "git"',
      });
    } finally {
      Bun.spawnSync = previous;
    }
  });

  test("[WS-REMOTE-INSPECT-049] cloned monorepo remote-git asks for baseDirectory", async () => {
    ensureReflectMetadata();
    const [{ createExecutionContext }, { FileSystemSourceDetector }, { pathToFileURL }] =
      await Promise.all([import("@appaloft/application"), import("../src"), import("node:url")]);
    const remote = await createGitRemote("mono", {
      "hello/Dockerfile": "FROM scratch\n",
      "hello/package.json": `${JSON.stringify({ name: "hello", scripts: { start: "node index.js" } })}\n`,
      "api/package.json": `${JSON.stringify({ name: "api", scripts: { start: "node server.js" } })}\n`,
      "api/server.js": "console.log('api')\n",
    });

    const result = await new FileSystemSourceDetector().detect(
      createExecutionContext({ entrypoint: "cli", requestId: "req_remote_mono" }),
      pathToFileURL(remote).href,
    );

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().details).toMatchObject({
      phase: "source-detection",
      reasonCode: "ambiguous-framework-evidence",
      affectedProfileField: "source.baseDirectory",
    });
  });

  test("[DEP-CREATE-PKG-007] keeps originalLocator and a hyphenated displayName when locator is already the parent", async () => {
    ensureReflectMetadata();
    const [{ createExecutionContext }, { FileSystemSourceDetector }] = await Promise.all([
      import("@appaloft/application"),
      import("../src"),
    ]);
    const parent = "/Users/nichenqin/projects";
    const folder = `${parent}/nux-67e3a052-static`;

    const result = await new FileSystemSourceDetector().detect(
      createExecutionContext({ entrypoint: "cli", requestId: "req_original_locator_parent" }),
      parent,
      {
        allowUnrecognizedRoot: true,
        originalLocator: folder,
        displayName: "nux-67e3a052-static",
      },
    );

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().source.locator).toBe(folder);
    expect(result._unsafeUnwrap().source.locator).not.toBe(parent);
    expect(result._unsafeUnwrap().source.displayName).toBe("nux-67e3a052-static");
    expect(result._unsafeUnwrap().source.displayName).not.toBe("projects");
    expect(result._unsafeUnwrap().source.metadata?.originalLocator).toBe(folder);
  });

  test("[DEP-CREATE-PKG-007] does not clobber a hyphenated displayName with basename(parent)", async () => {
    ensureReflectMetadata();
    const [{ createExecutionContext }, { FileSystemSourceDetector }] = await Promise.all([
      import("@appaloft/application"),
      import("../src"),
    ]);
    const parent = "/Users/nichenqin/projects";

    const result = await new FileSystemSourceDetector().detect(
      createExecutionContext({ entrypoint: "cli", requestId: "req_keep_hyphenated_name" }),
      parent,
      {
        allowUnrecognizedRoot: true,
        displayName: "nux-67e3a052-static",
      },
    );

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().source.displayName).toBe("nux-67e3a052-static");
    expect(result._unsafeUnwrap().source.displayName).not.toBe("projects");
  });

  test("[DEP-CREATE-PKG-007] persists the CLI-resolved source when locator is already the parent", async () => {
    ensureReflectMetadata();
    const [
      { createExecutionContext, CLI_RESOLVED_SOURCE_METADATA_KEY },
      { FileSystemSourceDetector },
    ] = await Promise.all([import("@appaloft/application"), import("../src")]);
    const parent = "/Users/nichenqin/projects";
    const cliResolvedSource = `${parent}/nux-772b6112-static`;

    const result = await new FileSystemSourceDetector().detect(
      createExecutionContext({ entrypoint: "cli", requestId: "req_cli_resolved_parent" }),
      parent,
      {
        allowUnrecognizedRoot: true,
        cliResolvedSource,
      },
    );

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().source.locator).toBe(parent);
    expect(result._unsafeUnwrap().source.metadata?.[CLI_RESOLVED_SOURCE_METADATA_KEY]).toBe(
      cliResolvedSource,
    );
    expect(result._unsafeUnwrap().source.metadata?.[CLI_RESOLVED_SOURCE_METADATA_KEY]).toContain(
      "nux-772b6112-static",
    );
  });

  test("[DEP-CREATE-PKG-007] keeps a CLI-host packed archive when the locator folder is missing here", async () => {
    ensureReflectMetadata();
    const [
      { createExecutionContext, CLI_PACKED_SOURCE_ARCHIVE_METADATA_KEY },
      { FileSystemSourceDetector },
    ] = await Promise.all([import("@appaloft/application"), import("../src")]);
    const parent = "/Users/nichenqin/projects";
    const packedSourceArchive = "H4sIAAAAAAAAAytKLSpILC4u1gMA";

    const result = await new FileSystemSourceDetector().detect(
      createExecutionContext({ entrypoint: "cli", requestId: "req_cli_packed_archive" }),
      parent,
      {
        allowUnrecognizedRoot: true,
        packedSourceArchive,
      },
    );

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().source.locator).toBe(parent);
    expect(result._unsafeUnwrap().source.metadata?.[CLI_PACKED_SOURCE_ARCHIVE_METADATA_KEY]).toBe(
      packedSourceArchive,
    );
  });

  test("[DEP-CREATE-PKG-007] does not persist a dirname'd locator as the CLI-resolved source", async () => {
    ensureReflectMetadata();
    const [
      { createExecutionContext, CLI_RESOLVED_SOURCE_METADATA_KEY },
      { FileSystemSourceDetector },
    ] = await Promise.all([import("@appaloft/application"), import("../src")]);
    const parent = "/Users/nichenqin/projects";

    const result = await new FileSystemSourceDetector().detect(
      createExecutionContext({ entrypoint: "cli", requestId: "req_no_cli_resolved_parent" }),
      parent,
      { allowUnrecognizedRoot: true },
    );

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().source.locator).toBe(parent);
    expect(result._unsafeUnwrap().source.metadata?.[CLI_RESOLVED_SOURCE_METADATA_KEY]).toBe(
      undefined,
    );
  });

  test("[DEP-CREATE-PKG-007] keeps a missing hyphenated local-folder locator", async () => {
    ensureReflectMetadata();
    const [{ createExecutionContext }, { FileSystemSourceDetector }] = await Promise.all([
      import("@appaloft/application"),
      import("../src"),
    ]);
    const locator = "/Users/nichenqin/projects/nux-9859a0e9-static";

    const result = await new FileSystemSourceDetector().detect(
      createExecutionContext({ entrypoint: "cli", requestId: "req_missing_hyphenated" }),
      locator,
      { allowUnrecognizedRoot: true },
    );

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().source.locator).toBe(locator);
    expect(result._unsafeUnwrap().source.locator).not.toBe("/Users/nichenqin/projects");
    expect(result._unsafeUnwrap().source.kind).toBe("local-folder");
  });

  test("[DEP-CREATE-PKG-007] keeps an existing hyphenated folder when the parent is a git repo", async () => {
    ensureReflectMetadata();
    const [{ createExecutionContext }, { FileSystemSourceDetector }] = await Promise.all([
      import("@appaloft/application"),
      import("../src"),
    ]);
    const { mkdtemp, mkdir } = await import("node:fs/promises");
    const parent = await mkdtemp(join(tmpdir(), "projects-"));
    const locator = join(parent, "nux-c79876d8-static");
    await mkdir(join(locator, "public"), { recursive: true });
    await Bun.write(join(locator, "public", "index.html"), "<!doctype html><title>ok</title>");
    const git = (args: string[]) =>
      Bun.spawnSync(["git", "-C", parent, ...args], { stdout: "pipe", stderr: "pipe" });
    expect(git(["init"]).success).toBe(true);

    try {
      const result = await new FileSystemSourceDetector().detect(
        createExecutionContext({ entrypoint: "cli", requestId: "req_hyphenated_exists" }),
        locator,
        { allowUnrecognizedRoot: true },
      );

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap().source.locator).toBe(locator);
      expect(result._unsafeUnwrap().source.locator).not.toBe(parent);
      expect(result._unsafeUnwrap().source.displayName).toBe("nux-c79876d8-static");
    } finally {
      const { rm } = await import("node:fs/promises");
      await rm(parent, { recursive: true, force: true });
    }
  });
});

async function createGitRemote(name: string, files: Record<string, string>): Promise<string> {
  const { mkdir } = await import("node:fs/promises");
  const root = await createWorkspace(name);
  for (const [relativePath, content] of Object.entries(files)) {
    const target = join(root, relativePath);
    await mkdir(join(target, ".."), { recursive: true });
    await Bun.write(target, content);
  }
  const git = (args: string[]) =>
    Bun.spawnSync(["git", "-C", root, ...args], { stdout: "pipe", stderr: "pipe" });
  expect(git(["init"]).success).toBe(true);
  expect(git(["add", "."]).success).toBe(true);
  expect(
    git(["-c", "user.email=test@example.com", "-c", "user.name=test", "commit", "-m", "init"])
      .success,
  ).toBe(true);
  return root;
}
