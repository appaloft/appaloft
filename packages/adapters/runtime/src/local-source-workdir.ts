import { existsSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";

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

function sourceFolderLeaf(input: { locator: string; displayName?: string }): string | undefined {
  const fromName = input.displayName?.trim().replace(/\/+$/, "");
  if (fromName && fromName !== "." && fromName !== ".." && !fromName.includes("/")) {
    return fromName;
  }

  const fromLocator = basename(input.locator.replace(/\/+$/, ""));
  if (fromLocator && fromLocator !== "." && fromLocator !== "..") {
    return fromLocator;
  }

  return undefined;
}

function stripTrailingSeparators(path: string): string {
  const stripped = path.replace(/\/+$/, "");
  return stripped || path;
}

/**
 * When locator and workingDirectory are already the parent (upstream dirname),
 * reconstruct the hyphenated `deploy .` folder from displayName/leaf.
 * Do not require existsSync or process.cwd(): SSH `prepareSshSource` packages
 * with `cwd: runtimeDir` and may run on a host that does not have the Mac folder.
 */
export function recoverLocalSourceFolderFromCwd(input: {
  plannedRoot: string;
  locator: string;
  displayName?: string;
  cwd?: string;
}): string {
  const leaf = sourceFolderLeaf(input);
  const plannedRoot = stripTrailingSeparators(input.plannedRoot);
  const locatorRoot = stripTrailingSeparators(input.locator);
  const plannedIsAlreadyLeaf = Boolean(leaf) && basename(plannedRoot) === leaf;
  if (plannedIsAlreadyLeaf) {
    return input.plannedRoot;
  }

  // Reconstruct even when the check host does not have the folder. An
  // existsSync of `join(parent, leaf)` is a no-op on workers and when cwd is
  // runtimeDir. Only do this when plannedRoot is still the locator (both
  // already the parent); a kept monorepo child workdir must not gain the leaf.
  if (leaf && plannedRoot === locatorRoot) {
    const reconstructed = resolve(plannedRoot, leaf);
    if (basename(stripTrailingSeparators(reconstructed)) === leaf) {
      return reconstructed;
    }
  }

  const cwd = existingDirectory(input.cwd ?? process.cwd());
  if (!cwd) {
    return input.plannedRoot;
  }

  const cwdIsNamedSource = Boolean(leaf) && basename(cwd) === leaf;
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
 * Recovers the hyphenated cwd when locator/workdir were already dirname'd
 * upstream. Must not only wrap a helper after the value is already the parent,
 * and must not wait for existsSync or a matching process.cwd().
 */
export function resolveLocalWorkspaceWorkdir(input: {
  workingDirectory?: string;
  locator: string;
  displayName?: string;
  metadata?: Record<string, string>;
  cwd?: string;
}): string {
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
      ...(input.displayName ? { displayName: input.displayName } : {}),
      ...(input.cwd ? { cwd: input.cwd } : {}),
    }),
    input.metadata,
  );
}
