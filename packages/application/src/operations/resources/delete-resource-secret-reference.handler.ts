import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { type ResourceSecretReferenceMutationResult } from "./create-resource-secret-reference.command";
import { DeleteResourceSecretReferenceCommand } from "./delete-resource-secret-reference.command";
import { type DeleteResourceSecretReferenceUseCase } from "./resource-secret-reference.use-cases";

@CommandHandler(DeleteResourceSecretReferenceCommand)
@injectable()
export class DeleteResourceSecretReferenceCommandHandler
  implements
    CommandHandlerContract<
      DeleteResourceSecretReferenceCommand,
      ResourceSecretReferenceMutationResult
    >
{
  constructor(
    @inject(tokens.deleteResourceSecretReferenceUseCase)
    private readonly useCase: DeleteResourceSecretReferenceUseCase,
  ) {}

  handle(context: ExecutionContext, command: DeleteResourceSecretReferenceCommand) {
    return this.useCase.execute(context, command);
  }
}
