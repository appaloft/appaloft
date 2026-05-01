import { type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import {
  DeleteCertificateCommand,
  type DeleteCertificateCommandResult,
} from "./delete-certificate.command";
import { type DeleteCertificateUseCase } from "./delete-certificate.use-case";

@CommandHandler(DeleteCertificateCommand)
@injectable()
export class DeleteCertificateCommandHandler
  implements CommandHandlerContract<DeleteCertificateCommand, DeleteCertificateCommandResult>
{
  constructor(
    @inject(tokens.deleteCertificateUseCase)
    private readonly useCase: DeleteCertificateUseCase,
  ) {}

  handle(
    context: ExecutionContext,
    command: DeleteCertificateCommand,
  ): Promise<Result<DeleteCertificateCommandResult>> {
    return this.useCase.execute(context, command);
  }
}
