import { type Result } from "@appaloft/core";
import { z } from "zod";

import { Command } from "../../cqrs";
import { type OrganizationMemberSummary } from "../../ports";
import { nonEmptyTrimmedString, parseOperationInput, trimToUndefined } from "../shared-schema";
import { organizationIdSchema, organizationMemberIdSchema } from "./organization-team.schema";

export type ReactivateOrganizationMemberResult = OrganizationMemberSummary;

export const reactivateOrganizationMemberCommandInputSchema = z.object({
  organizationId: organizationIdSchema,
  memberId: organizationMemberIdSchema,
  idempotencyKey: nonEmptyTrimmedString("idempotencyKey").optional(),
});

export type ReactivateOrganizationMemberCommandInput = z.input<
  typeof reactivateOrganizationMemberCommandInputSchema
>;

export class ReactivateOrganizationMemberCommand extends Command<ReactivateOrganizationMemberResult> {
  constructor(
    public readonly organizationId: string,
    public readonly memberId: string,
    public readonly idempotencyKey?: string,
  ) {
    super();
  }

  static create(
    input: ReactivateOrganizationMemberCommandInput,
  ): Result<ReactivateOrganizationMemberCommand> {
    return parseOperationInput(reactivateOrganizationMemberCommandInputSchema, input).map(
      (parsed) =>
        new ReactivateOrganizationMemberCommand(
          parsed.organizationId,
          parsed.memberId,
          trimToUndefined(parsed.idempotencyKey),
        ),
    );
  }
}
