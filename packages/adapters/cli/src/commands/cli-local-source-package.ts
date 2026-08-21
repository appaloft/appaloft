import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import {
  CLI_PACKED_SOURCE_ARCHIVE_MAX_BYTES,
  isSpecificLocalSourceLeaf,
} from "@appaloft/application";
import { domainError, err, ok, type Result } from "@appaloft/core";

import { isRemoteOrImageSource, resolveCliHostLocalSourceFolder } from "./deployment-source.js";

function pathLeaf(path: string): string {
  return basename(path.replace(/\/+$/, "") || path);
}

/**
 * Only hyphenated source folders such as `nux-*-static` or `appaloft-cloud`
 * are rewritten/packed. Generic or ordinary package cwd names (`workspace`,
 * `cli`) must keep the caller's locator and must not be tarred.
 */
function isHyphenatedSpecificLocalSourceLeaf(leaf: string): boolean {
  return isSpecificLocalSourceLeaf(leaf) && leaf.includes("-") && !leaf.includes(":");
}

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
  if (locator && isRemoteOrImageSource(locator)) {
    return ok(undefined);
  }

  const resolved = resolveCliHostLocalSourceFolder(locator);
  if (!isHyphenatedSpecificLocalSourceLeaf(pathLeaf(resolved))) {
    return ok(undefined);
  }

  if (!existsSync(resolved) || !statSync(resolved).isDirectory()) {
    return ok(undefined);
  }

  return packageLocalFolderSourceOnCliHost(resolved);
}

/**
 * Fields the CLI actually sends on resources.create / configureSource.
 * Summary.Source can already be the hyphenated leaf while a raw `.` / parent
 * locator would still hand the worker `/Users/.../projects`. Re-resolve and
 * pack here so locator, originalLocator, and the archive all keep the leaf.
 */
export function cliHostLocalFolderSourceSendFields(locator?: string): {
  folder: string;
  packedSourceArchiveTarGz?: string;
} {
  if (locator && isRemoteOrImageSource(locator)) {
    return { folder: locator };
  }

  const resolved = resolveCliHostLocalSourceFolder(locator);
  const folder = isHyphenatedSpecificLocalSourceLeaf(pathLeaf(resolved))
    ? resolved
    : locator?.trim() || resolved;
  const packed = packageLocalFolderSourceOnCliHostIfPresent(folder);
  return {
    folder,
    ...(packed.isOk() && packed.value ? { packedSourceArchiveTarGz: packed.value } : {}),
  };
}
