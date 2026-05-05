import { type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { UnbindResourceDependencyCommand } from "./unbind-resource-dependency.command";
import { type UnbindResourceDependencyUseCase } from "./unbind-resource-dependency.use-case";

@CommandHandler(UnbindResourceDependencyCommand)
@injectable()
export class UnbindResourceDependencyCommandHandler
  implements CommandHandlerContract<UnbindResourceDependencyCommand, { id: string }>
{
  constructor(
    @inject(tokens.unbindResourceDependencyUseCase)
    private readonly useCase: UnbindResourceDependencyUseCase,
  ) {}

  handle(
    context: ExecutionContext,
    command: UnbindResourceDependencyCommand,
  ): Promise<Result<{ id: string }>> {
    return this.useCase.execute(context, {
      resourceId: command.resourceId,
      bindingId: command.bindingId,
    });
  }
}
