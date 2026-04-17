import {
  type AppLogger,
  type CertificateRetryScheduler,
  type ExecutionContextFactory,
} from "@appaloft/application";
import { type AppConfig } from "@appaloft/config";

export interface CertificateRetrySchedulerRunner {
  start(): void;
  stop(): void;
}

export interface CertificateRetrySchedulerRunnerInput {
  config: AppConfig["certificateRetryScheduler"];
  scheduler: Pick<CertificateRetryScheduler, "run">;
  executionContextFactory: ExecutionContextFactory;
  logger: AppLogger;
}

export function createCertificateRetrySchedulerRunner(
  input: CertificateRetrySchedulerRunnerInput,
): CertificateRetrySchedulerRunner {
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
          id: "certificate-retry-scheduler",
          label: "Certificate retry scheduler",
        },
      });
      const result = await input.scheduler.run(context, {
        defaultRetryDelaySeconds: input.config.defaultRetryDelaySeconds,
        limit: input.config.batchSize,
      });

      if (result.isOk() && (result.value.dispatched.length > 0 || result.value.failed.length > 0)) {
        input.logger.info("certificate_retry_scheduler.tick_completed", {
          scanned: result.value.scanned,
          dispatched: result.value.dispatched.length,
          failed: result.value.failed.length,
        });
      }
    } catch (error) {
      input.logger.error("certificate_retry_scheduler.tick_failed", {
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
      input.logger.info("certificate_retry_scheduler.started", {
        intervalSeconds: input.config.intervalSeconds,
        defaultRetryDelaySeconds: input.config.defaultRetryDelaySeconds,
        batchSize: input.config.batchSize,
      });
    },
    stop(): void {
      if (!timer) {
        return;
      }

      clearInterval(timer);
      timer = undefined;
      input.logger.info("certificate_retry_scheduler.stopped");
    },
  };
}
