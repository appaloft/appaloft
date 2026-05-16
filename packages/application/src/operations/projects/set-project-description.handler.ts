import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { SetProjectDescriptionCommand } from "./set-project-description.command";
import { type SetProjectDescriptionUseCase } from "./set-project-description.use-case";

@CommandHandler(SetProjectDescriptionCommand)
@injectable()
export class SetProjectDescriptionCommandHandler
  implements CommandHandlerContract<SetProjectDescriptionCommand, { id: string }>
{
  constructor(
    @inject(tokens.setProjectDescriptionUseCase)
    private readonly useCase: SetProjectDescriptionUseCase,
  ) {}

  handle(context: ExecutionContext, command: SetProjectDescriptionCommand) {
    return this.useCase.execute(context, command);
  }
}
