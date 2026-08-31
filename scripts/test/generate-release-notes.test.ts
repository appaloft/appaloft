import { describe, expect, test } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildReleaseNotes, classifyAsset } from "../release/generate-release-notes";

const OCCUPY = /occupanc|occupy/iu;

describe("GitHub release notes template", () => {
  test("[RELEASE-HARDENING-003] next notes are developer-facing and skip changelog dumps", async () => {
    const notes = buildReleaseNotes({
      version: "1.10.10",
      tag: "v1.10.10",
      repository: "appaloft/appaloft",
      assets: [
        { group: classifyAsset("install.sh"), file: "install.sh" },
        {
          group: classifyAsset("appaloft-v1.10.10-linux-x64.tar.gz"),
          file: "appaloft-v1.10.10-linux-x64.tar.gz",
        },
      ],
    });

    expect(notes).toContain("appaloft up");
    expect(notes).toContain("appaloft setup agent");
    expect(notes).toContain("supported 1.x alias");
    expect(notes).toContain("does not deploy");
    expect(notes).toContain("npm install -g @appaloft/cli");
    expect(notes).toContain("brew install appaloft/tap/appaloft");
    expect(notes).toContain("https://www.appaloft.com/compare/railway");
    expect(notes).toContain("not a complete replacement");
    expect(notes).toContain("CHANGELOG.md");
    expect(notes).not.toContain("## Changes");
    expect(notes).not.toContain("resolve occupancy");
    expect(notes).not.toMatch(OCCUPY);

    const npmIndex = notes.indexOf("npm install -g @appaloft/cli");
    const brewIndex = notes.indexOf("brew install appaloft/tap/appaloft");
    const installShIndex = notes.indexOf("curl -fsSL https://appaloft.com/install.sh | sudo sh");
    expect(npmIndex).toBeGreaterThan(0);
    expect(brewIndex).toBeGreaterThan(npmIndex);
    expect(installShIndex).toBeGreaterThan(brewIndex);

    const deployIndex = notes.indexOf("## Deploy");
    const installIndex = notes.indexOf("## Install");
    expect(deployIndex).toBeGreaterThan(0);
    expect(deployIndex).toBeLessThan(installIndex);
  });

  test("[RELEASE-HARDENING-003] release:notes writes the developer template, not CHANGELOG dumps", async () => {
    const directory = await mkdtemp(join(tmpdir(), "appaloft-release-notes-"));
    const changelogPath = join(directory, "CHANGELOG.md");
    const outputPath = join(directory, "release-notes.md");
    await writeFile(
      changelogPath,
      [
        "# Changelog",
        "",
        "## [1.10.10](https://github.com/appaloft/appaloft/compare/v1.10.9...v1.10.10) (2026-08-23)",
        "",
        "### Bug Fixes",
        "",
        "* **workspace:** resolve occupancy declarative harness by template (#1405)",
        "",
      ].join("\n"),
    );
    await writeFile(join(directory, "install.sh"), "#!/bin/sh\n");

    const result = Bun.spawnSync(
      [
        "bun",
        "run",
        "scripts/release/generate-release-notes.ts",
        "--version",
        "1.10.10",
        "--tag",
        "v1.10.10",
        "--release-dir",
        directory,
        "--changelog",
        changelogPath,
        "--out",
        outputPath,
      ],
      { cwd: join(import.meta.dir, "../..") },
    );
    expect(result.exitCode).toBe(0);

    const notes = await Bun.file(outputPath).text();
    expect(notes).toContain("appaloft up");
    expect(notes).toContain("npm install -g @appaloft/cli");
    expect(notes).not.toContain("resolve occupancy declarative harness");
    expect(notes).not.toMatch(OCCUPY);
  });
});
