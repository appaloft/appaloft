import { domainError, err, ok, type Result, safeTry } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type Command, type CommandBus } from "../../cqrs";
import {
  type ExecutionContext,
  type RepositoryContext,
  toRepositoryContext,
} from "../../execution-context";
import {
  type Clock,
  type IdGenerator,
  type ProcessAttemptClaimer,
  type ProcessAttemptCompleter,
  type ProcessAttemptRecorder,
  type RuntimeMonitoringSampleRetentionStore,
} from "../../ports";
import { tokens } from "../../tokens";
import { PruneAuditEventsCommand } from "../audit-events/prune-audit-events.command";
import { PruneDeploymentLogsCommand } from "../deployments/prune-deployment-logs.command";
import { PruneDomainEventsCommand } from "../domain-events/prune-domain-events.command";
import { PruneOperatorWorkCommand } from "../operator-work/prune-operator-work.command";
import { PruneProviderJobLogsCommand } from "../provider-job-logs/prune-provider-job-logs.command";
import { PruneResourceRuntimeLogArchivesCommand } from "../resources/prune-resource-runtime-log-archives.command";
import {
  type RetentionDefaultCategory,
  type RetentionDefaultRecord,
  type RetentionDefaultRepository,
} from "./retention-defaults.service";

export const scheduledHistoryRetentionWorkerId = "scheduled-history-retention-worker";
export const scheduledHistoryRetentionWorkKind = "runtime-maintenance";

export interface ScheduledHistoryRetentionRunInput {
  scheduledAt?: string;
  scope?: "organization" | "system";
  organizationId?: string;
  categories?: RetentionDefaultCategory[];
  limit?: number;
}

export type ScheduledHistoryRetentionDispatchStatus =
  | "dispatched"
  | "skipped-dry-run-disabled"
  | "unsupported-category";

export interface ScheduledHistoryRetentionDispatchResult {
  category: RetentionDefaultCategory;
  policyId: string;
  processAttemptId?: string;
  operationKey?: string;
  before?: string;
  dryRun?: boolean;
  status: ScheduledHistoryRetentionDispatchStatus;
}

export interface ScheduledHistoryRetentionRunResult {
  schemaVersion: "scheduled-history-retention.run/v1";
  scheduledAt: string;
  inspectedPolicyCount: number;
  dispatchedCount: number;
  skippedCount: number;
  dispatches: ScheduledHistoryRetentionDispatchResult[];
}

type PruneCommandFactory = (input: { before: string; dryRun: boolean }) => Result<Command<unknown>>;
type ScheduledHistoryRetentionCommandConfig = {
  operationKey: string;
  create: PruneCommandFactory;
};

const scheduledHistoryRetentionCommands: Partial<
  Record<RetentionDefaultCategory, ScheduledHistoryRetentionCommandConfig>
> = {
  "audit-rows": {
    operationKey: "audit-events.prune",
    create: (input) => PruneAuditEventsCommand.create(input),
  },
  "deployment-logs": {
    operationKey: "deployments.logs.prune",
    create: (input) => PruneDeploymentLogsCommand.create(input),
  },
  "domain-event-streams": {
    operationKey: "domain-events.prune",
    create: (input) => PruneDomainEventsCommand.create(input),
  },
  "process-attempts": {
    operationKey: "operator-work.prune",
    create: (input) => PruneOperatorWorkCommand.create(input),
  },
  "provider-job-logs": {
    operationKey: "provider-job-logs.prune",
    create: (input) => PruneProviderJobLogsCommand.create(input),
  },
  "resource-runtime-log-archives": {
    operationKey: "resources.runtime-log-archives.prune",
    create: (input) => PruneResourceRuntimeLogArchivesCommand.create(input),
  },
};

const runtimeMonitoringSamplesPruneOperationKey = "runtime-monitoring.samples.prune";

const scheduledHistoryRetentionDirectStores: Partial<
  Record<RetentionDefaultCategory, { operationKey: string }>
> = {
  "runtime-monitoring-samples": {
    operationKey: runtimeMonitoringSamplesPruneOperationKey,
  },
};

