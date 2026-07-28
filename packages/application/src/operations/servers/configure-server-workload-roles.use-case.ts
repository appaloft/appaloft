import {
  DeploymentTargetId,
  DeploymentTargetWorkloadRoles,
  domainError,
  err,
  ok,
  type Result,
  ServerByIdSpec,
  safeTry,
  UpdatedAt,
  UpsertServerSpec,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import { type AppLogger, type Clock, type EventBus, type ServerRepository } from "../../ports";
import { tokens } from "../../tokens";
import { publishDomainEventsAndReturn } from "../publish-domain-events";
import {
  type ConfigureServerWorkloadRolesCommandPayload,
  type ConfigureServerWorkloadRolesResult,
} from "./configure-server-workload-roles.schema";

function serverNotFound(serverId: string) {
  const error = domainError.notFound("server", serverId);
  return {
    ...error,
    details: {
      ...(error.details ?? {}),
      phase: "server-admission",
      serverId,
    },
  };
}

@injectable()
export class ConfigureServerWorkloadRolesUseCase {
  constructor(
    @inject(tokens.serverRepository)
    private readonly serverRepository: ServerRepository,
    @inject(tokens.clock)
    private readonly clock: Clock,
    @inject(tokens.eventBus)
    private readonly eventBus: EventBus,
    @inject(tokens.logger)
    private readonly logger: AppLogger,
  ) {}

  async execute(
    context: ExecutionContext,
    input: ConfigureServerWorkloadRolesCommandPayload,
  ): Promise<Result<ConfigureServerWorkloadRolesResult>> {
    const { clock, eventBus, logger, serverRepository } = this;
    const repositoryContext = toRepositoryContext(context);

    return safeTry(async function* () {
      const serverId = yield* DeploymentTargetId.create(input.serverId);
      const workloadRoles = yield* DeploymentTargetWorkloadRoles.create(input.workloadRoles);
      const server = await serverRepository.findOne(
        repositoryContext,
        ServerByIdSpec.create(serverId),
      );

      if (!server || server.toState().lifecycleStatus.isDeleted()) {
        return err(serverNotFound(input.serverId));
      }

      const configuredAt = yield* UpdatedAt.create(clock.now());
      const configured = yield* server.configureWorkloadRoles({ workloadRoles, configuredAt });

      if (configured.changed) {
        await serverRepository.upsert(
          repositoryContext,
          server,
          UpsertServerSpec.fromServer(server),
        );
        await publishDomainEventsAndReturn(context, eventBus, logger, server, undefined);
      }

      return ok({
        workloadRoles: server.toState().workloadRoles.toJSON(),
        changed: configured.changed,
      });
    });
  }
}
