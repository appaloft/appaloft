import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import {
  ImportCertificateCommand,
  type ImportCertificateCommandResult,
} from "./import-certificate.command";
import { type ImportCertificateUseCase } from "./import-certificate.use-case";

@CommandHandler(ImportCertificateCommand)
@injectable()
export class ImportCertificateCommandHandler
  implements CommandHandlerContract<ImportCertificateCommand, ImportCertificateCommandResult>
{
  constructor(
    @inject(tokens.importCertificateUseCase)
    private readonly useCase: ImportCertificateUseCase,
  ) {}

  handle(context: ExecutionContext, command: ImportCertificateCommand) {
    return this.useCase.execute(context, {
      domainBindingId: command.domainBindingId,
      certificateChain: command.certificateChain,
      privateKey: command.privateKey,
      ...(command.passphrase ? { passphrase: command.passphrase } : {}),
      ...(command.idempotencyKey ? { idempotencyKey: command.idempotencyKey } : {}),
      ...(command.causationId ? { causationId: command.causationId } : {}),
    });
  }
}
