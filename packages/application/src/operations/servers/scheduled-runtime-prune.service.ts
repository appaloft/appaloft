import { domainError, err, ok, type Result, safeTry } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type CommandBus } from "../../cqrs";
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
  type RuntimeTargetCapacityPruneResult,
} from "../../ports";
import { tokens } from "../../tokens";
import {
  PruneServerCapacityCommand,
  type RuntimeTargetPruneCategory,
} from "./prune-server-capacity.command";

export const scheduledRuntimePruneOperationKey = "servers.capacity.prune";
export const scheduledRuntimePruneWorkerId = "scheduled-runtime-prune-worker";
export const scheduledRuntimePruneWorkKind = "runtime-maintenance";

export type ScheduledRuntimePrunePolicyScope =
  | "defaults"
  | "system"
  | "organization"
  | "project"
  | "environment"
  | "deployment-snapshot";

export interface ScheduledRuntimePrunePolicy {
  id: string;
  version: string;
  scope: ScheduledRuntimePrunePolicyScope;
  serverId: string;
  retentionDays: number;
  destructive?: boolean;
  categories?: RuntimeTargetPruneCategory[];
  retryOnFailure?: boolean;
}

export interface ScheduledRuntimePrunePolicyRecord
  extends Omit<ScheduledRuntimePrunePolicy, "categories" | "destructive" | "retryOnFailure"> {
  destructive: boolean;
  categories: RuntimeTargetPruneCategory[];
  retryOnFailure: boolean;
  enabled: boolean;
  updatedAt: string;
}

export interface ScheduledRuntimePrunePolicyListFilter {
  serverId?: string;
  scopes?: ScheduledRuntimePrunePolicyScope[];
  enabledOnly?: boolean;
}

export interface ScheduledRuntimePrunePolicyReadModel {
  list(
    context: RepositoryContext,
    filter?: ScheduledRuntimePrunePolicyListFilter,
  ): Promise<Result<ScheduledRuntimePrunePolicy[]>>;
}

export interface ScheduledRuntimePrunePolicyRepository
  extends ScheduledRuntimePrunePolicyReadModel {
  findOne(
    context: RepositoryContext,
    policyId: string,
  ): Promise<Result<ScheduledRuntimePrunePolicyRecord | null>>;
  listRecords(
    context: RepositoryContext,
    filter?: ScheduledRuntimePrunePolicyListFilter,
  ): Promise<Result<ScheduledRuntimePrunePolicyRecord[]>>;
  upsert(
    context: RepositoryContext,
    record: ScheduledRuntimePrunePolicyRecord,
  ): Promise<Result<ScheduledRuntimePrunePolicyRecord>>;
}

export interface ScheduledRuntimePrunePolicyRead {
  schemaVersion: "scheduled-runtime-prune-policies.policy/v1";
  id: string;
  version: string;
  scope: ScheduledRuntimePrunePolicyScope;
  serverId: string;
  retentionDays: number;
  destructive: boolean;
  categories: RuntimeTargetPruneCategory[];
  categoryCount: number;
  retryOnFailure: boolean;
  enabled: boolean;
  updatedAt: string;
}

export interface ConfigureScheduledRuntimePrunePolicyResult {
  id: string;
}

export interface ShowScheduledRuntimePrunePolicyResult {
  schemaVersion: "scheduled-runtime-prune-policies.show/v1";
  policy: ScheduledRuntimePrunePolicyRead | null;
}

export interface ListScheduledRuntimePrunePoliciesResult {
  schemaVersion: "scheduled-runtime-prune-policies.list/v1";
  items: ScheduledRuntimePrunePolicyRead[];
}

export const scheduledRuntimePrunePolicyPrecedence: ScheduledRuntimePrunePolicyScope[] = [
  "defaults",
  "system",
  "organization",
  "project",
  "environment",
  "deployment-snapshot",
];

export interface ScheduledRuntimePrunePolicyReadback {
  id: string;
  version: string;
  scope: ScheduledRuntimePrunePolicyScope;
  serverId: string;
  retentionDays: number;
  destructive: boolean;
  categories: RuntimeTargetPruneCategory[];
  categoryCount: number;
}

