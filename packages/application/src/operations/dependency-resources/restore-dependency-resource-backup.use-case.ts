import {
  DependencyResourceBackupByIdSpec,
  DependencyResourceBackupFailureCode,
  DependencyResourceBackupId,
  DependencyResourceProviderArtifactHandle,
  DependencyResourceRestoreAttemptId,
  DescriptionText,
  domainError,
  err,
  OccurredAt,
  ok,
  ResourceInstanceByIdSpec,
  type Result,
  safeTry,
  UpsertDependencyResourceBackupSpec,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type AppLogger,
  type Clock,
  type DependencyResourceBackupProviderPort,
  type DependencyResourceBackupRepository,
  type DependencyResourceRepository,
  type EventBus,
  type IdGenerator,
} from "../../ports";
import { tokens } from "../../tokens";
import { publishDomainEventsAndReturn } from "../publish-domain-events";
import { type RestoreDependencyResourceBackupCommandInput } from "./restore-dependency-resource-backup.command";

@injectable()
export class RestoreDependencyResourceBackupUseCase {
  constructor(
    @inject(tokens.dependencyResourceRepository)
    private readonly dependencyResourceRepository: DependencyResourceRepository,
    @inject(tokens.dependencyResourceBackupRepository)
    private readonly dependencyResourceBackupRepository: DependencyResourceBackupRepository,
    @inject(tokens.dependencyResourceBackupProvider)
    private readonly dependencyResourceBackupProvider: DependencyResourceBackupProviderPort,
    @inject(tokens.clock)
    private readonly clock: Clock,
    @inject(tokens.idGenerator)
    private readonly idGenerator: IdGenerator,
    @inject(tokens.eventBus)
    private readonly eventBus: EventBus,
    @inject(tokens.logger)
    private readonly logger: AppLogger,
  ) {}

  async execute(
    context: ExecutionContext,
    input: RestoreDependencyResourceBackupCommandInput,
  ): Promise<Result<{ id: string }>> {
    const repositoryContext = toRepositoryContext(context);
    const {
      clock,
      dependencyResourceBackupProvider,
      dependencyResourceBackupRepository,
      dependencyResourceRepository,
      eventBus,
      idGenerator,
      logger,
    } = this;

    return safeTry(async function* () {
      const backupId = yield* DependencyResourceBackupId.create(input.backupId);
      const backup = await dependencyResourceBackupRepository.findOne(
        repositoryContext,
        DependencyResourceBackupByIdSpec.create(backupId),
      );
      if (!backup) {
        return err(domainError.notFound("dependency_resource_backup", backupId.value));
      }
      const backupState = backup.toState();
      const dependencyResource = await dependencyResourceRepository.findOne(
        repositoryContext,
        ResourceInstanceByIdSpec.create(backupState.dependencyResourceId),
      );
      if (!dependencyResource) {
        return err(
          domainError.notFound("dependency_resource", backupState.dependencyResourceId.value),
        );
      }
      yield* dependencyResource.ensureCanRestoreBackup();
      const providerArtifactHandle = backupState.providerArtifactHandle
        ? DependencyResourceProviderArtifactHandle.rehydrate(
            backupState.providerArtifactHandle.value,
          )
        : undefined;
      if (!providerArtifactHandle) {
        return err(
          domainError.dependencyResourceRestoreBlocked("Backup has no restore point", {
            phase: "dependency-resource-restore-admission",
            backupId: backupId.value,
          }),
        );
      }
      const dependencyKind = backupState.dependencyKind.value;
      if (dependencyKind !== "postgres" && dependencyKind !== "redis") {
        return err(
          domainError.dependencyResourceRestoreBlocked("Backup dependency kind is not restorable", {
            phase: "dependency-resource-restore-admission",
            backupId: backupId.value,
            dependencyKind,
          }),
        );
      }
      if (
        !dependencyResourceBackupProvider.supports(backupState.providerKey.value, dependencyKind)
      ) {
        return err(
          domainError.providerCapabilityUnsupported(
            "Provider does not support dependency resource restore",
            {
              phase: "dependency-resource-restore-admission",
              backupId: backupId.value,
              dependencyResourceId: backupState.dependencyResourceId.value,
              dependencyKind,
              providerKey: backupState.providerKey.value,
              operation: "dependency-resources.restore-backup",
            },
          ),
        );
      }

      const restoreAttemptId = DependencyResourceRestoreAttemptId.rehydrate(
        idGenerator.next("dra"),
      );
      const requestedAt = yield* OccurredAt.create(clock.now());
      yield* backup.startRestore({ attemptId: restoreAttemptId, requestedAt });
      await dependencyResourceBackupRepository.upsert(
        repositoryContext,
        backup,
        UpsertDependencyResourceBackupSpec.fromDependencyResourceBackup(backup),
      );
      await publishDomainEventsAndReturn(context, eventBus, logger, backup, undefined);

      const providerResult = await dependencyResourceBackupProvider.restoreBackup(context, {
        backupId: backupId.value,
        dependencyResourceId: backupState.dependencyResourceId.value,
        dependencyKind,
        providerKey: backupState.providerKey.value,
        providerArtifactHandle: providerArtifactHandle.value,
        restoreAttemptId: restoreAttemptId.value,
        requestedAt: requestedAt.value,
      });
      if (providerResult.isOk()) {
        const completedAt = yield* OccurredAt.create(providerResult.value.completedAt);
        yield* backup.markRestoreCompleted({ attemptId: restoreAttemptId, completedAt });
      } else {
        const failedAt = yield* OccurredAt.create(clock.now());
        const failureCode = yield* DependencyResourceBackupFailureCode.create(
          providerResult.error.code,
        );
        yield* backup.markRestoreFailed({
          attemptId: restoreAttemptId,
          failureCode,
          failureMessage: DescriptionText.rehydrate(providerResult.error.message),
          failedAt,
        });
      }

      await dependencyResourceBackupRepository.upsert(
        repositoryContext,
        backup,
        UpsertDependencyResourceBackupSpec.fromDependencyResourceBackup(backup),
      );
      await publishDomainEventsAndReturn(context, eventBus, logger, backup, undefined);
      return ok({ id: restoreAttemptId.value });
    });
  }
}
