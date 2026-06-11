import { describe, expect, test } from "bun:test";
import { domainError, err, ok, type Result } from "@appaloft/core";

import {
  createDurableWorkTopology,
  type DurableWorkClaimInput,
  type DurableWorkClaimResult,
  type DurableWorkCompletionInput,
  type DurableWorkCompletionResult,
  type DurableWorkDeliveryCandidateFilter,
  type DurableWorkEventRecord,
  type DurableWorkHandlerRegistry,
  type DurableWorkItemRecord,
  type DurableWorkLedger,
  type DurableWorkListFilter,
  type DurableWorkQueueAdapter,
  describeDurableWorkQueueBackend,
  drainDurableWorkOnce,
} from "../src/durable-work";
import { createExecutionContext, type RepositoryContext } from "../src/execution-context";

function executionContext() {
  return createExecutionContext({
    entrypoint: "system",
    requestId: "req_durable_work_test",
    tracer: {
      startActiveSpan(_name, _options, callback) {
        return Promise.resolve(
          callback({
            addEvent() {},
            recordError() {},
            setAttribute() {},
            setAttributes() {},
            setStatus() {},
          }),
        );
      },
    },
  });
}

function durableWorkItem(input: Partial<DurableWorkItemRecord> = {}): DurableWorkItemRecord {
  return {
    id: "dw_test_1",
    kind: "deployment",
    status: "pending",
    operationKey: "deployments.create",
    queueBackend: "database",
    priority: 10,
    attemptCount: 0,
    maxAttempts: 3,
    availableAt: "2026-06-08T00:00:00.000Z",
    updatedAt: "2026-06-08T00:00:00.000Z",
    ...input,
  };
}

class MemoryDurableWorkAdapter implements DurableWorkQueueAdapter {
  readonly claims: DurableWorkClaimInput[] = [];
  readonly completions: DurableWorkCompletionInput[] = [];

  constructor(private readonly candidates: DurableWorkItemRecord[]) {}

  async recordItem(
    _context: RepositoryContext,
    item: DurableWorkItemRecord,
  ): Promise<Result<DurableWorkItemRecord>> {
    return ok(item);
  }

  async appendEvent(
    _context: RepositoryContext,
    event: DurableWorkEventRecord,
  ): Promise<Result<DurableWorkEventRecord>> {
    return ok(event);
  }

  async findItem(
    _context: RepositoryContext,
    id: string,
  ): Promise<Result<DurableWorkItemRecord | null>> {
    return ok(this.candidates.find((item) => item.id === id) ?? null);
  }

  async listItems(
    _context: RepositoryContext,
    _filter?: DurableWorkListFilter,
  ): Promise<Result<DurableWorkItemRecord[]>> {
    return ok(this.candidates);
  }

  async listEvents(
    _context: RepositoryContext,
    _workItemId: string,
  ): Promise<Result<DurableWorkEventRecord[]>> {
    return ok([]);
  }

  async listDueCandidates(
    _context: RepositoryContext,
    _filter: DurableWorkDeliveryCandidateFilter,
  ): Promise<Result<DurableWorkItemRecord[]>> {
    return ok(this.candidates);
  }

  async claimDue(
    _context: RepositoryContext,
    input: DurableWorkClaimInput,
  ): Promise<Result<DurableWorkClaimResult>> {
    this.claims.push(input);
    const item = this.candidates.find((candidate) => candidate.id === input.workItemId);
    if (!item) {
      return ok({ status: "not-found", workItemId: input.workItemId });
    }
    return ok({
      status: "claimed",
      workItem: {
        ...item,
        status: "running",
        attemptCount: item.attemptCount + 1,
        leaseOwner: input.workerId,
        leaseExpiresAt: input.leaseExpiresAt,
        phase: "worker-claim",
        step: "claimed",
        startedAt: input.claimedAt,
        updatedAt: input.claimedAt,
      },
    });
  }

  async complete(
    _context: RepositoryContext,
    input: DurableWorkCompletionInput,
  ): Promise<Result<DurableWorkCompletionResult>> {
    this.completions.push(input);
    const item = this.candidates.find((candidate) => candidate.id === input.workItemId);
    if (!item) {
      return ok({ status: "not-found", workItemId: input.workItemId });
    }
    return ok({
      status: "completed",
      workItem: {
        ...item,
        status: input.status,
        updatedAt: input.completedAt,
        finishedAt: input.completedAt,
      },
    });
  }
}

