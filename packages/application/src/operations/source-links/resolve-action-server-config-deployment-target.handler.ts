import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { ResolveActionServerConfigDeploymentTargetCommand } from "./resolve-action-server-config-deployment-target.command";
import { type ResolveActionServerConfigDeploymentTargetResponse } from "./resolve-action-server-config-deployment-target.schema";
import { type ResolveActionServerConfigDeploymentTargetUseCase } from "./resolve-action-server-config-deployment-target.use-case";

@CommandHandler(ResolveActionServerConfigDeploymentTargetCommand)
@injectable()
export class ResolveActionServerConfigDeploymentTargetCommandHandler
  implements
    CommandHandlerContract<
      ResolveActionServerConfigDeploymentTargetCommand,
      ResolveActionServerConfigDeploymentTargetResponse
    >
{
  constructor(
    @inject(tokens.resolveActionServerConfigDeploymentTargetUseCase)
    private readonly useCase: ResolveActionServerConfigDeploymentTargetUseCase,
  ) {}

  handle(context: ExecutionContext, command: ResolveActionServerConfigDeploymentTargetCommand) {
    return this.useCase.execute(context, {
      sourceFingerprint: command.sourceFingerprint,
      ...(command.trustedContext ? { trustedContext: command.trustedContext } : {}),
    });
  }
}
