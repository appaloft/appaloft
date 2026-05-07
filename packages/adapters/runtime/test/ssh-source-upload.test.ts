import { describe, expect, test } from "bun:test";
import {
  buildLocalWorkspaceUploadCommand,
  buildLocalWorkspaceUploadTarExcludeArgs,
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
      "git -C '/tmp/appaloft source' ls-files -z --cached --others --exclude-standard",
    );
    expect(command).toContain("tar --null -czf - -C '/tmp/appaloft source' --files-from -");
    expect(command).toContain("else tar -czf -");
    expect(command).toContain("'--exclude' '.turbo'");
    expect(command).toContain("ssh '-p' '22' 'deploy@example.test'");
  });
});
