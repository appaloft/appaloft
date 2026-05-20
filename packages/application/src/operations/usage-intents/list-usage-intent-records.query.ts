import { type Result } from "@appaloft/core";

import { Query } from "../../cqrs";
import { type UsageIntentRecord } from "../../ports";
import { parseOperationInput } from "../shared-schema";
import {
  type ListUsageIntentRecordsQueryInput,
  listUsageIntentRecordsInputSchema,
} from "./usage-intent.schema";

export type ListUsageIntentRecordsResponse = { records: UsageIntentRecord[] };

export class ListUsageIntentRecordsQuery extends Query<ListUsageIntentRecordsResponse> {
  constructor(readonly input: ListUsageIntentRecordsQueryInput) {
    super();
  }

  static create(input: ListUsageIntentRecordsQueryInput = {}): Result<ListUsageIntentRecordsQuery> {
    return parseOperationInput(listUsageIntentRecordsInputSchema, input).map(
      (parsed) => new ListUsageIntentRecordsQuery(parsed),
    );
  }
}

export {
  type ListUsageIntentRecordsQueryInput,
  listUsageIntentRecordsInputSchema,
} from "./usage-intent.schema";
