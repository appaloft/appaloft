import { describe, expect, test } from "bun:test";
import { statSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "../..");
const launcherPath = "packages/npm/cli/bin/appaloft.js";

describe("npm CLI package", () => {
  test("[CLI-NPM-PACKAGE-001] tracks the declared launcher as executable", async () => {
    const packageJson = (await Bun.file(join(root, "packages/npm/cli/package.json")).json()) as {
      bin?: Record<string, string>;
    };
    const indexEntry = Bun.spawnSync(["git", "ls-files", "--stage", "--", launcherPath], {
      cwd: root,
      stdout: "pipe",
      stderr: "pipe",
    });

    expect(packageJson.bin?.appaloft).toBe("bin/appaloft.js");
    expect(indexEntry.exitCode).toBe(0);
    expect(indexEntry.stderr.toString()).toBe("");
    expect(indexEntry.stdout.toString()).toMatch(/^100755 [0-9a-f]{40} 0\t/u);
    expect(statSync(join(root, launcherPath)).mode & 0o111).toBeTruthy();
  });
});
