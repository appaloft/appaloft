import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import {
  type AppLogger,
  createExecutionContext,
  type DurableWorkClaimInput,
  type DurableWorkClaimResult,
  type DurableWorkCompletionInput,
  type DurableWorkCompletionResult,
  type DurableWorkDeliveryCandidateFilter,
  type DurableWorkEventRecord,
  type DurableWorkHandler,
  type DurableWorkItemRecord,
  type DurableWorkListFilter,
  type DurableWorkQueueAdapter,
  type DurableWorkWorkerHeartbeatFilter,
  type DurableWorkWorkerHeartbeatRecord,
  type DurableWorkWorkerHeartbeatStore,
  type DurableWorkWorkerSlotClaimInput,
  type ExecutionContextFactory,
  type RepositoryContext,
} from "@appaloft/application";
import { ok, type Result } from "@appaloft/core";
import {
  createCompositeDurableWorkHandlerRegistry,
  createDurableWorkRuntimeRunner,
} from "../src/durable-work-runtime-runner";

function durableWorkItem(overrides: Partial<DurableWorkItemRecord> = {}): DurableWorkItemRecord {
  return {
    id: "dw_test",
    kind: "deployment",
    status: "pending",
    operationKey: "deployments.create",
    queueBackend: "database",
    priority: 0,
    attemptCount: 0,
    maxAttempts: 1,
    availableAt: "2026-06-08T00:00:00.000Z",
    updatedAt: "2026-06-08T00:00:00.000Z",
    ...overrides,
  };
}

async function waitFor<T>(
  callback: () => Promise<T | null>,
  input: { timeoutMs: number; intervalMs: number },
): Promise<T | null> {
  const deadline = Date.now() + input.timeoutMs;
  while (Date.now() < deadline) {
    const value = await callback();
    if (value) {
      return value;
    }
    await new Promise((resolve) => setTimeout(resolve, input.intervalMs));
  }
  return null;
}

class InMemoryDurableWorkQueueAdapter implements DurableWorkQueueAdapter {
  readonly items = new Map<string, DurableWorkItemRecord>();
  readonly events = new Map<string, DurableWorkEventRecord[]>();

  async recordItem(
    _context: RepositoryContext,
    item: DurableWorkItemRecord,
  ): Promise<Result<DurableWorkItemRecord>> {
    this.items.set(item.id, item);
    return ok(item);
  }

  async appendEvent(
    _context: RepositoryContext,
    event: DurableWorkEventRecord,
  ): Promise<Result<DurableWorkEventRecord>> {
    this.events.set(event.workItemId, [...(this.events.get(event.workItemId) ?? []), event]);
    return ok(event);
  }

  async findItem(
    _context: RepositoryContext,
    id: string,
  ): Promise<Result<DurableWorkItemRecord | null>> {
    return ok(this.items.get(id) ?? null);
  }

  async listItems(
    _context: RepositoryContext,
    filter: DurableWorkListFilter = {},
  ): Promise<Result<DurableWorkItemRecord[]>> {
    return ok(
      [...this.items.values()]
        .filter((item) => !filter.kind || item.kind === filter.kind)
        .filter((item) => !filter.status || item.status === filter.status)
        .filter((item) => !filter.operationKey || item.operationKey === filter.operationKey)
        .filter((item) => !filter.projectId || item.projectId === filter.projectId)
        .filter((item) => !filter.resourceId || item.resourceId === filter.resourceId)
        .filter((item) => !filter.deploymentId || item.deploymentId === filter.deploymentId)
        .filter((item) => !filter.serverId || item.serverId === filter.serverId)
        .filter((item) => !filter.subjectKind || item.subjectKind === filter.subjectKind)
        .filter((item) => !filter.subjectId || item.subjectId === filter.subjectId)
        .slice(0, filter.limit),
    );
  }

  async listEvents(
    _context: RepositoryContext,
    workItemId: string,
  ): Promise<Result<DurableWorkEventRecord[]>> {
    return ok(this.events.get(workItemId) ?? []);
  }

