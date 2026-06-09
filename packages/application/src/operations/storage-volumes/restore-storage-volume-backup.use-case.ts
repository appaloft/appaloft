import {
  CreatedAt,
  DeploymentTargetByIdSpec,
  DeploymentTargetId,
  type DeploymentTargetState,
  DescriptionText,
  domainError,
  err,
  OccurredAt,
  ok,
  type Result,
  StorageVolume,
  StorageVolumeBackupByIdSpec,
  StorageVolumeBackupFailureCode,
  StorageVolumeBackupId,
  StorageVolumeByIdSpec,
  StorageVolumeId,
  StorageVolumeKindValue,
  StorageVolumeName,
  StorageVolumeRestoreAttemptId,
  safeTry,
  UpsertStorageVolumeBackupSpec,
  UpsertStorageVolumeSpec,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import {
  type ExecutionContext,
  type RepositoryContext,
  toRepositoryContext,
} from "../../execution-context";
import { findOperationCatalogEntryByKey } from "../../operation-catalog";
import { checkOperationGuards } from "../../operation-guard";
import {
  AllowAllOperationGuardPort,
  type AppLogger,
  type Clock,
  type DeploymentReadModel,
  type EventBus,
  type IdGenerator,
  type OperationGuardPort,
  type ServerRepository,
  type StorageVolumeBackupRepository,
  type StorageVolumeRepository,
} from "../../ports";
import { tokens } from "../../tokens";
import { publishDomainEventsAndReturn } from "../publish-domain-events";
import { type RestoreStorageVolumeBackupCommandInput } from "./restore-storage-volume-backup.command";
import { type StorageBackupProviderRegistryPort } from "./storage-volume-backup-contract";

const restoreStorageVolumeBackupOperation = findOperationCatalogEntryByKey(
  "storage-volumes.restore-backup",
);
const defaultOperationGuardPort = new AllowAllOperationGuardPort();

async function resolveStorageBackupRestoreRuntimeTarget(input: {
  repositoryContext: RepositoryContext;
  resourceId?: string;
  fallbackServerId?: string;
  deploymentReadModel: DeploymentReadModel;
  serverRepository: ServerRepository;
}): Promise<Result<DeploymentTargetState | undefined>> {
  const serverId =
    input.fallbackServerId ??
    (input.resourceId && input.deploymentReadModel?.list
      ? (
          await input.deploymentReadModel.list(input.repositoryContext, {
            resourceId: input.resourceId,
            limit: 1,
          })
        )[0]?.serverId
      : undefined);

  if (!serverId) {
    return ok(undefined);
  }

  const parsedServerId = DeploymentTargetId.create(serverId);
  if (parsedServerId.isErr()) {
    return err(parsedServerId.error);
  }

  const server = await input.serverRepository.findOne(
    input.repositoryContext,
    DeploymentTargetByIdSpec.create(parsedServerId.value),
  );
  if (!server) {
    return err(domainError.notFound("server", parsedServerId.value.value));
  }

  return ok(server.toState());
}

@injectable()
export class RestoreStorageVolumeBackupUseCase {
  constructor(
    @inject(tokens.storageVolumeRepository)
    private readonly storageVolumeRepository: StorageVolumeRepository,
    @inject(tokens.storageVolumeBackupRepository)
    private readonly storageVolumeBackupRepository: StorageVolumeBackupRepository,
    @inject(tokens.storageVolumeBackupProviderRegistry)
    private readonly providerRegistry: StorageBackupProviderRegistryPort,
    @inject(tokens.deploymentReadModel)
    private readonly deploymentReadModel: DeploymentReadModel,
    @inject(tokens.serverRepository)
    private readonly serverRepository: ServerRepository,
    @inject(tokens.clock)
    private readonly clock: Clock,
    @inject(tokens.idGenerator)
    private readonly idGenerator: IdGenerator,
    @inject(tokens.eventBus)
    private readonly eventBus: EventBus,
    @inject(tokens.logger)
    private readonly logger: AppLogger,
    @inject(tokens.operationGuardPort)
    private readonly operationGuardPort?: OperationGuardPort,
  ) {}

  async execute(
    context: ExecutionContext,
    input: RestoreStorageVolumeBackupCommandInput,
  ): Promise<Result<{ id: string; restoredStorageVolumeId?: string }>> {
    const repositoryContext = toRepositoryContext(context);
    const {
      clock,
      deploymentReadModel,
      eventBus,
      idGenerator,
      logger,
      operationGuardPort,
      providerRegistry,
      serverRepository,
      storageVolumeBackupRepository,
      storageVolumeRepository,
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
      if (restoreStorageVolumeBackupOperation) {
        const checked = await checkOperationGuards({
          context,
          entry: restoreStorageVolumeBackupOperation,
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
      if (input.targetMode === "in-place") {
        return err(
          domainError.conflict("storage_volume_restore_in_place_not_enabled", {
            phase: "storage-volume-restore-admission",
            backupId: backupId.value,
            acknowledgeDestructiveRestore: input.acknowledgeDestructiveRestore === true,
          }),
        );
      }
      if (!backupState.artifactHandle) {
        return err(
          domainError.conflict("storage_volume_backup_has_no_restore_point", {
            phase: "storage-volume-restore-admission",
            backupId: backupId.value,
          }),
        );
      }

      const sourceStorageVolume = await storageVolumeRepository.findOne(
        repositoryContext,
        StorageVolumeByIdSpec.create(backupState.storageVolumeId),
      );
      if (!sourceStorageVolume) {
        return err(domainError.notFound("storage_volume", backupState.storageVolumeId.value));
      }
      const sourceVolumeState = sourceStorageVolume.toState();
      const restoredVolumeId = StorageVolumeId.rehydrate(idGenerator.next("stv"));
      const restoredVolumeName = yield* StorageVolumeName.create(
        input.restoredVolumeName ??
          `Restore ${backupState.storageVolumeId.value} ${backupId.value}`,
      );
      const restoredVolume = yield* StorageVolume.create({
        id: restoredVolumeId,
        projectId: backupState.projectId,
        environmentId: backupState.environmentId,
        name: restoredVolumeName,
        kind: StorageVolumeKindValue.rehydrate(sourceVolumeState.kind.value),
        ...(sourceVolumeState.description
          ? { description: DescriptionText.rehydrate(sourceVolumeState.description.value) }
          : {}),
        createdAt: yield* CreatedAt.create(clock.now()),
      });

      const restoreAttemptId = StorageVolumeRestoreAttemptId.rehydrate(idGenerator.next("sra"));
      const requestedAt = yield* OccurredAt.create(clock.now());
      yield* backup.startRestore({
        attemptId: restoreAttemptId,
        requestedAt,
        target: {
          storageVolumeId: restoredVolumeId,
          destructiveInPlace: false,
        },
      });
      await storageVolumeBackupRepository.upsert(
        repositoryContext,
        backup,
        UpsertStorageVolumeBackupSpec.fromStorageVolumeBackup(backup),
      );
      await publishDomainEventsAndReturn(context, eventBus, logger, backup, undefined);

      const targetProvider = providerRegistry
        .targetProviders()
        .find((provider) => provider.key === backupState.targetProviderKey.value);
      if (!targetProvider?.restore) {
        return err(
          domainError.providerCapabilityUnsupported(
            "Backup target provider cannot restore storage volume artifacts",
            {
              phase: "storage-volume-restore-admission",
              backupId: backupId.value,
              targetProviderKey: backupState.targetProviderKey.value,
            },
          ),
        );
      }
      const runtimeTarget = yield* await resolveStorageBackupRestoreRuntimeTarget({
        repositoryContext,
        ...(backupState.resourceId ? { resourceId: backupState.resourceId.value } : {}),
        deploymentReadModel,
        serverRepository,
      });
      const restoreResult = await targetProvider.restore({
        backupId: backupId.value,
        restoreAttemptId: restoreAttemptId.value,
        requestedAt: requestedAt.value,
        artifactHandle: backupState.artifactHandle.value,
        targetStorageVolumeId: restoredVolumeId.value,
        ...(runtimeTarget ? { runtimeTarget } : {}),
      });
      if (restoreResult.isOk()) {
        await storageVolumeRepository.upsert(
          repositoryContext,
          restoredVolume,
          UpsertStorageVolumeSpec.fromStorageVolume(restoredVolume),
        );
        yield* backup.markRestoreCompleted({
          attemptId: restoreAttemptId,
          completedAt: yield* OccurredAt.create(restoreResult.value.restoredAt),
          restoredVolumeId,
        });
      } else {
        yield* backup.markRestoreFailed({
          attemptId: restoreAttemptId,
          failureCode: yield* StorageVolumeBackupFailureCode.create(restoreResult.error.code),
          failureMessage: DescriptionText.rehydrate(restoreResult.error.message),
          failedAt: yield* OccurredAt.create(clock.now()),
        });
      }

      await storageVolumeBackupRepository.upsert(
        repositoryContext,
        backup,
        UpsertStorageVolumeBackupSpec.fromStorageVolumeBackup(backup),
      );
      await publishDomainEventsAndReturn(context, eventBus, logger, backup, undefined);

      return ok({
        id: backupId.value,
        ...(restoreResult.isOk() ? { restoredStorageVolumeId: restoredVolumeId.value } : {}),
      });
    });
  }
}
