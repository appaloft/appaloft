import {
  domainError,
  err,
  FinishedAt,
  ok,
  type Result,
  redactScheduledTaskSecretText,
  ScheduledTaskDefinitionByIdSpec,
  ScheduledTaskId,
  ScheduledTaskRunAttemptByIdSpec,
  ScheduledTaskRunExitCode,
  ScheduledTaskRunFailureSummary,
  ScheduledTaskRunId,
  StartedAt,
  safeTry,
  UpsertScheduledTaskRunAttemptSpec,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type Clock,
  type IdGenerator,
  type ProcessAttemptClaimer,
  type ProcessAttemptCompleter,
  type ScheduledTaskDefinitionRepository,
  type ScheduledTaskRunAttemptRepository,
  type ScheduledTaskRunLogRecord,
  type ScheduledTaskRunLogRecorder,
  type ScheduledTaskRunSummary,
  type ScheduledTaskRuntimePort,
} from "../../ports";
import {
  EmptyProcessAttemptClaimer,
  EmptyProcessAttemptCompleter,
} from "../../process-attempt-journal";
import { tokens } from "../../tokens";

export interface ScheduledTaskRunWorkerInput {
  runId: string;
  taskId?: string;
  resourceId?: string;
  environment?: Record<string, string>;
  processAttemptId?: string;
  workerId?: string;
}

export interface ScheduledTaskRunWorkerResult {
  run: ScheduledTaskRunSummary;
  logsRecorded: number;
}

