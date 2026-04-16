import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import {
  BootstrapServerProxyCommand,
  type BootstrapServerProxyResult,
} from "./bootstrap-server-proxy.command";
import { type BootstrapServerProxyUseCase } from "./bootstrap-server-proxy.use-case";

@CommandHandler(BootstrapServerProxyCommand)
@injectable()
export class BootstrapServerProxyCommandHandler
  implements CommandHandlerContract<BootstrapServerProxyCommand, BootstrapServerProxyResult>
{
  constructor(
    @inject(tokens.bootstrapServerProxyUseCase)
    private readonly useCase: BootstrapServerProxyUseCase,
  ) {}

  handle(context: ExecutionContext, command: BootstrapServerProxyCommand) {
    return this.useCase.execute(context, command.input);
  }
}
