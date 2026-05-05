import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import {
  ConfigureResourceAutoDeployCommand,
  type ConfigureResourceAutoDeployResult,
} from "./configure-resource-auto-deploy.command";
import { type ConfigureResourceAutoDeployUseCase } from "./configure-resource-auto-deploy.use-case";

@CommandHandler(ConfigureResourceAutoDeployCommand)
@injectable()
export class ConfigureResourceAutoDeployCommandHandler
  implements
    CommandHandlerContract<ConfigureResourceAutoDeployCommand, ConfigureResourceAutoDeployResult>
{
  constructor(
    @inject(tokens.configureResourceAutoDeployUseCase)
    private readonly useCase: ConfigureResourceAutoDeployUseCase,
  ) {}

  handle(context: ExecutionContext, command: ConfigureResourceAutoDeployCommand) {
    return this.useCase.execute(context, {
      resourceId: command.resourceId,
      mode: command.mode,
      ...(command.sourceBindingFingerprint
        ? { sourceBindingFingerprint: command.sourceBindingFingerprint }
        : {}),
      ...(command.policy ? { policy: command.policy } : {}),
      ...(command.idempotencyKey ? { idempotencyKey: command.idempotencyKey } : {}),
    });
  }
}