export function scheduledRuntimePrunePolicyRecordReadback(
  policy: ScheduledRuntimePrunePolicyRecord,
): ScheduledRuntimePrunePolicyRead {
  const categories = policy.categories ?? [];
  return {
    schemaVersion: "scheduled-runtime-prune-policies.policy/v1",
    id: policy.id,
    version: policy.version,
    scope: policy.scope,
    serverId: policy.serverId,
    retentionDays: policy.retentionDays,
    destructive: policy.destructive === true,
    categories,
    categoryCount: categories.length,
    retryOnFailure: policy.retryOnFailure !== false,
    enabled: policy.enabled,
    updatedAt: policy.updatedAt,
  };
}

export interface ScheduledRuntimePrunePolicyResolutionInput {
  serverId: string;
  policies: ScheduledRuntimePrunePolicy[];
}

export interface ScheduledRuntimePrunePolicyResolution {
  schemaVersion: "scheduled-runtime-prune.policy-resolution/v1";
  serverId: string;
  precedence: ScheduledRuntimePrunePolicyScope[];
  candidates: ScheduledRuntimePrunePolicyReadback[];
  selectedPolicy?: ScheduledRuntimePrunePolicyReadback;
}

export interface ScheduledRuntimePruneRunInput {
  policy: ScheduledRuntimePrunePolicy;
  scheduledAt?: string;
}

export interface ScheduledRuntimePruneRunResult {
  schemaVersion: "scheduled-runtime-prune.run/v1";
  processAttemptId: string;
  serverId: string;
  policyId: string;
  policyScope: ScheduledRuntimePrunePolicyScope;
  before: string;
  dryRun: boolean;
  prune: RuntimeTargetCapacityPruneResult;
}

function cutoffFromRetention(scheduledAt: string, retentionDays: number): Result<string> {
  if (!Number.isInteger(retentionDays) || retentionDays < 1) {
    return err(
      domainError.validation("Runtime prune retention days must be a positive integer", {
        phase: "scheduled-runtime-prune-policy",
        retentionDays,
      }),
    );
  }

  const scheduledTime = Date.parse(scheduledAt);
  if (!Number.isFinite(scheduledTime)) {
    return err(
      domainError.validation("Scheduled runtime prune timestamp must be an ISO timestamp", {
        phase: "scheduled-runtime-prune-policy",
        scheduledAt,
      }),
    );
  }

  const retentionMs = retentionDays * 24 * 60 * 60 * 1000;
  return ok(new Date(scheduledTime - retentionMs).toISOString());
}

function policyRank(scope: ScheduledRuntimePrunePolicyScope): number {
  return scheduledRuntimePrunePolicyPrecedence.indexOf(scope);
}

function policyReadback(policy: ScheduledRuntimePrunePolicy): ScheduledRuntimePrunePolicyReadback {
  const categories = policy.categories ?? [];
  return {
    id: policy.id,
    version: policy.version,
    scope: policy.scope,
    serverId: policy.serverId,
    retentionDays: policy.retentionDays,
    destructive: policy.destructive === true,
    categories,
    categoryCount: categories.length,
  };
}

@injectable()
export class ScheduledRuntimePrunePolicyResolver {
  resolve(
    input: ScheduledRuntimePrunePolicyResolutionInput,
  ): Result<ScheduledRuntimePrunePolicyResolution> {
    const serverId = input.serverId.trim();
    if (!serverId) {
      return err(
        domainError.validation("Scheduled runtime prune policy resolution requires a server id", {
          phase: "scheduled-runtime-prune-policy",
        }),
      );
    }

    const candidates = input.policies
      .filter((policy) => policy.serverId === serverId || policy.serverId === "*")
      .map((policy, index) => ({ policy, index }))
      .sort((left, right) => {
        const rankDelta = policyRank(right.policy.scope) - policyRank(left.policy.scope);
        return rankDelta === 0 ? right.index - left.index : rankDelta;
      });

    const selected = candidates[0]?.policy;
    return ok({
      schemaVersion: "scheduled-runtime-prune.policy-resolution/v1",
      serverId,
      precedence: scheduledRuntimePrunePolicyPrecedence,
      candidates: candidates.map(({ policy }) => policyReadback(policy)),
      ...(selected ? { selectedPolicy: policyReadback(selected) } : {}),
    });
  }
}

