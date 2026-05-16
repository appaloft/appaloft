import { inject, injectable } from "tsyringe";
import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { DeleteSourceLinkCommand, type DeleteSourceLinkResult } from "./delete-source-link.command";
import { type DeleteSourceLinkUseCase } from "./delete-source-link.use-case";

@injectable()
@CommandHandler(DeleteSourceLinkCommand)
export class DeleteSourceLinkCommandHandler
  implements CommandHandlerContract<DeleteSourceLinkCommand, DeleteSourceLinkResult>
{
  constructor(
    @inject(tokens.deleteSourceLinkUseCase)
    private readonly useCase: DeleteSourceLinkUseCase,
  ) {}

  handle(context: ExecutionContext, command: DeleteSourceLinkCommand) {
    return this.useCase.execute(context, command);
  }
}
