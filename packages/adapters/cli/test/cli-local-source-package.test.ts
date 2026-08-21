import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import {
  cliHostLocalFolderSourceSendFields,
  packageLocalFolderSourceOnCliHost,
  packageLocalFolderSourceOnCliHostIfPresent,
} from "../src/commands/cli-local-source-package";

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

  test("[DEP-CREATE-PKG-007][QUICK-DEPLOY-ENTRY-008B] packs hyphenated appaloft-cloud under a projects parent, not the parent", () => {
    const hostRoot = mkdtempSync(join(tmpdir(), "appaloft-cli-pack-cloud-"));
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

      const fromParentLocator = packageLocalFolderSourceOnCliHostIfPresent(parent);
      expect(fromParentLocator.isOk()).toBe(true);
      const archive = fromParentLocator._unsafeUnwrap();
      expect(typeof archive).toBe("string");
      expect((archive ?? "").length).toBeGreaterThan(0);

      const listingDir = mkdtempSync(join(tmpdir(), "appaloft-cli-pack-cloud-list-"));
      const archivePath = join(listingDir, "source.tgz");
      writeFileSync(archivePath, Buffer.from(archive ?? "", "base64"));
      const listing = spawnSync("tar", ["-tzf", archivePath], { encoding: "utf8" });
      expect(listing.status).toBe(0);
      expect(listing.stdout).toContain("public/index.html");
      expect(listing.stdout).not.toContain(`${leaf}/`);
      expect(listing.stdout.split("\n").some((line) => line.endsWith("/projects"))).toBe(false);
      rmSync(listingDir, { recursive: true, force: true });
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

  test("[DEP-CREATE-PKG-007][QUICK-DEPLOY-ENTRY-008B] packs a non-git hyphenated nux leaf under projects, not the parent", () => {
    const hostRoot = mkdtempSync(join(tmpdir(), "appaloft-cli-pack-nux-"));
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

      const fromParentLocator = packageLocalFolderSourceOnCliHostIfPresent(parent);
      expect(fromParentLocator.isOk()).toBe(true);
      const archive = fromParentLocator._unsafeUnwrap();
      expect(typeof archive).toBe("string");
      expect((archive ?? "").length).toBeGreaterThan(0);

      const fromDot = packageLocalFolderSourceOnCliHostIfPresent(".");
      expect(fromDot.isOk()).toBe(true);
      expect(typeof fromDot._unsafeUnwrap()).toBe("string");

      const listingDir = mkdtempSync(join(tmpdir(), "appaloft-cli-pack-nux-list-"));
      const archivePath = join(listingDir, "source.tgz");
      writeFileSync(archivePath, Buffer.from(archive ?? "", "base64"));
      const listing = spawnSync("tar", ["-tzf", archivePath], { encoding: "utf8" });
      expect(listing.status).toBe(0);
      expect(listing.stdout).toContain("public/index.html");
      expect(listing.stdout).not.toContain(`${leaf}/`);
      expect(listing.stdout.split("\n").some((line) => line.endsWith("/projects"))).toBe(false);
      rmSync(listingDir, { recursive: true, force: true });
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

  test("[DEP-CREATE-PKG-007][QUICK-DEPLOY-ENTRY-008B] send fields keep nux-c689b0f1-static off the projects parent", () => {
    const hostRoot = mkdtempSync(join(tmpdir(), "appaloft-cli-send-nux-"));
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

      const fromDot = cliHostLocalFolderSourceSendFields(".");
      expect(fromDot.folder).toBe(resolve(folder));
      expect(fromDot.folder).not.toBe(resolve(parent));
      expect(fromDot.packedSourceArchiveTarGz?.length).toBeGreaterThan(0);

      const fromParent = cliHostLocalFolderSourceSendFields(parent);
      expect(fromParent.folder).toBe(resolve(folder));
      expect(fromParent.folder).not.toBe(resolve(parent));
      expect(fromParent.packedSourceArchiveTarGz?.length).toBeGreaterThan(0);

      const listingDir = mkdtempSync(join(tmpdir(), "appaloft-cli-send-nux-list-"));
      const archivePath = join(listingDir, "source.tgz");
      writeFileSync(archivePath, Buffer.from(fromParent.packedSourceArchiveTarGz ?? "", "base64"));
      const listing = spawnSync("tar", ["-tzf", archivePath], { encoding: "utf8" });
      expect(listing.status).toBe(0);
      expect(listing.stdout).toContain("public/index.html");
      expect(listing.stdout.split("\n").some((line) => line.endsWith("/projects"))).toBe(false);
      rmSync(listingDir, { recursive: true, force: true });
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
});
