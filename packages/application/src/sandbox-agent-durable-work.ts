import { domainError, err, ok, type Result } from "@appaloft/core";
import { type AgentTaskRunService } from "./agent-task-run";
import {
  type DurableWorkHandler,
  type DurableWorkHandlerResult,
  type DurableWorkItemRecord,
  type DurableWorkQueueAdapter,
  type DurableWorkWorkerIdentity,
} from "./durable-work";
import { type ExecutionContext, toRepositoryContext } from "./execution-context";
import { type SandboxAgentDeliveryService } from "./sandbox-agent-runtime";

export const sandboxAgentDeliveryDurableWorkKind = "sandbox-agent-delivery";
const agentTaskRunMaxAttempts = 8_640;
const agentTaskRunPollIntervalMs = 10_000;
const agentTaskGenerationLookupLimit = 100;

function agentTaskGenerationDedupeKey(input: { id: string; activeRunId: string }): string {
  return `agent-task-run:${input.id}:${input.activeRunId}`;
}

export class DurableSandboxAgentWorkQueue {
  constructor(
    private readonly queue: DurableWorkQueueAdapter,
    private readonly clock: { now(): string },
    private readonly idGenerator: { next(prefix: string): string },
  ) {}

  async enqueue(
    context: ExecutionContext,
    input:
      | { kind: "sandbox-agent-run" | "sandbox-promotion"; id: string }
      | {
          kind: "agent-task-run";
          id: string;
          workspaceId: string;
          activeRunId: string;
        },
  ): Promise<void> {
    const now = this.clock.now();
    const repositoryContext = toRepositoryContext(context);
    const dedupeKey =
      input.kind === "agent-task-run"
        ? agentTaskGenerationDedupeKey(input)
        : `${input.kind}:${input.id}`;
    if (input.kind === "agent-task-run") {
      const existing = await this.queue.listItems(repositoryContext, {
        kind: sandboxAgentDeliveryDurableWorkKind,
        subjectKind: input.kind,
        subjectId: input.id,
        limit: agentTaskGenerationLookupLimit,
      });
      if (existing.isErr()) throw new Error(existing.error.message);
      if (existing.value.some((item) => item.dedupeKey === dedupeKey)) return;
    }
    const item: DurableWorkItemRecord = {
      id: this.idGenerator.next("dwi"),
      kind: sandboxAgentDeliveryDurableWorkKind,
      status: "pending",
      operationKey:
        input.kind === "sandbox-agent-run"
          ? "sandboxes.agents.runs.execute"
          : input.kind === "sandbox-promotion"
            ? "sandboxes.promotions.execute"
            : "sandboxes.agent-tasks.reconcile",
      queueBackend: "database",
      dedupeKey,
      requestId: context.requestId,
      subjectKind: input.kind,
      subjectId: input.id,
      priority: 0,
      attemptCount: 0,
      maxAttempts: input.kind === "agent-task-run" ? agentTaskRunMaxAttempts : 5,
      availableAt: now,
      updatedAt: now,
      safeInput: {
        tenantId: context.tenant?.tenantId ?? "tenant_instance",
        ...(context.tenant?.organizationId
          ? { organizationId: context.tenant.organizationId }
          : {}),
        itemKind: input.kind,
        itemId: input.id,
        ...(input.kind === "agent-task-run"
          ? {
              workspaceId: input.workspaceId,
              activeRunId: input.activeRunId,
            }
          : {}),
      },
    };
    const recorded = await this.queue.recordItem(repositoryContext, item);
    if (recorded.isOk()) return;
    if (input.kind === "agent-task-run") {
      const raced = await this.queue.listItems(repositoryContext, {
        kind: sandboxAgentDeliveryDurableWorkKind,
        subjectKind: input.kind,
        subjectId: input.id,
        limit: agentTaskGenerationLookupLimit,
      });
      if (raced.isOk() && raced.value.some((existing) => existing.dedupeKey === dedupeKey)) {
        return;
      }
    }
    throw new Error(recorded.error.message);
  }
}

export class SandboxAgentDurableWorkHandler implements DurableWorkHandler {
  constructor(
    private readonly service: SandboxAgentDeliveryService,
    private readonly taskService?: AgentTaskRunService,
  ) {}

  async handle(
    context: ExecutionContext,
    item: DurableWorkItemRecord,
    _worker: DurableWorkWorkerIdentity,
  ): Promise<Result<DurableWorkHandlerResult>> {
    const tenantId = item.safeInput?.tenantId;
    const organizationId = item.safeInput?.organizationId;
    const itemKind = item.safeInput?.itemKind;
    const itemId = item.safeInput?.itemId;
    if (
      typeof tenantId !== "string" ||
      (organizationId !== undefined && typeof organizationId !== "string") ||
      (itemKind !== "sandbox-agent-run" &&
        itemKind !== "sandbox-promotion" &&
        itemKind !== "agent-task-run") ||
      typeof itemId !== "string"
    ) {
      return err(domainError.invariant("Sandbox Agent durable work input is invalid"));
    }
    const tenantContext: ExecutionContext = {
      ...context,
      tenant: {
        tenantId,
        ...(organizationId ? { organizationId } : {}),
        source: "durable-work",
      },
    };
    const result =
      itemKind === "sandbox-agent-run"
        ? await this.service.reconcileRun(tenantContext, itemId)
        : itemKind === "sandbox-promotion"
          ? await this.service.reconcilePromotion(tenantContext, itemId)
          : this.taskService && typeof item.safeInput?.workspaceId === "string"
            ? await this.taskService.reconcile(tenantContext, item.safeInput.workspaceId, itemId)
            : err(domainError.invariant("Agent Task durable work service is unavailable"));
    if (result.isErr() && result.error.details?.code === "sandbox_agent_approval_pending") {
      return ok({
        status: "retry-scheduled",
        phase: "agent-run",
        step: "awaiting-external-approval",
        retriable: true,
        nextAvailableAt: new Date(Date.now() + 2_000).toISOString(),
        safeDetails: {
          subjectId: itemId,
          approvalId: String(result.error.details.approvalId ?? "pending"),
        },
      });
    }
    if (result.isErr() && result.error.details?.code === "agent_task_run_pending") {
      return ok({
        status: "retry-scheduled",
        phase: "agent-task-run",
        step: "awaiting-agent-run",
        retriable: true,
        nextAvailableAt: new Date(Date.now() + agentTaskRunPollIntervalMs).toISOString(),
        safeDetails: { subjectId: itemId },
      });
    }
    if (result.isErr()) return err(result.error);
    if (
      itemKind === "sandbox-promotion" &&
      "status" in result.value &&
      result.value.status === "verifying"
    ) {
      return ok({
        status: "retry-scheduled",
        phase: "promotion",
        step: "awaiting-deployment-proof",
        retriable: true,
        nextAvailableAt: new Date(Date.now() + 2_000).toISOString(),
        safeDetails: { subjectId: itemId },
      });
    }
    return ok({
      status: "succeeded",
      phase:
        itemKind === "sandbox-agent-run"
          ? "agent-run"
          : itemKind === "sandbox-promotion"
            ? "promotion"
            : "agent-task-run",
      step: "completed",
      safeDetails: { subjectId: itemId },
    });
  }
}
