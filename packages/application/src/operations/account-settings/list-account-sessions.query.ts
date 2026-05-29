import { type Result } from "@appaloft/core";

import { Query } from "../../cqrs";
import { type AccountSessionSummary } from "../../ports";
import { emptyOperationInputSchema, parseOperationInput } from "../shared-schema";

export type ListAccountSessionsQueryInput = Record<string, never>;

export class ListAccountSessionsQuery extends Query<{
  items: AccountSessionSummary[];
  nextCursor?: string;
}> {
  static create(input: ListAccountSessionsQueryInput): Result<ListAccountSessionsQuery> {
    return parseOperationInput(emptyOperationInputSchema, input).map(
      () => new ListAccountSessionsQuery(),
    );
  }
}

export const listAccountSessionsQueryInputSchema = emptyOperationInputSchema;
