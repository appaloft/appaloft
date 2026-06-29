import { domainError, err, ok, type Result } from "@appaloft/core";
import {
  type DurableWorkHandler,
  type DurableWorkHandlerResult,
  type DurableWorkItemRecord,
  type DurableWorkWorkerIdentity,
} from "../../durable-work";
import { type ExecutionContext } from "../../execution-context";
import { type ScheduledTaskRunWorker } from "./scheduled-task-run-worker";

export const scheduledTaskRunDurableWorkKind = "scheduled-task-run";
export const scheduledTaskRunDueOperationKey = "scheduled-task-runs.run-due";
export const scheduledTaskRunNowOperationKey = "scheduled-tasks.run-now";

export function scheduledTaskRunDurableWorkItemId(runId: string): string {
  return `dw_scheduled_task_run_${runId}`;
}

function stringDetail(item: DurableWorkItemRecord, key: string): string | undefined {
  const value = item.safeDetails?.[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

export class ScheduledTaskRunExecutionHandler implements DurableWorkHandler {
  constructor(private readonly worker: Pick<ScheduledTaskRunWorker, "run">) {}

  async handle(
    context: ExecutionContext,
    item: DurableWorkItemRecord,
    durableWorker: DurableWorkWorkerIdentity,
  ): Promise<Result<DurableWorkHandlerResult>> {
    const runId = stringDetail(item, "runId") ?? item.subjectId;
    if (!runId) {
      return err(
        domainError.validation("Scheduled task durable work requires a run id", {
          phase: "scheduled-task-run-durable-work",
          workItemId: item.id,
        }),
      );
    }

    const taskId = stringDetail(item, "taskId");
    const resourceId = stringDetail(item, "resourceId") ?? item.resourceId;
    const result = await this.worker.run(context, {
      runId,
      ...(taskId ? { taskId } : {}),
      ...(resourceId ? { resourceId } : {}),
      workerId: durableWorker.workerId,
    });

    if (result.isErr()) {
      return err(result.error);
    }

    const run = result.value.run;
    return ok({
      status: run.status === "succeeded" ? "succeeded" : "failed",
      phase: "scheduled-task-run",
      step: run.status === "succeeded" ? "completed" : "failed",
      ...(run.status === "succeeded"
        ? {}
        : {
            errorCode: "scheduled_task_run_failed",
            errorCategory: "async-processing",
            retriable: false,
          }),
      safeDetails: {
        runId: run.runId,
        taskId: run.taskId,
        resourceId: run.resourceId,
        triggerKind: run.triggerKind,
        ...(run.scheduledFor ? { scheduledFor: run.scheduledFor } : {}),
      },
    });
  }
}
