import { type Result } from "@appaloft/core";
import { z } from "zod";

import { Command } from "../../cqrs";
import { type AccountProfileSummary } from "../../ports";
import { nonEmptyTrimmedString, parseOperationInput, trimToUndefined } from "../shared-schema";
import { optionalAvatarUrlSchema } from "./account-settings.schema";

export const changeAccountProfileCommandInputSchema = z
  .object({
    displayName: z.string().trim().max(120).optional(),
    avatarUrl: optionalAvatarUrlSchema,
    idempotencyKey: nonEmptyTrimmedString("idempotencyKey").optional(),
  })
  .refine((input) => input.displayName !== undefined || input.avatarUrl !== undefined, {
    message: "At least one account profile field is required",
  });

export type ChangeAccountProfileCommandInput = z.input<
  typeof changeAccountProfileCommandInputSchema
>;

export class ChangeAccountProfileCommand extends Command<AccountProfileSummary> {
  constructor(
    public readonly displayName?: string,
    public readonly avatarUrl?: string | null,
    public readonly idempotencyKey?: string,
  ) {
    super();
  }

  static create(input: ChangeAccountProfileCommandInput): Result<ChangeAccountProfileCommand> {
    return parseOperationInput(changeAccountProfileCommandInputSchema, input).map(
      (parsed) =>
        new ChangeAccountProfileCommand(
          trimToUndefined(parsed.displayName),
          parsed.avatarUrl ?? undefined,
          trimToUndefined(parsed.idempotencyKey),
        ),
    );
  }
}