function cutoffFromRetention(scheduledAt: string, retentionDays: number): Result<string> {
  if (!Number.isInteger(retentionDays) || retentionDays < 1) {
    return err(
      domainError.validation("Scheduled history retention days must be a positive integer", {
        phase: "scheduled-history-retention-policy",
        retentionDays,
      }),
    );
  }

  const scheduledTime = Date.parse(scheduledAt);
  if (!Number.isFinite(scheduledTime)) {
    return err(
      domainError.validation("Scheduled history retention timestamp must be an ISO timestamp", {
        phase: "scheduled-history-retention-policy",
        scheduledAt,
      }),
    );
  }

  const retentionMs = retentionDays * 24 * 60 * 60 * 1000;
  return ok(new Date(scheduledTime - retentionMs).toISOString());
}

function policyMatchesInput(
  policy: RetentionDefaultRecord,
  input: ScheduledHistoryRetentionRunInput,
): boolean {
  const matchesScope = input.scope ? policy.scope === input.scope : true;
  const matchesOrganization =
    input.organizationId !== undefined ? policy.organizationId === input.organizationId : true;
  const matchesCategory = input.categories ? input.categories.includes(policy.category) : true;
  return matchesScope && matchesOrganization && matchesCategory;
}

function validateLimit(input: ScheduledHistoryRetentionRunInput): Result<number | undefined> {
  if (input.limit === undefined) {
    return ok(undefined);
  }
  if (!Number.isInteger(input.limit) || input.limit < 1) {
    return err(
      domainError.validation("Scheduled history retention limit must be a positive integer", {
        phase: "scheduled-history-retention-policy",
        limit: input.limit,
      }),
    );
  }
  return ok(input.limit);
}

@injectable()
export class ScheduledHistoryRetentionService {
  constructor(
    @inject(tokens.commandBus)
    private readonly commandBus: Pick<CommandBus, "execute">,
    @inject(tokens.retentionDefaultRepository)
    private readonly retentionDefaultRepository: RetentionDefaultRepository,
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
    @inject(tokens.runtimeMonitoringSampleRetentionStore)
    private readonly runtimeMonitoringSampleRetentionStore: RuntimeMonitoringSampleRetentionStore,
  ) {}

  async run(
    context: ExecutionContext,
    input: ScheduledHistoryRetentionRunInput = {},
  ): Promise<Result<ScheduledHistoryRetentionRunResult>> {
    const repositoryContext = toRepositoryContext(context);
    const {
      clock,
      commandBus,
      idGenerator,
      processAttemptClaimer,
      processAttemptCompleter,
      processAttemptRecorder,
      retentionDefaultRepository,
      runtimeMonitoringSampleRetentionStore,
    } = this;

    return safeTry(async function* () {
      const scheduledAt = input.scheduledAt ?? clock.now();
      const listed = yield* await retentionDefaultRepository.list(repositoryContext, {
        enabledOnly: true,
        ...(input.scope ? { scope: input.scope } : {}),
        ...(input.organizationId ? { organizationId: input.organizationId } : {}),
      });
      const limit = yield* validateLimit(input);
      const matchedPolicies = listed.filter((policy) => policyMatchesInput(policy, input));
      const policies = limit === undefined ? matchedPolicies : matchedPolicies.slice(0, limit);
      const dispatches: ScheduledHistoryRetentionDispatchResult[] = [];

      for (const policy of policies) {
        if (!policy.dryRunSchedulingEnabled && !policy.destructiveSchedulingEnabled) {
          dispatches.push({
            category: policy.category,
            policyId: policy.id,
            status: "skipped-dry-run-disabled",
          });
          continue;
        }

        const configured =
          scheduledHistoryRetentionCommands[policy.category] ??
          scheduledHistoryRetentionDirectStores[policy.category];
        if (!configured) {
          dispatches.push({
            category: policy.category,
            policyId: policy.id,
            status: "unsupported-category",
          });
          continue;
        }

        const before = yield* cutoffFromRetention(scheduledAt, policy.retentionDays);
        const dryRun = policy.destructiveSchedulingEnabled !== true;
        const processAttemptId = idGenerator.next("wrk");
        const safeDetails = {
          trigger: "scheduled-history-retention",
          policyId: policy.id,
          policyScope: policy.scope,
          category: policy.category,
          operationKey: configured.operationKey,
          before,
          dryRun,
        };

        yield* await recordAcceptedAttempt(repositoryContext, processAttemptRecorder, {
          processAttemptId,
          operationKey: configured.operationKey,
          policy,
          scheduledAt,
          requestId: context.requestId,
          safeDetails,
        });

        const claimResult = yield* await processAttemptClaimer.claimDue(repositoryContext, {
          attemptId: processAttemptId,
          workerId: scheduledHistoryRetentionWorkerId,
          claimedAt: scheduledAt,
          safeDetails,
        });

        if (claimResult.status !== "claimed") {
          return err(
            domainError.conflict(
              "Scheduled history retention process attempt could not be claimed",
              {
                phase: "scheduled-history-retention-worker",
                processAttemptId,
                claimStatus: claimResult.status,
              },
            ),
          );
        }

        const commandConfigured = scheduledHistoryRetentionCommands[policy.category];
        const pruneResult =
          policy.category === "runtime-monitoring-samples"
            ? await runtimeMonitoringSampleRetentionStore.prune(repositoryContext, {
                before,
                dryRun,
              })
            : await dispatchPruneCommand(context, commandBus, commandConfigured, {
                before,
                dryRun,
              });
        const completedAt = clock.now();

        if (pruneResult.isErr()) {
          yield* await processAttemptCompleter.complete(repositoryContext, {
            attemptId: processAttemptId,
            status: "retry-scheduled",
            completedAt,
            phase: "scheduled-history-retention",
            step: configured.operationKey,
            errorCode: pruneResult.error.code,
            errorCategory: pruneResult.error.category,
            retriable: true,
            nextEligibleAt: completedAt,
            nextActions: ["retry", "manual-review"],
            safeDetails,
          });
          return err(pruneResult.error);
        }

        yield* await processAttemptCompleter.complete(repositoryContext, {
          attemptId: processAttemptId,
          status: "succeeded",
          completedAt,
          phase: "scheduled-history-retention",
          step: configured.operationKey,
          nextActions: ["no-action"],
          safeDetails: {
            ...safeDetails,
            ...safeCountDetails(pruneResult.value),
          },
        });

        dispatches.push({
          category: policy.category,
          policyId: policy.id,
          processAttemptId,
          operationKey: configured.operationKey,
          before,
          dryRun,
          status: "dispatched",
        });
      }

      return ok({
        schemaVersion: "scheduled-history-retention.run/v1",
        scheduledAt,
        inspectedPolicyCount: policies.length,
        dispatchedCount: dispatches.filter((dispatch) => dispatch.status === "dispatched").length,
        skippedCount: dispatches.filter((dispatch) => dispatch.status !== "dispatched").length,
        dispatches,
      } satisfies ScheduledHistoryRetentionRunResult);
    });
  }
}