  async listDueCandidates(
    _context: RepositoryContext,
    filter: DurableWorkDeliveryCandidateFilter,
  ): Promise<Result<DurableWorkItemRecord[]>> {
    const now = Date.parse(filter.now);
    return ok(
      [...this.items.values()]
        .filter((item) => item.status === "pending" || item.status === "retry-scheduled")
        .filter((item) => Date.parse(item.availableAt) <= now)
        .filter((item) => !filter.kind || item.kind === filter.kind)
        .filter((item) => !filter.operationKey || item.operationKey === filter.operationKey)
        .sort((left, right) => left.priority - right.priority)
        .slice(0, filter.limit),
    );
  }

  async claimDue(
    _context: RepositoryContext,
    input: DurableWorkClaimInput,
  ): Promise<Result<DurableWorkClaimResult>> {
    const item = this.items.get(input.workItemId);
    if (!item) {
      return ok({ status: "not-found", workItemId: input.workItemId });
    }
    if (item.status !== "pending" && item.status !== "retry-scheduled") {
      return ok({ status: "refused", reason: "not-claimable", workItem: item });
    }

    const claimed: DurableWorkItemRecord = {
      ...item,
      status: "running",
      leaseOwner: input.workerId,
      leaseExpiresAt: input.leaseExpiresAt,
      startedAt: input.claimedAt,
      updatedAt: input.claimedAt,
      ...(input.safeDetails ? { safeDetails: input.safeDetails } : {}),
    };
    this.items.set(claimed.id, claimed);
    return ok({ status: "claimed", workItem: claimed });
  }

  async complete(
    _context: RepositoryContext,
    input: DurableWorkCompletionInput,
  ): Promise<Result<DurableWorkCompletionResult>> {
    const item = this.items.get(input.workItemId);
    if (!item) {
      return ok({ status: "not-found", workItemId: input.workItemId });
    }
    if (item.status !== "running") {
      return ok({ status: "not-running", workItem: item });
    }

    const completed: DurableWorkItemRecord = {
      ...item,
      status: input.status,
      updatedAt: input.completedAt,
      finishedAt: input.completedAt,
      ...(input.phase ? { phase: input.phase } : {}),
      ...(input.step ? { step: input.step } : {}),
      ...(input.errorCode ? { errorCode: input.errorCode } : {}),
      ...(input.errorCategory ? { errorCategory: input.errorCategory } : {}),
      ...(input.retriable !== undefined ? { retriable: input.retriable } : {}),
      ...(input.nextAvailableAt ? { availableAt: input.nextAvailableAt } : {}),
      ...(input.safeDetails ? { safeDetails: input.safeDetails } : {}),
    };
    this.items.set(completed.id, completed);
    return ok({ status: "completed", workItem: completed });
  }
}

class InMemoryDurableWorkWorkerHeartbeatStore implements DurableWorkWorkerHeartbeatStore {
  readonly heartbeats = new Map<string, DurableWorkWorkerHeartbeatRecord>();

  async claimWorkerSlot(
    _context: RepositoryContext,
    input: DurableWorkWorkerSlotClaimInput,
  ): Promise<Result<DurableWorkWorkerHeartbeatRecord | null>> {
    for (let slot = 1; slot <= input.workerCount; slot += 1) {
      const existing = [...this.heartbeats.values()].find(
        (heartbeat) => heartbeat.workerGroup === input.workerGroup && heartbeat.slot === slot,
      );
      if (
        existing &&
        existing.leaseOwnerId !== input.leaseOwnerId &&
        existing.workerId !== input.workerId &&
        existing.status === "online" &&
        existing.lastSeenAt >= input.staleBefore
      ) {
        continue;
      }

      const heartbeat: DurableWorkWorkerHeartbeatRecord = {
        workerId: input.workerId,
        workerGroup: input.workerGroup,
        slot,
        mode: input.mode,
        queueBackend: input.queueBackend,
        leaseOwnerId: input.leaseOwnerId,
        processStartedAt: input.processStartedAt,
        lastSeenAt: input.lastSeenAt,
        status: "online",
      };
      if (existing?.workerId && existing.workerId !== input.workerId) {
        this.heartbeats.delete(existing.workerId);
      }
      this.heartbeats.set(input.workerId, heartbeat);
      return ok(heartbeat);
    }

    return ok(null);
  }

