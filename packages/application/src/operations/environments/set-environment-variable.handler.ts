import { type Result } from "@yundu/core";
import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { SetEnvironmentVariableCommand } from "./set-environment-variable.command";
import { type SetEnvironmentVariableUseCase } from "./set-environment-variable.use-case";

@CommandHandler(SetEnvironmentVariableCommand)
@injectable()
export class SetEnvironmentVariableCommandHandler
  implements CommandHandlerContract<SetEnvironmentVariableCommand, null>
{
  constructor(
    @inject(tokens.setEnvironmentVariableUseCase)
    private readonly useCase: SetEnvironmentVariableUseCase,
  ) {}

  async handle(
    context: ExecutionContext,
    command: SetEnvironmentVariableCommand,
  ): Promise<Result<null>> {
    const result = await this.useCase.execute(context, {
      environmentId: command.environmentId,
      key: command.key,
      value: command.value,
      kind: command.kind,
      exposure: command.exposure,
      ...(command.scope ? { scope: command.scope } : {}),
      ...(typeof command.isSecret === "boolean" ? { isSecret: command.isSecret } : {}),
    });

    return result.map(() => null);
  }
}
