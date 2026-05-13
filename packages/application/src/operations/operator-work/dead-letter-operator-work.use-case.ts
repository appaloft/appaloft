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
import { type DeadLetterOperatorWorkCommandInput } from "./dead-letter-operator-work.command";

export interface DeadLetterOperatorWorkResult {
  workId: string;
  status: "dead-lettered";
  deadLetteredAt: string;
}

const deadLetterableStatuses: ReadonlySet<ProcessAttemptStatus> = new Set([
  "failed",
  "retry-scheduled",
]);

function operatorWorkNotFound(workId: string) {
  return domainError.operatorWorkNotFound(`Operator work ${workId} was not found`, {
    phase: "operator-work-dead-letter",
    workId,
  });
}

function operatorWorkDeadLetterNotAllowed(attempt: ProcessAttemptRecord) {
  return domainError.operatorWorkDeadLetterNotAllowed(
    `Operator work ${attempt.id} cannot be dead-lettered from ${attempt.status}`,
    {
      phase: "operator-work-dead-letter",
      workId: attempt.id,
      status: attempt.status,
    },
  );
}

function buildDeadLetteredAttempt(
  attempt: ProcessAttemptRecord,
  input: DeadLetterOperatorWorkCommandInput,
  deadLetteredAt: string,
): ProcessAttemptRecord {
  return {
    id: attempt.id,
    kind: attempt.kind,
    status: "dead-lettered",
    operationKey: attempt.operationKey,
    updatedAt: deadLetteredAt,
    finishedAt: deadLetteredAt,
    nextActions: ["manual-review"],
    ...(attempt.dedupeKey ? { dedupeKey: attempt.dedupeKey } : {}),
    ...(attempt.correlationId ? { correlationId: attempt.correlationId } : {}),
    ...(attempt.requestId ? { requestId: attempt.requestId } : {}),
    phase: "manual-dead-letter",
    step: "dead-lettered",
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
      deadLettered: true,
      deadLetteredAt,
      deadLetterReason: input.reason,
    },
  };
}

@injectable()
export class DeadLetterOperatorWorkUseCase {
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
    input: DeadLetterOperatorWorkCommandInput,
  ): Promise<Result<DeadLetterOperatorWorkResult>> {
    const repositoryContext = toRepositoryContext(context);
    const workId = input.workId.trim();
    const attempt = await this.processAttemptReadModel.findOne(repositoryContext, workId);

    if (!attempt) {
      return err(operatorWorkNotFound(workId));
    }

    if (!deadLetterableStatuses.has(attempt.status)) {
      return err(operatorWorkDeadLetterNotAllowed(attempt));
    }

    const deadLetteredAt = this.clock.now();
    const recordResult = await this.processAttemptRecoveryRecorder.deadLetter(
      repositoryContext,
      buildDeadLetteredAttempt(attempt, input, deadLetteredAt),
    );

    if (recordResult.isErr()) {
      return err(recordResult.error);
    }

    if (recordResult.value.status !== "dead-lettered") {
      return err(
        domainError.infra("Dead-lettered process attempt persisted with an unexpected status", {
          phase: "process-attempt-persistence",
          workId,
          status: recordResult.value.status,
        }),
      );
    }

    return ok({
      workId: recordResult.value.id,
      status: "dead-lettered",
      deadLetteredAt,
    });
  }
}
