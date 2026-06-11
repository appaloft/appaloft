import { hostname } from "node:os";
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
  type DurableWorkWorkerIdentity,
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
  const processId = `${hostname()}-${Date.parse(processStartedAt).toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`
    .replace(/[^a-zA-Z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  const leaseOwnerId = processId || Math.random().toString(36).slice(2, 10);
  const replicaId = `${Date.parse(processStartedAt).toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`
    .replace(/[^a-zA-Z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  const processWorkerId = `${input.topology.workerGroup}-replica-${
    replicaId || Math.random().toString(36).slice(2, 10)
  }`;
  const timers: ReturnType<typeof setInterval>[] = [];
  const activeWorkerTicks = new Map<string, Promise<void>>();
  let leasedWorker: DurableWorkWorkerIdentity | undefined;

  function workerById(workerId: string): DurableWorkWorkerIdentity | undefined {
    return (
      input.topology.workers.find((candidate) => candidate.workerId === workerId) ??
      (leasedWorker?.workerId === workerId ? leasedWorker : undefined)
    );
  }

  async function recordHeartbeat(workerId: string, lastSeenAt: string): Promise<void> {
    if (!input.heartbeatStore) {
      return;
    }

    const worker = workerById(workerId);
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
      leaseOwnerId,
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
    const worker = workerById(workerId);
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

  async function claimLeasedWorker(now: string) {
    if (!input.heartbeatStore) {
      input.logger.warn("durable_work_runtime.lease_skipped", {
        reason: "missing-heartbeat-store",
        workerGroup: input.topology.workerGroup,
      });
      return undefined;
    }

    const context = input.executionContextFactory.create({
      entrypoint: "system",
      actor: {
        kind: "system",
        id: leaseOwnerId,
        label: "Durable work runtime slot claimant",
      },
    });
    const staleBefore = new Date(Date.parse(now) - intervalSeconds * 3 * 1000).toISOString();
    const claim = await input.heartbeatStore.claimWorkerSlot(toRepositoryContext(context), {
      workerGroup: input.topology.workerGroup,
      workerCount: input.topology.expectedWorkerCount,
      leaseOwnerId,
      workerId: processWorkerId,
      mode: input.topology.mode,
      queueBackend: input.topology.queueBackend,
      processStartedAt,
      lastSeenAt: now,
      staleBefore,
    });
    if (claim.isErr()) {
      input.logger.warn("durable_work_runtime.lease_failed", {
        workerGroup: input.topology.workerGroup,
        errorCode: claim.error.code,
        message: claim.error.message,
      });
      return undefined;
    }

    if (!claim.value) {
      input.logger.warn("durable_work_runtime.lease_unavailable", {
        workerGroup: input.topology.workerGroup,
        expectedWorkerCount: input.topology.expectedWorkerCount,
      });
      return undefined;
    }

    return {
      workerId: claim.value.workerId,
      workerGroup: claim.value.workerGroup,
      slot: claim.value.slot,
    };
  }

  async function ensureLeasedWorkerTick(): Promise<void> {
    const now = new Date().toISOString();
    const worker = await claimLeasedWorker(now);
    if (!worker) {
      return;
    }

    if (leasedWorker?.workerId !== worker.workerId) {
      input.logger.info("durable_work_runtime.lease_acquired", {
        workerId: worker.workerId,
        workerGroup: worker.workerGroup,
        slot: worker.slot,
      });
      leasedWorker = worker;
    }

    startTick(worker.workerId);
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

      if (input.topology.slotAssignment === "leased") {
        await ensureLeasedWorkerTick();
        timers.push(
          setInterval(() => {
            void ensureLeasedWorkerTick();
          }, intervalSeconds * 1000),
        );
      } else {
        for (const worker of input.topology.workers) {
          startTick(worker.workerId);
          timers.push(
            setInterval(() => {
              startTick(worker.workerId);
            }, intervalSeconds * 1000),
          );
        }
      }

      input.logger.info("durable_work_runtime.drain_started", {
        intervalSeconds,
        batchSize,
        leaseDurationMs,
        workerIds: input.topology.workers.map((worker) => worker.workerId),
        slotAssignment: input.topology.slotAssignment,
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
          [...input.topology.workers, ...(leasedWorker ? [leasedWorker] : [])].map(
            async (worker) => {
              const context = input.executionContextFactory.create({
                entrypoint: "system",
                actor: {
                  kind: "system",
                  id: worker.workerId,
                  label: "Durable work runtime heartbeat",
                },
              });
              const stopped = await input.heartbeatStore?.markStopped(
                toRepositoryContext(context),
                {
                  workerId: worker.workerId,
                  leaseOwnerId,
                  lastSeenAt: stoppedAt,
                },
              );
              if (stopped?.isErr()) {
                input.logger.warn("durable_work_runtime.heartbeat_stop_failed", {
                  workerId: worker.workerId,
                  errorCode: stopped.error.code,
                  message: stopped.error.message,
                });
              }
            },
          ),
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
