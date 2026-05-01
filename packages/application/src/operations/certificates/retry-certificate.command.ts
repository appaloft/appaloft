import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { parseOperationInput, trimToUndefined } from "../shared-schema";
import {
  type RetryCertificateCommandInput,
  retryCertificateCommandInputSchema,
} from "./retry-certificate.schema";

export interface RetryCertificateCommandResult {
  certificateId: string;
  attemptId: string;
}

export {
  type RetryCertificateCommandInput,
  retryCertificateCommandInputSchema,
} from "./retry-certificate.schema";

export class RetryCertificateCommand extends Command<RetryCertificateCommandResult> {
  constructor(
    public readonly certificateId: string,
    public readonly idempotencyKey?: string,
    public readonly causationId?: string,
  ) {
    super();
  }

  static create(input: RetryCertificateCommandInput): Result<RetryCertificateCommand> {
    return parseOperationInput(retryCertificateCommandInputSchema, input).map(
      (parsed) =>
        new RetryCertificateCommand(
          parsed.certificateId,
          trimToUndefined(parsed.idempotencyKey),
          trimToUndefined(parsed.causationId),
        ),
    );
  }
}
