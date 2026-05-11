import { type Result } from "@appaloft/core";
import { z } from "zod";

import { Command } from "../../cqrs";
import { type CurrentOrganizationContext } from "../../ports";
import { nonEmptyTrimmedString, parseOperationInput, trimToUndefined } from "../shared-schema";
import { organizationIdSchema } from "./organization-team.schema";

export const switchCurrentOrganizationCommandInputSchema = z.object({
  organizationId: organizationIdSchema,
  idempotencyKey: nonEmptyTrimmedString("idempotencyKey").optional(),
});

export type SwitchCurrentOrganizationCommandInput = z.input<
  typeof switchCurrentOrganizationCommandInputSchema
>;

export class SwitchCurrentOrganizationCommand extends Command<CurrentOrganizationContext> {
  constructor(
    public readonly organizationId: string,
    public readonly idempotencyKey?: string,
  ) {
    super();
  }

  static create(
    input: SwitchCurrentOrganizationCommandInput,
  ): Result<SwitchCurrentOrganizationCommand> {
    return parseOperationInput(switchCurrentOrganizationCommandInputSchema, input).map(
      (parsed) =>
        new SwitchCurrentOrganizationCommand(
          parsed.organizationId,
          trimToUndefined(parsed.idempotencyKey),
        ),
    );
  }
}
