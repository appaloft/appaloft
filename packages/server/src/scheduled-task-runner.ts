import {
  type AppLogger,
  EmptyProcessAttemptDeliveryCandidateReader,
  EmptyProcessAttemptRetryCandidateReader,
  EmptyProcessAttemptRetryGenerator,
  type ExecutionContextFactory,
  type ProcessAttemptDeliveryCandidateReader,
  type ProcessAttemptRecord,
  type ProcessAttemptRetryCandidateReader,
  type ProcessAttemptRetryGenerator,
  type RepositoryContext,
  type ScheduledTaskRunWorker,
  type ScheduledTaskScheduler,
  toRepositoryContext,
} from "@appaloft/application";
import { type AppConfig } from "@appaloft/config";

const scheduledTaskRunOperationKeys = ["scheduled-tasks.run-now", "scheduled-task-runs.run-due"];
const scheduledTaskWorkerId = "scheduled-task-runner";
const scheduledTaskWorkKind = "runtime-maintenance";

export interface ScheduledTaskRunner {
  start(): void;
  stop(): void;
}

export interface ScheduledTaskRunnerInput {
  config: AppConfig["scheduledTaskRunner"];
  scheduler: Pick<ScheduledTaskScheduler, "run">;
  worker: Pick<ScheduledTaskRunWorker, "run">;
  processAttemptDeliveryCandidateReader?: Pick<
    ProcessAttemptDeliveryCandidateReader,
    "listDueDeliveryCandidates"
  >;
  processAttemptRetryCandidateReader?: Pick<ProcessAttemptRetryCandidateReader, "listDueRetries">;
  processAttemptRetryGenerator?: Pick<ProcessAttemptRetryGenerator, "generateDueRetry">;
  executionContextFactory: ExecutionContextFactory;
  logger: AppLogger;
}

