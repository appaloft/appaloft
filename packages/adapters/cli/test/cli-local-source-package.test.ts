import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { packageLocalFolderSourceOnCliHost } from "../src/commands/cli-local-source-package";

describe("CLI-host local source package", () => {
  test("[DEP-CREATE-PKG-007][QUICK-DEPLOY-ENTRY-008B] packs the hyphenated cwd that exists on the CLI host", () => {
    const hostRoot = mkdtempSync(join(tmpdir(), "appaloft-cli-pack-"));
    const parent = join(hostRoot, "projects");
    const leaf = "nux-055483c0-static";
    const folder = join(parent, leaf);
    mkdirSync(join(folder, "public"), { recursive: true });
    writeFileSync(join(folder, "public", "index.html"), "<!doctype html><title>ok</title>");

    try {
      const packed = packageLocalFolderSourceOnCliHost(folder);
      expect(packed.isOk()).toBe(true);
      const archive = packed._unsafeUnwrap();
      expect(archive.length).toBeGreaterThan(0);

      const listingDir = mkdtempSync(join(tmpdir(), "appaloft-cli-pack-list-"));
      const archivePath = join(listingDir, "source.tgz");
      writeFileSync(archivePath, Buffer.from(archive, "base64"));
      const listing = spawnSync("tar", ["-tzf", archivePath], { encoding: "utf8" });
      expect(listing.status).toBe(0);
      expect(listing.stdout).toContain("public/index.html");
      expect(listing.stdout).not.toContain(`${leaf}/`);
      expect(listing.stdout.split("\n").some((line) => line.endsWith("/projects"))).toBe(false);
      rmSync(listingDir, { recursive: true, force: true });

      rmSync(folder, { recursive: true, force: true });
      expect(existsSync(folder)).toBe(false);
      const missing = packageLocalFolderSourceOnCliHost(folder);
      expect(missing.isErr()).toBe(true);
      expect(missing._unsafeUnwrapErr().message).toBe(
        `Source working directory does not exist: ${folder}`,
      );
      expect(missing._unsafeUnwrapErr().message).not.toBe(
        `Source working directory does not exist: ${parent}`,
      );
    } finally {
      rmSync(hostRoot, { recursive: true, force: true });
    }
  });
});
