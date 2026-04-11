import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { CreateProjectCommand } from "./create-project.command";
import { type CreateProjectUseCase } from "./create-project.use-case";

@CommandHandler(CreateProjectCommand)
@injectable()
export class CreateProjectCommandHandler
  implements CommandHandlerContract<CreateProjectCommand, { id: string }>
{
  constructor(
    @inject(tokens.createProjectUseCase)
    private readonly useCase: CreateProjectUseCase,
  ) {}

  handle(context: ExecutionContext, command: CreateProjectCommand) {
    return this.useCase.execute(context, {
      name: command.name,
      ...(command.description ? { description: command.description } : {}),
    });
  }
}