function runSummaryFromAttempt(
  runAttempt: Parameters<ScheduledTaskRunAttemptRepository["upsert"]>[1],
): ScheduledTaskRunSummary {
  const state = runAttempt.toState();
  return {
    runId: state.id.value,
    taskId: state.taskId.value,
    resourceId: state.resourceId.value,
    triggerKind: state.triggerKind.value,
    status: state.status.value,
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

function fallbackFailureSummary(): ScheduledTaskRunFailureSummary {
  return ScheduledTaskRunFailureSummary.rehydrate("Scheduled task runtime execution failed");
}

@injectable()
export class ScheduledTaskRunWorker {
  constructor(
    @inject(tokens.scheduledTaskRunAttemptRepository)
    private readonly runAttemptRepository: ScheduledTaskRunAttemptRepository,
    @inject(tokens.scheduledTaskDefinitionRepository)
    private readonly taskDefinitionRepository: ScheduledTaskDefinitionRepository,
    @inject(tokens.scheduledTaskRuntimePort)
    private readonly runtimePort: ScheduledTaskRuntimePort,
    @inject(tokens.scheduledTaskRunLogRecorder)
    private readonly logRecorder: ScheduledTaskRunLogRecorder,
    @inject(tokens.idGenerator)
    private readonly idGenerator: IdGenerator,
    @inject(tokens.clock)
    private readonly clock: Clock,
    @inject(tokens.processAttemptClaimer)
    private readonly processAttemptClaimer: ProcessAttemptClaimer = new EmptyProcessAttemptClaimer(),
    @inject(tokens.processAttemptCompleter)
    private readonly processAttemptCompleter: ProcessAttemptCompleter = new EmptyProcessAttemptCompleter(),
  ) {}

  async run(
    context: ExecutionContext,
    input: ScheduledTaskRunWorkerInput,
  ): Promise<Result<ScheduledTaskRunWorkerResult>> {
    const repositoryContext = toRepositoryContext(context);
    const {
      clock,
      idGenerator,
      logRecorder,
      processAttemptClaimer,
      processAttemptCompleter,
      runAttemptRepository,
      runtimePort,
      taskDefinitionRepository,
    } = this;

    return safeTry(async function* () {
      const runId = yield* ScheduledTaskRunId.create(input.runId);
      const taskId = input.taskId ? yield* ScheduledTaskId.create(input.taskId) : undefined;
      const runAttempt = await runAttemptRepository.findOne(
        repositoryContext,
        ScheduledTaskRunAttemptByIdSpec.create({
          runId,
          ...(taskId ? { taskId } : {}),
        }),
      );

      if (!runAttempt) {
        return err(domainError.notFound("scheduled task run", runId.value));
      }

      const runState = runAttempt.toState();
      if (input.resourceId && runState.resourceId.value !== input.resourceId) {
        return err(
          domainError.resourceContextMismatch("Scheduled task run does not belong to Resource", {
            phase: "scheduled-task-run-worker",
            runId: runId.value,
            resourceId: input.resourceId,
          }),
        );
      }

      const taskDefinition = await taskDefinitionRepository.findOne(
        repositoryContext,
        ScheduledTaskDefinitionByIdSpec.create(runState.taskId, runState.resourceId),
      );
      if (!taskDefinition) {
        return err(domainError.notFound("scheduled task", runState.taskId.value));
      }

      const workerStartedAt = clock.now();
      if (input.processAttemptId) {
        const claimResult = yield* await processAttemptClaimer.claimDue(repositoryContext, {
          attemptId: input.processAttemptId,
          workerId: input.workerId ?? "scheduled-task-run-worker",
          claimedAt: workerStartedAt,
          safeDetails: {
            runId: runState.id.value,
            taskId: runState.taskId.value,
            resourceId: runState.resourceId.value,
          },
        });

        if (claimResult.status !== "claimed") {
          return err(
            domainError.conflict("Scheduled task durable process attempt could not be claimed", {
              phase: "scheduled-task-run-worker",
              runId: runState.id.value,
              processAttemptId: input.processAttemptId,
              claimStatus: claimResult.status,
            }),
          );
        }
      }

      yield* runAttempt.start({ startedAt: StartedAt.rehydrate(workerStartedAt) });
      await runAttemptRepository.upsert(
        repositoryContext,
        runAttempt,
        UpsertScheduledTaskRunAttemptSpec.fromRunAttempt(runAttempt),
      );

      const taskState = taskDefinition.toState();
      const runtimeResult = await runtimePort.execute(context, {
        runId: runState.id.value,
        taskId: runState.taskId.value,
        resourceId: runState.resourceId.value,
        commandIntent: taskState.commandIntent.value,
        timeoutSeconds: taskState.timeoutSeconds.value,
        ...(input.environment ? { environment: input.environment } : {}),
      });

      if (runtimeResult.isErr()) {
        const failedAt = clock.now();
        yield* runAttempt.markFailed({
          finishedAt: FinishedAt.rehydrate(failedAt),
          exitCode: ScheduledTaskRunExitCode.rehydrate(1),
          failureSummary: fallbackFailureSummary(),
        });
        await runAttemptRepository.upsert(
          repositoryContext,
          runAttempt,
          UpsertScheduledTaskRunAttemptSpec.fromRunAttempt(runAttempt),
        );
        if (input.processAttemptId) {
          yield* await processAttemptCompleter.complete(repositoryContext, {
            attemptId: input.processAttemptId,
            status: "retry-scheduled",
            completedAt: failedAt,
            phase: "scheduled-task-run",
            step: "runtime-execution",
            errorCode: runtimeResult.error.code,
            errorCategory: "async-processing",
            retriable: true,
            nextEligibleAt: failedAt,
            nextActions: ["retry", "manual-review"],
            safeDetails: {
              runId: runState.id.value,
              taskId: runState.taskId.value,
              resourceId: runState.resourceId.value,
            },
          });
        }
        return err(runtimeResult.error);
      }

      const logs: ScheduledTaskRunLogRecord[] = runtimeResult.value.logs.map((entry) => ({
        id: idGenerator.next("stlog"),
        runId: runState.id.value,
        taskId: runState.taskId.value,
        resourceId: runState.resourceId.value,
        timestamp: entry.timestamp,
        stream: entry.stream,
        message: entry.message,
      }));
      const recorded = yield* await logRecorder.recordMany(repositoryContext, logs);

      const exitCode = yield* ScheduledTaskRunExitCode.create(runtimeResult.value.exitCode);
      if (runtimeResult.value.status === "succeeded") {
        yield* runAttempt.markSucceeded({
          finishedAt: FinishedAt.rehydrate(runtimeResult.value.finishedAt),
          exitCode,
        });
      } else {
        const failureSummary = yield* ScheduledTaskRunFailureSummary.create(
          runtimeResult.value.failureSummary ??
            `Scheduled task command exited with code ${runtimeResult.value.exitCode}`,
        );
        yield* runAttempt.markFailed({
          finishedAt: FinishedAt.rehydrate(runtimeResult.value.finishedAt),
          exitCode,
          failureSummary,
        });
      }

      await runAttemptRepository.upsert(
        repositoryContext,
        runAttempt,
        UpsertScheduledTaskRunAttemptSpec.fromRunAttempt(runAttempt),
      );
      if (input.processAttemptId) {
        const processAttemptStatus =
          runtimeResult.value.status === "succeeded" ? "succeeded" : "retry-scheduled";
        yield* await processAttemptCompleter.complete(repositoryContext, {
          attemptId: input.processAttemptId,
          status: processAttemptStatus,
          completedAt: runtimeResult.value.finishedAt,
          phase: "scheduled-task-run",
          step: "runtime-execution",
          ...(runtimeResult.value.status === "succeeded"
            ? {}
            : {
                errorCode: "scheduled_task_run_failed",
                errorCategory: "async-processing",
                retriable: true,
                nextEligibleAt: clock.now(),
              }),
          nextActions:
            runtimeResult.value.status === "succeeded" ? ["no-action"] : ["retry", "manual-review"],
          safeDetails: {
            runId: runState.id.value,
            taskId: runState.taskId.value,
            resourceId: runState.resourceId.value,
            exitCode: runtimeResult.value.exitCode,
          },
        });
      }

      return ok({
        run: runSummaryFromAttempt(runAttempt),
        logsRecorded: recorded.recorded,
      });
    });
  }
}
