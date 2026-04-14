import {
  DeploymentTargetByIdSpec,
  DeploymentTargetId,
  type DomainEvent,
  ErrorCodeText,
  MessageText,
  ok,
  type Result,
  safeTry,
  UpdatedAt,
  UpsertDeploymentTargetSpec,
} from "@yundu/core";
import { inject, injectable } from "tsyringe";

import { EventHandler, type EventHandlerContract } from "../../cqrs";
import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type AppLogger,
  type Clock,
  type ServerEdgeProxyBootstrapper,
  type ServerRepository,
} from "../../ports";
import { tokens } from "../../tokens";

@EventHandler("deployment_target.registered")
@injectable()
export class BootstrapServerEdgeProxyOnTargetRegisteredHandler
  implements EventHandlerContract<DomainEvent>
{
  constructor(
    @inject(tokens.serverRepository)
    private readonly serverRepository: ServerRepository,
    @inject(tokens.serverEdgeProxyBootstrapper)
    private readonly bootstrapper: ServerEdgeProxyBootstrapper,
    @inject(tokens.clock)
    private readonly clock: Clock,
    @inject(tokens.logger)
    private readonly logger: AppLogger,
  ) {}

  async handle(context: ExecutionContext, event: DomainEvent): Promise<Result<void>> {
    const { bootstrapper, clock, logger, serverRepository } = this;
    const repositoryContext = toRepositoryContext(context);

    return safeTry(async function* () {
      const serverId = yield* DeploymentTargetId.create(event.aggregateId);
      const server = await serverRepository.findOne(
        repositoryContext,
        DeploymentTargetByIdSpec.create(serverId),
      );

      if (!server) {
        logger.warn("server_edge_proxy_bootstrap.skipped_missing_server", {
          requestId: context.requestId,
          serverId: event.aggregateId,
        });
        return ok(undefined);
      }

      const state = server.toState();
      const edgeProxy = state.edgeProxy;
      if (!edgeProxy || edgeProxy.kind.value === "none") {
        return ok(undefined);
      }

      const attemptedAt = yield* UpdatedAt.create(clock.now());
      yield* server.beginEdgeProxyBootstrap({ attemptedAt });
      await serverRepository.upsert(
        repositoryContext,
        server,
        UpsertDeploymentTargetSpec.fromDeploymentTarget(server),
      );

      const result = await bootstrapper.bootstrap(context, {
        server: server.toState(),
      });
      const completedAt = yield* UpdatedAt.create(clock.now());

      if (result.isErr()) {
        yield* server.markEdgeProxyFailed({
          failedAt: completedAt,
          errorCode: ErrorCodeText.rehydrate(result.error.code),
          errorMessage: MessageText.rehydrate(result.error.message),
        });
      } else if (result.value.status === "ready") {
        yield* server.markEdgeProxyReady({ completedAt });
      } else {
        yield* server.markEdgeProxyFailed({
          failedAt: completedAt,
          errorCode: ErrorCodeText.rehydrate(
            result.value.errorCode ?? "edge_proxy_bootstrap_failed",
          ),
          errorMessage: MessageText.rehydrate(result.value.message),
        });
      }

      await serverRepository.upsert(
        repositoryContext,
        server,
        UpsertDeploymentTargetSpec.fromDeploymentTarget(server),
      );

      return ok(undefined);
    });
  }
}
