import { domainError, err, ok, type Result, safeTry } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type CommandBus } from "../../cqrs";
import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type Clock,
  type IdGenerator,
  type ProcessAttemptClaimer,
  type ProcessAttemptCompleter,
  type ProcessAttemptRecorder,
} from "../../ports";
import { tokens } from "../../tokens";
import { CreateDependencyResourceBackupCommand } from "./create-dependency-resource-backup.command";
import {
  type DependencyResourceBackupPolicyRepository,
  type ScheduledDependencyBackupRunInput,
  type ScheduledDependencyBackupRunResult,
} from "./dependency-resource-backup-policy.types";

export const scheduledDependencyBackupOperationKey = "dependency-resources.create-backup";
export const scheduledDependencyBackupWorkerId = "scheduled-dependency-backup-worker";
export const scheduledDependencyBackupWorkKind = "system";

function addHours(isoTimestamp: string, hours: number): Result<string> {
  if (!Number.isInteger(hours) || hours < 1) {
    return err(
      domainError.validation("Dependency backup schedule interval must be positive hours", {
        phase: "dependency-resource-backup-policy",
        scheduleIntervalHours: hours,
      }),
    );
  }

  const baseTime = Date.parse(isoTimestamp);
  if (!Number.isFinite(baseTime)) {
    return err(
      domainError.validation("Dependency backup schedule timestamp must be an ISO timestamp", {
        phase: "dependency-resource-backup-policy",
        timestamp: isoTimestamp,
      }),
    );
  }

  return ok(new Date(baseTime + hours * 60 * 60 * 1000).toISOString());
}

@injectable()
export class ScheduledDependencyBackupService {
  constructor(
    @inject(tokens.commandBus)
    private readonly commandBus: Pick<CommandBus, "execute">,
    @inject(tokens.dependencyResourceBackupPolicyRepository)
    private readonly policyRepository: DependencyResourceBackupPolicyRepository,
    @inject(tokens.processAttemptRecorder)
    private readonly processAttemptRecorder: ProcessAttemptRecorder,
    @inject(tokens.processAttemptClaimer)
    private readonly processAttemptClaimer: ProcessAttemptClaimer,
    @inject(tokens.processAttemptCompleter)
    private readonly processAttemptCompleter: ProcessAttemptCompleter,
    @inject(tokens.idGenerator)
    private readonly idGenerator: IdGenerator,
    @inject(tokens.clock)
    private readonly clock: Clock,
  ) {}

  async run(
    context: ExecutionContext,
    input: ScheduledDependencyBackupRunInput,
  ): Promise<Result<ScheduledDependencyBackupRunResult>> {
    const repositoryContext = toRepositoryContext(context);
    const {
      clock,
      commandBus,
      idGenerator,
      policyRepository,
      processAttemptClaimer,
      processAttemptCompleter,
      processAttemptRecorder,
    } = this;

    return safeTry(async function* () {
      const scheduledAt = input.scheduledAt ?? clock.now();
      const nextRunAt = yield* addHours(scheduledAt, input.policy.scheduleIntervalHours);
      const processAttemptId = idGenerator.next("wrk");

      yield* await processAttemptRecorder.record(repositoryContext, {
        id: processAttemptId,
        kind: scheduledDependencyBackupWorkKind,
        status: "pending",
        operationKey: scheduledDependencyBackupOperationKey,
        dedupeKey: `scheduled-dependency-backup:${input.policy.dependencyResourceId}:${input.policy.id}:${scheduledAt}`,
        correlationId: context.requestId,
        requestId: context.requestId,
        phase: "scheduled-dependency-backup",
        step: "accepted",
        startedAt: scheduledAt,
        updatedAt: scheduledAt,
        nextActions: ["no-action"],
        safeDetails: {
          trigger: "scheduled-dependency-backup",
          policyId: input.policy.id,
          policyVersion: input.policy.version,
          dependencyResourceId: input.policy.dependencyResourceId,
          retentionDays: input.policy.retentionDays,
          scheduleIntervalHours: input.policy.scheduleIntervalHours,
          nextRunAt,
        },
      });

      const claimResult = yield* await processAttemptClaimer.claimDue(repositoryContext, {
        attemptId: processAttemptId,
        workerId: scheduledDependencyBackupWorkerId,
        claimedAt: scheduledAt,
        safeDetails: {
          policyId: input.policy.id,
          policyVersion: input.policy.version,
          dependencyResourceId: input.policy.dependencyResourceId,
          nextRunAt,
        },
      });

      if (claimResult.status !== "claimed") {
        return err(
          domainError.conflict("Scheduled dependency backup process attempt could not be claimed", {
            phase: "scheduled-dependency-backup-worker",
            processAttemptId,
            claimStatus: claimResult.status,
          }),
        );
      }

      const command = yield* CreateDependencyResourceBackupCommand.create({
        dependencyResourceId: input.policy.dependencyResourceId,
        ...(input.policy.providerKey ? { providerKey: input.policy.providerKey } : {}),
        description: `scheduled-policy:${input.policy.id}`,
      });
      const backupResult = await commandBus.execute(context, command);
      const completedAt = clock.now();

      if (backupResult.isErr()) {
        const retryOnFailure = input.policy.retryOnFailure !== false;
        yield* await processAttemptCompleter.complete(repositoryContext, {
          attemptId: processAttemptId,
          status: retryOnFailure ? "retry-scheduled" : "failed",
          completedAt,
          phase: "scheduled-dependency-backup",
          step: "dependency-resources-create-backup",
          errorCode: backupResult.error.code,
          errorCategory: backupResult.error.category,
          retriable: retryOnFailure,
          ...(retryOnFailure ? { nextEligibleAt: completedAt } : {}),
          nextActions: retryOnFailure ? ["retry", "manual-review"] : ["manual-review"],
          safeDetails: {
            policyId: input.policy.id,
            policyVersion: input.policy.version,
            dependencyResourceId: input.policy.dependencyResourceId,
            nextRunAt,
          },
        });
        return err(backupResult.error);
      }

      yield* await policyRepository.markRun(repositoryContext, {
        policyId: input.policy.id,
        lastRunAt: scheduledAt,
        nextRunAt,
        updatedAt: completedAt,
      });

      yield* await processAttemptCompleter.complete(repositoryContext, {
        attemptId: processAttemptId,
        status: "succeeded",
        completedAt,
        phase: "scheduled-dependency-backup",
        step: "dependency-resources-create-backup",
        nextActions: ["no-action"],
        safeDetails: {
          policyId: input.policy.id,
          policyVersion: input.policy.version,
          dependencyResourceId: input.policy.dependencyResourceId,
          backupId: backupResult.value.id,
          nextRunAt,
        },
      });

      return ok({
        schemaVersion: "dependency-resource-backup-policies.run/v1",
        processAttemptId,
        policyId: input.policy.id,
        dependencyResourceId: input.policy.dependencyResourceId,
        backupId: backupResult.value.id,
        nextRunAt,
      } satisfies ScheduledDependencyBackupRunResult);
    });
  }
}
