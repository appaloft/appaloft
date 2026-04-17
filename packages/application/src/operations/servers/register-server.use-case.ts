import {
  CreatedAt,
  DeploymentTarget,
  DeploymentTargetId,
  DeploymentTargetName,
  EdgeProxyKindValue,
  HostAddress,
  ok,
  PortNumber,
  ProviderKey,
  type Result,
  safeTry,
  UpsertDeploymentTargetSpec,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";
import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type AppLogger,
  type Clock,
  type EventBus,
  type IdGenerator,
  type ServerRepository,
} from "../../ports";
import { tokens } from "../../tokens";
import { publishDomainEventsAndReturn } from "../publish-domain-events";
import { type RegisterServerCommandInput } from "./register-server.command";

@injectable()
export class RegisterServerUseCase {
  constructor(
    @inject(tokens.serverRepository)
    private readonly serverRepository: ServerRepository,
    @inject(tokens.clock)
    private readonly clock: Clock,
    @inject(tokens.idGenerator)
    private readonly idGenerator: IdGenerator,
    @inject(tokens.eventBus)
    private readonly eventBus: EventBus,
    @inject(tokens.logger)
    private readonly logger: AppLogger,
  ) {}

  async execute(
    context: ExecutionContext,
    input: RegisterServerCommandInput,
  ): Promise<Result<{ id: string }>> {
    const { clock, eventBus, idGenerator, logger, serverRepository } = this;
    const repositoryContext = toRepositoryContext(context);

    return safeTry(async function* () {
      const serverId = yield* DeploymentTargetId.create(idGenerator.next("srv"));
      const name = yield* DeploymentTargetName.create(input.name);
      const host = yield* HostAddress.create(input.host);
      const providerKey = yield* ProviderKey.create(input.providerKey);
      const createdAt = yield* CreatedAt.create(clock.now());
      const port = yield* PortNumber.create(input.port ?? 22);
      const edgeProxyKind = yield* EdgeProxyKindValue.create(input.proxyKind ?? "traefik");

      const server = yield* DeploymentTarget.register({
        id: serverId,
        name,
        host,
        providerKey,
        createdAt,
        port,
        edgeProxyKind,
      });

      await serverRepository.upsert(
        repositoryContext,
        server,
        UpsertDeploymentTargetSpec.fromDeploymentTarget(server),
      );
      await publishDomainEventsAndReturn(context, eventBus, logger, server, undefined);

      return ok({ id: server.toState().id.value });
    });
  }
}
