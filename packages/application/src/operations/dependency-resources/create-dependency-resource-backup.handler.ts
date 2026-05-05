import { type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { CreateDependencyResourceBackupCommand } from "./create-dependency-resource-backup.command";
import { type CreateDependencyResourceBackupUseCase } from "./create-dependency-resource-backup.use-case";

@CommandHandler(CreateDependencyResourceBackupCommand)
@injectable()
export class CreateDependencyResourceBackupCommandHandler
  implements CommandHandlerContract<CreateDependencyResourceBackupCommand, { id: string }>
{
  constructor(
    @inject(tokens.createDependencyResourceBackupUseCase)
    private readonly useCase: CreateDependencyResourceBackupUseCase,
  ) {}

  async handle(
    context: ExecutionContext,
    command: CreateDependencyResourceBackupCommand,
  ): Promise<Result<{ id: string }>> {
    return this.useCase.execute(context, {
      dependencyResourceId: command.dependencyResourceId,
      ...(command.description ? { description: command.description } : {}),
      ...(command.providerKey ? { providerKey: command.providerKey } : {}),
    });
  }
}
