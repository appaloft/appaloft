import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  type ServerAppliedRouteDesiredStateStore as CliServerAppliedRouteStateStore,
  type CliSourceLinkStore,
  FileSystemServerAppliedRouteDesiredStateStore,
  FileSystemSourceLinkStore,
  type ServerAppliedRouteDesiredStateRecord,
} from "@appaloft/adapter-cli";
import { type AppLogger, type SourceLinkRecord } from "@appaloft/application";

export interface LegacyPgliteStateAdoptionInput {
  pgliteDataDir: string;
  sourceLinkStore: CliSourceLinkStore;
  serverAppliedRouteStore: CliServerAppliedRouteStateStore;
  logger: AppLogger;
}

export interface LegacyPgliteStateAdoptionSummary {
  importedSourceLinks: number;
  prunedSourceLinks: number;
  importedServerAppliedRoutes: number;
  prunedServerAppliedRoutes: number;
}

const emptySummary = (): LegacyPgliteStateAdoptionSummary => ({
  importedSourceLinks: 0,
  prunedSourceLinks: 0,
  importedServerAppliedRoutes: 0,
  prunedServerAppliedRoutes: 0,
});

function routeTarget(record: ServerAppliedRouteDesiredStateRecord) {
  return {
    projectId: record.projectId,
    environmentId: record.environmentId,
    resourceId: record.resourceId,
    serverId: record.serverId,
    ...(record.destinationId ? { destinationId: record.destinationId } : {}),
  };
}

function sameTarget(
  left: Pick<
    SourceLinkRecord,
    "projectId" | "environmentId" | "resourceId" | "serverId" | "destinationId"
  >,
  right: Pick<
    ServerAppliedRouteDesiredStateRecord,
    "projectId" | "environmentId" | "resourceId" | "serverId" | "destinationId"
  >,
): boolean {
  return (
    left.projectId === right.projectId &&
    left.environmentId === right.environmentId &&
    left.resourceId === right.resourceId &&
    left.serverId === right.serverId &&
    left.destinationId === right.destinationId
  );
}

function adoptionError(message: string, details: Record<string, unknown>): Error {
  return new Error(`${message}: ${JSON.stringify(details)}`);
}

function errorCode(error: unknown): string | undefined {
  return error instanceof Error && "code" in error ? String(error.code) : undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasString(value: Record<string, unknown>, key: string): boolean {
  return typeof value[key] === "string";
}

function isSourceLinkRecord(value: unknown): value is SourceLinkRecord {
  if (!isRecord(value)) {
    return false;
  }

  return (
    hasString(value, "sourceFingerprint") &&
    hasString(value, "projectId") &&
    hasString(value, "environmentId") &&
    hasString(value, "resourceId") &&
    hasString(value, "updatedAt")
  );
}

function isServerAppliedRouteRecord(value: unknown): value is ServerAppliedRouteDesiredStateRecord {
  if (!isRecord(value)) {
    return false;
  }

  return (
    hasString(value, "routeSetId") &&
    hasString(value, "projectId") &&
    hasString(value, "environmentId") &&
    hasString(value, "resourceId") &&
    hasString(value, "serverId") &&
    hasString(value, "updatedAt") &&
    Array.isArray(value.domains) &&
    ["desired", "applied", "failed"].includes(String(value.status))
  );
}

async function listLegacyRecords<T>(input: {
  dataRoot: string;
  directoryName: "source-links" | "server-applied-routes";
  phase: "source-link-resolution" | "config-domain-resolution";
  enumerateErrorMessage: string;
  logger: AppLogger;
  isRecord: (value: unknown) => value is T;
}): Promise<T[]> {
  const directory = join(input.dataRoot, input.directoryName);
  let entries: Array<{ name: string; isFile(): boolean }>;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (errorCode(error) === "ENOENT") {
      return [];
    }

    throw adoptionError(input.enumerateErrorMessage, {
      phase: input.phase,
      message: errorMessage(error),
    });
  }

  const records: T[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) {
      input.logger.warn("legacy_pglite_state_adoption.skipped_unexpected_file", {
        phase: input.phase,
        directory: input.directoryName,
        file: entry.name,
      });
      continue;
    }

    try {
      const parsed = JSON.parse(await readFile(join(directory, entry.name), "utf8"));
      if (!input.isRecord(parsed)) {
        input.logger.warn("legacy_pglite_state_adoption.skipped_invalid_record", {
          phase: input.phase,
          directory: input.directoryName,
          file: entry.name,
        });
        continue;
      }

      records.push(parsed);
    } catch (error) {
      input.logger.warn("legacy_pglite_state_adoption.skipped_unreadable_file", {
        phase: input.phase,
        directory: input.directoryName,
        file: entry.name,
        message: errorMessage(error),
      });
    }
  }

  return records;
}

