import { type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import {
  RevokeCertificateCommand,
  type RevokeCertificateCommandResult,
} from "./revoke-certificate.command";
import { type RevokeCertificateUseCase } from "./revoke-certificate.use-case";

@CommandHandler(RevokeCertificateCommand)
@injectable()
export class RevokeCertificateCommandHandler
  implements CommandHandlerContract<RevokeCertificateCommand, RevokeCertificateCommandResult>
{
  constructor(
    @inject(tokens.revokeCertificateUseCase)
    private readonly useCase: RevokeCertificateUseCase,
  ) {}

  handle(
    context: ExecutionContext,
    command: RevokeCertificateCommand,
  ): Promise<Result<RevokeCertificateCommandResult>> {
    return this.useCase.execute(context, command);
  }
}
