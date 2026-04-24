import {
  DeploymentTargetId,
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
  type ServerDeleteSafety,
  type ServerDeletionBlockerReader,
  type ServerReadModel,
} from "../../ports";
import { tokens } from "../../tokens";
import { type CheckServerDeleteSafetyQuery } from "./check-server-delete-safety.query";
import { buildServerDeleteBlockers } from "./server-delete-safety";

function withDeleteCheckDetails(error: DomainError, details: Record<string, string>): DomainError {
  return {
    ...error,
    details: {
      ...(error.details ?? {}),
      queryName: "servers.delete-check",
      ...details,
    },
  };
}

function serverReadNotFound(serverId: string): DomainError {
  return withDeleteCheckDetails(domainError.notFound("server", serverId), {
    phase: "server-read",
    serverId,
  });
}

function deleteCheckInfraError(serverId: string, error: unknown): DomainError {
  return domainError.infra("Server delete safety could not be assembled", {
    queryName: "servers.delete-check",
    phase: "server-delete-check-read",
    serverId,
    reason: error instanceof Error ? error.message : "unknown",
  });
}

@injectable()
export class CheckServerDeleteSafetyQueryService {
  constructor(
    @inject(tokens.serverReadModel)
    private readonly serverReadModel: ServerReadModel,
    @inject(tokens.serverDeletionBlockerReader)
    private readonly blockerReader: ServerDeletionBlockerReader,
    @inject(tokens.clock)
    private readonly clock: Clock,
  ) {}

  async execute(
    context: ExecutionContext,
    query: CheckServerDeleteSafetyQuery,
  ): Promise<Result<ServerDeleteSafety>> {
    const serverIdResult = DeploymentTargetId.create(query.serverId);
    if (serverIdResult.isErr()) {
      return err(
        withDeleteCheckDetails(serverIdResult.error, {
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

      const blockerResult = await this.blockerReader.findBlockers(repositoryContext, {
        serverId: serverIdResult.value.value,
      });
      if (blockerResult.isErr()) {
        return err(blockerResult.error);
      }

      const blockers = buildServerDeleteBlockers({
        serverId: server.id,
        lifecycleStatus: server.lifecycleStatus,
        retainedBlockers: blockerResult.value,
      });

      return ok({
        schemaVersion: "servers.delete-check/v1",
        serverId: server.id,
        lifecycleStatus: server.lifecycleStatus,
        eligible: server.lifecycleStatus === "inactive" && blockers.length === 0,
        blockers,
        checkedAt: this.clock.now(),
      });
    } catch (error) {
      return err(deleteCheckInfraError(query.serverId, error));
    }
  }
}
