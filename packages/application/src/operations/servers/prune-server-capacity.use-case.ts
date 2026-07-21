import {
  DeploymentTargetByIdSpec,
  DeploymentTargetId,
  type DomainError,
  domainError,
  err,
  ok,
  type Result,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type AuditEventRecorder,
  type Clock,
  type IdGenerator,
  type RuntimeTargetCapacityPruneResult,
  type RuntimeTargetCapacityPruner,
  type ServerRepository,
} from "../../ports";
import { tokens } from "../../tokens";
import { type ParsedPruneServerCapacityCommandInput } from "./prune-server-capacity.command";

function withPruneServerCapacityDetails(
  error: DomainError,
  details: Record<string, string | number | boolean | null>,
): DomainError {
  return {
    ...error,
    details: {
      ...(error.details ?? {}),
      commandName: "servers.capacity.prune",
      ...details,
    },
  };
}

@injectable()
export class PruneServerCapacityUseCase {
  constructor(
    @inject(tokens.serverRepository)
    private readonly serverRepository: ServerRepository,
    @inject(tokens.runtimeTargetCapacityPruner)
    private readonly capacityPruner: RuntimeTargetCapacityPruner,
    @inject(tokens.auditEventRecorder)
    private readonly auditEventRecorder: AuditEventRecorder,
    @inject(tokens.idGenerator)
    private readonly idGenerator: IdGenerator,
    @inject(tokens.clock)
    private readonly clock: Clock,
  ) {}

  async execute(
    context: ExecutionContext,
    input: ParsedPruneServerCapacityCommandInput,
  ): Promise<Result<RuntimeTargetCapacityPruneResult>> {
    const serverIdResult = DeploymentTargetId.create(input.serverId);
    if (serverIdResult.isErr()) {
      return err(
        withPruneServerCapacityDetails(serverIdResult.error, {
          phase: "command-validation",
          serverId: input.serverId,
        }),
      );
    }

    const repositoryContext = toRepositoryContext(context);

    try {
      const server = await this.serverRepository.findOne(
        repositoryContext,
        DeploymentTargetByIdSpec.create(serverIdResult.value),
      );

      if (!server) {
        return err(
          withPruneServerCapacityDetails(domainError.notFound("server", input.serverId), {
            phase: "server-read",
            serverId: input.serverId,
          }),
        );
      }

      const pruneResult = await this.capacityPruner.prune(context, {
        server: server.toState(),
        before: input.before,
        categories: input.categories,
        ...(input.target ? { target: input.target } : {}),
        dryRun: input.dryRun,
        ...(input.includeOrphanRunning ? { includeOrphanRunning: true } : {}),
      });

      if (pruneResult.isErr()) {
        return pruneResult;
      }

      const auditResult = await this.recordDestructivePruneAudit(context, input, pruneResult.value);
      if (auditResult.isErr()) {
        return auditResult;
      }

      return ok(auditResult.value);
    } catch (error) {
      return err(
        domainError.infra("Server capacity prune could not be assembled", {
          commandName: "servers.capacity.prune",
          phase: "server-read",
          serverId: input.serverId,
          reason: error instanceof Error ? error.message : "unknown",
        }),
      );
    }
  }

  private async recordDestructivePruneAudit(
    context: ExecutionContext,
    input: ParsedPruneServerCapacityCommandInput,
    result: RuntimeTargetCapacityPruneResult,
  ): Promise<Result<RuntimeTargetCapacityPruneResult>> {
    if (input.dryRun || result.summary.prunedCount === 0) {
      return ok(result);
    }

    const createdAt = this.clock.now();
    let auditResult: Result<void>;
    try {
      auditResult = await this.auditEventRecorder.record(toRepositoryContext(context), {
        id: this.idGenerator.next("aud"),
        aggregateId: input.serverId,
        eventType: "server-capacity-pruned",
        payload: {
          operationKey: "servers.capacity.prune",
          serverId: input.serverId,
          before: input.before,
          categories: input.categories,
          inspectedCount: result.summary.inspectedCount,
          matchedCount: result.summary.matchedCount,
          prunedCount: result.summary.prunedCount,
          skippedCount: result.summary.skippedCount,
          excludedCount: result.summary.excludedCount,
          reclaimedBytes: result.summary.reclaimedBytes,
          prunedAt: result.prunedAt,
        },
        createdAt,
      });
    } catch {
      return ok(withAuditRecordWarning(result));
    }

    if (auditResult.isOk()) {
      return ok(result);
    }

    return ok(withAuditRecordWarning(result));
  }
}

function withAuditRecordWarning(
  result: RuntimeTargetCapacityPruneResult,
): RuntimeTargetCapacityPruneResult {
  return {
    ...result,
    warnings: [
      ...result.warnings,
      {
        code: "audit-record-failed",
        message: "Runtime prune succeeded, but audit output could not be recorded.",
        resource: "appaloft-runtime",
      },
    ],
  };
}
