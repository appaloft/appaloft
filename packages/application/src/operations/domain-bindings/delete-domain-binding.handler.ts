import { type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { DeleteDomainBindingCommand } from "./delete-domain-binding.command";
import { type DeleteDomainBindingUseCase } from "./delete-domain-binding.use-case";

@CommandHandler(DeleteDomainBindingCommand)
@injectable()
export class DeleteDomainBindingCommandHandler
  implements CommandHandlerContract<DeleteDomainBindingCommand, { id: string }>
{
  constructor(
    @inject(tokens.deleteDomainBindingUseCase)
    private readonly useCase: DeleteDomainBindingUseCase,
  ) {}

  handle(
    context: ExecutionContext,
    command: DeleteDomainBindingCommand,
  ): Promise<Result<{ id: string }>> {
    return this.useCase.execute(context, command);
  }
}