describe("durable work topology", () => {
  test("[PROC-DELIVERY-WORKER-001] embedded server runtime starts an explicit worker set", () => {
    const topology = createDurableWorkTopology({
      mode: "embedded",
      queueBackend: "database",
      workerCount: 1,
      workerGroup: "appaloft-server",
    });

    expect(topology.isOk()).toBe(true);
    if (topology.isErr()) throw new Error(topology.error.message);
    expect(topology.value).toEqual({
      mode: "embedded",
      queueBackend: "database",
      workerGroup: "appaloft-server",
      expectedWorkerCount: 1,
      workers: [
        {
          workerId: "appaloft-server-1",
          workerGroup: "appaloft-server",
          slot: 1,
        },
      ],
      coordinationRole: "coordinator",
      slotAssignment: "all-local",
    });
  });

  test("[PROC-DELIVERY-WORKER-002] standalone Cloud topology expects leased worker slots", () => {
    const topology = createDurableWorkTopology({
      mode: "standalone",
      queueBackend: "database",
      workerCount: 3,
      workerGroup: "cloud-deployment-worker",
    });

    expect(topology.isOk()).toBe(true);
    if (topology.isErr()) throw new Error(topology.error.message);
    expect(topology.value.expectedWorkerCount).toBe(3);
    expect(topology.value.workers).toEqual([]);
    expect(topology.value.coordinationRole).toBe("worker");
    expect(topology.value.slotAssignment).toBe("leased");
  });

  test("[PROC-DELIVERY-WORKER-030] standalone process can claim one explicit worker slot", () => {
    const topology = createDurableWorkTopology({
      mode: "standalone",
      queueBackend: "database",
      workerCount: 4,
      workerGroup: "cloud-deployment-worker",
      workerSlot: 3,
    });

    expect(topology.isOk()).toBe(true);
    if (topology.isErr()) throw new Error(topology.error.message);
    expect(topology.value.expectedWorkerCount).toBe(4);
    expect(topology.value.coordinationRole).toBe("worker");
    expect(topology.value.workers).toEqual([
      {
        workerId: "cloud-deployment-worker-3",
        workerGroup: "cloud-deployment-worker",
        slot: 3,
      },
    ]);
    expect(topology.value.slotAssignment).toBe("explicit");
  });

  test("[PROC-DELIVERY-WORKER-031] rejects worker slots outside the configured group size", () => {
    const topology = createDurableWorkTopology({
      mode: "standalone",
      queueBackend: "database",
      workerCount: 2,
      workerGroup: "cloud-deployment-worker",
      workerSlot: 3,
    });

    expect(topology.isErr()).toBe(true);
    if (topology.isOk()) throw new Error("Expected topology validation to fail");
    expect(topology.error.details?.field).toBe("workerSlot");
  });

  test("[PROC-DELIVERY-WORKER-003] disabled topology advertises no workers", () => {
    const topology = createDurableWorkTopology({
      mode: "disabled",
      queueBackend: "database",
      workerCount: 0,
      workerGroup: "local-cli",
    });

    expect(topology.isOk()).toBe(true);
    if (topology.isErr()) throw new Error(topology.error.message);
    expect(topology.value.expectedWorkerCount).toBe(0);
    expect(topology.value.workers).toEqual([]);
    expect(topology.value.coordinationRole).toBe("disabled");
    expect(topology.value.slotAssignment).toBe("none");
  });

  test("[PROC-DELIVERY-WORKER-004] enabled runtime rejects zero workers", () => {
    const topology = createDurableWorkTopology({
      mode: "embedded",
      queueBackend: "database",
      workerCount: 0,
      workerGroup: "appaloft-server",
    });

    expect(topology.isErr()).toBe(true);
    if (topology.isOk()) throw new Error("Expected topology validation to fail");
    expect(topology.error.details?.field).toBe("workerCount");
  });
});

describe("durable work queue backend", () => {
  test("[PROC-DELIVERY-WORKER-005] database queue keeps durable work ledger as state authority", () => {
    const descriptor = describeDurableWorkQueueBackend({
      queueBackend: "database",
    });

    expect(descriptor.isOk()).toBe(true);
    if (descriptor.isErr()) throw new Error(descriptor.error.message);
    expect(descriptor.value).toMatchObject({
      backend: "database",
      durableStateAuthority: "durable-work-ledger",
      supportsMultipleWorkers: true,
      supportsAtomicClaim: true,
    });
  });

  test("[PROC-DELIVERY-WORKER-006] external queue requires a backend adapter kind", () => {
    const descriptor = describeDurableWorkQueueBackend({
      queueBackend: "external",
    });

    expect(descriptor.isErr()).toBe(true);
    if (descriptor.isOk()) throw new Error("Expected backend validation to fail");
    expect(descriptor.error.details?.field).toBe("externalBackendKind");
  });

  test("[PROC-DELIVERY-WORKER-007] external queue remains replaceable behind one adapter contract", () => {
    const descriptor = describeDurableWorkQueueBackend({
      queueBackend: "external",
      externalBackendKind: "temporal",
    });

    expect(descriptor.isOk()).toBe(true);
    if (descriptor.isErr()) throw new Error(descriptor.error.message);
    expect(descriptor.value).toEqual({
      backend: "external",
      externalBackendKind: "temporal",
      durableStateAuthority: "external-workflow-engine-with-process-attempt-projection",
      supportsMultipleWorkers: true,
      supportsAtomicClaim: true,
    });
  });

  test("[PROC-DELIVERY-WORKER-008] queue adapter is the single public claim/progress contract", () => {
    const adapterMethods: Array<keyof DurableWorkQueueAdapter> = [
      "recordItem",
      "appendEvent",
      "findItem",
      "listItems",
      "listEvents",
      "listDueCandidates",
      "claimDue",
      "complete",
    ];

    expect(adapterMethods.sort()).toEqual([
      "appendEvent",
      "claimDue",
      "complete",
      "findItem",
      "listDueCandidates",
      "listEvents",
      "listItems",
      "recordItem",
    ]);
  });

  test("[PROC-DELIVERY-WORKER-015] durable work ledger is a public item/event contract", () => {
    const ledgerMethods: Array<keyof DurableWorkLedger> = [
      "recordItem",
      "appendEvent",
      "findItem",
      "listItems",
      "listEvents",
    ];

    expect(ledgerMethods.sort()).toEqual([
      "appendEvent",
      "findItem",
      "listEvents",
      "listItems",
      "recordItem",
    ]);
  });
});

