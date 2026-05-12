import { domainError, err, ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type Clock,
  type IdGenerator,
  type ProcessAttemptReadModel,
  type ProcessAttemptRecord,
  type ProcessAttemptRecoveryRecorder,
  type ProcessAttemptStatus,
} from "../../ports";
import { tokens } from "../../tokens";
import { type RetryOperatorWorkCommandInput } from "./retry-operator-work.command";

export interface RetryOperatorWorkResult {
  workId: string;
  status: "pending";
  retryOfWorkId: string;
  retriedAt: string;
}

const retryableStatuses: ReadonlySet<ProcessAttemptStatus> = new Set(["failed", "retry-scheduled"]);

function operatorWorkNotFound(workId: string) {
  return domainError.operatorWorkNotFound(`Operator work ${workId} was not found`, {
    phase: "operator-work-retry",
    workId,
  });
}

function operatorWorkRetryNotAllowed(attempt: ProcessAttemptRecord) {
  return domainError.operatorWorkRetryNotAllowed(
    `Operator work ${attempt.id} cannot be retried from ${attempt.status}`,
    {
      phase: "operator-work-retry",
      workId: attempt.id,
      status: attempt.status,
      retriable: attempt.retriable ?? false,
    },
  );
}

function buildRetryAttempt(
  attempt: ProcessAttemptRecord,
  input: RetryOperatorWorkCommandInput,
  retriedAt: string,
  idGenerator: IdGenerator,
): ProcessAttemptRecord {
  const retryId = idGenerator.next("wrk");

  return {
    id: retryId,
    kind: attempt.kind,
    status: "pending",
    operationKey: attempt.operationKey,
    updatedAt: retriedAt,
    startedAt: retriedAt,
    nextActions: ["no-action"],
    ...(attempt.dedupeKey ? { dedupeKey: `${attempt.dedupeKey}:retry:${retryId}` } : {}),
    ...(attempt.correlationId ? { correlationId: attempt.correlationId } : {}),
    ...(attempt.requestId ? { requestId: attempt.requestId } : {}),
    phase: "manual-retry",
    step: "queued",
    ...(attempt.projectId ? { projectId: attempt.projectId } : {}),
    ...(attempt.resourceId ? { resourceId: attempt.resourceId } : {}),
    ...(attempt.deploymentId ? { deploymentId: attempt.deploymentId } : {}),
    ...(attempt.serverId ? { serverId: attempt.serverId } : {}),
    ...(attempt.domainBindingId ? { domainBindingId: attempt.domainBindingId } : {}),
    ...(attempt.certificateId ? { certificateId: attempt.certificateId } : {}),
    retriable: false,
    safeDetails: {
      ...(attempt.safeDetails ?? {}),
      retryOfWorkId: attempt.id,
      retriedAt,
      ...(attempt.dedupeKey ? { retryOfDedupeKey: attempt.dedupeKey } : {}),
      ...(input.reason ? { retryReason: input.reason } : {}),
    },
  };
}

@injectable()
export class RetryOperatorWorkUseCase {
  constructor(
    @inject(tokens.processAttemptReadModel)
    private readonly processAttemptReadModel: ProcessAttemptReadModel,
    @inject(tokens.processAttemptRecoveryRecorder)
    private readonly processAttemptRecoveryRecorder: ProcessAttemptRecoveryRecorder,
    @inject(tokens.clock)
    private readonly clock: Clock,
    @inject(tokens.idGenerator)
    private readonly idGenerator: IdGenerator,
  ) {}

  async execute(
    context: ExecutionContext,
    input: RetryOperatorWorkCommandInput,
  ): Promise<Result<RetryOperatorWorkResult>> {
    const repositoryContext = toRepositoryContext(context);
    const workId = input.workId.trim();
    const attempt = await this.processAttemptReadModel.findOne(repositoryContext, workId);

    if (!attempt) {
      return err(operatorWorkNotFound(workId));
    }

    if (!retryableStatuses.has(attempt.status) || attempt.retriable !== true) {
      return err(operatorWorkRetryNotAllowed(attempt));
    }

    const retriedAt = this.clock.now();
    const recordResult = await this.processAttemptRecoveryRecorder.retry(
      repositoryContext,
      buildRetryAttempt(attempt, input, retriedAt, this.idGenerator),
    );

    if (recordResult.isErr()) {
      return err(recordResult.error);
    }

    if (recordResult.value.status !== "pending") {
      return err(
        domainError.infra("Retried process attempt persisted with an unexpected status", {
          phase: "process-attempt-persistence",
          workId,
          status: recordResult.value.status,
        }),
      );
    }

    return ok({
      workId: recordResult.value.id,
      status: "pending",
      retryOfWorkId: workId,
      retriedAt,
    });
  }
}
