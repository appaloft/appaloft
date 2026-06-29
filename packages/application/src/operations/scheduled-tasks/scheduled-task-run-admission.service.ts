import {
  CreatedAt,
  domainError,
  err,
  ok,
  ResourceByIdSpec,
  ResourceId,
  type Result,
  redactScheduledTaskSecretText,
  ScheduledTaskDefinitionByIdSpec,
  ScheduledTaskId,
  ScheduledTaskRunAttempt,
  ScheduledTaskRunAttemptByScheduleSlotSpec,
  ScheduledTaskRunId,
  ScheduledTaskRunTriggerKindValue,
  safeTry,
  UpsertScheduledTaskRunAttemptSpec,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type DurableWorkQueueAdapter } from "../../durable-work";
import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type Clock,
  type IdGenerator,
  type ProcessAttemptRecorder,
  type ResourceRepository,
  type RunScheduledTaskNowResult,
  type ScheduledTaskDefinitionRepository,
  type ScheduledTaskRunAttemptRepository,
  type ScheduledTaskRunSummary,
  type ScheduledTaskRunTriggerKind,
} from "../../ports";
import { NoopProcessAttemptRecorder } from "../../process-attempt-journal";
import { tokens } from "../../tokens";
import {
  scheduledTaskRunDueOperationKey,
  scheduledTaskRunDurableWorkItemId,
  scheduledTaskRunDurableWorkKind,
  scheduledTaskRunNowOperationKey,
} from "./scheduled-task-durable-work";

export interface ScheduledTaskRunAdmissionInput {
  taskId: string;
  resourceId: string;
  triggerKind: ScheduledTaskRunTriggerKind;
  idempotencyKey?: string;
  scheduledFor?: string;
  requestedAt?: string;
}

const manualRunOperationKey = scheduledTaskRunNowOperationKey;
const scheduledRunOperationKey = scheduledTaskRunDueOperationKey;

function processAttemptOperationKey(triggerKind: ScheduledTaskRunTriggerKindValue): string {
  return triggerKind.value === "scheduled" ? scheduledRunOperationKey : manualRunOperationKey;
}

function durableWorkDedupeKey(input: {
  taskId: string;
  runId: string;
  triggerKind: ScheduledTaskRunTriggerKind;
  scheduledFor?: string;
}): string {
  return input.triggerKind === "scheduled" && input.scheduledFor
    ? `scheduled-task-run:${input.taskId}:${input.scheduledFor}`
    : `scheduled-task-run:${input.runId}`;
}

function runSummaryFromAttempt(runAttempt: ScheduledTaskRunAttempt): ScheduledTaskRunSummary {
  const state = runAttempt.toState();
  return {
    runId: state.id.value,
    taskId: state.taskId.value,
    resourceId: state.resourceId.value,
    triggerKind: state.triggerKind.value,
    status: state.status.value,
    ...(state.scheduledFor ? { scheduledFor: state.scheduledFor.value } : {}),
    createdAt: state.createdAt.value,
    ...(state.startedAt ? { startedAt: state.startedAt.value } : {}),
    ...(state.finishedAt ? { finishedAt: state.finishedAt.value } : {}),
    ...(state.exitCode ? { exitCode: state.exitCode.value } : {}),
    ...(state.failureSummary
      ? { failureSummary: redactScheduledTaskSecretText(state.failureSummary.value) }
      : {}),
    ...(state.skippedReason ? { skippedReason: state.skippedReason.value } : {}),
  };
}

@injectable()
export class ScheduledTaskRunAdmissionService {
  constructor(
    @inject(tokens.scheduledTaskDefinitionRepository)
    private readonly scheduledTaskDefinitionRepository: ScheduledTaskDefinitionRepository,
    @inject(tokens.scheduledTaskRunAttemptRepository)
    private readonly scheduledTaskRunAttemptRepository: ScheduledTaskRunAttemptRepository,
    @inject(tokens.resourceRepository)
    private readonly resourceRepository: ResourceRepository,
    @inject(tokens.idGenerator)
    private readonly idGenerator: IdGenerator,
    @inject(tokens.clock)
    private readonly clock: Clock,
    @inject(tokens.durableWorkQueueAdapter)
    private readonly durableWorkQueueAdapter: DurableWorkQueueAdapter,
    @inject(tokens.processAttemptRecorder)
    private readonly processAttemptRecorder: ProcessAttemptRecorder = new NoopProcessAttemptRecorder(),
  ) {}