function stringDetail(
  attempt: ProcessAttemptRecord,
  key: "runId" | "taskId" | "resourceId",
): string | undefined {
  const value = attempt.safeDetails?.[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function candidateRunId(attempt: ProcessAttemptRecord): string | undefined {
  return stringDetail(attempt, "runId");
}

function candidateTaskId(attempt: ProcessAttemptRecord): string | undefined {
  return stringDetail(attempt, "taskId");
}

function candidateResourceId(attempt: ProcessAttemptRecord): string | undefined {
  return stringDetail(attempt, "resourceId") ?? attempt.resourceId;
}

function hasDurableWorkItem(attempt: ProcessAttemptRecord): boolean {
  const value = attempt.safeDetails?.workItemId;
  return typeof value === "string" && value.trim().length > 0;
}

export function createScheduledTaskRunner(input: ScheduledTaskRunnerInput): ScheduledTaskRunner {
  let timer: ReturnType<typeof setInterval> | undefined;
  let running = false;
  const processAttemptDeliveryCandidateReader =
    input.processAttemptDeliveryCandidateReader ?? new EmptyProcessAttemptDeliveryCandidateReader();
  const processAttemptRetryCandidateReader =
    input.processAttemptRetryCandidateReader ?? new EmptyProcessAttemptRetryCandidateReader();
  const processAttemptRetryGenerator =
    input.processAttemptRetryGenerator ?? new EmptyProcessAttemptRetryGenerator();

  async function tick(): Promise<void> {
    if (running) {
      return;
    }

    running = true;
    try {
      const context = input.executionContextFactory.create({
        entrypoint: "system",
        actor: {
          kind: "system",
          id: "scheduled-task-runner",
          label: "Scheduled task runner",
        },
      });
      const result = await input.scheduler.run(context, {
        limit: input.config.batchSize,
      });

      if (result.isErr()) {
        input.logger.error("scheduled_task_runner.tick_failed", {
          errorCode: result.error.code,
          message: result.error.message,
        });
        return;
      }

      const repositoryContext: RepositoryContext = toRepositoryContext(context);
      const now = new Date().toISOString();
      const retryCandidates = await processAttemptRetryCandidateReader.listDueRetries(
        repositoryContext,
        {
          kind: scheduledTaskWorkKind,
          now,
          limit: input.config.batchSize,
        },
      );
      const generatedRetryAttempts: ProcessAttemptRecord[] = [];
      for (const retryCandidate of retryCandidates) {
        if (!scheduledTaskRunOperationKeys.includes(retryCandidate.operationKey)) {
          continue;
        }

        const generated = await processAttemptRetryGenerator.generateDueRetry(repositoryContext, {
          sourceAttemptId: retryCandidate.id,
          retryAttemptId: `${retryCandidate.id}_retry`,
          generatedAt: now,
          phase: "scheduled-task-run-retry",
          step: "queued",
          safeDetails: {
            generatedBy: scheduledTaskWorkerId,
          },
        });

        if (generated.isErr()) {
          input.logger.error("scheduled_task_runner.retry_generation_failed", {
            processAttemptId: retryCandidate.id,
            errorCode: generated.error.code,
            message: generated.error.message,
          });
          continue;
        }

        if (generated.value.status === "generated") {
          generatedRetryAttempts.push(generated.value.retryAttempt);
          continue;
        }

        input.logger.warn("scheduled_task_runner.retry_generation_skipped", {
          processAttemptId: retryCandidate.id,
          status: generated.value.status,
        });
      }

      const queriedDeliveryCandidates: ProcessAttemptRecord[] = [];
      for (const operationKey of scheduledTaskRunOperationKeys) {
        queriedDeliveryCandidates.push(
          ...(await processAttemptDeliveryCandidateReader.listDueDeliveryCandidates(
            repositoryContext,
            {
              kind: scheduledTaskWorkKind,
              operationKey,
              now,
              limit: input.config.batchSize,
            },
          )),
        );
      }
      const durableCandidatesById = new Map<string, ProcessAttemptRecord>();
      for (const candidate of [...generatedRetryAttempts, ...queriedDeliveryCandidates]) {
        durableCandidatesById.set(candidate.id, candidate);
      }
      const durableCandidates = [...durableCandidatesById.values()];
      let completed = 0;
      let failed = result.value.failed.length;
      let skipped = 0;
      for (const candidate of durableCandidates) {
        if (hasDurableWorkItem(candidate)) {
          skipped += 1;
          continue;
        }

        const runId = candidateRunId(candidate);
        const taskId = candidateTaskId(candidate);
        const resourceId = candidateResourceId(candidate);
        if (!runId) {
          skipped += 1;
          input.logger.warn("scheduled_task_runner.durable_candidate_skipped", {
            processAttemptId: candidate.id,
            reason: "missing-run-id",
          });
          continue;
        }

        const workerResult = await input.worker.run(context, {
          runId,
          ...(taskId ? { taskId } : {}),
          ...(resourceId ? { resourceId } : {}),
          processAttemptId: candidate.id,
          workerId: scheduledTaskWorkerId,
        });

        if (workerResult.isOk()) {
          completed += 1;
          continue;
        }

        failed += 1;
        input.logger.error("scheduled_task_runner.durable_run_failed", {
          processAttemptId: candidate.id,
          runId,
          ...(taskId ? { taskId } : {}),
          ...(resourceId ? { resourceId } : {}),
          errorCode: workerResult.error.code,
          message: workerResult.error.message,
        });
      }

      if (result.value.scanned > 0 || durableCandidates.length > 0 || completed > 0 || failed > 0) {
        input.logger.info("scheduled_task_runner.tick_completed", {
          scanned: result.value.scanned,
          dispatched: result.value.dispatched.length,
          durableCandidates: durableCandidates.length,
          completed,
          failed,
          skipped,
        });
      }
    } catch (error) {
      input.logger.error("scheduled_task_runner.tick_failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      running = false;
    }
  }

  return {
    start(): void {
      if (!input.config.enabled || timer) {
        return;
      }

      void tick();
      timer = setInterval(() => {
        void tick();
      }, input.config.intervalSeconds * 1000);
      input.logger.info("scheduled_task_runner.started", {
        intervalSeconds: input.config.intervalSeconds,
        batchSize: input.config.batchSize,
      });
    },
    stop(): void {
      if (!timer) {
        return;
      }

      clearInterval(timer);
      timer = undefined;
      input.logger.info("scheduled_task_runner.stopped");
    },
  };
}

export function createDisabledScheduledTaskRunner(): ScheduledTaskRunner {
  return {
    start(): void {},
    stop(): void {},
  };
}
