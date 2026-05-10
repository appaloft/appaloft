import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { ApplyActionPreviewRouteCommand } from "./apply-action-preview-route.command";
import { type ApplyActionPreviewRouteResponse } from "./apply-action-preview-route.schema";
import { type ApplyActionPreviewRouteUseCase } from "./apply-action-preview-route.use-case";

@CommandHandler(ApplyActionPreviewRouteCommand)
@injectable()
export class ApplyActionPreviewRouteCommandHandler
  implements CommandHandlerContract<ApplyActionPreviewRouteCommand, ApplyActionPreviewRouteResponse>
{
  constructor(
    @inject(tokens.applyActionPreviewRouteUseCase)
    private readonly useCase: ApplyActionPreviewRouteUseCase,
  ) {}

  handle(context: ExecutionContext, command: ApplyActionPreviewRouteCommand) {
    return this.useCase.execute(context, {
      sourceFingerprint: command.sourceFingerprint,
      projectId: command.projectId,
      environmentId: command.environmentId,
      resourceId: command.resourceId,
      ...(command.serverId ? { serverId: command.serverId } : {}),
      ...(command.destinationId ? { destinationId: command.destinationId } : {}),
      host: command.host,
      pathPrefix: command.pathPrefix,
      tlsMode: command.tlsMode,
    });
  }
}
