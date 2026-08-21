import { homedir } from "node:os";
import { SourceDescriptor, SourceLocator } from "@appaloft/core";

export const CLI_RESOLVED_SOURCE_METADATA_KEY = "cliResolvedSource";
export const ORIGINAL_LOCATOR_METADATA_KEY = "originalLocator";

const GENERIC_PARENT_LEAFS = new Set([
  "projects",
  "users",
  "home",
  "src",
  "workspace",
  "user",
  "documents",
  "desktop",
  "downloads",
]);

function pathBasename(path: string): string {
  const stripped = path.replace(/\/+$/, "");
  const parts = (stripped || path).split(/[\\/]/).filter(Boolean);
  return parts.at(-1) ?? "";
}

function homeDirectoryLeaf(): string | undefined {
  try {
    const leaf = pathBasename(homedir());
    return leaf || undefined;
  } catch {
    return undefined;
  }
}

export function isGenericLocalSourceLeaf(leaf: string | undefined): boolean {
  const normalized = leaf?.trim();
  if (!normalized || normalized === "." || normalized === "..") {
    return true;
  }

  const lower = normalized.toLowerCase();
  if (GENERIC_PARENT_LEAFS.has(lower)) {
    return true;
  }

  const homeLeaf = homeDirectoryLeaf();
  return Boolean(homeLeaf && homeLeaf.toLowerCase() === lower);
}

export function isSpecificLocalSourceLeaf(leaf: string | undefined): leaf is string {
  const normalized = leaf?.trim();
  return Boolean(
    normalized &&
    normalized !== "." &&
    normalized !== ".." &&
    !normalized.includes("/") &&
    !isGenericLocalSourceLeaf(normalized),
  );
}

/**
 * Exact `deploy .` path the CLI already printed as summary.Source.
 * Only an explicit value or persisted metadata counts. Locator is not a
 * fallback: after an upstream dirname it is already the parent.
 */
export function explicitCliResolvedSource(input: {
  cliResolvedSource?: string;
  metadata?: Record<string, string>;
}): string | undefined {
  const fromInput = input.cliResolvedSource?.trim();
  if (fromInput) {
    return fromInput;
  }

  const fromMetadata = input.metadata?.[CLI_RESOLVED_SOURCE_METADATA_KEY]?.trim();
  return fromMetadata || undefined;
}

export function explicitOriginalLocator(input: {
  originalLocator?: string;
  metadata?: Record<string, string>;
}): string | undefined {
  const fromInput = input.originalLocator?.trim();
  if (fromInput) {
    return fromInput;
  }

  const fromMetadata = input.metadata?.[ORIGINAL_LOCATOR_METADATA_KEY]?.trim();
  return fromMetadata || undefined;
}

export function withCliResolvedSourceMetadata(
  metadata: Record<string, string> | undefined,
  cliResolvedSource: string | undefined,
): Record<string, string> | undefined {
  const resolved = cliResolvedSource?.trim();
  if (!resolved) {
    return metadata;
  }

  return {
    ...(metadata ?? {}),
    [CLI_RESOLVED_SOURCE_METADATA_KEY]: resolved,
  };
}

export function withOriginalLocatorMetadata(
  metadata: Record<string, string> | undefined,
  originalLocator: string | undefined,
): Record<string, string> | undefined {
  const resolved = originalLocator?.trim();
  if (!resolved) {
    return metadata;
  }

  return {
    ...(metadata ?? {}),
    [ORIGINAL_LOCATOR_METADATA_KEY]: resolved,
  };
}

function withLocalFolderSourceMetadata(
  metadata: Record<string, string> | undefined,
  input: { originalLocator?: string; cliResolvedSource?: string },
): Record<string, string> | undefined {
  return withCliResolvedSourceMetadata(
    withOriginalLocatorMetadata(metadata, input.originalLocator),
    input.cliResolvedSource,
  );
}

function restoreLocalFolderLocator(locator: string, originalLocator: string | undefined): string {
  const resolved = originalLocator?.trim();
  if (!resolved || !isSpecificLocalSourceLeaf(pathBasename(resolved))) {
    return locator;
  }

  if (isSpecificLocalSourceLeaf(pathBasename(locator))) {
    return locator;
  }

  return resolved;
}

export function retainCliResolvedSource(
  source: SourceDescriptor,
  cliResolvedSource: string | undefined,
): SourceDescriptor {
  return retainLocalFolderSourceFields(source, {
    ...(cliResolvedSource ? { cliResolvedSource } : {}),
  });
}

/**
 * Keep the CLI `deploy .` cwd on first-class source fields that already
 * persist: locator and originalLocator. Do not rely on metadata.cliResolvedSource
 * alone — Cloud/rehydrate may drop that key.
 */
export function retainLocalFolderSourceFields(
  source: SourceDescriptor,
  input: { originalLocator?: string; cliResolvedSource?: string },
): SourceDescriptor {
  const originalLocator = explicitOriginalLocator({
    ...(input.originalLocator ? { originalLocator: input.originalLocator } : {}),
    ...(source.metadata ? { metadata: source.metadata } : {}),
  });
  const cliResolvedSource = explicitCliResolvedSource({
    ...(input.cliResolvedSource ? { cliResolvedSource: input.cliResolvedSource } : {}),
    ...(source.metadata ? { metadata: source.metadata } : {}),
  });
  const persistedPath = originalLocator ?? cliResolvedSource;
  if (!persistedPath) {
    return source;
  }

  const locator = restoreLocalFolderLocator(source.locator, persistedPath);
  const metadata = withLocalFolderSourceMetadata(source.metadata, {
    ...(originalLocator || persistedPath
      ? { originalLocator: originalLocator ?? persistedPath }
      : {}),
    ...(cliResolvedSource ? { cliResolvedSource } : {}),
  }) ?? {
    [ORIGINAL_LOCATOR_METADATA_KEY]: persistedPath,
  };

  return SourceDescriptor.rehydrate({
    ...source.toState(),
    locator: SourceLocator.rehydrate(locator),
    metadata,
  });
}
