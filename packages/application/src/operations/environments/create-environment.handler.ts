import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { CreateEnvironmentCommand } from "./create-environment.command";
import { type CreateEnvironmentUseCase } from "./create-environment.use-case";

@CommandHandler(CreateEnvironmentCommand)
@injectable()
export class CreateEnvironmentCommandHandler
  implements CommandHandlerContract<CreateEnvironmentCommand, { id: string }>
{
  constructor(
    @inject(tokens.createEnvironmentUseCase)
    private readonly useCase: CreateEnvironmentUseCase,
  ) {}

  handle(context: ExecutionContext, command: CreateEnvironmentCommand) {
    return this.useCase.execute(context, {
      projectId: command.projectId,
      name: command.name,
      kind: command.kind,
      ...(command.parentEnvironmentId ? { parentEnvironmentId: command.parentEnvironmentId } : {}),
    });
  }
}
