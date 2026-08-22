import { homedir } from "node:os";
import {
  FilePathText,
  RuntimeExecutionPlan,
  type RuntimePlan,
  SourceDescriptor,
  SourceLocator,
} from "@appaloft/core";

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

  // mkdtemp(`projects-`) and live lastError parent `/Users/.../projects`.
  // A hyphenated parent must not win over `nux-*-static`.
  if (lower.startsWith("projects-")) {
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

function workerPackageLeafName(input: {
  locator?: string;
  originalLocator?: string;
  cliResolvedSource?: string;
  workingDirectory?: string;
  displayName?: string;
  resourceName?: string;
}): string | undefined {
  for (const candidate of [input.originalLocator, input.cliResolvedSource]) {
    const leaf = pathBasename(candidate?.trim() ?? "");
    if (isSpecificLocalSourceLeaf(leaf)) {
      return leaf;
    }
  }

  const displayName = input.displayName?.trim().replace(/\/+$/, "");
  if (isSpecificLocalSourceLeaf(displayName)) {
    return displayName;
  }

  const resourceName = input.resourceName?.trim();
  if (resourceName) {
    const withoutGeneratedSuffix = resourceName.replace(/-[a-z0-9]{6}$/iu, "");
    if (isSpecificLocalSourceLeaf(withoutGeneratedSuffix) && withoutGeneratedSuffix.includes("-")) {
      return withoutGeneratedSuffix;
    }
    if (isSpecificLocalSourceLeaf(resourceName)) {
      return resourceName;
    }
  }

  const specificPaths = [input.workingDirectory, input.locator]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => right.length - left.length);
  for (const path of specificPaths) {
    const leaf = pathBasename(path);
    if (isSpecificLocalSourceLeaf(leaf) && leaf.includes("-")) {
      return leaf;
    }
  }

  return undefined;
}

/**
 * Package root the detached worker must receive. Live `resource show` for
 * dep_tu084dr7fln1 had locator + originalLocator + cliPackedSourceTarGz on
 * the hyphenated leaf and no workingDirectory. Do not require workingDirectory.
 * When locator is already a generic parent such as `projects` or `projects-*`,
 * recover the hyphenated leaf from originalLocator / displayName / resourceName.
 * Do not dirname a hyphenated leaf under that parent.
 */
export function localFolderWorkerPackageRoot(input: {
  locator?: string;
  originalLocator?: string;
  cliResolvedSource?: string;
  workingDirectory?: string;
  displayName?: string;
  resourceName?: string;
}): string | undefined {
  const knownLeaf = workerPackageLeafName(input);
  const candidates = [
    input.originalLocator,
    input.cliResolvedSource,
    input.workingDirectory,
    input.locator,
  ]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));

  if (knownLeaf) {
    const matching = candidates
      .filter((path) => pathBasename(path) === knownLeaf)
      .sort((left, right) => right.length - left.length)[0];
    if (matching) {
      return matching;
    }

    const parent = candidates.find((path) => pathBasename(path) !== knownLeaf);
    if (parent) {
      const reconstructed = `${parent.replace(/\/+$/, "")}/${knownLeaf}`;
      if (pathBasename(reconstructed) === knownLeaf) {
        return reconstructed;
      }
    }

    return knownLeaf.includes("/") ? knownLeaf : undefined;
  }

  const specific = candidates
    .filter((path) => {
      const leaf = pathBasename(path);
      return isSpecificLocalSourceLeaf(leaf) && leaf.includes("-");
    })
    .sort((left, right) => right.length - left.length);
  return specific[0];
}

/**
 * Stamp the worker package root onto the execution plan the detached
 * worker reloads. Live persist for `res_rkd0hzp0yvp5` kept the hyphenated
 * leaf and archive but omitted `execution.workingDirectory`; an older
 * worker then `dirname`s that leaf to `/Users/nichenqin/projects`.
 * Always write the leaf. Do not omit the field.
 */
export function withLocalFolderWorkerPackageRoot(plan: RuntimePlan): RuntimePlan {
  const packageRoot = localFolderWorkerPackageRoot({
    locator: plan.source.locator,
    ...(plan.source.metadata?.originalLocator
      ? { originalLocator: plan.source.metadata.originalLocator }
      : {}),
    ...(plan.source.metadata?.[CLI_RESOLVED_SOURCE_METADATA_KEY]
      ? { cliResolvedSource: plan.source.metadata[CLI_RESOLVED_SOURCE_METADATA_KEY] }
      : {}),
    ...(plan.source.displayName ? { displayName: plan.source.displayName } : {}),
    ...(plan.execution.metadata?.["context.resourceName"]
      ? { resourceName: plan.execution.metadata["context.resourceName"] }
      : {}),
    ...(plan.execution.workingDirectory
      ? { workingDirectory: plan.execution.workingDirectory }
      : {}),
  });
  if (packageRoot === undefined || plan.execution.workingDirectory === packageRoot) {
    return plan;
  }

  return plan.withExecution(
    RuntimeExecutionPlan.rehydrate({
      ...plan.execution.toState(),
      workingDirectory: FilePathText.rehydrate(packageRoot),
    }),
  );
}

const LOCAL_FOLDER_SOURCE_WIRE_OPERATIONS = new Set([
  "resources.create",
  "resources.configure-source",
]);

export type LocalFolderSourceWireInspection = {
  locator: string;
  originalLocator: string;
  workingDirectory: string;
  displayName: string;
  cliResolvedSource: string;
  metadataKeys: string[];
  cliPackedSourceTarGz: "absent" | `present:${number}`;
};

