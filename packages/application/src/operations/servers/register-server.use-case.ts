import {
  CreatedAt,
  DeploymentTarget,
  DeploymentTargetId,
  DeploymentTargetName,
  EdgeProxyKindValue,
  err,
  HostAddress,
  ok,
  PortNumber,
  ProviderKey,
  type Result,
  safeTry,
  TargetKindValue,
  UpsertDeploymentTargetSpec,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";
import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import { findOperationCatalogEntryByKey } from "../../operation-catalog";
import { checkOperationGuards } from "../../operation-guard";
import {
  AllowAllOperationGuardPort,
  type AppLogger,
  type Clock,
  type EventBus,
  type IdGenerator,
  type OperationGuardPort,
  type ServerRepository,
} from "../../ports";
import { tokens } from "../../tokens";
import { publishDomainEventsAndReturn } from "../publish-domain-events";
import { type RegisterServerCommandInput } from "./register-server.command";

const registerServerOperation = findOperationCatalogEntryByKey("servers.register");
const defaultOperationGuardPort = new AllowAllOperationGuardPort();

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
    @inject(tokens.operationGuardPort)
    private readonly operationGuardPort?: OperationGuardPort,
  ) {}

  async execute(
    context: ExecutionContext,
    input: RegisterServerCommandInput,
  ): Promise<Result<{ id: string }>> {
    const { clock, eventBus, idGenerator, logger, operationGuardPort, serverRepository } = this;
    const repositoryContext = toRepositoryContext(context);

    return safeTry(async function* () {
      if (registerServerOperation) {
        const checked = await checkOperationGuards({
          context,
          entry: registerServerOperation,
          message: input,
          operationGuardPort: operationGuardPort ?? defaultOperationGuardPort,
          contextAttributes: {
            host: input.host,
            providerKey: input.providerKey,
            targetKind: input.targetKind ?? "single-server",
          },
        });
        if (checked.isErr()) {
          return err(checked.error);
        }
      }

      const serverId = yield* DeploymentTargetId.create(idGenerator.next("srv"));
      const name = yield* DeploymentTargetName.create(input.name);
      const host = yield* HostAddress.create(input.host);
      const providerKey = yield* ProviderKey.create(input.providerKey);
      const targetKind = yield* TargetKindValue.create(input.targetKind ?? "single-server");
      const createdAt = yield* CreatedAt.create(clock.now());
      const port = yield* PortNumber.create(input.port ?? 22);
      const edgeProxyKind = yield* EdgeProxyKindValue.create(input.proxyKind ?? "traefik");

      const server = yield* DeploymentTarget.register({
        id: serverId,
        name,
        host,
        providerKey,
        targetKind,
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
