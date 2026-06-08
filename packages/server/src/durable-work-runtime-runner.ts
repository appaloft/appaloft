import {
  type AppLogger,
  DeploymentDurableWorkHandler,
  type DeploymentLifecycleService,
  type DeploymentRepository,
  type DurableWorkQueueAdapter,
  type DurableWorkTopology,
  drainDurableWorkOnce,
  type EventBus,
  type ExecutionBackend,
  type ExecutionContextFactory,
  type ProcessAttemptRecorder,
} from "@appaloft/application";

export interface DurableWorkRuntimeRunner {
  start(): void;
  stop(): void;
}

export interface DurableWorkRuntimeRunnerInput {
  topology: DurableWorkTopology;
  adapter: DurableWorkQueueAdapter;
  deploymentRepository: DeploymentRepository;
  deploymentLifecycleService: DeploymentLifecycleService;
  executionBackend: ExecutionBackend;
  eventBus: EventBus;
  processAttemptRecorder: ProcessAttemptRecorder;
  executionContextFactory: ExecutionContextFactory;
  logger: AppLogger;
  intervalSeconds?: number;
  batchSize?: number;
  leaseDurationMs?: number;
}

export function createDurableWorkRuntimeRunner(
  input: DurableWorkRuntimeRunnerInput,
): DurableWorkRuntimeRunner {
  const intervalSeconds = input.intervalSeconds ?? 2;
  const batchSize = input.batchSize ?? 5;
  const leaseDurationMs = input.leaseDurationMs ?? 300_000;
  const timers: ReturnType<typeof setInterval>[] = [];
  const runningWorkers = new Set<string>();

  async function tick(workerId: string): Promise<void> {
    if (runningWorkers.has(workerId)) {
      return;
    }

    const worker = input.topology.workers.find((candidate) => candidate.workerId === workerId);
    if (!worker) {
      return;
    }

    runningWorkers.add(workerId);
    try {
      const context = input.executionContextFactory.create({
        entrypoint: "system",
        actor: {
          kind: "system",
          id: worker.workerId,
          label: "Durable work runtime",
        },
      });
      const handler = new DeploymentDurableWorkHandler(
        input.deploymentRepository,
        input.deploymentLifecycleService,
        input.executionBackend,
        input.eventBus,
        input.logger,
        input.processAttemptRecorder,
      );
      const report = await drainDurableWorkOnce(
        context,
        input.adapter,
        {
          resolve(item) {
            return item.kind === "deployment" ? handler : undefined;
          },
        },
        {
          worker,
          now: new Date().toISOString(),
          leaseDurationMs,
          limit: batchSize,
        },
      );
      if (report.isErr()) {
        input.logger.error("durable_work_runtime.tick_failed", {
          workerId,
          errorCode: report.error.code,
          message: report.error.message,
        });
        return;
      }

      if (
        report.value.scanned > 0 ||
        report.value.claimed > 0 ||
        report.value.completed > 0 ||
        report.value.failed > 0
      ) {
        input.logger.info("durable_work_runtime.tick_completed", {
          workerId,
          ...report.value,
        });
      }
    } catch (error) {
      input.logger.error("durable_work_runtime.tick_unhandled_error", {
        workerId,
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      runningWorkers.delete(workerId);
    }
  }

  return {
    start(): void {
      if (input.topology.mode === "disabled" || input.topology.queueBackend !== "database") {
        input.logger.info("durable_work_runtime.drain_skipped", {
          mode: input.topology.mode,
          queueBackend: input.topology.queueBackend,
        });
        return;
      }

      if (timers.length > 0) {
        return;
      }

      for (const worker of input.topology.workers) {
        void tick(worker.workerId);
        timers.push(
          setInterval(() => {
            void tick(worker.workerId);
          }, intervalSeconds * 1000),
        );
      }

      input.logger.info("durable_work_runtime.drain_started", {
        intervalSeconds,
        batchSize,
        leaseDurationMs,
        workerIds: input.topology.workers.map((worker) => worker.workerId),
      });
    },
    stop(): void {
      for (const timer of timers.splice(0)) {
        clearInterval(timer);
      }
      runningWorkers.clear();
      input.logger.info("durable_work_runtime.drain_stopped");
    },
  };
}

export function createDisabledDurableWorkRuntimeRunner(): DurableWorkRuntimeRunner {
  return {
    start(): void {},
    stop(): void {},
  };
}
