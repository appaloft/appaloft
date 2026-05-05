import { type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { BindResourceDependencyCommand } from "./bind-resource-dependency.command";
import { type BindResourceDependencyUseCase } from "./bind-resource-dependency.use-case";

@CommandHandler(BindResourceDependencyCommand)
@injectable()
export class BindResourceDependencyCommandHandler
  implements CommandHandlerContract<BindResourceDependencyCommand, { id: string }>
{
  constructor(
    @inject(tokens.bindResourceDependencyUseCase)
    private readonly useCase: BindResourceDependencyUseCase,
  ) {}

  handle(
    context: ExecutionContext,
    command: BindResourceDependencyCommand,
  ): Promise<Result<{ id: string }>> {
    return this.useCase.execute(context, {
      resourceId: command.resourceId,
      dependencyResourceId: command.dependencyResourceId,
      targetName: command.targetName,
      scope: command.scope,
      injectionMode: command.injectionMode,
    });
  }
}
