import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { DeleteResourceCommand } from "./delete-resource.command";
import { type DeleteResourceUseCase } from "./delete-resource.use-case";

@CommandHandler(DeleteResourceCommand)
@injectable()
export class DeleteResourceCommandHandler
  implements CommandHandlerContract<DeleteResourceCommand, { id: string }>
{
  constructor(
    @inject(tokens.deleteResourceUseCase)
    private readonly useCase: DeleteResourceUseCase,
  ) {}

  handle(context: ExecutionContext, command: DeleteResourceCommand) {
    return this.useCase.execute(context, {
      resourceId: command.resourceId,
      confirmation: command.confirmation,
      ...(command.idempotencyKey ? { idempotencyKey: command.idempotencyKey } : {}),
    });
  }
}
