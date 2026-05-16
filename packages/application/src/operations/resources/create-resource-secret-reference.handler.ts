import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import {
  CreateResourceSecretReferenceCommand,
  type ResourceSecretReferenceMutationResult,
} from "./create-resource-secret-reference.command";
import { type CreateResourceSecretReferenceUseCase } from "./resource-secret-reference.use-cases";

@CommandHandler(CreateResourceSecretReferenceCommand)
@injectable()
export class CreateResourceSecretReferenceCommandHandler
  implements
    CommandHandlerContract<
      CreateResourceSecretReferenceCommand,
      ResourceSecretReferenceMutationResult
    >
{
  constructor(
    @inject(tokens.createResourceSecretReferenceUseCase)
    private readonly useCase: CreateResourceSecretReferenceUseCase,
  ) {}

  handle(context: ExecutionContext, command: CreateResourceSecretReferenceCommand) {
    return this.useCase.execute(context, command);
  }
}
