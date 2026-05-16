import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { type ResourceSecretReferenceMutationResult } from "./create-resource-secret-reference.command";
import { type RotateResourceSecretReferenceUseCase } from "./resource-secret-reference.use-cases";
import { RotateResourceSecretReferenceCommand } from "./rotate-resource-secret-reference.command";

@CommandHandler(RotateResourceSecretReferenceCommand)
@injectable()
export class RotateResourceSecretReferenceCommandHandler
  implements
    CommandHandlerContract<
      RotateResourceSecretReferenceCommand,
      ResourceSecretReferenceMutationResult
    >
{
  constructor(
    @inject(tokens.rotateResourceSecretReferenceUseCase)
    private readonly useCase: RotateResourceSecretReferenceUseCase,
  ) {}

  handle(context: ExecutionContext, command: RotateResourceSecretReferenceCommand) {
    return this.useCase.execute(context, command);
  }
}
