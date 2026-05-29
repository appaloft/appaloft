import { type Result } from "@appaloft/core";
import { z } from "zod";

import { Query } from "../../cqrs";
import { type OrganizationProfileSummary } from "../../ports";
import { parseOperationInput } from "../shared-schema";
import { organizationIdSchema } from "./organization-team.schema";

export const showOrganizationProfileQueryInputSchema = z.object({
  organizationId: organizationIdSchema,
});

export type ShowOrganizationProfileQueryInput = z.input<
  typeof showOrganizationProfileQueryInputSchema
>;

export class ShowOrganizationProfileQuery extends Query<OrganizationProfileSummary> {
  constructor(public readonly organizationId: string) {
    super();
  }

  static create(input: ShowOrganizationProfileQueryInput): Result<ShowOrganizationProfileQuery> {
    return parseOperationInput(showOrganizationProfileQueryInputSchema, input).map(
      (parsed) => new ShowOrganizationProfileQuery(parsed.organizationId),
    );
  }
}
