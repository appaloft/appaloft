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
