import { domainError, err, ok, type Result } from "@appaloft/core";
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

export class DurableSandboxAgentWorkQueue {
  constructor(
    private readonly queue: DurableWorkQueueAdapter,
    private readonly clock: { now(): string },
    private readonly idGenerator: { next(prefix: string): string },
  ) {}

  async enqueue(
    context: ExecutionContext,
    input: { kind: "sandbox-agent-run" | "sandbox-promotion"; id: string },
  ): Promise<void> {
    const now = this.clock.now();
    const item: DurableWorkItemRecord = {
      id: this.idGenerator.next("dwi"),
      kind: sandboxAgentDeliveryDurableWorkKind,
      status: "pending",
      operationKey:
        input.kind === "sandbox-agent-run"
          ? "sandboxes.agents.runs.execute"
          : "sandboxes.promotions.execute",
      queueBackend: "database",
      dedupeKey: `${input.kind}:${input.id}`,
      requestId: context.requestId,
      subjectKind: input.kind,
      subjectId: input.id,
      priority: 0,
      attemptCount: 0,
      maxAttempts: 5,
      availableAt: now,
      updatedAt: now,
      safeInput: {
        tenantId: context.tenant?.tenantId ?? "tenant_instance",
        itemKind: input.kind,
        itemId: input.id,
      },
    };
    const recorded = await this.queue.recordItem(toRepositoryContext(context), item);
    if (recorded.isErr()) throw new Error(recorded.error.message);
  }
}

export class SandboxAgentDurableWorkHandler implements DurableWorkHandler {
  constructor(private readonly service: SandboxAgentDeliveryService) {}

  async handle(
    context: ExecutionContext,
    item: DurableWorkItemRecord,
    _worker: DurableWorkWorkerIdentity,
  ): Promise<Result<DurableWorkHandlerResult>> {
    const tenantId = item.safeInput?.tenantId;
    const itemKind = item.safeInput?.itemKind;
    const itemId = item.safeInput?.itemId;
    if (
      typeof tenantId !== "string" ||
      (itemKind !== "sandbox-agent-run" && itemKind !== "sandbox-promotion") ||
      typeof itemId !== "string"
    ) {
      return err(domainError.invariant("Sandbox Agent durable work input is invalid"));
    }
    const tenantContext: ExecutionContext = {
      ...context,
      tenant: { tenantId, source: "durable-work" },
    };
    const result =
      itemKind === "sandbox-agent-run"
        ? await this.service.reconcileRun(tenantContext, itemId)
        : await this.service.reconcilePromotion(tenantContext, itemId);
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
    if (result.isErr()) return err(result.error);
    if (itemKind === "sandbox-promotion" && result.value.status === "verifying") {
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
      phase: itemKind === "sandbox-agent-run" ? "agent-run" : "promotion",
      step: "completed",
      safeDetails: { subjectId: itemId },
    });
  }
}
