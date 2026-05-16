import {
  type AppLogger,
  type ExecutionContextFactory,
  type ScheduledRuntimePrunePolicy,
  type ScheduledRuntimePrunePolicyReadModel,
  type ScheduledRuntimePruneService,
  toRepositoryContext,
} from "@appaloft/application";

export interface ScheduledRuntimePruneRunner {
  start(): void;
  stop(): void;
}

export interface ScheduledRuntimePruneRunnerConfig {
  enabled: boolean;
  intervalSeconds: number;
  batchSize: number;
}

export interface ScheduledRuntimePruneRunnerInput {
  config: ScheduledRuntimePruneRunnerConfig;
  policies?: ScheduledRuntimePrunePolicy[];
  policyReadModel?: Pick<ScheduledRuntimePrunePolicyReadModel, "list">;
  service: Pick<ScheduledRuntimePruneService, "run">;
  executionContextFactory: ExecutionContextFactory;
  logger: AppLogger;
}

export function createScheduledRuntimePruneRunner(
  input: ScheduledRuntimePruneRunnerInput,
): ScheduledRuntimePruneRunner {
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
          id: "scheduled-runtime-prune-runner",
          label: "Scheduled runtime prune runner",
        },
      });
      const policies = input.policyReadModel
        ? await input.policyReadModel.list(toRepositoryContext(context), { enabledOnly: true })
        : undefined;
      if (policies?.isErr()) {
        input.logger.error("scheduled_runtime_prune_runner.policy_discovery_failed", {
          errorCode: policies.error.code,
          message: policies.error.message,
        });
        return;
      }

      const policyBatch = policies?._unsafeUnwrap() ?? input.policies ?? [];
      let completed = 0;
      let failed = 0;
      let scanned = 0;

      for (const policy of policyBatch.slice(0, input.config.batchSize)) {
        scanned += 1;
        const result = await input.service.run(context, { policy });
        if (result.isOk()) {
          completed += 1;
          continue;
        }

        failed += 1;
        input.logger.error("scheduled_runtime_prune_runner.run_failed", {
          policyId: policy.id,
          policyScope: policy.scope,
          serverId: policy.serverId,
          errorCode: result.error.code,
          message: result.error.message,
        });
      }

      if (scanned > 0 || completed > 0 || failed > 0) {
        input.logger.info("scheduled_runtime_prune_runner.tick_completed", {
          scanned,
          completed,
          failed,
        });
      }
    } catch (error) {
      input.logger.error("scheduled_runtime_prune_runner.tick_failed", {
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
      input.logger.info("scheduled_runtime_prune_runner.started", {
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
      input.logger.info("scheduled_runtime_prune_runner.stopped");
    },
  };
}

export function createDisabledScheduledRuntimePruneRunner(): ScheduledRuntimePruneRunner {
  return {
    start(): void {},
    stop(): void {},
  };
}
