import { homedir } from "node:os";
import { SourceDescriptor, SourceLocator } from "@appaloft/core";

export const CLI_RESOLVED_SOURCE_METADATA_KEY = "cliResolvedSource";
export const ORIGINAL_LOCATOR_METADATA_KEY = "originalLocator";
export const CLI_PACKED_SOURCE_ARCHIVE_METADATA_KEY = "cliPackedSourceTarGz";
export const CLI_PACKED_SOURCE_ARCHIVE_MAX_BYTES = 16 * 1024 * 1024;

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

export function explicitCliPackedSourceArchive(input: {
  packedSourceArchive?: string;
  metadata?: Record<string, string>;
}): string | undefined {
  const fromInput = input.packedSourceArchive?.trim();
  if (fromInput) {
    return fromInput;
  }

  const fromMetadata = input.metadata?.[CLI_PACKED_SOURCE_ARCHIVE_METADATA_KEY]?.trim();
  return fromMetadata || undefined;
}

export function withCliPackedSourceArchiveMetadata(
  metadata: Record<string, string> | undefined,
  packedSourceArchive: string | undefined,
): Record<string, string> | undefined {
  const resolved = packedSourceArchive?.trim();
  if (!resolved) {
    return metadata;
  }

  return {
    ...(metadata ?? {}),
    [CLI_PACKED_SOURCE_ARCHIVE_METADATA_KEY]: resolved,
  };
}

export function cliPackedSourceArchiveFromMetadata(
  metadata: Record<string, string> | undefined,
): string | undefined {
  return explicitCliPackedSourceArchive({
    ...(metadata ? { metadata } : {}),
  });
}

/**
 * Live persist can empty `source.metadata` on the detached worker while
 * `execution.metadata` still carries static-plan fields. Read the CLI-host
 * archive from either bag so packaging does not `existsSync` a Mac path.
 */
export function cliPackedSourceArchiveFromLocalSource(input: {
  packedSourceArchive?: string;
  sourceMetadata?: Record<string, string>;
  executionMetadata?: Record<string, string>;
}): string | undefined {
  return (
    explicitCliPackedSourceArchive({
      ...(input.packedSourceArchive ? { packedSourceArchive: input.packedSourceArchive } : {}),
      ...(input.sourceMetadata ? { metadata: input.sourceMetadata } : {}),
    }) ?? cliPackedSourceArchiveFromMetadata(input.executionMetadata)
  );
}

export function localFolderSourceExecutionMetadata(input: {
  workingDirectory: string;
  originalLocator?: string;
  cliResolvedSource?: string;
  packedSourceArchive?: string;
}): Record<string, string> {
  const originalLocator =
    explicitOriginalLocator({
      ...(input.originalLocator ? { originalLocator: input.originalLocator } : {}),
    }) ??
    (isSpecificLocalSourceLeaf(pathBasename(input.workingDirectory))
      ? input.workingDirectory
      : undefined);
  const cliResolvedSource =
    explicitCliResolvedSource({
      ...(input.cliResolvedSource ? { cliResolvedSource: input.cliResolvedSource } : {}),
    }) ?? originalLocator;
  const packedSourceArchive = explicitCliPackedSourceArchive({
    ...(input.packedSourceArchive ? { packedSourceArchive: input.packedSourceArchive } : {}),
  });

  return {
    ...(originalLocator ? { [ORIGINAL_LOCATOR_METADATA_KEY]: originalLocator } : {}),
    ...(cliResolvedSource ? { [CLI_RESOLVED_SOURCE_METADATA_KEY]: cliResolvedSource } : {}),
    ...(packedSourceArchive
      ? { [CLI_PACKED_SOURCE_ARCHIVE_METADATA_KEY]: packedSourceArchive }
      : {}),
  };
}

/**
 * Stamp the CLI-host archive onto the bag that persist keeps
 * (`execution.metadata` / `runtimeMetadata`). Do not leave it only on
 * `source.metadata` — live rehydrate empties that bag before the worker
 * packages.
 */
