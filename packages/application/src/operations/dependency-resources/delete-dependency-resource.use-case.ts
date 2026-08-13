import {
  DeletedAt,
  DependencyResourceBackupsByDependencyResourceSpec,
  type DependencyResourceDeleteBlockerState,
  DependencyResourceProviderRealizationAttemptId,
  domainError,
  err,
  OccurredAt,
  ok,
  type ResourceInstance,
  ResourceInstanceByIdSpec,
  ResourceInstanceId,
  type Result,
  safeTry,
  UpsertDependencyResourceBackupSpec,
  UpsertResourceInstanceSpec,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type AppLogger,
  type Clock,
  type DependencyResourceBackupProviderPort,
  type DependencyResourceBackupRepository,
  type DependencyResourceDeleteSafetyReader,
  type DependencyResourceRepository,
  type EventBus,
  type IdGenerator,
  type ManagedDependencyProviderPort,
  type ManagedDependencyResourceKind,
  type ProcessAttemptRecorder,
} from "../../ports";
import { NoopProcessAttemptRecorder } from "../../process-attempt-journal";
import { tokens } from "../../tokens";
import { publishDomainEventsAndReturn } from "../publish-domain-events";
import { type DeleteDependencyResourceCommandInput } from "./delete-dependency-resource.command";

@injectable()
export class DeleteDependencyResourceUseCase {
  constructor(
    @inject(tokens.dependencyResourceRepository)
    private readonly dependencyResourceRepository: DependencyResourceRepository,
    @inject(tokens.dependencyResourceDeleteSafetyReader)
    private readonly dependencyResourceDeleteSafetyReader: DependencyResourceDeleteSafetyReader,
    @inject(tokens.clock)
    private readonly clock: Clock,
    @inject(tokens.idGenerator)
    private readonly idGenerator: IdGenerator,
    @inject(tokens.eventBus)
    private readonly eventBus: EventBus,
    @inject(tokens.logger)
    private readonly logger: AppLogger,
    @inject(tokens.managedDependencyProvider)
    private readonly managedDependencyProvider: ManagedDependencyProviderPort,
    @inject(tokens.processAttemptRecorder)
    private readonly processAttemptRecorder: ProcessAttemptRecorder = new NoopProcessAttemptRecorder(),
    @inject(tokens.dependencyResourceBackupRepository, { isOptional: true })
    private readonly dependencyResourceBackupRepository?: DependencyResourceBackupRepository,
    @inject(tokens.dependencyResourceBackupProvider, { isOptional: true })
    private readonly dependencyResourceBackupProvider?: DependencyResourceBackupProviderPort,
  ) {}

