import { inject, injectable } from "tsyringe";
import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { RelinkSourceLinkCommand } from "./relink-source-link.command";
import {
  type RelinkSourceLinkResult,
  type RelinkSourceLinkUseCase,
} from "./relink-source-link.use-case";

@CommandHandler(RelinkSourceLinkCommand)
@injectable()
export class RelinkSourceLinkCommandHandler
  implements CommandHandlerContract<RelinkSourceLinkCommand, RelinkSourceLinkResult>
{
  constructor(
    @inject(tokens.relinkSourceLinkUseCase)
    private readonly useCase: RelinkSourceLinkUseCase,
  ) {}

  handle(context: ExecutionContext, command: RelinkSourceLinkCommand) {
    return this.useCase.execute(context, {
      sourceFingerprint: command.sourceFingerprint,
      projectId: command.projectId,
      environmentId: command.environmentId,
      resourceId: command.resourceId,
      ...(command.serverId ? { serverId: command.serverId } : {}),
      ...(command.destinationId ? { destinationId: command.destinationId } : {}),
      ...(command.expectedCurrentProjectId
        ? { expectedCurrentProjectId: command.expectedCurrentProjectId }
        : {}),
      ...(command.expectedCurrentEnvironmentId
        ? { expectedCurrentEnvironmentId: command.expectedCurrentEnvironmentId }
        : {}),
      ...(command.expectedCurrentResourceId
        ? { expectedCurrentResourceId: command.expectedCurrentResourceId }
        : {}),
      ...(command.reason ? { reason: command.reason } : {}),
    });
  }
}
