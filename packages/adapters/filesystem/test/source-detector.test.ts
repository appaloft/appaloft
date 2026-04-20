import { describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
});
