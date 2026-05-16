import {
  type AppLogger,
  type DependencyResourceBackupPolicyRepository,
  type ExecutionContextFactory,
  type ScheduledDependencyBackupService,
  toRepositoryContext,
} from "@appaloft/application";

export interface ScheduledDependencyBackupRunner {
  start(): void;
  stop(): void;
}

export interface ScheduledDependencyBackupRunnerConfig {
  enabled: boolean;
  intervalSeconds: number;
  batchSize: number;
}

export interface ScheduledDependencyBackupRunnerInput {
  config: ScheduledDependencyBackupRunnerConfig;
  policyRepository: Pick<DependencyResourceBackupPolicyRepository, "listRecords">;
  service: Pick<ScheduledDependencyBackupService, "run">;
  executionContextFactory: ExecutionContextFactory;
  logger: AppLogger;
}

export function createScheduledDependencyBackupRunner(
  input: ScheduledDependencyBackupRunnerInput,
): ScheduledDependencyBackupRunner {
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
          id: "scheduled-dependency-backup-runner",
          label: "Scheduled dependency backup runner",
        },
      });
      const now = new Date().toISOString();
      const policies = await input.policyRepository.listRecords(toRepositoryContext(context), {
        enabledOnly: true,
        dueAt: now,
      });
      if (policies.isErr()) {
        input.logger.error("scheduled_dependency_backup_runner.policy_discovery_failed", {
          errorCode: policies.error.code,
          message: policies.error.message,
        });
        return;
      }

      let completed = 0;
      let failed = 0;
      let scanned = 0;

      for (const policy of policies.value.slice(0, input.config.batchSize)) {
        scanned += 1;
        const result = await input.service.run(context, { policy, scheduledAt: now });
        if (result.isOk()) {
          completed += 1;
          continue;
        }

        failed += 1;
        input.logger.error("scheduled_dependency_backup_runner.run_failed", {
          policyId: policy.id,
          dependencyResourceId: policy.dependencyResourceId,
          errorCode: result.error.code,
          message: result.error.message,
        });
      }

      if (scanned > 0 || completed > 0 || failed > 0) {
        input.logger.info("scheduled_dependency_backup_runner.tick_completed", {
          scanned,
          completed,
          failed,
        });
      }
    } catch (error) {
      input.logger.error("scheduled_dependency_backup_runner.tick_failed", {
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
      input.logger.info("scheduled_dependency_backup_runner.started", {
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
      input.logger.info("scheduled_dependency_backup_runner.stopped");
    },
  };
}
