import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type EnvironmentProfileSyncResult } from "../../ports";
import { tokens } from "../../tokens";
import { SyncEnvironmentProfileCommand } from "./sync-environment-profile.command";
import { type SyncEnvironmentProfileUseCase } from "./sync-environment-profile.use-case";

@CommandHandler(SyncEnvironmentProfileCommand)
@injectable()
export class SyncEnvironmentProfileCommandHandler
  implements CommandHandlerContract<SyncEnvironmentProfileCommand, EnvironmentProfileSyncResult>
{
  constructor(
    @inject(tokens.syncEnvironmentProfileUseCase)
    private readonly useCase: SyncEnvironmentProfileUseCase,
  ) {}

  handle(context: ExecutionContext, command: SyncEnvironmentProfileCommand) {
    return this.useCase.execute(context, {
      environmentId: command.environmentId,
      targetEnvironmentId: command.targetEnvironmentId,
      resourceIds: command.resourceIds,
    });
  }
}
