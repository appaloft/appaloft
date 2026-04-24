import {
  DeploymentTargetId,
  domainError,
  EdgeProxyKindValue,
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
  type ConfigureServerEdgeProxyCommandPayload,
  type ConfigureServerEdgeProxyResult,
} from "./configure-server-edge-proxy.schema";

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
export class ConfigureServerEdgeProxyUseCase {
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
    input: ConfigureServerEdgeProxyCommandPayload,
  ): Promise<Result<ConfigureServerEdgeProxyResult>> {
    const { clock, eventBus, logger, serverRepository } = this;
    const repositoryContext = toRepositoryContext(context);

    return safeTry(async function* () {
      const serverId = yield* DeploymentTargetId.create(input.serverId);
      const proxyKind = yield* EdgeProxyKindValue.create(input.proxyKind);
      const server = await serverRepository.findOne(
        repositoryContext,
        ServerByIdSpec.create(serverId),
      );

      if (!server) {
        return err(serverNotFound(input.serverId));
      }

      const state = server.toState();
      if (state.lifecycleStatus.isDeleted()) {
        return err(serverNotFound(input.serverId));
      }

      const configuredAt = yield* UpdatedAt.create(clock.now());
      const configureResult = yield* server.configureEdgeProxy({
        kind: proxyKind,
        configuredAt,
      });

      if (!configureResult.changed) {
        return ok({
          id: serverId.value,
          edgeProxy: {
            kind: configureResult.edgeProxy.kind.value,
            status: configureResult.edgeProxy.status.value,
          },
        });
      }

      await serverRepository.upsert(repositoryContext, server, UpsertServerSpec.fromServer(server));
      await publishDomainEventsAndReturn(context, eventBus, logger, server, undefined);

      return ok({
        id: serverId.value,
        edgeProxy: {
          kind: configureResult.edgeProxy.kind.value,
          status: configureResult.edgeProxy.status.value,
        },
      });
    });
  }
}
