import { describe, expect, test } from "bun:test";
import { ok } from "@appaloft/core";
import {
  createExecutionContext,
  DurableSandboxAgentWorkQueue,
  type DurableWorkItemRecord,
  type DurableWorkQueueAdapter,
} from "../src";

describe("Sandbox Agent durable work", () => {
  test("[AGENT-TASK-RUN-001] keeps Task Run reconciliation durable for a full-day agent window", async () => {
    const recorded: DurableWorkItemRecord[] = [];
    const queue = {
      recordItem: async (_context: unknown, item: DurableWorkItemRecord) => {
        recorded.push(item);
        return ok(item);
      },
    } as unknown as DurableWorkQueueAdapter;
    const work = new DurableSandboxAgentWorkQueue(
      queue,
      { now: () => "2026-07-24T00:00:00.000Z" },
      { next: () => "dwi_task" },
    );

    await work.enqueue(
      createExecutionContext({
        entrypoint: "system",
        requestId: "req_task_durable_window",
        tenant: { tenantId: "tenant_demo", source: "test" },
      }),
      {
        kind: "agent-task-run",
        id: "srun_task",
        workspaceId: "sbx_task",
      },
    );

    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      operationKey: "sandboxes.agent-tasks.reconcile",
      subjectKind: "agent-task-run",
      maxAttempts: 8_640,
      safeInput: {
        tenantId: "tenant_demo",
        itemKind: "agent-task-run",
        itemId: "srun_task",
        workspaceId: "sbx_task",
      },
    });
  });
});
