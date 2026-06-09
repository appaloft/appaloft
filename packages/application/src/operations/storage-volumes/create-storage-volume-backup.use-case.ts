import {
  CreatedAt,
  DeploymentTargetByIdSpec,
  DeploymentTargetId,
  type DeploymentTargetState,
  DescriptionText,
  domainError,
  EnvironmentId,
  err,
  OccurredAt,
  ok,
  ProjectId,
  ResourceId,
  type Result,
  StorageVolumeBackup,
  StorageVolumeBackupArtifactHandle,
  StorageVolumeBackupAttemptId,
  StorageVolumeBackupConsistencyLevelValue,
  StorageVolumeBackupFailureCode,
  StorageVolumeBackupId,
  StorageVolumeBackupRetentionStatusValue,
  StorageVolumeBackupSourceAdapterKeyValue,
  StorageVolumeBackupTargetProviderKeyValue,
  StorageVolumeByIdSpec,
  StorageVolumeId,
  safeTry,
  UpsertStorageVolumeBackupSpec,
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
import { type CreateStorageVolumeBackupCommandInput } from "./create-storage-volume-backup.command";
import {
  planStorageVolumeBackup,
  type StorageBackupProviderRegistryPort,
  type StorageBackupSourceDescriptor,
  storageBackupUnsupportedError,
} from "./storage-volume-backup-contract";

const createStorageVolumeBackupOperation = findOperationCatalogEntryByKey(
  "storage-volumes.create-backup",
);
const defaultOperationGuardPort = new AllowAllOperationGuardPort();

async function resolveStorageBackupRuntimeTarget(input: {
  repositoryContext: RepositoryContext;
  source: StorageBackupSourceDescriptor;
  deploymentReadModel: DeploymentReadModel;
  serverRepository: ServerRepository;
}): Promise<Result<DeploymentTargetState | undefined>> {
  const serverId =
    input.source.serverId ??
    (input.source.resourceId && input.deploymentReadModel?.list
      ? (
          await input.deploymentReadModel.list(input.repositoryContext, {
            resourceId: input.source.resourceId,
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
export class CreateStorageVolumeBackupUseCase {
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
    input: CreateStorageVolumeBackupCommandInput,
  ): Promise<Result<{ id: string }>> {
    const repositoryContext = toRepositoryContext(context);
    const {
      clock,
      eventBus,
      idGenerator,
      logger,
      operationGuardPort,
      providerRegistry,
      deploymentReadModel,
      serverRepository,
      storageVolumeBackupRepository,
      storageVolumeRepository,
    } = this;

    return safeTry(async function* () {
      const storageVolumeId = yield* StorageVolumeId.create(input.storageVolumeId);
      if (input.planRequest.source.storageVolumeId !== storageVolumeId.value) {
        return err(
          domainError.validation(
            "Backup source storageVolumeId must match the route storageVolumeId",
            {
              phase: "storage-volume-backup-admission",
              storageVolumeId: storageVolumeId.value,
              sourceStorageVolumeId: input.planRequest.source.storageVolumeId,
            },
          ),
        );
      }
      const storageVolume = await storageVolumeRepository.findOne(
        repositoryContext,
        StorageVolumeByIdSpec.create(storageVolumeId),
      );
      if (!storageVolume) {
        return err(domainError.notFound("storage_volume", storageVolumeId.value));
      }
      const storageVolumeState = storageVolume.toState();
      if (storageVolumeState.lifecycleStatus.isDeleted()) {
        return err(
          domainError.conflict("storage_volume_deleted", {
            phase: "storage-volume-backup-admission",
            storageVolumeId: storageVolumeId.value,
          }),
        );
      }

      if (createStorageVolumeBackupOperation) {
        const checked = await checkOperationGuards({
          context,
          entry: createStorageVolumeBackupOperation,
          message: input,
          operationGuardPort: operationGuardPort ?? defaultOperationGuardPort,
          resourceRefs: {
            projectId: storageVolumeState.projectId.value,
            environmentId: storageVolumeState.environmentId.value,
            storageVolumeId: storageVolumeId.value,
            ...(input.planRequest.source.resourceId
              ? { resourceId: input.planRequest.source.resourceId }
              : {}),
          },
        });
        if (checked.isErr()) {
          return err(checked.error);
        }
      }

      const plan = yield* planStorageVolumeBackup(input.planRequest, {
        sourceAdapters: providerRegistry.sourceAdapters(),
        targetProviders: providerRegistry.targetProviders(),
      });
      if (plan.blockers.length > 0 || plan.sourceAdapterKey === "unsupported") {
        return err(storageBackupUnsupportedError(plan));
      }

      const sourceAdapter = providerRegistry
        .sourceAdapters()
        .find((adapter) => adapter.key === plan.sourceAdapterKey);
      const targetProvider = providerRegistry
        .targetProviders()
        .find((provider) => provider.key === plan.targetProviderKey);
      if (!sourceAdapter?.createBackup || !targetProvider?.store) {
        return err(storageBackupUnsupportedError(plan));
      }

      const runtimeTarget = yield* await resolveStorageBackupRuntimeTarget({
        repositoryContext,
        source: input.planRequest.source,
        deploymentReadModel,
        serverRepository,
      });

      const backupId = StorageVolumeBackupId.rehydrate(idGenerator.next("svb"));
      const attemptId = StorageVolumeBackupAttemptId.rehydrate(idGenerator.next("sba"));
      const requestedAt = yield* OccurredAt.create(clock.now());
      const createdAt = yield* CreatedAt.create(clock.now());
      const backup = yield* StorageVolumeBackup.createPending({
        id: backupId,
        storageVolumeId,
        projectId: ProjectId.rehydrate(storageVolumeState.projectId.value),
        environmentId: EnvironmentId.rehydrate(storageVolumeState.environmentId.value),
        ...(input.planRequest.source.resourceId
          ? { resourceId: ResourceId.rehydrate(input.planRequest.source.resourceId) }
          : {}),
        storageVolumeKind: storageVolumeState.kind,
        sourceAdapterKey: yield* StorageVolumeBackupSourceAdapterKeyValue.create(
          plan.sourceAdapterKey,
        ),
        targetProviderKey: yield* StorageVolumeBackupTargetProviderKeyValue.create(
          plan.targetProviderKey,
        ),
        targetRef: DescriptionText.rehydrate(input.planRequest.target.targetRef),
        consistency: yield* StorageVolumeBackupConsistencyLevelValue.create(plan.consistency),
        attemptId,
        requestedAt,
        localOnly: plan.localOnly,
        createdAt,
      });

      await storageVolumeBackupRepository.upsert(
        repositoryContext,
        backup,
        UpsertStorageVolumeBackupSpec.fromStorageVolumeBackup(backup),
      );
      await publishDomainEventsAndReturn(context, eventBus, logger, backup, undefined);

      const sourceResult = await sourceAdapter.createBackup({
        backupId: backupId.value,
        attemptId: attemptId.value,
        requestedAt: requestedAt.value,
        plan,
        source: input.planRequest.source,
        ...(runtimeTarget ? { runtimeTarget } : {}),
      });
      if (sourceResult.isOk()) {
        const targetResult = await targetProvider.store({
          backupId: backupId.value,
          attemptId: attemptId.value,
          requestedAt: requestedAt.value,
          plan,
          target: input.planRequest.target,
          sourceResult: sourceResult.value,
          ...(runtimeTarget ? { runtimeTarget } : {}),
        });
        if (targetResult.isOk()) {
          const completedAt = yield* OccurredAt.create(targetResult.value.completedAt);
          const artifactHandle = yield* StorageVolumeBackupArtifactHandle.create(
            targetResult.value.artifactHandle,
          );
          yield* backup.markReady({
            artifactHandle,
            completedAt,
            retentionStatus:
              targetResult.value.retentionStatus === "none"
                ? StorageVolumeBackupRetentionStatusValue.none()
                : StorageVolumeBackupRetentionStatusValue.retained(),
            ...(targetResult.value.sizeBytes !== undefined
              ? { sizeBytes: targetResult.value.sizeBytes }
              : {}),
            ...(targetResult.value.checksum
              ? { checksum: DescriptionText.rehydrate(targetResult.value.checksum) }
              : {}),
          });
        } else {
          yield* backup.markFailed({
            failureCode: yield* StorageVolumeBackupFailureCode.create(targetResult.error.code),
            failureMessage: DescriptionText.rehydrate(targetResult.error.message),
            failedAt: yield* OccurredAt.create(clock.now()),
          });
        }
      } else {
        yield* backup.markFailed({
          failureCode: yield* StorageVolumeBackupFailureCode.create(sourceResult.error.code),
          failureMessage: DescriptionText.rehydrate(sourceResult.error.message),
          failedAt: yield* OccurredAt.create(clock.now()),
        });
      }

      await storageVolumeBackupRepository.upsert(
        repositoryContext,
        backup,
        UpsertStorageVolumeBackupSpec.fromStorageVolumeBackup(backup),
      );
      await publishDomainEventsAndReturn(context, eventBus, logger, backup, undefined);

      return ok({ id: backupId.value });
    });
  }
}
