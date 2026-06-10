import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { ReorderServersCommand } from "./reorder-servers.command";
import { type ReorderServersUseCase } from "./reorder-servers.use-case";

@CommandHandler(ReorderServersCommand)
@injectable()
export class ReorderServersCommandHandler
  implements CommandHandlerContract<ReorderServersCommand, { reorderedServerIds: string[] }>
{
  constructor(
    @inject(tokens.reorderServersUseCase)
    private readonly useCase: ReorderServersUseCase,
  ) {}

  handle(context: ExecutionContext, command: ReorderServersCommand) {
    return this.useCase.execute(context, command);
  }
}
