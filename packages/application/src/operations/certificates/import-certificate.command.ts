import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { parseOperationInput, trimToUndefined } from "../shared-schema";
import {
  type ImportCertificateCommandInput,
  importCertificateCommandInputSchema,
} from "./import-certificate.schema";

export {
  type ImportCertificateCommandInput,
  importCertificateCommandInputSchema,
} from "./import-certificate.schema";

export interface ImportCertificateCommandResult {
  certificateId: string;
  attemptId: string;
}

export class ImportCertificateCommand extends Command<ImportCertificateCommandResult> {
  constructor(
    public readonly domainBindingId: string,
    public readonly certificateChain: string,
    public readonly privateKey: string,
    public readonly passphrase?: string,
    public readonly idempotencyKey?: string,
    public readonly causationId?: string,
  ) {
    super();
  }

  static create(input: ImportCertificateCommandInput): Result<ImportCertificateCommand> {
    return parseOperationInput(importCertificateCommandInputSchema, input).map(
      (parsed) =>
        new ImportCertificateCommand(
          parsed.domainBindingId,
          parsed.certificateChain,
          parsed.privateKey,
          trimToUndefined(parsed.passphrase),
          trimToUndefined(parsed.idempotencyKey),
          trimToUndefined(parsed.causationId),
        ),
    );
  }
}
