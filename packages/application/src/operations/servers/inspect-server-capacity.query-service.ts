import {
  DeploymentTargetByIdSpec,
  DeploymentTargetId,
  type DomainError,
  domainError,
  err,
  type Result,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type RuntimeTargetCapacityInspection,
  type RuntimeTargetCapacityInspector,
  type ServerRepository,
} from "../../ports";
import { tokens } from "../../tokens";
import { type InspectServerCapacityQuery } from "./inspect-server-capacity.query";

function withInspectServerCapacityDetails(
  error: DomainError,
  details: Record<string, string | number | boolean | null>,
): DomainError {
  return {
    ...error,
    details: {
      ...(error.details ?? {}),
      queryName: "servers.capacity.inspect",
      ...details,
    },
  };
}

@injectable()
export class InspectServerCapacityQueryService {
  constructor(
    @inject(tokens.serverRepository)
    private readonly serverRepository: ServerRepository,
    @inject(tokens.runtimeTargetCapacityInspector)
    private readonly capacityInspector: RuntimeTargetCapacityInspector,
  ) {}

  async execute(
    context: ExecutionContext,
    query: InspectServerCapacityQuery,
  ): Promise<Result<RuntimeTargetCapacityInspection>> {
    const serverIdResult = DeploymentTargetId.create(query.serverId);
    if (serverIdResult.isErr()) {
      return err(
        withInspectServerCapacityDetails(serverIdResult.error, {
          phase: "query-validation",
          serverId: query.serverId,
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
          withInspectServerCapacityDetails(domainError.notFound("server", query.serverId), {
            phase: "server-read",
            serverId: query.serverId,
          }),
        );
      }

      return await this.capacityInspector.inspect(context, {
        server: server.toState(),
      });
    } catch (error) {
      return err(
        domainError.infra("Server capacity inspection could not be assembled", {
          queryName: "servers.capacity.inspect",
          phase: "server-read",
          serverId: query.serverId,
          reason: error instanceof Error ? error.message : "unknown",
        }),
      );
    }
  }
}
