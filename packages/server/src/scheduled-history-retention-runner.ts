import {
  type AppLogger,
  type ExecutionContextFactory,
  type ScheduledHistoryRetentionService,
} from "@appaloft/application";

export interface ScheduledHistoryRetentionRunner {
  start(): void;
  stop(): void;
}

export interface ScheduledHistoryRetentionRunnerConfig {
  enabled: boolean;
  intervalSeconds: number;
  batchSize: number;
}

export interface ScheduledHistoryRetentionRunnerInput {
  config: ScheduledHistoryRetentionRunnerConfig;
  service: Pick<ScheduledHistoryRetentionService, "run">;
  executionContextFactory: ExecutionContextFactory;
  logger: AppLogger;
}

export function createScheduledHistoryRetentionRunner(
  input: ScheduledHistoryRetentionRunnerInput,
): ScheduledHistoryRetentionRunner {
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
          id: "scheduled-history-retention-runner",
          label: "Scheduled history retention runner",
        },
      });
      const result = await input.service.run(context, { limit: input.config.batchSize });

      if (result.isErr()) {
        input.logger.error("scheduled_history_retention_runner.run_failed", {
          errorCode: result.error.code,
          message: result.error.message,
        });
        return;
      }

      const value = result._unsafeUnwrap();
      input.logger.info("scheduled_history_retention_runner.tick_completed", {
        inspectedPolicyCount: value.inspectedPolicyCount,
        dispatchedCount: value.dispatchedCount,
        skippedCount: value.skippedCount,
      });
    } catch (error) {
      input.logger.error("scheduled_history_retention_runner.tick_failed", {
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
      input.logger.info("scheduled_history_retention_runner.started", {
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
      input.logger.info("scheduled_history_retention_runner.stopped");
    },
  };
}

export function createDisabledScheduledHistoryRetentionRunner(): ScheduledHistoryRetentionRunner {
  return {
    start(): void {},
    stop(): void {},
  };
}
