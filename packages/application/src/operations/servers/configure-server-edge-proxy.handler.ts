import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { ConfigureServerEdgeProxyCommand } from "./configure-server-edge-proxy.command";
import { type ConfigureServerEdgeProxyResult } from "./configure-server-edge-proxy.schema";
import { type ConfigureServerEdgeProxyUseCase } from "./configure-server-edge-proxy.use-case";

@CommandHandler(ConfigureServerEdgeProxyCommand)
@injectable()
export class ConfigureServerEdgeProxyCommandHandler
  implements CommandHandlerContract<ConfigureServerEdgeProxyCommand, ConfigureServerEdgeProxyResult>
{
  constructor(
    @inject(tokens.configureServerEdgeProxyUseCase)
    private readonly useCase: ConfigureServerEdgeProxyUseCase,
  ) {}

  handle(context: ExecutionContext, command: ConfigureServerEdgeProxyCommand) {
    return this.useCase.execute(context, {
      serverId: command.serverId,
      proxyKind: command.proxyKind,
      ...(command.idempotencyKey ? { idempotencyKey: command.idempotencyKey } : {}),
    });
  }
}
