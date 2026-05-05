import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type ResourceRuntimeControlCommandResult } from "../../ports";
import { tokens } from "../../tokens";
import { type ResourceRuntimeControlUseCase } from "./resource-runtime-control.use-case";
import { RestartResourceRuntimeCommand } from "./restart-resource-runtime.command";

@CommandHandler(RestartResourceRuntimeCommand)
@injectable()
export class RestartResourceRuntimeCommandHandler
  implements
    CommandHandlerContract<RestartResourceRuntimeCommand, ResourceRuntimeControlCommandResult>
{
  constructor(
    @inject(tokens.resourceRuntimeControlUseCase)
    private readonly useCase: ResourceRuntimeControlUseCase,
  ) {}

  handle(context: ExecutionContext, command: RestartResourceRuntimeCommand) {
    return this.useCase.execute(context, {
      operation: "restart",
      resourceId: command.resourceId,
      ...(command.deploymentId ? { deploymentId: command.deploymentId } : {}),
      ...(command.acknowledgeRetainedRuntimeMetadata === undefined
        ? {}
        : { acknowledgeRetainedRuntimeMetadata: command.acknowledgeRetainedRuntimeMetadata }),
      ...(command.reason ? { reason: command.reason } : {}),
      ...(command.idempotencyKey ? { idempotencyKey: command.idempotencyKey } : {}),
    });
  }
}
