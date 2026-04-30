import { type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { ConfigureDomainBindingRouteCommand } from "./configure-domain-binding-route.command";
import { type ConfigureDomainBindingRouteUseCase } from "./configure-domain-binding-route.use-case";

@CommandHandler(ConfigureDomainBindingRouteCommand)
@injectable()
export class ConfigureDomainBindingRouteCommandHandler
  implements CommandHandlerContract<ConfigureDomainBindingRouteCommand, { id: string }>
{
  constructor(
    @inject(tokens.configureDomainBindingRouteUseCase)
    private readonly useCase: ConfigureDomainBindingRouteUseCase,
  ) {}

  handle(
    context: ExecutionContext,
    command: ConfigureDomainBindingRouteCommand,
  ): Promise<Result<{ id: string }>> {
    return this.useCase.execute(context, command);
  }
}
