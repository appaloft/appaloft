import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { domainError, err, ok, type Result } from "@appaloft/core";
import { FixedClock, SequenceIdGenerator } from "@appaloft/testkit";

import { type Command, type CommandBus } from "../src/cqrs";
import {
  createExecutionContext,
  type ExecutionContext,
  type RepositoryContext,
} from "../src/execution-context";
import { ConfigureDependencyResourceBackupPolicyCommand } from "../src/operations/dependency-resources/configure-dependency-resource-backup-policy.command";
import { ConfigureDependencyResourceBackupPolicyUseCase } from "../src/operations/dependency-resources/configure-dependency-resource-backup-policy.use-case";
import { CreateDependencyResourceBackupCommand } from "../src/operations/dependency-resources/create-dependency-resource-backup.command";
import {
  type DependencyResourceBackupPolicyListFilter,
  type DependencyResourceBackupPolicyRecord,
  type DependencyResourceBackupPolicyRepository,
} from "../src/operations/dependency-resources/dependency-resource-backup-policy.types";
import { ScheduledDependencyBackupService } from "../src/operations/dependency-resources/dependency-resource-scheduled-backup.service";
import { ListDependencyResourceBackupPoliciesQueryService } from "../src/operations/dependency-resources/list-dependency-resource-backup-policies.query-service";
import { ShowDependencyResourceBackupPolicyQueryService } from "../src/operations/dependency-resources/show-dependency-resource-backup-policy.query-service";
import {
  type ProcessAttemptClaimer,
  type ProcessAttemptClaimInput,
  type ProcessAttemptClaimResult,
  type ProcessAttemptCompleter,
  type ProcessAttemptCompletionInput,
  type ProcessAttemptCompletionResult,
  type ProcessAttemptRecord,
  type ProcessAttemptRecorder,
} from "../src/ports";

class MemoryBackupPolicyRepository implements DependencyResourceBackupPolicyRepository {
  readonly records = new Map<string, DependencyResourceBackupPolicyRecord>();
  readonly markRunInputs: Array<
    Parameters<DependencyResourceBackupPolicyRepository["markRun"]>[1]
  > = [];

  async findOne(
    _context: RepositoryContext,
    policyId: string,
  ): Promise<Result<DependencyResourceBackupPolicyRecord | null>> {
    return ok(this.records.get(policyId) ?? null);
  }

  async listRecords(
    _context: RepositoryContext,
    filter: DependencyResourceBackupPolicyListFilter = {},
  ): Promise<Result<DependencyResourceBackupPolicyRecord[]>> {
    const dueAt = filter.dueAt ? Date.parse(filter.dueAt) : undefined;
    return ok(
      [...this.records.values()].filter((record) => {
        if (
          filter.dependencyResourceId &&
          record.dependencyResourceId !== filter.dependencyResourceId
        ) {
          return false;
        }
        if (filter.enabledOnly && !record.enabled) {
          return false;
        }
        if (dueAt !== undefined && Date.parse(record.nextRunAt) > dueAt) {
          return false;
        }
        return true;
      }),
    );
  }

  async upsert(
    _context: RepositoryContext,
    record: DependencyResourceBackupPolicyRecord,
  ): Promise<Result<DependencyResourceBackupPolicyRecord>> {
    this.records.set(record.id, record);
    return ok(record);
  }

  async markRun(
    _context: RepositoryContext,
    input: Parameters<DependencyResourceBackupPolicyRepository["markRun"]>[1],
  ): Promise<Result<DependencyResourceBackupPolicyRecord>> {
    this.markRunInputs.push(input);
    const current = this.records.get(input.policyId);
    if (!current) {
      return err(
        domainError.infra("Backup policy not found", {
          policyId: input.policyId,
        }),
      );
    }
    const updated = {
      ...current,
      lastRunAt: input.lastRunAt,
      nextRunAt: input.nextRunAt,
      updatedAt: input.updatedAt,
    };
    this.records.set(updated.id, updated);
    return ok(updated);
  }
}

class CapturingCommandBus implements Pick<CommandBus, "execute"> {
  readonly commands: Command<unknown>[] = [];

  async execute<TResult>(
    _context: ExecutionContext,
    command: Command<TResult>,
  ): Promise<Result<TResult>> {
    this.commands.push(command as Command<unknown>);
    return ok({ id: "drb_scheduled" } as TResult);
  }
}

