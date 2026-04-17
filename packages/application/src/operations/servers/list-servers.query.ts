import { ok, type Result } from "@appaloft/core";
import { type z } from "zod";

import { Query } from "../../cqrs";
import { type ServerSummary } from "../../ports";
import { emptyOperationInputSchema } from "../shared-schema";

export const listServersQueryInputSchema = emptyOperationInputSchema;

export type ListServersQueryInput = z.input<typeof listServersQueryInputSchema>;

export class ListServersQuery extends Query<{ items: ServerSummary[] }> {
  static create(): Result<ListServersQuery> {
    return ok(new ListServersQuery());
  }
}
