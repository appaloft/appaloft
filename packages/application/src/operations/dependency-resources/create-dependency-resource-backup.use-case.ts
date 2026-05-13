import {
  CreatedAt,
  DependencyResourceBackup,
  DependencyResourceBackupAttemptId,
  DependencyResourceBackupFailureCode,
  DependencyResourceBackupId,
  DependencyResourceBackupRetentionStatusValue,
  DependencyResourceProviderArtifactHandle,
  DescriptionText,
  domainError,
  err,
  OccurredAt,
  ok,
  ProviderKey,
  ResourceInstanceByIdSpec,
  ResourceInstanceId,
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
  type ProcessAttemptRecorder,
} from "../../ports";
import { NoopProcessAttemptRecorder } from "../../process-attempt-journal";
import { tokens } from "../../tokens";
import { publishDomainEventsAndReturn } from "../publish-domain-events";
import { type CreateDependencyResourceBackupCommandInput } from "./create-dependency-resource-backup.command";

@injectable()
export class CreateDependencyResourceBackupUseCase {
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
    @inject(tokens.processAttemptRecorder)
    private readonly processAttemptRecorder: ProcessAttemptRecorder = new NoopProcessAttemptRecorder(),
  ) {}

  async execute(
    context: ExecutionContext,
    input: CreateDependencyResourceBackupCommandInput,
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
      processAttemptRecorder,
    } = this;

    return safeTry(async function* () {
      const dependencyResourceId = yield* ResourceInstanceId.create(input.dependencyResourceId);
      const dependencyResource = await dependencyResourceRepository.findOne(
        repositoryContext,
        ResourceInstanceByIdSpec.create(dependencyResourceId),
      );
      if (!dependencyResource) {
        return err(domainError.notFound("dependency_resource", dependencyResourceId.value));
      }
      yield* dependencyResource.ensureCanCreateBackup();

      const dependencyState = dependencyResource.toState();
      if (!dependencyState.projectId || !dependencyState.environmentId) {
        return err(
          domainError.dependencyResourceBackupBlocked("Dependency resource ownership is missing", {
            phase: "dependency-resource-backup-admission",
            dependencyResourceId: dependencyResourceId.value,
          }),
        );
      }
      const providerKey = input.providerKey
        ? yield* ProviderKey.create(input.providerKey)
        : dependencyState.providerKey;
      const dependencyKind = dependencyState.kind.value;
      if (dependencyKind !== "postgres" && dependencyKind !== "redis") {
        return err(
          domainError.dependencyResourceBackupBlocked(
            "Dependency resource kind is not backupable",
            {
              phase: "dependency-resource-backup-admission",
              dependencyResourceId: dependencyResourceId.value,
              dependencyKind,
            },
          ),
        );
      }
      if (!dependencyResourceBackupProvider.supports(providerKey.value, dependencyKind)) {
        return err(
          domainError.providerCapabilityUnsupported(
            "Provider does not support dependency resource backup",
            {
              phase: "dependency-resource-backup-admission",
              dependencyResourceId: dependencyResourceId.value,
              dependencyKind,
              providerKey: providerKey.value,
              operation: "dependency-resources.create-backup",
            },
          ),
        );
      }

      const requestedAt = yield* OccurredAt.create(clock.now());
      const createdAt = yield* CreatedAt.create(clock.now());
      const backupId = DependencyResourceBackupId.rehydrate(idGenerator.next("drb"));
      const attemptId = DependencyResourceBackupAttemptId.rehydrate(idGenerator.next("dba"));
      const backup = yield* DependencyResourceBackup.createPending({
        id: backupId,
        dependencyResourceId,
        projectId: dependencyState.projectId,
        environmentId: dependencyState.environmentId,
        dependencyKind: dependencyState.kind,
        providerKey,
        attemptId,
        requestedAt,
        createdAt,
      });

      await dependencyResourceBackupRepository.upsert(
        repositoryContext,
        backup,
        UpsertDependencyResourceBackupSpec.fromDependencyResourceBackup(backup),
      );
      await recordBackupProcessAttempt({
        recorder: processAttemptRecorder,
        repositoryContext,
        context,
        backup,
      });
      await publishDomainEventsAndReturn(context, eventBus, logger, backup, undefined);

      const providerResult = await dependencyResourceBackupProvider.createBackup(context, {
        backupId: backupId.value,
        dependencyResourceId: dependencyResourceId.value,
        dependencyKind,
        providerKey: providerKey.value,
        attemptId: attemptId.value,
        requestedAt: requestedAt.value,
      });
      if (providerResult.isOk()) {
        const completedAt = yield* OccurredAt.create(providerResult.value.completedAt);
        const providerArtifactHandle = yield* DependencyResourceProviderArtifactHandle.create(
          providerResult.value.providerArtifactHandle,
        );
        yield* backup.markReady({
          providerArtifactHandle,
          completedAt,
          retentionStatus:
            providerResult.value.retentionStatus === "none"
              ? DependencyResourceBackupRetentionStatusValue.none()
              : DependencyResourceBackupRetentionStatusValue.retained(),
        });
      } else {
        const failedAt = yield* OccurredAt.create(clock.now());
        const failureCode = yield* DependencyResourceBackupFailureCode.create(
          providerResult.error.code,
        );
        yield* backup.markFailed({
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
      await recordBackupProcessAttempt({
        recorder: processAttemptRecorder,
        repositoryContext,
        context,
        backup,
      });
      await publishDomainEventsAndReturn(context, eventBus, logger, backup, undefined);
      return ok({ id: backupId.value });
    });
  }
}

async function recordBackupProcessAttempt(input: {
  recorder: ProcessAttemptRecorder;
  repositoryContext: ReturnType<typeof toRepositoryContext>;
  context: ExecutionContext;
  backup: DependencyResourceBackup;
}): Promise<void> {
  const state = input.backup.toState();
  const status =
    state.status.value === "pending"
      ? "running"
      : state.status.value === "ready"
        ? "succeeded"
        : "failed";
  const result = await input.recorder.record(input.repositoryContext, {
    id: state.attemptId.value,
    kind: "system",
    status,
    operationKey: "dependency-resources.create-backup",
    dedupeKey: `dependency-resource-backup:${state.dependencyResourceId.value}:${state.id.value}:${state.attemptId.value}`,
    correlationId: input.context.requestId,
    requestId: input.context.requestId,
    phase: "dependency-resource-backup",
    step: state.status.value,
    projectId: state.projectId.value,
    startedAt: state.requestedAt.value,
    updatedAt: state.completedAt?.value ?? state.failedAt?.value ?? state.requestedAt.value,
    ...(status !== "running"
      ? { finishedAt: state.completedAt?.value ?? state.failedAt?.value ?? state.requestedAt.value }
      : {}),
    ...(state.failureCode
      ? {
          errorCode: state.failureCode.value,
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
      retentionStatus: state.retentionStatus.value,
    },
  });

  void result;
}
