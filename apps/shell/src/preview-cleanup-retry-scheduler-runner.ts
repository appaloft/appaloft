import {
  type AppLogger,
  type ExecutionContextFactory,
  type PreviewCleanupRetryScheduler,
} from "@appaloft/application";
import { type AppConfig } from "@appaloft/config";

export interface PreviewCleanupRetrySchedulerRunner {
  start(): void;
  stop(): void;
}

export interface PreviewCleanupRetrySchedulerRunnerInput {
  config: AppConfig["previewCleanupRetryScheduler"];
  scheduler: Pick<PreviewCleanupRetryScheduler, "run">;
  executionContextFactory: ExecutionContextFactory;
  logger: AppLogger;
}

export function createPreviewCleanupRetrySchedulerRunner(
  input: PreviewCleanupRetrySchedulerRunnerInput,
): PreviewCleanupRetrySchedulerRunner {
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
          id: "preview-cleanup-retry-scheduler",
          label: "Preview cleanup retry scheduler",
        },
      });
      const result = await input.scheduler.run(context, {
        limit: input.config.batchSize,
      });

      if (result.isOk() && (result.value.dispatched.length > 0 || result.value.failed.length > 0)) {
        input.logger.info("preview_cleanup_retry_scheduler.tick_completed", {
          scanned: result.value.scanned,
          dispatched: result.value.dispatched.length,
          failed: result.value.failed.length,
        });
      }
    } catch (error) {
      input.logger.error("preview_cleanup_retry_scheduler.tick_failed", {
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
      input.logger.info("preview_cleanup_retry_scheduler.started", {
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
      input.logger.info("preview_cleanup_retry_scheduler.stopped");
    },
  };
}

export function createDisabledPreviewCleanupRetrySchedulerRunner(): PreviewCleanupRetrySchedulerRunner {
  return {
    start(): void {},
    stop(): void {},
  };
}
