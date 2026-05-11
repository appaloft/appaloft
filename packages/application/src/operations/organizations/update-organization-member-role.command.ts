import { type Result } from "@appaloft/core";
import { z } from "zod";

import { Command } from "../../cqrs";
import { type OrganizationMemberSummary } from "../../ports";
import { nonEmptyTrimmedString, parseOperationInput, trimToUndefined } from "../shared-schema";
import {
  organizationIdSchema,
  organizationMemberIdSchema,
  organizationTeamRoleSchema,
} from "./organization-team.schema";

export const updateOrganizationMemberRoleCommandInputSchema = z.object({
  organizationId: organizationIdSchema,
  memberId: organizationMemberIdSchema,
  role: organizationTeamRoleSchema,
  idempotencyKey: nonEmptyTrimmedString("idempotencyKey").optional(),
});

export type UpdateOrganizationMemberRoleCommandInput = z.input<
  typeof updateOrganizationMemberRoleCommandInputSchema
>;

export class UpdateOrganizationMemberRoleCommand extends Command<OrganizationMemberSummary> {
  constructor(
    public readonly organizationId: string,
    public readonly memberId: string,
    public readonly role: typeof organizationTeamRoleSchema._output,
    public readonly idempotencyKey?: string,
  ) {
    super();
  }

  static create(
    input: UpdateOrganizationMemberRoleCommandInput,
  ): Result<UpdateOrganizationMemberRoleCommand> {
    return parseOperationInput(updateOrganizationMemberRoleCommandInputSchema, input).map(
      (parsed) =>
        new UpdateOrganizationMemberRoleCommand(
          parsed.organizationId,
          parsed.memberId,
          parsed.role,
          trimToUndefined(parsed.idempotencyKey),
        ),
    );
  }
}
