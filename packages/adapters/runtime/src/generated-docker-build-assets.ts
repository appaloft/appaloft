import { mkdirSync, rmSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";

export interface GeneratedDockerBuildAsset {
  relativePath: string;
  contents: string;
}

export interface GeneratedDockerBuildResult {
  dockerfile: string;
  contextAssets: readonly GeneratedDockerBuildAsset[];
}

export function normalizeGeneratedDockerBuildAssetPath(relativePath: string): string {
  const normalized = relativePath
    .trim()
    .replaceAll("\\", "/")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");

  if (!normalized) {
    throw new Error("Generated Docker build assets require a relative path");
  }

  const segments = normalized.split("/").filter(Boolean);
  if (segments.length === 0 || segments.some((segment) => segment === "." || segment === "..")) {
    throw new Error(`Invalid generated Docker build asset path: ${relativePath}`);
  }

  return segments.join("/");
}

export function resolveGeneratedDockerBuildAssetPath(
  rootDirectory: string,
  relativePath: string,
): string {
  const normalized = normalizeGeneratedDockerBuildAssetPath(relativePath);
  const absolutePath = resolve(rootDirectory, normalized);
  const relativeToRoot = relative(rootDirectory, absolutePath);

  if (
    relativeToRoot === "" ||
    relativeToRoot === ".." ||
    relativeToRoot.startsWith("../") ||
    relativeToRoot.startsWith("..\\")
  ) {
    throw new Error(`Generated Docker build asset escaped build context: ${relativePath}`);
  }

  return absolutePath;
}

export async function writeGeneratedDockerBuildAssets(
  rootDirectory: string,
  assets: readonly GeneratedDockerBuildAsset[],
): Promise<string[]> {
  const writtenPaths: string[] = [];

  try {
    for (const asset of assets) {
      const assetPath = resolveGeneratedDockerBuildAssetPath(rootDirectory, asset.relativePath);
      mkdirSync(dirname(assetPath), { recursive: true });
      await Bun.write(assetPath, asset.contents);
      writtenPaths.push(assetPath);
    }
  } catch (error) {
    cleanupGeneratedDockerBuildAssets(writtenPaths);
    throw error;
  }

  return writtenPaths;
}

export function cleanupGeneratedDockerBuildAssets(paths: readonly string[]): void {
  for (const path of paths) {
    try {
      rmSync(path, { force: true });
    } catch {
      // cleanup should never hide the primary deployment result
    }
  }
}
