import { type DomainError, domainError, err, ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";
import { z } from "zod";

import {
  Command,
  CommandHandler,
  type CommandHandlerContract,
  Query,
  QueryHandler,
  type QueryHandlerContract,
} from "../../cqrs";
import {
  type ExecutionContext,
  type RepositoryContext,
  toRepositoryContext,
} from "../../execution-context";
import {
  type Clock,
  type ConnectorProviderAdapterRegistry,
  type IdGenerator,
  type ProcessAttemptClaimer,
  type ProcessAttemptCompleter,
  type ProcessAttemptRecorder,
  type StorageVolumeBackupReadModel,
} from "../../ports";
import { tokens } from "../../tokens";
import { parseOperationInput } from "../shared-schema";
import { CreateStorageVolumeBackupCommand } from "./create-storage-volume-backup.command";
import { PruneStorageVolumeBackupCommand } from "./prune-storage-volume-backup.command";
import { storageBackupPlanRequestSchema } from "./storage-volume-backup.schema";
import { type StorageBackupPlanRequest } from "./storage-volume-backup-contract";

export type StorageVolumeBackupAutomationTrigger = "scheduled" | "pre-deploy";
export type StorageVolumeBackupFailureMode = "block" | "continue";

export interface StorageVolumeBackupPolicyRecord {
  id: string;
  version: string;
  storageVolumeId: string;
  planRequest: StorageBackupPlanRequest;
  scheduledEnabled: boolean;
  preDeployEnabled: boolean;
  scheduleIntervalHours: number;
  retryOnFailure: boolean;
  failureMode: StorageVolumeBackupFailureMode;
  notificationRef: string | null;
  lastRunAt: string | null;
  nextRunAt: string;
  lastTrigger: StorageVolumeBackupAutomationTrigger | null;
  lastStatus: "never" | "succeeded" | "failed";
  lastBackupId: string | null;
  lastProcessAttemptId: string | null;
  lastPrunedCount: number;
  lastNotificationStatus: "not-requested" | "delivered" | "failed";
  lastErrorCode: string | null;
  updatedAt: string;
}

export interface StorageVolumeBackupPolicyRepository {
  findOne(
    context: RepositoryContext,
    policyId: string,
  ): Promise<Result<StorageVolumeBackupPolicyRecord | null>>;
  listRecords(
    context: RepositoryContext,
    filter?: {
      storageVolumeId?: string;
      resourceId?: string;
      scheduledEnabledOnly?: boolean;
      preDeployEnabledOnly?: boolean;
      dueAt?: string;
      limit?: number;
    },
  ): Promise<Result<StorageVolumeBackupPolicyRecord[]>>;
  upsert(
    context: RepositoryContext,
    record: StorageVolumeBackupPolicyRecord,
  ): Promise<Result<StorageVolumeBackupPolicyRecord>>;
  claimScheduledRun(
    context: RepositoryContext,
    input: { policyId: string; dueAt: string; claimUntil: string },
  ): Promise<Result<boolean>>;
  recordRun(
    context: RepositoryContext,
    input: Pick<
      StorageVolumeBackupPolicyRecord,
      | "id"
      | "lastRunAt"
      | "nextRunAt"
      | "lastTrigger"
      | "lastStatus"
      | "lastBackupId"
      | "lastProcessAttemptId"
      | "lastPrunedCount"
      | "lastNotificationStatus"
      | "lastErrorCode"
      | "updatedAt"
    >,
  ): Promise<Result<StorageVolumeBackupPolicyRecord>>;
}

export interface BackupAutomationNotificationPort {
  notifyFailure(
    context: ExecutionContext,
    input: {
      notificationRef: string;
      policyId: string;
      storageVolumeId: string;
      trigger: StorageVolumeBackupAutomationTrigger;
      processAttemptId: string;
      errorCode: string;
      occurredAt: string;
    },
  ): Promise<Result<{ deliveredAt: string }>>;
}

export class NoopBackupAutomationNotificationPort implements BackupAutomationNotificationPort {
  async notifyFailure(): Promise<Result<{ deliveredAt: string }>> {
    return err(
      domainError.providerCapabilityUnsupported(
        "Backup automation notification provider is unavailable",
        {
          phase: "storage-volume-backup-automation-notification",
        },
      ),
    );
  }
}

export class ConnectorBackupAutomationNotificationPort implements BackupAutomationNotificationPort {
  constructor(private readonly adapters: ConnectorProviderAdapterRegistry) {}

  async notifyFailure(
    context: ExecutionContext,
    input: Parameters<BackupAutomationNotificationPort["notifyFailure"]>[1],
  ): Promise<Result<{ deliveredAt: string }>> {
    const adapter = this.adapters.findForConnector(input.notificationRef);
    if (!adapter?.canApply("notification.messages.send")) {
      return err(
        domainError.providerCapabilityUnsupported(
          "Backup automation notification connector is unavailable",
          {
            phase: "storage-volume-backup-automation-notification",
            connectorKey: input.notificationRef,
          },
        ),
      );
    }
    const result = await adapter.applyCapability(context, {
      connectorKey: input.notificationRef,
      capabilityKey: "notification.messages.send",
      ownerRef: { scope: "resource", id: input.storageVolumeId },
      parameters: {
        subject: "Appaloft storage backup failed",
        body: `Backup policy ${input.policyId} failed during ${input.trigger} with ${input.errorCode}.`,
        metadata: {
          policyId: input.policyId,
          storageVolumeId: input.storageVolumeId,
          trigger: input.trigger,
          processAttemptId: input.processAttemptId,
          occurredAt: input.occurredAt,
        },
      },
    });
    return result.map(() => ({ deliveredAt: new Date().toISOString() }));
  }
}

const optionalString = z.string().trim().min(1).optional();

export const configureStorageVolumeBackupPolicyCommandInputSchema = z
  .object({
    policyId: optionalString,
    version: optionalString.default("v1"),
    storageVolumeId: z.string().trim().min(1),
    planRequest: storageBackupPlanRequestSchema,
    scheduledEnabled: z.boolean().default(false),
    preDeployEnabled: z.boolean().default(false),
    scheduleIntervalHours: z.number().int().min(1).default(24),
    retryOnFailure: z.boolean().default(true),
    failureMode: z.enum(["block", "continue"]).default("block"),
    notificationRef: optionalString,
    nextRunAt: optionalString,
  })
  .superRefine((value, context) => {
    if (value.storageVolumeId !== value.planRequest.source.storageVolumeId) {
      context.addIssue({
        code: "custom",
        path: ["planRequest", "source", "storageVolumeId"],
        message: "Policy storageVolumeId must match backup source storageVolumeId",
      });
    }
  });

export const listStorageVolumeBackupPoliciesQueryInputSchema = z.object({
  storageVolumeId: optionalString,
});

export const showStorageVolumeBackupPolicyQueryInputSchema = z.object({
  policyId: z.string().trim().min(1),
});

export type ConfigureStorageVolumeBackupPolicyCommandInput = z.input<
  typeof configureStorageVolumeBackupPolicyCommandInputSchema
>;
export type ConfigureStorageVolumeBackupPolicyCommandPayload = z.output<
  typeof configureStorageVolumeBackupPolicyCommandInputSchema
>;
export type ListStorageVolumeBackupPoliciesQueryInput = z.input<
  typeof listStorageVolumeBackupPoliciesQueryInputSchema
>;
export type ShowStorageVolumeBackupPolicyQueryInput = z.input<
  typeof showStorageVolumeBackupPolicyQueryInputSchema
>;

export interface StorageVolumeBackupPolicyReadback {
  schemaVersion: "storage-volume-backup-policies.policy/v1";
  policy: StorageVolumeBackupPolicyRecord;
}

export interface StorageVolumeBackupPolicyListReadback {
  schemaVersion: "storage-volume-backup-policies.list/v1";
  items: StorageVolumeBackupPolicyRecord[];
}
export interface ConfigureStorageVolumeBackupPolicyResponse {
  id: string;
}

export class ConfigureStorageVolumeBackupPolicyCommand extends Command<{ id: string }> {
  constructor(public readonly input: ConfigureStorageVolumeBackupPolicyCommandPayload) {
    super();
  }

  static create(
    input: ConfigureStorageVolumeBackupPolicyCommandInput,
  ): Result<ConfigureStorageVolumeBackupPolicyCommand> {
    return parseOperationInput(configureStorageVolumeBackupPolicyCommandInputSchema, input).map(
      (parsed) => new ConfigureStorageVolumeBackupPolicyCommand(parsed),
    );
  }
}

export class ListStorageVolumeBackupPoliciesQuery extends Query<StorageVolumeBackupPolicyListReadback> {
  constructor(public readonly storageVolumeId?: string) {
    super();
  }

  static create(
    input: ListStorageVolumeBackupPoliciesQueryInput = {},
  ): Result<ListStorageVolumeBackupPoliciesQuery> {
    return parseOperationInput(listStorageVolumeBackupPoliciesQueryInputSchema, input).map(
      (parsed) => new ListStorageVolumeBackupPoliciesQuery(parsed.storageVolumeId),
    );
  }
}

export class ShowStorageVolumeBackupPolicyQuery extends Query<StorageVolumeBackupPolicyReadback> {
  constructor(public readonly policyId: string) {
    super();
  }

  static create(
    input: ShowStorageVolumeBackupPolicyQueryInput,
  ): Result<ShowStorageVolumeBackupPolicyQuery> {
    return parseOperationInput(showStorageVolumeBackupPolicyQueryInputSchema, input).map(
      (parsed) => new ShowStorageVolumeBackupPolicyQuery(parsed.policyId),
    );
  }
}

@injectable()
export class ConfigureStorageVolumeBackupPolicyUseCase {
  constructor(
    @inject(tokens.storageVolumeBackupPolicyRepository)
    private readonly repository: StorageVolumeBackupPolicyRepository,
    @inject(tokens.clock) private readonly clock: Clock,
    @inject(tokens.idGenerator) private readonly idGenerator: IdGenerator,
  ) {}

  async execute(
    context: ExecutionContext,
    input: ConfigureStorageVolumeBackupPolicyCommandPayload,
  ): Promise<Result<{ id: string }>> {
    const repositoryContext = toRepositoryContext(context);
    const now = this.clock.now();
    const id = input.policyId ?? this.idGenerator.next("sbp");
    const existing = await this.repository.findOne(repositoryContext, id);
    if (existing.isErr()) return err(existing.error);
    const record: StorageVolumeBackupPolicyRecord = {
      id,
      version: input.version,
      storageVolumeId: input.storageVolumeId,
      planRequest: input.planRequest,
      scheduledEnabled: input.scheduledEnabled,
      preDeployEnabled: input.preDeployEnabled,
      scheduleIntervalHours: input.scheduleIntervalHours,
      retryOnFailure: input.retryOnFailure,
      failureMode: input.failureMode,
      notificationRef: input.notificationRef ?? null,
      lastRunAt: existing.value?.lastRunAt ?? null,
      nextRunAt: input.nextRunAt ?? existing.value?.nextRunAt ?? now,
      lastTrigger: existing.value?.lastTrigger ?? null,
      lastStatus: existing.value?.lastStatus ?? "never",
      lastBackupId: existing.value?.lastBackupId ?? null,
      lastProcessAttemptId: existing.value?.lastProcessAttemptId ?? null,
      lastPrunedCount: existing.value?.lastPrunedCount ?? 0,
      lastNotificationStatus: existing.value?.lastNotificationStatus ?? "not-requested",
      lastErrorCode: existing.value?.lastErrorCode ?? null,
      updatedAt: now,
    };
    const persisted = await this.repository.upsert(repositoryContext, record);
    return persisted.map((value) => ({ id: value.id }));
  }
}

@injectable()
export class ListStorageVolumeBackupPoliciesQueryService {
  constructor(
    @inject(tokens.storageVolumeBackupPolicyRepository)
    private readonly repository: StorageVolumeBackupPolicyRepository,
  ) {}

  async execute(
    context: ExecutionContext,
    query: ListStorageVolumeBackupPoliciesQuery,
  ): Promise<Result<StorageVolumeBackupPolicyListReadback>> {
    const result = await this.repository.listRecords(toRepositoryContext(context), {
      ...(query.storageVolumeId ? { storageVolumeId: query.storageVolumeId } : {}),
    });
    return result.map((items) => ({
      schemaVersion: "storage-volume-backup-policies.list/v1",
      items,
    }));
  }
}

@injectable()
export class ShowStorageVolumeBackupPolicyQueryService {
  constructor(
    @inject(tokens.storageVolumeBackupPolicyRepository)
    private readonly repository: StorageVolumeBackupPolicyRepository,
  ) {}

  async execute(
    context: ExecutionContext,
    query: ShowStorageVolumeBackupPolicyQuery,
  ): Promise<Result<StorageVolumeBackupPolicyReadback>> {
    const result = await this.repository.findOne(toRepositoryContext(context), query.policyId);
    if (result.isErr()) return err(result.error);
    if (!result.value)
      return err(domainError.notFound("storage_volume_backup_policy", query.policyId));
    return ok({ schemaVersion: "storage-volume-backup-policies.policy/v1", policy: result.value });
  }
}

@CommandHandler(ConfigureStorageVolumeBackupPolicyCommand)
@injectable()
export class ConfigureStorageVolumeBackupPolicyCommandHandler
  implements CommandHandlerContract<ConfigureStorageVolumeBackupPolicyCommand, { id: string }>
{
  constructor(
    @inject(tokens.configureStorageVolumeBackupPolicyUseCase)
    private readonly useCase: ConfigureStorageVolumeBackupPolicyUseCase,
  ) {}
  handle(context: ExecutionContext, command: ConfigureStorageVolumeBackupPolicyCommand) {
    return this.useCase.execute(context, command.input);
  }
}

@QueryHandler(ListStorageVolumeBackupPoliciesQuery)
@injectable()
export class ListStorageVolumeBackupPoliciesQueryHandler
  implements
    QueryHandlerContract<
      ListStorageVolumeBackupPoliciesQuery,
      StorageVolumeBackupPolicyListReadback
    >
{
  constructor(
    @inject(tokens.listStorageVolumeBackupPoliciesQueryService)
    private readonly service: ListStorageVolumeBackupPoliciesQueryService,
  ) {}
  handle(context: ExecutionContext, query: ListStorageVolumeBackupPoliciesQuery) {
    return this.service.execute(context, query);
  }
}

@QueryHandler(ShowStorageVolumeBackupPolicyQuery)
@injectable()
export class ShowStorageVolumeBackupPolicyQueryHandler
  implements
    QueryHandlerContract<ShowStorageVolumeBackupPolicyQuery, StorageVolumeBackupPolicyReadback>
{
  constructor(
    @inject(tokens.showStorageVolumeBackupPolicyQueryService)
    private readonly service: ShowStorageVolumeBackupPolicyQueryService,
  ) {}
  handle(context: ExecutionContext, query: ShowStorageVolumeBackupPolicyQuery) {
    return this.service.execute(context, query);
  }
}

function addHours(at: string, hours: number): string {
  return new Date(Date.parse(at) + hours * 60 * 60 * 1000).toISOString();
}

@injectable()
export class StorageVolumeBackupAutomationService {
  constructor(
    @inject(tokens.commandBus)
    private readonly commandBus: {
      execute(context: ExecutionContext, command: Command<unknown>): Promise<Result<unknown>>;
    },
    @inject(tokens.storageVolumeBackupPolicyRepository)
    private readonly repository: StorageVolumeBackupPolicyRepository,
    @inject(tokens.storageVolumeBackupReadModel)
    private readonly backups: StorageVolumeBackupReadModel,
    @inject(tokens.processAttemptRecorder) private readonly attemptRecorder: ProcessAttemptRecorder,
    @inject(tokens.processAttemptClaimer) private readonly attemptClaimer: ProcessAttemptClaimer,
    @inject(tokens.processAttemptCompleter)
    private readonly attemptCompleter: ProcessAttemptCompleter,
    @inject(tokens.backupAutomationNotificationPort)
    private readonly notifications: BackupAutomationNotificationPort,
    @inject(tokens.idGenerator) private readonly idGenerator: IdGenerator,
    @inject(tokens.clock) private readonly clock: Clock,
  ) {}

  async runDue(
    context: ExecutionContext,
    dueAt = this.clock.now(),
    limit = 25,
  ): Promise<Result<{ completed: number; failed: number }>> {
    const policies = await this.repository.listRecords(toRepositoryContext(context), {
      scheduledEnabledOnly: true,
      dueAt,
      limit,
    });
    if (policies.isErr()) return err(policies.error);
    let completed = 0;
    let failed = 0;
    for (const policy of policies.value) {
      const claimed = await this.repository.claimScheduledRun(toRepositoryContext(context), {
        policyId: policy.id,
        dueAt,
        claimUntil: new Date(Date.parse(dueAt) + 10 * 60 * 1000).toISOString(),
      });
      if (claimed.isErr()) return err(claimed.error);
      if (!claimed.value) continue;
      const result = await this.runPolicy(context, policy, "scheduled", dueAt);
      if (result.isOk()) completed += 1;
      else failed += 1;
    }
    return ok({ completed, failed });
  }

  async runPreDeploy(
    context: ExecutionContext,
    resourceId: string,
  ): Promise<Result<{ completed: number; failed: number }>> {
    const policies = await this.repository.listRecords(toRepositoryContext(context), {
      resourceId,
      preDeployEnabledOnly: true,
    });
    if (policies.isErr()) return err(policies.error);
    let completed = 0;
    let failed = 0;
    for (const policy of policies.value) {
      const result = await this.runPolicy(context, policy, "pre-deploy", this.clock.now());
      if (result.isOk()) completed += 1;
      else {
        failed += 1;
        if (policy.failureMode === "block") return err(result.error);
      }
    }
    return ok({ completed, failed });
  }

  private async runPolicy(
    context: ExecutionContext,
    policy: StorageVolumeBackupPolicyRecord,
    trigger: StorageVolumeBackupAutomationTrigger,
    scheduledAt: string,
  ): Promise<Result<{ backupId: string; prunedCount: number }>> {
    const repositoryContext = toRepositoryContext(context);
    const processAttemptId = this.idGenerator.next("wrk");
    const normalNextRunAt = addHours(scheduledAt, policy.scheduleIntervalHours);
    const dedupeKey = `storage-volume-backup:${policy.id}:${trigger}:${trigger === "scheduled" ? scheduledAt : context.requestId}`;
    const recorded = await this.attemptRecorder.record(repositoryContext, {
      id: processAttemptId,
      kind: "system",
      status: "pending",
      operationKey: "storage-volumes.create-backup",
      dedupeKey,
      correlationId: context.requestId,
      requestId: context.requestId,
      phase: "storage-volume-backup-automation",
      step: trigger,
      startedAt: scheduledAt,
      updatedAt: scheduledAt,
      nextActions: ["no-action"],
      safeDetails: { policyId: policy.id, storageVolumeId: policy.storageVolumeId, trigger },
    });
    if (recorded.isErr()) return err(recorded.error);
    const claim = await this.attemptClaimer.claimDue(repositoryContext, {
      attemptId: processAttemptId,
      workerId: "storage-volume-backup-automation-worker",
      claimedAt: scheduledAt,
      safeDetails: { policyId: policy.id, storageVolumeId: policy.storageVolumeId, trigger },
    });
    if (claim.isErr()) return err(claim.error);
    if (claim.value.status !== "claimed") {
      return err(
        domainError.conflict("Storage volume backup automation attempt was not claimed", {
          phase: "storage-volume-backup-automation-claim",
          processAttemptId,
          claimStatus: claim.value.status,
        }),
      );
    }

    const command = CreateStorageVolumeBackupCommand.create({
      storageVolumeId: policy.storageVolumeId,
      planRequest: policy.planRequest,
    });
    if (command.isErr()) {
      return this.failRun(
        context,
        policy,
        trigger,
        processAttemptId,
        command.error,
        scheduledAt,
        normalNextRunAt,
      );
    }
    const backupResult = await this.commandBus.execute(context, command.value);
    const completedAt = this.clock.now();
    if (backupResult.isErr()) {
      return this.failRun(
        context,
        policy,
        trigger,
        processAttemptId,
        backupResult.error,
        completedAt,
        normalNextRunAt,
      );
    }

    const backupId = (backupResult.value as { id: string }).id;
    const pruneResult = await this.enforceRetention(context, policy, backupId);
    if (pruneResult.isErr()) {
      return this.failRun(
        context,
        policy,
        trigger,
        processAttemptId,
        pruneResult.error,
        completedAt,
        normalNextRunAt,
        backupId,
      );
    }

    const recordedRun = await this.repository.recordRun(repositoryContext, {
      id: policy.id,
      lastRunAt: completedAt,
      nextRunAt: normalNextRunAt,
      lastTrigger: trigger,
      lastStatus: "succeeded",
      lastBackupId: backupId,
      lastProcessAttemptId: processAttemptId,
      lastPrunedCount: pruneResult.value,
      lastNotificationStatus: "not-requested",
      lastErrorCode: null,
      updatedAt: completedAt,
    });
    if (recordedRun.isErr()) return err(recordedRun.error);
    const completedAttempt = await this.attemptCompleter.complete(repositoryContext, {
      attemptId: processAttemptId,
      status: "succeeded",
      completedAt,
      phase: "storage-volume-backup-automation",
      step: trigger,
      nextActions: ["no-action"],
      safeDetails: {
        policyId: policy.id,
        storageVolumeId: policy.storageVolumeId,
        trigger,
        backupId,
        prunedCount: pruneResult.value,
      },
    });
    if (completedAttempt.isErr()) return err(completedAttempt.error);
    return ok({ backupId, prunedCount: pruneResult.value });
  }

  private async failRun(
    context: ExecutionContext,
    policy: StorageVolumeBackupPolicyRecord,
    trigger: StorageVolumeBackupAutomationTrigger,
    processAttemptId: string,
    failure: DomainError,
    completedAt: string,
    normalNextRunAt: string,
    backupId: string | null = null,
  ): Promise<Result<never>> {
    const repositoryContext = toRepositoryContext(context);
    const nextRunAt = policy.retryOnFailure
      ? new Date(Date.parse(completedAt) + 15 * 60 * 1000).toISOString()
      : normalNextRunAt;
    const notificationStatus = await this.notifyFailure(
      context,
      policy,
      trigger,
      processAttemptId,
      failure.code,
      completedAt,
    );
    const recorded = await this.repository.recordRun(repositoryContext, {
      id: policy.id,
      lastRunAt: completedAt,
      nextRunAt,
      lastTrigger: trigger,
      lastStatus: "failed",
      lastBackupId: backupId,
      lastProcessAttemptId: processAttemptId,
      lastPrunedCount: 0,
      lastNotificationStatus: notificationStatus,
      lastErrorCode: failure.code,
      updatedAt: completedAt,
    });
    if (recorded.isErr()) return err(recorded.error);
    const completed = await this.attemptCompleter.complete(repositoryContext, {
      attemptId: processAttemptId,
      status: policy.retryOnFailure ? "retry-scheduled" : "failed",
      completedAt,
      phase: "storage-volume-backup-automation",
      step: trigger,
      errorCode: failure.code,
      errorCategory: failure.category,
      retriable: policy.retryOnFailure,
      ...(policy.retryOnFailure ? { nextEligibleAt: nextRunAt } : {}),
      nextActions: policy.retryOnFailure ? ["retry", "manual-review"] : ["manual-review"],
      safeDetails: { policyId: policy.id, storageVolumeId: policy.storageVolumeId, trigger },
    });
    if (completed.isErr()) return err(completed.error);
    return err(failure);
  }

  private async enforceRetention(
    context: ExecutionContext,
    policy: StorageVolumeBackupPolicyRecord,
    newBackupId: string,
  ): Promise<Result<number>> {
    const ready = await this.backups.list(toRepositoryContext(context), {
      storageVolumeId: policy.storageVolumeId,
      status: "ready",
    });
    const verified = ready.find((item) => item.id === newBackupId && item.checksum);
    if (!verified) {
      return err(
        domainError.conflict("Automatic retention requires a verified new backup artifact", {
          phase: "storage-volume-backup-retention",
          storageVolumeId: policy.storageVolumeId,
          backupId: newBackupId,
        }),
      );
    }
    const maxCount = Math.max(1, policy.planRequest.retention.maxCount);
    const cutoff = policy.planRequest.retention.maxAgeDays
      ? Date.parse(this.clock.now()) - policy.planRequest.retention.maxAgeDays * 86_400_000
      : null;
    const ordered = [...ready].sort(
      (left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt),
    );
    let retainedBytes = 0;
    const candidates = ordered.filter((item, index) => {
      const exceedsCount = index >= maxCount;
      const exceedsAge = cutoff !== null && Date.parse(item.createdAt) < cutoff;
      const sizeBytes = item.sizeBytes ?? 0;
      const exceedsBytes =
        policy.planRequest.retention.maxBytes !== undefined &&
        retainedBytes + sizeBytes > policy.planRequest.retention.maxBytes;
      if (item.id === newBackupId) {
        retainedBytes += sizeBytes;
        return false;
      }
      if (exceedsCount || exceedsAge || exceedsBytes) return true;
      retainedBytes += sizeBytes;
      return false;
    });
    let pruned = 0;
    for (const candidate of candidates) {
      const command = PruneStorageVolumeBackupCommand.create({ backupId: candidate.id });
      if (command.isErr()) return err(command.error);
      const result = await this.commandBus.execute(context, command.value);
      if (result.isErr()) return err(result.error);
      pruned += 1;
    }
    return ok(pruned);
  }

  private async notifyFailure(
    context: ExecutionContext,
    policy: StorageVolumeBackupPolicyRecord,
    trigger: StorageVolumeBackupAutomationTrigger,
    processAttemptId: string,
    errorCode: string,
    occurredAt: string,
  ): Promise<StorageVolumeBackupPolicyRecord["lastNotificationStatus"]> {
    if (!policy.notificationRef) return "not-requested";
    const result = await this.notifications.notifyFailure(context, {
      notificationRef: policy.notificationRef,
      policyId: policy.id,
      storageVolumeId: policy.storageVolumeId,
      trigger,
      processAttemptId,
      errorCode,
      occurredAt,
    });
    return result.isOk() ? "delivered" : "failed";
  }
}
