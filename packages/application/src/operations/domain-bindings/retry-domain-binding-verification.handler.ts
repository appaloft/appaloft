import { type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import {
  RetryDomainBindingVerificationCommand,
  type RetryDomainBindingVerificationCommandResult,
} from "./retry-domain-binding-verification.command";
import { type RetryDomainBindingVerificationUseCase } from "./retry-domain-binding-verification.use-case";

@CommandHandler(RetryDomainBindingVerificationCommand)
@injectable()
export class RetryDomainBindingVerificationCommandHandler
  implements
    CommandHandlerContract<
      RetryDomainBindingVerificationCommand,
      RetryDomainBindingVerificationCommandResult
    >
{
  constructor(
    @inject(tokens.retryDomainBindingVerificationUseCase)
    private readonly useCase: RetryDomainBindingVerificationUseCase,
  ) {}

  handle(
    context: ExecutionContext,
    command: RetryDomainBindingVerificationCommand,
  ): Promise<Result<RetryDomainBindingVerificationCommandResult>> {
    return this.useCase.execute(context, command);
  }
}
