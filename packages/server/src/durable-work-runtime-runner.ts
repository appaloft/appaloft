import {
  type AppLogger,
  DeploymentDurableWorkHandler,
  type DeploymentLifecycleService,
  type DeploymentRepository,
  type DurableWorkHandler,
  type DurableWorkHandlerRegistry,
  type DurableWorkItemRecord,
  type DurableWorkQueueAdapter,
  type DurableWorkTopology,
  type DurableWorkWorkerHeartbeatStore,
  drainDurableWorkOnce,
  type EventBus,
  type ExecutionBackend,
  type ExecutionContextFactory,
  type ProcessAttemptRecorder,
  toRepositoryContext,
} from "@appaloft/application";

export interface DurableWorkRuntimeRunner {
  start(): Promise<void>;
  stop(): Promise<void>;
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
  handlerRegistry?: DurableWorkHandlerRegistry;
  heartbeatStore?: DurableWorkWorkerHeartbeatStore;
  intervalSeconds?: number;
  batchSize?: number;
  leaseDurationMs?: number;
}

function createDeploymentHandler(
  input: DurableWorkRuntimeRunnerInput,
): DeploymentDurableWorkHandler {
  return new DeploymentDurableWorkHandler(
    input.deploymentRepository,
    input.deploymentLifecycleService,
    input.executionBackend,
    input.eventBus,
    input.logger,
    input.processAttemptRecorder,
  );
}

export function createCompositeDurableWorkHandlerRegistry(
  deploymentHandler: DurableWorkHandler,
  extensionRegistry?: DurableWorkHandlerRegistry,
): DurableWorkHandlerRegistry {
  return {
    resolve(item: DurableWorkItemRecord) {
      return (
        extensionRegistry?.resolve(item) ??
        (item.kind === "deployment" ? deploymentHandler : undefined)
      );
    },
  };
}

export function createDurableWorkRuntimeRunner(
  input: DurableWorkRuntimeRunnerInput,
): DurableWorkRuntimeRunner {
  const intervalSeconds = input.intervalSeconds ?? 2;
  const batchSize = input.batchSize ?? 5;
  const leaseDurationMs = input.leaseDurationMs ?? 300_000;
  const processStartedAt = new Date().toISOString();
  const timers: ReturnType<typeof setInterval>[] = [];
  const activeWorkerTicks = new Map<string, Promise<void>>();

  async function recordHeartbeat(workerId: string, lastSeenAt: string): Promise<void> {
    if (!input.heartbeatStore) {
      return;
    }

    const worker = input.topology.workers.find((candidate) => candidate.workerId === workerId);
    if (!worker) {
      return;
    }

    const context = input.executionContextFactory.create({
      entrypoint: "system",
      actor: {
        kind: "system",
        id: worker.workerId,
        label: "Durable work runtime heartbeat",
      },
    });
    const heartbeat = await input.heartbeatStore.recordHeartbeat(toRepositoryContext(context), {
      workerId: worker.workerId,
      workerGroup: worker.workerGroup,
      slot: worker.slot,
      mode: input.topology.mode,
      queueBackend: input.topology.queueBackend,
      processStartedAt,
      lastSeenAt,
      status: "online",
    });
    if (heartbeat.isErr()) {
      input.logger.warn("durable_work_runtime.heartbeat_failed", {
        workerId,
        errorCode: heartbeat.error.code,
        message: heartbeat.error.message,
      });
    }
  }

  async function tick(workerId: string): Promise<void> {
    const worker = input.topology.workers.find((candidate) => candidate.workerId === workerId);
    if (!worker) {
      return;
    }

    try {
      const now = new Date().toISOString();
      await recordHeartbeat(workerId, now);
      const context = input.executionContextFactory.create({
        entrypoint: "system",
        actor: {
          kind: "system",
          id: worker.workerId,
          label: "Durable work runtime",
        },
      });
      const handler = createDeploymentHandler(input);
      const report = await drainDurableWorkOnce(
        context,
        input.adapter,
        createCompositeDurableWorkHandlerRegistry(handler, input.handlerRegistry),
        {
          worker,
          now,
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
      activeWorkerTicks.delete(workerId);
    }
  }

  function startTick(workerId: string): void {
    if (activeWorkerTicks.has(workerId)) {
      return;
    }

    activeWorkerTicks.set(workerId, tick(workerId));
  }

  return {
    async start(): Promise<void> {
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
        startTick(worker.workerId);
        timers.push(
          setInterval(() => {
            startTick(worker.workerId);
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
    async stop(): Promise<void> {
      for (const timer of timers.splice(0)) {
        clearInterval(timer);
      }
      await Promise.allSettled([...activeWorkerTicks.values()]);
      if (input.heartbeatStore) {
        const stoppedAt = new Date().toISOString();
        await Promise.all(
          input.topology.workers.map(async (worker) => {
            const context = input.executionContextFactory.create({
              entrypoint: "system",
              actor: {
                kind: "system",
                id: worker.workerId,
                label: "Durable work runtime heartbeat",
              },
            });
            const stopped = await input.heartbeatStore?.markStopped(toRepositoryContext(context), {
              workerId: worker.workerId,
              lastSeenAt: stoppedAt,
            });
            if (stopped?.isErr()) {
              input.logger.warn("durable_work_runtime.heartbeat_stop_failed", {
                workerId: worker.workerId,
                errorCode: stopped.error.code,
                message: stopped.error.message,
              });
            }
          }),
        );
      }
      input.logger.info("durable_work_runtime.drain_stopped");
    },
  };
}

export function createDisabledDurableWorkRuntimeRunner(): DurableWorkRuntimeRunner {
  return {
    async start(): Promise<void> {},
    async stop(): Promise<void> {},
  };
}
