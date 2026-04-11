import { type Result } from "@yundu/core";
import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { UnsetEnvironmentVariableCommand } from "./unset-environment-variable.command";
import { type UnsetEnvironmentVariableUseCase } from "./unset-environment-variable.use-case";

@CommandHandler(UnsetEnvironmentVariableCommand)
@injectable()
export class UnsetEnvironmentVariableCommandHandler
  implements CommandHandlerContract<UnsetEnvironmentVariableCommand, null>
{
  constructor(
    @inject(tokens.unsetEnvironmentVariableUseCase)
    private readonly useCase: UnsetEnvironmentVariableUseCase,
  ) {}

  async handle(
    context: ExecutionContext,
    command: UnsetEnvironmentVariableCommand,
  ): Promise<Result<null>> {
    const result = await this.useCase.execute(context, {
      environmentId: command.environmentId,
      key: command.key,
      exposure: command.exposure,
      ...(command.scope ? { scope: command.scope } : {}),
    });

    return result.map(() => null);
  }
}
