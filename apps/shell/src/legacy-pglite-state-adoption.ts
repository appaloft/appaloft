import { dirname } from "node:path";
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

  const legacySourceLinksResult = await legacySourceLinkStore.list();
  if (legacySourceLinksResult.isErr()) {
    throw adoptionError("Legacy source links could not be enumerated", {
      errorCode: legacySourceLinksResult.error.code,
      phase: legacySourceLinksResult.error.details?.phase,
    });
  }

  const legacyRouteStatesResult = await legacyServerAppliedRouteStore.list();
  if (legacyRouteStatesResult.isErr()) {
    throw adoptionError("Legacy server-applied routes could not be enumerated", {
      errorCode: legacyRouteStatesResult.error.code,
      phase: legacyRouteStatesResult.error.details?.phase,
    });
  }

  if (legacySourceLinksResult.value.length === 0 && legacyRouteStatesResult.value.length === 0) {
    return emptySummary();
  }

  const summary = emptySummary();

  for (const legacySourceLink of legacySourceLinksResult.value) {
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

  for (const legacyRouteState of legacyRouteStatesResult.value) {
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
