import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type ResourceRuntimeControlCommandResult } from "../../ports";
import { tokens } from "../../tokens";
import { type ResourceRuntimeControlUseCase } from "./resource-runtime-control.use-case";
import { StopResourceRuntimeCommand } from "./stop-resource-runtime.command";

@CommandHandler(StopResourceRuntimeCommand)
@injectable()
export class StopResourceRuntimeCommandHandler
  implements CommandHandlerContract<StopResourceRuntimeCommand, ResourceRuntimeControlCommandResult>
{
  constructor(
    @inject(tokens.resourceRuntimeControlUseCase)
    private readonly useCase: ResourceRuntimeControlUseCase,
  ) {}

  handle(context: ExecutionContext, command: StopResourceRuntimeCommand) {
    return this.useCase.execute(context, {
      operation: "stop",
      resourceId: command.resourceId,
      ...(command.deploymentId ? { deploymentId: command.deploymentId } : {}),
      ...(command.reason ? { reason: command.reason } : {}),
      ...(command.idempotencyKey ? { idempotencyKey: command.idempotencyKey } : {}),
    });
  }
}