class MemoryProcessAttempts
  implements ProcessAttemptRecorder, ProcessAttemptClaimer, ProcessAttemptCompleter
{
  readonly records: ProcessAttemptRecord[] = [];
  readonly claims: ProcessAttemptClaimInput[] = [];
  readonly completions: ProcessAttemptCompletionInput[] = [];

  async record(
    _context: RepositoryContext,
    attempt: ProcessAttemptRecord,
  ): Promise<Result<ProcessAttemptRecord>> {
    this.records.push(attempt);
    return ok(attempt);
  }

  async claimDue(
    _context: RepositoryContext,
    input: ProcessAttemptClaimInput,
  ): Promise<Result<ProcessAttemptClaimResult>> {
    this.claims.push(input);
    return ok({
      status: "claimed",
      attempt: {
        id: input.attemptId,
        kind: "system",
        status: "running",
        operationKey: "dependency-resources.create-backup",
        updatedAt: input.claimedAt,
        nextActions: ["no-action"],
      },
    });
  }

  async complete(
    _context: RepositoryContext,
    input: ProcessAttemptCompletionInput,
  ): Promise<Result<ProcessAttemptCompletionResult>> {
    this.completions.push(input);
    return ok({
      status: "completed",
      attempt: {
        id: input.attemptId,
        kind: "system",
        status: input.status,
        operationKey: "dependency-resources.create-backup",
        updatedAt: input.completedAt,
        nextActions: ["no-action"],
      },
    });
  }
}

const context = createExecutionContext({
  requestId: "req_dependency_resource_scheduled_backup_policy",
  entrypoint: "system",
});

describe("dependency resource scheduled backup policy", () => {
  test("[DEP-RES-BACKUP-POLICY-001] configure/list/show persists safe policy metadata", async () => {
    const repository = new MemoryBackupPolicyRepository();
    const clock = new FixedClock("2026-01-15T00:00:00.000Z");
    const useCase = new ConfigureDependencyResourceBackupPolicyUseCase(
      repository,
      clock,
      new SequenceIdGenerator(),
    );
    const command = ConfigureDependencyResourceBackupPolicyCommand.create({
      dependencyResourceId: "rsi_pg",
      retentionDays: 14,
      scheduleIntervalHours: 6,
      providerKey: "appaloft-managed-postgres",
    })._unsafeUnwrap();

    const result = await useCase.execute(context, command.input);
    const list = await new ListDependencyResourceBackupPoliciesQueryService(repository).execute(
      context,
      {
        dependencyResourceId: "rsi_pg",
        enabledOnly: true,
        dueAt: "2026-01-15T00:00:00.000Z",
      },
    );
    const shown = await new ShowDependencyResourceBackupPolicyQueryService(repository).execute(
      context,
      { policyId: result._unsafeUnwrap().id },
    );

    expect(result.isOk()).toBe(true);
    expect(list._unsafeUnwrap().items).toMatchObject([
      {
        dependencyResourceId: "rsi_pg",
        retentionDays: 14,
        scheduleIntervalHours: 6,
        providerKey: "appaloft-managed-postgres",
        enabled: true,
        nextRunAt: "2026-01-15T00:00:00.000Z",
      },
    ]);
    expect(shown._unsafeUnwrap().policy?.dependencyResourceId).toBe("rsi_pg");
  });

  test("[DEP-RES-BACKUP-POLICY-003] due policy dispatches the existing backup command", async () => {
    const repository = new MemoryBackupPolicyRepository();
    const attempts = new MemoryProcessAttempts();
    const commandBus = new CapturingCommandBus();
    const service = new ScheduledDependencyBackupService(
      commandBus,
      repository,
      attempts,
      attempts,
      attempts,
      new SequenceIdGenerator(),
      new FixedClock("2026-01-15T00:00:00.000Z"),
    );
    const policy: DependencyResourceBackupPolicyRecord = {
      id: "dbp_pg",
      version: "v1",
      dependencyResourceId: "rsi_pg",
      retentionDays: 14,
      scheduleIntervalHours: 6,
      providerKey: null,
      retryOnFailure: true,
      enabled: true,
      lastRunAt: null,
      nextRunAt: "2026-01-15T00:00:00.000Z",
      updatedAt: "2026-01-15T00:00:00.000Z",
    };
    repository.records.set(policy.id, policy);

    const result = await service.run(context, {
      policy,
      scheduledAt: "2026-01-15T00:00:00.000Z",
    });

    expect(result._unsafeUnwrap()).toMatchObject({
      policyId: "dbp_pg",
      dependencyResourceId: "rsi_pg",
      backupId: "drb_scheduled",
      nextRunAt: "2026-01-15T06:00:00.000Z",
    });
    expect(commandBus.commands[0]).toBeInstanceOf(CreateDependencyResourceBackupCommand);
    expect(attempts.records[0]).toMatchObject({
      operationKey: "dependency-resources.create-backup",
      status: "pending",
      safeDetails: {
        dependencyResourceId: "rsi_pg",
      },
    });
    expect(attempts.completions[0]).toMatchObject({ status: "succeeded" });
    expect(repository.records.get("dbp_pg")?.lastRunAt).toBe("2026-01-15T00:00:00.000Z");
    expect(repository.records.get("dbp_pg")?.nextRunAt).toBe("2026-01-15T06:00:00.000Z");
  });
});
