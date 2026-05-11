import { type Result } from "@appaloft/core";
import { z } from "zod";

import { Command } from "../../cqrs";
import { nonEmptyTrimmedString, parseOperationInput, trimToUndefined } from "../shared-schema";
import { organizationIdSchema, organizationMemberIdSchema } from "./organization-team.schema";

export interface RemoveOrganizationMemberResult {
  memberId: string;
  organizationId: string;
  removedAt: string;
}

export const removeOrganizationMemberCommandInputSchema = z.object({
  organizationId: organizationIdSchema,
  memberId: organizationMemberIdSchema,
  idempotencyKey: nonEmptyTrimmedString("idempotencyKey").optional(),
});

export type RemoveOrganizationMemberCommandInput = z.input<
  typeof removeOrganizationMemberCommandInputSchema
>;

export class RemoveOrganizationMemberCommand extends Command<RemoveOrganizationMemberResult> {
  constructor(
    public readonly organizationId: string,
    public readonly memberId: string,
    public readonly idempotencyKey?: string,
  ) {
    super();
  }

  static create(
    input: RemoveOrganizationMemberCommandInput,
  ): Result<RemoveOrganizationMemberCommand> {
    return parseOperationInput(removeOrganizationMemberCommandInputSchema, input).map(
      (parsed) =>
        new RemoveOrganizationMemberCommand(
          parsed.organizationId,
          parsed.memberId,
          trimToUndefined(parsed.idempotencyKey),
        ),
    );
  }
}
