import { type Result } from "@appaloft/core";
import { z } from "zod";

import { Command } from "../../cqrs";
import { nonEmptyTrimmedString, parseOperationInput, trimToUndefined } from "../shared-schema";
import { accountSessionIdSchema } from "./account-settings.schema";

export const revokeAccountSessionCommandInputSchema = z.object({
  sessionId: accountSessionIdSchema,
  idempotencyKey: nonEmptyTrimmedString("idempotencyKey").optional(),
});

export type RevokeAccountSessionCommandInput = z.input<
  typeof revokeAccountSessionCommandInputSchema
>;

export class RevokeAccountSessionCommand extends Command<{ sessionId: string; revokedAt: string }> {
  constructor(
    public readonly sessionId: string,
    public readonly idempotencyKey?: string,
  ) {
    super();
  }

  static create(input: RevokeAccountSessionCommandInput): Result<RevokeAccountSessionCommand> {
    return parseOperationInput(revokeAccountSessionCommandInputSchema, input).map(
      (parsed) =>
        new RevokeAccountSessionCommand(parsed.sessionId, trimToUndefined(parsed.idempotencyKey)),
    );
  }
}
