import { type Result } from "@appaloft/core";
import { z } from "zod";

import { Command } from "../../cqrs";
import { type OrganizationInvitationSummary } from "../../ports";
import { nonEmptyTrimmedString, parseOperationInput, trimToUndefined } from "../shared-schema";
import { organizationIdSchema, organizationTeamRoleSchema } from "./organization-team.schema";

export const inviteOrganizationMemberCommandInputSchema = z.object({
  organizationId: organizationIdSchema,
  email: z.string().trim().email(),
  role: organizationTeamRoleSchema,
  idempotencyKey: nonEmptyTrimmedString("idempotencyKey").optional(),
});

export type InviteOrganizationMemberCommandInput = z.input<
  typeof inviteOrganizationMemberCommandInputSchema
>;

export class InviteOrganizationMemberCommand extends Command<OrganizationInvitationSummary> {
  constructor(
    public readonly organizationId: string,
    public readonly email: string,
    public readonly role: typeof organizationTeamRoleSchema._output,
    public readonly idempotencyKey?: string,
  ) {
    super();
  }

  static create(
    input: InviteOrganizationMemberCommandInput,
  ): Result<InviteOrganizationMemberCommand> {
    return parseOperationInput(inviteOrganizationMemberCommandInputSchema, input).map(
      (parsed) =>
        new InviteOrganizationMemberCommand(
          parsed.organizationId,
          parsed.email,
          parsed.role,
          trimToUndefined(parsed.idempotencyKey),
        ),
    );
  }
}
