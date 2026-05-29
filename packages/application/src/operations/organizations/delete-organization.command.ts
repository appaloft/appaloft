import { type Result } from "@appaloft/core";
import { z } from "zod";

import { Command } from "../../cqrs";
import { nonEmptyTrimmedString, parseOperationInput, trimToUndefined } from "../shared-schema";
import { organizationIdSchema } from "./organization-team.schema";

export const deleteOrganizationCommandInputSchema = z.object({
  organizationId: organizationIdSchema,
  confirmation: z.object({
    organizationId: nonEmptyTrimmedString("confirmation.organizationId"),
  }),
  idempotencyKey: nonEmptyTrimmedString("idempotencyKey").optional(),
});

export type DeleteOrganizationCommandInput = z.input<typeof deleteOrganizationCommandInputSchema>;

export class DeleteOrganizationCommand extends Command<{
  organizationId: string;
  deletedAt: string;
}> {
  constructor(
    public readonly organizationId: string,
    public readonly confirmation: { organizationId: string },
    public readonly idempotencyKey?: string,
  ) {
    super();
  }

  static create(input: DeleteOrganizationCommandInput): Result<DeleteOrganizationCommand> {
    return parseOperationInput(deleteOrganizationCommandInputSchema, input).map(
      (parsed) =>
        new DeleteOrganizationCommand(
          parsed.organizationId,
          parsed.confirmation,
          trimToUndefined(parsed.idempotencyKey),
        ),
    );
  }
}
