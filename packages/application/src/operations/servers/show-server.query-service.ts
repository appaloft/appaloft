import {
  type DeploymentStatus,
  DeploymentTargetId,
  type DomainBindingStatus,
  type DomainError,
  domainError,
  err,
  ok,
  type Result,
  ServerByIdSpec,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type Clock,
  type DeploymentReadModel,
  type DeploymentSummary,
  type DomainBindingReadModel,
  type DomainBindingSummary,
  type ServerDetail,
  type ServerReadModel,
  type ServerRollups,
  type ServerStatusCount,
} from "../../ports";
import { tokens } from "../../tokens";
import { type ShowServerQuery } from "./show-server.query";

function withShowServerDetails(
  error: DomainError,
  details: Record<string, string | number | boolean | null>,
): DomainError {
  return {
    ...error,
    details: {
      ...(error.details ?? {}),
      queryName: "servers.show",
      ...details,
    },
  };
}

function serverReadNotFound(serverId: string): DomainError {
  return withShowServerDetails(domainError.notFound("server", serverId), {
    phase: "server-read",
    serverId,
  });
}

function serverReadInfraError(
  serverId: string,
  phase: "server-read" | "server-rollup-read",
  error: unknown,
): DomainError {
  return domainError.infra("Server detail could not be assembled", {
    queryName: "servers.show",
    phase,
    serverId,
    reason: error instanceof Error ? error.message : "unknown",
  });
}

function statusCounts<TStatus extends string>(
  values: TStatus[],
): Array<ServerStatusCount<TStatus>> {
  const counts = new Map<TStatus, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([status, count]) => ({ status, count }));
}

function latestByCreatedAt<TItem extends { createdAt: string }>(items: TItem[]): TItem | undefined {
  return [...items].sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
}

function buildRollups(
  serverId: string,
  deployments: DeploymentSummary[],
  domainBindings: DomainBindingSummary[],
): ServerRollups {
  const serverDeployments = deployments.filter((deployment) => deployment.serverId === serverId);
  const serverDomainBindings = domainBindings.filter(
    (domainBinding) => domainBinding.serverId === serverId,
  );
  const resourceIds = new Set<string>();

  for (const deployment of serverDeployments) {
    resourceIds.add(deployment.resourceId);
  }

  for (const domainBinding of serverDomainBindings) {
    resourceIds.add(domainBinding.resourceId);
  }

  const latestDeployment = latestByCreatedAt(serverDeployments);
  const latestDomainBinding = latestByCreatedAt(serverDomainBindings);

  return {
    resources: {
      total: resourceIds.size,
      deployedResourceIds: [...resourceIds].sort(),
    },
    deployments: {
      total: serverDeployments.length,
      statusCounts: statusCounts<DeploymentStatus>(
        serverDeployments.map((deployment) => deployment.status),
      ),
      ...(latestDeployment
        ? {
            latestDeploymentId: latestDeployment.id,
            latestDeploymentStatus: latestDeployment.status,
          }
        : {}),
    },
    domains: {
      total: serverDomainBindings.length,
      statusCounts: statusCounts<DomainBindingStatus>(
        serverDomainBindings.map((domainBinding) => domainBinding.status),
      ),
      ...(latestDomainBinding
        ? {
            latestDomainBindingId: latestDomainBinding.id,
            latestDomainBindingStatus: latestDomainBinding.status,
          }
        : {}),
    },
  };
}

@injectable()
export class ShowServerQueryService {
  constructor(
    @inject(tokens.serverReadModel)
    private readonly serverReadModel: ServerReadModel,
    @inject(tokens.deploymentReadModel)
    private readonly deploymentReadModel: DeploymentReadModel,
    @inject(tokens.domainBindingReadModel)
    private readonly domainBindingReadModel: DomainBindingReadModel,
    @inject(tokens.clock)
    private readonly clock: Clock,
  ) {}

  async execute(context: ExecutionContext, query: ShowServerQuery): Promise<Result<ServerDetail>> {
    const serverIdResult = DeploymentTargetId.create(query.serverId);
    if (serverIdResult.isErr()) {
      return err(
        withShowServerDetails(serverIdResult.error, {
          phase: "query-validation",
          serverId: query.serverId,
        }),
      );
    }

    const repositoryContext = toRepositoryContext(context);

    try {
      const server = await this.serverReadModel.findOne(
        repositoryContext,
        ServerByIdSpec.create(serverIdResult.value),
      );

      if (!server) {
        return err(serverReadNotFound(query.serverId));
      }

      if (!query.includeRollups) {
        return ok({
          schemaVersion: "servers.show/v1",
          server,
          generatedAt: this.clock.now(),
        });
      }

      try {
        const [deployments, domainBindings] = await Promise.all([
          this.deploymentReadModel.list(repositoryContext),
          this.domainBindingReadModel.list(repositoryContext),
        ]);

        return ok({
          schemaVersion: "servers.show/v1",
          server,
          rollups: buildRollups(query.serverId, deployments, domainBindings),
          generatedAt: this.clock.now(),
        });
      } catch (error) {
        return err(serverReadInfraError(query.serverId, "server-rollup-read", error));
      }
    } catch (error) {
      return err(serverReadInfraError(query.serverId, "server-read", error));
    }
  }
}
