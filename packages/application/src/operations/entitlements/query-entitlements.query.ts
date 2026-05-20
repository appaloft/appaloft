import { ok, type Result } from "@appaloft/core";
import { type z } from "zod";

import { Query } from "../../cqrs";
import { type EntitlementDecision } from "../../ports";
import { type queryEntitlementsInputSchema } from "./query-entitlements.schema";

export type QueryEntitlementsInput = z.input<typeof queryEntitlementsInputSchema>;
export type QueryEntitlementsResponse = { entitlements: EntitlementDecision[] };

export class QueryEntitlementsQuery extends Query<QueryEntitlementsResponse> {
  constructor(readonly input: QueryEntitlementsInput) {
    super();
  }

  static create(input: QueryEntitlementsInput): Result<QueryEntitlementsQuery> {
    return ok(new QueryEntitlementsQuery(input));
  }
}
