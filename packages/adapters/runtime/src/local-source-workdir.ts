import { existsSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import {
  explicitCliResolvedSource,
  isGenericLocalSourceLeaf,
  isSpecificLocalSourceLeaf,
} from "@appaloft/application";

function stripTrailingSeparators(path: string): string {
  const stripped = path.replace(/\/+$/, "");
  return stripped || path;
}

function pathBasename(path: string): string {
  return basename(stripTrailingSeparators(path));
}

/**
 * Keep the real source folder, including hyphenated names that do not exist on
 * this host. Only dirname a locator that is an existing file (compose/Dockerfile).
 * A missing path is the source folder itself — never silently become its parent.
 */
export function normalizeLocalSourceWorkingDirectory(locator: string): string {
  const resolved = isAbsolute(locator) ? locator : resolve(locator);
  try {
    const stats = statSync(resolved);
    if (stats.isDirectory()) {
      return resolved;
    }
    if (stats.isFile()) {
      return dirname(resolved);
    }
  } catch {
    // Path is not on this machine (remote worker, or not yet uploaded).
  }
  return resolved;
}

/**
 * Relative subdirectory inside the source root. `/`, `.`, `..`, and any
 * segment that would walk to the parent are ignored so a missing hyphenated
 * folder cannot become `/Users/nichenqin/projects`.
 */
export function safeLocalSourceBaseDirectory(metadata?: Record<string, string>): string | undefined {
  const raw = metadata?.baseDirectory?.trim();
  if (!raw) {
    return undefined;
  }

  const stripped = raw.replace(/^\/+/, "").replace(/\/+$/, "");
  if (!stripped) {
    return undefined;
  }

  const segments = stripped.split("/").filter(Boolean);
  if (segments.length === 0 || segments.some((segment) => segment === "." || segment === "..")) {
    return undefined;
  }

  return segments.join("/");
}

export function applyLocalSourceBaseDirectory(
  root: string,
  metadata?: Record<string, string>,
): string {
  const baseDirectory = safeLocalSourceBaseDirectory(metadata);
  if (!baseDirectory) {
    return root;
  }

  const resolved = resolve(root, baseDirectory);
  const relativeResolved = relative(root, resolved);
  if (!relativeResolved || relativeResolved.startsWith("..") || isAbsolute(relativeResolved)) {
    return root;
  }

  return resolved;
}

function existingDirectory(path: string): string | undefined {
  try {
    return statSync(path).isDirectory() ? path : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Prefer the source locator (what CLI summary.Source prints) when
 * `workingDirectory` is already the parent or otherwise outside that folder.
 * A child workingDirectory (monorepo subdir) is kept. Must not package
 * `/Users/nichenqin/projects` when the locator is the hyphenated cwd.
 */
function preferLocalSourceRoot(locatorRoot: string, workingDirectory?: string): string {
  if (!workingDirectory || workingDirectory === locatorRoot) {
    return locatorRoot;
  }

  const relativeWorkdir = relative(locatorRoot, workingDirectory);
  if (!relativeWorkdir || relativeWorkdir.startsWith("..") || isAbsolute(relativeWorkdir)) {
    return locatorRoot;
  }

  return workingDirectory;
}

function leafFromResourceName(resourceName: string | undefined): string | undefined {
  const normalized = resourceName?.trim();
  if (!normalized) {
    return undefined;
  }

  const withoutGeneratedSuffix = normalized.replace(/-[a-z0-9]{6}$/iu, "");
  if (isSpecificLocalSourceLeaf(withoutGeneratedSuffix) && withoutGeneratedSuffix.includes("-")) {
    return withoutGeneratedSuffix;
  }

  return isSpecificLocalSourceLeaf(normalized) ? normalized : undefined;
}

function leafFromOriginalLocator(originalLocator: string | undefined): string | undefined {
  if (!originalLocator) {
    return undefined;
  }

  const leaf = pathBasename(originalLocator);
  return isSpecificLocalSourceLeaf(leaf) ? leaf : undefined;
}

function sourceFolderLeaf(input: {
  locator: string;
  displayName?: string;
  originalLocator?: string;
  resourceName?: string;
}): string | undefined {
  const fromOriginal = leafFromOriginalLocator(input.originalLocator);
  if (fromOriginal) {
    return fromOriginal;
  }

  const fromName = input.displayName?.trim().replace(/\/+$/, "");
  if (isSpecificLocalSourceLeaf(fromName)) {
    return fromName;
  }

  const fromResource = leafFromResourceName(input.resourceName);
  if (fromResource) {
    return fromResource;
  }

  const fromLocator = pathBasename(input.locator);
  if (isSpecificLocalSourceLeaf(fromLocator)) {
    return fromLocator;
  }

  return undefined;
}

function firstClassLocalFolderPath(input: {
  originalLocator?: string;
  workingDirectory?: string;
  locator: string;
  displayName?: string;
  resourceName?: string;
}): string | undefined {
  const knownLeaf = sourceFolderLeaf(input);
  for (const candidate of [input.originalLocator, input.workingDirectory, input.locator]) {
    const trimmed = candidate?.trim();
    if (!trimmed || !isSpecificLocalSourceLeaf(pathBasename(trimmed))) {
      continue;
    }

    if (knownLeaf && pathBasename(trimmed) !== knownLeaf) {
      continue;
    }

    return trimmed;
  }

  return undefined;
}

/**
 * When locator and workingDirectory are already the parent (upstream dirname),
 * reconstruct the hyphenated `deploy .` folder from originalLocator / displayName
 * / resource name. Never treat a generic parent basename (`projects`, `Users`,
 * `home`, `src`) as the source leaf. Do not require existsSync or process.cwd().
 */
export function recoverLocalSourceFolderFromCwd(input: {
  plannedRoot: string;
  locator: string;
  displayName?: string;
  originalLocator?: string;
  resourceName?: string;
  cwd?: string;
}): string {
  const originalLocator = input.originalLocator?.trim();
  if (originalLocator && isSpecificLocalSourceLeaf(pathBasename(originalLocator))) {
    return originalLocator;
  }

  const leaf = sourceFolderLeaf(input);
  const plannedRoot = stripTrailingSeparators(input.plannedRoot);
  const locatorRoot = stripTrailingSeparators(input.locator);
  const plannedIsAlreadyLeaf =
    Boolean(leaf) && !isGenericLocalSourceLeaf(leaf) && pathBasename(plannedRoot) === leaf;
  if (plannedIsAlreadyLeaf) {
    return input.plannedRoot;
  }

  // Reconstruct even when the check host does not have the folder. An
  // existsSync of `join(parent, leaf)` is a no-op on workers and when cwd is
  // runtimeDir. Only do this when plannedRoot is still the locator (both
  // already the parent); a kept monorepo child workdir must not gain the leaf.
  if (leaf && !isGenericLocalSourceLeaf(leaf) && plannedRoot === locatorRoot) {
    const reconstructed = resolve(plannedRoot, leaf);
    if (pathBasename(reconstructed) === leaf) {
      return reconstructed;
    }
  }

  const cwd = existingDirectory(input.cwd ?? process.cwd());
  if (!cwd) {
    return input.plannedRoot;
  }

  const cwdIsNamedSource = Boolean(leaf) && pathBasename(cwd) === leaf;
  const cwdIsLocator = cwd === input.locator || cwd === input.plannedRoot;
  if (!cwdIsNamedSource && !cwdIsLocator) {
    return input.plannedRoot;
  }

  if (!existsSync(input.plannedRoot)) {
    return cwd;
  }

  if (input.plannedRoot === cwd) {
    return cwd;
  }

  const relativeFromPlanned = relative(input.plannedRoot, cwd);
  if (
    relativeFromPlanned &&
    !relativeFromPlanned.startsWith("..") &&
    !isAbsolute(relativeFromPlanned)
  ) {
    return cwd;
  }

  return input.plannedRoot;
}

/**
 * First write of the static-plan workingDirectory and the SSH package root.
 * Prefer originalLocator, then execution.workingDirectory, then locator.
 * Legacy metadata.cliResolvedSource is only a last-resort explicit path.
 * Recovers the hyphenated cwd when those fields are already the parent.
 */
export function resolveLocalWorkspaceWorkdir(input: {
  workingDirectory?: string;
  locator: string;
  displayName?: string;
  originalLocator?: string;
  resourceName?: string;
  metadata?: Record<string, string>;
  cwd?: string;
  cliResolvedSource?: string;
}): string {
  const originalLocator =
    input.originalLocator?.trim() || input.metadata?.originalLocator?.trim() || undefined;
  const firstClass = firstClassLocalFolderPath({
    locator: input.locator,
    ...(originalLocator ? { originalLocator } : {}),
    ...(input.workingDirectory ? { workingDirectory: input.workingDirectory } : {}),
    ...(input.displayName ? { displayName: input.displayName } : {}),
    ...(input.resourceName ? { resourceName: input.resourceName } : {}),
  });
  if (firstClass && isSpecificLocalSourceLeaf(pathBasename(firstClass))) {
    return applyLocalSourceBaseDirectory(
      normalizeLocalSourceWorkingDirectory(firstClass),
      input.metadata,
    );
  }

  const cliResolvedSource = explicitCliResolvedSource({
    ...(input.cliResolvedSource ? { cliResolvedSource: input.cliResolvedSource } : {}),
    ...(input.metadata ? { metadata: input.metadata } : {}),
  });
  if (cliResolvedSource && isSpecificLocalSourceLeaf(pathBasename(cliResolvedSource))) {
    return applyLocalSourceBaseDirectory(
      normalizeLocalSourceWorkingDirectory(cliResolvedSource),
      input.metadata,
    );
  }

  const locatorRoot = normalizeLocalSourceWorkingDirectory(input.locator);
  const preferred = preferLocalSourceRoot(
    locatorRoot,
    input.workingDirectory
      ? normalizeLocalSourceWorkingDirectory(input.workingDirectory)
      : undefined,
  );

  return applyLocalSourceBaseDirectory(
    recoverLocalSourceFolderFromCwd({
      plannedRoot: preferred,
      locator: locatorRoot,
      ...(originalLocator ? { originalLocator } : {}),
      ...(input.displayName ? { displayName: input.displayName } : {}),
      ...(input.resourceName ? { resourceName: input.resourceName } : {}),
      ...(input.cwd ? { cwd: input.cwd } : {}),
    }),
    input.metadata,
  );
}

/**
 * Path `prepareSshSource` existsSync-checks and tars. Prefer originalLocator,
 * then execution.workingDirectory, then locator. Never treat a generic parent
 * basename as the source leaf. Do not use runtimeDir as the source cwd.
 */
export function resolveSshPackageLocalWorkdir(input: {
  locator: string;
  workingDirectory?: string;
  displayName?: string;
  originalLocator?: string;
  resourceName?: string;
  metadata?: Record<string, string>;
}): string {
  return resolveLocalWorkspaceWorkdir({
    locator: input.locator,
    ...(input.workingDirectory ? { workingDirectory: input.workingDirectory } : {}),
    ...(input.displayName ? { displayName: input.displayName } : {}),
    ...(input.originalLocator ? { originalLocator: input.originalLocator } : {}),
    ...(input.resourceName ? { resourceName: input.resourceName } : {}),
    ...(input.metadata ? { metadata: input.metadata } : {}),
  });
}
