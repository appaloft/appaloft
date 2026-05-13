import { domainError, err, ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type Clock,
  type ProcessAttemptReadModel,
  type ProcessAttemptRecord,
  type ProcessAttemptRecoveryRecorder,
  type ProcessAttemptStatus,
} from "../../ports";
import { tokens } from "../../tokens";
import { type CancelOperatorWorkCommandInput } from "./cancel-operator-work.command";

export interface CancelOperatorWorkResult {
  workId: string;
  status: "canceled";
  canceledAt: string;
}

const cancelableStatuses: ReadonlySet<ProcessAttemptStatus> = new Set([
  "pending",
  "retry-scheduled",
]);

function operatorWorkNotFound(workId: string) {
  return domainError.operatorWorkNotFound(`Operator work ${workId} was not found`, {
    phase: "operator-work-cancel",
    workId,
  });
}

function operatorWorkCancelNotAllowed(attempt: ProcessAttemptRecord) {
  return domainError.operatorWorkCancelNotAllowed(
    `Operator work ${attempt.id} cannot be canceled from ${attempt.status}`,
    {
      phase: "operator-work-cancel",
      workId: attempt.id,
      status: attempt.status,
    },
  );
}

function buildCanceledAttempt(
  attempt: ProcessAttemptRecord,
  input: CancelOperatorWorkCommandInput,
  canceledAt: string,
): ProcessAttemptRecord {
  return {
    id: attempt.id,
    kind: attempt.kind,
    status: "canceled",
    operationKey: attempt.operationKey,
    updatedAt: canceledAt,
    finishedAt: canceledAt,
    nextActions: ["no-action"],
    ...(attempt.dedupeKey ? { dedupeKey: attempt.dedupeKey } : {}),
    ...(attempt.correlationId ? { correlationId: attempt.correlationId } : {}),
    ...(attempt.requestId ? { requestId: attempt.requestId } : {}),
    phase: "manual-cancel",
    step: "canceled",
    ...(attempt.projectId ? { projectId: attempt.projectId } : {}),
    ...(attempt.resourceId ? { resourceId: attempt.resourceId } : {}),
    ...(attempt.deploymentId ? { deploymentId: attempt.deploymentId } : {}),
    ...(attempt.serverId ? { serverId: attempt.serverId } : {}),
    ...(attempt.domainBindingId ? { domainBindingId: attempt.domainBindingId } : {}),
    ...(attempt.certificateId ? { certificateId: attempt.certificateId } : {}),
    ...(attempt.startedAt ? { startedAt: attempt.startedAt } : {}),
    retriable: false,
    safeDetails: {
      ...(attempt.safeDetails ?? {}),
      canceled: true,
      canceledAt,
      cancelReason: input.reason,
    },
  };
}

@injectable()
export class CancelOperatorWorkUseCase {
  constructor(
    @inject(tokens.processAttemptReadModel)
    private readonly processAttemptReadModel: ProcessAttemptReadModel,
    @inject(tokens.processAttemptRecoveryRecorder)
    private readonly processAttemptRecoveryRecorder: ProcessAttemptRecoveryRecorder,
    @inject(tokens.clock)
    private readonly clock: Clock,
  ) {}

  async execute(
    context: ExecutionContext,
    input: CancelOperatorWorkCommandInput,
  ): Promise<Result<CancelOperatorWorkResult>> {
    const repositoryContext = toRepositoryContext(context);
    const workId = input.workId.trim();
    const attempt = await this.processAttemptReadModel.findOne(repositoryContext, workId);

    if (!attempt) {
      return err(operatorWorkNotFound(workId));
    }

    if (!cancelableStatuses.has(attempt.status)) {
      return err(operatorWorkCancelNotAllowed(attempt));
    }

    const canceledAt = this.clock.now();
    const recordResult = await this.processAttemptRecoveryRecorder.cancel(
      repositoryContext,
      buildCanceledAttempt(attempt, input, canceledAt),
    );

    if (recordResult.isErr()) {
      return err(recordResult.error);
    }

    if (recordResult.value.status !== "canceled") {
      return err(
        domainError.infra("Canceled process attempt persisted with an unexpected status", {
          phase: "process-attempt-persistence",
          workId,
          status: recordResult.value.status,
        }),
      );
    }

    return ok({
      workId: recordResult.value.id,
      status: "canceled",
      canceledAt,
    });
  }
}
