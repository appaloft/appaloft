import { type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import {
  ConfigureDomainBindingCertificatePolicyCommand,
  type ConfigureDomainBindingCertificatePolicyResult,
} from "./configure-domain-binding-certificate-policy.command";
import { ConfigureDomainBindingCertificatePolicyUseCase } from "./configure-domain-binding-certificate-policy.use-case";

@CommandHandler(ConfigureDomainBindingCertificatePolicyCommand)
@injectable()
export class ConfigureDomainBindingCertificatePolicyCommandHandler
  implements
    CommandHandlerContract<
      ConfigureDomainBindingCertificatePolicyCommand,
      ConfigureDomainBindingCertificatePolicyResult
    >
{
  constructor(
    @inject(ConfigureDomainBindingCertificatePolicyUseCase)
    private readonly useCase: ConfigureDomainBindingCertificatePolicyUseCase,
  ) {}

  handle(
    context: ExecutionContext,
    command: ConfigureDomainBindingCertificatePolicyCommand,
  ): Promise<Result<ConfigureDomainBindingCertificatePolicyResult>> {
    return this.useCase.execute(context, command);
  }
}
