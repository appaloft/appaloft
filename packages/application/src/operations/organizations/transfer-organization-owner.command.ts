import { type Result } from "@appaloft/core";
import { z } from "zod";

import { Command } from "../../cqrs";
import { type OrganizationMemberSummary } from "../../ports";
import { nonEmptyTrimmedString, parseOperationInput, trimToUndefined } from "../shared-schema";
import { organizationIdSchema, organizationMemberIdSchema } from "./organization-team.schema";

export interface TransferOrganizationOwnerResult {
  fromMember: OrganizationMemberSummary;
  toMember: OrganizationMemberSummary;
  transferredAt: string;
}

export const transferOrganizationOwnerCommandInputSchema = z.object({
  organizationId: organizationIdSchema,
  fromMemberId: organizationMemberIdSchema,
  toMemberId: organizationMemberIdSchema,
  idempotencyKey: nonEmptyTrimmedString("idempotencyKey").optional(),
});

export type TransferOrganizationOwnerCommandInput = z.input<
  typeof transferOrganizationOwnerCommandInputSchema
>;

export class TransferOrganizationOwnerCommand extends Command<TransferOrganizationOwnerResult> {
  constructor(
    public readonly organizationId: string,
    public readonly fromMemberId: string,
    public readonly toMemberId: string,
    public readonly idempotencyKey?: string,
  ) {
    super();
  }

  static create(
    input: TransferOrganizationOwnerCommandInput,
  ): Result<TransferOrganizationOwnerCommand> {
    return parseOperationInput(transferOrganizationOwnerCommandInputSchema, input).map(
      (parsed) =>
        new TransferOrganizationOwnerCommand(
          parsed.organizationId,
          parsed.fromMemberId,
          parsed.toMemberId,
          trimToUndefined(parsed.idempotencyKey),
        ),
    );
  }
}