  async recordHeartbeat(
    _context: RepositoryContext,
    heartbeat: DurableWorkWorkerHeartbeatRecord,
  ): Promise<Result<DurableWorkWorkerHeartbeatRecord>> {
    const existing = [...this.heartbeats.values()].find(
      (record) => record.workerGroup === heartbeat.workerGroup && record.slot === heartbeat.slot,
    );
    if (
      existing &&
      existing.leaseOwnerId &&
      heartbeat.leaseOwnerId &&
      existing.leaseOwnerId !== heartbeat.leaseOwnerId
    ) {
      return ok(existing);
    }
    if (existing?.workerId && existing.workerId !== heartbeat.workerId) {
      this.heartbeats.delete(existing.workerId);
    }
    this.heartbeats.set(heartbeat.workerId, heartbeat);
    return ok(heartbeat);
  }

  async markStopped(
    _context: RepositoryContext,
    input: Pick<DurableWorkWorkerHeartbeatRecord, "workerId" | "lastSeenAt"> &
      Pick<Partial<DurableWorkWorkerHeartbeatRecord>, "leaseOwnerId">,
  ): Promise<Result<void>> {
    const existing = this.heartbeats.get(input.workerId);
    if (input.leaseOwnerId && existing?.leaseOwnerId !== input.leaseOwnerId) {
      return ok(undefined);
    }
    const stoppedBase: DurableWorkWorkerHeartbeatRecord = existing ?? {
      workerId: input.workerId,
      workerGroup: "appaloft-worker",
      slot: 1,
      mode: "embedded",
      queueBackend: "database",
      processStartedAt: input.lastSeenAt,
      lastSeenAt: input.lastSeenAt,
      status: "stopping",
    };
    const stopped: DurableWorkWorkerHeartbeatRecord = {
      ...stoppedBase,
      ...(existing ?? {
        workerId: input.workerId,
        workerGroup: "appaloft-worker",
        slot: 1,
        mode: "embedded",
        queueBackend: "database",
        processStartedAt: input.lastSeenAt,
      }),
      lastSeenAt: input.lastSeenAt,
      status: "stopping",
    };
    this.heartbeats.set(input.workerId, stopped);
    return ok(undefined);
  }

  async listHeartbeats(
    _context: RepositoryContext,
    filter: DurableWorkWorkerHeartbeatFilter = {},
  ): Promise<Result<DurableWorkWorkerHeartbeatRecord[]>> {
    return ok(
      [...this.heartbeats.values()]
        .filter((heartbeat) => !filter.workerGroup || heartbeat.workerGroup === filter.workerGroup)
        .filter((heartbeat) => !filter.status || heartbeat.status === filter.status),
    );
  }
}

const logger: AppLogger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
};

const executionContextFactory: ExecutionContextFactory = {
  create(input) {
    return createExecutionContext(input);
  },
};

