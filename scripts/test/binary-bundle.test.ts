import { describe, expect, test } from "bun:test";

import { bundleReadme } from "../release/lib/binary-bundle";

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
});
