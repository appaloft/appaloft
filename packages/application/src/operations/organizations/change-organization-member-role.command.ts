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

export const changeOrganizationMemberRoleCommandInputSchema = z.object({
  organizationId: organizationIdSchema,
  memberId: organizationMemberIdSchema,
  role: organizationTeamRoleSchema,
  idempotencyKey: nonEmptyTrimmedString("idempotencyKey").optional(),
});

export type ChangeOrganizationMemberRoleCommandInput = z.input<
  typeof changeOrganizationMemberRoleCommandInputSchema
>;

export class ChangeOrganizationMemberRoleCommand extends Command<OrganizationMemberSummary> {
  constructor(
    public readonly organizationId: string,
    public readonly memberId: string,
    public readonly role: typeof organizationTeamRoleSchema._output,
    public readonly idempotencyKey?: string,
  ) {
    super();
  }

  static create(
    input: ChangeOrganizationMemberRoleCommandInput,
  ): Result<ChangeOrganizationMemberRoleCommand> {
    return parseOperationInput(changeOrganizationMemberRoleCommandInputSchema, input).map(
      (parsed) =>
        new ChangeOrganizationMemberRoleCommand(
          parsed.organizationId,
          parsed.memberId,
          parsed.role,
          trimToUndefined(parsed.idempotencyKey),
        ),
    );
  }
}
