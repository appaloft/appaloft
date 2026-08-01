import { describe, expect, test } from "bun:test";
import { ok } from "@appaloft/core";
import {
  type AgentTaskRunService,
  createExecutionContext,
  DurableSandboxAgentWorkQueue,
  type DurableWorkItemRecord,
  type DurableWorkQueueAdapter,
  type ExecutionContext,
  type SandboxAgentDeliveryService,
  SandboxAgentDurableWorkHandler,
} from "../src";

describe("Sandbox Agent durable work", () => {
  test("[AGENT-TASK-RUN-001][GH-AUTO-DURABLE-CREDENTIAL-023] keeps Task Run tenant scope durable for a full-day agent window", async () => {
    const recorded: DurableWorkItemRecord[] = [];
    const queue = {
      listItems: async () => ok([]),
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
        tenant: {
          tenantId: "tenant_demo",
          organizationId: "org_demo",
          source: "test",
        },
      }),
      {
        kind: "agent-task-run",
        id: "srun_task",
        workspaceId: "sbx_task",
        activeRunId: "srun_task",
      },
    );

    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      operationKey: "sandboxes.agent-tasks.reconcile",
      subjectKind: "agent-task-run",
      dedupeKey: "agent-task-run:srun_task:srun_task",
      maxAttempts: 8_640,
      safeInput: {
        tenantId: "tenant_demo",
        organizationId: "org_demo",
        itemKind: "agent-task-run",
        itemId: "srun_task",
        workspaceId: "sbx_task",
        activeRunId: "srun_task",
      },
    });
  });

  test("[GH-AUTO-CONTROL-010][GH-AUTO-LINEAGE-012][GH-AUTO-DURABLE-CREDENTIAL-023] dedupes one durable item per active Agent Run generation", async () => {
    const recorded = new Map<string, DurableWorkItemRecord>();
    const queue = {
      listItems: async (_context: unknown, filter: { subjectId?: string }) =>
        ok(
          [...recorded.values()].filter(
            (item) => !filter.subjectId || item.subjectId === filter.subjectId,
          ),
        ),
      recordItem: async (_context: unknown, item: DurableWorkItemRecord) => {
        if ([...recorded.values()].some((existing) => existing.dedupeKey === item.dedupeKey)) {
          return {
            isOk: () => false,
            isErr: () => true,
            error: new Error("duplicate durable work dedupe key"),
          };
        }
        recorded.set(item.id, item);
        return ok(item);
      },
    } as unknown as DurableWorkQueueAdapter;
    let sequence = 0;
    const work = new DurableSandboxAgentWorkQueue(
      queue,
      { now: () => "2026-07-24T00:00:00.000Z" },
      { next: () => `dwi_task_${++sequence}` },
    );
    const context = createExecutionContext({
      entrypoint: "system",
      requestId: "req_task_generation",
      tenant: {
        tenantId: "tenant_demo",
        organizationId: "org_demo",
        source: "test",
      },
    });

    await work.enqueue(context, {
      kind: "agent-task-run",
      id: "srun_task",
      workspaceId: "sbx_task",
      activeRunId: "srun_task",
    });
    await work.enqueue(context, {
      kind: "agent-task-run",
      id: "srun_task",
      workspaceId: "sbx_task",
      activeRunId: "srun_task",
    });
    await work.enqueue(context, {
      kind: "agent-task-run",
      id: "srun_task",
      workspaceId: "sbx_task",
      activeRunId: "srun_task_2",
    });

    expect([...recorded.values()].map((item) => item.dedupeKey)).toEqual([
      "agent-task-run:srun_task:srun_task",
      "agent-task-run:srun_task:srun_task_2",
    ]);
  });

  test("[GH-AUTO-DURABLE-CREDENTIAL-023] restores the queued organization scope before Task Run reconciliation", async () => {
    const recorded: DurableWorkItemRecord[] = [];
    const queue = {
      listItems: async () => ok([]),
      recordItem: async (_context: unknown, item: DurableWorkItemRecord) => {
        recorded.push(item);
        return ok(item);
      },
    } as unknown as DurableWorkQueueAdapter;
    const work = new DurableSandboxAgentWorkQueue(
      queue,
      { now: () => "2026-07-24T00:00:00.000Z" },
      { next: () => "dwi_task_org" },
    );
    const sourceContext = createExecutionContext({
      entrypoint: "system",
      requestId: "req_task_org",
      tenant: {
        tenantId: "tenant_demo",
        organizationId: "org_demo",
        source: "test",
      },
    });
    await work.enqueue(sourceContext, {
      kind: "agent-task-run",
      id: "srun_task_org",
      workspaceId: "sbx_task_org",
      activeRunId: "srun_task_org",
    });

    let reconciledTenant: ExecutionContext["tenant"];
    let reconciledGeneration: string | undefined;
    const handler = new SandboxAgentDurableWorkHandler(
      {} as SandboxAgentDeliveryService,
      {
        async reconcile(
          context: ExecutionContext,
          _workspaceId: string,
          _taskRunId: string,
          expectedActiveRunId?: string,
        ) {
          reconciledTenant = context.tenant;
          reconciledGeneration = expectedActiveRunId;
          return ok({});
        },
      } as unknown as AgentTaskRunService,
    );
    const result = await handler.handle(
      createExecutionContext({
        entrypoint: "system",
        requestId: "req_worker",
      }),
      recorded[0]!,
      { workerId: "worker_1", workerGroup: "agent", slot: 0 },
    );

    expect(result.isOk()).toBe(true);
    expect(reconciledTenant).toEqual({
      tenantId: "tenant_demo",
      organizationId: "org_demo",
      source: "durable-work",
    });
    expect(reconciledGeneration).toBe("srun_task_org");
  });

  test("[GH-AUTO-DURABLE-CREDENTIAL-023] continues legacy Task Run work without an organization scope", async () => {
    let reconciledTenant: ExecutionContext["tenant"];
    const handler = new SandboxAgentDurableWorkHandler(
      {} as SandboxAgentDeliveryService,
      {
        async reconcile(context: ExecutionContext) {
          reconciledTenant = context.tenant;
          return ok({});
        },
      } as unknown as AgentTaskRunService,
    );
    const result = await handler.handle(
      createExecutionContext({
        entrypoint: "system",
        requestId: "req_worker_legacy",
      }),
      {
        id: "dwi_task_legacy",
        kind: "sandbox-agent-delivery",
        status: "running",
        operationKey: "sandboxes.agent-tasks.reconcile",
        queueBackend: "database",
        dedupeKey: "agent-task-run:srun_task_legacy",
        requestId: "req_task_legacy",
        subjectKind: "agent-task-run",
        subjectId: "srun_task_legacy",
        priority: 0,
        attemptCount: 1,
        maxAttempts: 8_640,
        availableAt: "2026-07-24T00:00:00.000Z",
        updatedAt: "2026-07-24T00:00:10.000Z",
        safeInput: {
          tenantId: "tenant_demo",
          itemKind: "agent-task-run",
          itemId: "srun_task_legacy",
          workspaceId: "sbx_task_legacy",
          activeRunId: "srun_task_legacy",
        },
      },
      { workerId: "worker_1", workerGroup: "agent", slot: 0 },
    );

    expect(result.isOk()).toBe(true);
    expect(reconciledTenant).toEqual({
      tenantId: "tenant_demo",
      source: "durable-work",
    });
  });
});
