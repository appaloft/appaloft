import { type Result } from "@appaloft/core";
import { z } from "zod";

import { Command } from "../../cqrs";
import { nonEmptyTrimmedString, parseOperationInput, trimToUndefined } from "../shared-schema";

export const deleteAccountCommandInputSchema = z.object({
  confirmation: z.object({
    userId: nonEmptyTrimmedString("confirmation.userId"),
  }),
  idempotencyKey: nonEmptyTrimmedString("idempotencyKey").optional(),
});

export type DeleteAccountCommandInput = z.input<typeof deleteAccountCommandInputSchema>;

export class DeleteAccountCommand extends Command<{ userId: string; deletedAt: string }> {
  constructor(
    public readonly confirmation: { userId: string },
    public readonly idempotencyKey?: string,
  ) {
    super();
  }

  static create(input: DeleteAccountCommandInput): Result<DeleteAccountCommand> {
    return parseOperationInput(deleteAccountCommandInputSchema, input).map(
      (parsed) =>
        new DeleteAccountCommand(parsed.confirmation, trimToUndefined(parsed.idempotencyKey)),
    );
  }
}
