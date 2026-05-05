import {
  type AppLogger,
  type ExecutionContextFactory,
  type ScheduledTaskRunWorker,
  type ScheduledTaskScheduler,
} from "@appaloft/application";
import { type AppConfig } from "@appaloft/config";

export interface ScheduledTaskRunner {
  start(): void;
  stop(): void;
}

export interface ScheduledTaskRunnerInput {
  config: AppConfig["scheduledTaskRunner"];
  scheduler: Pick<ScheduledTaskScheduler, "run">;
  worker: Pick<ScheduledTaskRunWorker, "run">;
  executionContextFactory: ExecutionContextFactory;
  logger: AppLogger;
}

export function createScheduledTaskRunner(input: ScheduledTaskRunnerInput): ScheduledTaskRunner {
  let timer: ReturnType<typeof setInterval> | undefined;
  let running = false;

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

      let completed = 0;
      let failed = result.value.failed.length;
      for (const dispatch of result.value.dispatched) {
        const workerResult = await input.worker.run(context, {
          runId: dispatch.run.runId,
          taskId: dispatch.taskId,
          resourceId: dispatch.resourceId,
        });

        if (workerResult.isOk()) {
          completed += 1;
          continue;
        }

        failed += 1;
        input.logger.error("scheduled_task_runner.run_failed", {
          runId: dispatch.run.runId,
          taskId: dispatch.taskId,
          resourceId: dispatch.resourceId,
          errorCode: workerResult.error.code,
          message: workerResult.error.message,
        });
      }

      if (result.value.scanned > 0 || completed > 0 || failed > 0) {
        input.logger.info("scheduled_task_runner.tick_completed", {
          scanned: result.value.scanned,
          dispatched: result.value.dispatched.length,
          completed,
          failed,
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
