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
import { type MarkOperatorWorkRecoveredCommandInput } from "./mark-operator-work-recovered.command";

export interface MarkOperatorWorkRecoveredResult {
  workId: string;
  status: "succeeded";
  recoveredAt: string;
}

const recoverableStatuses: ReadonlySet<ProcessAttemptStatus> = new Set([
  "failed",
  "retry-scheduled",
  "dead-lettered",
]);

function operatorWorkNotFound(workId: string) {
  return domainError.operatorWorkNotFound(`Operator work ${workId} was not found`, {
    phase: "operator-work-recovery",
    workId,
  });
}

function operatorWorkRecoveryNotAllowed(attempt: ProcessAttemptRecord) {
  return domainError.operatorWorkRecoveryNotAllowed(
    `Operator work ${attempt.id} cannot be marked recovered from ${attempt.status}`,
    {
      phase: "operator-work-recovery",
      workId: attempt.id,
      status: attempt.status,
    },
  );
}

function buildRecoveredAttempt(
  attempt: ProcessAttemptRecord,
  input: MarkOperatorWorkRecoveredCommandInput,
  recoveredAt: string,
): ProcessAttemptRecord {
  return {
    id: attempt.id,
    kind: attempt.kind,
    status: "succeeded",
    operationKey: attempt.operationKey,
    updatedAt: recoveredAt,
    finishedAt: recoveredAt,
    nextActions: ["no-action"],
    ...(attempt.dedupeKey ? { dedupeKey: attempt.dedupeKey } : {}),
    ...(attempt.correlationId ? { correlationId: attempt.correlationId } : {}),
    ...(attempt.requestId ? { requestId: attempt.requestId } : {}),
    phase: "manual-recovery",
    step: "marked-recovered",
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
      recovered: true,
      recoveredAt,
      ...(input.reason ? { recoveredReason: input.reason } : {}),
    },
  };
}

@injectable()
export class MarkOperatorWorkRecoveredUseCase {
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
    input: MarkOperatorWorkRecoveredCommandInput,
  ): Promise<Result<MarkOperatorWorkRecoveredResult>> {
    const repositoryContext = toRepositoryContext(context);
    const workId = input.workId.trim();
    const attempt = await this.processAttemptReadModel.findOne(repositoryContext, workId);

    if (!attempt) {
      return err(operatorWorkNotFound(workId));
    }

    if (!recoverableStatuses.has(attempt.status)) {
      return err(operatorWorkRecoveryNotAllowed(attempt));
    }

    const recoveredAt = this.clock.now();
    const recordResult = await this.processAttemptRecoveryRecorder.markRecovered(
      repositoryContext,
      buildRecoveredAttempt(attempt, input, recoveredAt),
    );

    if (recordResult.isErr()) {
      return err(recordResult.error);
    }

    if (recordResult.value.status !== "succeeded") {
      return err(
        domainError.infra("Recovered process attempt persisted with an unexpected status", {
          phase: "process-attempt-persistence",
          workId,
          status: recordResult.value.status,
        }),
      );
    }

    return ok({
      workId: recordResult.value.id,
      status: "succeeded",
      recoveredAt,
    });
  }
}
