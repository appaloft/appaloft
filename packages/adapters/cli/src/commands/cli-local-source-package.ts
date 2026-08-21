import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { CLI_PACKED_SOURCE_ARCHIVE_MAX_BYTES } from "@appaloft/application";
import { domainError, err, ok, type Result } from "@appaloft/core";

import { isRemoteOrImageSource } from "./deployment-source.js";

const localWorkspaceArchiveExcludePatterns = [
  ".git",
  ".turbo",
  "node_modules",
  ".svelte-kit",
  ".next/cache",
  "coverage",
] as const;

function tarExcludeArgs(): string[] {
  return localWorkspaceArchiveExcludePatterns.flatMap((pattern) => ["--exclude", pattern]);
}

/**
 * Package `deploy .` on the CLI host that has the folder. Detached workers
 * must apply this archive instead of existsSync of a Mac path they do not have.
 */
export function packageLocalFolderSourceOnCliHost(folderPath: string): Result<string> {
  const resolved = resolve(folderPath);
  if (!existsSync(resolved) || !statSync(resolved).isDirectory()) {
    return err(
      domainError.validation(`Source working directory does not exist: ${resolved}`, {
        phase: "cli-source-package",
        reason: "source_workdir_missing",
        localWorkdir: resolved,
      }),
    );
  }

  const staging = mkdtempSync(join(tmpdir(), "appaloft-cli-source-"));
  const archivePath = join(staging, "source.tgz");
  try {
    const packed = Bun.spawnSync(
      ["tar", "-czf", archivePath, ...tarExcludeArgs(), "-C", resolved, "."],
      {
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    if (!packed.success) {
      const detail = packed.stderr.toString().trim() || packed.stdout.toString().trim();
      return err(
        domainError.infra(detail || "CLI source package failed", {
          phase: "cli-source-package",
          reason: "cli_source_package_failed",
          localWorkdir: resolved,
        }),
      );
    }

    const bytes = readFileSync(archivePath);
    if (bytes.byteLength > CLI_PACKED_SOURCE_ARCHIVE_MAX_BYTES) {
      return err(
        domainError.validation("CLI source package exceeds its bounded byte limit", {
          phase: "cli-source-package",
          reason: "cli_source_package_too_large",
          localWorkdir: resolved,
          byteLength: bytes.byteLength,
          maximumBytes: CLI_PACKED_SOURCE_ARCHIVE_MAX_BYTES,
        }),
      );
    }

    return ok(bytes.toString("base64"));
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

export function packageLocalFolderSourceOnCliHostIfPresent(
  locator: string | undefined,
): Result<string | undefined> {
  if (!locator || isRemoteOrImageSource(locator)) {
    return ok(undefined);
  }

  const resolved = resolve(locator);
  if (!existsSync(resolved) || !statSync(resolved).isDirectory()) {
    return ok(undefined);
  }

  return packageLocalFolderSourceOnCliHost(resolved);
}
