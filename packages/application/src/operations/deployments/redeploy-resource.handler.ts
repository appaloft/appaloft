import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { RedeployResourceCommand } from "./redeploy-resource.command";
import { type RedeployResourceUseCase } from "./redeploy-resource.use-case";

@CommandHandler(RedeployResourceCommand)
@injectable()
export class RedeployResourceCommandHandler
  implements CommandHandlerContract<RedeployResourceCommand, { id: string }>
{
  constructor(
    @inject(tokens.redeployResourceUseCase)
    private readonly useCase: RedeployResourceUseCase,
  ) {}

  handle(context: ExecutionContext, command: RedeployResourceCommand) {
    return this.useCase.execute(context, {
      resourceId: command.resourceId,
      force: command.force,
    });
  }
}
