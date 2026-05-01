import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { parseOperationInput, trimToUndefined } from "../shared-schema";
import {
  type RevokeCertificateCommandInput,
  revokeCertificateCommandInputSchema,
} from "./revoke-certificate.schema";

export interface RevokeCertificateCommandResult {
  certificateId: string;
}

export {
  type RevokeCertificateCommandInput,
  revokeCertificateCommandInputSchema,
} from "./revoke-certificate.schema";

export class RevokeCertificateCommand extends Command<RevokeCertificateCommandResult> {
  constructor(
    public readonly certificateId: string,
    public readonly reason?: string,
    public readonly idempotencyKey?: string,
    public readonly causationId?: string,
  ) {
    super();
  }

  static create(input: RevokeCertificateCommandInput): Result<RevokeCertificateCommand> {
    return parseOperationInput(revokeCertificateCommandInputSchema, input).map(
      (parsed) =>
        new RevokeCertificateCommand(
          parsed.certificateId,
          trimToUndefined(parsed.reason),
          trimToUndefined(parsed.idempotencyKey),
          trimToUndefined(parsed.causationId),
        ),
    );
  }
}
