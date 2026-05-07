import { ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type AppLogger,
  type Clock,
  type ScheduledTaskDueCandidate,
  type ScheduledTaskDueCandidateReader,
  type ScheduledTaskRunSummary,
} from "../../ports";
import { tokens } from "../../tokens";
import { type ScheduledTaskRunAdmissionService } from "./scheduled-task-run-admission.service";

export interface ScheduledTaskSchedulerOptions {
  limit?: number;
}

export interface ScheduledTaskSchedulerDispatch {
  taskId: string;
  resourceId: string;
  scheduledFor: string;
  run: ScheduledTaskRunSummary;
}

export interface ScheduledTaskSchedulerFailure {
  taskId: string;
  resourceId: string;
  scheduledFor: string;
  errorCode: string;
}

export interface ScheduledTaskSchedulerResult {
  scanned: number;
  dispatched: ScheduledTaskSchedulerDispatch[];
  failed: ScheduledTaskSchedulerFailure[];
}

const defaultLimit = 25;

function normalizePositiveInteger(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value) || value === undefined) {
    return fallback;
  }

  const normalized = Math.trunc(value);
  return normalized > 0 ? normalized : fallback;
}

function schedulerIdempotencyKey(candidate: ScheduledTaskDueCandidate): string {
  return `scheduled-tasks.scheduler:${candidate.taskId}:${candidate.scheduledFor}`;
}

@injectable()
export class ScheduledTaskScheduler {
  constructor(
    @inject(tokens.scheduledTaskDueCandidateReader)
    private readonly dueCandidateReader: ScheduledTaskDueCandidateReader,
    @inject(tokens.scheduledTaskRunAdmissionService)
    private readonly runAdmissionService: ScheduledTaskRunAdmissionService,
    @inject(tokens.clock)
    private readonly clock: Clock,
    @inject(tokens.logger)
    private readonly logger: AppLogger,
  ) {}

  async run(
    context: ExecutionContext,
    options: ScheduledTaskSchedulerOptions = {},
  ): Promise<Result<ScheduledTaskSchedulerResult>> {
    const now = this.clock.now();
    const candidates = await this.dueCandidateReader.listDue(toRepositoryContext(context), {
      now,
      limit: normalizePositiveInteger(options.limit, defaultLimit),
    });
    const dispatched: ScheduledTaskSchedulerDispatch[] = [];
    const failed: ScheduledTaskSchedulerFailure[] = [];

    for (const candidate of candidates) {
      const result = await this.runAdmissionService.admit(context, {
        taskId: candidate.taskId,
        resourceId: candidate.resourceId,
        triggerKind: "scheduled",
        requestedAt: now,
        idempotencyKey: schedulerIdempotencyKey(candidate),
      });

      if (result.isOk()) {
        dispatched.push({
          taskId: candidate.taskId,
          resourceId: candidate.resourceId,
          scheduledFor: candidate.scheduledFor,
          run: result.value.run,
        });
        continue;
      }

      failed.push({
        taskId: candidate.taskId,
        resourceId: candidate.resourceId,
        scheduledFor: candidate.scheduledFor,
        errorCode: result.error.code,
      });
      this.logger.warn("scheduled_task_scheduler.dispatch_failed", {
        taskId: candidate.taskId,
        resourceId: candidate.resourceId,
        scheduledFor: candidate.scheduledFor,
        errorCode: result.error.code,
      });
    }

    return ok({
      scanned: candidates.length,
      dispatched,
      failed,
    });
  }
}
