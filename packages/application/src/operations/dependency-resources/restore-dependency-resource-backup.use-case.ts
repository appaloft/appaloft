import {
  type DependencyResourceBackup,
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
  type DependencyResourceSecretStore,
  type EventBus,
  type IdGenerator,
  type ProcessAttemptClaimer,
  type ProcessAttemptCompleter,
  type ProcessAttemptRecorder,
} from "../../ports";
import {
  EmptyProcessAttemptClaimer,
  EmptyProcessAttemptCompleter,
  NoopProcessAttemptRecorder,
} from "../../process-attempt-journal";
import { tokens } from "../../tokens";
import { publishDomainEventsAndReturn } from "../publish-domain-events";
import {
  dependencyResourceProviderConnectionContext,
  dependencyResourceProviderResourceHandle,
} from "./dependency-resource-provider-context";
import { type RestoreDependencyResourceBackupCommandInput } from "./restore-dependency-resource-backup.command";

const appaloftOwnedDependencySecretRefPrefix = "appaloft://dependency-resources/";

function isAppaloftOwnedDependencySecretRef(secretRef: string): boolean {
  return secretRef.startsWith(appaloftOwnedDependencySecretRefPrefix);
}

@injectable()
export class RestoreDependencyResourceBackupUseCase {
  constructor(
    @inject(tokens.dependencyResourceRepository)
    private readonly dependencyResourceRepository: DependencyResourceRepository,
    @inject(tokens.dependencyResourceBackupRepository)
    private readonly dependencyResourceBackupRepository: DependencyResourceBackupRepository,
    @inject(tokens.dependencyResourceBackupProvider)
    private readonly dependencyResourceBackupProvider: DependencyResourceBackupProviderPort,
    @inject(tokens.dependencyResourceSecretStore)
    private readonly dependencyResourceSecretStore: DependencyResourceSecretStore,
    @inject(tokens.clock)
    private readonly clock: Clock,
    @inject(tokens.idGenerator)
    private readonly idGenerator: IdGenerator,
    @inject(tokens.eventBus)
    private readonly eventBus: EventBus,
    @inject(tokens.logger)
    private readonly logger: AppLogger,
    @inject(tokens.processAttemptRecorder)
    private readonly processAttemptRecorder: ProcessAttemptRecorder = new NoopProcessAttemptRecorder(),
    @inject(tokens.processAttemptClaimer)
    private readonly processAttemptClaimer: ProcessAttemptClaimer = new EmptyProcessAttemptClaimer(),
    @inject(tokens.processAttemptCompleter)
    private readonly processAttemptCompleter: ProcessAttemptCompleter = new EmptyProcessAttemptCompleter(),
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
      dependencyResourceSecretStore,
      eventBus,
      idGenerator,
      logger,
      processAttemptRecorder,
      processAttemptClaimer,
      processAttemptCompleter,
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
      const dependencyState = dependencyResource.toState();
      const connectionSecretValue =
        dependencyState.connectionSecretRef &&
        isAppaloftOwnedDependencySecretRef(dependencyState.connectionSecretRef.value)
          ? await dependencyResourceSecretStore.resolve(context, {
              secretRef: dependencyState.connectionSecretRef.value,
            })
          : undefined;
      if (connectionSecretValue?.isErr()) {
        return err(connectionSecretValue.error);
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
      const claimResult = await claimRestoreProcessAttempt({
        recorder: processAttemptRecorder,
        claimer: processAttemptClaimer,
        completer: processAttemptCompleter,
        repositoryContext,
        context,
        backup,
        restoreAttemptId: restoreAttemptId.value,
        claimedAt: requestedAt.value,
      });
      if (claimResult.isErr()) {
        return err(claimResult.error);
      }
      if (!claimResult.value.claimed) {
        await recordRestoreProcessAttempt({
          recorder: processAttemptRecorder,
          repositoryContext,
          context,
          backup,
          restoreAttemptId: restoreAttemptId.value,
        });
      }
      await publishDomainEventsAndReturn(context, eventBus, logger, backup, undefined);

      const providerResourceHandle = dependencyResourceProviderResourceHandle(dependencyState);
      const providerConnection = dependencyResourceProviderConnectionContext(dependencyState);
      const providerResult = await dependencyResourceBackupProvider.restoreBackup(context, {
        backupId: backupId.value,
        dependencyResourceId: backupState.dependencyResourceId.value,
        dependencyKind,
        providerKey: backupState.providerKey.value,
        providerArtifactHandle: providerArtifactHandle.value,
        ...(providerResourceHandle ? { providerResourceHandle } : {}),
        ...(providerConnection ? { connection: providerConnection } : {}),
        ...(connectionSecretValue?.isOk()
          ? { connectionSecretValue: connectionSecretValue.value.secretValue }
          : {}),
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
      if (claimResult.value.claimed) {
        const completed = await completeRestoreProcessAttempt({
          completer: processAttemptCompleter,
          repositoryContext,
          backup,
          restoreAttemptId: restoreAttemptId.value,
        });
        if (completed.isErr()) {
          return err(completed.error);
        }
      } else {
        await recordRestoreProcessAttempt({
          recorder: processAttemptRecorder,
          repositoryContext,
          context,
          backup,
          restoreAttemptId: restoreAttemptId.value,
        });
      }
      await publishDomainEventsAndReturn(context, eventBus, logger, backup, undefined);
      return ok({ id: restoreAttemptId.value });
    });
  }
}

function processAttemptRecorderUsesAtomicClaim(input: {
  claimer: ProcessAttemptClaimer;
  completer: ProcessAttemptCompleter;
}): boolean {
  return (
    !(input.claimer instanceof EmptyProcessAttemptClaimer) &&
    !(input.completer instanceof EmptyProcessAttemptCompleter)
  );
}

async function claimRestoreProcessAttempt(input: {
  recorder: ProcessAttemptRecorder;
  claimer: ProcessAttemptClaimer;
  completer: ProcessAttemptCompleter;
  repositoryContext: ReturnType<typeof toRepositoryContext>;
  context: ExecutionContext;
  backup: DependencyResourceBackup;
  restoreAttemptId: string;
  claimedAt: string;
}): Promise<Result<{ claimed: boolean }>> {
  if (
    !processAttemptRecorderUsesAtomicClaim({
      claimer: input.claimer,
      completer: input.completer,
    })
  ) {
    return ok({ claimed: false });
  }

  const state = input.backup.toState();
  const restore = state.latestRestoreAttempt;
  if (!restore || restore.attemptId.value !== input.restoreAttemptId) {
    return ok({ claimed: false });
  }

  const recorded = await input.recorder.record(input.repositoryContext, {
    id: restore.attemptId.value,
    kind: "system",
    status: "pending",
    operationKey: "dependency-resources.restore-backup",
    dedupeKey: `dependency-resource-restore:${state.dependencyResourceId.value}:${state.id.value}:${restore.attemptId.value}`,
    correlationId: input.context.requestId,
    requestId: input.context.requestId,
    phase: "dependency-resource-restore",
    step: restore.status.value,
    projectId: state.projectId.value,
    startedAt: restore.requestedAt.value,
    updatedAt: restore.requestedAt.value,
    nextActions: ["no-action"],
    safeDetails: {
      backupId: state.id.value,
      dependencyResourceId: state.dependencyResourceId.value,
      dependencyKind: state.dependencyKind.value,
      providerKey: state.providerKey.value,
      restoreAttemptId: restore.attemptId.value,
    },
  });
  if (recorded.isErr()) {
    return err(recorded.error);
  }

  const claimed = await input.claimer.claimDue(input.repositoryContext, {
    attemptId: restore.attemptId.value,
    workerId: "dependency-resource-restore-inline-provider",
    claimedAt: input.claimedAt,
    safeDetails: {
      backupId: state.id.value,
      dependencyResourceId: state.dependencyResourceId.value,
      dependencyKind: state.dependencyKind.value,
      providerKey: state.providerKey.value,
      restoreAttemptId: restore.attemptId.value,
    },
  });
  if (claimed.isErr()) {
    return err(claimed.error);
  }
  if (claimed.value.status !== "claimed") {
    return err(
      domainError.conflict("Dependency resource restore process attempt could not be claimed", {
        phase: "dependency-resource-restore",
        backupId: state.id.value,
        processAttemptId: restore.attemptId.value,
        claimStatus: claimed.value.status,
      }),
    );
  }

  return ok({ claimed: true });
}

async function completeRestoreProcessAttempt(input: {
  completer: ProcessAttemptCompleter;
  repositoryContext: ReturnType<typeof toRepositoryContext>;
  backup: DependencyResourceBackup;
  restoreAttemptId: string;
}): Promise<Result<void>> {
  const state = input.backup.toState();
  const restore = state.latestRestoreAttempt;
  if (!restore || restore.attemptId.value !== input.restoreAttemptId) {
    return ok(undefined);
  }

  const completedAt =
    restore.completedAt?.value ?? restore.failedAt?.value ?? restore.requestedAt.value;
  const status = restore.status.value === "completed" ? "succeeded" : "failed";
  const completed = await input.completer.complete(input.repositoryContext, {
    attemptId: restore.attemptId.value,
    status,
    completedAt,
    phase: "dependency-resource-restore",
    step: restore.status.value,
    ...(restore.failureCode
      ? {
          errorCode: restore.failureCode.value,
          errorCategory: "async-processing",
          retriable: true,
        }
      : {}),
    nextActions: status === "failed" ? ["diagnostic", "manual-review"] : ["no-action"],
    safeDetails: {
      backupId: state.id.value,
      dependencyResourceId: state.dependencyResourceId.value,
      dependencyKind: state.dependencyKind.value,
      providerKey: state.providerKey.value,
      restoreAttemptId: restore.attemptId.value,
    },
  });
  if (completed.isErr()) {
    return err(completed.error);
  }
  if (completed.value.status !== "completed") {
    return err(
      domainError.conflict("Dependency resource restore process attempt could not be completed", {
        phase: "dependency-resource-restore",
        backupId: state.id.value,
        processAttemptId: restore.attemptId.value,
        completionStatus: completed.value.status,
      }),
    );
  }

  return ok(undefined);
}

async function recordRestoreProcessAttempt(input: {
  recorder: ProcessAttemptRecorder;
  repositoryContext: ReturnType<typeof toRepositoryContext>;
  context: ExecutionContext;
  backup: DependencyResourceBackup;
  restoreAttemptId: string;
}): Promise<void> {
  const state = input.backup.toState();
  const restore = state.latestRestoreAttempt;
  if (!restore || restore.attemptId.value !== input.restoreAttemptId) {
    return;
  }

  const status =
    restore.status.value === "pending"
      ? "running"
      : restore.status.value === "completed"
        ? "succeeded"
        : "failed";
  const result = await input.recorder.record(input.repositoryContext, {
    id: restore.attemptId.value,
    kind: "system",
    status,
    operationKey: "dependency-resources.restore-backup",
    dedupeKey: `dependency-resource-restore:${state.dependencyResourceId.value}:${state.id.value}:${restore.attemptId.value}`,
    correlationId: input.context.requestId,
    requestId: input.context.requestId,
    phase: "dependency-resource-restore",
    step: restore.status.value,
    projectId: state.projectId.value,
    startedAt: restore.requestedAt.value,
    updatedAt: restore.completedAt?.value ?? restore.failedAt?.value ?? restore.requestedAt.value,
    ...(status !== "running"
      ? {
          finishedAt:
            restore.completedAt?.value ?? restore.failedAt?.value ?? restore.requestedAt.value,
        }
      : {}),
    ...(restore.failureCode
      ? {
          errorCode: restore.failureCode.value,
          errorCategory: "async-processing",
          retriable: true,
        }
      : {}),
    nextActions: status === "failed" ? ["diagnostic", "manual-review"] : ["no-action"],
    safeDetails: {
      backupId: state.id.value,
      dependencyResourceId: state.dependencyResourceId.value,
      dependencyKind: state.dependencyKind.value,
      providerKey: state.providerKey.value,
      restoreAttemptId: restore.attemptId.value,
    },
  });

  void result;
}
