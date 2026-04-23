import { type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { UnsetResourceVariableCommand } from "./unset-resource-variable.command";
import { type UnsetResourceVariableUseCase } from "./unset-resource-variable.use-case";

@CommandHandler(UnsetResourceVariableCommand)
@injectable()
export class UnsetResourceVariableCommandHandler
  implements CommandHandlerContract<UnsetResourceVariableCommand, null>
{
  constructor(
    @inject(tokens.unsetResourceVariableUseCase)
    private readonly useCase: UnsetResourceVariableUseCase,
  ) {}

  async handle(
    context: ExecutionContext,
    command: UnsetResourceVariableCommand,
  ): Promise<Result<null>> {
    const result = await this.useCase.execute(context, {
      resourceId: command.resourceId,
      key: command.key,
      exposure: command.exposure,
    });

    return result.map(() => null);
  }
}