describe("durable work server runtime", () => {
  test("[PROC-DELIVERY-WORKER-028] runtime handler registry accepts public extension handlers", () => {
    const deploymentHandler: DurableWorkHandler = {
      async handle() {
        return ok({});
      },
    };
    const blueprintInstallHandler: DurableWorkHandler = {
      async handle() {
        return ok({});
      },
    };
    const registry = createCompositeDurableWorkHandlerRegistry(deploymentHandler, {
      resolve(item) {
        return item.kind === "blueprint-install" ? blueprintInstallHandler : undefined;
      },
    });

    expect(registry.resolve(durableWorkItem({ kind: "deployment" }))).toBe(deploymentHandler);
    expect(registry.resolve(durableWorkItem({ kind: "blueprint-install" }))).toBe(
      blueprintInstallHandler,
    );
    expect(registry.resolve(durableWorkItem({ kind: "unhandled" }))).toBeUndefined();
  });

  test("[PROC-DELIVERY-WORKER-023] runtime drains extension work without blocking startup", async () => {
    const adapter = new InMemoryDurableWorkQueueAdapter();
    const heartbeatStore = new InMemoryDurableWorkWorkerHeartbeatStore();
    const workItem = durableWorkItem({
      id: "dw_blueprint_install",
      kind: "blueprint-install",
      operationKey: "blueprints.install",
      subjectKind: "installed-application",
      subjectId: "cia_test",
    });
    adapter.items.set(workItem.id, workItem);

    let releaseHandler: (() => void) | undefined;
    const handlerStarted = Promise.withResolvers<void>();
    const handlerRelease = new Promise<void>((resolve) => {
      releaseHandler = resolve;
    });
    const blueprintInstallHandler: DurableWorkHandler = {
      async handle(_context, item, worker) {
        expect(item.id).toBe(workItem.id);
        expect(worker.workerId).toBe("appaloft-worker-1");
        handlerStarted.resolve();
        await handlerRelease;
        return ok({
          status: "succeeded",
          phase: "install",
          step: "finished",
          safeDetails: { applicationId: "cia_test" },
        });
      },
    };

    const runner = createDurableWorkRuntimeRunner({
      topology: {
        mode: "embedded",
        queueBackend: "database",
        expectedWorkerCount: 1,
        coordinationRole: "coordinator",
        slotAssignment: "all-local",
        workers: [
          {
            workerId: "appaloft-worker-1",
            workerGroup: "appaloft-worker",
            slot: 1,
          },
        ],
      },
      adapter,
      heartbeatStore,
      deploymentRepository: {} as never,
      deploymentLifecycleService: {} as never,
      executionBackend: {} as never,
      eventBus: {} as never,
      processAttemptRecorder: {} as never,
      executionContextFactory,
      logger,
      handlerRegistry: {
        resolve(item) {
          return item.kind === "blueprint-install" ? blueprintInstallHandler : undefined;
        },
      },
      intervalSeconds: 60,
      batchSize: 5,
      leaseDurationMs: 300_000,
    });

    try {
      const startup = await Promise.race([
        runner.start().then(() => "started" as const),
        new Promise<"blocked">((resolve) => setTimeout(() => resolve("blocked"), 50)),
      ]);
      expect(startup).toBe("started");

      await handlerStarted.promise;
      const heartbeat = await waitFor(
        async () => {
          const records = await heartbeatStore.listHeartbeats(
            createExecutionContext({ entrypoint: "system", requestId: "req_test" }),
            { workerGroup: "appaloft-worker", status: "online" },
          );
          return records._unsafeUnwrap()[0] ?? null;
        },
        { timeoutMs: 1_000, intervalMs: 10 },
      );
      expect(heartbeat).toMatchObject({
        workerId: "appaloft-worker-1",
        workerGroup: "appaloft-worker",
        status: "online",
        queueBackend: "database",
      });

      releaseHandler?.();
      const completed = await waitFor(
        async () => {
          const item = adapter.items.get(workItem.id);
          return item?.status === "succeeded" ? item : null;
        },
        { timeoutMs: 1_000, intervalMs: 10 },
      );
      expect(completed).toMatchObject({
        id: workItem.id,
        status: "succeeded",
        phase: "install",
        step: "finished",
        safeDetails: { applicationId: "cia_test" },
      });
    } finally {
      releaseHandler?.();
      await runner.stop();
    }
  });

  test("[PROC-DELIVERY-WORKER-029] shutdown waits for an active drain tick", async () => {
    const adapter = new InMemoryDurableWorkQueueAdapter();
    const heartbeatStore = new InMemoryDurableWorkWorkerHeartbeatStore();
    const workItem = durableWorkItem({
      id: "dw_shutdown_drain",
      kind: "blueprint-install",
      operationKey: "blueprints.install",
      subjectKind: "installed-application",
      subjectId: "cia_shutdown",
    });
    adapter.items.set(workItem.id, workItem);

    let releaseHandler: (() => void) | undefined;
    const handlerStarted = Promise.withResolvers<void>();
    const handlerRelease = new Promise<void>((resolve) => {
      releaseHandler = resolve;
    });
    const blueprintInstallHandler: DurableWorkHandler = {
      async handle() {
        handlerStarted.resolve();
        await handlerRelease;
        return ok({
          status: "succeeded",
          phase: "install",
          step: "finished",
          safeDetails: { applicationId: "cia_shutdown" },
        });
      },
    };

    const runner = createDurableWorkRuntimeRunner({
      topology: {
        mode: "embedded",
        queueBackend: "database",
        expectedWorkerCount: 1,
        coordinationRole: "coordinator",
        slotAssignment: "all-local",
        workers: [
          {
            workerId: "appaloft-worker-1",
            workerGroup: "appaloft-worker",
            slot: 1,
          },
        ],
      },
      adapter,
      heartbeatStore,
      deploymentRepository: {} as never,
      deploymentLifecycleService: {} as never,
      executionBackend: {} as never,
      eventBus: {} as never,
      processAttemptRecorder: {} as never,
      executionContextFactory,
      logger,
      handlerRegistry: {
        resolve(item) {
          return item.kind === "blueprint-install" ? blueprintInstallHandler : undefined;
        },
      },
      intervalSeconds: 60,
      batchSize: 5,
      leaseDurationMs: 300_000,
    });

    await runner.start();
    await handlerStarted.promise;

    const stopped = runner.stop();
    const earlyStop = await Promise.race([
      stopped.then(() => "stopped" as const),
      new Promise<"waiting">((resolve) => setTimeout(() => resolve("waiting"), 50)),
    ]);
    expect(earlyStop).toBe("waiting");

    releaseHandler?.();
    await stopped;

    expect(adapter.items.get(workItem.id)).toMatchObject({
      id: workItem.id,
      status: "succeeded",
      phase: "install",
      step: "finished",
      safeDetails: { applicationId: "cia_shutdown" },
    });
    expect(heartbeatStore.heartbeats.get("appaloft-worker-1")).toMatchObject({
      workerId: "appaloft-worker-1",
      status: "stopping",
    });
  });

  test("[PROC-DELIVERY-WORKER-032] standalone replica runners lease distinct worker slots", async () => {
    const adapter = new InMemoryDurableWorkQueueAdapter();
    const heartbeatStore = new InMemoryDurableWorkWorkerHeartbeatStore();
    const topology = {
      mode: "standalone" as const,
      queueBackend: "database" as const,
      expectedWorkerCount: 2,
      coordinationRole: "worker" as const,
      slotAssignment: "leased" as const,
      workerGroup: "appaloft-worker",
      workers: [],
    };

    const createRunner = () =>
      createDurableWorkRuntimeRunner({
        topology,
        adapter,
        heartbeatStore,
        deploymentRepository: {} as never,
        deploymentLifecycleService: {} as never,
        executionBackend: {} as never,
        eventBus: {} as never,
        processAttemptRecorder: {} as never,
        executionContextFactory,
        logger,
        intervalSeconds: 60,
        batchSize: 5,
        leaseDurationMs: 300_000,
      });

    const first = createRunner();
    const second = createRunner();

    try {
      await first.start();
      await second.start();

      const heartbeats = await waitFor(
        async () => {
          const records = await heartbeatStore.listHeartbeats(
            createExecutionContext({ entrypoint: "system", requestId: "req_test" }),
            { workerGroup: "appaloft-worker", status: "online" },
          );
          const values = records._unsafeUnwrap();
          return values.length === 2 ? values : null;
        },
        { timeoutMs: 1_000, intervalMs: 10 },
      );

      expect(new Set(heartbeats?.map((heartbeat) => heartbeat.workerId)).size).toBe(2);
      expect(
        heartbeats?.every((heartbeat) => heartbeat.workerId.startsWith("appaloft-worker-")),
      ).toBe(true);
      expect(heartbeats?.map((heartbeat) => heartbeat.slot).sort()).toEqual([1, 2]);
      expect(new Set(heartbeats?.map((heartbeat) => heartbeat.leaseOwnerId)).size).toBe(2);
    } finally {
      await first.stop();
      await second.stop();
    }
  });
});