async function importLegacyRouteState(input: {
  record: ServerAppliedRouteDesiredStateRecord;
  serverAppliedRouteStore: CliServerAppliedRouteStateStore;
}): Promise<void> {
  const target = routeTarget(input.record);
  const upserted = await input.serverAppliedRouteStore.upsertDesired({
    target,
    domains: input.record.domains,
    ...(input.record.sourceFingerprint
      ? { sourceFingerprint: input.record.sourceFingerprint }
      : {}),
    updatedAt: input.record.updatedAt,
  });
  if (upserted.isErr()) {
    throw adoptionError("Legacy server-applied route state could not be imported", {
      routeSetId: input.record.routeSetId,
      errorCode: upserted.error.code,
      phase: upserted.error.details?.phase,
    });
  }

  if (input.record.status === "applied" && input.record.lastApplied) {
    const applied = await input.serverAppliedRouteStore.markApplied({
      target,
      routeSetId: upserted.value.routeSetId,
      deploymentId: input.record.lastApplied.deploymentId,
      updatedAt: input.record.lastApplied.appliedAt,
      ...(input.record.lastApplied.providerKey
        ? { providerKey: input.record.lastApplied.providerKey }
        : {}),
      ...(input.record.lastApplied.proxyKind
        ? { proxyKind: input.record.lastApplied.proxyKind }
        : {}),
    });
    if (applied.isErr()) {
      throw adoptionError("Legacy applied server-applied route state could not be restored", {
        routeSetId: input.record.routeSetId,
        errorCode: applied.error.code,
        phase: applied.error.details?.phase,
      });
    }
    return;
  }

  if (input.record.status === "failed" && input.record.lastFailure) {
    const failed = await input.serverAppliedRouteStore.markFailed({
      target,
      routeSetId: upserted.value.routeSetId,
      deploymentId: input.record.lastFailure.deploymentId,
      updatedAt: input.record.lastFailure.failedAt,
      phase: input.record.lastFailure.phase,
      errorCode: input.record.lastFailure.errorCode,
      retryable: input.record.lastFailure.retryable,
      ...(input.record.lastFailure.message ? { message: input.record.lastFailure.message } : {}),
      ...(input.record.lastFailure.providerKey
        ? { providerKey: input.record.lastFailure.providerKey }
        : {}),
      ...(input.record.lastFailure.proxyKind
        ? { proxyKind: input.record.lastFailure.proxyKind }
        : {}),
    });
    if (failed.isErr()) {
      throw adoptionError("Legacy failed server-applied route state could not be restored", {
        routeSetId: input.record.routeSetId,
        errorCode: failed.error.code,
        phase: failed.error.details?.phase,
      });
    }
  }
}

