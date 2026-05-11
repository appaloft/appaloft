import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import {
  BootstrapFirstAdminCommand,
  toBootstrapFirstAdminUseCaseInput,
} from "./bootstrap-first-admin.command";
import {
  type BootstrapFirstAdminUseCase,
  type BootstrapFirstAdminUseCaseResult,
} from "./bootstrap-first-admin.use-case";

@CommandHandler(BootstrapFirstAdminCommand)
@injectable()
export class BootstrapFirstAdminCommandHandler
  implements CommandHandlerContract<BootstrapFirstAdminCommand, BootstrapFirstAdminUseCaseResult>
{
  constructor(
    @inject(tokens.bootstrapFirstAdminUseCase)
    private readonly useCase: BootstrapFirstAdminUseCase,
  ) {}

  handle(context: ExecutionContext, command: BootstrapFirstAdminCommand) {
    return this.useCase.execute(context, toBootstrapFirstAdminUseCaseInput(command));
  }
}
