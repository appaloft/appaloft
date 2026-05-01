import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { parseOperationInput, trimToUndefined } from "../shared-schema";
import {
  type DeleteCertificateCommandInput,
  type DeleteCertificateCommandPayload,
  deleteCertificateCommandInputSchema,
} from "./delete-certificate.schema";

export interface DeleteCertificateCommandResult {
  certificateId: string;
}

export {
  type DeleteCertificateCommandInput,
  deleteCertificateCommandInputSchema,
} from "./delete-certificate.schema";

export class DeleteCertificateCommand extends Command<DeleteCertificateCommandResult> {
  constructor(
    public readonly certificateId: string,
    public readonly confirmation: DeleteCertificateCommandPayload["confirmation"],
    public readonly causationId?: string,
  ) {
    super();
  }

  static create(input: DeleteCertificateCommandInput): Result<DeleteCertificateCommand> {
    return parseOperationInput(deleteCertificateCommandInputSchema, input).map(
      (parsed) =>
        new DeleteCertificateCommand(
          parsed.certificateId,
          parsed.confirmation,
          trimToUndefined(parsed.causationId),
        ),
    );
  }
}