function dashOrValue(value: string | undefined): string {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : "-";
}

function recordString(value: unknown): Record<string, string> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }

  const entries = Object.entries(value).flatMap(([key, child]) =>
    typeof child === "string" ? [[key, child] as const] : [],
  );
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function archivePresence(
  metadata: Record<string, string> | undefined,
): "absent" | `present:${number}` {
  const raw = metadata?.[CLI_PACKED_SOURCE_ARCHIVE_METADATA_KEY]?.trim();
  return raw ? `present:${raw.length}` : "absent";
}

function metadataKeys(metadata: Record<string, string> | undefined): string[] {
  return Object.keys(metadata ?? {}).sort();
}

/**
 * Compact dump of the local-folder fields the detached worker
 * existsSync/package actually receives. Never includes archive bytes.
 */
export function inspectLocalFolderSourceWireFields(input: {
  locator?: string;
  originalLocator?: string;
  workingDirectory?: string;
  displayName?: string;
  sourceMetadata?: Record<string, string>;
  executionMetadata?: Record<string, string>;
}): LocalFolderSourceWireInspection {
  const sourceMetadata = input.sourceMetadata;
  const executionMetadata = input.executionMetadata;
  const mergedMetadata = {
    ...(sourceMetadata ?? {}),
    ...(executionMetadata ?? {}),
  };
  return {
    locator: dashOrValue(input.locator),
    originalLocator: dashOrValue(
      explicitOriginalLocator({
        ...(input.originalLocator ? { originalLocator: input.originalLocator } : {}),
        ...(sourceMetadata ? { metadata: sourceMetadata } : {}),
      }) ??
        explicitOriginalLocator({
          ...(executionMetadata ? { metadata: executionMetadata } : {}),
        }),
    ),
    workingDirectory: dashOrValue(input.workingDirectory),
    displayName: dashOrValue(input.displayName),
    cliResolvedSource: dashOrValue(
      explicitCliResolvedSource({
        ...(sourceMetadata ? { metadata: sourceMetadata } : {}),
      }) ??
        explicitCliResolvedSource({
          ...(executionMetadata ? { metadata: executionMetadata } : {}),
        }),
    ),
    metadataKeys: metadataKeys(mergedMetadata),
    cliPackedSourceTarGz: archivePresence(mergedMetadata),
  };
}

export function formatLocalFolderSourceWireInspection(
  origin: string,
  inspection: LocalFolderSourceWireInspection,
): string {
  return [
    `local-folder wire ${origin}`,
    `locator=${inspection.locator}`,
    `originalLocator=${inspection.originalLocator}`,
    `workingDirectory=${inspection.workingDirectory}`,
    `displayName=${inspection.displayName}`,
    `cliResolvedSource=${inspection.cliResolvedSource}`,
    `metadataKeys=${inspection.metadataKeys.join(",") || "-"}`,
    `cliPackedSourceTarGz=${inspection.cliPackedSourceTarGz}`,
  ].join(" ");
}

function sourceRecordFromUnknown(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }

  if ("source" in value && typeof value.source === "object" && value.source !== null) {
    return value.source as Record<string, unknown>;
  }

  return value as Record<string, unknown>;
}

/**
 * Inspect the JSON body the CLI actually POSTs for resources.create /
 * resources.configure-source, or a JSON-roundtripped runtime plan the
 * detached worker reloads. Archive bytes stay out of the dump.
 */
export function inspectLocalFolderSourceWireFromUnknown(
  value: unknown,
): LocalFolderSourceWireInspection | undefined {
  const source = sourceRecordFromUnknown(value);
  if (!source) {
    return undefined;
  }

  const kind = typeof source.kind === "string" ? source.kind : undefined;
  if (kind && kind !== "local-folder" && kind !== "local-git" && kind !== "compose") {
    return undefined;
  }

  const locator = typeof source.locator === "string" ? source.locator : undefined;
  if (!locator && kind === undefined) {
    return undefined;
  }

  const root =
    typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  const execution =
    root && typeof root.execution === "object" && root.execution !== null
      ? (root.execution as Record<string, unknown>)
      : undefined;
  const sourceMetadata = recordString(source.metadata);
  const executionMetadata = execution ? recordString(execution.metadata) : undefined;
  const workingDirectory =
    typeof execution?.workingDirectory === "string"
      ? execution.workingDirectory
      : typeof source.workingDirectory === "string"
        ? source.workingDirectory
        : undefined;

  return inspectLocalFolderSourceWireFields({
    ...(locator ? { locator } : {}),
    ...(typeof source.originalLocator === "string"
      ? { originalLocator: source.originalLocator }
      : {}),
    ...(typeof source.displayName === "string" ? { displayName: source.displayName } : {}),
    ...(workingDirectory ? { workingDirectory } : {}),
    ...(sourceMetadata ? { sourceMetadata } : {}),
    ...(executionMetadata ? { executionMetadata } : {}),
  });
}

export function localFolderSourceWireDumpLine(
  operationKey: string,
  body: unknown,
): string | undefined {
  if (!LOCAL_FOLDER_SOURCE_WIRE_OPERATIONS.has(operationKey)) {
    return undefined;
  }

  const inspection = inspectLocalFolderSourceWireFromUnknown(body);
  if (!inspection) {
    return undefined;
  }

  return formatLocalFolderSourceWireInspection(operationKey, inspection);
}
