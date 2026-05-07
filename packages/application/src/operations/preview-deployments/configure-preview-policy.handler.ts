import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type ConfigurePreviewPolicyResult } from "../../ports";
import { tokens } from "../../tokens";
import { ConfigurePreviewPolicyCommand } from "./configure-preview-policy.command";
import { type ConfigurePreviewPolicyUseCase } from "./configure-preview-policy.use-case";

@CommandHandler(ConfigurePreviewPolicyCommand)
@injectable()
export class ConfigurePreviewPolicyCommandHandler
  implements CommandHandlerContract<ConfigurePreviewPolicyCommand, ConfigurePreviewPolicyResult>
{
  constructor(
    @inject(tokens.configurePreviewPolicyUseCase)
    private readonly useCase: ConfigurePreviewPolicyUseCase,
  ) {}

  handle(context: ExecutionContext, command: ConfigurePreviewPolicyCommand) {
    return this.useCase.execute(context, {
      scope: command.scope,
      policy: command.policy,
      idempotencyKey: command.idempotencyKey,
    });
  }
}
