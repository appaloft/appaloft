import { type Result } from "@appaloft/core";
import { z } from "zod";

import { Query } from "../../cqrs";
import { type OrganizationInvitationSummary } from "../../ports";
import { parseOperationInput } from "../shared-schema";
import {
  optionalCursorSchema,
  optionalLimitSchema,
  organizationIdSchema,
  organizationInvitationStatusSchema,
} from "./organization-team.schema";

export const listOrganizationInvitationsQueryInputSchema = z.object({
  organizationId: organizationIdSchema,
  status: organizationInvitationStatusSchema.optional(),
  cursor: optionalCursorSchema,
  limit: optionalLimitSchema,
});

export type ListOrganizationInvitationsQueryInput = z.input<
  typeof listOrganizationInvitationsQueryInputSchema
>;

export interface ListOrganizationInvitationsQueryResult {
  items: OrganizationInvitationSummary[];
  nextCursor?: string;
}

export class ListOrganizationInvitationsQuery extends Query<ListOrganizationInvitationsQueryResult> {
  constructor(
    public readonly organizationId: string,
    public readonly status?: "accepted" | "expired" | "pending" | "revoked",
    public readonly cursor?: string,
    public readonly limit?: number,
  ) {
    super();
  }

  static create(
    input: ListOrganizationInvitationsQueryInput,
  ): Result<ListOrganizationInvitationsQuery> {
    return parseOperationInput(listOrganizationInvitationsQueryInputSchema, input).map(
      (parsed) =>
        new ListOrganizationInvitationsQuery(
          parsed.organizationId,
          parsed.status,
          parsed.cursor,
          parsed.limit,
        ),
    );
  }
}
