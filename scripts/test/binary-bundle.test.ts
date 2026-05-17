import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { bundleReadme, createBinaryEntryModule } from "../release/lib/binary-bundle";

describe("binary bundle README", () => {
  test("[PUB-DOCS-013] documents embedded docs and override path", () => {
    const readme = bundleReadme({
      version: "0.1.0-test",
      target: {
        name: "test-target",
        executableName: "appaloft",
        bunTarget: "bun-darwin-arm64",
        npmPackageName: "@appaloft/cli-test-target",
        os: "darwin",
        cpu: "arm64",
        tauriTriple: "aarch64-apple-darwin",
        archiveFormat: "tar.gz",
      },
    });

    expect(readme).toContain("Public documentation static assets");
    expect(readme).toContain("APPALOFT_DOCS_STATIC_DIR=/path/to/docs-dist");
  });
});

describe("Docker runtime image packaging", () => {
  test("[RELEASE-HARDENING-003] binary entry initializes reflect metadata before shell runtime", async () => {
    const root = await mkdtemp(join(tmpdir(), "appaloft-binary-entry-"));
    try {
      const entryDir = join(root, "dist", ".tmp-binary-bundle");
      const entryPath = join(entryDir, "binary-entry.ts");
      await mkdir(entryDir, { recursive: true });
      await createBinaryEntryModule({
        entryPath,
        root,
        version: "0.1.0-test",
        embeddedWebAssetsModulePath: join(entryDir, "embedded-web-assets.generated.ts"),
        embeddedDocsAssetsModulePath: join(entryDir, "embedded-docs-assets.generated.ts"),
        pgliteFsBundlePath: join(root, "vendor", "pglite.data"),
        pgliteWasmPath: join(root, "vendor", "pglite.wasm"),
        initdbWasmPath: join(root, "vendor", "initdb.wasm"),
        reflectMetadataPath: join(root, "node_modules", "reflect-metadata", "Reflect.js"),
      });

      const source = await readFile(entryPath, "utf8");
      const reflectIndex = source.indexOf(
        'import "../../node_modules/reflect-metadata/Reflect.js";',
      );
      const shellRuntimeIndex = source.indexOf("const { runShellCli } = await import(");

      expect(reflectIndex).toBe(0);
      expect(shellRuntimeIndex).toBeGreaterThan(reflectIndex);
      expect(source).not.toContain("import { runShellCli }");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("[SELF-HOSTED-AUTH-E2E-003] Docker build context excludes heavyweight local artifacts", async () => {
    const dockerignore = await Bun.file(new URL("../../.dockerignore", import.meta.url)).text();

    expect(dockerignore).toContain(".*");
    expect(dockerignore).toContain("apps/*");
    expect(dockerignore).toContain("**/.*.bun-build");
    expect(dockerignore).toContain("**/.appaloft");
    expect(dockerignore).toContain("**/.turbo");
    expect(dockerignore).toContain("**/node_modules");
  });

  test("[SELF-HOSTED-AUTH-E2E-003] Docker image carries PGlite runtime assets for install smoke", async () => {
    const dockerfile = await Bun.file(new URL("../../Dockerfile", import.meta.url)).text();

    expect(dockerfile).toContain("/app/dist/pglite-runtime-assets/pglite.data /app/pglite.data");
    expect(dockerfile).toContain("/app/dist/pglite-runtime-assets/pglite.wasm /app/pglite.wasm");
    expect(dockerfile).toContain("/app/dist/pglite-runtime-assets/initdb.wasm /app/initdb.wasm");
  });

  test("[RELEASE-HARDENING-003] Docker docs build uses Node for Astro validation", async () => {
    const dockerfile = await Bun.file(new URL("../../Dockerfile", import.meta.url)).text();

    expect(dockerfile).toContain("FROM node:24-bookworm AS node-runtime");
    expect(dockerfile).toContain(
      "node node_modules/astro/bin/astro.mjs check && node node_modules/astro/bin/astro.mjs build",
    );
  });
});
