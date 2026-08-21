import { existsSync, statSync } from "node:fs";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { isGenericLocalSourceLeaf, isSpecificLocalSourceLeaf } from "@appaloft/application";

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
  const trimmed = locator.trim();
  return (
    /^(https?|ssh|git|oci):\/\//.test(trimmed) ||
    /^[^/\\]+@[^/\\]+:/.test(trimmed) ||
    trimmed.startsWith("docker://") ||
    trimmed.startsWith("image://") ||
    looksLikeRegistryImageReference(trimmed)
  );
}

/**
 * Bare registry refs such as `ghcr.io/acme/api:1.7.3` are not filesystem
 * paths. Do not resolve() them against cwd.
 */
function looksLikeRegistryImageReference(locator: string): boolean {
  if (
    !locator ||
    locator.startsWith("/") ||
    locator.startsWith(".") ||
    locator.startsWith("~") ||
    locator.startsWith("\\\\") ||
    /^[a-zA-Z]:[\\/]/.test(locator)
  ) {
    return false;
  }

  return (
    /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z0-9.-]+\/[^\s]+:[^\s/]+$/i.test(locator) ||
    /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z0-9.-]+\/[^\s]+@sha256:[a-f0-9]{64}$/i.test(locator)
  );
}

function stripTrailingSeparators(path: string): string {
  const stripped = path.replace(/\/+$/, "");
  return stripped || path;
}

function pathLeaf(path: string): string {
  return basename(stripTrailingSeparators(path));
}

function existingDirectory(path: string | undefined): string | undefined {
  if (!path) {
    return undefined;
  }

  try {
    return statSync(path).isDirectory() ? path : undefined;
  } catch {
    return undefined;
  }
}

function isExistingChildDirectory(parent: string, child: string): boolean {
  const relativeChild = relative(parent, child);
  return Boolean(relativeChild && !relativeChild.startsWith("..") && !isAbsolute(relativeChild));
}

/**
 * Folder the CLI process can actually tar. Prefer a hyphenated leaf such as
 * `nux-*-static` or `appaloft-cloud` under a parent named `projects`. A stale
 * PWD that is the parent must not win over cwd; a generic-parent cwd must not
 * win over an existing PWD/locator child.
 */
export function resolveCliHostLocalSourceFolder(locator?: string): string {
  const cwdPath = resolve(process.cwd());
  const cwd = existingDirectory(cwdPath) ?? cwdPath;
  const pwd = existingDirectory(process.env.PWD?.trim());
  const requested =
    locator && !isRemoteOrImageSource(locator)
      ? isAbsolute(locator)
        ? locator
        : resolve(cwd, locator)
      : undefined;
  const requestedExisting = existingDirectory(requested);

  if (requested && isSpecificLocalSourceLeaf(pathLeaf(requested))) {
    return requestedExisting ?? requested;
  }

  const specificExisting = [requestedExisting, existingDirectory(cwd), pwd].find(
    (candidate) => candidate && isSpecificLocalSourceLeaf(pathLeaf(candidate)),
  );
  if (specificExisting) {
    return specificExisting;
  }

  const genericParent = [requestedExisting, existingDirectory(cwd)].find(
    (candidate) => candidate && isGenericLocalSourceLeaf(pathLeaf(candidate)),
  );
  if (genericParent && pwd && isSpecificLocalSourceLeaf(pathLeaf(pwd))) {
    if (isExistingChildDirectory(genericParent, pwd)) {
      return pwd;
    }
  }

  return requestedExisting ?? requested ?? cwd;
}

export function resolveLocalSourceRoot(locator: string): string {
  if (isRemoteOrImageSource(locator)) {
    return locator;
  }

  return resolveCliHostLocalSourceFolder(locator);
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
  if (method === "prebuilt-image" || method === "helm" || isRemoteOrImageSource(locator)) {
    return locator;
  }

  return resolveCliHostLocalSourceFolder(locator);
}
