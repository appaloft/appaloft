import { ok, type Result } from "@appaloft/core";
import { type z } from "zod";

import { Query } from "../../cqrs";
import { type OperationCapabilityResult } from "../../ports";
import { type queryCapabilitiesInputSchema } from "./query-capabilities.schema";

export type QueryCapabilitiesInput = z.input<typeof queryCapabilitiesInputSchema>;
export type QueryCapabilitiesResponse = { capabilities: OperationCapabilityResult[] };

export class QueryCapabilitiesQuery extends Query<QueryCapabilitiesResponse> {
  constructor(readonly input: QueryCapabilitiesInput) {
    super();
  }

  static create(input: QueryCapabilitiesInput): Result<QueryCapabilitiesQuery> {
    return ok(new QueryCapabilitiesQuery(input));
  }
}
