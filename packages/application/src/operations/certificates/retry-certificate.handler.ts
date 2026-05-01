import { type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import {
  RetryCertificateCommand,
  type RetryCertificateCommandResult,
} from "./retry-certificate.command";
import { type RetryCertificateUseCase } from "./retry-certificate.use-case";

@CommandHandler(RetryCertificateCommand)
@injectable()
export class RetryCertificateCommandHandler
  implements CommandHandlerContract<RetryCertificateCommand, RetryCertificateCommandResult>
{
  constructor(
    @inject(tokens.retryCertificateUseCase)
    private readonly useCase: RetryCertificateUseCase,
  ) {}

  handle(
    context: ExecutionContext,
    command: RetryCertificateCommand,
  ): Promise<Result<RetryCertificateCommandResult>> {
    return this.useCase.execute(context, command);
  }
}
