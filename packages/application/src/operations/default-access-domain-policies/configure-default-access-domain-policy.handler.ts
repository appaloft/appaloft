import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { ConfigureDefaultAccessDomainPolicyCommand } from "./configure-default-access-domain-policy.command";
import { type ConfigureDefaultAccessDomainPolicyUseCase } from "./configure-default-access-domain-policy.use-case";

@CommandHandler(ConfigureDefaultAccessDomainPolicyCommand)
@injectable()
export class ConfigureDefaultAccessDomainPolicyCommandHandler
  implements CommandHandlerContract<ConfigureDefaultAccessDomainPolicyCommand, { id: string }>
{
  constructor(
    @inject(tokens.configureDefaultAccessDomainPolicyUseCase)
    private readonly useCase: ConfigureDefaultAccessDomainPolicyUseCase,
  ) {}

  handle(context: ExecutionContext, command: ConfigureDefaultAccessDomainPolicyCommand) {
    return this.useCase.execute(context, {
      scope: command.scope,
      mode: command.mode,
      providerKey: command.providerKey,
      templateRef: command.templateRef,
      idempotencyKey: command.idempotencyKey,
    });
  }
}
