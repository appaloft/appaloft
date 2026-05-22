import { type Result } from "@appaloft/core";
import { z } from "zod";

import { Query } from "../../cqrs";
import { type ServerSummary } from "../../ports";
import { boundedListLimit, listLimitSchema, parseOperationInput } from "../shared-schema";

export const listServersQueryInputSchema = z.object({
  limit: listLimitSchema,
});

export type ListServersQueryInput = z.input<typeof listServersQueryInputSchema>;

export class ListServersQuery extends Query<{ items: ServerSummary[] }> {
  constructor(public readonly limit: number) {
    super();
  }

  static create(input?: ListServersQueryInput): Result<ListServersQuery> {
    return parseOperationInput(listServersQueryInputSchema, input ?? {}).map(
      (parsed) => new ListServersQuery(boundedListLimit(parsed.limit)),
    );
  }
}
