import {
  type AppLogger,
  type ExecutionContextFactory,
  type MutationCoordinator,
  type PreviewExpiryCleanupScheduler,
} from "@appaloft/application";
import { type AppConfig } from "@appaloft/config";

export interface PreviewExpiryCleanupSchedulerRunner {
  start(): void;
  stop(): void;
}

export interface PreviewExpiryCleanupSchedulerRunnerInput {
  config: AppConfig["previewExpiryCleanupScheduler"];
  scheduler: Pick<PreviewExpiryCleanupScheduler, "run">;
  mutationCoordinator?: Pick<MutationCoordinator, "runExclusive">;
  executionContextFactory: ExecutionContextFactory;
  logger: AppLogger;
}

const previewExpiryCleanupSchedulerPolicy = {
  operationKey: "preview-expiry-cleanup-scheduler",
  scopeKind: "preview-lifecycle",
  mode: "serialize-with-bounded-wait",
  waitTimeoutMs: 5_000,
  retryIntervalMs: 250,
  leaseTtlMs: 30_000,
  heartbeatIntervalMs: 5_000,
} as const;

export function createPreviewExpiryCleanupSchedulerRunner(
  input: PreviewExpiryCleanupSchedulerRunnerInput,
): PreviewExpiryCleanupSchedulerRunner {
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
          id: "preview-expiry-cleanup-scheduler",
          label: "Preview expiry cleanup scheduler",
        },
      });
      const result = input.mutationCoordinator
        ? await input.mutationCoordinator.runExclusive({
            context,
            policy: previewExpiryCleanupSchedulerPolicy,
            scope: {
              kind: "preview-lifecycle",
              key: "preview-expiry-cleanup-scheduler",
            },
            owner: {
              ownerId: context.requestId,
              label: "Preview expiry cleanup scheduler",
            },
            work: () =>
              input.scheduler.run(context, {
                limit: input.config.batchSize,
              }),
          })
        : await input.scheduler.run(context, {
            limit: input.config.batchSize,
          });

      if (result.isErr()) {
        input.logger.warn("preview_expiry_cleanup_scheduler.lease_or_tick_failed", {
          code: result.error.code,
          retryable: result.error.retryable,
        });
        return;
      }

      if (result.isOk() && (result.value.dispatched.length > 0 || result.value.failed.length > 0)) {
        input.logger.info("preview_expiry_cleanup_scheduler.tick_completed", {
          scanned: result.value.scanned,
          dispatched: result.value.dispatched.length,
          failed: result.value.failed.length,
        });
      }
    } catch (error) {
      input.logger.error("preview_expiry_cleanup_scheduler.tick_failed", {
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
      input.logger.info("preview_expiry_cleanup_scheduler.started", {
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
      input.logger.info("preview_expiry_cleanup_scheduler.stopped");
    },
  };
}

export function createDisabledPreviewExpiryCleanupSchedulerRunner(): PreviewExpiryCleanupSchedulerRunner {
  return {
    start(): void {},
    stop(): void {},
  };
}
