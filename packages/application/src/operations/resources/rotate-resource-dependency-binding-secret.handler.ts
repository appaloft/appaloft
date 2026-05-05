import { type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import {
  RotateResourceDependencyBindingSecretCommand,
  type RotateResourceDependencyBindingSecretCommandResult,
} from "./rotate-resource-dependency-binding-secret.command";
import { type RotateResourceDependencyBindingSecretUseCase } from "./rotate-resource-dependency-binding-secret.use-case";

@CommandHandler(RotateResourceDependencyBindingSecretCommand)
@injectable()
export class RotateResourceDependencyBindingSecretCommandHandler
  implements
    CommandHandlerContract<
      RotateResourceDependencyBindingSecretCommand,
      RotateResourceDependencyBindingSecretCommandResult
    >
{
  constructor(
    @inject(tokens.rotateResourceDependencyBindingSecretUseCase)
    private readonly useCase: RotateResourceDependencyBindingSecretUseCase,
  ) {}

  handle(
    context: ExecutionContext,
    command: RotateResourceDependencyBindingSecretCommand,
  ): Promise<Result<RotateResourceDependencyBindingSecretCommandResult>> {
    return this.useCase.execute(context, {
      resourceId: command.resourceId,
      bindingId: command.bindingId,
      ...(command.secretRef ? { secretRef: command.secretRef } : {}),
      ...(command.secretValue ? { secretValue: command.secretValue } : {}),
      confirmHistoricalSnapshotsRemainUnchanged: command.confirmHistoricalSnapshotsRemainUnchanged,
    });
  }
}