export async function adoptLegacyPgliteState(
  input: LegacyPgliteStateAdoptionInput,
): Promise<LegacyPgliteStateAdoptionSummary> {
  const dataRoot = dirname(input.pgliteDataDir);
  const legacySourceLinkStore = new FileSystemSourceLinkStore(dataRoot);
  const legacyServerAppliedRouteStore = new FileSystemServerAppliedRouteDesiredStateStore(dataRoot);

  const legacySourceLinks = await listLegacyRecords({
    dataRoot,
    directoryName: "source-links",
    phase: "source-link-resolution",
    enumerateErrorMessage: "Legacy source links could not be enumerated",
    logger: input.logger,
    isRecord: isSourceLinkRecord,
  });
  const legacyRouteStates = await listLegacyRecords({
    dataRoot,
    directoryName: "server-applied-routes",
    phase: "config-domain-resolution",
    enumerateErrorMessage: "Legacy server-applied routes could not be enumerated",
    logger: input.logger,
    isRecord: isServerAppliedRouteRecord,
  });

  if (legacySourceLinks.length === 0 && legacyRouteStates.length === 0) {
    return emptySummary();
  }

  const summary = emptySummary();

  for (const legacySourceLink of legacySourceLinks) {
    const current = await input.sourceLinkStore.read(legacySourceLink.sourceFingerprint);
    if (current.isErr()) {
      throw adoptionError("Existing source link state could not be read", {
        sourceFingerprint: legacySourceLink.sourceFingerprint,
        errorCode: current.error.code,
        phase: current.error.details?.phase,
      });
    }

    if (current.value) {
      summary.prunedSourceLinks += 1;
    } else {
      const created = await input.sourceLinkStore.createIfMissing({
        sourceFingerprint: legacySourceLink.sourceFingerprint,
        target: {
          projectId: legacySourceLink.projectId,
          environmentId: legacySourceLink.environmentId,
          resourceId: legacySourceLink.resourceId,
          ...(legacySourceLink.serverId ? { serverId: legacySourceLink.serverId } : {}),
          ...(legacySourceLink.destinationId
            ? { destinationId: legacySourceLink.destinationId }
            : {}),
        },
        updatedAt: legacySourceLink.updatedAt,
      });
      if (created.isErr()) {
        throw adoptionError("Legacy source link could not be imported", {
          sourceFingerprint: legacySourceLink.sourceFingerprint,
          errorCode: created.error.code,
          phase: created.error.details?.phase,
        });
      }
      summary.importedSourceLinks += 1;
    }

    const removed = await legacySourceLinkStore.unlink(legacySourceLink.sourceFingerprint);
    if (removed.isErr()) {
      throw adoptionError("Legacy source link file could not be pruned", {
        sourceFingerprint: legacySourceLink.sourceFingerprint,
        errorCode: removed.error.code,
        phase: removed.error.details?.phase,
      });
    }
  }

  for (const legacyRouteState of legacyRouteStates) {
    const target = routeTarget(legacyRouteState);
    let shouldImport = true;

    if (legacyRouteState.sourceFingerprint) {
      const linkedSource = await input.sourceLinkStore.read(legacyRouteState.sourceFingerprint);
      if (linkedSource.isErr()) {
        throw adoptionError("Source link for legacy route state could not be read", {
          routeSetId: legacyRouteState.routeSetId,
          sourceFingerprint: legacyRouteState.sourceFingerprint,
          errorCode: linkedSource.error.code,
          phase: linkedSource.error.details?.phase,
        });
      }

      shouldImport = Boolean(
        linkedSource.value && sameTarget(linkedSource.value, legacyRouteState),
      );
    }

    if (shouldImport) {
      const existing = await input.serverAppliedRouteStore.read(target);
      if (existing.isErr()) {
        throw adoptionError("Existing server-applied route state could not be read", {
          routeSetId: legacyRouteState.routeSetId,
          errorCode: existing.error.code,
          phase: existing.error.details?.phase,
        });
      }

      const exactRouteExists = existing.value?.routeSetId === legacyRouteState.routeSetId;
      if (exactRouteExists) {
        summary.prunedServerAppliedRoutes += 1;
      } else {
        await importLegacyRouteState({
          record: legacyRouteState,
          serverAppliedRouteStore: input.serverAppliedRouteStore,
        });
        summary.importedServerAppliedRoutes += 1;
      }
    } else {
      summary.prunedServerAppliedRoutes += 1;
    }

    const removed = await legacyServerAppliedRouteStore.deleteDesired(target);
    if (removed.isErr()) {
      throw adoptionError("Legacy server-applied route file could not be pruned", {
        routeSetId: legacyRouteState.routeSetId,
        errorCode: removed.error.code,
        phase: removed.error.details?.phase,
      });
    }
  }

  input.logger.info("legacy_pglite_state.adopted", {
    dataRoot,
    ...summary,
  });

  return summary;
}
