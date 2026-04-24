import { type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { SetResourceVariableCommand } from "./set-resource-variable.command";
import { type SetResourceVariableUseCase } from "./set-resource-variable.use-case";

@CommandHandler(SetResourceVariableCommand)
@injectable()
export class SetResourceVariableCommandHandler
  implements CommandHandlerContract<SetResourceVariableCommand, null>
{
  constructor(
    @inject(tokens.setResourceVariableUseCase)
    private readonly useCase: SetResourceVariableUseCase,
  ) {}

  async handle(
    context: ExecutionContext,
    command: SetResourceVariableCommand,
  ): Promise<Result<null>> {
    const result = await this.useCase.execute(context, {
      resourceId: command.resourceId,
      key: command.key,
      value: command.value,
      kind: command.kind,
      exposure: command.exposure,
      ...(typeof command.isSecret === "boolean" ? { isSecret: command.isSecret } : {}),
    });

    return result.map(() => null);
  }
}