export function localFolderSourceExecutionMetadataFromSource(input: {
  source: SourceDescriptor;
  workingDirectory?: string;
}): Record<string, string> {
  return localFolderSourceExecutionMetadata({
    workingDirectory: input.workingDirectory ?? input.source.locator,
    ...(input.source.metadata ? { originalLocator: input.source.metadata.originalLocator } : {}),
    ...(input.source.metadata
      ? { cliResolvedSource: input.source.metadata[CLI_RESOLVED_SOURCE_METADATA_KEY] }
      : {}),
    ...(input.source.metadata
      ? { packedSourceArchive: input.source.metadata[CLI_PACKED_SOURCE_ARCHIVE_METADATA_KEY] }
      : {}),
  });
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

export function localFolderSourceFieldsFromResourceBinding(input: {
  locator?: string;
  originalLocator?: string;
  metadata?: Record<string, string>;
}): {
  originalLocator?: string;
  cliResolvedSource?: string;
  packedSourceArchive?: string;
} {
  const originalLocator =
    explicitOriginalLocator({
      ...(input.originalLocator ? { originalLocator: input.originalLocator } : {}),
      ...(input.metadata ? { metadata: input.metadata } : {}),
    }) ??
    (isSpecificLocalSourceLeaf(pathBasename(input.locator ?? ""))
      ? input.locator?.trim()
      : undefined);
  const cliResolvedSource = explicitCliResolvedSource({
    ...(input.metadata ? { metadata: input.metadata } : {}),
  });
  const packedSourceArchive = explicitCliPackedSourceArchive({
    ...(input.metadata ? { metadata: input.metadata } : {}),
  });

  return {
    ...(originalLocator ? { originalLocator } : {}),
    ...(cliResolvedSource ? { cliResolvedSource } : {}),
    ...(packedSourceArchive ? { packedSourceArchive } : {}),
  };
}

/**
 * Live create-resource persist keeps leaf / archive on the resource
 * binding (first-class originalLocator plus metadata). Plan detect must
 * read those fields from the binding, not only from a SourceDescriptor
 * whose metadata live rehydrate may empty.
 */
export function retainLocalFolderSourceFieldsFromResourceBinding(
  source: SourceDescriptor,
  binding:
    | {
        locator?: string;
        originalLocator?: string;
        metadata?: Record<string, string>;
      }
    | undefined,
): SourceDescriptor {
  if (!binding) {
    return source;
  }

  return retainLocalFolderSourceFields(source, localFolderSourceFieldsFromResourceBinding(binding));
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
  input: {
    originalLocator?: string;
    cliResolvedSource?: string;
    packedSourceArchive?: string;
  },
): SourceDescriptor {
  const originalLocator = explicitOriginalLocator({
    ...(input.originalLocator ? { originalLocator: input.originalLocator } : {}),
    ...(source.metadata ? { metadata: source.metadata } : {}),
  });
  const cliResolvedSource = explicitCliResolvedSource({
    ...(input.cliResolvedSource ? { cliResolvedSource: input.cliResolvedSource } : {}),
    ...(source.metadata ? { metadata: source.metadata } : {}),
  });
  const packedSourceArchive = explicitCliPackedSourceArchive({
    ...(input.packedSourceArchive ? { packedSourceArchive: input.packedSourceArchive } : {}),
    ...(source.metadata ? { metadata: source.metadata } : {}),
  });
  const persistedPath = originalLocator ?? cliResolvedSource;
  if (!persistedPath && !packedSourceArchive) {
    return source;
  }

  const locator = persistedPath
    ? restoreLocalFolderLocator(source.locator, persistedPath)
    : source.locator;
  const metadata =
    withCliPackedSourceArchiveMetadata(
      persistedPath
        ? (withLocalFolderSourceMetadata(source.metadata, {
            ...(originalLocator || persistedPath
              ? { originalLocator: originalLocator ?? persistedPath }
              : {}),
            ...(cliResolvedSource ? { cliResolvedSource } : {}),
          }) ?? {
            [ORIGINAL_LOCATOR_METADATA_KEY]: persistedPath,
          })
        : source.metadata,
      packedSourceArchive,
    ) ??
    (persistedPath
      ? {
          [ORIGINAL_LOCATOR_METADATA_KEY]: persistedPath,
        }
      : undefined);

  return SourceDescriptor.rehydrate({
    ...source.toState(),
    locator: SourceLocator.rehydrate(locator),
    ...(metadata ? { metadata } : {}),
  });
}