  async execute(
    context: ExecutionContext,
    input: Omit<DeleteDependencyResourceCommandInput, "confirmBackupRetentionRelease"> & {
      confirmBackupRetentionRelease?: boolean;
    },
  ): Promise<Result<{ id: string }>> {
    const repositoryContext = toRepositoryContext(context);
    const {
      clock,
      dependencyResourceDeleteSafetyReader,
      dependencyResourceBackupProvider,
      dependencyResourceBackupRepository,
      dependencyResourceRepository,
      eventBus,
      idGenerator,
      logger,
      managedDependencyProvider,
      processAttemptRecorder,
    } = this;

    return safeTry(async function* () {
      const dependencyResourceId = yield* ResourceInstanceId.create(input.dependencyResourceId);
      const deletedAt = yield* DeletedAt.create(clock.now());
      const dependencyResource = await dependencyResourceRepository.findOne(
        repositoryContext,
        ResourceInstanceByIdSpec.create(dependencyResourceId),
      );
      if (!dependencyResource) {
        return err(domainError.notFound("dependency_resource", dependencyResourceId.value));
      }
      const blockersResult = await dependencyResourceDeleteSafetyReader.findBlockers(
        repositoryContext,
        { dependencyResourceId: dependencyResourceId.value },
      );
      if (blockersResult.isErr()) {
        return err(blockersResult.error);
      }
      let blockers: DependencyResourceDeleteBlockerState[] = blockersResult.value.map(
        (blocker) => ({
          kind: blocker.kind,
          ...(blocker.relatedEntityId ? { relatedEntityId: blocker.relatedEntityId } : {}),
          ...(blocker.relatedEntityType ? { relatedEntityType: blocker.relatedEntityType } : {}),
          ...(blocker.count ? { count: blocker.count } : {}),
        }),
      );
      if (
        input.confirmBackupRetentionRelease === true &&
        blockers.some((blocker) => blocker.kind === "dependency-resource-backup")
      ) {
        if (!dependencyResourceBackupRepository || !dependencyResourceBackupProvider?.pruneBackup) {
          return err(
            domainError.providerCapabilityUnsupported(
              "Dependency backup retention release is not configured",
              {
                phase: "dependency-resource-backup-retention-release",
                dependencyResourceId: dependencyResourceId.value,
              },
            ),
          );
        }
        const backups = await dependencyResourceBackupRepository.findMany(
          repositoryContext,
          DependencyResourceBackupsByDependencyResourceSpec.create(dependencyResourceId),
        );
        for (const backup of backups) {
          const backupState = backup.toState();
          if (!backupState.retentionStatus.blocksDelete()) continue;
          if (
            backupState.dependencyKind.value !== "postgres" &&
            backupState.dependencyKind.value !== "redis"
          ) {
            return err(
              domainError.providerCapabilityUnsupported("Dependency backup kind cannot be pruned", {
                phase: "dependency-resource-backup-retention-release",
                backupId: backupState.id.value,
                dependencyKind: backupState.dependencyKind.value,
              }),
            );
          }
          const prunedAt = clock.now();
          const pruned = await dependencyResourceBackupProvider.pruneBackup(context, {
            backupId: backupState.id.value,
            dependencyResourceId: dependencyResourceId.value,
            dependencyKind: backupState.dependencyKind.value,
            providerKey: backupState.providerKey.value,
            ...(backupState.providerArtifactHandle
              ? { providerArtifactHandle: backupState.providerArtifactHandle.value }
              : {}),
            requestedAt: prunedAt,
          });
          if (pruned.isErr()) return err(pruned.error);
          yield* backup.releaseRetention({ releasedAt: yield* OccurredAt.create(prunedAt) });
          await dependencyResourceBackupRepository.upsert(
            repositoryContext,
            backup,
            UpsertDependencyResourceBackupSpec.fromDependencyResourceBackup(backup),
          );
          await publishDomainEventsAndReturn(context, eventBus, logger, backup, undefined);
        }
        blockers = blockers.filter((blocker) => blocker.kind !== "dependency-resource-backup");
      }
      const dependencyState = dependencyResource.toState();
      const dependencyKind = isManagedDependencyResourceKind(dependencyState.kind.value)
        ? dependencyState.kind.value
        : undefined;
      const shouldDeleteProviderManagedDependency =
        dependencyState.providerManaged === true &&
        dependencyState.sourceMode?.value === "appaloft-managed" &&
        blockers.length === 0 &&
        (!dependencyState.backupRelationship?.retentionRequired ||
          input.confirmBackupRetentionRelease);

      let allowProviderManaged = false;
      if (shouldDeleteProviderManagedDependency && dependencyKind) {
        const providerRealization = dependencyState.providerRealization;
        if (
          (providerRealization?.status.value === "ready" ||
            providerRealization?.status.value === "delete-pending") &&
          providerRealization.providerResourceHandle
        ) {
          let attemptId = providerRealization.attemptId;
          let requestedAt = providerRealization.attemptedAt;
          if (providerRealization.status.value === "ready") {
            attemptId = DependencyResourceProviderRealizationAttemptId.rehydrate(
              idGenerator.next("dpd"),
            );
            requestedAt = yield* OccurredAt.create(clock.now());
            yield* dependencyResource.markProviderDeleteRequested({ attemptId, requestedAt });
            await dependencyResourceRepository.upsert(
              repositoryContext,
              dependencyResource,
              UpsertResourceInstanceSpec.fromResourceInstance(dependencyResource),
            );
          }
          await recordProviderDeleteProcessAttempt({
            recorder: processAttemptRecorder,
            repositoryContext,
            context,
            dependencyResource,
          });
          await publishDomainEventsAndReturn(
            context,
            eventBus,
            logger,
            dependencyResource,
            undefined,
          );
          const providerDelete = await managedDependencyProvider.delete(context, {
            dependencyResourceId: dependencyResourceId.value,
            kind: dependencyKind,
            providerKey: dependencyState.providerKey.value,
            providerResourceHandle: providerRealization.providerResourceHandle.value,
            attemptId: attemptId.value,
            requestedAt: requestedAt.value,
          });
          if (providerDelete.isErr()) {
            if (providerDelete.error.code === "not_found") {
              allowProviderManaged = true;
            } else {
              await recordProviderDeleteProcessAttempt({
                recorder: processAttemptRecorder,
                repositoryContext,
                context,
                dependencyResource,
                failureCode: providerDelete.error.code,
              });
              return err(providerDelete.error);
            }
          } else {
            allowProviderManaged = true;
          }
        }
      }

      yield* dependencyResource.delete({
        deletedAt,
        blockers,
        allowProviderManaged,
        allowBackupRetentionRelease: input.confirmBackupRetentionRelease === true,
      });
      await dependencyResourceRepository.upsert(
        repositoryContext,
        dependencyResource,
        UpsertResourceInstanceSpec.fromResourceInstance(dependencyResource),
      );
      await recordProviderDeleteProcessAttempt({
        recorder: processAttemptRecorder,
        repositoryContext,
        context,
        dependencyResource,
      });
      await publishDomainEventsAndReturn(context, eventBus, logger, dependencyResource, undefined);
      return ok({ id: dependencyResourceId.value });
    });
  }
}

