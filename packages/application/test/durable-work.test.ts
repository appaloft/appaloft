import { describe, expect, test } from "bun:test";

import {
  createDurableWorkTopology,
  type DurableWorkLedger,
  type DurableWorkQueueAdapter,
  describeDurableWorkQueueBackend,
} from "../src/durable-work";

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
    });
  });

  test("[PROC-DELIVERY-WORKER-002] standalone Cloud topology can declare multiple workers", () => {
    const topology = createDurableWorkTopology({
      mode: "standalone",
      queueBackend: "database",
      workerCount: 3,
      workerGroup: "cloud-deployment-worker",
    });

    expect(topology.isOk()).toBe(true);
    if (topology.isErr()) throw new Error(topology.error.message);
    expect(topology.value.expectedWorkerCount).toBe(3);
    expect(topology.value.workers.map((worker) => worker.workerId)).toEqual([
      "cloud-deployment-worker-1",
      "cloud-deployment-worker-2",
      "cloud-deployment-worker-3",
    ]);
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
      "record",
      "list",
      "findOne",
      "listDueDeliveryCandidates",
      "listDueRetries",
      "generateDueRetry",
      "claimDue",
      "complete",
    ];

    expect(adapterMethods.sort()).toEqual([
      "claimDue",
      "complete",
      "findOne",
      "generateDueRetry",
      "list",
      "listDueDeliveryCandidates",
      "listDueRetries",
      "record",
    ]);
  });

  test("[PROC-DELIVERY-WORKER-015] durable work ledger is a public item/event contract", () => {
    const ledgerMethods: Array<keyof DurableWorkLedger> = [
      "recordItem",
      "appendEvent",
      "findItem",
      "listEvents",
    ];

    expect(ledgerMethods.sort()).toEqual(["appendEvent", "findItem", "listEvents", "recordItem"]);
  });
});
