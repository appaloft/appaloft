import { type Result } from "@appaloft/core";

import { Query } from "../../cqrs";
import { type AccountProfileSummary } from "../../ports";
import { emptyOperationInputSchema, parseOperationInput } from "../shared-schema";

export type ShowAccountProfileQueryInput = Record<string, never>;

export class ShowAccountProfileQuery extends Query<AccountProfileSummary> {
  static create(input: ShowAccountProfileQueryInput): Result<ShowAccountProfileQuery> {
    return parseOperationInput(emptyOperationInputSchema, input).map(
      () => new ShowAccountProfileQuery(),
    );
  }
}

export const showAccountProfileQueryInputSchema = emptyOperationInputSchema;
export type ShowAccountProfileQueryResult = Result<AccountProfileSummary>;
