import {
  domainError,
  err,
  OccurredAt,
  ok,
  type Result,
  StorageVolumeBackupByIdSpec,
  StorageVolumeBackupId,
  safeTry,
  UpsertStorageVolumeBackupSpec,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import { findOperationCatalogEntryByKey } from "../../operation-catalog";
import { checkOperationGuards } from "../../operation-guard";
import {
  AllowAllOperationGuardPort,
  type AppLogger,
  type Clock,
  type EventBus,
  type OperationGuardPort,
  type PruneStorageVolumeBackupResult,
  type StorageVolumeBackupRepository,
} from "../../ports";
import { tokens } from "../../tokens";
import { publishDomainEventsAndReturn } from "../publish-domain-events";
import { type PruneStorageVolumeBackupCommandInput } from "./prune-storage-volume-backup.command";
import { type StorageBackupProviderRegistryPort } from "./storage-volume-backup-contract";

const pruneStorageVolumeBackupOperation = findOperationCatalogEntryByKey(
  "storage-volumes.prune-backups",
);
const defaultOperationGuardPort = new AllowAllOperationGuardPort();

@injectable()
export class PruneStorageVolumeBackupUseCase {
  constructor(
    @inject(tokens.storageVolumeBackupRepository)
    private readonly storageVolumeBackupRepository: StorageVolumeBackupRepository,
    @inject(tokens.storageVolumeBackupProviderRegistry)
    private readonly providerRegistry: StorageBackupProviderRegistryPort,
    @inject(tokens.clock)
    private readonly clock: Clock,
    @inject(tokens.eventBus)
    private readonly eventBus: EventBus,
    @inject(tokens.logger)
    private readonly logger: AppLogger,
    @inject(tokens.operationGuardPort)
    private readonly operationGuardPort?: OperationGuardPort,
  ) {}

  async execute(
    context: ExecutionContext,
    input: PruneStorageVolumeBackupCommandInput,
  ): Promise<Result<PruneStorageVolumeBackupResult>> {
    const repositoryContext = toRepositoryContext(context);
    const {
      clock,
      eventBus,
      logger,
      operationGuardPort,
      providerRegistry,
      storageVolumeBackupRepository,
    } = this;

    return safeTry(async function* () {
      const backupId = yield* StorageVolumeBackupId.create(input.backupId);
      const backup = await storageVolumeBackupRepository.findOne(
        repositoryContext,
        StorageVolumeBackupByIdSpec.create(backupId),
      );
      if (!backup) {
        return err(domainError.notFound("storage_volume_backup", backupId.value));
      }
      const backupState = backup.toState();
      if (pruneStorageVolumeBackupOperation) {
        const checked = await checkOperationGuards({
          context,
          entry: pruneStorageVolumeBackupOperation,
          message: input,
          operationGuardPort: operationGuardPort ?? defaultOperationGuardPort,
          resourceRefs: {
            projectId: backupState.projectId.value,
            environmentId: backupState.environmentId.value,
            storageVolumeId: backupState.storageVolumeId.value,
            ...(backupState.resourceId ? { resourceId: backupState.resourceId.value } : {}),
          },
        });
        if (checked.isErr()) {
          return err(checked.error);
        }
      }
      const targetProvider = providerRegistry
        .targetProviders()
        .find((provider) => provider.key === backupState.targetProviderKey.value);
      const prunedAt = clock.now();
      if (targetProvider?.prune) {
        const providerResult = await targetProvider.prune({
          backupId: backupId.value,
          requestedAt: prunedAt,
          ...(backupState.artifactHandle
            ? { artifactHandle: backupState.artifactHandle.value }
            : {}),
        });
        if (providerResult.isErr()) {
          return err(providerResult.error);
        }
      }

      yield* backup.prune({ prunedAt: yield* OccurredAt.create(prunedAt) });
      await storageVolumeBackupRepository.upsert(
        repositoryContext,
        backup,
        UpsertStorageVolumeBackupSpec.fromStorageVolumeBackup(backup),
      );
      await publishDomainEventsAndReturn(context, eventBus, logger, backup, undefined);

      return ok({ id: backupId.value, prunedAt });
    });
  }
}
