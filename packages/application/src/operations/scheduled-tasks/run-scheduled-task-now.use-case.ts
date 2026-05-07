import { type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext } from "../../execution-context";
import { type RunScheduledTaskNowResult } from "../../ports";
import { tokens } from "../../tokens";
import { type RunScheduledTaskNowCommandInput } from "./run-scheduled-task-now.command";
import { type ScheduledTaskRunAdmissionService } from "./scheduled-task-run-admission.service";

@injectable()
export class RunScheduledTaskNowUseCase {
  constructor(
    @inject(tokens.scheduledTaskRunAdmissionService)
    private readonly runAdmissionService: ScheduledTaskRunAdmissionService,
  ) {}

  async execute(
    context: ExecutionContext,
    input: RunScheduledTaskNowCommandInput,
  ): Promise<Result<RunScheduledTaskNowResult>> {
    const admissionInput = {
      taskId: input.taskId,
      resourceId: input.resourceId,
      triggerKind: "manual",
      ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
      ...(input.requestedAt ? { requestedAt: input.requestedAt } : {}),
    } as const;

    return this.runAdmissionService.admit(context, admissionInput);
  }
}