  async admit(
    context: ExecutionContext,
    input: ScheduledTaskRunAdmissionInput,
  ): Promise<Result<RunScheduledTaskNowResult>> {
    const {
      clock,
      durableWorkQueueAdapter,
      idGenerator,
      processAttemptRecorder,
      resourceRepository,
      scheduledTaskDefinitionRepository,
      scheduledTaskRunAttemptRepository,
    } = this;
    const repositoryContext = toRepositoryContext(context);

    return safeTry(async function* () {
      const taskId = yield* ScheduledTaskId.create(input.taskId);
      const resourceId = yield* ResourceId.create(input.resourceId);
      const triggerKind = yield* ScheduledTaskRunTriggerKindValue.create(input.triggerKind);
      const scheduledFor =
        input.scheduledFor || triggerKind.value !== "scheduled"
          ? input.scheduledFor
            ? yield* CreatedAt.create(input.scheduledFor)
            : undefined
          : yield* CreatedAt.create(input.requestedAt ?? clock.now());
      const task = await scheduledTaskDefinitionRepository.findOne(
        repositoryContext,
        ScheduledTaskDefinitionByIdSpec.create(taskId, resourceId),
      );

      if (!task) {
        return err(domainError.notFound("scheduled task", taskId.value));
      }

      if (!task.belongsToResource(resourceId)) {
        return err(
          domainError.resourceContextMismatch("Scheduled task does not belong to Resource", {
            phase: "scheduled-task-run-admission",
            taskId: taskId.value,
            resourceId: resourceId.value,
          }),
        );
      }

      if (!task.isEnabled()) {
        return err(
          domainError.conflict("Scheduled task must be enabled before run admission", {
            phase: "scheduled-task-run-admission",
            taskId: taskId.value,
            resourceId: resourceId.value,
            status: task.toState().status.value,
          }),
        );
      }

      const resource = await resourceRepository.findOne(
        repositoryContext,
        ResourceByIdSpec.create(resourceId),
      );

      if (!resource) {
        return err(domainError.notFound("resource", resourceId.value));
      }

      const resourceState = resource.toState();
      if (resourceState.lifecycleStatus.isArchived() || resourceState.lifecycleStatus.isDeleted()) {
        return err(
          domainError.resourceArchived("Resource lifecycle blocks scheduled task run admission", {
            phase: "scheduled-task-run-admission",
            resourceId: resourceId.value,
            taskId: taskId.value,
            lifecycleStatus: resourceState.lifecycleStatus.value,
          }),
        );
      }

      const createdAt = yield* CreatedAt.create(input.requestedAt ?? clock.now());
      if (triggerKind.value === "scheduled" && scheduledFor) {
        const existingRun = await scheduledTaskRunAttemptRepository.findOne(
          repositoryContext,
          ScheduledTaskRunAttemptByScheduleSlotSpec.create({
            taskId,
            scheduledFor,
          }),
        );

        if (existingRun) {
          return ok({
            schemaVersion: "scheduled-tasks.run-now/v1",
            run: runSummaryFromAttempt(existingRun),
          } satisfies RunScheduledTaskNowResult);
        }
      }

      const runAttempt = yield* ScheduledTaskRunAttempt.create({
        id: ScheduledTaskRunId.rehydrate(idGenerator.next("str")),
        taskId,
        resourceId,
        triggerKind,
        ...(scheduledFor ? { scheduledFor } : {}),
        createdAt,
      });

      await scheduledTaskRunAttemptRepository.upsert(
        repositoryContext,
        runAttempt,
        UpsertScheduledTaskRunAttemptSpec.fromRunAttempt(runAttempt),
      );

      const runState = runAttempt.toState();
      const scheduledForValue = runState.scheduledFor?.value;
      const workItemId = scheduledTaskRunDurableWorkItemId(runState.id.value);
      const workDedupeKey = durableWorkDedupeKey({
        taskId: runState.taskId.value,
        runId: runState.id.value,
        triggerKind: runState.triggerKind.value,
        ...(scheduledForValue ? { scheduledFor: scheduledForValue } : {}),
      });

      yield* await durableWorkQueueAdapter.recordItem(repositoryContext, {
        id: workItemId,
        kind: scheduledTaskRunDurableWorkKind,
        status: "pending",
        operationKey: processAttemptOperationKey(triggerKind),
        queueBackend: "database",
        dedupeKey: workDedupeKey,
        correlationId: context.requestId,
        requestId: context.requestId,
        phase: "scheduled-task-run-admission",
        step: "accepted",
        resourceId: runState.resourceId.value,
        subjectKind: "scheduled-task-run",
        subjectId: runState.id.value,
        priority: 0,
        attemptCount: 0,
        maxAttempts: 3,
        availableAt: createdAt.value,
        updatedAt: createdAt.value,
        safeDetails: {
          runId: runState.id.value,
          workItemId,
          taskId: runState.taskId.value,
          resourceId: runState.resourceId.value,
          triggerKind: runState.triggerKind.value,
          ...(scheduledForValue ? { scheduledFor: scheduledForValue } : {}),
        },
      });
      yield* await durableWorkQueueAdapter.appendEvent(repositoryContext, {
        id: `${workItemId}_accepted_1`,
        workItemId,
        sequence: 1,
        kind: "accepted",
        status: "pending",
        phase: "scheduled-task-run-admission",
        step: "accepted",
        message: "Scheduled task run work was accepted.",
        occurredAt: createdAt.value,
        safeDetails: {
          runId: runState.id.value,
          workItemId,
          taskId: runState.taskId.value,
          resourceId: runState.resourceId.value,
          triggerKind: runState.triggerKind.value,
          ...(scheduledForValue ? { scheduledFor: scheduledForValue } : {}),
        },
      });

      yield* await processAttemptRecorder.record(repositoryContext, {
        id: idGenerator.next("wrk"),
        kind: "runtime-maintenance",
        status: "pending",
        operationKey: processAttemptOperationKey(triggerKind),
        dedupeKey: workDedupeKey,
        correlationId: context.requestId,
        requestId: context.requestId,
        phase: "scheduled-task-run-admission",
        step: "accepted",
        resourceId: runState.resourceId.value,
        startedAt: createdAt.value,
        updatedAt: createdAt.value,
        nextActions: ["no-action"],
        safeDetails: {
          runId: runState.id.value,
          workItemId,
          taskId: runState.taskId.value,
          resourceId: runState.resourceId.value,
          triggerKind: runState.triggerKind.value,
          ...(scheduledForValue ? { scheduledFor: scheduledForValue } : {}),
        },
      });

      return ok({
        schemaVersion: "scheduled-tasks.run-now/v1",
        run: runSummaryFromAttempt(runAttempt),
      } satisfies RunScheduledTaskNowResult);
    });
  }
}
