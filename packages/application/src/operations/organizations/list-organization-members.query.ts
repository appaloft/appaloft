import { type Result } from "@appaloft/core";
import { z } from "zod";

import { Query } from "../../cqrs";
import { type OrganizationMemberSummary } from "../../ports";
import { parseOperationInput } from "../shared-schema";
import {
  optionalCursorSchema,
  optionalLimitSchema,
  organizationIdSchema,
} from "./organization-team.schema";

export const listOrganizationMembersQueryInputSchema = z.object({
  organizationId: organizationIdSchema,
  cursor: optionalCursorSchema,
  limit: optionalLimitSchema,
});

export type ListOrganizationMembersQueryInput = z.input<
  typeof listOrganizationMembersQueryInputSchema
>;

export interface ListOrganizationMembersQueryResult {
  items: OrganizationMemberSummary[];
  nextCursor?: string;
}

export class ListOrganizationMembersQuery extends Query<ListOrganizationMembersQueryResult> {
  constructor(
    public readonly organizationId: string,
    public readonly cursor?: string,
    public readonly limit?: number,
  ) {
    super();
  }

  static create(input: ListOrganizationMembersQueryInput): Result<ListOrganizationMembersQuery> {
    return parseOperationInput(listOrganizationMembersQueryInputSchema, input).map(
      (parsed) =>
        new ListOrganizationMembersQuery(parsed.organizationId, parsed.cursor, parsed.limit),
    );
  }
}
