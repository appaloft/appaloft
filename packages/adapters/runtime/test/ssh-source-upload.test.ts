import "../../../application/node_modules/reflect-metadata/Reflect.js";

import { spawnSync } from "node:child_process";
import { describe, expect, test } from "bun:test";
import {
  buildLocalWorkspaceUploadCommand,
  buildLocalWorkspaceUploadTarExcludeArgs,
  buildRemotePreviewArtifactSweepCommand,
} from "../src/ssh-execution";

describe("SSH source upload", () => {
  test("[DEP-CREATE-PKG-001] local workspace upload excludes cache and dependency directories", () => {
    const args = buildLocalWorkspaceUploadTarExcludeArgs();

    expect(args).toEqual([
      "--exclude",
      ".git",
      "--exclude",
      ".turbo",
      "--exclude",
      "node_modules",
      "--exclude",
      ".svelte-kit",
      "--exclude",
      ".next/cache",
      "--exclude",
      "coverage",
    ]);
  });

  test("[DEP-CREATE-PKG-001] git workspace upload respects git ignore rules", () => {
    const command = buildLocalWorkspaceUploadCommand({
      localWorkdir: "/tmp/appaloft source",
      remotePrepareCommand: "mkdir -p /var/lib/appaloft/runtime/source",
      sshArgs: ["-p", "22", "deploy@example.test"],
    });

    expect(command).toContain("git -C '/tmp/appaloft source' rev-parse --is-inside-work-tree");
    expect(command).toContain(
      "git -C '/tmp/appaloft source' ls-files -z --cached --recurse-submodules",
    );
    expect(command).toContain(
      "git -C '/tmp/appaloft source' ls-files -z --others --exclude-standard",
    );
    expect(command).toContain("tar --null -czf - -C '/tmp/appaloft source' --files-from -");
    expect(command).toContain("else tar -czf -");
    expect(command).toContain("'--exclude' '.turbo'");
    expect(command).toContain("ssh '-p' '22' 'deploy@example.test'");
  });
});

describe("SSH preview artifact cleanup", () => {
  test("[DEPLOYMENTS-CLEANUP-PREVIEW-007] renders a POSIX sh-compatible sibling artifact sweep", () => {
    const command = buildRemotePreviewArtifactSweepCommand({
      remoteRuntimeRoot: "/var/lib/appaloft/runtime",
      sourceFingerprint:
        "source-fingerprint%3Av1:preview%3Apr%3A51:github:provider-repository%3A1240442607:.:appaloft.preview.yaml",
    });

    const syntaxCheck = spawnSync("sh", ["-n", "-c", command], { encoding: "utf8" });

    expect(syntaxCheck.status).toBe(0);
    expect(command).toContain('for marker in "$@"; do if grep -Fq "$fingerprint" "$marker"; then');
    expect(command).not.toContain("for marker do; if");
  });
});
