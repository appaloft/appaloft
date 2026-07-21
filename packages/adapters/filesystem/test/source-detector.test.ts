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
});
