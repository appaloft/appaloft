import { statSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";

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

/**
 * Same composition SSH package uses before the exists-check:
 * `workingDirectory ?? locator`, then keep the folder, then apply a safe
 * relative baseDirectory. Must not dirname a missing hyphenated folder.
 */
export function resolveLocalWorkspaceWorkdir(input: {
  workingDirectory?: string;
  locator: string;
  metadata?: Record<string, string>;
}): string {
  return applyLocalSourceBaseDirectory(
    normalizeLocalSourceWorkingDirectory(input.workingDirectory ?? input.locator),
    input.metadata,
  );
}
