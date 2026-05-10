import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { ConfirmActionPreviewRouteCommand } from "./confirm-action-preview-route.command";
import { type ConfirmActionPreviewRouteResponse } from "./confirm-action-preview-route.schema";
import { type ConfirmActionPreviewRouteUseCase } from "./confirm-action-preview-route.use-case";

@CommandHandler(ConfirmActionPreviewRouteCommand)
@injectable()
export class ConfirmActionPreviewRouteCommandHandler
  implements
    CommandHandlerContract<ConfirmActionPreviewRouteCommand, ConfirmActionPreviewRouteResponse>
{
  constructor(
    @inject(tokens.confirmActionPreviewRouteUseCase)
    private readonly useCase: ConfirmActionPreviewRouteUseCase,
  ) {}

  handle(context: ExecutionContext, command: ConfirmActionPreviewRouteCommand) {
    return this.useCase.execute(context, {
      deploymentId: command.deploymentId,
      host: command.host,
      pathPrefix: command.pathPrefix,
      tlsMode: command.tlsMode,
    });
  }
}
