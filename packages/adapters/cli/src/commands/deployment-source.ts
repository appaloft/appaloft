import { existsSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

export type DeploymentMethod =
  | "auto"
  | "dockerfile"
  | "docker-compose"
  | "prebuilt-image"
  | "static"
  | "workspace-commands"
  | "helm";

export const deploymentMethods = [
  "auto",
  "dockerfile",
  "docker-compose",
  "prebuilt-image",
  "static",
  "workspace-commands",
  "helm",
] as const satisfies readonly DeploymentMethod[];

export function isRemoteOrImageSource(locator: string): boolean {
  return (
    /^(https?|ssh|git|oci):\/\//.test(locator) ||
    /^[^/\\]+@[^/\\]+:/.test(locator) ||
    locator.startsWith("docker://") ||
    locator.startsWith("image://")
  );
}

export function resolveLocalSourceRoot(locator: string): string {
  if (isRemoteOrImageSource(locator) || isAbsolute(locator)) {
    return locator;
  }

  return resolve(process.cwd(), locator);
}

/**
 * Folder→URL static hint. Prefer `public` when `public/index.html` exists so
 * the live control plane can admit the request and Docker COPY can find the
 * files. Root `index.html` uses `.` (source root).
 */
export function detectLocalStaticPublishDirectory(sourceLocator: string): string | undefined {
  if (isRemoteOrImageSource(sourceLocator)) {
    return undefined;
  }

  const root = resolveLocalSourceRoot(sourceLocator);
  if (existsSync(join(root, "public", "index.html"))) {
    return "public";
  }
  if (existsSync(join(root, "index.html"))) {
    return ".";
  }
  return undefined;
}

export function normalizeCliPathOrSource(locator: string, method: DeploymentMethod): string {
  if (
    method === "prebuilt-image" ||
    method === "helm" ||
    isRemoteOrImageSource(locator) ||
    isAbsolute(locator)
  ) {
    return locator;
  }

  // Resolve against process.cwd() first. A stale PWD that is the parent of
  // cwd would otherwise truncate `deploy .` to the parent folder.
  return resolve(process.cwd(), locator);
}
