import {
  type AppLogger,
  type ExecutionContextFactory,
  type StorageVolumeBackupAutomationService,
} from "@appaloft/application";

export interface ScheduledStorageVolumeBackupRunner {
  start(): void;
  stop(): void;
}

export interface ScheduledStorageVolumeBackupRunnerConfig {
  enabled: boolean;
  intervalSeconds: number;
  batchSize: number;
}

export function createScheduledStorageVolumeBackupRunner(input: {
  config: ScheduledStorageVolumeBackupRunnerConfig;
  service: Pick<StorageVolumeBackupAutomationService, "runDue">;
  executionContextFactory: ExecutionContextFactory;
  logger: AppLogger;
}): ScheduledStorageVolumeBackupRunner {
  let timer: ReturnType<typeof setInterval> | undefined;
  let running = false;
  async function tick(): Promise<void> {
    if (running) return;
    running = true;
    try {
      const context = input.executionContextFactory.create({
        entrypoint: "system",
        actor: {
          kind: "system",
          id: "scheduled-storage-volume-backup-runner",
          label: "Scheduled storage volume backup runner",
        },
      });
      const result = await input.service.runDue(
        context,
        new Date().toISOString(),
        input.config.batchSize,
      );
      if (result.isErr()) {
        input.logger.error("scheduled_storage_volume_backup_runner.tick_failed", {
          errorCode: result.error.code,
          message: result.error.message,
        });
      } else if (result.value.completed > 0 || result.value.failed > 0) {
        input.logger.info("scheduled_storage_volume_backup_runner.tick_completed", result.value);
      }
    } catch (error) {
      input.logger.error("scheduled_storage_volume_backup_runner.tick_failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      running = false;
    }
  }
  return {
    start() {
      if (!input.config.enabled || timer) return;
      void tick();
      timer = setInterval(() => void tick(), input.config.intervalSeconds * 1000);
      input.logger.info("scheduled_storage_volume_backup_runner.started", {
        intervalSeconds: input.config.intervalSeconds,
        batchSize: input.config.batchSize,
      });
    },
    stop() {
      if (!timer) return;
      clearInterval(timer);
      timer = undefined;
      input.logger.info("scheduled_storage_volume_backup_runner.stopped");
    },
  };
}

export function createDisabledScheduledStorageVolumeBackupRunner(): ScheduledStorageVolumeBackupRunner {
  return { start() {}, stop() {} };
}
