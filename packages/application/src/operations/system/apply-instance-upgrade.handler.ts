import { type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type InstanceUpgradeApplyResult } from "../../ports";
import { tokens } from "../../tokens";
import { ApplyInstanceUpgradeCommand } from "./apply-instance-upgrade.command";
import { type ApplyInstanceUpgradeUseCase } from "./apply-instance-upgrade.use-case";

@CommandHandler(ApplyInstanceUpgradeCommand)
@injectable()
export class ApplyInstanceUpgradeCommandHandler
  implements CommandHandlerContract<ApplyInstanceUpgradeCommand, InstanceUpgradeApplyResult>
{
  constructor(
    @inject(tokens.applyInstanceUpgradeUseCase)
    private readonly useCase: ApplyInstanceUpgradeUseCase,
  ) {}

  handle(
    context: ExecutionContext,
    command: ApplyInstanceUpgradeCommand,
  ): Promise<Result<InstanceUpgradeApplyResult>> {
    return this.useCase.execute(context, command);
  }
}
