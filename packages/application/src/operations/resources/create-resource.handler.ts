import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { CreateResourceCommand } from "./create-resource.command";
import { type CreateResourceUseCase } from "./create-resource.use-case";

@CommandHandler(CreateResourceCommand)
@injectable()
export class CreateResourceCommandHandler
  implements CommandHandlerContract<CreateResourceCommand, { id: string }>
{
  constructor(
    @inject(tokens.createResourceUseCase)
    private readonly useCase: CreateResourceUseCase,
  ) {}

  handle(context: ExecutionContext, command: CreateResourceCommand) {
    return this.useCase.execute(context, {
      projectId: command.projectId,
      environmentId: command.environmentId,
      name: command.name,
      kind: command.kind,
      ...(command.destinationId ? { destinationId: command.destinationId } : {}),
      ...(command.description ? { description: command.description } : {}),
      ...(command.services.length > 0 ? { services: command.services } : {}),
      ...(command.source ? { source: command.source } : {}),
      ...(command.runtimeProfile ? { runtimeProfile: command.runtimeProfile } : {}),
      ...(command.networkProfile ? { networkProfile: command.networkProfile } : {}),
    });
  }
}