describe("durable work drain", () => {
  test("[PROC-DELIVERY-WORKER-017] worker drains due work through claim and completion", async () => {
    const adapter = new MemoryDurableWorkAdapter([durableWorkItem()]);
    const handlers: DurableWorkHandlerRegistry = {
      resolve() {
        return {
          async handle() {
            return ok({
              status: "succeeded",
              phase: "release",
              step: "finished",
              safeDetails: {
                imageDigest: "sha256:abc",
              },
            });
          },
        };
      },
    };

    const report = await drainDurableWorkOnce(executionContext(), adapter, handlers, {
      worker: {
        workerId: "worker-1",
        workerGroup: "worker",
        slot: 1,
      },
      now: "2026-06-08T00:00:01.000Z",
      leaseDurationMs: 300000,
    });

    expect(report.isOk()).toBe(true);
    if (report.isErr()) throw new Error(report.error.message);
    expect(report.value).toEqual({
      scanned: 1,
      claimed: 1,
      completed: 1,
      failed: 0,
      skipped: 0,
    });
    expect(adapter.claims).toEqual([
      {
        workItemId: "dw_test_1",
        workerId: "worker-1",
        workerGroup: "worker",
        claimedAt: "2026-06-08T00:00:01.000Z",
        leaseExpiresAt: "2026-06-08T00:05:01.000Z",
      },
    ]);
    expect(adapter.completions).toEqual([
      {
        workItemId: "dw_test_1",
        status: "succeeded",
        completedAt: "2026-06-08T00:00:01.000Z",
        phase: "release",
        step: "finished",
        safeDetails: {
          imageDigest: "sha256:abc",
        },
      },
    ]);
  });

  test("[PROC-DELIVERY-WORKER-018] worker skips due work without a registered handler", async () => {
    const adapter = new MemoryDurableWorkAdapter([durableWorkItem()]);
    const report = await drainDurableWorkOnce(
      executionContext(),
      adapter,
      {
        resolve() {
          return undefined;
        },
      },
      {
        worker: {
          workerId: "worker-1",
          workerGroup: "worker",
          slot: 1,
        },
        now: "2026-06-08T00:00:01.000Z",
        leaseDurationMs: 300000,
      },
    );

    expect(report.isOk()).toBe(true);
    if (report.isErr()) throw new Error(report.error.message);
    expect(report.value).toEqual({
      scanned: 1,
      claimed: 0,
      completed: 0,
      failed: 0,
      skipped: 1,
    });
    expect(adapter.claims).toEqual([]);
    expect(adapter.completions).toEqual([]);
  });

  test("[PROC-DELIVERY-WORKER-019] worker completes claimed work as failed when handler fails", async () => {
    const adapter = new MemoryDurableWorkAdapter([durableWorkItem()]);
    const handlers: DurableWorkHandlerRegistry = {
      resolve() {
        return {
          async handle() {
            return err(
              domainError.infra("Deployment handler failed", {
                phase: "test",
              }),
            );
          },
        };
      },
    };

    const report = await drainDurableWorkOnce(executionContext(), adapter, handlers, {
      worker: {
        workerId: "worker-1",
        workerGroup: "worker",
        slot: 1,
      },
      now: "2026-06-08T00:00:01.000Z",
      leaseDurationMs: 300000,
    });

    expect(report.isOk()).toBe(true);
    if (report.isErr()) throw new Error(report.error.message);
    expect(report.value).toEqual({
      scanned: 1,
      claimed: 1,
      completed: 0,
      failed: 1,
      skipped: 0,
    });
    expect(adapter.completions).toEqual([
      {
        workItemId: "dw_test_1",
        status: "failed",
        completedAt: "2026-06-08T00:00:01.000Z",
        phase: "worker-claim",
        step: "claimed",
        errorCode: "infra_error",
        errorCategory: "infra",
        retriable: true,
      },
    ]);
  });
});
