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
  type DeploymentReadModel,
  type DeploymentSummary,
  type IdGenerator,
  type ResourceReadModel,
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
    @inject(tokens.deploymentReadModel)
    private readonly deploymentReadModel: DeploymentReadModel,
    @inject(tokens.resourceReadModel)
    private readonly resourceReadModel: ResourceReadModel,
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

      const runtimeProtection = input.categories.includes("stopped-containers")
        ? await this.loadRuntimeProtection(repositoryContext, input.serverId)
        : { activeDeploymentIds: [], rollbackCandidateDeploymentIds: [] };

      const pruneResult = await this.capacityPruner.prune(context, {
        server: server.toState(),
        before: input.before,
        categories: input.categories,
        ...(input.target ? { target: input.target } : {}),
        dryRun: input.dryRun,
        ...(input.includeOrphanRunning ? { includeOrphanRunning: true } : {}),
        runtimeProtection,
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

  private async loadRuntimeProtection(
    context: ReturnType<typeof toRepositoryContext>,
    serverId: string,
  ): Promise<{
    activeDeploymentIds: string[];
    rollbackCandidateDeploymentIds: string[];
  }> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const count = await this.deploymentReadModel.count(context, {
        serverId,
        includeArchived: true,
      });
      const deployments = await this.deploymentReadModel.list(context, {
        serverId,
        includeArchived: true,
        limit: count + 1,
      });
      const confirmedCount = await this.deploymentReadModel.count(context, {
        serverId,
        includeArchived: true,
      });
      if (deployments.length === count && confirmedCount === count) {
        const archivedResourceIds = await this.loadArchivedResourceIds(context, deployments);
        return runtimeProtectionFromDeployments(deployments, archivedResourceIds);
      }
    }

    throw new Error("Server deployment protection view changed while capacity prune was assembled");
  }

  private async loadArchivedResourceIds(
    context: ReturnType<typeof toRepositoryContext>,
    deployments: readonly DeploymentSummary[],
  ): Promise<ReadonlySet<string>> {
    const resourceIds = [...new Set(deployments.map((deployment) => deployment.resourceId))];
    if (resourceIds.length === 0) return new Set();

    const resources = await this.resourceReadModel.list(context, {
      resourceIds,
      includePreviewResources: true,
      lifecycleStatus: "archived",
      limit: resourceIds.length,
    });

    return new Set(resources.map((resource) => resource.id));
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

const activeDeploymentStatuses = new Set<DeploymentSummary["status"]>([
  "created",
  "planning",
  "planned",
  "running",
  "cancel-requested",
]);

export function runtimeProtectionFromDeployments(
  deployments: readonly DeploymentSummary[],
  archivedResourceIds: ReadonlySet<string> = new Set(),
): {
  activeDeploymentIds: string[];
  rollbackCandidateDeploymentIds: string[];
} {
  const activeDeploymentIds = new Set<string>();
  const rollbackCandidateDeploymentIds = new Set<string>();
  const resourcesWithRuntimeOwner = new Set<string>();

  const orderedDeployments = [...deployments].sort(
    (left, right) =>
      right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id),
  );

  for (const deployment of orderedDeployments) {
    if (activeDeploymentStatuses.has(deployment.status)) {
      activeDeploymentIds.add(deployment.id);
    }

    if (
      !resourcesWithRuntimeOwner.has(deployment.resourceId) &&
      !archivedResourceIds.has(deployment.resourceId) &&
      (deployment.status === "succeeded" || deployment.status === "rolled-back")
    ) {
      resourcesWithRuntimeOwner.add(deployment.resourceId);
      activeDeploymentIds.add(deployment.id);
    }

    if (deployment.rollbackCandidateDeploymentId) {
      rollbackCandidateDeploymentIds.add(deployment.rollbackCandidateDeploymentId);
    }
  }

  return {
    activeDeploymentIds: [...activeDeploymentIds],
    rollbackCandidateDeploymentIds: [...rollbackCandidateDeploymentIds],
  };
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