@injectable()
export class ScheduledRuntimePruneService {
  constructor(
    @inject(tokens.commandBus)
    private readonly commandBus: Pick<CommandBus, "execute">,
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
    input: ScheduledRuntimePruneRunInput,
  ): Promise<Result<ScheduledRuntimePruneRunResult>> {
    const repositoryContext = toRepositoryContext(context);
    const {
      clock,
      commandBus,
      idGenerator,
      processAttemptClaimer,
      processAttemptCompleter,
      processAttemptRecorder,
    } = this;

    return safeTry(async function* () {
      const scheduledAt = input.scheduledAt ?? clock.now();
      const before = yield* cutoffFromRetention(scheduledAt, input.policy.retentionDays);
      const dryRun = input.policy.destructive !== true;
      const processAttemptId = idGenerator.next("wrk");
      const categoryCount = input.policy.categories?.length ?? 0;

      yield* await processAttemptRecorder.record(repositoryContext, {
        id: processAttemptId,
        kind: scheduledRuntimePruneWorkKind,
        status: "pending",
        operationKey: scheduledRuntimePruneOperationKey,
        dedupeKey: `scheduled-runtime-prune:${input.policy.serverId}:${input.policy.id}:${scheduledAt}`,
        correlationId: context.requestId,
        requestId: context.requestId,
        phase: "scheduled-runtime-prune",
        step: "accepted",
        serverId: input.policy.serverId,
        startedAt: scheduledAt,
        updatedAt: scheduledAt,
        nextActions: ["no-action"],
        safeDetails: {
          trigger: "scheduled-runtime-prune",
          policyId: input.policy.id,
          policyVersion: input.policy.version,
          policyScope: input.policy.scope,
          serverId: input.policy.serverId,
          before,
          dryRun,
          categoryCount,
        },
      });

      const claimResult = yield* await processAttemptClaimer.claimDue(repositoryContext, {
        attemptId: processAttemptId,
        workerId: scheduledRuntimePruneWorkerId,
        claimedAt: scheduledAt,
        safeDetails: {
          policyId: input.policy.id,
          policyVersion: input.policy.version,
          policyScope: input.policy.scope,
          serverId: input.policy.serverId,
          before,
          dryRun,
          categoryCount,
        },
      });

      if (claimResult.status !== "claimed") {
        return err(
          domainError.conflict("Scheduled runtime prune process attempt could not be claimed", {
            phase: "scheduled-runtime-prune-worker",
            processAttemptId,
            claimStatus: claimResult.status,
          }),
        );
      }

      const command = yield* PruneServerCapacityCommand.create({
        serverId: input.policy.serverId,
        before,
        dryRun,
        ...(input.policy.categories ? { categories: input.policy.categories } : {}),
      });
      const pruneResult = await commandBus.execute(context, command);
      const completedAt = clock.now();

      if (pruneResult.isErr()) {
        const retryOnFailure = input.policy.retryOnFailure !== false;
        yield* await processAttemptCompleter.complete(repositoryContext, {
          attemptId: processAttemptId,
          status: retryOnFailure ? "retry-scheduled" : "failed",
          completedAt,
          phase: "scheduled-runtime-prune",
          step: "servers-capacity-prune",
          errorCode: pruneResult.error.code,
          errorCategory: pruneResult.error.category,
          retriable: retryOnFailure,
          ...(retryOnFailure ? { nextEligibleAt: completedAt } : {}),
          nextActions: retryOnFailure ? ["retry", "manual-review"] : ["manual-review"],
          safeDetails: {
            policyId: input.policy.id,
            policyVersion: input.policy.version,
            policyScope: input.policy.scope,
            serverId: input.policy.serverId,
            before,
            dryRun,
            categoryCount,
          },
        });
        return err(pruneResult.error);
      }

      yield* await processAttemptCompleter.complete(repositoryContext, {
        attemptId: processAttemptId,
        status: "succeeded",
        completedAt,
        phase: "scheduled-runtime-prune",
        step: "servers-capacity-prune",
        nextActions: ["no-action"],
        safeDetails: {
          policyId: input.policy.id,
          policyVersion: input.policy.version,
          policyScope: input.policy.scope,
          serverId: input.policy.serverId,
          before,
          dryRun,
          prunedCount: pruneResult.value.summary.prunedCount,
          reclaimedBytes: pruneResult.value.summary.reclaimedBytes,
          categoryCount,
        },
      });

      return ok({
        schemaVersion: "scheduled-runtime-prune.run/v1",
        processAttemptId,
        serverId: input.policy.serverId,
        policyId: input.policy.id,
        policyScope: input.policy.scope,
        before,
        dryRun,
        prune: pruneResult.value,
      } satisfies ScheduledRuntimePruneRunResult);
    });
  }
}