async function recordAcceptedAttempt(
  context: RepositoryContext,
  recorder: ProcessAttemptRecorder,
  input: {
    processAttemptId: string;
    operationKey: string;
    policy: RetentionDefaultRecord;
    scheduledAt: string;
    requestId: string;
    safeDetails: Record<string, string | number | boolean | null>;
  },
): Promise<Result<void>> {
  const recorded = await recorder.record(context, {
    id: input.processAttemptId,
    kind: scheduledHistoryRetentionWorkKind,
    status: "pending",
    operationKey: input.operationKey,
    dedupeKey: `scheduled-history-retention:${input.policy.id}:${input.scheduledAt}`,
    correlationId: input.requestId,
    requestId: input.requestId,
    phase: "scheduled-history-retention",
    step: "accepted",
    startedAt: input.scheduledAt,
    updatedAt: input.scheduledAt,
    nextActions: ["no-action"],
    safeDetails: input.safeDetails,
  });

  return recorded.map(() => undefined);
}

async function dispatchPruneCommand(
  context: ExecutionContext,
  commandBus: Pick<CommandBus, "execute">,
  configured: ScheduledHistoryRetentionCommandConfig | undefined,
  input: { before: string; dryRun: boolean },
): Promise<Result<unknown>> {
  if (!configured) {
    return err(
      domainError.validation("Scheduled history retention command configuration is missing", {
        phase: "scheduled-history-retention",
      }),
    );
  }

  const command = configured.create(input);
  if (command.isErr()) {
    return err(command.error);
  }

  return commandBus.execute(context, command.value);
}

function safeCountDetails(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object") {
    return {};
  }
  const source = value as Record<string, unknown>;
  const details: Record<string, number> = {};
  for (const key of [
    "matchedCount",
    "prunedCount",
    "candidateCount",
    "skippedCount",
    "heldCount",
    "archiveRetainedCount",
    "inspectedCount",
  ]) {
    const count = source[key];
    if (typeof count === "number" && Number.isFinite(count)) {
      details[key] = count;
    }
  }
  return details;
}
