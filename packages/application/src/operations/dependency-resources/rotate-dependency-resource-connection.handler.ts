import { type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { RotateDependencyResourceConnectionCommand } from "./rotate-dependency-resource-connection.command";
import { type RotateDependencyResourceConnectionUseCase } from "./rotate-dependency-resource-connection.use-case";

@CommandHandler(RotateDependencyResourceConnectionCommand)
@injectable()
export class RotateDependencyResourceConnectionCommandHandler
  implements CommandHandlerContract<RotateDependencyResourceConnectionCommand, { id: string }>
{
  constructor(
    @inject(tokens.rotateDependencyResourceConnectionUseCase)
    private readonly useCase: RotateDependencyResourceConnectionUseCase,
  ) {}

  async handle(
    context: ExecutionContext,
    command: RotateDependencyResourceConnectionCommand,
  ): Promise<Result<{ id: string }>> {
    return this.useCase.execute(context, {
      dependencyResourceId: command.dependencyResourceId,
      connectionUrl: command.connectionUrl,
    });
  }
}
