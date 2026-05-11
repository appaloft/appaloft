import { type Result } from "@appaloft/core";

import { Query } from "../../cqrs";
import { type CurrentOrganizationContext } from "../../ports";
import { emptyOperationInputSchema, parseOperationInput } from "../shared-schema";

export type GetCurrentOrganizationContextQueryInput = Record<string, never>;

export class GetCurrentOrganizationContextQuery extends Query<CurrentOrganizationContext> {
  static create(input: GetCurrentOrganizationContextQueryInput) {
    return parseOperationInput(emptyOperationInputSchema, input).map(
      () => new GetCurrentOrganizationContextQuery(),
    );
  }
}

export const getCurrentOrganizationContextQueryInputSchema = emptyOperationInputSchema;

export type GetCurrentOrganizationContextQueryResult = Result<CurrentOrganizationContext>;