function isManagedDependencyResourceKind(input: string): input is ManagedDependencyResourceKind {
  return (
    input === "postgres" ||
    input === "redis" ||
    input === "mysql" ||
    input === "clickhouse" ||
    input === "object-storage" ||
    input === "opensearch"
  );
}

async function recordProviderDeleteProcessAttempt(input: {
  recorder: ProcessAttemptRecorder;
  repositoryContext: ReturnType<typeof toRepositoryContext>;
  context: ExecutionContext;
  dependencyResource: ResourceInstance;
  failureCode?: string;
}): Promise<void> {
  const state = input.dependencyResource.toState();
  const realization = state.providerRealization;
  if (!realization || realization.status.value === "ready") {
    return;
  }
  const realizationStatus = realization.status.value;
  const failed = Boolean(input.failureCode);
  const status =
    realizationStatus === "delete-pending" && !failed ? "running" : failed ? "failed" : "succeeded";
  const result = await input.recorder.record(input.repositoryContext, {
    id: realization.attemptId.value,
    kind: "system",
    status,
    operationKey: "dependency-resources.delete",
    dedupeKey: `dependency-resource-provider-delete:${state.id.value}:${realization.attemptId.value}`,
    correlationId: input.context.requestId,
    requestId: input.context.requestId,
    phase: "dependency-resource-provider-delete",
    step: realizationStatus,
    ...(state.projectId ? { projectId: state.projectId.value } : {}),
    startedAt: realization.attemptedAt.value,
    updatedAt: realization.attemptedAt.value,
    ...(status !== "running" ? { finishedAt: realization.attemptedAt.value } : {}),
    ...(failed
      ? {
          errorCode: input.failureCode,
          errorCategory: "async-processing",
          retriable: true,
        }
      : {}),
    nextActions: status === "failed" ? ["diagnostic", "manual-review"] : ["no-action"],
    safeDetails: {
      dependencyResourceId: state.id.value,
      dependencyKind: state.kind.value,
      providerKey: state.providerKey.value,
      providerManaged: state.providerManaged === true,
      realizationStatus,
    },
  });

  void result;
}
